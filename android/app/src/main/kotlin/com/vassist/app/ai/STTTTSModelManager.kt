package com.vassist.app.ai

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * A downloadable Whisper model variant for on-device STT.
 *
 * @param id Variant identifier used across bridge/UI/server ("tiny.en", "tiny", ...)
 * @param displayName Human-readable name
 * @param downloadUrl sherpa-onnx release archive
 * @param encoder Encoder ONNX filename inside the whisper models dir
 * @param decoder Decoder ONNX filename inside the whisper models dir
 * @param tokens Tokens filename inside the whisper models dir
 * @param multilingual Whether the model supports non-English languages (zh, ja, ...)
 * @param approxDownloadSize Approximate archive size for UI display
 */
data class WhisperVariant(
    val id: String,
    val displayName: String,
    val downloadUrl: String,
    val encoder: String,
    val decoder: String,
    val tokens: String,
    val multilingual: Boolean,
    val approxDownloadSize: String
) {
    val fileNames: List<String> get() = listOf(encoder, decoder, tokens)
}

/**
 * A downloadable Dolphin CTC model variant (multilingual Eastern languages).
 */
data class DolphinVariant(
    val id: String,
    val displayName: String,
    val downloadUrl: String,
    val approxDownloadSize: String
) {
    /** Files extracted into models/<id>/ (archive names match on-device names). */
    val fileNames: List<String> get() = listOf("model.int8.onnx", "tokens.txt")
}

/**
 * STTTTSModelManager - Manages STT (Whisper) and TTS (VITS) model downloads
 *
 * Downloads and extracts tar.bz2 archives from sherpa-onnx releases:
 * - Whisper variants (tiny.en / tiny / base.en / base): 3 files each
 *   (multilingual "tiny"/"base" support zh/ja + 97 other languages)
 * - VITS-VCTK: 3 files (model, tokens, lexicon)
 */
class STTTTSModelManager(private val context: Context) {

    companion object {
        private const val TAG = "STTTTSModelManager"
        private const val WHISPER_DIR = "models/whisper"
        private const val VITS_DIR = "models/vits"

        /** All selectable Whisper variants (user downloads only what they need). */
        val WHISPER_VARIANTS: Map<String, WhisperVariant> = listOf(
            WhisperVariant(
                id = "tiny.en",
                displayName = "Whisper Tiny.en",
                downloadUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2",
                encoder = "tiny.en-encoder.int8.onnx",
                decoder = "tiny.en-decoder.int8.onnx",
                tokens = "tiny.en-tokens.txt",
                multilingual = false,
                approxDownloadSize = "~113 MB"
            ),
            WhisperVariant(
                id = "tiny",
                displayName = "Whisper Tiny (Multilingual)",
                downloadUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2",
                encoder = "tiny-encoder.int8.onnx",
                decoder = "tiny-decoder.int8.onnx",
                tokens = "tiny-tokens.txt",
                multilingual = true,
                approxDownloadSize = "~110 MB"
            ),
            WhisperVariant(
                id = "base.en",
                displayName = "Whisper Base.en",
                downloadUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.en.tar.bz2",
                encoder = "base.en-encoder.int8.onnx",
                decoder = "base.en-decoder.int8.onnx",
                tokens = "base.en-tokens.txt",
                multilingual = false,
                approxDownloadSize = "~145 MB"
            ),
            WhisperVariant(
                id = "base",
                displayName = "Whisper Base (Multilingual)",
                downloadUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2",
                encoder = "base-encoder.int8.onnx",
                decoder = "base-decoder.int8.onnx",
                tokens = "base-tokens.txt",
                multilingual = true,
                approxDownloadSize = "~200 MB"
            )
        ).associateBy { it.id }

        /** Default variant used by legacy callers. */
        const val DEFAULT_WHISPER_VARIANT_ID = "tiny.en"

        fun getWhisperVariant(id: String?): WhisperVariant? =
            WHISPER_VARIANTS[id]

        // Legacy constants kept for backward compatibility (default tiny.en files)
        const val WHISPER_DOWNLOAD_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2"
        const val WHISPER_ENCODER = "tiny.en-encoder.int8.onnx"
        const val WHISPER_DECODER = "tiny.en-decoder.int8.onnx"
        const val WHISPER_TOKENS = "tiny.en-tokens.txt"

        // VITS-VCTK model (145 MB archive → ~152 MB extracted)
        const val VITS_DOWNLOAD_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-vctk.tar.bz2"

        // SenseVoice-small multilingual int8 (zh/en/ja/ko/yue) - ~230MB archive.
        // Faster and more accurate than whisper tiny/base for these languages;
        // also the best NPU (QNN) candidate since sherpa's QNN story is turnkey here.
        const val SENSEVOICE_DIR = "models/sensevoice"
        const val SENSEVOICE_ID = "sensevoice"
        const val SENSEVOICE_DOWNLOAD_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2"
        const val SENSEVOICE_MODEL = "model.int8.onnx"   // 228 MB
        const val SENSEVOICE_TOKENS = "tokens.txt"        // 308 KB

        /** Languages supported by SenseVoice (everything else falls back to auto). */
        val SENSEVOICE_LANGUAGES = setOf("zh", "en", "ja", "ko", "yue")

        // SenseVoice QNN (Qualcomm NPU) context binary, published per-SoC in
        // sherpa's asr-models-qnn-binary release. Fixed 30-second input shapes;
        // ~100x realtime on SM8850 HTP (RTF ~0.009). Longer audio is split by
        // WhisperService before decoding.
        const val SENSEVOICE_QNN_DIR = "qnn"   // relative to SENSEVOICE_DIR
        const val SENSEVOICE_QNN_MODEL = "model.bin"
        const val SENSEVOICE_QNN_MAX_SECONDS = 30

        fun senseVoiceQnnDownloadUrl(socModel: String): String =
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models-qnn-binary/" +
                "sherpa-onnx-qnn-${socModel.uppercase()}-binary-30-seconds-" +
                "sense-voice-zh-en-ja-ko-yue-2024-07-17-int8.tar.bz2"

        // Dolphin CTC multilingual models (40 Eastern languages + 22 Chinese dialects).
        // CTC architecture - no language parameter, auto-detects per utterance.
        const val DOLPHIN_BASE_ID = "dolphin-base"
        const val DOLPHIN_SMALL_ID = "dolphin-small"
        val DOLPHIN_VARIANTS: Map<String, DolphinVariant> = listOf(
            DolphinVariant(
                id = DOLPHIN_BASE_ID,
                displayName = "Dolphin Base",
                downloadUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-dolphin-base-ctc-multi-lang-int8-2025-04-02.tar.bz2",
                approxDownloadSize = "~99 MB"
            ),
            DolphinVariant(
                id = DOLPHIN_SMALL_ID,
                displayName = "Dolphin Small",
                downloadUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-dolphin-small-ctc-multi-lang-int8-2025-04-02.tar.bz2",
                approxDownloadSize = "~239 MB"
            )
        ).associateBy { it.id }

        fun getDolphinVariant(id: String?): DolphinVariant? =
            DOLPHIN_VARIANTS[id?.trim()?.lowercase()?.removePrefix("whisper-")]
        
        // Expected filenames in VitsService (files are renamed during extraction)
        const val VITS_MODEL = "vits-vctk.onnx"       // 116MB
        const val VITS_TOKENS = "tokens-vctk.txt"     // 1.1KB
        const val VITS_LEXICON = "lexicon-vctk.txt"   // 36MB
    }
    
    /**
     * Progress callback for downloads
     */
    interface DownloadProgressListener {
        fun onProgress(percent: Int, status: String)
    }
    
    /**
     * Get the Whisper models directory
     */
    fun getWhisperDirectory(): File {
        val whisperDir = File(context.filesDir, WHISPER_DIR)
        if (!whisperDir.exists()) {
            whisperDir.mkdirs()
            Log.i(TAG, "Created Whisper directory: ${whisperDir.absolutePath}")
        }
        return whisperDir
    }
    
    /**
     * Get the VITS models directory
     */
    fun getVitsDirectory(): File {
        val vitsDir = File(context.filesDir, VITS_DIR)
        if (!vitsDir.exists()) {
            vitsDir.mkdirs()
            Log.i(TAG, "Created VITS directory: ${vitsDir.absolutePath}")
        }
        return vitsDir
    }
    
    /**
     * Get the SenseVoice models directory
     */
    fun getSenseVoiceDirectory(): File {
        val dir = File(context.filesDir, SENSEVOICE_DIR)
        if (!dir.exists()) {
            dir.mkdirs()
            Log.i(TAG, "Created SenseVoice directory: ${dir.absolutePath}")
        }
        return dir
    }

    /**
     * Check whether the SenseVoice model files exist
     */
    fun isSenseVoiceModelDownloaded(): Boolean {
        val dir = getSenseVoiceDirectory()
        return File(dir, SENSEVOICE_MODEL).exists() && File(dir, SENSEVOICE_TOKENS).exists()
    }

    /**
     * Check if a specific Whisper model variant's files exist
     */
    fun isWhisperModelDownloaded(variantId: String = DEFAULT_WHISPER_VARIANT_ID): Boolean {
        val variant = getWhisperVariant(variantId) ?: return false
        val whisperDir = getWhisperDirectory()
        return variant.fileNames.all { File(whisperDir, it).exists() }
    }

    /**
     * Get IDs of all downloaded Whisper variants
     */
    fun getDownloadedWhisperVariants(): List<String> =
        WHISPER_VARIANTS.keys.filter { isWhisperModelDownloaded(it) }

    /**
     * Resolve a requested model id (e.g. "whisper-local", "auto", "tiny", "base.en")
     * to a downloaded variant. Returns null if nothing suitable is downloaded.
     *
     * Preference order when falling back:
     *  - exact requested match, then
     *  - multilingual variants (smaller first) when language != "en"
     *  - any variant (smaller first) otherwise
     */
    fun resolveWhisperVariant(modelHint: String?, languageHint: String?): WhisperVariant? {
        val downloaded = getDownloadedWhisperVariants()
        if (downloaded.isEmpty()) return null

        val requested = modelHint?.trim()?.lowercase()?.removePrefix("whisper-")
        if (requested != null && requested != "local" && requested != "auto" && requested in downloaded) {
            return WHISPER_VARIANTS[requested]
        }

        val wantsMultilingual = !languageHint.isNullOrBlank() && languageHint.lowercase() != "en" && languageHint.lowercase() != "auto"
        val byPreference = WHISPER_VARIANTS.values.filter { it.id in downloaded }
        return if (wantsMultilingual) {
            byPreference.firstOrNull { it.multilingual } ?: byPreference.first()
        } else {
            byPreference.firstOrNull { !it.multilingual } ?: byPreference.first()
        }
    }
    
    /**
     * Check if VITS model files exist
     */
    fun isVitsModelDownloaded(): Boolean {
        val vitsDir = getVitsDirectory()
        val model = File(vitsDir, VITS_MODEL).exists()
        val tokens = File(vitsDir, VITS_TOKENS).exists()
        val lexicon = File(vitsDir, VITS_LEXICON).exists()
        return model && tokens && lexicon
    }
    
    /**
     * Download and extract a Whisper model variant
     * @param variantId One of [WhisperVariant.id] (defaults to tiny.en)
     * @param progressListener Progress callback (optional)
     * @return Map with success status and message/error
     */
    suspend fun downloadWhisperModel(
        variantId: String = DEFAULT_WHISPER_VARIANT_ID,
        progressListener: DownloadProgressListener? = null
    ): Map<String, Any> = withContext(Dispatchers.IO) {
        try {
            val variant = getWhisperVariant(variantId)
                ?: return@withContext mapOf(
                    "success" to false,
                    "error" to "Unknown Whisper model variant: $variantId"
                )

            Log.i(TAG, "Downloading Whisper ${variant.id} model from: ${variant.downloadUrl}")

            val whisperDir = getWhisperDirectory()
            val tempFile = File(context.cacheDir, "whisper-${variant.id}.tar.bz2")

            // Download archive
            progressListener?.onProgress(0, "Downloading Whisper ${variant.displayName} (${variant.approxDownloadSize})...")
            downloadFile(variant.downloadUrl, tempFile, progressListener, 0, 80)

            // Extract files
            progressListener?.onProgress(80, "Extracting Whisper model files...")
            extractTarBz2(tempFile, whisperDir, variant.fileNames, progressListener, 80, 100)

            // Cleanup temp file
            tempFile.delete()

            progressListener?.onProgress(100, "Whisper ${variant.displayName} ready")
            Log.i(TAG, "Whisper ${variant.id} model downloaded successfully")

            mapOf(
                "success" to true,
                "model" to "whisper-${variant.id}",
                "location" to whisperDir.absolutePath
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download Whisper $variantId model", e)
            mapOf(
                "success" to false,
                "error" to (e.message ?: "Download failed")
            )
        }
    }
    
    /**
     * Resolve a requested model id (e.g. "whisper-local", "auto", "tiny", "base.en",
     * "sensevoice") to a downloaded STT engine.
     *
     * @return Pair of engine id ("whisper" | "sensevoice" | null) and the whisper
     *         variant (null for sensevoice). Null engine means nothing downloaded,
     *         or the explicitly requested engine is not downloaded.
     */
    fun resolveSttEngine(
        modelHint: String?,
        languageHint: String?
    ): Pair<String?, WhisperVariant?> {
        val normalized = modelHint?.trim()?.lowercase()
            ?.removePrefix("whisper-")?.replace("_", "-")

        // Explicit SenseVoice selection: honor it strictly
        if (normalized == SENSEVOICE_ID || normalized == "sense-voice") {
            return if (isSenseVoiceModelDownloaded()) SENSEVOICE_ID to null else null to null
        }

        // Explicit Dolphin selection: honor it strictly
        val dolphinId = when {
            normalized in DOLPHIN_VARIANTS.keys -> normalized
            normalized == "dolphin" -> DOLPHIN_BASE_ID
            else -> null
        }
        if (dolphinId != null) {
            return if (isDolphinModelDownloaded(dolphinId)) dolphinId to null else null to null
        }

        // Auto: prefer whisper, then SenseVoice, then Dolphin
        if (normalized == null || normalized == "auto" || normalized == "local") {
            resolveWhisperVariant(modelHint, languageHint)?.let { "whisper" to it }
                ?.let { return it }
            if (isSenseVoiceModelDownloaded()) return SENSEVOICE_ID to null
            DOLPHIN_VARIANTS.keys.firstOrNull { isDolphinModelDownloaded(it) }
                ?.let { return it to null }
            return null to null
        }

        // Otherwise treat as a whisper variant request
        val variant = resolveWhisperVariant(normalized, languageHint)
        return if (variant != null) "whisper" to variant else null to null
    }

    /**
     * Download and extract the SenseVoice-small multilingual model
     * @param progressListener Progress callback (optional)
     * @return Map with success status and message/error
     */
    suspend fun downloadSenseVoiceModel(
        progressListener: DownloadProgressListener? = null
    ): Map<String, Any> = withContext(Dispatchers.IO) {
        try {
            Log.i(TAG, "Downloading SenseVoice model from: $SENSEVOICE_DOWNLOAD_URL")

            val dir = getSenseVoiceDirectory()
            val tempFile = File(context.cacheDir, "sensevoice.tar.bz2")

            // Remove leftovers from older failed attempts (tokens.txt was
            // previously mis-renamed to tokens-vctk.txt by the shared extractor)
            File(dir, "tokens-vctk.txt").delete()

            progressListener?.onProgress(0, "Downloading SenseVoice model (~230 MB)...")
            downloadFile(SENSEVOICE_DOWNLOAD_URL, tempFile, progressListener, 0, 80)

            progressListener?.onProgress(80, "Extracting SenseVoice model files...")
            extractTarBz2(tempFile, dir, listOf(
                SENSEVOICE_MODEL,
                SENSEVOICE_TOKENS
            ), progressListener, 80, 100)

            tempFile.delete()

            progressListener?.onProgress(100, "SenseVoice model ready")
            Log.i(TAG, "SenseVoice model downloaded successfully")

            mapOf(
                "success" to true,
                "model" to SENSEVOICE_ID,
                "location" to dir.absolutePath
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download SenseVoice model", e)
            mapOf(
                "success" to false,
                "error" to (e.message ?: "Download failed")
            )
        }
    }

    /**
     * Get the directory for a Dolphin variant
     */
    fun getDolphinDirectory(variantId: String): File {
        val dir = File(context.filesDir, "models/$variantId")
        if (!dir.exists()) {
            dir.mkdirs()
            Log.i(TAG, "Created Dolphin directory: ${dir.absolutePath}")
        }
        return dir
    }

    /**
     * Check whether a Dolphin variant's files exist
     */
    fun isDolphinModelDownloaded(variantId: String): Boolean {
        val variant = getDolphinVariant(variantId) ?: return false
        val dir = getDolphinDirectory(variant.id)
        return variant.fileNames.all { File(dir, it).exists() }
    }

    /**
     * Download and extract a Dolphin CTC model
     * @param variantId "dolphin-base" or "dolphin-small"
     */
    suspend fun downloadDolphinModel(
        variantId: String,
        progressListener: DownloadProgressListener? = null
    ): Map<String, Any> = withContext(Dispatchers.IO) {
        try {
            val variant = getDolphinVariant(variantId)
                ?: return@withContext mapOf(
                    "success" to false,
                    "error" to "Unknown Dolphin model variant: $variantId"
                )

            Log.i(TAG, "Downloading ${variant.displayName} from: ${variant.downloadUrl}")

            val dir = getDolphinDirectory(variant.id)
            val tempFile = File(context.cacheDir, "${variant.id}.tar.bz2")

            progressListener?.onProgress(0, "Downloading ${variant.displayName} (${variant.approxDownloadSize})...")
            downloadFile(variant.downloadUrl, tempFile, progressListener, 0, 80)

            progressListener?.onProgress(80, "Extracting ${variant.displayName} files...")
            extractTarBz2(tempFile, dir, variant.fileNames, progressListener, 80, 100)

            tempFile.delete()

            progressListener?.onProgress(100, "${variant.displayName} ready")
            Log.i(TAG, "${variant.displayName} downloaded successfully")

            mapOf(
                "success" to true,
                "model" to variant.id,
                "location" to dir.absolutePath
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download Dolphin $variantId model", e)
            mapOf(
                "success" to false,
                "error" to (e.message ?: "Download failed")
            )
        }
    }

    /**
     * Delete a Dolphin variant's files
     */
    fun deleteDolphinModel(variantId: String): Boolean {
        val variant = getDolphinVariant(variantId) ?: return false
        val dir = getDolphinDirectory(variant.id)
        var success = true

        variant.fileNames.forEach { filename ->
            val file = File(dir, filename)
            if (file.exists() && !file.delete()) {
                success = false
                Log.e(TAG, "Failed to delete: $filename")
            }
        }

        return success
    }

    /**
     * Check whether the SenseVoice QNN (NPU) context binary is downloaded
     */
    fun isSenseVoiceQnnDownloaded(): Boolean =
        File(getSenseVoiceDirectory(), "$SENSEVOICE_QNN_DIR/$SENSEVOICE_QNN_MODEL").exists()

    /**
     * Download the per-SoC SenseVoice QNN context binary for Qualcomm NPU.
     * Requires a Snapdragon SoC with a known HTP version (e.g. SM8850).
     */
    suspend fun downloadSenseVoiceQnnModel(
        progressListener: DownloadProgressListener? = null
    ): Map<String, Any> = withContext(Dispatchers.IO) {
        try {
            val soc = ComputeBackendManager.getSocInfo()
            if (soc.htpVersion == null || soc.model == "unknown") {
                return@withContext mapOf(
                    "success" to false,
                    "error" to "No known QNN package for this device (SoC: ${soc.model}). " +
                        "Supported: SM8850/8750/8650/8550 and similar."
                )
            }

            val url = senseVoiceQnnDownloadUrl(soc.model)
            Log.i(TAG, "Downloading SenseVoice QNN ($soc.model) from: $url")

            val qnnDir = File(getSenseVoiceDirectory(), SENSEVOICE_QNN_DIR)
            if (!qnnDir.exists()) qnnDir.mkdirs()
            val tempFile = File(context.cacheDir, "sensevoice-qnn.tar.bz2")

            progressListener?.onProgress(0, "Downloading SenseVoice NPU model (~240 MB)...")
            downloadFile(url, tempFile, progressListener, 0, 80)

            progressListener?.onProgress(80, "Extracting SenseVoice NPU model...")
            extractTarBz2(tempFile, qnnDir, listOf(
                SENSEVOICE_QNN_MODEL,
                "tokens.txt",
                "info.txt"
            ), progressListener, 80, 100)

            tempFile.delete()

            progressListener?.onProgress(100, "SenseVoice NPU model ready")
            Log.i(TAG, "SenseVoice QNN model downloaded successfully")

            mapOf(
                "success" to true,
                "model" to "sensevoice-qnn",
                "location" to qnnDir.absolutePath
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download SenseVoice QNN model", e)
            mapOf(
                "success" to false,
                "error" to (e.message ?: "Download failed")
            )
        }
    }

    /**
     * Delete the SenseVoice QNN context binary
     */
    fun deleteSenseVoiceQnnModel(): Boolean {
        val qnnDir = File(getSenseVoiceDirectory(), SENSEVOICE_QNN_DIR)
        var success = true

        listOf(SENSEVOICE_QNN_MODEL, "tokens.txt", "info.txt").forEach { filename ->
            val file = File(qnnDir, filename)
            if (file.exists() && !file.delete()) {
                success = false
                Log.e(TAG, "Failed to delete: $filename")
            }
        }

        return success
    }

    /**
     * Download and extract VITS-VCTK model
     * @param progressListener Progress callback (optional)
     * @return Map with success status and message/error
     */
    suspend fun downloadVitsModel(
        progressListener: DownloadProgressListener? = null
    ): Map<String, Any> = withContext(Dispatchers.IO) {
        try {
            Log.i(TAG, "Downloading VITS-VCTK model from: $VITS_DOWNLOAD_URL")
            
            val vitsDir = getVitsDirectory()
            val tempFile = File(context.cacheDir, "vits-vctk.tar.bz2")
            
            // Download archive
            progressListener?.onProgress(0, "Downloading VITS model (145 MB)...")
            downloadFile(VITS_DOWNLOAD_URL, tempFile, progressListener, 0, 80)
            
            // Extract files
            progressListener?.onProgress(80, "Extracting VITS model files...")
            extractTarBz2(tempFile, vitsDir, listOf(
                VITS_MODEL,
                VITS_TOKENS,
                VITS_LEXICON
            ), progressListener, 80, 100, fileRenameMap = mapOf(
                "tokens.txt" to VITS_TOKENS,           // tokens.txt → tokens-vctk.txt
                "lexicon.txt" to VITS_LEXICON,         // lexicon.txt → lexicon-vctk.txt
                "vits-vctk.onnx" to VITS_MODEL         // vits-vctk.onnx (no change)
            ))
            
            // Cleanup temp file
            tempFile.delete()
            
            progressListener?.onProgress(100, "VITS model ready")
            Log.i(TAG, "VITS model downloaded successfully")
            
            mapOf(
                "success" to true,
                "model" to "vits-vctk",
                "location" to vitsDir.absolutePath,
                "speakers" to 109
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download VITS model", e)
            mapOf(
                "success" to false,
                "error" to (e.message ?: "Download failed")
            )
        }
    }
    
    /**
     * Download file from URL with progress tracking
     */
    private suspend fun downloadFile(
        url: String,
        destFile: File,
        progressListener: DownloadProgressListener?,
        progressStart: Int,
        progressEnd: Int
    ): Unit = withContext(Dispatchers.IO) {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.setRequestProperty("User-Agent", "Mozilla/5.0")
        connection.connectTimeout = 30000
        connection.readTimeout = 30000
        
        // Handle redirects
        if (connection.responseCode in listOf(
            HttpURLConnection.HTTP_MOVED_PERM,
            HttpURLConnection.HTTP_MOVED_TEMP,
            HttpURLConnection.HTTP_SEE_OTHER
        )) {
            val redirectUrl = connection.getHeaderField("Location")
            connection.disconnect()
            return@withContext downloadFile(redirectUrl, destFile, progressListener, progressStart, progressEnd)
        }
        
        val totalSize = connection.contentLength.toLong()
        var downloadedSize = 0L
        var lastReportedPercent = progressStart
        
        connection.inputStream.use { input ->
            FileOutputStream(destFile).use { output ->
                val buffer = ByteArray(8192)
                var bytesRead: Int
                
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    output.write(buffer, 0, bytesRead)
                    downloadedSize += bytesRead
                    
                    val downloadPercent = (downloadedSize.toDouble() / totalSize * (progressEnd - progressStart)).toInt()
                    val currentPercent = progressStart + downloadPercent
                    
                    if (currentPercent != lastReportedPercent) {
                        val downloadedMB = downloadedSize / (1024 * 1024)
                        val totalMB = totalSize / (1024 * 1024)
                        progressListener?.onProgress(
                            currentPercent,
                            "Downloaded ${downloadedMB}MB / ${totalMB}MB"
                        )
                        lastReportedPercent = currentPercent
                    }
                }
            }
        }
        
        connection.disconnect()
    }
    
    /**
     * Extract specific files from tar.bz2 archive
     * @param fileRenameMap Optional mapping from archive filenames to target
     *        filenames (used by the VITS model whose archive names differ from
     *        the expected on-device names)
     */
    private suspend fun extractTarBz2(
        archiveFile: File,
        destDir: File,
        targetFiles: List<String>,
        progressListener: DownloadProgressListener?,
        progressStart: Int,
        progressEnd: Int,
        fileRenameMap: Map<String, String> = emptyMap()
    ) = withContext(Dispatchers.IO) {
        if (!destDir.exists()) {
            destDir.mkdirs()
        }

        val foundFiles = mutableSetOf<String>()
        
        BufferedInputStream(archiveFile.inputStream()).use { fileStream ->
            BZip2CompressorInputStream(fileStream).use { bz2Stream ->
                TarArchiveInputStream(bz2Stream).use { tarStream ->
                    var entry = tarStream.nextEntry
                    var filesExtracted = 0
                    
                    while (entry != null) {
                        val entryName = entry.name.substringAfterLast("/")
                        
                        // Check if this is one of our target files (checking both original and renamed)
                        val shouldExtract = targetFiles.contains(entryName) || fileRenameMap.containsKey(entryName)
                        
                        if (shouldExtract && !entry.isDirectory) {
                            // Use renamed filename if mapping exists, otherwise use original
                            val outputFileName = fileRenameMap[entryName] ?: entryName
                            val destFile = File(destDir, outputFileName)
                            
                            FileOutputStream(destFile).use { output ->
                                tarStream.copyTo(output)
                            }
                            
                            foundFiles.add(outputFileName)
                            filesExtracted++
                            
                            val extractPercent = (filesExtracted.toDouble() / targetFiles.size * (progressEnd - progressStart)).toInt()
                            progressListener?.onProgress(
                                progressStart + extractPercent,
                                "Extracted $outputFileName"
                            )
                            
                            Log.i(TAG, "Extracted: $entryName → $outputFileName at ${destFile.absolutePath}")
                        }
                        
                        entry = tarStream.nextEntry
                    }
                }
            }
        }
        
        // Verify all files were extracted
        val missingFiles = targetFiles - foundFiles
        if (missingFiles.isNotEmpty()) {
            throw Exception("Missing files in archive: ${missingFiles.joinToString()}")
        }
    }
    
    /**
     * Delete a specific Whisper model variant's files.
     * @param variantId Variant id, or null to delete all downloaded variants
     */
    fun deleteWhisperModel(variantId: String? = null): Boolean {
        val whisperDir = getWhisperDirectory()
        val variantIds = if (variantId != null) listOf(variantId) else WHISPER_VARIANTS.keys.toList()
        var success = true

        for (id in variantIds) {
            val variant = getWhisperVariant(id) ?: continue
            variant.fileNames.forEach { filename ->
                val file = File(whisperDir, filename)
                if (file.exists() && !file.delete()) {
                    success = false
                    Log.e(TAG, "Failed to delete: $filename")
                }
            }
        }

        return success
    }
    
    /**
     * Delete VITS model files
     */
    fun deleteVitsModel(): Boolean {
        val vitsDir = getVitsDirectory()
        var success = true
        
        listOf(VITS_MODEL, VITS_TOKENS, VITS_LEXICON).forEach { filename ->
            val file = File(vitsDir, filename)
            if (file.exists() && !file.delete()) {
                success = false
                Log.e(TAG, "Failed to delete: $filename")
            }
        }
        
        return success
    }
    
    /**
     * Delete SenseVoice model files
     */
    fun deleteSenseVoiceModel(): Boolean {
        val dir = getSenseVoiceDirectory()
        var success = true

        listOf(SENSEVOICE_MODEL, SENSEVOICE_TOKENS).forEach { filename ->
            val file = File(dir, filename)
            if (file.exists() && !file.delete()) {
                success = false
                Log.e(TAG, "Failed to delete: $filename")
            }
        }

        return success
    }

    /**
     * Get model status information
     */
    fun getModelStatus(): Map<String, Any> {
        val whisperDir = getWhisperDirectory()
        val vitsDir = getVitsDirectory()

        val variantsStatus = WHISPER_VARIANTS.values.associate { variant ->
            val size = variant.fileNames
                .mapNotNull { File(whisperDir, it).takeIf { f -> f.exists() }?.length() }
                .sum()
            variant.id to mapOf(
                "downloaded" to (size > 0 && isWhisperModelDownloaded(variant.id)),
                "size" to size,
                "multilingual" to variant.multilingual,
                "displayName" to variant.displayName,
                "approxDownloadSize" to variant.approxDownloadSize
            )
        }

        val whisperTotalSize = variantsStatus.values
            .mapNotNull { (it["size"] as? Long) }
            .sum()

        val vitsSize = listOf(VITS_MODEL, VITS_TOKENS, VITS_LEXICON)
            .mapNotNull { File(vitsDir, it).takeIf { f -> f.exists() }?.length() }
            .sum()

        val senseVoiceSize = listOf(SENSEVOICE_MODEL, SENSEVOICE_TOKENS)
            .mapNotNull { File(getSenseVoiceDirectory(), it).takeIf { f -> f.exists() }?.length() }
            .sum()

        val dolphinStatus = DOLPHIN_VARIANTS.values.associate { variant ->
            val size = variant.fileNames
                .mapNotNull { File(getDolphinDirectory(variant.id), it).takeIf { f -> f.exists() }?.length() }
                .sum()
            variant.id to mapOf(
                "downloaded" to (size > 0 && isDolphinModelDownloaded(variant.id)),
                "size" to size,
                "displayName" to variant.displayName,
                "approxDownloadSize" to variant.approxDownloadSize
            )
        }

        return mapOf(
            "whisper" to mapOf(
                "downloaded" to getDownloadedWhisperVariants().isNotEmpty(),
                "size" to whisperTotalSize,
                "location" to whisperDir.absolutePath,
                "variants" to variantsStatus,
                "downloadedVariants" to getDownloadedWhisperVariants()
            ),
            "sensevoice" to mapOf(
                "downloaded" to isSenseVoiceModelDownloaded(),
                "size" to senseVoiceSize,
                "location" to getSenseVoiceDirectory().absolutePath,
                "qnnDownloaded" to isSenseVoiceQnnDownloaded()
            ),
            "dolphin" to mapOf(
                "downloaded" to dolphinStatus.values.any { it["downloaded"] == true },
                "variants" to dolphinStatus
            ),
            "vits" to mapOf(
                "downloaded" to isVitsModelDownloaded(),
                "size" to vitsSize,
                "location" to vitsDir.absolutePath,
                "speakers" to 109
            )
        )
    }
}
