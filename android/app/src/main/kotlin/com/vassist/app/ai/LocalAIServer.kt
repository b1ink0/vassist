package com.vassist.app.ai

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.GsonBuilder
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.BufferedWriter
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.io.OutputStreamWriter
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.lang.reflect.Type
import java.util.Base64
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * LocalAIServer - OpenAI-compatible HTTP API server for on-device AI
 * 
 * Provides local endpoints:
 * - POST /v1/audio/transcriptions - Speech-to-Text via Whisper
 * - POST /v1/audio/speech - Text-to-Speech via VITS
 * - GET /v1/models - List available models
 * - GET /health - Server health check
 */
class LocalAIServer(
    private val context: Context,
    port: Int = 8765
) : NanoHTTPD(port) {

    companion object {
        private const val TAG = "LocalAIServer"
        
        // Default server port
        const val DEFAULT_PORT = 8765
        
        // Singleton instance
        @Volatile
        private var instance: LocalAIServer? = null
        
        fun getInstance(context: Context, port: Int = DEFAULT_PORT): LocalAIServer {
            return instance ?: synchronized(this) {
                instance ?: LocalAIServer(context.applicationContext, port).also { instance = it }
            }
        }
        
        // Use localhost for the actual HTTP server
        // Mixed content is allowed in WebView settings
        fun getBaseUrl(port: Int = DEFAULT_PORT): String = "http://127.0.0.1:$port"
    }

    private val gson = GsonBuilder()
        .registerTypeAdapter(MessageContent::class.java, MessageContentDeserializer())
        .create()
    
    // Use a single-threaded dispatcher for native AI operations to avoid threading issues
    @OptIn(DelicateCoroutinesApi::class)
    private val aiDispatcher = newSingleThreadContext("AI-Thread")
    private val scope = CoroutineScope(aiDispatcher + SupervisorJob())
    
    // AI Services - initialized lazily on first use
    @Volatile
    private var whisperService: WhisperService? = null
    @Volatile
    private var vitsService: VitsService? = null
    @Volatile
    private var llamaService: LlamaService? = null
    private val llmModelManager by lazy { LLMModelManager(context) }
    private val ttsModelManager by lazy { TtsModelManager(context) }

    // Pack id of the currently loaded vitsService (null = legacy vits-vctk)
    @Volatile
    private var loadedTtsPackId: String? = null

    // Coroutine mutexes for initialization (non-blocking)
    private val whisperMutex = Mutex()
    private val vitsMutex = Mutex()
    private val llamaMutex = Mutex()

    // Server state
    var isInitialized = false
        private set
    
    // Track currently loaded LLM model path
    private var currentModelPath: String? = null
    
    /**
     * Custom Response that properly flushes chunked data for SSE streaming.
     * NanoHTTPD's default ChunkedOutputStream doesn't flush, causing buffering.
     */
    private class FlushingChunkedResponse(
        status: Status,
        mimeType: String,
        data: InputStream
    ) : Response(status, mimeType, data, -1) {
        
        override fun send(outputStream: OutputStream) {
            // Send headers normally
            val pw = java.io.PrintWriter(java.io.BufferedWriter(java.io.OutputStreamWriter(outputStream, "UTF-8")), false)
            pw.append("HTTP/1.1 ").append(this.status.description).append(" \r\n")
            
            if (this.mimeType != null) {
                pw.append("Content-Type: ").append(this.mimeType).append("\r\n")
            }
            
            // CORS headers - CRITICAL for browser clients
            pw.append("Access-Control-Allow-Origin: *\r\n")
            pw.append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n")
            pw.append("Access-Control-Allow-Headers: Content-Type\r\n")
            
            // SSE headers
            pw.append("Cache-Control: no-cache\r\n")
            pw.append("Connection: keep-alive\r\n")
            pw.append("Transfer-Encoding: chunked\r\n")
            pw.append("\r\n")
            pw.flush()
            
            // Stream chunked data with immediate flushing
            try {
                val buff = ByteArray(4096) // Smaller buffer for faster streaming
                var read: Int
                
                while (this.data.read(buff).also { read = it } > 0) {
                    // Write chunk size in hex
                    outputStream.write(String.format("%x\r\n", read).toByteArray())
                    // Write chunk data
                    outputStream.write(buff, 0, read)
                    // Write chunk terminator
                    outputStream.write("\r\n".toByteArray())
                    // CRITICAL: Flush immediately to send data to client
                    outputStream.flush()
                }
                
                // Send final chunk
                outputStream.write("0\r\n\r\n".toByteArray())
                outputStream.flush()
                
            } catch (e: Exception) {
                Log.e(TAG, "Error streaming response", e)
            } finally {
                this.data.close()
            }
        }
    }
    
    /**
     * Get or initialize Whisper service (thread-safe, non-blocking)
     */
    private suspend fun getWhisperService(): WhisperService {
        whisperService?.let { if (it.isInitialized) return it }
        
        return whisperMutex.withLock {
            // Double-check after acquiring lock
            whisperService?.let { if (it.isInitialized) return it }
            
            withContext(aiDispatcher) {
                Log.i(TAG, "Lazy-loading Whisper service on dedicated thread...")
                val service = WhisperService(context)
                service.initialize()
                whisperService = service
                if (!service.isInitialized) {
                    Log.w(TAG, "Whisper service failed to initialize - models may not be downloaded")
                } else {
                    Log.i(TAG, "Whisper service initialized successfully")
                }
                service
            }
        }
    }
    
    /**
     * Get or initialize VITS service (thread-safe, non-blocking)
     */
    private suspend fun getVitsService(): VitsService = getVitsService(null)

    /**
     * Get or initialize the VITS service for a specific TTS pack.
     *
     * @param pack Resolved pack, or null for the legacy vits-vctk behaviour.
     *             If a different pack is currently loaded it is released and
     *             swapped (only one TTS engine is kept in memory).
     */
    private suspend fun getVitsService(pack: TtsPack?): VitsService {
        // Null hint and the registered legacy pack share one cache entry
        val requestedPackId = pack?.id ?: TtsModelManager.LEGACY_VCTK_ID
        vitsService?.let { svc ->
            if (svc.isInitialized && loadedTtsPackId == requestedPackId) return svc
        }

        return vitsMutex.withLock {
            // Double-check after acquiring lock
            vitsService?.let { svc ->
                if (svc.isInitialized && loadedTtsPackId == requestedPackId) return svc
            }

            withContext(aiDispatcher) {
                Log.i(TAG, "Lazy-loading TTS service (pack=${pack?.id ?: "vits-vctk"})...")
                // Release the previously loaded pack's engine first
                vitsService?.releaseBlocking()
                val service = VitsService(context, pack)
                service.initialize()
                vitsService = service
                loadedTtsPackId = requestedPackId
                if (!service.isInitialized) {
                    Log.w(TAG, "TTS service failed to initialize - models may not be downloaded")
                } else {
                    Log.i(TAG, "TTS service initialized successfully (pack=${pack?.id ?: "vits-vctk"})")
                }
                service
            }
        }
    }
    
    /**
     * Get or initialize Llama service (thread-safe, non-blocking)
     */
    private suspend fun getLlamaService(): LlamaService {
        llamaService?.let { if (it.isInitialized) return it }
        
        return llamaMutex.withLock {
            // Double-check after acquiring lock
            llamaService?.let { if (it.isInitialized) return it }
            
            withContext(aiDispatcher) {
                Log.i(TAG, "Lazy-loading Llama service on dedicated thread...")
                val service = LlamaService(context)
                val modelPath = service.initialize()
                llamaService = service
                currentModelPath = modelPath
                Log.i(TAG, "Llama service initialized with model: $modelPath")
                service
            }
        }
    }

    /**
     * Initialize server (models are lazy-loaded on first request)
     */
    suspend fun initialize(
        onProgress: ((String, Float) -> Unit)? = null
    ) {
        withContext(Dispatchers.IO) {
            try {
                Log.i(TAG, "Initializing AI server (models will be lazy-loaded)...")
                
                onProgress?.invoke("Server ready!", 1.0f)
                isInitialized = true
                Log.i(TAG, "AI server initialized - models will load on first request")
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize AI server", e)
                throw e
            }
        }
    }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method
        
        Log.d(TAG, "Request: $method $uri")
        
        // Add CORS headers for WebView
        // Allow all headers since OpenAI SDK adds custom headers like x-stainless-os, x-stainless-lang, etc.
        val corsHeaders = mutableMapOf(
            "Access-Control-Allow-Origin" to "*",
            "Access-Control-Allow-Methods" to "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers" to "*"
        )
        
        // Handle preflight
        if (method == Method.OPTIONS) {
            return newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, "").apply {
                corsHeaders.forEach { (k, v) -> addHeader(k, v) }
            }
        }
        
        val response = try {
            when {
                // Health check
                uri == "/health" && method == Method.GET -> handleHealth()
                
                // List models
                uri == "/v1/models" && method == Method.GET -> handleListModels()
                
                // STT - Transcription
                uri == "/v1/audio/transcriptions" && method == Method.POST -> handleTranscription(session)
                
                // TTS - Speech synthesis
                uri == "/v1/audio/speech" && method == Method.POST -> handleSpeech(session)
                
                // LLM - Chat completion
                uri == "/v1/chat/completions" && method == Method.POST -> handleChatCompletion(session)
                
                // Stop/abort generation - called by stop button
                uri == "/v1/generation/stop" && method == Method.POST -> handleStopGeneration()
                uri == "/v1/chat/completions" && method == Method.DELETE -> handleStopGeneration()
                
                // Model status
                uri == "/v1/models/status" && method == Method.GET -> handleModelStatus()
                
                else -> errorResponse(Response.Status.NOT_FOUND, "Endpoint not found: $uri")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling request: $uri", e)
            errorResponse(Response.Status.INTERNAL_ERROR, e.message ?: "Internal server error")
        }
        
        // Add CORS headers to all responses
        corsHeaders.forEach { (k, v) -> response.addHeader(k, v) }
        return response
    }

    /**
     * GET /health - Server health check
     */
    private fun handleHealth(): Response {
        val status = JsonObject().apply {
            addProperty("status", "ok")
            addProperty("initialized", isInitialized)
            addProperty("whisper_ready", whisperService?.isInitialized == true)
            addProperty("vits_ready", vitsService?.isInitialized == true)
            addProperty("llama_ready", llamaService?.isInitialized == true)
        }
        return jsonResponse(status)
    }

    /**
     * POST /v1/generation/stop or DELETE /v1/chat/completions - Stop generation
     * Sets the native abort flag so the next completion_loop call returns null.
     */
    private fun handleStopGeneration(): Response {
        Log.d(TAG, "Stop generation requested")
        runBlocking(aiDispatcher) {
            llamaService?.stopGeneration()
        }
        return jsonResponse(JsonObject().apply {
            addProperty("stopped", true)
        })
    }

    /**
     * GET /v1/models - List available models (OpenAI-compatible)
     */
    private fun handleListModels(): Response {
        val installedLlmModels = llmModelManager.listModels().mapNotNull { model ->
            (model["name"] as? String)?.takeIf { it.isNotBlank() }?.let { modelName ->
                mapOf(
                    "id" to modelName,
                    "object" to "model",
                    "owned_by" to "local",
                    "permission" to emptyList<String>()
                )
            }
        }.toMutableList()

        val currentModelName = currentModelPath?.let { File(it).name }
        if (currentModelName != null && installedLlmModels.none { it["id"] == currentModelName }) {
            installedLlmModels.add(
                mapOf(
                    "id" to currentModelName,
                    "object" to "model",
                    "owned_by" to "local",
                    "permission" to emptyList<String>(),
                    "supportsVision" to (llamaService?.supportsVision == true),
                    "visionBackendAvailable" to (llamaService?.isVisionBackendAvailable == true)
                )
            )
        }

        val models = JsonObject().apply {
            add("data", gson.toJsonTree(installedLlmModels))
            addProperty("object", "list")
        }
        return jsonResponse(models)
    }

    /**
     * GET /v1/models/status - Get model initialization status
     */
    private fun handleModelStatus(): Response {
        val status = JsonObject().apply {
            add("whisper", JsonObject().apply {
                addProperty("initialized", whisperService?.isInitialized == true)
                addProperty("model", whisperService?.modelName ?: "whisper-tiny.en")
                whisperService?.backendInfo?.let { info ->
                    addProperty("backend", info.provider)
                    addProperty("backend_source", info.source)
                    if (info.cpuMs != null) addProperty("cpu_ms", info.cpuMs)
                    if (info.nnapiMs != null) addProperty("nnapi_ms", info.nnapiMs)
                    if (info.xnnpackMs != null) addProperty("xnnpack_ms", info.xnnpackMs)
                    if (info.detail.isNotBlank()) addProperty("backend_note", info.detail)
                }
            })
            run {
                val qnn = ComputeBackendManager.getQnnCapability()
                add("qnn", JsonObject().apply {
                    addProperty("soc", qnn.socModel)
                    addProperty("manufacturer", qnn.socManufacturer)
                    addProperty("board_platform", qnn.boardPlatform)
                    qnn.htpVersion?.let { addProperty("htp", it) }
                    addProperty("runtime_available", qnn.runtimeAvailable)
                    addProperty("device_capable", qnn.deviceCapable)
                    // Tells you exactly which gate failed so it can be fixed
                    addProperty("reason", qnn.reason)
                    addProperty(
                        "sensevoice_qnn_ready",
                        java.io.File(
                            java.io.File(context.filesDir, "models/sensevoice"),
                            "qnn/model.bin"
                        ).exists()
                    )
                })
            }
            add("vits", JsonObject().apply {
                addProperty("initialized", vitsService?.isInitialized == true)
                addProperty("model", vitsService?.modelName ?: "vits-vctk")
                addProperty(
                    "numSpeakers",
                    vitsService?.getNumSpeakers()
                        ?: (TtsModelManager.TTS_PACKS[TtsModelManager.LEGACY_VCTK_ID]?.knownNumSpeakers ?: 109)
                )
                addProperty("currentSpeaker", vitsService?.getSpeakerId() ?: 0)
                addProperty("activePack", loadedTtsPackId ?: "vits-vctk")
                // Downloadable TTS language packs (additive; web UI reads this)
                add("packs", gson.toJsonTree(ttsModelManager.getPacksStatus()))
            })
            add("llama", JsonObject().apply {
                addProperty("initialized", llamaService?.isInitialized == true)
                addProperty("model", llamaService?.modelName ?: "not loaded")
            })
        }
        return jsonResponse(status)
    }

    /**
     * POST /v1/audio/transcriptions - Speech-to-Text (OpenAI Whisper-compatible)
     * 
     * Request: multipart/form-data with:
     * - file: audio file (required)
     * - model: model hint (optional, e.g. "whisper-tiny" / "auto"; falls back to any downloaded variant)
     * - language: language code (optional)
     * - response_format: "json", "text", "verbose_json" (optional)
     * 
     * Response: { "text": "transcribed text" }
     */
    private fun handleTranscription(session: IHTTPSession): Response {
        // Parse multipart data
        val files = mutableMapOf<String, String>()
        session.parseBody(files)
        
        val audioFile = files["file"]
        if (audioFile == null) {
            return errorResponse(Response.Status.BAD_REQUEST, "Missing 'file' in request")
        }
        
        // Get optional parameters
        val params = session.parms
        val language = params["language"]
        val model = params["model"]
        val provider = params["provider"]
        val responseFormat = params["response_format"] ?: "json"
        
        // Run on dedicated AI thread to avoid mutex conflicts with WebView/HWUI
        return runBlocking(aiDispatcher) {
            try {
                // Lazy-load Whisper on first request
                val whisper = getWhisperService()
                
                val audioData = File(audioFile).readBytes()
                val transcription = whisper.transcribe(audioData, language, model, provider)
                
                when (responseFormat) {
                    "text" -> newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, transcription)
                    "verbose_json" -> jsonResponse(JsonObject().apply {
                        addProperty("text", transcription)
                        addProperty("language", language ?: "en")
                        addProperty("duration", 0.0) // TODO: calculate actual duration
                    })
                    else -> jsonResponse(JsonObject().apply {
                        addProperty("text", transcription)
                    })
                }
            } catch (e: Exception) {
                Log.e(TAG, "Transcription failed", e)
                errorResponse(Response.Status.INTERNAL_ERROR, "Transcription failed: ${e.message}")
            }
        }
    }

    /**
     * POST /v1/audio/speech - Text-to-Speech (OpenAI-compatible)
     * 
     * Request: application/json with:
     * - input: text to synthesize (required)
     * - model: TTS pack hint (optional; resolved via TtsModelManager,
     *          falls back to the legacy vits-vctk pack)
     * - voice: voice ID (optional, "speaker_<id>" or "<id>")
     * - speed: playback speed 0.25-4.0 (optional)
     * - language: language override for engines that need one
     *             (optional, e.g. "ja" for Supertonic)
     * - response_format: "mp3", "wav", "opus" (optional, default: wav)
     * 
     * Response: audio/wav binary data
     */
    private fun handleSpeech(session: IHTTPSession): Response {
        // Parse JSON body
        val contentLength = session.headers["content-length"]?.toIntOrNull() ?: 0
        val buffer = ByteArray(contentLength)
        session.inputStream.read(buffer, 0, contentLength)
        val body = String(buffer)
        
        val request = try {
            gson.fromJson(body, SpeechRequest::class.java)
        } catch (e: Exception) {
            return errorResponse(Response.Status.BAD_REQUEST, "Invalid JSON body")
        }
        
        if (request.input.isNullOrBlank()) {
            return errorResponse(Response.Status.BAD_REQUEST, "Missing 'input' in request")
        }
        
        // Run on dedicated AI thread to avoid mutex conflicts with WebView/HWUI
        return runBlocking(aiDispatcher) {
            try {
                // Resolve the requested TTS pack from the model hint (falls
                // back to the legacy vits-vctk experience when unset/unknown)
                val pack = TtsModelManager.resolveTtsPack(request.model) { p ->
                    ttsModelManager.isPackDownloaded(p)
                }
                val tts = getVitsService(pack)

                // Parse speaker ID from voice parameter (e.g., "speaker_42" or just "42");
                // coerced into the loaded pack's speaker range
                val speakerId = request.voice?.let { voice ->
                    voice.replace("speaker_", "").toIntOrNull()
                        ?.coerceIn(0, (tts.getNumSpeakers() - 1).coerceAtLeast(0))
                }

                val audioData = tts.synthesize(
                    text = request.input,
                    speed = request.speed ?: 1.0f,
                    speakerId = speakerId,
                    lang = request.language ?: pack?.languageTag
                )
                
                // Return audio as binary response
                val mimeType = when (request.response_format) {
                    "mp3" -> "audio/mpeg"
                    "opus" -> "audio/opus"
                    else -> "audio/wav" // Default to WAV
                }
                
                newFixedLengthResponse(
                    Response.Status.OK,
                    mimeType,
                    audioData.inputStream(),
                    audioData.size.toLong()
                )
            } catch (e: Exception) {
                Log.e(TAG, "Speech synthesis failed", e)
                errorResponse(Response.Status.INTERNAL_ERROR, "Speech synthesis failed: ${e.message}")
            }
        }
    }

    /**
     * POST /v1/chat/completions - Chat Completion (OpenAI-compatible)
     * 
     * Request: application/json with:
     * - messages: array of {role, content} (required)
     * - model: model name (optional, ignored - uses local llama)
     * - max_tokens: max tokens to generate (optional, default: 2048)
     * - temperature: sampling temperature (optional)
     * - stream: enable streaming (optional, default: false)
     * 
     * Response: OpenAI-compatible chat completion response
     */
    private fun handleChatCompletion(session: IHTTPSession): Response {
        // Parse JSON body
        val contentLength = session.headers["content-length"]?.toIntOrNull() ?: 0
        val buffer = ByteArray(contentLength)
        session.inputStream.read(buffer, 0, contentLength)
        val body = String(buffer)
        
        val request = try {
            gson.fromJson(body, ChatCompletionRequest::class.java)
        } catch (e: Exception) {
            return errorResponse(Response.Status.BAD_REQUEST, "Invalid JSON body: ${e.message}")
        }
        
        if (request.messages.isNullOrEmpty()) {
            return errorResponse(Response.Status.BAD_REQUEST, "Missing 'messages' in request")
        }
        
        val maxTokens = request.max_tokens ?: 2048
        val stream = request.stream ?: false
        val requestedModel = request.model
        
        // Load/swap model if needed (on-demand like Desktop)
        if (requestedModel != null && requestedModel != "local") {
            val modelPath = resolveModelPath(requestedModel)
            Log.d(TAG, "Request model: $requestedModel, resolved: $modelPath")
            Log.d(TAG, "Current model: $currentModelPath")
            
            if (modelPath != currentModelPath) {
                Log.i(TAG, "Model switch requested: $currentModelPath -> $modelPath")
                try {
                    // Reload LlamaService with new model
                    runBlocking(aiDispatcher) {
                        llamaMutex.withLock {
                            llamaService?.release()
                            llamaService = null
                            currentModelPath = null
                            
                            val service = LlamaService(context)
                            service.initialize(modelPath)
                            llamaService = service
                            currentModelPath = modelPath
                            Log.i(TAG, "Model switched successfully")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to switch model", e)
                    return errorResponse(Response.Status.INTERNAL_ERROR, "Failed to load model: ${e.message}")
                }
            }
        }
        
        // Convert to LlamaService format
        val llamaMessages = mutableListOf<LlamaService.ChatMessage>()
        val images = mutableListOf<ByteArray>()
        
        // Only collect images from the LAST message to avoid re-processing old images on Android
        val lastMessageIndex = request.messages.size - 1
        
        for ((index, msg) in request.messages.withIndex()) {
            val content = msg.content
            val textParts = mutableListOf<String>()
            val isLastMessage = index == lastMessageIndex
            
            when (content) {
                is MessageContent.TextContent -> {
                    llamaMessages.add(LlamaService.ChatMessage(
                        role = msg.role ?: "user",
                        content = content.text
                    ))
                }
                is MessageContent.MultipartContent -> {
                    // Extract text and images from multipart content
                    // Process parts in order to maintain proper text/image positioning
                    for (part in content.parts) {
                        when (part) {
                            is ContentPart.TextPart -> textParts.add(part.text)
                            is ContentPart.ImagePart -> {
                                if (isLastMessage) {
                                    // Only decode and process images from the latest message
                                    val imageData = part.image_url.url
                                    if (imageData.startsWith("data:image")) {
                                        val base64Data = imageData.substringAfter("base64,")
                                        val originalBytes = java.util.Base64.getDecoder().decode(base64Data)
                                        
                                        // Downscale image to max 512x512 for mobile CPU processing
                                        val bitmap = android.graphics.BitmapFactory.decodeByteArray(originalBytes, 0, originalBytes.size)
                                        if (bitmap != null) {
                                            val maxDim = 512
                                            val width = bitmap.width
                                            val height = bitmap.height
                                            
                                            if (width > maxDim || height > maxDim) {
                                                val ratio = Math.min(maxDim.toFloat() / width, maxDim.toFloat() / height)
                                                val newWidth = (width * ratio).toInt()
                                                val newHeight = (height * ratio).toInt()
                                                val scaled = android.graphics.Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
                                                
                                                val out = java.io.ByteArrayOutputStream()
                                                scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out)
                                                images.add(out.toByteArray())
                                                scaled.recycle()
                                                Log.i(TAG, "Downscaled image from ${width}x${height} to ${newWidth}x${newHeight}")
                                            } else {
                                                images.add(originalBytes)
                                            }
                                            bitmap.recycle()
                                        } else {
                                            images.add(originalBytes)
                                        }
                                        
                                        // Add mtmd default image marker - gets replaced with media_marker during tokenization
                                        textParts.add("<__image__>")
                                    }
                                } else {
                                    // For old messages, keep the text description but skip image processing
                                    textParts.add("[image]")
                                }
                            }
                        }
                    }
                    
                    llamaMessages.add(LlamaService.ChatMessage(
                        role = msg.role ?: "user",
                        content = textParts.joinToString("")
                    ))
                }
                null -> {
                    // Handle null content
                    llamaMessages.add(LlamaService.ChatMessage(
                        role = msg.role ?: "user",
                        content = ""
                    ))
                }
            }
        }
        
        return if (stream) {
            handleChatCompletionStreaming(llamaMessages, images, maxTokens, request.model ?: "llama-local")
        } else {
            handleChatCompletionSync(llamaMessages, images, maxTokens, request.model ?: "llama-local")
        }
    }
    
    /**
     * Handle non-streaming chat completion
     */
    private fun handleChatCompletionSync(
        messages: List<LlamaService.ChatMessage>,
        images: List<ByteArray>,
        maxTokens: Int,
        model: String
    ): Response {
        return runBlocking(aiDispatcher) {
            try {
                val llama = getLlamaService()
                var response = llama.chatCompletionSync(messages, maxTokens, images.ifEmpty { null })
                
                // Strip <think>...</think> blocks from response
                response = stripThinkBlocks(response)
                
                val result = JsonObject().apply {
                    addProperty("id", "chatcmpl-${UUID.randomUUID()}")
                    addProperty("object", "chat.completion")
                    addProperty("created", System.currentTimeMillis() / 1000)
                    addProperty("model", model)
                    add("choices", JsonArray().apply {
                        add(JsonObject().apply {
                            addProperty("index", 0)
                            add("message", JsonObject().apply {
                                addProperty("role", "assistant")
                                addProperty("content", response)
                            })
                            addProperty("finish_reason", "stop")
                        })
                    })
                    add("usage", JsonObject().apply {
                        addProperty("prompt_tokens", 0) // TODO: calculate
                        addProperty("completion_tokens", 0)
                        addProperty("total_tokens", 0)
                    })
                }
                
                jsonResponse(result)
            } catch (e: Exception) {
                Log.e(TAG, "Chat completion failed", e)
                errorResponse(Response.Status.INTERNAL_ERROR, "Chat completion failed: ${e.message}")
            }
        }
    }
    
    /**
     * Handle streaming chat completion (SSE)
     */
    private fun handleChatCompletionStreaming(
        messages: List<LlamaService.ChatMessage>,
        images: List<ByteArray>,
        maxTokens: Int,
        model: String
    ): Response {
        val completionId = "chatcmpl-${UUID.randomUUID()}"
        val created = System.currentTimeMillis() / 1000
        
        // Use queue-based streaming for immediate chunk delivery
        val chunkQueue = LinkedBlockingQueue<ByteArray>()
        val END_MARKER = ByteArray(0)
        
        // Launch streaming in background — save job ref so we can cancel on client disconnect
        val streamingJob = scope.launch(aiDispatcher) {
            try {
                val llama = getLlamaService()
                
                // Buffer for detecting and stripping <think> blocks
                val buffer = StringBuilder()
                var inThinkBlock = false
                var totalTokens = 0
                var sentChars = 0
                
                Log.d(TAG, "Starting streaming chat completion...")
                
                llama.chatCompletion(messages, maxTokens, images.ifEmpty { null }).collect { token ->
                    totalTokens++
                    
                    // Log every 20 tokens for debugging
                    if (totalTokens <= 5 || totalTokens % 20 == 0) {
                        Log.d(TAG, "Token $totalTokens: '$token' (inThink: $inThinkBlock)")
                    }
                    
                    // If we've already sent content, no more think detection - just stream
                    if (sentChars > 0) {
                        Log.d(TAG, "Streaming token: '$token'")
                        queueStreamChunk(chunkQueue, completionId, created, model, token)
                        sentChars += token.length
                        return@collect
                    }
                    
                    // If in think block, accumulate until </think>
                    if (inThinkBlock) {
                        buffer.append(token)
                        if (buffer.toString().contains("</think>")) {
                            val bufStr = buffer.toString()
                            val idx = bufStr.indexOf("</think>")
                            val afterThink = bufStr.substring(idx + 8)
                            buffer.clear()
                            inThinkBlock = false
                            Log.d(TAG, "Exited think block at token $totalTokens")
                            
                            // Send content after </think> and disable future checks
                            if (afterThink.isNotEmpty()) {
                                Log.d(TAG, "Streaming after think: '$afterThink'")
                                queueStreamChunk(chunkQueue, completionId, created, model, afterThink)
                                sentChars += afterThink.length
                            }
                        }
                        return@collect
                    }
                    
                    // Still at start - check if response begins with <think>
                    buffer.append(token)
                    val bufStr = buffer.toString()
                    
                    // Check if we have complete <think> tag
                    if (bufStr.contains("<think>")) {
                        inThinkBlock = true
                        val idx = bufStr.indexOf("<think>")
                        // Send anything before <think> (shouldn't be any at start, but just in case)
                        if (idx > 0) {
                            val beforeThink = bufStr.substring(0, idx)
                            queueStreamChunk(chunkQueue, completionId, created, model, beforeThink)
                            sentChars += beforeThink.length
                        }
                        buffer.clear()
                        buffer.append(bufStr.substring(idx + 7)) // Keep text after <think>
                        Log.d(TAG, "Entered think block at token $totalTokens")
                        return@collect
                    }
                    
                    // Check if buffer might be incomplete <think> tag (< or <t or <th etc)
                    if ("<think>".startsWith(bufStr) && bufStr.length < 7) {
                        // Still building potential <think> tag, wait
                        return@collect
                    }
                    
                    Log.d(TAG, "Streaming start (no think): '$bufStr'")
                    // First chars are NOT <think> - send everything and disable future checks
                    queueStreamChunk(chunkQueue, completionId, created, model, bufStr)
                    sentChars += bufStr.length
                    buffer.clear()
                }
                
                // Flush any remaining buffer (if not in think block)
                if (!inThinkBlock && buffer.isNotEmpty()) {
                    queueStreamChunk(chunkQueue, completionId, created, model, buffer.toString())
                    sentChars += buffer.length
                }
                
                Log.d(TAG, "Streaming complete: $totalTokens tokens, $sentChars chars sent")
                
                // Send final chunk with finish_reason
                val finalChunk = JsonObject().apply {
                    addProperty("id", completionId)
                    addProperty("object", "chat.completion.chunk")
                    addProperty("created", created)
                    addProperty("model", model)
                    add("choices", JsonArray().apply {
                        add(JsonObject().apply {
                            addProperty("index", 0)
                            add("delta", JsonObject())
                            addProperty("finish_reason", "stop")
                        })
                    })
                }
                val finalData = "data: ${gson.toJson(finalChunk)}\n\ndata: [DONE]\n\n".toByteArray(Charsets.UTF_8)
                chunkQueue.put(finalData)
                chunkQueue.put(END_MARKER) // Signal end of stream
                
            } catch (e: Exception) {
                Log.e(TAG, "Streaming chat completion failed", e)
                chunkQueue.put(END_MARKER)
            }
        }
        
        // Create InputStream that reads from queue and returns exact chunk sizes
        val queueInputStream = object : InputStream() {
            private var currentChunk: ByteArray? = null
            private var position = 0
            
            override fun read(): Int {
                while (true) {
                    val chunk = currentChunk
                    if (chunk != null && position < chunk.size) {
                        return chunk[position++].toInt() and 0xFF
                    }
                    
                    // Need next chunk - allow up to 10 minutes for vision/prefill processing
                    val next = chunkQueue.poll(600, TimeUnit.SECONDS) ?: return -1
                    if (next.isEmpty()) return -1 // END_MARKER
                    
                    currentChunk = next
                    position = 0
                }
            }
            
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (len == 0) return 0
                
                val chunk = currentChunk
                if (chunk != null && position < chunk.size) {
                    // Return only what's left in current chunk - don't wait for more
                    val available = chunk.size - position
                    val toRead = minOf(available, len)
                    System.arraycopy(chunk, position, b, off, toRead)
                    position += toRead
                    return toRead
                }
                
                // Need next chunk - allow up to 10 minutes for vision/prefill processing
                val next = chunkQueue.poll(600, TimeUnit.SECONDS) ?: return -1
                if (next.isEmpty()) return -1 // END_MARKER
                
                currentChunk = next
                position = 0
                
                // Return exact chunk size, not buffer size
                val toRead = minOf(next.size, len)
                System.arraycopy(next, 0, b, off, toRead)
                position = toRead
                return toRead
            }
            
            override fun available(): Int {
                // Always return 0 to force NanoHTTPD to send what it has
                return 0
            }

            override fun close() {
                // Only abort if the job is still actively generating.
                // If generation already finished (EOG token), this fires after the
                // END_MARKER is consumed — don't poison the abort flag for the next request.
                if (streamingJob.isActive) {
                    Log.d(TAG, "SSE stream closed mid-generation — aborting")
                    streamingJob.cancel()
                    scope.launch(aiDispatcher) {
                        llamaService?.stopGeneration()
                    }
                } else {
                    Log.d(TAG, "SSE stream closed normally — generation already complete")
                }
                super.close()
            }
        }
        
        // Use custom FlushingChunkedResponse that actually flushes the socket
        return FlushingChunkedResponse(
            Response.Status.OK,
            "text/event-stream",
            queueInputStream
        )
    }

    /**
     * Create JSON response
     */
    private fun jsonResponse(json: JsonObject): Response {
        return newFixedLengthResponse(
            Response.Status.OK,
            "application/json",
            gson.toJson(json)
        )
    }

    /**
     * Create error response
     */
    private fun errorResponse(status: Response.Status, message: String): Response {
        val error = JsonObject().apply {
            add("error", JsonObject().apply {
                addProperty("message", message)
                addProperty("type", "api_error")
                addProperty("code", status.requestStatus)
            })
        }
        return newFixedLengthResponse(status, "application/json", gson.toJson(error))
    }
    
    /**
     * Resolve model name/path to absolute file path
     * Searches in external models directory
     */
    private fun resolveModelPath(modelNameOrPath: String): String {
        // If already absolute path, return it
        val file = File(modelNameOrPath)
        if (file.isAbsolute && file.exists()) {
            return modelNameOrPath
        }
        
        // Search in external models/llm directory
        val modelsDir = File(context.getExternalFilesDir(null), "models/llm")
        if (!modelsDir.exists()) {
            throw IllegalArgumentException("Models directory does not exist: ${modelsDir.absolutePath}")
        }
        
        // Try exact match first
        val exactMatch = File(modelsDir, modelNameOrPath)
        if (exactMatch.exists()) {
            return exactMatch.absolutePath
        }
        
        // Try case-insensitive match
        val modelLower = modelNameOrPath.lowercase()
        val files = modelsDir.listFiles() ?: emptyArray()
        val match = files.find { 
            it.name.lowercase() == modelLower || 
            it.name.lowercase().contains(modelLower.split(":")[0])
        }
        
        if (match != null) {
            return match.absolutePath
        }
        
        throw IllegalArgumentException("Model not found: $modelNameOrPath in ${modelsDir.absolutePath}")
    }

    /**
     * Queue SSE chunk for immediate delivery
     */
    private fun queueStreamChunk(
        queue: LinkedBlockingQueue<ByteArray>,
        completionId: String,
        created: Long,
        model: String,
        content: String
    ) {
        val chunk = JsonObject().apply {
            addProperty("id", completionId)
            addProperty("object", "chat.completion.chunk")
            addProperty("created", created)
            addProperty("model", model)
            add("choices", JsonArray().apply {
                add(JsonObject().apply {
                    addProperty("index", 0)
                    add("delta", JsonObject().apply {
                        addProperty("content", content)
                    })
                    addProperty("finish_reason", null as String?)
                })
            })
        }
        val sseData = "data: ${gson.toJson(chunk)}\n\n".toByteArray(Charsets.UTF_8)
        queue.put(sseData)
    }

    /**
     * Strip <think>...</think> blocks from text
     */
    private fun stripThinkBlocks(text: String): String {
        return text.replace(Regex("<think>.*?</think>", RegexOption.DOT_MATCHES_ALL), "").trim()
    }

    /**
     * Clean up resources
     */
    fun shutdown() {
        stop()
        scope.cancel()
        
        // Release AI services on the dedicated thread
        runBlocking(aiDispatcher) {
            whisperService?.release()
            vitsService?.release()
            llamaService?.release()
        }
        
        // Close the dedicated thread
        aiDispatcher.close()
        
        whisperService = null
        vitsService = null
        llamaService = null
        instance = null
        Log.i(TAG, "Server shutdown complete")
    }

    /**
     * Data class for speech synthesis request
     */
    data class SpeechRequest(
        val input: String?,
        val model: String? = null,
        val voice: String? = null,
        val speed: Float? = null,
        val response_format: String? = null,
        val language: String? = null
    )
    
    /**
     * Data class for chat completion request
     */
    data class ChatCompletionRequest(
        val messages: List<ChatMessage>?,
        val model: String? = null,
        val max_tokens: Int? = null,
        val temperature: Float? = null,
        val stream: Boolean? = null
    )
    
    data class ChatMessage(
        val role: String?,
        val content: MessageContent?
    )
    
    // Support both string content and multipart content (for images)
    sealed class MessageContent {
        data class TextContent(val text: String) : MessageContent()
        data class MultipartContent(val parts: List<ContentPart>) : MessageContent()
    }
    
    sealed class ContentPart {
        data class TextPart(val type: String, val text: String) : ContentPart()
        data class ImagePart(val type: String, val image_url: ImageUrl) : ContentPart()
    }
    
    data class ImageUrl(val url: String)
    
    // Custom deserializer to handle both string and array content
    class MessageContentDeserializer : JsonDeserializer<MessageContent> {
        override fun deserialize(
            json: JsonElement,
            typeOfT: Type,
            context: JsonDeserializationContext
        ): MessageContent {
            return when {
                json.isJsonPrimitive -> MessageContent.TextContent(json.asString)
                json.isJsonArray -> {
                    val parts = mutableListOf<ContentPart>()
                    for (element in json.asJsonArray) {
                        val obj = element.asJsonObject
                        val type = obj.get("type").asString
                        when (type) {
                            "text" -> parts.add(ContentPart.TextPart(type, obj.get("text").asString))
                            "image_url" -> {
                                val imageUrl = obj.getAsJsonObject("image_url")
                                parts.add(ContentPart.ImagePart(type, ImageUrl(imageUrl.get("url").asString)))
                            }
                        }
                    }
                    MessageContent.MultipartContent(parts)
                }
                else -> MessageContent.TextContent("")
            }
        }
    }
}
