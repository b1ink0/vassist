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
 * A downloadable TTS language pack for on-device synthesis via sherpa-onnx.
 *
 * @param id Pack identifier used across bridge/UI/server ("vits-vctk",
 *           "tts-en-kitten", "tts-ja-supertonic"). Also used as the
 *           STT/TTS progress-event `type` string - must stay unique
 *           across ALL packs (see docs/tts-en-jp-handoff README).
 * @param displayName Human-readable name
 * @param language Primary language code ("en", "ja")
 * @param languageTag BCP-47-ish tag forwarded to engines that need an
 *                    explicit language (Supertonic: extra["lang"])
 * @param engine sherpa-onnx model family: "vits-lexicon" | "kitten" | "supertonic"
 * @param dirName Directory under filesDir/models/ ("vits" for the legacy
 *                vits-vctk pack, "tts/<id>" for everything else)
 * @param files Flat files required after extraction (basenames)
 * @param dirs Directories required after extraction (e.g. espeak-ng-data),
 *             extracted recursively
 */
data class TtsPack(
    val id: String,
    val displayName: String,
    val language: String,
    val languageTag: String,
    val engine: String,
    val downloadUrl: String,
    val approxDownloadSize: String,
    val approxInstalledSize: String,
    val dirName: String,
    val files: List<String>,
    val dirs: List<String> = emptyList(),
    val supportsSpeakerId: Boolean,
    /** Known speaker count; 0 means "query at runtime" (tts.numSpeakers()) */
    val knownNumSpeakers: Int,
    val license: String
)

/**
 * TtsModelManager - Downloads/deletes/status for TTS language packs.
 *
 * Mirrors the Whisper/Dolphin variant handling in STTTTSModelManager but
 * lives separately because TTS archives need recursive directory extraction
 * (espeak-ng-data) and per-pack directories (filesDir/models/tts/<id>).
 *
 * The legacy vits-vctk pack stays in models/vits/ and its download/delete
 * flows through the pre-existing STTTTSModelManager methods; this class only
 * reads its status so the UI can treat every pack uniformly.
 */
class TtsModelManager(private val context: Context) {

    companion object {
        private const val TAG = "TtsModelManager"

        /** Legacy default pack - handled by STTTTSModelManager/VitsService legacy paths. */
        const val LEGACY_VCTK_ID = "vits-vctk"

        val PACK_VITS_VCTK = TtsPack(
            id = LEGACY_VCTK_ID,
            displayName = "VCTK (English, 109 voices)",
            language = "en",
            languageTag = "en",
            engine = "vits-lexicon",
            downloadUrl = STTTTSModelManager.VITS_DOWNLOAD_URL,
            approxDownloadSize = "~145 MB",
            approxInstalledSize = "~152 MB",
            dirName = "models/vits",
            files = listOf(
                STTTTSModelManager.VITS_MODEL,
                STTTTSModelManager.VITS_TOKENS,
                STTTTSModelManager.VITS_LEXICON
            ),
            supportsSpeakerId = true,
            knownNumSpeakers = 109,
            license = "CC-BY-SA-4.0 (VCTK data)"
        )

        // https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models
        // kitten-nano-en-v0_1-fp16: 25.6 MB archive -> ~41 MB installed
        // (23.8 MB fp16 onnx + 18 MB espeak-ng-data), 8 voices (4 male/4 female).
        val PACK_KITTEN_NANO = TtsPack(
            id = "tts-en-kitten",
            displayName = "Kitten Nano (English)",
            language = "en",
            languageTag = "en",
            engine = "kitten",
            downloadUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kitten-nano-en-v0_1-fp16.tar.bz2",
            approxDownloadSize = "~26 MB",
            approxInstalledSize = "~41 MB",
            dirName = "models/tts/tts-en-kitten",
            files = listOf("model.fp16.onnx", "tokens.txt", "voices.bin"),
            dirs = listOf("espeak-ng-data"),
            supportsSpeakerId = true,
            knownNumSpeakers = 8,
            license = "Apache-2.0"
        )

        // sherpa-onnx-supertonic-3-tts-int8-2026-05-11: 122.8 MB archive ->
        // ~139 MB installed, multi-speaker, 31 languages incl. Japanese.
        // The ONLY sherpa-compatible offline Japanese-capable model as of
        // 2026-08 (no piper-JA / mms-jpn / converted community VITS-JA exists).
        val PACK_SUPERTONIC3 = TtsPack(
            id = "tts-ja-supertonic",
            displayName = "Supertonic 3 (Japanese)",
            language = "ja",
            languageTag = "ja",
            engine = "supertonic",
            downloadUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2",
            approxDownloadSize = "~123 MB",
            approxInstalledSize = "~139 MB",
            dirName = "models/tts/tts-ja-supertonic",
            files = listOf(
                "duration_predictor.int8.onnx",
                "text_encoder.int8.onnx",
                "vector_estimator.int8.onnx",
                "vocoder.int8.onnx",
                "tts.json",
                "unicode_indexer.bin",
                "voice.bin"
            ),
            supportsSpeakerId = true,
            knownNumSpeakers = 10,  // measured on-device; runtime value still takes precedence
            license = "MIT (Supertone Inc.)"
        )

        val TTS_PACKS: Map<String, TtsPack> = listOf(
            PACK_VITS_VCTK,
            PACK_KITTEN_NANO,
            PACK_SUPERTONIC3
        ).associateBy { it.id }

        fun getTtsPack(id: String?): TtsPack? = TTS_PACKS[id]

        /**
         * Resolve a model-hint string (e.g. the OpenAI-style "model" field of
         * /v1/audio/speech) to a downloaded pack.
         *
         * - Exact registry id wins (only if downloaded).
         * - Null / "auto" / "local" / "vits-local" / unknown hints fall back
         *   to vits-vctk when present (preserves the historical default
         *   experience), otherwise to any other downloaded pack.
         *
         * @return the resolved pack, or null when nothing usable is downloaded.
         */
        fun resolveTtsPack(modelHint: String?, isDownloaded: (TtsPack) -> Boolean): TtsPack? {
            val normalized = modelHint?.trim()?.lowercase()

            if (normalized != null && normalized !in
                listOf("auto", "local", "vits", "vits-local", "vits-vctk")
            ) {
                val exact = TTS_PACKS[normalized]
                if (exact != null && isDownloaded(exact)) {
                    return exact
                }
            }

            // Fallback chain: legacy vctk first, then any other downloaded pack
            val legacy = TTS_PACKS[LEGACY_VCTK_ID]
            if (legacy != null && isDownloaded(legacy)) return legacy
            return TTS_PACKS.values.firstOrNull { it.id != LEGACY_VCTK_ID && isDownloaded(it) }
        }
    }

    interface DownloadProgressListener {
        fun onProgress(percent: Int, status: String)
    }

    /** Directory for a pack, created on demand. */
    fun getPackDirectory(pack: TtsPack): File {
        val dir = File(context.filesDir, pack.dirName)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    /**
     * Whether a pack's required files/dirs exist. For the legacy pack this
     * mirrors STTTTSModelManager.isVitsModelDownloaded() (flat filenames).
     */
    fun isPackDownloaded(pack: TtsPack): Boolean {
        val dir = getPackDirectory(pack)
        if (!dir.isDirectory) return false

        val filesOk = pack.files.all { File(dir, it).exists() }
        if (!filesOk) return false

        // Directories count as present when they contain at least one file
        return pack.dirs.all { d ->
            val sub = File(dir, d)
            sub.isDirectory && (sub.listFiles()?.isNotEmpty() == true)
        }
    }

    /** Total bytes on disk attributed to a pack (files + recursive dirs). */
    fun getPackSizeBytes(pack: TtsPack): Long {
        val dir = getPackDirectory(pack)
        var total = 0L
        pack.files.forEach { total += File(dir, it).takeIf { f -> f.exists() }?.length() ?: 0L }
        pack.dirs.forEach { total += sizeOfTree(File(dir, it)) }
        return total
    }

    private fun sizeOfTree(file: File): Long {
        if (!file.exists()) return 0L
        if (file.isFile) return file.length()
        return file.listFiles()?.sumOf { sizeOfTree(it) } ?: 0L
    }

    /**
     * Download a pack archive and extract ALL entries into the pack directory
     * (recursive - unlike the flat extractor in STTTTSModelManager - because
     * e.g. Kitten ships an espeak-ng-data/ directory tree).
     */
    suspend fun downloadPack(
        packId: String,
        progressListener: DownloadProgressListener? = null
    ): Map<String, Any> = withContext(Dispatchers.IO) {
        try {
            val pack = getTtsPack(packId)
                ?: return@withContext mapOf(
                    "success" to false,
                    "error" to "Unknown TTS pack: $packId"
                )

            if (pack.id == LEGACY_VCTK_ID) {
                return@withContext mapOf(
                    "success" to false,
                    "error" to "Use downloadVitsModel for the legacy $LEGACY_VCTK_ID pack"
                )
            }

            Log.i(TAG, "Downloading TTS pack ${pack.id} from: ${pack.downloadUrl}")

            val dir = getPackDirectory(pack)
            val tempFile = File(context.cacheDir, "${pack.id}.tar.bz2")

            progressListener?.onProgress(
                0,
                "Downloading ${pack.displayName} (${pack.approxDownloadSize})..."
            )
            downloadFile(pack.downloadUrl, tempFile, progressListener, 0, 80)

            progressListener?.onProgress(80, "Extracting ${pack.displayName}...")
            extractTarBz2All(tempFile, dir, progressListener, 80, 100)

            tempFile.delete()

            if (!isPackDownloaded(pack)) {
                throw Exception("Extraction incomplete for ${pack.id}")
            }

            progressListener?.onProgress(100, "${pack.displayName} ready")
            Log.i(TAG, "TTS pack ${pack.id} downloaded successfully")

            mapOf(
                "success" to true,
                "model" to pack.id,
                "location" to dir.absolutePath
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download TTS pack $packId", e)
            mapOf(
                "success" to false,
                "error" to (e.message ?: "Download failed")
            )
        }
    }

    /** Delete a non-legacy pack's whole directory tree. */
    fun deletePack(packId: String): Boolean {
        val pack = getTtsPack(packId) ?: return false
        if (pack.id == LEGACY_VCTK_ID) {
            Log.w(TAG, "Use deleteVitsModel for the legacy $LEGACY_VCTK_ID pack")
            return false
        }
        val dir = getPackDirectory(pack)
        return deleteRecursively(dir)
    }

    private fun deleteRecursively(file: File): Boolean {
        if (!file.exists()) return true
        if (file.isFile) return file.delete()
        val children = file.listFiles() ?: return file.delete()
        var ok = children.all { deleteRecursively(it) }
        ok = file.delete() && ok
        return ok
    }

    /** Per-pack status consumed by the web UI via getSTTTTSStatus / /v1/models/status. */
    fun getPacksStatus(): Map<String, Any> =
        TTS_PACKS.values.associate { pack ->
            val downloaded = isPackDownloaded(pack)
            pack.id to mapOf(
                "downloaded" to downloaded,
                "size" to getPackSizeBytes(pack),
                "displayName" to pack.displayName,
                "language" to pack.language,
                "engine" to pack.engine,
                "approxDownloadSize" to pack.approxDownloadSize,
                "approxInstalledSize" to pack.approxInstalledSize,
                "supportsSpeakerId" to pack.supportsSpeakerId,
                "numSpeakers" to pack.knownNumSpeakers,
                "license" to pack.license,
                "location" to getPackDirectory(pack).absolutePath
            )
        }

    /**
     * Download file from URL with progress tracking (mirrors the helper in
     * STTTTSModelManager; kept local so shared STT code is never touched).
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

        if (connection.responseCode in listOf(
                HttpURLConnection.HTTP_MOVED_PERM,
                HttpURLConnection.HTTP_MOVED_TEMP,
                HttpURLConnection.HTTP_SEE_OTHER
            )
        ) {
            val redirectUrl = connection.getHeaderField("Location")
            connection.disconnect()
            return@withContext downloadFile(
                redirectUrl, destFile, progressListener, progressStart, progressEnd
            )
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

                    val downloadPercent =
                        (downloadedSize.toDouble() / totalSize.coerceAtLeast(1) * (progressEnd - progressStart)).toInt()
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
     * Extract every regular file from a tar.bz2 archive, stripping the single
     * root directory component and preserving nested directories.
     */
    private suspend fun extractTarBz2All(
        archiveFile: File,
        destDir: File,
        progressListener: DownloadProgressListener?,
        progressStart: Int,
        progressEnd: Int
    ) = withContext(Dispatchers.IO) {
        if (!destDir.exists()) {
            destDir.mkdirs()
        }

        // First pass: count entries for smooth progress reporting
        var totalEntries = 0
        BufferedInputStream(archiveFile.inputStream()).use { fileStream ->
            BZip2CompressorInputStream(fileStream).use { bz2Stream ->
                TarArchiveInputStream(bz2Stream).use { tarStream ->
                    while (tarStream.nextEntry != null) totalEntries++
                }
            }
        }

        var extracted = 0
        BufferedInputStream(archiveFile.inputStream()).use { fileStream ->
            BZip2CompressorInputStream(fileStream).use { bz2Stream ->
                TarArchiveInputStream(bz2Stream).use { tarStream ->
                    var entry = tarStream.nextEntry
                    while (entry != null) {
                        if (!entry.isDirectory) {
                            // Strip "<root-dir>/" prefix
                            val relative = entry.name.substringAfter('/')
                            if (relative.isNotBlank()) {
                                val outFile = File(destDir, relative)
                                outFile.parentFile?.mkdirs()
                                FileOutputStream(outFile).use { output ->
                                    tarStream.copyTo(output)
                                }
                                extracted++
                                if (totalEntries > 0 && extracted % 25 == 0) {
                                    val percent = progressStart +
                                        (extracted.toDouble() / totalEntries * (progressEnd - progressStart)).toInt()
                                    progressListener?.onProgress(percent, "Extracting ($extracted files)...")
                                    Log.d(TAG, "Extracted: ${entry.name}")
                                }
                            }
                        }
                        entry = tarStream.nextEntry
                    }
                }
            }
        }

        Log.i(TAG, "Extracted $extracted files to ${destDir.absolutePath}")
    }
}
