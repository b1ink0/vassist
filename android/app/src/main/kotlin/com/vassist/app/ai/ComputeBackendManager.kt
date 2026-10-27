package com.vassist.app.ai

import android.content.Context
import android.os.Build
import android.util.Log
import org.json.JSONObject
import java.io.File

/**
 * ComputeBackendManager - Selects and benchmarks the sherpa-onnx compute backend.
 *
 * Backend chain (best first):
 *   qnn      -> Qualcomm Hexagon NPU via sherpa's own QNN backend
 *               (requires: QNN-enabled sherpa build + libQnn* runtime libs +
 *                QNN model artifacts for THIS model; scaffolded, off by default)
 *   xnnpack  -> ONNX Runtime XNNPACK EP (optimized mobile CPU)
 *   cpu      -> plain ONNX Runtime CPU
 *
 * XNNPACK vs CPU performance depends on graph + hardware (XNNPACK is NOT always
 * faster), so on "auto" we benchmark both once per (model, device, engine version)
 * and cache the winner in SharedPreferences.
 */
object ComputeBackendManager {

    private const val TAG = "ComputeBackend"
    private const val PREFS = "whisper_backend_prefs"

    /** Bump when sherpa-onnx AAR / ORT changes so benchmarks re-run. */
    private const val ENGINE_VERSION = "sherpa-onnx-1.13.6-custom-xnnpack"

    // Supported provider values for the ONNX path
    const val PROVIDER_AUTO = "auto"
    const val PROVIDER_CPU = "cpu"
    const val PROVIDER_XNNPACK = "xnnpack"
    const val PROVIDER_NNAPI = "nnapi"      // deprecated by Google (Android 15+); kept as experimental
    const val PROVIDER_QNN = "qnn"          // SenseVoice-only, Snapdragon NPU

    // NOTE on XNNPACK / NNAPI availability in PREBUILT sherpa-onnx AARs:
    // - Their bundled ONNX Runtime registers only CPU + NNAPI EPs, and NNAPI is
    //   additionally disabled at COMPILE time ("requires API level >= 27,
    //   current 21" - that 21 is the __ANDROID_API__ they build with, not your
    //   device). Requesting either makes sherpa silently run CPU.
    // - Microsoft's official `onnxruntime:onnxruntime-android` DOES include
    //   XNNPACK, and sherpa can link against an external ORT
    //   (SHERPA_ONNXRUNTIME_LIB_DIR/INCLUDE_DIR).
    // => tools/build-sherpa-android.sh produces a custom AAR where XNNPACK
    //    actually works. Until then, CPU (+ QNN NPU for SenseVoice) is real;
    //    xnnpack/nnapi selections are honored but flagged as likely-fallback.

    /**
     * Detected SoC information used for QNN gating decisions.
     */
    data class SocInfo(
        val manufacturer: String,
        val model: String,
        val boardPlatform: String,
        /** Qualcomm Hexagon HTP architecture, e.g. "v81" for SM8850; null if unknown/not QC */
        val htpVersion: String?
    )

    /**
     * Result of backend selection/benchmarking.
     */
    data class BackendChoice(
        val provider: String,
        val source: String,          // "preference" | "benchmark" | "fallback"
        val cpuMs: Long? = null,
        val xnnpackMs: Long? = null,
        val nnapiMs: Long? = null,
        val selfTestOk: Boolean = true,
        val detail: String = ""
    )

    /** Known Snapdragon model -> HTP architecture mapping (subset of common ones). */
    private val HTP_MAP: Map<String, String> = mapOf(
        "SM8850" to "v81",
        "SM8750" to "v80",
        "SM8650" to "v75",
        "SM8550" to "v73",
        "SM8475" to "v69",
        "SM8450" to "v68",
        "SM7475" to "v69",
        "SM7450" to "v68"
    )

    fun getSocInfo(): SocInfo {
        val manufacturer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Build.SOC_MANUFACTURER ?: ""
        } else ""
        val model = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Build.SOC_MODEL ?: ""
        } else ""

        val boardPlatform = try {
            Class.forName("android.os.SystemProperties")
                .getMethod("get", String::class.java)
                .invoke(null, "ro.board.platform") as? String ?: ""
        } catch (_: Exception) {
            ""
        }

        val htp = HTP_MAP[model.uppercase()]
            ?: HTP_MAP[boardPlatform.uppercase()]

        Log.d(
            TAG,
            "[SoC] manufacturer='$manufacturer' model='$model' " +
                "board='$boardPlatform' -> htp=${htp ?: "unmapped"}"
        )

        return SocInfo(
            manufacturer = manufacturer.ifBlank { "unknown" },
            model = model.ifBlank { "unknown" },
            boardPlatform = boardPlatform.ifBlank { "unknown" },
            htpVersion = htp
        )
    }

    fun isQualcomm(): Boolean =
        getSocInfo().manufacturer.equals("Qualcomm", ignoreCase = true) ||
            getSocInfo().model.startsWith("SM", ignoreCase = true)

    /**
     * Check whether the Qualcomm QNN HTP runtime libraries are loadable.
     * They must be bundled in jniLibs by the app (not present in stock sherpa AARs).
     */
    fun isQnnRuntimeAvailable(): Boolean {
        return try {
            System.loadLibrary("QnnHtp")
            Log.i(TAG, "[QNN-check] libQnnHtp.so loaded OK")
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.w(
                TAG,
                "[QNN-check] libQnnHtp.so NOT found in this build " +
                    "( Qualcomm QNN SDK libs were never bundled): ${e.message}"
            )
            false
        }
    }

    /**
     * Stage QNN libs into filesDir so the Hexagon DSP can actually read them.
     *
     * Modern AGP builds do NOT extract .so files to nativeLibraryDir (they are
     * memory-mapped straight from inside the APK), so ADSP_LIBRARY_PATH must
     * NOT point there - the DSP-side loader gets ENOENT, and nativeLibraryDir
     * has no real files to copy either. Instead, extract the QNN libs directly
     * from the installed APK.
     *
     * @return directory containing the copied QNN libs
     */
    fun stageQnnLibsForAdsp(context: Context): File {
        val apkPath = context.applicationInfo.sourceDir
        val dst = File(context.filesDir, "qnn-adsplib")
        dst.mkdirs()
        var count = 0
        try {
            java.util.zip.ZipFile(apkPath).use { zip ->
                val entries = zip.entries()
                while (entries.hasMoreElements()) {
                    val entry = entries.nextElement()
                    if (!entry.isDirectory) {
                        val name = entry.name.substringAfterLast('/')
                        if (entry.name.startsWith("lib/arm64-v8a/") &&
                            name.startsWith("libQnn")
                        ) {
                            val outFile = File(dst, name)
                            if (!outFile.exists() || outFile.length() != entry.size) {
                                zip.getInputStream(entry).use { input ->
                                    outFile.outputStream().use { output ->
                                        input.copyTo(output)
                                    }
                                }
                                Log.i(TAG, "[QNN-stage] $name (${entry.size} bytes)")
                            }
                            count++
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "[QNN-stage] Failed to extract from $apkPath", e)
        }
        Log.i(TAG, "[QNN-stage] $count libs staged in ${dst.absolutePath}")
        return dst
    }

    /**
     * Preload every QNN runtime lib into the process via System.loadLibrary.
     *
     * Android linker namespaces can reject sherpa's absolute-path dlopen even
     * for our own nativeLibraryDir; loading them here first makes the soname
     * resolvable when sherpa's patched dlopen falls back to the basename.
     * Safe to call repeatedly (loadLibrary is idempotent per process).
     */
    fun preloadQnnRuntime() {
        for (lib in listOf("QnnHtp", "QnnSystem", "QnnHtpV81Stub")) {
            try {
                System.loadLibrary(lib)
                Log.i(TAG, "[QNN-preload] $lib loaded")
            } catch (e: UnsatisfiedLinkError) {
                Log.w(TAG, "[QNN-preload] $lib failed: ${e.message}")
            }
        }
    }

    /**
     * Check whether a model directory contains QNN artifacts:
     * either encoder/decoder context binaries (.bin) or .so model libraries.
     */
    fun hasQnnArtifacts(modelDir: File): Boolean {
        if (!modelDir.isDirectory) return false

        // Context binaries: exactly encoder.bin/decoder.bin expected by sherpa
        val binPair = File(modelDir, "qnn/encoder.bin").let { enc ->
            enc.exists() && File(modelDir, "qnn/decoder.bin").exists()
        }
        // .so style: portable across Snapdragon SoCs
        val soPair = File(modelDir, "qnn/encoder.so").let { enc ->
            enc.exists() && File(modelDir, "qnn/decoder.so").exists()
        }
        return binPair || soPair
    }

    /**
     * SenseVoice QNN uses a single context binary (model.bin) published
     * per-SoC in sherpa's asr-models-qnn-binary release.
     */
    fun hasSenseVoiceQnnBinary(senseVoiceDir: File): Boolean =
        File(senseVoiceDir, "qnn/model.bin").exists()

    /**
     * Full QNN capability report for status/UI exposure.
     */
    data class QnnCapability(
        val socManufacturer: String,
        val socModel: String,
        val boardPlatform: String,
        val htpVersion: String?,
        val runtimeAvailable: Boolean,
        /** SoC has a known HTP mapping and QNN runtime libs are loadable */
        val deviceCapable: Boolean,
        /** Human-readable explanation of exactly which gate failed ("ok" if all pass) */
        val reason: String
    )

    fun getQnnCapability(): QnnCapability {
        val soc = getSocInfo()
        val runtime = isQnnRuntimeAvailable()

        Log.i(TAG, "=== QNN capability check ===")
        Log.i(
            TAG,
            "[QNN 1/3] SoC detected: manufacturer='${soc.manufacturer}' " +
                "model='${soc.model}' board='${soc.boardPlatform}'"
        )
        Log.i(
            TAG,
            if (soc.htpVersion != null) "[QNN 2/3] HTP mapping found: ${soc.model} -> ${soc.htpVersion}"
            else "[QNN 2/3] FAIL: no HTP mapping for '${soc.model}' - add it to HTP_MAP in ComputeBackendManager.kt"
        )
        Log.i(
            TAG,
            if (runtime) "[QNN 3/3] QNN runtime libs bundled"
            else "[QNN 3/3] FAIL: QNN SDK libs not in APK. Fix: copy libQnnHtp.so, " +
                "libQnnSystem.so, libQnnHtpPrepare.so, libQnnHtpV${soc.htpVersion?.removePrefix("v") ?: "XX"}Stub.so, " +
                "libQnnHtpV${soc.htpVersion?.removePrefix("v") ?: "XX"}Skel.so from the Qualcomm QNN SDK into " +
                "android/app/libs/qnn/arm64-v8a/ and rebuild"
        )

        val reason = when {
            soc.htpVersion == null ->
                "SoC '${soc.model}' not in HTP_MAP"
            !runtime ->
                "Qualcomm QNN runtime libs are not bundled in this APK"
            else -> "ok"
        }
        val capable = soc.htpVersion != null && runtime
        Log.i(TAG, "[QNN result] capable=$capable reason=$reason")

        return QnnCapability(
            socManufacturer = soc.manufacturer,
            socModel = soc.model,
            boardPlatform = soc.boardPlatform,
            htpVersion = soc.htpVersion,
            runtimeAvailable = runtime,
            deviceCapable = capable,
            reason = reason
        )
    }

    /**
     * Full QNN capability gate for a model directory.
     * QNN requires ALL of:
     * device is Qualcomm + known HTP + runtime libs loadable + QNN artifacts present.
     *
     * @param modelDir e.g. filesDir/models/sensevoice or filesDir/models/whisper
     */
    fun isQnnCapable(modelDir: File): Boolean {
        val soc = getSocInfo()
        val artifacts = hasSenseVoiceQnnBinary(modelDir) || hasQnnArtifacts(modelDir)
        val capable = soc.htpVersion != null &&
            isQnnRuntimeAvailable() &&
            artifacts
        Log.i(
            TAG,
            "QNN capable=$capable (soc=${soc.manufacturer}/${soc.model}, " +
                "htp=${soc.htpVersion}, runtime=${isQnnRuntimeAvailable()}, " +
                "artifacts=$artifacts)"
        )
        return capable
    }

    /**
     * Get the cached best ONNX execution provider for a key
     * (model id + device), or null if never benchmarked.
     */
    fun getCachedBestProvider(context: Context, cacheKey: String): JSONObject? {
        return try {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val raw = prefs.getString(key(cacheKey), null) ?: return null
            JSONObject(raw)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read cached provider", e)
            null
        }
    }

    /**
     * Persist benchmark results for a cache key.
     */
    fun cacheBenchmarkResult(
        context: Context,
        cacheKey: String,
        provider: String,
        cpuMs: Long?,
        xnnpackMs: Long?,
        nnapiMs: Long?
    ) {
        try {
            val json = JSONObject().apply {
                put("provider", provider)
                put("cpuMs", cpuMs ?: -1)
                put("xnnpackMs", xnnpackMs ?: -1)
                put("nnapiMs", nnapiMs ?: -1)
                put("ts", System.currentTimeMillis())
                put("engine", ENGINE_VERSION)
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(key(cacheKey), json.toString())
                .apply()
            Log.i(TAG, "Cached benchmark for $cacheKey: $json")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to cache benchmark result", e)
        }
    }

    /**
     * Invalidate cached results (e.g., user forces re-benchmark).
     */
    fun clearCache(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().clear().apply()
    }

    private fun key(cacheKey: String): String =
        "$ENGINE_VERSION|$cacheKey|${getSocInfo().model}"
}
