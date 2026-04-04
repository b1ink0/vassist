package com.vassist.app.ai

import android.content.Context
import android.util.Log
import com.k2fsa.sherpa.onnx.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * WhisperService - On-device Speech-to-Text using whisper.cpp via sherpa-onnx
 * 
 * Models: https://github.com/k2-fsa/sherpa-onnx/releases (whisper models)
 */
class WhisperService(private val context: Context) {

    companion object {
        private const val TAG = "WhisperService"
        
        // Model files for whisper tiny.en (smallest, fastest)
        // Download from: https://github.com/k2-fsa/sherpa-onnx/releases
        private const val WHISPER_ENCODER = "tiny.en-encoder.int8.onnx"
        private const val WHISPER_DECODER = "tiny.en-decoder.int8.onnx"
        private const val WHISPER_TOKENS = "tiny.en-tokens.txt"
        
        private const val SAMPLE_RATE = 16000
    }

    private val modelManager = STTTTSModelManager(context)
    private var recognizer: OfflineRecognizer? = null
    
    var isInitialized = false
        private set
    
    var modelName = "whisper-tiny.en"
        private set

    /**
     * Initialize Whisper model using sherpa-onnx
     */
    suspend fun initialize(onProgress: ((Float) -> Unit)? = null) {
        try {
            Log.i(TAG, "Initializing Whisper via sherpa-onnx...")
            onProgress?.invoke(0.1f)
            
            // Prepare model directory
            val modelDir = File(context.filesDir, "models/whisper")
            if (!modelDir.exists()) {
                modelDir.mkdirs()
            }
            
            val encoderFile = File(modelDir, WHISPER_ENCODER)
            val decoderFile = File(modelDir, WHISPER_DECODER)
            val tokensFile = File(modelDir, WHISPER_TOKENS)
            
            if (!encoderFile.exists() || !decoderFile.exists() || !tokensFile.exists()) {
                val copied = copyModelFromAssets(modelDir)
                if (!copied) {
                    Log.w(TAG, "Whisper model not found. Models need to be downloaded.")
                    Log.w(TAG, "Download from: https://github.com/k2-fsa/sherpa-onnx/releases")
                    Log.w(TAG, "Place in: ${modelDir.absolutePath}")
                    onProgress?.invoke(1.0f)
                    isInitialized = false
                    return
                }
            }
            
            onProgress?.invoke(0.3f)
            
            val whisperConfig = OfflineWhisperModelConfig(
                encoder = encoderFile.absolutePath,
                decoder = decoderFile.absolutePath,
                language = "en",
                task = "transcribe",
                tailPaddings = -1
            )
            
            onProgress?.invoke(0.5f)
            
            val modelConfig = OfflineModelConfig(
                whisper = whisperConfig,
                tokens = tokensFile.absolutePath,
                numThreads = 4,
                debug = false,
                provider = "cpu",
                modelType = "whisper"
            )
            
            onProgress?.invoke(0.7f)
            
            val config = OfflineRecognizerConfig(
                modelConfig = modelConfig,
                decodingMethod = "greedy_search",
                maxActivePaths = 4
            )
            
            recognizer = OfflineRecognizer(assetManager = null, config = config)
            
            onProgress?.invoke(1.0f)
            isInitialized = true
            Log.i(TAG, "Whisper initialized successfully via sherpa-onnx")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize Whisper", e)
            throw e
        }
    }

    /**
     * Copy model files from assets if bundled
     */
    private fun copyModelFromAssets(modelDir: File): Boolean {
        return try {
            val assetManager = context.assets
            val whisperAssets = assetManager.list("models/whisper") ?: return false
            
            if (whisperAssets.isEmpty()) return false
            
            Log.i(TAG, "Found pre-packaged Whisper models in assets (${whisperAssets.size} files)")
            
            for (filename in whisperAssets) {
                val inputStream = assetManager.open("models/whisper/$filename")
                val outputFile = File(modelDir, filename)
                FileOutputStream(outputFile).use { output ->
                    inputStream.copyTo(output)
                }
                inputStream.close()
                Log.d(TAG, "Copied pre-packaged model: $filename")
            }
            Log.i(TAG, "✓ Whisper models loaded from pre-packaged assets")
            true
        } catch (e: Exception) {
            Log.d(TAG, "No pre-packaged Whisper models - will need download: ${e.message}")
            false
        }
    }

    /**
     * Transcribe audio data to text
     * NOTE: Must be called from the dedicated AI thread to avoid native mutex conflicts
     * 
     * @param audioData Raw audio bytes (WAV format expected, 16kHz mono 16-bit PCM)
     * @param language Optional language hint (e.g., "en", "ja")
     * @return Transcribed text
     */
    suspend fun transcribe(audioData: ByteArray, language: String? = null): String {
        val rec = recognizer
        if (!isInitialized || rec == null) {
            Log.e(TAG, "WhisperService not initialized - models may not be downloaded")
            return "[Error: Whisper model not available. Please download the model from settings.]" 
        }
        
        try {
            Log.d(TAG, "Transcribing audio: ${audioData.size} bytes")
            
            val audioSamples = convertAudioToFloatSamples(audioData)
            Log.d(TAG, "Audio samples: ${audioSamples.size}, duration: ${audioSamples.size / SAMPLE_RATE.toFloat()}s")
            
            val stream = rec.createStream()
            
            stream.acceptWaveform(audioSamples, SAMPLE_RATE)
            
            rec.decode(stream)
            
            val result = rec.getResult(stream)
            val text = result.text.trim()
            
            stream.release()
            
            Log.d(TAG, "Transcription result: $text")
            
            return if (text.isEmpty()) "[No speech detected]" else text
            
        } catch (e: Exception) {
            Log.e(TAG, "Transcription failed", e)
            throw e
        }
    }

    /**
     * Convert WAV audio bytes to float samples normalized to [-1, 1]
     */
    private fun convertAudioToFloatSamples(audioData: ByteArray): FloatArray {
        // Skip WAV header (44 bytes) if present
        val dataOffset = if (audioData.size > 44 && 
            audioData[0] == 'R'.code.toByte() &&
            audioData[1] == 'I'.code.toByte() &&
            audioData[2] == 'F'.code.toByte() &&
            audioData[3] == 'F'.code.toByte()) {
            44
        } else {
            0
        }
        
        // Convert 16-bit PCM to float
        val numSamples = (audioData.size - dataOffset) / 2
        val samples = FloatArray(numSamples)
        
        for (i in 0 until numSamples) {
            val offset = dataOffset + i * 2
            if (offset + 1 < audioData.size) {
                val sample = (audioData[offset].toInt() and 0xFF) or 
                            ((audioData[offset + 1].toInt()) shl 8)
                samples[i] = sample.toShort() / 32768.0f
            }
        }
        
        return samples
    }

    /**
     * Get list of supported languages
     */
    fun getSupportedLanguages(): List<String> {
        return listOf("en", "zh", "de", "es", "ru", "ko", "fr", "ja", "pt", "tr", "pl", "ca", "nl", "ar", "sv", "it", "id", "hi", "fi", "vi", "he", "uk", "el", "ms", "cs", "ro", "da", "hu", "ta", "no", "th", "ur", "hr", "bg", "lt", "la", "mi", "ml", "cy", "sk", "te", "fa", "lv", "bn", "sr", "az", "sl", "kn", "et", "mk", "br", "eu", "is", "hy", "ne", "mn", "bs", "kk", "sq", "sw", "gl", "mr", "pa", "si", "km", "sn", "yo", "so", "af", "oc", "ka", "be", "tg", "sd", "gu", "am", "yi", "lo", "uz", "fo", "ht", "ps", "tk", "nn", "mt", "sa", "lb", "my", "bo", "tl", "mg", "as", "tt", "haw", "ln", "ha", "ba", "jw", "su")
    }

    /**
     * Release resources
     */
    fun release() {
        recognizer?.release()
        recognizer = null
        isInitialized = false
        Log.i(TAG, "Whisper resources released")
    }
}
