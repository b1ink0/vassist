package com.vassist.app.ai

import android.content.Context
import android.util.Log
import com.k2fsa.sherpa.onnx.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * WhisperService - On-device Speech-to-Text using Whisper via sherpa-onnx
 *
 * Supports multiple downloadable model variants:
 * - tiny.en / base.en: English-only
 * - tiny / base: Multilingual (99 languages incl. zh/ja) - language is applied
 *   by re-creating the recognizer when it changes
 *
 * Models: https://github.com/k2-fsa/sherpa-onnx/releases (whisper models)
 */
class WhisperService(private val context: Context) {

    companion object {
        private const val TAG = "WhisperService"
        private const val SAMPLE_RATE = 16000
        private const val DEFAULT_LANGUAGE = "en"

        // The SenseVoice QNN binary is exported with fixed 30-second input
        // shapes; longer input gets truncated by sherpa. When running on QNN we
        // split longer recordings into chunks just under the limit (cutting at
        // quiet spots) and concatenate the transcriptions.
        // (CPU/XNNPACK paths have dynamic shapes - no limit.)
        private const val QNN_MAX_CHUNK_SECONDS = 29.5f
        private const val QNN_MAX_CHUNK_SAMPLES =
            (SAMPLE_RATE * QNN_MAX_CHUNK_SECONDS).toInt()
    }

    private val modelManager = STTTTSModelManager(context)
    private val backendManager = ComputeBackendManager
    private val recognizerMutex = Mutex()

    private var recognizer: OfflineRecognizer? = null
    private var activeEngine: String? = null   // "whisper" | "sensevoice"
    private var activeVariantId: String? = null
    private var activeLanguage: String? = null
    private var activeProvider: String? = null

    /** Info about how the current recognizer was selected (for status/debug). */
    var backendInfo: ComputeBackendManager.BackendChoice? = null
        private set

    var isInitialized = false
        private set

    var modelName = "whisper-tiny.en"
        private set

    private fun getModelDir(): File {
        val modelDir = File(context.filesDir, "models/whisper")
        if (!modelDir.exists()) {
            modelDir.mkdirs()
        }
        return modelDir
    }

    /** Internal handle for whichever STT engine/model is selected. */
    private data class SttEngineSelection(
        val engine: String,              // "whisper" | "sensevoice"
        val variant: WhisperVariant?
    )

    /**
     * Initialize Whisper/SenseVoice using the best available downloaded model.
     * If no model is available yet, initialization "succeeds" in a dormant state -
     * [ensureReady] will retry once models are downloaded.
     */
    suspend fun initialize(onProgress: ((Float) -> Unit)? = null) {
        try {
            Log.i(TAG, "Initializing STT via sherpa-onnx...")
            onProgress?.invoke(0.1f)

            val modelDir = getModelDir()
            ensureAssetsCopied(modelDir)

            val selection = modelManager.resolveSttEngine(null, null)
            if (selection.first == null) {
                Log.w(TAG, "No STT model downloaded yet. Models can be downloaded from settings.")
                onProgress?.invoke(1.0f)
                isInitialized = false
                return
            }

            onProgress?.invoke(0.5f)
            // Eagerly warm the default ONNX path; ensureReady() will switch
            // model/language/provider on demand (incl. running benchmarks)
            val engine = selection.first
            try {
                loadRecognizer(
                    SttEngineSelection(requireNotNull(engine), selection.second),
                    DEFAULT_LANGUAGE,
                    ComputeBackendManager.PROVIDER_CPU
                )
            } catch (e: Exception) {
                Log.w(TAG, "Eager load failed (will retry on first request): ${e.message}")
                isInitialized = false
            }
            onProgress?.invoke(1.0f)
            Log.i(TAG, "STT initialized successfully via sherpa-onnx ($modelName)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize STT", e)
            throw e
        }
    }

    /**
     * Copy any pre-packaged model files from assets into filesDir (idempotent).
     */
    private fun ensureAssetsCopied(modelDir: File) {
        try {
            val assetManager = context.assets
            val whisperAssets = assetManager.list("models/whisper") ?: return
            if (whisperAssets.isEmpty()) return

            Log.i(TAG, "Found pre-packaged Whisper models in assets (${whisperAssets.size} files)")

            for (filename in whisperAssets) {
                val outputFile = File(modelDir, filename)
                if (outputFile.exists()) continue
                val inputStream = assetManager.open("models/whisper/$filename")
                FileOutputStream(outputFile).use { output ->
                    inputStream.copyTo(output)
                }
                inputStream.close()
                Log.d(TAG, "Copied pre-packaged model: $filename")
            }
            Log.i(TAG, "✓ Whisper models loaded from pre-packaged assets")
        } catch (e: Exception) {
            Log.d(TAG, "No pre-packaged Whisper models - will need download: ${e.message}")
        }
    }

    /**
     * Make sure a recognizer is loaded that satisfies the requested model,
     * language and compute provider, re-creating it only when something
     * actually changed.
     *
     * Provider resolution order: explicit hint -> QNN (only if explicitly
     * requested AND fully capable) -> benchmarked best of CPU/XNNPACK -> CPU.
     *
     * @return null on success, or an error message describing why STT is unavailable
     */
    private suspend fun ensureReady(
        modelHint: String?,
        languageHint: String?,
        providerHint: String? = null
    ): String? = recognizerMutex.withLock {
        val normalizedLanguage = normalizeLanguage(languageHint)

        val (engine, variant) = modelManager.resolveSttEngine(modelHint, normalizedLanguage)
        if (engine == null) {
            return@withLock if (
                modelHint?.trim()?.lowercase()
                    ?.removePrefix("whisper-")?.replace("_", "-") == STTTTSModelManager.SENSEVOICE_ID
            ) {
                "SenseVoice model not downloaded. Get it from Settings > Speech-to-Text."
            } else {
                "STT model not available. Please download one from Settings > Speech-to-Text."
            }
        }
        val selection = SttEngineSelection(engine, variant)

        val effectiveLanguage = when (engine) {
            STTTTSModelManager.SENSEVOICE_ID ->
                // SenseVoice: auto/zh/en/ja/ko/yue; anything else -> auto
                if (normalizedLanguage != null &&
                    normalizedLanguage in STTTTSModelManager.SENSEVOICE_LANGUAGES
                ) normalizedLanguage else "auto"
            else ->
                // Whisper: language only applies to multilingual variants
                if (variant?.multilingual == true && normalizedLanguage != null) normalizedLanguage
                else DEFAULT_LANGUAGE
        }

        val choice = selectProvider(selection, providerHint)

        val needsReload =
            recognizer == null ||
                !isInitialized ||
                activeEngine != engine ||
                activeVariantId != variant?.id ||
                activeLanguage != effectiveLanguage ||
                activeProvider != choice.provider

        if (needsReload) {
            Log.i(
                TAG,
                "[STT-backend] Loading recognizer: " +
                    "model=${variant?.id ?: STTTTSModelManager.SENSEVOICE_ID} " +
                    "(engine=$engine, language=$effectiveLanguage)"
            )
            Log.i(
                TAG,
                "[STT-backend] Provider selected: ${choice.provider} " +
                    "(source=${choice.source}" +
                    (choice.cpuMs?.let { ", cpu=${it}ms" } ?: "") +
                    (choice.xnnpackMs?.let { ", xnnpack=${it}ms" } ?: "") +
                    (choice.nnapiMs?.let { ", nnapi=${it}ms" } ?: "") +
                    ")"
            )
            try {
                withContext(Dispatchers.IO) {
                    loadRecognizer(selection, effectiveLanguage, choice.provider)
                }
                selfTest()
                backendInfo = choice
                Log.i(
                    TAG,
                    "[STT-backend] ACTIVE: ${choice.provider.uppercase()} " +
                        "(model=${variant?.id ?: STTTTSModelManager.SENSEVOICE_ID}, " +
                        "language=$effectiveLanguage, source=${choice.source})" +
                        (if (choice.detail.isNotBlank()) "  << ${choice.detail}" else "")
                )
            } catch (e: Exception) {
                Log.e(
                    TAG,
                    "[STT-backend] FALLBACK: ${choice.provider.uppercase()} FAILED to load " +
                        "(${e.message}) - retrying with CPU"
                )
                // Backend fallback chain: failed EP (e.g. xnnpack/qnn) -> cpu
                if (choice.provider != ComputeBackendManager.PROVIDER_CPU) {
                    try {
                        withContext(Dispatchers.IO) {
                            loadRecognizer(
                                selection,
                                effectiveLanguage,
                                ComputeBackendManager.PROVIDER_CPU
                            )
                        }
                        selfTest()
                        backendInfo = choice.copy(
                            provider = ComputeBackendManager.PROVIDER_CPU,
                            source = "fallback",
                            detail = "${choice.provider} failed: ${e.message}"
                        )
                        Log.i(
                            TAG,
                            "[STT-backend] ACTIVE: CPU (fallback from ${choice.provider}, " +
                                "reason: ${e.message})"
                        )
                    } catch (e2: Exception) {
                        Log.e(TAG, "[STT-backend] TOTAL FAILURE even on CPU: ${e2.message}")
                        return@withLock "STT failed to initialize: ${e2.message}"
                    }
                } else {
                    return@withLock "STT failed to initialize: ${e.message}"
                }
            }
        }

        null
    }

    /**
     * Decide which compute provider to use for the given engine/model.
     */
    private fun selectProvider(
        selection: SttEngineSelection,
        providerHint: String?
    ): ComputeBackendManager.BackendChoice {
        val hint = providerHint?.trim()?.lowercase()

        // Explicit QNN: currently only SenseVoice has QNN artifacts published by
        // sherpa for this AAR's API (OfflineSenseVoiceModelConfig.qnnConfig).
        if (hint == ComputeBackendManager.PROVIDER_QNN) {
            if (selection.engine == STTTTSModelManager.SENSEVOICE_ID) {
                val senseVoiceDir =
                    File(context.filesDir, STTTTSModelManager.SENSEVOICE_DIR)
                // Stage first so we can verify the packaged Skel/Stub actually
                // match THIS SoC's Hexagon arch - a mismatch (e.g. v81 libs on a
                // v75 device, or wrong -Pqnn.htp) makes sherpa's deviceCreate
                // hard-exit the process, which we cannot catch in Kotlin.
                val adspDir = backendManager.stageQnnLibsForAdsp(context)
                val socHtp = backendManager.getSocInfo().htpVersion?.uppercase()
                val skelOk =
                    socHtp != null && File(adspDir, "libQnnHtp${socHtp}Skel.so").exists()
                val stubOk =
                    socHtp != null && File(adspDir, "libQnnHtp${socHtp}Stub.so").exists()

                if (!skelOk || !stubOk) {
                    Log.w(
                        TAG,
                        "[STT-backend] QNN requested but staged DSP libs do not match this " +
                            "SoC (htp=$socHtp, skel=$skelOk, stub=$stubOk) - refusing to " +
                            "attempt it (native failure would be unrecoverable). Using ONNX."
                    )
                    // Fall through: the ONNX selection logic below takes over.
                } else if (backendManager.isQnnCapable(senseVoiceDir)) {
                    return ComputeBackendManager.BackendChoice(
                        provider = ComputeBackendManager.PROVIDER_QNN,
                        source = "preference"
                    )
                } else {
                    Log.w(TAG, "QNN requested but not capable - falling back to ONNX path")
                }
            } else {
                Log.w(TAG, "QNN not supported for engine=${selection.engine} - using ONNX path")
            }
        }

        // XNNPACK is NOT available in prebuilt sherpa-onnx builds (their ONNX
        // Runtime only registers CPU + NNAPI EPs). If a stale config still says
        // "xnnpack", explain and fall through to auto.
        if (hint == ComputeBackendManager.PROVIDER_XNNPACK) {
            Log.w(
                TAG,
                "[STT-backend] 'xnnpack' requested but prebuilt sherpa-onnx builds do not " +
                    "include the XNNPACK execution provider (sherpa would silently run CPU). " +
                    "Ignoring - use Auto (CPU vs NNAPI benchmark), NNAPI, or QNN."
            )
        }

        // Explicit EP preference is honored so users can test, but for
        // xnnpack/nnapi we cross-check the cached probe and annotate honestly:
        // prebuilt sherpa AARs compile both EPs out (CPU-only in practice).
        if (hint == ComputeBackendManager.PROVIDER_CPU) {
            return ComputeBackendManager.BackendChoice(
                provider = hint,
                source = "preference"
            )
        }
        if (hint == ComputeBackendManager.PROVIDER_XNNPACK ||
            hint == ComputeBackendManager.PROVIDER_NNAPI
        ) {
            val cacheKey = when {
                selection.variant != null -> selection.variant.id
                selection.engine == STTTTSModelManager.SENSEVOICE_ID -> STTTTSModelManager.SENSEVOICE_ID
                else -> selection.engine
            }

            // No probe data yet? Run the live benchmark NOW - otherwise we'd
            // claim "ACTIVE: NNAPI/XNNPACK" while sherpa silently ran CPU
            // (prebuilt AARs support neither).
            var cached = backendManager.getCachedBestProvider(context, cacheKey)
            if (cached == null) {
                Log.i(
                    TAG,
                    "[STT-backend] First '$hint' request - probing real EP support " +
                        "(one-time benchmark)..."
                )
                benchmarkOnnxProviders(selection, cacheKey)
                cached = backendManager.getCachedBestProvider(context, cacheKey)
            }

            val cachedWinner = cached?.optString("provider")
            return if (cachedWinner != null && cachedWinner != hint) {
                Log.w(
                    TAG,
                    "[STT-backend] '$hint' requested but PROBE CONFIRMED IT DOES NOT WORK " +
                        "in this build (sherpa compiles NNAPI out via __ANDROID_API__=21 and " +
                        "bundles no XNNPACK; live winner was '$cachedWinner'). " +
                        "Using $cachedWinner instead. Real options: CPU, QNN (SenseVoice NPU), " +
                        "or 'gradlew assembleDebug -Psherpa.custom=true' for real XNNPACK."
                )
                ComputeBackendManager.BackendChoice(
                    provider = cachedWinner,
                    source = "fallback",
                    detail = "$hint requested but not functional in this build - using $cachedWinner"
                )
            } else {
                ComputeBackendManager.BackendChoice(
                    provider = hint,
                    source = "preference"
                )
            }
        }

        // Auto: use cached benchmark result if present
        val cacheKey = when {
            selection.variant != null -> selection.variant.id
            selection.engine == STTTTSModelManager.SENSEVOICE_ID -> STTTTSModelManager.SENSEVOICE_ID
            else -> selection.engine   // dolphin-base / dolphin-small
        }
        val cached = backendManager.getCachedBestProvider(context, cacheKey)
        val cachedProvider = cached?.optString("provider")
        if (cachedProvider != null && cachedProvider in listOf(
                ComputeBackendManager.PROVIDER_CPU,
                ComputeBackendManager.PROVIDER_XNNPACK,
                ComputeBackendManager.PROVIDER_NNAPI
            )
        ) {
            // An explicitly requested XNNPACK that the probe found non-functional
            // is downgraded to the benchmark winner with a loud log.
            if (hint == ComputeBackendManager.PROVIDER_XNNPACK &&
                cachedProvider != ComputeBackendManager.PROVIDER_XNNPACK
            ) {
                Log.w(
                    TAG,
                    "[STT-backend] 'xnnpack' requested but runtime probe says XNNPACK is NOT " +
                        "functional in this build (sherpa falls back to CPU internally). " +
                        "Using cached winner: $cachedProvider. Build a custom AAR via " +
                        "tools/build-sherpa-android.sh to enable real XNNPACK."
                )
            } else {
                return ComputeBackendManager.BackendChoice(
                    provider = cachedProvider,
                    source = "benchmark",
                    cpuMs = cached.optLong("cpuMs").takeIf { it > 0 },
                    xnnpackMs = cached.optLong("xnnpackMs").takeIf { it > 0 },
                    nnapiMs = cached.optLong("nnapiMs").takeIf { it > 0 }
                ).also {
                    Log.i(
                        TAG,
                        "[STT-backend] Using cached benchmark winner: ${it.provider} " +
                            "(cpu=${it.cpuMs ?: "?"}ms, xnnpack=${it.xnnpackMs ?: "?"}ms, " +
                            "nnapi=${it.nnapiMs ?: "?"}ms)"
                    )
                }
            }
        }

        // No cache yet - benchmark both EPs once per (model, device, engine version)
        return benchmarkOnnxProviders(selection, cacheKey)
    }

    private fun qnnDirFor(engine: String): File =
        File(getModelDir(), if (engine == STTTTSModelManager.SENSEVOICE_ID) "../sensevoice/qnn" else "qnn")

    /**
     * The Hexagon DSP loads libQnnHtpV81Skel.so etc. via the ADSP_LIBRARY_PATH
     * env var. Point it at the staged copy in filesDir (nativeLibraryDir is a
     * virtual path on modern AGP builds - no real files for the DSP to open).
     */
    private fun setUpAdspLibraryPath(dir: File) {
        try {
            android.system.Os.setenv("ADSP_LIBRARY_PATH", dir.absolutePath, true)
            Log.i(TAG, "ADSP_LIBRARY_PATH=${dir.absolutePath}")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to set ADSP_LIBRARY_PATH: ${e.message}")
        }
    }

    /**
     * Benchmark CPU vs XNNPACK vs NNAPI with a fixed deterministic sample and
     * keep the winner. Runs once per (model, device); results persist via
     * [ComputeBackendManager].
     *
     * XNNPACK fallback detection: sherpa silently runs CPU when an EP is not
     * registered in its bundled ORT. If a provider's timing is within ~3% of
     * CPU's, we assume it fell back internally and exclude it from winning -
     * so the reported backend is always what actually executed.
     */
    private fun benchmarkOnnxProviders(
        selection: SttEngineSelection,
        cacheKey: String
    ): ComputeBackendManager.BackendChoice {
        Log.i(
            TAG,
            "[STT-backend] Benchmarking CPU / XNNPACK / NNAPI for $cacheKey..."
        )
        val samples = makeBenchmarkSample()

        var cpuMs: Long? = null
        var xnnpackMs: Long? = null
        var nnapiMs: Long? = null

        for (ep in listOf(
            ComputeBackendManager.PROVIDER_CPU,
            ComputeBackendManager.PROVIDER_XNNPACK,
            ComputeBackendManager.PROVIDER_NNAPI
        )) {
            try {
                loadRecognizer(selection, DEFAULT_LANGUAGE, ep)
                selfTest(samples)
                val start = System.currentTimeMillis()
                decodeSamples(samples)
                val elapsed = System.currentTimeMillis() - start
                when (ep) {
                    ComputeBackendManager.PROVIDER_CPU -> cpuMs = elapsed
                    ComputeBackendManager.PROVIDER_XNNPACK -> xnnpackMs = elapsed
                    ComputeBackendManager.PROVIDER_NNAPI -> nnapiMs = elapsed
                }
                Log.i(TAG, "[STT-backend] Benchmark $ep: ${elapsed}ms")
            } catch (e: Exception) {
                Log.w(TAG, "[STT-backend] Benchmark FAILED for $ep (${e.message})")
            }
        }

        // Fallback heuristic: provider timing ~= CPU timing => either the EP
        // didn't engage, or it engaged but this model/SoC gains nothing from it
        // (common: int8 models on flagship CPUs - see MS mobile guidance).
        // We cannot distinguish those two cases from timing alone.
        fun isFallbackToCpu(ms: Long?): Boolean =
            ms != null && cpuMs != null && ms >= cpuMs * 0.97

        val xnnpackFunctional = !isFallbackToCpu(xnnpackMs)
        val nnapiFunctional = !isFallbackToCpu(nnapiMs)

        if (xnnpackMs != null && !xnnpackFunctional) {
            Log.w(
                TAG,
                "[STT-backend] XNNPACK produced no speedup over CPU (${xnnpackMs}ms vs ${cpuMs}ms). " +
                    "Either the EP is absent from this build, or this model/device favors plain " +
                    "CPU (typical for int8 models). CPU will be used."
            )
        }

        val winner = when {
            xnnpackFunctional && xnnpackMs != null &&
                (cpuMs == null || xnnpackMs <= minOf(cpuMs, nnapiMs ?: Long.MAX_VALUE)) ->
                ComputeBackendManager.PROVIDER_XNNPACK
            nnapiFunctional && nnapiMs != null &&
                (cpuMs == null || nnapiMs < cpuMs) ->
                ComputeBackendManager.PROVIDER_NNAPI
            else -> ComputeBackendManager.PROVIDER_CPU
        }

        Log.i(
            TAG,
            "[STT-backend] Benchmark complete for $cacheKey: " +
                "cpu=${cpuMs ?: "FAILED"}ms, xnnpack=${xnnpackMs ?: "FAILED"}ms" +
                "${if (!xnnpackFunctional && xnnpackMs != null) " (no gain over CPU)" else ""}" +
                ", nnapi=${nnapiMs ?: "FAILED"}ms" +
                "${if (!nnapiFunctional && nnapiMs != null) " (no gain over CPU)" else ""}" +
                " -> winner=$winner"
        )

        backendManager.cacheBenchmarkResult(
            context, cacheKey, winner, cpuMs, xnnpackMs, nnapiMs
        )

        return ComputeBackendManager.BackendChoice(
            provider = winner,
            source = "benchmark",
            cpuMs = cpuMs,
            xnnpackMs = xnnpackMs,
            nnapiMs = nnapiMs
        )
    }

    /** Deterministic 2-second noise buffer used for benchmarking. */
    private fun makeBenchmarkSample(): FloatArray {
        val seconds = 2f
        val n = (SAMPLE_RATE * seconds).toInt()
        val out = FloatArray(n)
        var seed = 0x5DEECE66DL
        for (i in 0 until n) {
            seed = seed * 25214903917L + 11L
            out[i] = ((seed shr 33 and 0xFFFFL) / 32768f - 1f) * 0.05f
        }
        return out
    }

    /** Decode a short silent buffer; throws on any engine problem. */
    private fun selfTest() {
        selfTest(FloatArray(SAMPLE_RATE / 4))
    }

    private fun selfTest(samples: FloatArray) {
        val rec = recognizer ?: throw IllegalStateException("Recognizer not loaded")
        val stream = rec.createStream()
        try {
            stream.acceptWaveform(samples, SAMPLE_RATE)
            rec.decode(stream)
            rec.getResult(stream)
        } finally {
            stream.release()
        }
    }

    private fun decodeSamples(samples: FloatArray) {
        val rec = recognizer ?: throw IllegalStateException("Recognizer not loaded")
        val stream = rec.createStream()
        try {
            stream.acceptWaveform(samples, SAMPLE_RATE)
            rec.decode(stream)
            rec.getResult(stream)
        } finally {
            stream.release()
        }
    }

    /**
     * Normalize an OpenAI-style language code ("en", "zh-CN", "auto", null...)
     * to a plain 2-letter code, or null for auto-detect/unknown.
     */
    private fun normalizeLanguage(language: String?): String? {
        if (language.isNullOrBlank() || language.equals("auto", ignoreCase = true)) {
            return null
        }
        val code = language.trim().lowercase().substringBefore('-')
        return code.ifBlank { null }
    }

    /**
     * Build and hold a recognizer for the given engine/model + language +
     * compute provider. Releases the previous recognizer first so memory stays
     * bounded. Must be called while holding [recognizerMutex].
     */
    private fun loadRecognizer(selection: SttEngineSelection, language: String, provider: String) {
        recognizer?.release()
        recognizer = null
        isInitialized = false

        val isSenseVoice = selection.engine == STTTTSModelManager.SENSEVOICE_ID
        val dolphinVariant = STTTTSModelManager.getDolphinVariant(selection.engine)
            ?.takeIf { selection.engine in STTTTSModelManager.DOLPHIN_VARIANTS.keys }

        val modelConfig: OfflineModelConfig = when {
            isSenseVoice -> {
                val dir = File(context.filesDir, STTTTSModelManager.SENSEVOICE_DIR)
                val tokensFile = File(dir, STTTTSModelManager.SENSEVOICE_TOKENS)

                if (!tokensFile.exists()) {
                    throw IllegalStateException(
                        "SenseVoice tokens missing in ${dir.absolutePath}"
                    )
                }

                val senseVoiceConfig = if (provider == ComputeBackendManager.PROVIDER_QNN) {
                    // Qualcomm NPU path via sherpa's own QNN backend.
                    // Uses the per-SoC context binary (model.bin) downloaded
                    // from asr-models-qnn-binary. Fixed 5s input shapes.
                    val qnnDir = File(dir, STTTTSModelManager.SENSEVOICE_QNN_DIR)
                    val modelBin = File(qnnDir, STTTTSModelManager.SENSEVOICE_QNN_MODEL)
                    if (!modelBin.exists()) {
                        throw IllegalStateException(
                            "SenseVoice QNN binary missing in ${qnnDir.absolutePath}"
                        )
                    }

                    setUpAdspLibraryPath(backendManager.stageQnnLibsForAdsp(context))
                    // Preload by soname so sherpa's patched dlopen-by-basename resolves
                    backendManager.preloadQnnRuntime()

                    // Point QNN at the staged copies too - real files on disk
                    val adspLibDir = File(context.filesDir, "qnn-adsplib")
                    OfflineSenseVoiceModelConfig(
                        model = "",
                        qnnConfig = QnnConfig(
                            backendLib = File(adspLibDir, "libQnnHtp.so").absolutePath,
                            contextBinary = modelBin.absolutePath,
                            systemLib = File(adspLibDir, "libQnnSystem.so").absolutePath
                        ),
                        language = language,
                        // QNN export doesn't include the ITN branch
                        useInverseTextNormalization = false
                    )
                } else {
                    val modelFile = File(dir, STTTTSModelManager.SENSEVOICE_MODEL)
                    if (!modelFile.exists()) {
                        throw IllegalStateException(
                            "SenseVoice model files missing in ${dir.absolutePath}"
                        )
                    }

                    OfflineSenseVoiceModelConfig(
                        model = modelFile.absolutePath,
                        // "auto" or one of zh/en/ja/ko/yue
                        language = language,
                        useInverseTextNormalization = true
                    )
                }

                OfflineModelConfig(
                    senseVoice = senseVoiceConfig,
                    tokens = tokensFile.absolutePath,
                    numThreads = 4,
                    debug = false,
                    provider = provider,
                    modelType = "sense-voice"
                )
            }
            dolphinVariant != null -> {
                val dir = modelManager.getDolphinDirectory(selection.engine)
                val modelFile = File(dir, "model.int8.onnx")
                val tokensFile = File(dir, "tokens.txt")

                if (!modelFile.exists() || !tokensFile.exists()) {
                    throw IllegalStateException(
                        "${dolphinVariant.displayName} model files missing in ${dir.absolutePath}"
                    )
                }

                // CTC model: no language parameter; auto-detects per utterance.
                // modelType left empty so sherpa auto-detects (matches official docs)
                OfflineModelConfig(
                    dolphin = OfflineDolphinModelConfig(model = modelFile.absolutePath),
                    tokens = tokensFile.absolutePath,
                    numThreads = 4,
                    debug = false,
                    provider = provider
                )
            }
            else -> {
                val variant = selection.variant
                    ?: throw IllegalStateException("Whisper selection missing variant")

                val modelDir = getModelDir()

                // Note: whisper-on-QNN is not supported by this AAR's API
                // (OfflineWhisperModelConfig has no qnnConfig); selectProvider
                // already routes QNN requests to SenseVoice only.
                val encoderFile = File(modelDir, variant.encoder)
                val decoderFile = File(modelDir, variant.decoder)
                val tokensFile = File(modelDir, variant.tokens)

                if (!encoderFile.exists() || !decoderFile.exists() || !tokensFile.exists()) {
                    throw IllegalStateException(
                        "Whisper ${variant.id} model files missing in ${modelDir.absolutePath}"
                    )
                }

                val whisperConfig = OfflineWhisperModelConfig(
                    encoder = encoderFile.absolutePath,
                    decoder = decoderFile.absolutePath,
                    // Only used with multilingual models; ignored by .en variants
                    language = language,
                    task = "transcribe",
                    tailPaddings = -1
                )

                val tokensFile2 = tokensFile
                OfflineModelConfig(
                    whisper = whisperConfig,
                    tokens = tokensFile2.absolutePath,
                    numThreads = 4,
                    debug = false,
                    provider = provider,
                    modelType = "whisper"
                )
            }
        }

        val config = OfflineRecognizerConfig(
            modelConfig = modelConfig,
            decodingMethod = "greedy_search",
            maxActivePaths = 4
        )

        recognizer = OfflineRecognizer(assetManager = null, config = config)

        activeEngine = selection.engine
        activeVariantId = selection.variant?.id
        activeLanguage = language
        activeProvider = provider
        modelName = when {
            isSenseVoice -> "sensevoice"
            dolphinVariant != null -> selection.engine
            else -> "whisper-${selection.variant?.id}"
        }
        isInitialized = true
        Log.i(TAG, "STT recognizer ready: $modelName (language=$language, provider=$provider)")
    }

    /**
     * Transcribe audio data to text
     * NOTE: Must be called from the dedicated AI thread to avoid native mutex conflicts
     *
     * @param audioData Raw audio bytes (WAV format expected, 16kHz mono 16-bit PCM)
     * @param language Optional language hint (e.g., "en", "ja"). Honored when a
     *                 multilingual model (tiny/base) is loaded.
     * @param model Optional model hint (e.g., "whisper-tiny", "tiny.en", "auto").
     *              Falls back to any downloaded model when unavailable.
     * @param provider Optional compute provider: "auto" (default), "cpu",
     *                 "xnnpack", or "qnn" (experimental).
     * @return Transcribed text
     */
    suspend fun transcribe(
        audioData: ByteArray,
        language: String? = null,
        model: String? = null,
        provider: String? = null
    ): String {
        val readyError = ensureReady(model, language, provider)
        if (readyError != null) {
            Log.e(TAG, readyError)
            return "[Error: $readyError]"
        }

        val rec = recognizer ?: run {
            Log.e(TAG, "Recognizer missing after ensureReady")
            return "[Error: Whisper recognizer not available.]"
        }

        try {
            Log.d(TAG, "Transcribing audio: ${audioData.size} bytes (model=$modelName)")

            val audioSamples = convertAudioToFloatSamples(audioData)
            Log.d(TAG, "Audio samples: ${audioSamples.size}, duration: ${audioSamples.size / SAMPLE_RATE.toFloat()}s")

            val rec = recognizer ?: run {
                Log.e(TAG, "Recognizer missing after ensureReady")
                return "[Error: Whisper recognizer not available.]"
            }

            val text =
                if (activeProvider == ComputeBackendManager.PROVIDER_QNN &&
                    audioSamples.size > QNN_MAX_CHUNK_SAMPLES
                ) {
                    // QNN fixed-shape path: split long audio, decode chunk by chunk
                    val chunks = splitForQnn(audioSamples)
                    Log.i(
                        TAG,
                        "[STT-backend] QNN: audio ${"%.1f".format(audioSamples.size / SAMPLE_RATE.toFloat())}s " +
                            "exceeds 30s graph shape - decoding in ${chunks.size} chunks"
                    )
                    chunks.joinToString(" ") { decodeChunk(rec, it).trim() }.trim()
                } else {
                    decodeChunk(rec, audioSamples)
                }

            Log.d(TAG, "Transcription result: $text")

            return if (text.isEmpty()) "[No speech detected]" else text

        } catch (e: Exception) {
            Log.e(TAG, "Transcription failed", e)
            throw e
        }
    }

    /** Decode one buffer of samples with the current recognizer. */
    private fun decodeChunk(rec: OfflineRecognizer, samples: FloatArray): String {
        val stream = rec.createStream()
        try {
            stream.acceptWaveform(samples, SAMPLE_RATE)
            rec.decode(stream)
            return rec.getResult(stream).text.trim()
        } finally {
            stream.release()
        }
    }

    /**
     * Split samples into <=[QNN_MAX_CHUNK_SAMPLES] pieces. Where possible the
     * cut point is moved to the quietest 200ms window near the boundary so
     * words are not chopped mid-syllable.
     */
    private fun splitForQnn(samples: FloatArray): List<FloatArray> {
        val out = mutableListOf<FloatArray>()
        var start = 0
        while (start < samples.size) {
            if (samples.size - start <= QNN_MAX_CHUNK_SAMPLES) {
                out.add(samples.copyOfRange(start, samples.size))
                break
            }
            var end = start + QNN_MAX_CHUNK_SAMPLES
            // search +/-150ms around the hard boundary for the quietest spot
            val search = (SAMPLE_RATE * 0.15f).toInt().coerceAtLeast(1600)
            val lo = (end - search).coerceAtLeast(start + SAMPLE_RATE / 2)
            val hi = (end + search).coerceAtMost(samples.size - SAMPLE_RATE / 4)
            if (hi > lo + search / 2) {
                var bestEnergy = Float.MAX_VALUE
                var bestCut = end
                var i = lo
                while (i < hi) {
                    var e = 0f
                    for (j in i until minOf(i + search / 3, samples.size)) {
                        e += samples[j] * samples[j]
                    }
                    if (e < bestEnergy) { bestEnergy = e; bestCut = i }
                    i += search / 6
                }
                end = bestCut
            }
            out.add(samples.copyOfRange(start, end))
            start = end
        }
        return out
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
            audioData[3] == 'F'.code.toByte()
        ) {
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
     * Get list of supported languages.
     * Non-English languages require a multilingual model (tiny / base);
     * .en models are English-only.
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
        activeEngine = null
        activeVariantId = null
        activeLanguage = null
        activeProvider = null
        backendInfo = null
        isInitialized = false
        Log.i(TAG, "STT resources released")
    }
}
