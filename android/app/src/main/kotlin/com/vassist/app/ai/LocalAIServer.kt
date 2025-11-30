package com.vassist.app.ai

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.BufferedWriter
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream
import java.io.OutputStreamWriter
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

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

    private val gson = Gson()
    
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
    
    // Coroutine mutexes for initialization (non-blocking)
    private val whisperMutex = Mutex()
    private val vitsMutex = Mutex()
    private val llamaMutex = Mutex()

    // Server state
    var isInitialized = false
        private set
    
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
                Log.i(TAG, "Whisper service initialized")
                service
            }
        }
    }
    
    /**
     * Get or initialize VITS service (thread-safe, non-blocking)
     */
    private suspend fun getVitsService(): VitsService {
        vitsService?.let { if (it.isInitialized) return it }
        
        return vitsMutex.withLock {
            // Double-check after acquiring lock
            vitsService?.let { if (it.isInitialized) return it }
            
            withContext(aiDispatcher) {
                Log.i(TAG, "Lazy-loading VITS service on dedicated thread...")
                val service = VitsService(context)
                service.initialize()
                vitsService = service
                Log.i(TAG, "VITS service initialized")
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
                service.initialize()
                llamaService = service
                Log.i(TAG, "Llama service initialized: ${service.modelName}")
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
     * GET /v1/models - List available models (OpenAI-compatible)
     */
    private fun handleListModels(): Response {
        val models = JsonObject().apply {
            add("data", gson.toJsonTree(listOf(
                mapOf(
                    "id" to "whisper-local",
                    "object" to "model",
                    "owned_by" to "local",
                    "permission" to emptyList<String>()
                ),
                mapOf(
                    "id" to "vits-local", 
                    "object" to "model",
                    "owned_by" to "local",
                    "permission" to emptyList<String>()
                ),
                mapOf(
                    "id" to "llama-local",
                    "object" to "model",
                    "owned_by" to "local",
                    "permission" to emptyList<String>()
                )
            )))
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
            })
            add("vits", JsonObject().apply {
                addProperty("initialized", vitsService?.isInitialized == true)
                addProperty("model", vitsService?.modelName ?: "vits-vctk")
                addProperty("numSpeakers", vitsService?.getNumSpeakers() ?: 109)
                addProperty("currentSpeaker", vitsService?.getSpeakerId() ?: 0)
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
     * - model: model name (optional, ignored - uses local whisper)
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
        val responseFormat = params["response_format"] ?: "json"
        
        // Run on dedicated AI thread to avoid mutex conflicts with WebView/HWUI
        return runBlocking(aiDispatcher) {
            try {
                // Lazy-load Whisper on first request
                val whisper = getWhisperService()
                
                val audioData = File(audioFile).readBytes()
                val transcription = whisper.transcribe(audioData, language)
                
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
     * - model: model name (optional, ignored - uses local vits)
     * - voice: voice ID (optional)
     * - speed: playback speed 0.25-4.0 (optional)
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
                // Lazy-load VITS on first request
                val vits = getVitsService()
                
                // Parse speaker ID from voice parameter (e.g., "speaker_42" or just "42")
                val speakerId = request.voice?.let { voice ->
                    voice.replace("speaker_", "").toIntOrNull()?.coerceIn(0, 108)
                }
                
                val audioData = vits.synthesize(
                    text = request.input,
                    speed = request.speed ?: 1.0f,
                    speakerId = speakerId
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
        
        // Convert to LlamaService format
        val messages = request.messages.map { msg ->
            LlamaService.ChatMessage(
                role = msg.role ?: "user",
                content = msg.content ?: ""
            )
        }
        
        return if (stream) {
            handleChatCompletionStreaming(messages, maxTokens, request.model ?: "llama-local")
        } else {
            handleChatCompletionSync(messages, maxTokens, request.model ?: "llama-local")
        }
    }
    
    /**
     * Handle non-streaming chat completion
     */
    private fun handleChatCompletionSync(
        messages: List<LlamaService.ChatMessage>,
        maxTokens: Int,
        model: String
    ): Response {
        return runBlocking(aiDispatcher) {
            try {
                val llama = getLlamaService()
                var response = llama.chatCompletionSync(messages, maxTokens)
                
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
        maxTokens: Int,
        model: String
    ): Response {
        val completionId = "chatcmpl-${UUID.randomUUID()}"
        val created = System.currentTimeMillis() / 1000
        
        // Create piped streams for SSE
        val pipedOutput = PipedOutputStream()
        val pipedInput = PipedInputStream(pipedOutput)
        
        // Launch streaming in background
        scope.launch(aiDispatcher) {
            try {
                val llama = getLlamaService()
                val writer = pipedOutput.bufferedWriter()
                
                // Buffer for detecting and stripping <think> blocks
                val buffer = StringBuilder()
                var inThinkBlock = false
                var totalTokens = 0
                var sentChars = 0
                
                Log.d(TAG, "Starting streaming chat completion...")
                
                llama.chatCompletion(messages, maxTokens).collect { token ->
                    totalTokens++
                    buffer.append(token)
                    
                    // Log every 10 tokens for debugging
                    if (totalTokens <= 5 || totalTokens % 20 == 0) {
                        Log.d(TAG, "Token $totalTokens: '$token' (buffer: ${buffer.length} chars, inThink: $inThinkBlock)")
                    }
                    
                    // Check for <think> start tag
                    if (!inThinkBlock && buffer.contains("<think>")) {
                        // Send everything before <think>
                        val idx = buffer.indexOf("<think>")
                        if (idx > 0) {
                            val beforeThink = buffer.substring(0, idx)
                            sendStreamChunk(writer, completionId, created, model, beforeThink)
                            sentChars += beforeThink.length
                        }
                        buffer.delete(0, idx + 7) // Remove up to and including <think>
                        inThinkBlock = true
                        Log.d(TAG, "Entered think block at token $totalTokens")
                    }
                    
                    // Check for </think> end tag
                    if (inThinkBlock && buffer.contains("</think>")) {
                        val idx = buffer.indexOf("</think>")
                        buffer.delete(0, idx + 8) // Remove everything including </think>
                        inThinkBlock = false
                        Log.d(TAG, "Exited think block at token $totalTokens")
                    }
                    
                    // If not in think block, send accumulated content
                    if (!inThinkBlock && buffer.isNotEmpty()) {
                        // Don't send if buffer might be start of <think>
                        if (!buffer.toString().startsWith("<") || buffer.length > 7) {
                            val toSend = if (buffer.startsWith("<")) {
                                // Might be partial tag, wait
                                ""
                            } else {
                                val content = buffer.toString()
                                buffer.clear()
                                content
                            }
                            if (toSend.isNotEmpty()) {
                                sendStreamChunk(writer, completionId, created, model, toSend)
                                sentChars += toSend.length
                            }
                        }
                    }
                }
                
                // Flush any remaining buffer (if not in think block)
                if (!inThinkBlock && buffer.isNotEmpty()) {
                    sendStreamChunk(writer, completionId, created, model, buffer.toString())
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
                writer.write("data: ${gson.toJson(finalChunk)}\n\n")
                writer.write("data: [DONE]\n\n")
                writer.flush()
                writer.close()
                
            } catch (e: Exception) {
                Log.e(TAG, "Streaming chat completion failed", e)
                try {
                    pipedOutput.close()
                } catch (_: Exception) {}
            }
        }
        
        return newChunkedResponse(
            Response.Status.OK,
            "text/event-stream",
            pipedInput
        ).apply {
            addHeader("Cache-Control", "no-cache")
            addHeader("Connection", "keep-alive")
        }
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
     * Send a streaming chunk for chat completion
     */
    private fun sendStreamChunk(
        writer: BufferedWriter,
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
        writer.write("data: ${gson.toJson(chunk)}\n\n")
        writer.flush()
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
        val response_format: String? = null
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
        val content: String?
    )
}
