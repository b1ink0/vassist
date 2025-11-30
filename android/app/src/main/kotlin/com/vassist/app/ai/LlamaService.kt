package com.vassist.app.ai

import android.content.Context
import android.llama.cpp.LlamaAndroid
import android.util.Log
import kotlinx.coroutines.flow.Flow
import java.io.File

/**
 * LlamaService - High-level wrapper for LLM inference using llama.cpp
 * 
 * Provides chat completion functionality with automatic chat template formatting.
 * Supports streaming and non-streaming responses.
 */
class LlamaService(private val context: Context) {
    
    companion object {
        private const val TAG = "LlamaService"
        
        // Default model settings
        private const val DEFAULT_CONTEXT_SIZE = 4096
        private const val DEFAULT_MAX_TOKENS = 2048
        private const val DEFAULT_TEMPERATURE = 0.7f
        private const val DEFAULT_TOP_K = 40
        private const val DEFAULT_TOP_P = 0.9f
    }
    
    private val llama = LlamaAndroid.instance()
    
    var isInitialized = false
        private set
    
    var modelName: String = "unknown"
        private set
    
    // Chat template for formatting messages
    private var chatTemplate: String? = null
    
    /**
     * Initialize with a model from assets or external storage
     * 
     * @param modelPath Path to GGUF model file (absolute or relative to models/llm/)
     * @param contextSize Context window size
     * @param temperature Sampling temperature
     */
    suspend fun initialize(
        modelPath: String? = null,
        contextSize: Int = DEFAULT_CONTEXT_SIZE,
        temperature: Float = DEFAULT_TEMPERATURE
    ) {
        try {
            val modelFile = resolveModelPath(modelPath)
            
            if (!modelFile.exists()) {
                throw IllegalStateException("Model file not found: ${modelFile.absolutePath}")
            }
            
            Log.i(TAG, "Loading LLM model: ${modelFile.absolutePath}")
            
            llama.load(
                pathToModel = modelFile.absolutePath,
                contextSize = contextSize,
                temperature = temperature,
                topK = DEFAULT_TOP_K,
                topP = DEFAULT_TOP_P
            )
            
            val info = llama.getModelInfo()
            modelName = info?.description ?: modelFile.name
            chatTemplate = info?.chatTemplate
            
            Log.i(TAG, "Model loaded: $modelName (${info?.sizeGB?.let { "%.2f".format(it) }}GB, ${info?.paramsB?.let { "%.2f".format(it) }}B params)")
            
            isInitialized = true
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize LLM", e)
            throw e
        }
    }
    
    /**
     * Generate chat completion (streaming)
     * 
     * @param messages List of chat messages
     * @param maxTokens Maximum tokens to generate
     * @return Flow of generated text tokens
     */
    fun chatCompletion(
        messages: List<ChatMessage>,
        maxTokens: Int = DEFAULT_MAX_TOKENS
    ): Flow<String> {
        if (!isInitialized) {
            throw IllegalStateException("LlamaService not initialized")
        }
        
        val prompt = formatChatPrompt(messages)
        Log.d(TAG, "Chat prompt (${prompt.length} chars): ${prompt.take(200)}...")
        
        return llama.complete(prompt, maxTokens)
    }
    
    /**
     * Generate chat completion (non-streaming)
     * 
     * @param messages List of chat messages
     * @param maxTokens Maximum tokens to generate
     * @return Complete generated response
     */
    suspend fun chatCompletionSync(
        messages: List<ChatMessage>,
        maxTokens: Int = DEFAULT_MAX_TOKENS
    ): String {
        if (!isInitialized) {
            throw IllegalStateException("LlamaService not initialized")
        }
        
        val prompt = formatChatPrompt(messages)
        return llama.generate(prompt, maxTokens)
    }
    
    /**
     * Generate text completion (streaming)
     */
    fun complete(prompt: String, maxTokens: Int = DEFAULT_MAX_TOKENS): Flow<String> {
        if (!isInitialized) {
            throw IllegalStateException("LlamaService not initialized")
        }
        return llama.complete(prompt, maxTokens)
    }
    
    /**
     * Format chat messages into a prompt using the model's chat template
     * 
     * Thinking mode is disabled by prefilling with a closed <think></think> block.
     */
    private fun formatChatPrompt(messages: List<ChatMessage>, enableThinking: Boolean = false): String {
        // Use Qwen3/ChatML format
        
        val sb = StringBuilder()
        var hasSystem = false
        
        for (msg in messages) {
            when (msg.role) {
                "system" -> {
                    hasSystem = true
                    sb.append("<|im_start|>system\n")
                    sb.append(msg.content)
                    sb.append("<|im_end|>\n")
                }
                "user" -> {
                    sb.append("<|im_start|>user\n")
                    sb.append(msg.content)
                    sb.append("<|im_end|>\n")
                }
                "assistant" -> {
                    sb.append("<|im_start|>assistant\n")
                    sb.append(msg.content)
                    sb.append("<|im_end|>\n")
                }
            }
        }
        
        if (!hasSystem) {
            val systemPrompt = "<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n"
            sb.insert(0, systemPrompt)
        }
        
        if (enableThinking) {
            sb.append("<|im_start|>assistant\n")
        } else {
            sb.append("<|im_start|>assistant\n<think>\n</think>\n\n")
        }
        
        return sb.toString()
    }
    
    /**
     * Resolve model path from various sources
     * Priority: 1. Absolute path, 2. External storage, 3. Assets (will copy to cache)
     */
    private fun resolveModelPath(modelPath: String?): File {
        val externalModelsDir = File(context.getExternalFilesDir(null), "models/llm")
        externalModelsDir.mkdirs()
        
        if (modelPath != null && File(modelPath).isAbsolute) {
            val file = File(modelPath)
            if (file.exists()) return file
        }
        
        if (modelPath != null) {
            val externalFile = File(externalModelsDir, modelPath)
            if (externalFile.exists()) {
                Log.i(TAG, "Found model in external storage: ${externalFile.name}")
                return externalFile
            }
        }
        
        if (externalModelsDir.exists()) {
            val ggufFiles = externalModelsDir.listFiles { file -> 
                file.extension.equals("gguf", ignoreCase = true) 
            }
            if (!ggufFiles.isNullOrEmpty()) {
                Log.i(TAG, "Found GGUF model in external: ${ggufFiles[0].name}")
                return ggufFiles[0]
            }
        }
        
        val assetModelPath = modelPath ?: "models/llm/Qwen3-0.6B-Q4_K_M.gguf"
        val cachedModel = copyModelFromAssets(assetModelPath)
        if (cachedModel != null) {
            return cachedModel
        }
        
        try {
            val assetFiles = context.assets.list("models/llm") ?: emptyArray()
            val ggufFile = assetFiles.find { it.endsWith(".gguf", ignoreCase = true) }
            if (ggufFile != null) {
                val copied = copyModelFromAssets("models/llm/$ggufFile")
                if (copied != null) return copied
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not list assets: ${e.message}")
        }
        
        throw IllegalStateException(
            "No GGUF model found. Please place a .gguf model file in:\n" +
            "${externalModelsDir.absolutePath}\n\n" +
            "Or include in app assets at: assets/models/llm/\n\n" +
            "Recommended: Qwen3-0.6B-Q4_K_M.gguf (~400MB)"
        )
    }
    
    /**
     * Copy model from assets to cache directory
     * llama.cpp needs a file path, cannot read directly from assets
     */
    private fun copyModelFromAssets(assetPath: String): File? {
        return try {
            val fileName = assetPath.substringAfterLast("/")
            val cacheDir = File(context.cacheDir, "models/llm")
            cacheDir.mkdirs()
            val destFile = File(cacheDir, fileName)
            
            if (destFile.exists()) {
                Log.i(TAG, "Using cached model: ${destFile.absolutePath}")
                return destFile
            }
            
            Log.i(TAG, "Copying model from assets: $assetPath")
            context.assets.open(assetPath).use { input ->
                destFile.outputStream().use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    var totalBytes = 0L
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        totalBytes += bytesRead
                        if (totalBytes % (50 * 1024 * 1024) == 0L) {
                            Log.i(TAG, "Copied ${totalBytes / (1024 * 1024)} MB...")
                        }
                    }
                }
            }
            Log.i(TAG, "Model copied to: ${destFile.absolutePath}")
            destFile
        } catch (e: Exception) {
            Log.w(TAG, "Could not copy model from assets: ${e.message}")
            null
        }
    }
    
    /**
     * Get model information
     */
    suspend fun getModelInfo(): LlamaAndroid.ModelInfo? {
        return if (isInitialized) llama.getModelInfo() else null
    }
    
    /**
     * Release resources
     */
    suspend fun release() {
        if (isInitialized) {
            llama.unload()
            isInitialized = false
            Log.i(TAG, "LlamaService released")
        }
    }
    
    /**
     * Chat message data class
     */
    data class ChatMessage(
        val role: String,  // "system", "user", or "assistant"
        val content: String
    )
}
