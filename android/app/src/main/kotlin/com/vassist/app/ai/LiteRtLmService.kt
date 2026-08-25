package com.vassist.app.ai

import android.content.Context
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Message
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors

/**
 * LiteRtLmService - Cross-vendor accelerated LLM runtime for .litertlm models.
 *
 * Uses Google's LiteRT-LM Kotlin API (same pattern as Google AI Edge Gallery).
 * Supports GPU acceleration on Snapdragon (OpenCL), MediaTek/Exynos (Vulkan),
 * and vendor NPUs.
 *
 * Multimodal handling follows Google AI Edge Gallery's approach: visionBackend
 * and audioBackend are conditionally set based on what the model supports.
 * We probe on the first request to discover capabilities, then cache.
 *
 * LocalAIServer routes chat requests here when the selected model file is a
 * .litertlm; GGUF models keep going through [LlamaService].
 */
class LiteRtLmService(private val context: Context) {

    companion object {
        private const val TAG = "LiteRtLmService"

        private val engineDispatcher: CoroutineDispatcher =
            Executors.newSingleThreadExecutor { r ->
                Thread(r, "LiteRtLmThread").apply { priority = Thread.NORM_PRIORITY }
            }.asCoroutineDispatcher()

        /** Per-model-path capability cache (persisted across service instances) */
        private val modelCapabilities = mutableMapOf<String, ModelCaps>()

        /**
         * Which encoder backends to enable for a given model.
         * [visionBackend] and [audioBackend] are null when the model lacks
         * that modality — passing null tells the runtime to skip loading
         * that executor entirely (matches Google AI Edge Gallery pattern).
         */
        data class ModelCaps(
            val visionBackend: Backend?,
            val audioBackend: Backend?
        )
    }

    private var engine: Engine? = null
    private var activeConversation: Conversation? = null
    private var currentModelPath: String? = null

    var isInitialized = false
        private set

    var modelName: String = "unknown"
        private set

    var activeBackend: String = "cpu"
        private set

    suspend fun initialize(modelPath: String, device: String = "auto") {
        withContext(engineDispatcher) {
            // Clear cached caps from previous models — each model probes
            // independently so one model's failure doesn't poison another
            if (currentModelPath != modelPath) {
                modelCapabilities.clear()
            }
            releaseInternal()
            currentModelPath = modelPath

            val backend = resolveBackend(device)
            Log.i(TAG, "[LLM-backend] initializing LiteRT-LM model=$modelPath backend=${describeBackend(backend)}")

            // Check cached capabilities from previous runs
            val caps = modelCapabilities[modelPath]
            val visionBe: Backend?
            val audioBe: Backend?

            if (caps != null) {
                // Known model — use cached config directly
                visionBe = caps.visionBackend
                audioBe = caps.audioBackend
                Log.i(TAG, "[LLM-backend] cached caps: vision=${visionBe?.let { describeBackend(it) }}, audio=${audioBe?.let { describeBackend(it) }}")
            } else {
                // New model — assume full multimodal, will be corrected by
                // the fallback logic in chatCompletion() if unsupported
                visionBe = backend
                audioBe = Backend.CPU() // full multimodal probe; falls back on failure
                Log.i(TAG, "[LLM-backend] new model - probing with vision=$backend, audio=null")
            }

            initializeEngine(modelPath, backend, visionBe, audioBe)

            modelName = java.io.File(modelPath).name
            isInitialized = true
            Log.i(TAG, "[LLM-backend] LiteRT-LM ready model=$modelName backend=$activeBackend")
        }
    }

    /**
     * Create engine with explicit modality backends.
     * Null = skip loading that executor entirely.
     */
    private fun initializeEngine(
        modelPath: String,
        mainBackend: Backend,
        visionBackend: Backend?,
        audioBackend: Backend?
    ) {
        val config = EngineConfig(
            modelPath = modelPath,
            backend = mainBackend,
            visionBackend = visionBackend,
            audioBackend = audioBackend,
            maxNumImages = 4,
            cacheDir = context.cacheDir.absolutePath
        )
        releaseInternal()
        engine = Engine(config).also { it.initialize() }
        activeBackend = describeBackend(mainBackend)
    }

    fun chatCompletion(
        messages: List<LlamaService.ChatMessage>,
        maxTokens: Int = 2048,
        images: List<ByteArray>? = null,
        audios: List<Pair<ByteArray, String>>? = null,
        enableThinking: Boolean = false
    ): Flow<String> = flow {
        val e = engine ?: throw IllegalStateException("LiteRT-LM not initialized")

        val systemText = messages.firstOrNull { it.role.equals("system", ignoreCase = true) }?.content ?: ""
        val turns = messages.filterNot { it.role.equals("system", ignoreCase = true) }
        val lastTurn = turns.lastOrNull()
        val history = turns.dropLast(1)

        val config = ConversationConfig(
            systemInstruction = Contents.of(systemText),
            initialMessages = history.mapNotNull { msg ->
                when {
                    msg.role.equals("user", ignoreCase = true) -> Message.Companion.user(msg.content)
                    msg.role.equals("assistant", ignoreCase = true) -> Message.Companion.model(msg.content)
                    else -> null
                }
            }
        )

        // Build content parts
        val promptText = lastTurn?.content?.takeIf { it.isNotBlank() } ?: "Describe what you see."
        val parts = mutableListOf<com.google.ai.edge.litertlm.Content>()
        parts.add(com.google.ai.edge.litertlm.Content.Text(promptText))
        images.orEmpty().forEach { bytes ->
            if (bytes.isNotEmpty()) {
                parts.add(com.google.ai.edge.litertlm.Content.ImageBytes(bytes))
            }
        }
        audios.orEmpty().forEach { (bytes, _) ->
            if (bytes.isNotEmpty()) {
                val wav = AudioConverter.decodeToWav16kMono(bytes, context.cacheDir) ?: bytes
                parts.add(com.google.ai.edge.litertlm.Content.AudioBytes(wav))
            }
        }

        activeConversation?.close()

        // Try creating conversation; on modality mismatch, rebuild engine
        // with reduced capabilities and retry once.
        var conversation: Conversation
        try {
            conversation = e.createConversation(config)
            activeConversation = conversation
        } catch (first: Exception) {
            val errMsg = first.message ?: ""
            val modelPath = currentModelPath ?: throw first
            Log.w(TAG, "[LLM-backend] createConversation failed: ${errMsg.take(120)}")

            // Strip ONLY the failing modality, keep the rest.
            // Read current caps to know what was enabled before failure.
            val prevCaps = modelCapabilities[modelPath]
            val newVision: Backend?
            val newAudio: Backend?
            if (errMsg.contains("AUDIO_ENCODER", ignoreCase = true) ||
                errMsg.contains("Audio executor", ignoreCase = true)) {
                // Model lacks audio encoder — drop audio only, keep vision
                newVision = Backend.CPU()
                newAudio = null
                Log.i(TAG, "[LLM-backend] no audio encoder — retrying with vision-only (CPU)")
            } else {
                // Vision or unknown failure — fall back to text-only
                newVision = null
                newAudio = null
                Log.i(TAG, "[LLM-backend] multimodal encoder failed — falling back to text-only")
            }
            // Don't downgrade further than what already worked before
            if (prevCaps != null &&
                prevCaps.visionBackend == null && prevCaps.audioBackend == null) {
                Log.w(TAG, "[LLM-backend] already at minimum config — cannot degrade further")
                throw first
            }

            initializeEngine(modelPath, resolveActiveBackend(), newVision, newAudio)
            modelCapabilities[modelPath] = ModelCaps(newVision, newAudio)
            conversation = engine!!.createConversation(config)
            activeConversation = conversation
        }

        // Send message with all content parts
        val contentsToSend = Contents.of(*parts.toTypedArray())
        conversation.sendMessageAsync(contentsToSend).collect { message ->
            val text = message.contents.contents
                .filterIsInstance<com.google.ai.edge.litertlm.Content.Text>()
                .joinToString("") { it.text }
            if (text.isNotEmpty()) emit(text)
        }
    }.flowOn(engineDispatcher)

    suspend fun chatCompletionSync(
        messages: List<LlamaService.ChatMessage>,
        maxTokens: Int = 2048,
        images: List<ByteArray>? = null,
        audios: List<Pair<ByteArray, String>>? = null,
        enableThinking: Boolean = false
    ): String {
        val sb = StringBuilder()
        chatCompletion(messages, maxTokens, images, audios, enableThinking).collect { sb.append(it) }
        return sb.toString()
    }

    suspend fun stopGeneration() {
        withContext(engineDispatcher) {
            try {
                activeConversation?.cancelProcess()
            } catch (_: Exception) {}
        }
    }

    suspend fun release() {
        withContext(engineDispatcher) { releaseInternal() }
    }

    private fun releaseInternal() {
        try { activeConversation?.close() } catch (_: Exception) {}
        activeConversation = null
        try { engine?.close() } catch (_: Exception) {}
        engine = null
        isInitialized = false
    }

    private fun resolveActiveBackend(): Backend = when (activeBackend) {
        "npu" -> Backend.NPU(nativeLibraryDir = context.applicationInfo.nativeLibraryDir)
        "gpu" -> Backend.GPU()
        else -> Backend.CPU()
    }

    private fun describeBackend(backend: Backend): String = when (backend) {
        is Backend.NPU -> "npu"
        is Backend.GPU -> "gpu"
        else -> "cpu"
    }

    private fun resolveBackend(device: String): Backend = when (device.lowercase()) {
        "npu" -> Backend.NPU(nativeLibraryDir = context.applicationInfo.nativeLibraryDir)
        "gpu", "auto" -> Backend.GPU()
        else -> Backend.CPU()
    }
}
