package com.vassist.app.ai

import android.content.Context
import android.os.SystemClock
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
 * VitsService - On-device Text-to-Speech via sherpa-onnx.
 *
 * Pack-aware: when constructed with a [TtsPack] it loads that pack from
 * filesDir/models/tts/<pack.id>/ (Kitten or Supertonic engines); with a null
 * pack it keeps the legacy vits-vctk behaviour exactly as before
 * (lexicon-based phonemization, NO espeak-ng dependency, models/vits dir,
 * asset fallback).
 *
 * Metrics ([TTS-backend] log prefix): model load time at init and per-synthesis
 * wall time, RTF (synthesis seconds / audio seconds) and first-audio latency.
 */
class VitsService(
    private val context: Context,
    private val pack: TtsPack? = null
) {

    // Single-threaded executor for TTS operations
    private val ttsExecutor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "VitsTTSThread").apply {
            priority = Thread.NORM_PRIORITY
        }
    }

    companion object {
        private const val TAG = "VitsService"

        // Legacy vits-vctk model files (109 speakers)
        // Download from: https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-vctk.tar.bz2
        private const val VITS_MODEL = "vits-vctk.onnx"
        private const val VITS_TOKENS = "tokens-vctk.txt"
        private const val VITS_LEXICON = "lexicon-vctk.txt"

        private const val SAMPLE_RATE = 22050  // legacy VCTK sample rate
        private const val DEFAULT_SPEAKER_ID = 0

        /** Flow-matching steps for Supertonic (per upstream examples). */
        private const val SUPERTONIC_NUM_STEPS = 8
    }

    private var tts: OfflineTts? = null
    private var currentSpeakerId: Int = DEFAULT_SPEAKER_ID

    /** Speaker count reported by the loaded engine (0 until initialized). */
    @Volatile
    private var runtimeNumSpeakers: Int = 0

    @Volatile
    private var runtimeSampleRate: Int = 0

    // Thread-safe state tracking
    private val _isInitialized = AtomicBoolean(false)
    private val _isInitializing = AtomicBoolean(false)

    var isInitialized: Boolean
        get() = _isInitialized.get()
        private set(value) = _isInitialized.set(value)

    var modelName: String = pack?.id ?: "vits-vctk"
        private set

    fun getSampleRate(): Int =
        if (runtimeSampleRate > 0) runtimeSampleRate else SAMPLE_RATE

    private fun maxSpeakerId(): Int =
        (getNumSpeakers() - 1).coerceAtLeast(0)

    /**
     * Set the speaker ID for multi-speaker models (range depends on the pack)
     */
    fun setSpeakerId(speakerId: Int) {
        currentSpeakerId = speakerId.coerceIn(0, maxSpeakerId())
        Log.d(TAG, "Speaker ID set to: $currentSpeakerId")
    }

    /**
     * Get current speaker ID
     */
    fun getSpeakerId(): Int = currentSpeakerId

    /**
     * Get number of available speakers (runtime value once initialized)
     */
    fun getNumSpeakers(): Int {
        if (runtimeNumSpeakers > 0) return runtimeNumSpeakers
        return pack?.knownNumSpeakers?.takeIf { it > 0 } ?: 109
    }

    /**
     * Initialize TTS engine via sherpa-onnx for this service's pack.
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
                Log.i(TAG, "[TTS-backend] Initializing TTS ($modelName) via sherpa-onnx...")
                onProgress?.invoke(0.1f)

                // The legacy vits-vctk pack uses the original lexicon-based
                // config path (models/vits dir, asset fallback); everything
                // else is a downloadable pack config.
                val isLegacyVctk = pack == null || pack.engine == "vits-lexicon"

                // Gate unsupported/missing models in Kotlin BEFORE touching
                // sherpa - it hard-exits the process (native exit(), not a
                // catchable exception) on invalid model paths.
                if (pack != null && !TtsModelManager(context).isPackDownloaded(pack)) {
                    Log.w(TAG, "[TTS-backend] Pack ${pack.id} not downloaded")
                    _isInitializing.set(false)
                    onComplete?.invoke(
                        false,
                        "Voice pack ${pack.displayName} is not downloaded. Install it from settings."
                    )
                    return@execute
                }

                val modelDir = if (!isLegacyVctk && pack != null) {
                    File(context.filesDir, pack.dirName)
                } else {
                    File(context.filesDir, "models/vits")
                }
                if (!modelDir.exists()) {
                    modelDir.mkdirs()
                }

                onProgress?.invoke(0.3f)

                val config: OfflineTtsConfig =
                    if (!isLegacyVctk && pack != null) {
                        buildPackConfig(pack, modelDir)
                    } else {
                        buildLegacyVctkConfig(modelDir, onProgress)
                    }

                onProgress?.invoke(0.7f)

                Log.i(TAG, "Creating OfflineTts instance...")

                val loadStartMs = SystemClock.elapsedRealtime()
                val ttsInstance = OfflineTts(assetManager = null, config = config)
                val loadMs = SystemClock.elapsedRealtime() - loadStartMs

                // Store instance + runtime capabilities
                tts = ttsInstance
                runtimeNumSpeakers = ttsInstance.numSpeakers()
                runtimeSampleRate = ttsInstance.sampleRate()

                _isInitialized.set(true)
                _isInitializing.set(false)

                onProgress?.invoke(1.0f)

                Log.i(TAG,
                    "[TTS-backend] load pack=$modelName engine=${pack?.engine ?: "vits-lexicon"} " +
                        "loadMs=$loadMs numThreads=2 provider=cpu " +
                        "speakers=$runtimeNumSpeakers sr=$runtimeSampleRate " +
                        "soc=${ComputeBackendManager.getSocInfo().model}")
                Log.i(TAG, "TTS initialized successfully!")

                onComplete?.invoke(true, null)

            } catch (e: Exception) {
                Log.e(TAG, "[TTS-backend] Failed to initialize TTS ($modelName)", e)
                _isInitialized.set(false)
                _isInitializing.set(false)
                onComplete?.invoke(false, e.message)
            }
        }
    }

    /** Config for downloadable packs (kitten / supertonic). */
    private fun buildPackConfig(pack: TtsPack, modelDir: File): OfflineTtsConfig {
        val modelConfig = when (pack.engine) {
            "kitten" -> OfflineTtsModelConfig(
                kitten = OfflineTtsKittenModelConfig(
                    model = File(modelDir, "model.fp16.onnx").absolutePath,
                    voices = File(modelDir, "voices.bin").absolutePath,
                    tokens = File(modelDir, "tokens.txt").absolutePath,
                    dataDir = File(modelDir, "espeak-ng-data").absolutePath
                ),
                numThreads = 2,
                debug = true,
                provider = "cpu"
            )
            "supertonic" -> OfflineTtsModelConfig(
                supertonic = OfflineTtsSupertonicModelConfig(
                    durationPredictor = File(modelDir, "duration_predictor.int8.onnx").absolutePath,
                    textEncoder = File(modelDir, "text_encoder.int8.onnx").absolutePath,
                    vectorEstimator = File(modelDir, "vector_estimator.int8.onnx").absolutePath,
                    vocoder = File(modelDir, "vocoder.int8.onnx").absolutePath,
                    ttsJson = File(modelDir, "tts.json").absolutePath,
                    unicodeIndexer = File(modelDir, "unicode_indexer.bin").absolutePath,
                    voiceStyle = File(modelDir, "voice.bin").absolutePath
                ),
                numThreads = 2,
                debug = true,
                provider = "cpu"
            )
            else -> throw IllegalArgumentException("Unsupported TTS engine: ${pack.engine}")
        }

        return OfflineTtsConfig(
            model = modelConfig,
            maxNumSentences = 1
        )
    }

    /** Config for the legacy vits-vctk pack (lexicon-based, no espeak-ng). */
    private fun buildLegacyVctkConfig(
        modelDir: File,
        onProgress: ((Float) -> Unit)?
    ): OfflineTtsConfig {
        val modelFile = File(modelDir, VITS_MODEL)
        val tokensFile = File(modelDir, VITS_TOKENS)
        val lexiconFile = File(modelDir, VITS_LEXICON)

        // Copy from assets if bundled
        if (!modelFile.exists() || !tokensFile.exists() || !lexiconFile.exists()) {
            val copied = copyModelFromAssets(modelDir)
            if (!copied) {
                Log.w(TAG, "VITS model not found. Models need to be downloaded.")
                throw IllegalStateException("Model files not found")
            }
        }

        // Verify model files exist
        Log.i(TAG, "Model file exists: ${modelFile.exists()} (${modelFile.length()} bytes)")
        Log.i(TAG, "Tokens file exists: ${tokensFile.exists()} (${tokensFile.length()} bytes)")
        Log.i(TAG, "Lexicon file exists: ${lexiconFile.exists()} (${lexiconFile.length()} bytes)")

        onProgress?.invoke(0.5f)

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

        return OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                vits = vitsConfig,
                numThreads = 2,  // Can use more threads since no espeak-ng mutex issues
                debug = true,
                provider = "cpu"
            ),
            maxNumSentences = 1
        )
    }

    /**
     * Initialize TTS synchronously (blocking)
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
     * Copy model files from assets if bundled (legacy vits-vctk only)
     */
    private fun copyModelFromAssets(modelDir: File): Boolean {
        return try {
            val assetManager = context.assets
            val vitsAssets = assetManager.list("models/vits") ?: return false

            if (vitsAssets.isEmpty()) return false

            Log.i(TAG, "Found pre-packaged VITS models in assets (${vitsAssets.size} files)")

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
                    val sizeMB = (outputFile.length() / 1024.0 / 1024.0).let { "%.1f".format(it) }
                    Log.d(TAG, "Copied pre-packaged model: $asset ($sizeMB MB)")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to copy: $assetPath - ${e.message}")
                }
            }

            Log.i(TAG, "✓ VITS models loaded from pre-packaged assets")
            true
        } catch (e: Exception) {
            Log.d(TAG, "No pre-packaged VITS models - will need download: ${e.message}")
            false
        }
    }

    /**
     * Synthesize speech from text (async)
     *
     * @param text Text to synthesize
     * @param speed Speech speed (0.5 to 2.0, default 1.0)
     * @param speakerId Speaker override (coerced into the pack's range)
     * @param lang Language override for engines needing one (Supertonic);
     *             defaults to the pack's language tag
     * @param onComplete Completion callback with audio data or error
     */
    fun synthesizeAsync(
        text: String,
        speed: Float = 1.0f,
        speakerId: Int? = null,
        lang: String? = null,
        onComplete: (ByteArray?, String?) -> Unit
    ) {
        if (!_isInitialized.get()) {
            Log.e(TAG, "[TTS-backend] TTS not initialized - models may not be downloaded")
            onComplete(null, "TTS model not available. Please download the model from settings.")
            return
        }

        ttsExecutor.execute {
            try {
                val ttsEngine = tts
                if (ttsEngine == null) {
                    onComplete(null, "TTS engine not available")
                    return@execute
                }

                val sid = (speakerId ?: currentSpeakerId).coerceIn(0, maxSpeakerId())

                Log.d(TAG, "Synthesizing: \"${text.take(50)}...\" with speed: $speed, speaker: $sid")

                val synthStartMs = SystemClock.elapsedRealtime()
                var firstAudioMs = -1L

                val audio = if (pack != null && pack.engine == "supertonic") {
                    val effectiveLang = (lang ?: pack.languageTag).ifBlank { "en" }
                    val genConfig = GenerationConfig(
                        sid = sid,
                        speed = speed,
                        numSteps = SUPERTONIC_NUM_STEPS,
                        extra = mapOf("lang" to effectiveLang)
                    )
                    ttsEngine.generateWithConfigAndCallback(
                        text = text,
                        config = genConfig
                    ) { _ ->
                        if (firstAudioMs < 0) firstAudioMs = SystemClock.elapsedRealtime() - synthStartMs
                        1  // continue generating
                    }
                } else {
                    ttsEngine.generateWithCallback(
                        text = text,
                        sid = sid,
                        speed = speed
                    ) { _ ->
                        if (firstAudioMs < 0) firstAudioMs = SystemClock.elapsedRealtime() - synthStartMs
                        1  // continue generating
                    }
                }

                val wallMs = SystemClock.elapsedRealtime() - synthStartMs
                val audioSec = if (audio.sampleRate > 0) {
                    audio.samples.size.toDouble() / audio.sampleRate
                } else 0.0
                val rtf = if (audioSec > 0 && wallMs > 0) (wallMs / 1000.0) / audioSec else 0.0
                val ttfbMs = if (firstAudioMs < 0) wallMs else firstAudioMs

                runtimeSampleRate = audio.sampleRate

                Log.i(
                    TAG,
                    "[TTS-backend] synth pack=$modelName chars=${text.length} " +
                        "sid=$sid speed=$speed audioSec=${"%.2f".format(audioSec)} " +
                        "wallMs=$wallMs rtf=${"%.3f".format(rtf)} ttfbMs=$ttfbMs " +
                        "sr=${audio.sampleRate} soc=${ComputeBackendManager.getSocInfo().model}"
                )

                Log.d(TAG, "Generated ${audio.samples.size} samples at ${audio.sampleRate}Hz")

                // Convert to WAV
                val wavData = createWavFile(audio.samples, audio.sampleRate)

                Log.d(TAG, "Created WAV: ${wavData.size} bytes")

                onComplete(wavData, null)

            } catch (e: Exception) {
                Log.e(TAG, "[TTS-backend] Speech synthesis failed", e)
                onComplete(null, e.message)
            }
        }
    }

    /**
     * Synthesize speech from text (blocking)
     * ONLY call this from a background thread!
     */
    fun synthesizeBlocking(
        text: String,
        speed: Float = 1.0f,
        speakerId: Int? = null,
        lang: String? = null
    ): ByteArray {
        val latch = CountDownLatch(1)
        var result: ByteArray? = null
        var error: String? = null

        synthesizeAsync(text, speed, speakerId, lang) { data, err ->
            result = data
            error = err
            latch.countDown()
        }

        try {
            if (!latch.await(120, TimeUnit.SECONDS)) {
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
    suspend fun synthesize(
        text: String,
        speed: Float = 1.0f,
        speakerId: Int? = null,
        lang: String? = null
    ): ByteArray {
        return synthesizeBlocking(text, speed, speakerId, lang)
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
                    runtimeNumSpeakers = 0
                    runtimeSampleRate = 0
                    Log.i(TAG, "TTS resources released")
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
