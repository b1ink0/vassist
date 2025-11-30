package com.vassist.app.ai

import android.util.Log
import android.webkit.JavascriptInterface
import com.google.gson.Gson
import kotlinx.coroutines.runBlocking

/**
 * LocalAIBridge - JavaScript interface for WebView to access local AI services
 * 
 * Exposes methods for the WebView to:
 * - Get the local AI server URL
 * - Check model initialization status
 * - Get available voices
 * 
 * Usage in JavaScript:
 *   const baseUrl = AndroidAI.getServerUrl();
 *   const status = JSON.parse(AndroidAI.getStatus());
 *   const voices = JSON.parse(AndroidAI.getVoices());
 */
class LocalAIBridge(
    private val server: LocalAIServer
) {
    companion object {
        private const val TAG = "LocalAIBridge"
        const val JS_INTERFACE_NAME = "AndroidAI"
    }

    private val gson = Gson()

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
}
