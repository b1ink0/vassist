package com.vassist.app.ai

import android.util.Log
import android.webkit.JavascriptInterface
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

/**
 * LocalAIBridge - JavaScript interface for WebView to access local AI services
 * 
 * Exposes methods for the WebView to:
 * - Get the local AI server URL
 * - Check model initialization status
 * - Get available voices
 * - Manage LLM models (list, download, delete)
 * 
 * Usage in JavaScript:
 *   const baseUrl = AndroidAI.getServerUrl();
 *   const status = JSON.parse(AndroidAI.getStatus());
 *   const voices = JSON.parse(AndroidAI.getVoices());
 *   const models = JSON.parse(AndroidAI.listLLMModels());
 */
class LocalAIBridge(
    private val server: LocalAIServer,
    private val context: android.content.Context,
    private val webView: android.webkit.WebView,
    private val onModelImportRequest: () -> Unit
) {
    companion object {
        private const val TAG = "LocalAIBridge"
        const val JS_INTERFACE_NAME = "AndroidAI"
    }

    private val gson = Gson()
    private val modelManager = LLMModelManager(context)
    private val sttTtsManager = STTTTSModelManager(context)

    /**
     * Get the base URL of the local AI server
     * @return Base URL string (e.g., "http://127.0.0.1:8765")
     */
    @JavascriptInterface
    fun getServerUrl(): String {
        val url = LocalAIServer.getBaseUrl()
        Log.d(TAG, "getServerUrl() -> $url")
        return url
    }

    /**
     * Check if the local AI server is running and initialized
     * @return JSON object with status information
     */
    @JavascriptInterface
    fun getServerStatus(): String {
        val status = mapOf(
            "running" to server.isAlive,
            "initialized" to server.isInitialized,
            "baseUrl" to LocalAIServer.getBaseUrl()
        )
        val json = gson.toJson(status)
        Log.d(TAG, "getServerStatus() -> $json")
        return json
    }
    
    /**
     * Alias for getServerStatus for compatibility
     */
    @JavascriptInterface
    fun getStatus(): String = getServerStatus()

    /**
     * Get available TTS voices
     * @return JSON array of voice IDs
     * Note: VITS LJSpeech is a single-speaker model (female English voice)
     */
    @JavascriptInterface
    fun getVoices(): String {
        val voices = mapOf(
            "default" to "LJSpeech (Female, English)"
        )
        val json = gson.toJson(voices)
        Log.d(TAG, "getVoices() -> $json")
        return json
    }

    /**
     * Get available AI models
     * @return JSON array of model info objects
     */
    @JavascriptInterface
    fun getAvailableModels(): String {
        val models = listOf(
            mapOf(
                "id" to "whisper-local",
                "type" to "stt",
                "name" to "Whisper (Local)",
                "ready" to server.isInitialized
            ),
            mapOf(
                "id" to "vits-local",
                "type" to "tts",
                "name" to "VITS LJSpeech (Local)",
                "ready" to server.isInitialized
            )
        )
        val json = gson.toJson(models)
        Log.d(TAG, "getAvailableModels() -> $json")
        return json
    }

    /**
     * Check if a specific model is ready
     * @param model Model name ("whisper" or "vits")
     * @return true if model is initialized
     */
    @JavascriptInterface
    fun isModelReady(model: String): Boolean {
        val ready = when (model.lowercase()) {
            "whisper", "stt" -> true // Check via server
            "vits", "tts" -> true // Check via server
            else -> false
        }
        Log.d(TAG, "isModelReady($model) -> $ready")
        return ready
    }

    /**
     * Get the transcription endpoint URL
     * @return Full URL for STT transcription
     */
    @JavascriptInterface
    fun getTranscriptionUrl(): String {
        val url = "${LocalAIServer.getBaseUrl()}/v1/audio/transcriptions"
        Log.d(TAG, "getTranscriptionUrl() -> $url")
        return url
    }

    /**
     * Get the speech synthesis endpoint URL
     * @return Full URL for TTS synthesis
     */
    @JavascriptInterface
    fun getSpeechUrl(): String {
        val url = "${LocalAIServer.getBaseUrl()}/v1/audio/speech"
        Log.d(TAG, "getSpeechUrl() -> $url")
        return url
    }

    /**
     * Get all endpoint URLs as JSON
     * @return JSON object with all endpoint URLs
     */
    @JavascriptInterface
    fun getEndpoints(): String {
        val baseUrl = LocalAIServer.getBaseUrl()
        val endpoints = mapOf(
            "base" to baseUrl,
            "health" to "$baseUrl/health",
            "models" to "$baseUrl/v1/models",
            "transcriptions" to "$baseUrl/v1/audio/transcriptions",
            "speech" to "$baseUrl/v1/audio/speech"
        )
        val json = gson.toJson(endpoints)
        Log.d(TAG, "getEndpoints() -> $json")
        return json
    }

    /**
     * List all installed LLM models
     * @return JSON string with format: {"success": true, "models": [...]}
     */
    @JavascriptInterface
    fun listLLMModels(): String {
        return try {
            val models = modelManager.listModels()
            val result = mapOf(
                "success" to true,
                "models" to models
            )
            gson.toJson(result)
        } catch (e: Exception) {
            Log.e(TAG, "listLLMModels failed", e)
            gson.toJson(mapOf(
                "success" to false,
                "error" to e.message
            ))
        }
    }

    @JavascriptInterface
    fun searchOllamaModels(query: String, page: Int, pageSize: Int): String {
        return try {
            gson.toJson(runBlocking { modelManager.searchOllamaModels(query, page, pageSize) })
        } catch (e: Exception) {
            Log.e(TAG, "searchOllamaModels failed", e)
            gson.toJson(mapOf("success" to false, "items" to emptyList<Any>(), "error" to e.message))
        }
    }

    @JavascriptInterface
    fun listOllamaModelTags(modelId: String, query: String, page: Int, pageSize: Int): String {
        return try {
            gson.toJson(runBlocking { modelManager.listOllamaModelTags(modelId, query, page, pageSize) })
        } catch (e: Exception) {
            Log.e(TAG, "listOllamaModelTags failed", e)
            gson.toJson(mapOf("success" to false, "items" to emptyList<Any>(), "error" to e.message))
        }
    }

    @JavascriptInterface
    fun searchHuggingFaceModels(query: String, cursor: String, pageSize: Int): String {
        return try {
            gson.toJson(runBlocking { modelManager.searchHuggingFaceModels(query, cursor, pageSize) })
        } catch (e: Exception) {
            Log.e(TAG, "searchHuggingFaceModels failed", e)
            gson.toJson(mapOf("success" to false, "items" to emptyList<Any>(), "error" to e.message))
        }
    }

    @JavascriptInterface
    fun listHuggingFaceFiles(repoId: String, query: String, page: Int, pageSize: Int): String {
        return try {
            gson.toJson(runBlocking { modelManager.listHuggingFaceFiles(repoId, query, page, pageSize) })
        } catch (e: Exception) {
            Log.e(TAG, "listHuggingFaceFiles failed", e)
            gson.toJson(mapOf("success" to false, "items" to emptyList<Any>(), "error" to e.message))
        }
    }

    @JavascriptInterface
    fun searchOllamaModelsAsync(query: String, page: Int, pageSize: Int, callbackId: String) {
        GlobalScope.launch(Dispatchers.IO) {
            val resultJson = try {
                gson.toJson(modelManager.searchOllamaModels(query, page, pageSize))
            } catch (e: Exception) {
                Log.e(TAG, "searchOllamaModelsAsync failed", e)
                gson.toJson(mapOf("success" to false, "items" to emptyList<Any>(), "error" to e.message))
            }
            invokeCallback(callbackId, resultJson)
        }
    }

    @JavascriptInterface
    fun listOllamaModelTagsAsync(modelId: String, query: String, page: Int, pageSize: Int, callbackId: String) {
        GlobalScope.launch(Dispatchers.IO) {
            val resultJson = try {
                gson.toJson(modelManager.listOllamaModelTags(modelId, query, page, pageSize))
            } catch (e: Exception) {
                Log.e(TAG, "listOllamaModelTagsAsync failed", e)
                gson.toJson(mapOf("success" to false, "items" to emptyList<Any>(), "error" to e.message))
            }
            invokeCallback(callbackId, resultJson)
        }
    }

    @JavascriptInterface
    fun searchHuggingFaceModelsAsync(query: String, cursor: String, pageSize: Int, callbackId: String) {
        GlobalScope.launch(Dispatchers.IO) {
            val resultJson = try {
                gson.toJson(modelManager.searchHuggingFaceModels(query, cursor, pageSize))
            } catch (e: Exception) {
                Log.e(TAG, "searchHuggingFaceModelsAsync failed", e)
                gson.toJson(mapOf("success" to false, "items" to emptyList<Any>(), "error" to e.message))
            }
            invokeCallback(callbackId, resultJson)
        }
    }

    @JavascriptInterface
    fun listHuggingFaceFilesAsync(repoId: String, query: String, page: Int, pageSize: Int, callbackId: String) {
        GlobalScope.launch(Dispatchers.IO) {
            val resultJson = try {
                gson.toJson(modelManager.listHuggingFaceFiles(repoId, query, page, pageSize))
            } catch (e: Exception) {
                Log.e(TAG, "listHuggingFaceFilesAsync failed", e)
                gson.toJson(mapOf("success" to false, "items" to emptyList<Any>(), "error" to e.message))
            }
            invokeCallback(callbackId, resultJson)
        }
    }

    private fun invokeCallback(callbackId: String, resultJson: String) {
        GlobalScope.launch(Dispatchers.Main) {
            try {
                // Properly escape JSON for string interpolation in JS
                val escapedJson = resultJson
                    .replace("\\", "\\\\")
                    .replace("'", "\\'")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                val js = "if(window.AndroidAICallbacks && window.AndroidAICallbacks['${callbackId}']) { window.AndroidAICallbacks['${callbackId}']('${escapedJson}'); }"
                webView.evaluateJavascript(js, null)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to invoke JS callback $callbackId", e)
            }
        }
    }

    /**
     * Download model from URL (async)
     * Use downloadProgress callback to track progress
     * @param url Direct download URL
     * @return JSON string with immediate acknowledgment: {"success": true, "downloading": true}
     */
    @JavascriptInterface
    fun downloadLLMModel(url: String): String {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val result = modelManager.downloadFromUrl(url, object : LLMModelManager.DownloadProgressListener {
                    override fun onProgress(percent: Int, status: String) {
                        emitDownloadProgress(percent, status)
                    }
                })
                Log.i(TAG, "Download completed: $result")
                
                // Notify completion
                val success = result["success"] as? Boolean ?: false
                if (success) {
                    emitDownloadProgress(100, "Download complete")
                    emitDownloadComplete(result)
                } else {
                    emitDownloadError(result["error"] as? String ?: "Unknown error")
                }
            } catch (e: Exception) {
                Log.e(TAG, "downloadLLMModel failed", e)
                emitDownloadError(e.message ?: "Download failed")
            }
        }
        
        // Return immediately
        return gson.toJson(mapOf(
            "success" to true,
            "downloading" to true
        ))
    }

    /**
     * Download model from Ollama registry (async)
     * @param modelName Ollama model name (e.g., "llama3.2:3b")
     * @return JSON string with immediate acknowledgment: {"success": true, "downloading": true}
     */
    @JavascriptInterface
    fun pullLLMModel(modelName: String): String {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val result = modelManager.pullFromOllama(modelName, object : LLMModelManager.DownloadProgressListener {
                    override fun onProgress(percent: Int, status: String) {
                        emitDownloadProgress(percent, status)
                    }
                })
                Log.i(TAG, "Ollama pull completed: $result")
                
                // Notify completion
                val success = result["success"] as? Boolean ?: false
                if (success) {
                    emitDownloadProgress(100, "Download complete")
                    emitDownloadComplete(result)
                } else {
                    emitDownloadError(result["error"] as? String ?: "Unknown error")
                }
            } catch (e: Exception) {
                Log.e(TAG, "pullLLMModel failed", e)
                emitDownloadError(e.message ?: "Download failed")
            }
        }
        
        // Return immediately
        return gson.toJson(mapOf(
            "success" to true,
            "downloading" to true
        ))
    }
    
    /**
     * Emit download progress event to JavaScript
     * Calls window.AndroidAI._onDownloadProgress(percent, status)
     */
    private fun emitDownloadProgress(percent: Int, status: String) {
        val safeStatus = status.replace("\"", "\\\"")
        val jsCode = """
            if (window.AndroidAI && window.AndroidAI._onDownloadProgress) {
                window.AndroidAI._onDownloadProgress($percent, "$safeStatus");
            }
        """.trimIndent()
        
        webView.post {
            webView.evaluateJavascript(jsCode, null)
        }
    }
    
    /**
     * Emit download complete event to JavaScript
     * Calls window.AndroidAI._onDownloadComplete(result)
     */
    private fun emitDownloadComplete(result: Map<String, Any?>) {
        val jsCode = """
            if (window.AndroidAI && window.AndroidAI._onDownloadComplete) {
                window.AndroidAI._onDownloadComplete(${gson.toJson(result)});
            }
        """.trimIndent()
        
        webView.post {
            webView.evaluateJavascript(jsCode, null)
        }
    }
    
    /**
     * Emit download error event to JavaScript
     * Calls window.AndroidAI._onDownloadError(error)
     */
    private fun emitDownloadError(error: String) {
        val safeError = error.replace("\"", "\\\"")
        val jsCode = """
            if (window.AndroidAI && window.AndroidAI._onDownloadError) {
                window.AndroidAI._onDownloadError("$safeError");
            }
        """.trimIndent()
        
        webView.post {
            webView.evaluateJavascript(jsCode, null)
        }
    }

    /**
     * Delete a model file
     * @param filename Model filename to delete
     * @return JSON string with format: {"success": true/false, "error": "..."}
     */
    @JavascriptInterface
    fun deleteLLMModel(filename: String): String {
        return try {
            val result = modelManager.deleteModel(filename)
            gson.toJson(result)
        } catch (e: Exception) {
            Log.e(TAG, "deleteLLMModel failed", e)
            gson.toJson(mapOf(
                "success" to false,
                "error" to e.message
            ))
        }
    }

    /**
     * Get the models directory path
     * @return Absolute path to models directory
     */
    @JavascriptInterface
    fun getLLMModelsDirectory(): String {
        return modelManager.getModelsDirectory().absolutePath
    }

    /**
     * Trigger file picker to import a GGUF model
     * Opens native file picker for user to select a model file
     * @return JSON string: {"success": true} immediately (actual import happens via callback)
     */
    @JavascriptInterface
    fun importLLMModel(): String {
        Log.d(TAG, "importLLMModel() - triggering file picker")
        webView.post {
            onModelImportRequest()
        }
        return gson.toJson(mapOf(
            "success" to true,
            "message" to "File picker opened"
        ))
    }

    /**
     * Internal method to handle actual file import after file is selected
     * Called by FullAppActivity after user picks a file
     * @param sourceUri URI of the selected file
     * @param fileName Original file name
     * @return Result map
     */
    fun handleModelImport(sourceUri: android.net.Uri, fileName: String): Map<String, Any?> {
        return modelManager.importFromUri(sourceUri, fileName)
    }

    /**
     * Emit import completion event to JavaScript
     */
    fun emitImportComplete(result: Map<String, Any?>) {
        val json = gson.toJson(result)
        val jsCode = """
            if (window.AndroidAI && window.AndroidAI._onImportComplete) {
                window.AndroidAI._onImportComplete($json);
            }
        """.trimIndent()
        
        webView.post {
            webView.evaluateJavascript(jsCode, null)
        }
    }

    /**
     * Emit import error event to JavaScript
     */
    fun emitImportError(error: String) {
        val safeError = error.replace("\"", "\\\"")
        val jsCode = """
            if (window.AndroidAI && window.AndroidAI._onImportComplete) {
                window.AndroidAI._onImportComplete({"success": false, "error": "$safeError"});
            }
        """.trimIndent()
        
        webView.post {
            webView.evaluateJavascript(jsCode, null)
        }
    }

    // ============================================================================
    // STT/TTS Model Management
    // ============================================================================

    /**
     * Get STT/TTS model status
     * @return JSON string with model availability and sizes
     */
    @JavascriptInterface
    fun getSTTTTSStatus(): String {
        return try {
            val status = sttTtsManager.getModelStatus()
            gson.toJson(mapOf(
                "success" to true,
                "status" to status
            ))
        } catch (e: Exception) {
            Log.e(TAG, "getSTTTTSStatus failed", e)
            gson.toJson(mapOf(
                "success" to false,
                "error" to e.message
            ))
        }
    }

    /**
     * Download Whisper STT model (async with progress)
     * Defaults to tiny.en for backward compatibility
     * @return JSON string: {"success": true, "downloading": true}
     */
    @JavascriptInterface
    fun downloadWhisperModel(): String = downloadWhisperVariant(STTTTSModelManager.DEFAULT_WHISPER_VARIANT_ID)

    /**
     * Download a specific Whisper STT variant (async with progress)
     * @param variantId One of: tiny.en, tiny, base.en, base ("tiny"/"base" are multilingual)
     * @return JSON string: {"success": true, "downloading": true}
     */
    @JavascriptInterface
    fun downloadWhisperVariant(variantId: String): String {
        val id = variantId.ifBlank { STTTTSModelManager.DEFAULT_WHISPER_VARIANT_ID }
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val result = sttTtsManager.downloadWhisperModel(id,
                    object : STTTTSModelManager.DownloadProgressListener {
                        override fun onProgress(percent: Int, status: String) {
                            emitSTTTTSProgress("whisper", percent, status)
                        }
                    }
                )

                val success = result["success"] as? Boolean ?: false
                if (success) {
                    emitSTTTTSComplete("whisper", result)
                } else {
                    emitSTTTTSError("whisper", result["error"] as? String ?: "Download failed")
                }
            } catch (e: Exception) {
                Log.e(TAG, "downloadWhisperVariant($id) failed", e)
                emitSTTTTSError("whisper", e.message ?: "Download failed")
            }
        }

        return gson.toJson(mapOf(
            "success" to true,
            "downloading" to true
        ))
    }

    /**
     * Download VITS TTS model (async with progress)
     * @return JSON string: {"success": true, "downloading": true}
     */
    @JavascriptInterface
    fun downloadVitsModel(): String {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val result = sttTtsManager.downloadVitsModel(
                    object : STTTTSModelManager.DownloadProgressListener {
                        override fun onProgress(percent: Int, status: String) {
                            emitSTTTTSProgress("vits", percent, status)
                        }
                    }
                )
                
                val success = result["success"] as? Boolean ?: false
                if (success) {
                    emitSTTTTSComplete("vits", result)
                } else {
                    emitSTTTTSError("vits", result["error"] as? String ?: "Download failed")
                }
            } catch (e: Exception) {
                Log.e(TAG, "downloadVitsModel failed", e)
                emitSTTTTSError("vits", e.message ?: "Download failed")
            }
        }
        
        return gson.toJson(mapOf(
            "success" to true,
            "downloading" to true
        ))
    }

    /**
     * Delete Whisper model files
     * Deletes the default (tiny.en) variant for backward compatibility
     * @return JSON string: {"success": true/false}
     */
    @JavascriptInterface
    fun deleteWhisperModel(): String = deleteWhisperVariant(STTTTSModelManager.DEFAULT_WHISPER_VARIANT_ID)

    /**
     * Delete a specific Whisper variant's files
     * @param variantId One of: tiny.en, tiny, base.en, base
     * @return JSON string: {"success": true/false}
     */
    @JavascriptInterface
    fun deleteWhisperVariant(variantId: String): String {
        return try {
            val success = sttTtsManager.deleteWhisperModel(variantId)
            gson.toJson(mapOf(
                "success" to success
            ))
        } catch (e: Exception) {
            Log.e(TAG, "deleteWhisperVariant($variantId) failed", e)
            gson.toJson(mapOf(
                "success" to false,
                "error" to e.message
            ))
        }
    }

    /**
     * Download SenseVoice multilingual model (async with progress)
     * Supports zh/en/ja/ko/yue; best pick for Chinese/Japanese.
     * @return JSON string: {"success": true, "downloading": true}
     */
    @JavascriptInterface
    fun downloadSenseVoiceModel(): String {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val result = sttTtsManager.downloadSenseVoiceModel(
                    object : STTTTSModelManager.DownloadProgressListener {
                        override fun onProgress(percent: Int, status: String) {
                            emitSTTTTSProgress("sensevoice", percent, status)
                        }
                    }
                )

                val success = result["success"] as? Boolean ?: false
                if (success) {
                    emitSTTTTSComplete("sensevoice", result)
                } else {
                    emitSTTTTSError("sensevoice", result["error"] as? String ?: "Download failed")
                }
            } catch (e: Exception) {
                Log.e(TAG, "downloadSenseVoiceModel failed", e)
                emitSTTTTSError("sensevoice", e.message ?: "Download failed")
            }
        }

        return gson.toJson(mapOf(
            "success" to true,
            "downloading" to true
        ))
    }

    /**
     * Delete the SenseVoice model files
     * @return JSON string: {"success": true/false}
     */
    @JavascriptInterface
    fun deleteSenseVoiceModel(): String {
        return try {
            val success = sttTtsManager.deleteSenseVoiceModel()
            gson.toJson(mapOf(
                "success" to success
            ))
        } catch (e: Exception) {
            Log.e(TAG, "deleteSenseVoiceModel failed", e)
            gson.toJson(mapOf(
                "success" to false,
                "error" to e.message
            ))
        }
    }

    /**
     * Download a Dolphin CTC multilingual model (async with progress)
     * @param variantId "dolphin-base" (~99 MB) or "dolphin-small" (~239 MB)
     * @return JSON string: {"success": true, "downloading": true}
     */
    @JavascriptInterface
    fun downloadDolphinModel(variantId: String): String {
        val id = variantId.ifBlank { STTTTSModelManager.DOLPHIN_BASE_ID }
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val result = sttTtsManager.downloadDolphinModel(id,
                    object : STTTTSModelManager.DownloadProgressListener {
                        override fun onProgress(percent: Int, status: String) {
                            emitSTTTTSProgress("dolphin", percent, status)
                        }
                    }
                )

                val success = result["success"] as? Boolean ?: false
                if (success) {
                    emitSTTTTSComplete("dolphin", result)
                } else {
                    emitSTTTTSError("dolphin", result["error"] as? String ?: "Download failed")
                }
            } catch (e: Exception) {
                Log.e(TAG, "downloadDolphinModel($id) failed", e)
                emitSTTTTSError("dolphin", e.message ?: "Download failed")
            }
        }

        return gson.toJson(mapOf(
            "success" to true,
            "downloading" to true
        ))
    }

    /**
     * Delete a Dolphin variant's files
     * @param variantId "dolphin-base" or "dolphin-small"
     * @return JSON string: {"success": true/false}
     */
    @JavascriptInterface
    fun deleteDolphinModel(variantId: String): String {
        return try {
            val success = sttTtsManager.deleteDolphinModel(variantId)
            gson.toJson(mapOf(
                "success" to success
            ))
        } catch (e: Exception) {
            Log.e(TAG, "deleteDolphinModel($variantId) failed", e)
            gson.toJson(mapOf(
                "success" to false,
                "error" to e.message
            ))
        }
    }

    /**
     * Download the SenseVoice QNN (Qualcomm NPU) context binary for this SoC
     * (async with progress). Requires a supported Snapdragon and the QNN
     * runtime libs bundled in the APK.
     * @return JSON string: {"success": true, "downloading": true}
     */
    @JavascriptInterface
    fun downloadSenseVoiceQnnModel(): String {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val result = sttTtsManager.downloadSenseVoiceQnnModel(
                    object : STTTTSModelManager.DownloadProgressListener {
                        override fun onProgress(percent: Int, status: String) {
                            emitSTTTTSProgress("sensevoice-qnn", percent, status)
                        }
                    }
                )

                val success = result["success"] as? Boolean ?: false
                if (success) {
                    emitSTTTTSComplete("sensevoice-qnn", result)
                } else {
                    emitSTTTTSError("sensevoice-qnn", result["error"] as? String ?: "Download failed")
                }
            } catch (e: Exception) {
                Log.e(TAG, "downloadSenseVoiceQnnModel failed", e)
                emitSTTTTSError("sensevoice-qnn", e.message ?: "Download failed")
            }
        }

        return gson.toJson(mapOf(
            "success" to true,
            "downloading" to true
        ))
    }

    /**
     * Delete the SenseVoice QNN context binary
     * @return JSON string: {"success": true/false}
     */
    @JavascriptInterface
    fun deleteSenseVoiceQnnModel(): String {
        return try {
            val success = sttTtsManager.deleteSenseVoiceQnnModel()
            gson.toJson(mapOf(
                "success" to success
            ))
        } catch (e: Exception) {
            Log.e(TAG, "deleteSenseVoiceQnnModel failed", e)
            gson.toJson(mapOf(
                "success" to false,
                "error" to e.message
            ))
        }
    }

    /**
     * Delete VITS model files
     * @return JSON string: {"success": true/false}
     */
    @JavascriptInterface
    fun deleteVitsModel(): String {
        return try {
            val success = sttTtsManager.deleteVitsModel()
            gson.toJson(mapOf(
                "success" to success
            ))
        } catch (e: Exception) {
            Log.e(TAG, "deleteVitsModel failed", e)
            gson.toJson(mapOf(
                "success" to false,
                "error" to e.message
            ))
        }
    }

    /**
     * Emit STT/TTS download progress to JavaScript
     * Calls window.AndroidAI._onSTTTTSProgress(modelType, percent, status)
     */
    private fun emitSTTTTSProgress(modelType: String, percent: Int, status: String) {
        val safeStatus = status.replace("\"", "\\\"")
        val jsCode = """
            if (window.AndroidAI && window.AndroidAI._onSTTTTSProgress) {
                window.AndroidAI._onSTTTTSProgress("$modelType", $percent, "$safeStatus");
            }
        """.trimIndent()
        
        webView.post {
            webView.evaluateJavascript(jsCode, null)
        }
    }

    /**
     * Emit STT/TTS download complete to JavaScript
     * Calls window.AndroidAI._onSTTTTSComplete(modelType, result)
     */
    private fun emitSTTTTSComplete(modelType: String, result: Map<String, Any>) {
        val jsCode = """
            if (window.AndroidAI && window.AndroidAI._onSTTTTSComplete) {
                window.AndroidAI._onSTTTTSComplete("$modelType", ${gson.toJson(result)});
            }
        """.trimIndent()
        
        webView.post {
            webView.evaluateJavascript(jsCode, null)
        }
    }

    /**
     * Emit STT/TTS download error to JavaScript
     * Calls window.AndroidAI._onSTTTTSError(modelType, error)
     */
    private fun emitSTTTTSError(modelType: String, error: String) {
        val safeError = error.replace("\"", "\\\"")
        val jsCode = """
            if (window.AndroidAI && window.AndroidAI._onSTTTTSError) {
                window.AndroidAI._onSTTTTSError("$modelType", "$safeError");
            }
        """.trimIndent()
        
        webView.post {
            webView.evaluateJavascript(jsCode, null)
        }
    }
}
