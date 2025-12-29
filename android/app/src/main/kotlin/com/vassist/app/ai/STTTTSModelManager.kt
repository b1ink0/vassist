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
 * STTTTSModelManager - Manages STT (Whisper) and TTS (VITS) model downloads
 * 
 * Downloads and extracts tar.bz2 archives from sherpa-onnx releases:
 * - Whisper tiny.en int8: 3 files (encoder, decoder, tokens) - 113MB
 * - VITS-VCTK: 3 files (model, tokens, lexicon) - 30MB
 */
class STTTTSModelManager(private val context: Context) {
    
    companion object {
        private const val TAG = "STTTTSModelManager"
        private const val WHISPER_DIR = "models/whisper"
        private const val VITS_DIR = "models/vits"
        
        // Whisper tiny.en int8 model (113 MB archive)
        const val WHISPER_DOWNLOAD_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2"
        const val WHISPER_ENCODER = "tiny.en-encoder.int8.onnx"
        const val WHISPER_DECODER = "tiny.en-decoder.int8.onnx"
        const val WHISPER_TOKENS = "tiny.en-tokens.txt"
        
        // VITS-VCTK model (145 MB archive → ~152 MB extracted)
        const val VITS_DOWNLOAD_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-vctk.tar.bz2"
        
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
     * Check if Whisper model files exist
     */
    fun isWhisperModelDownloaded(): Boolean {
        val whisperDir = getWhisperDirectory()
        val encoder = File(whisperDir, WHISPER_ENCODER).exists()
        val decoder = File(whisperDir, WHISPER_DECODER).exists()
        val tokens = File(whisperDir, WHISPER_TOKENS).exists()
        return encoder && decoder && tokens
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
     * Download and extract Whisper tiny.en model
     * @param progressListener Progress callback (optional)
     * @return Map with success status and message/error
     */
    suspend fun downloadWhisperModel(
        progressListener: DownloadProgressListener? = null
    ): Map<String, Any> = withContext(Dispatchers.IO) {
        try {
            Log.i(TAG, "Downloading Whisper tiny.en model from: $WHISPER_DOWNLOAD_URL")
            
            val whisperDir = getWhisperDirectory()
            val tempFile = File(context.cacheDir, "whisper-tiny.en.tar.bz2")
            
            // Download archive
            progressListener?.onProgress(0, "Downloading Whisper model (113 MB)...")
            downloadFile(WHISPER_DOWNLOAD_URL, tempFile, progressListener, 0, 80)
            
            // Extract files
            progressListener?.onProgress(80, "Extracting Whisper model files...")
            extractTarBz2(tempFile, whisperDir, listOf(
                WHISPER_ENCODER,
                WHISPER_DECODER,
                WHISPER_TOKENS
            ), progressListener, 80, 100)
            
            // Cleanup temp file
            tempFile.delete()
            
            progressListener?.onProgress(100, "Whisper model ready")
            Log.i(TAG, "Whisper model downloaded successfully")
            
            mapOf(
                "success" to true,
                "model" to "whisper-tiny.en",
                "location" to whisperDir.absolutePath
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to download Whisper model", e)
            mapOf(
                "success" to false,
                "error" to (e.message ?: "Download failed")
            )
        }
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
            ), progressListener, 80, 100)
            
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
     * For VITS model, also handles file renaming from archive to expected names
     */
    private suspend fun extractTarBz2(
        archiveFile: File,
        destDir: File,
        targetFiles: List<String>,
        progressListener: DownloadProgressListener?,
        progressStart: Int,
        progressEnd: Int
    ) = withContext(Dispatchers.IO) {
        if (!destDir.exists()) {
            destDir.mkdirs()
        }
        
        val foundFiles = mutableSetOf<String>()
        
        // Mapping from archive filenames to target filenames (for VITS model)
        val fileRenameMap = mapOf(
            "tokens.txt" to VITS_TOKENS,           // tokens.txt → tokens-vctk.txt
            "lexicon.txt" to VITS_LEXICON,         // lexicon.txt → lexicon-vctk.txt
            "vits-vctk.onnx" to VITS_MODEL         // vits-vctk.onnx → vits-vctk.onnx (no change)
        )
        
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
     * Delete Whisper model files
     */
    fun deleteWhisperModel(): Boolean {
        val whisperDir = getWhisperDirectory()
        var success = true
        
        listOf(WHISPER_ENCODER, WHISPER_DECODER, WHISPER_TOKENS).forEach { filename ->
            val file = File(whisperDir, filename)
            if (file.exists() && !file.delete()) {
                success = false
                Log.e(TAG, "Failed to delete: $filename")
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
     * Get model status information
     */
    fun getModelStatus(): Map<String, Any> {
        val whisperDir = getWhisperDirectory()
        val vitsDir = getVitsDirectory()
        
        val whisperSize = listOf(WHISPER_ENCODER, WHISPER_DECODER, WHISPER_TOKENS)
            .mapNotNull { File(whisperDir, it).takeIf { f -> f.exists() }?.length() }
            .sum()
        
        val vitsSize = listOf(VITS_MODEL, VITS_TOKENS, VITS_LEXICON)
            .mapNotNull { File(vitsDir, it).takeIf { f -> f.exists() }?.length() }
            .sum()
        
        return mapOf(
            "whisper" to mapOf(
                "downloaded" to isWhisperModelDownloaded(),
                "size" to whisperSize,
                "location" to whisperDir.absolutePath
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
