package com.vassist.app.ai

import android.content.Context
import android.util.Log
import com.k2fsa.sherpa.onnx.*
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * VitsService - On-device Text-to-Speech using VITS VCTK via sherpa-onnx
 * 
 * Uses sherpa-onnx's native C++ implementation of VITS for best performance.
 * This model uses LEXICON-based phonemization (NO espeak-ng), which avoids
 * the pthread_mutex threading conflicts with Android's HWUI threads.
 * 
 * Model: vits-vctk (VCTK, English, 109 speakers)
 * https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html#vctk-english-multi-speaker-109-speakers
 */
class VitsService(private val context: Context) {
    
    // Single-threaded executor for TTS operations
    private val ttsExecutor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "VitsTTSThread").apply {
            priority = Thread.NORM_PRIORITY
        }
    }

    companion object {
        private const val TAG = "VitsService"
        
        // VITS VCTK model files (109 speakers)
        // Download from: https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-vctk.tar.bz2
        private const val VITS_MODEL = "vits-vctk.onnx"
        private const val VITS_TOKENS = "tokens-vctk.txt"
        private const val VITS_LEXICON = "lexicon-vctk.txt"
        
        private const val SAMPLE_RATE = 22050  // VCTK uses 22050Hz
        private const val DEFAULT_SPEAKER_ID = 0  // Default speaker (can be 0-108)
    }

    private var tts: OfflineTts? = null
    private var currentSpeakerId: Int = DEFAULT_SPEAKER_ID
    
    // Thread-safe state tracking
    private val _isInitialized = AtomicBoolean(false)
    private val _isInitializing = AtomicBoolean(false)
    
    var isInitialized: Boolean
        get() = _isInitialized.get()
        private set(value) = _isInitialized.set(value)
    
    var modelName = "vits-vctk"
        private set
    
    /**
     * Set the speaker ID for multi-speaker model (0-108 for VCTK)
     */
    fun setSpeakerId(speakerId: Int) {
        currentSpeakerId = speakerId.coerceIn(0, 108)
        Log.d(TAG, "Speaker ID set to: $currentSpeakerId")
    }
    
    /**
     * Get current speaker ID
     */
    fun getSpeakerId(): Int = currentSpeakerId
    
    /**
     * Get number of available speakers
     */
    fun getNumSpeakers(): Int = 109

    /**
     * Initialize VITS TTS model using sherpa-onnx
     * Uses lexicon-based phonemization (no espeak-ng threading issues!)
     * 
     * @param onProgress Progress callback (0.0 to 1.0)
     * @param onComplete Completion callback with success status
     */
    fun initializeAsync(
        onProgress: ((Float) -> Unit)? = null,
        onComplete: ((Boolean, String?) -> Unit)? = null
    ) {
        if (_isInitializing.getAndSet(true)) {
            Log.w(TAG, "Already initializing, skipping...")
            onComplete?.invoke(false, "Already initializing")
            return
        }
        
        if (_isInitialized.get()) {
            Log.i(TAG, "Already initialized")
            _isInitializing.set(false)
            onComplete?.invoke(true, null)
            return
        }
        
        ttsExecutor.execute {
            try {
                Log.i(TAG, "Initializing VITS TTS via sherpa-onnx...")
                onProgress?.invoke(0.1f)
                
                // Prepare model directory
                val modelDir = File(context.filesDir, "models/vits")
                if (!modelDir.exists()) {
                    modelDir.mkdirs()
                }
                
                // Check if models exist
                val modelFile = File(modelDir, VITS_MODEL)
                val tokensFile = File(modelDir, VITS_TOKENS)
                val lexiconFile = File(modelDir, VITS_LEXICON)
                
                // Copy from assets if bundled
                if (!modelFile.exists() || !tokensFile.exists() || !lexiconFile.exists()) {
                    val copied = copyModelFromAssets(modelDir)
                    if (!copied) {
                        Log.w(TAG, "VITS model not found. Models need to be downloaded.")
                        _isInitializing.set(false)
                        onComplete?.invoke(false, "Model files not found")
                        return@execute
                    }
                }
                
                // Verify model files exist
                Log.i(TAG, "Model file exists: ${modelFile.exists()} (${modelFile.length()} bytes)")
                Log.i(TAG, "Tokens file exists: ${tokensFile.exists()} (${tokensFile.length()} bytes)")
                Log.i(TAG, "Lexicon file exists: ${lexiconFile.exists()} (${lexiconFile.length()} bytes)")
                
                onProgress?.invoke(0.3f)
                
                // Create VITS model config (lexicon-based, no espeak-ng)
                val vitsConfig = OfflineTtsVitsModelConfig(
                    model = modelFile.absolutePath,
                    tokens = tokensFile.absolutePath,
                    lexicon = lexiconFile.absolutePath,
                    dataDir = "",  // No espeak-ng-data needed for lexicon-based models
                    lengthScale = 1.0f,
                    noiseScale = 0.667f,
                    noiseScaleW = 0.8f
                )
                
                Log.i(TAG, "VITS config: model=${modelFile.absolutePath}")
                Log.i(TAG, "VITS config: lexicon=${lexiconFile.absolutePath}")
                
                onProgress?.invoke(0.5f)
                
                // Create model config
                val modelConfig = OfflineTtsModelConfig(
                    vits = vitsConfig,
                    numThreads = 2,  // Can use more threads since no espeak-ng mutex issues
                    debug = true,
                    provider = "cpu"
                )
                
                onProgress?.invoke(0.7f)
                
                // Create TTS config
                val config = OfflineTtsConfig(
                    model = modelConfig,
                    maxNumSentences = 1
                )
                
                Log.i(TAG, "Creating OfflineTts instance...")
                
                // Initialize TTS
                val ttsInstance = OfflineTts(assetManager = null, config = config)
                
                Log.i(TAG, "OfflineTts instance created successfully")
                
                // Store instance
                tts = ttsInstance
                _isInitialized.set(true)
                _isInitializing.set(false)
                
                onProgress?.invoke(1.0f)
                Log.i(TAG, "VITS TTS initialized successfully!")
                
                onComplete?.invoke(true, null)
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize VITS TTS", e)
                _isInitialized.set(false)
                _isInitializing.set(false)
                onComplete?.invoke(false, e.message)
            }
        }
    }
    
    /**
     * Initialize VITS TTS synchronously (blocking)
     * ONLY call this from a background thread!
     * @return true if successful, false if models not available
     */
    fun initializeBlocking(onProgress: ((Float) -> Unit)? = null): Boolean {
        val latch = CountDownLatch(1)
        var success = false
        var error: String? = null
        
        initializeAsync(
            onProgress = onProgress,
            onComplete = { s, e ->
                success = s
                error = e
                latch.countDown()
            }
        )
        
        try {
            // Wait up to 2 minutes for initialization
            if (!latch.await(120, TimeUnit.SECONDS)) {
                Log.e(TAG, "Initialization timed out")
                return false
            }
        } catch (e: InterruptedException) {
            Log.e(TAG, "Initialization interrupted", e)
            return false
        }
        
        return success
    }

    /**
     * Legacy suspend function for compatibility
     */
    suspend fun initialize(onProgress: ((Float) -> Unit)? = null) {
        initializeBlocking(onProgress)
    }

    /**
     * Copy model files from assets if bundled
     */
    private fun copyModelFromAssets(modelDir: File): Boolean {
        return try {
            val assetManager = context.assets
            val vitsAssets = assetManager.list("models/vits") ?: return false
            
            if (vitsAssets.isEmpty()) return false
            
            Log.i(TAG, "Copying VITS assets: ${vitsAssets.joinToString()}")
            
            for (asset in vitsAssets) {
                val assetPath = "models/vits/$asset"
                val outputFile = File(modelDir, asset)
                
                if (outputFile.exists()) {
                    Log.d(TAG, "File already exists, skipping: ${outputFile.absolutePath}")
                    continue
                }
                
                try {
                    assetManager.open(assetPath).use { inputStream ->
                        FileOutputStream(outputFile).use { outputStream ->
                            inputStream.copyTo(outputStream)
                        }
                    }
                    Log.d(TAG, "Copied: $assetPath -> ${outputFile.absolutePath}")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to copy: $assetPath - ${e.message}")
                }
            }
            
            Log.i(TAG, "Finished copying VITS assets")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error copying VITS models from assets: ${e.message}", e)
            false
        }
    }

    /**
     * Synthesize speech from text (async)
     * 
     * @param text Text to synthesize
     * @param speed Speech speed (0.5 to 2.0, default 1.0)
     * @param onComplete Completion callback with audio data or error
     */
    fun synthesizeAsync(
        text: String,
        speed: Float = 1.0f,
        speakerId: Int? = null,
        onComplete: (ByteArray?, String?) -> Unit
    ) {
        if (!_isInitialized.get()) {
            Log.e(TAG, "VitsService not initialized - models may not be downloaded")
            onComplete(null, "VITS model not available. Please download the model from settings.")
            return
        }
        
        ttsExecutor.execute {
            try {
                val ttsEngine = tts
                if (ttsEngine == null) {
                    onComplete(null, "TTS engine not available")
                    return@execute
                }
                
                // Use provided speaker ID or fall back to current setting
                val sid = (speakerId ?: currentSpeakerId).coerceIn(0, 108)
                
                Log.d(TAG, "Synthesizing: \"${text.take(50)}...\" with speed: $speed, speaker: $sid")
                
                // Generate audio with speaker ID (VCTK has 109 speakers: 0-108)
                val audio = ttsEngine.generate(
                    text = text,
                    sid = sid,
                    speed = speed
                )
                
                Log.d(TAG, "Generated ${audio.samples.size} samples at ${audio.sampleRate}Hz")
                
                // Convert to WAV
                val wavData = createWavFile(audio.samples, audio.sampleRate)
                
                Log.d(TAG, "Created WAV: ${wavData.size} bytes")
                
                onComplete(wavData, null)
                
            } catch (e: Exception) {
                Log.e(TAG, "Speech synthesis failed", e)
                onComplete(null, e.message)
            }
        }
    }
    
    /**
     * Synthesize speech from text (blocking)
     * ONLY call this from a background thread!
     */
    fun synthesizeBlocking(text: String, speed: Float = 1.0f, speakerId: Int? = null): ByteArray {
        val latch = CountDownLatch(1)
        var result: ByteArray? = null
        var error: String? = null
        
        synthesizeAsync(text, speed, speakerId) { data, err ->
            result = data
            error = err
            latch.countDown()
        }
        
        try {
            if (!latch.await(60, TimeUnit.SECONDS)) {
                throw RuntimeException("Synthesis timed out")
            }
        } catch (e: InterruptedException) {
            throw RuntimeException("Synthesis interrupted", e)
        }
        
        error?.let { throw RuntimeException(it) }
        return result ?: throw RuntimeException("No audio data generated")
    }

    /**
     * Legacy suspend function for compatibility
     */
    suspend fun synthesize(text: String, speed: Float = 1.0f, speakerId: Int? = null): ByteArray {
        return synthesizeBlocking(text, speed, speakerId)
    }

    /**
     * Create WAV file from float samples
     */
    private fun createWavFile(samples: FloatArray, sampleRate: Int): ByteArray {
        val numSamples = samples.size
        val bytesPerSample = 2 // 16-bit
        val dataSize = numSamples * bytesPerSample
        val fileSize = 44 + dataSize
        
        val buffer = ByteBuffer.allocate(fileSize).order(ByteOrder.LITTLE_ENDIAN)
        
        // RIFF header
        buffer.put("RIFF".toByteArray())
        buffer.putInt(fileSize - 8)
        buffer.put("WAVE".toByteArray())
        
        // fmt chunk
        buffer.put("fmt ".toByteArray())
        buffer.putInt(16) // Chunk size
        buffer.putShort(1) // Audio format (PCM)
        buffer.putShort(1) // Num channels (mono)
        buffer.putInt(sampleRate) // Sample rate
        buffer.putInt(sampleRate * bytesPerSample) // Byte rate
        buffer.putShort(bytesPerSample.toShort()) // Block align
        buffer.putShort((bytesPerSample * 8).toShort()) // Bits per sample
        
        // data chunk
        buffer.put("data".toByteArray())
        buffer.putInt(dataSize)
        
        // Convert float samples to 16-bit PCM
        for (sample in samples) {
            val clipped = sample.coerceIn(-1.0f, 1.0f)
            val int16 = (clipped * 32767).toInt().toShort()
            buffer.putShort(int16)
        }
        
        return buffer.array()
    }

    /**
     * Release resources (async)
     */
    fun releaseAsync(onComplete: (() -> Unit)? = null) {
        if (!ttsExecutor.isShutdown) {
            ttsExecutor.execute {
                try {
                    tts?.release()
                    tts = null
                    _isInitialized.set(false)
                    _isInitializing.set(false)
                    Log.i(TAG, "VITS TTS resources released")
                } catch (e: Exception) {
                    Log.e(TAG, "Error releasing TTS", e)
                } finally {
                    onComplete?.invoke()
                }
            }
            ttsExecutor.shutdown()
        } else {
            onComplete?.invoke()
        }
    }
    
    /**
     * Release resources (blocking)
     */
    fun releaseBlocking() {
        val latch = CountDownLatch(1)
        releaseAsync { latch.countDown() }
        try {
            latch.await(5, TimeUnit.SECONDS)
        } catch (e: InterruptedException) {
            Log.e(TAG, "Release interrupted", e)
        }
    }

    /**
     * Legacy release for compatibility
     */
    fun release() {
        releaseAsync()
    }
}
