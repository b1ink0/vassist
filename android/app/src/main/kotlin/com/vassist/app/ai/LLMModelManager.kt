package com.vassist.app.ai

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Data classes for Ollama manifest parsing
 */
data class OllamaManifest(
    @SerializedName("layers") val layers: List<OllamaLayer>? = null
)

data class OllamaLayer(
    @SerializedName("digest") val digest: String,
    @SerializedName("size") val size: Long
)

/**
 * LLMModelManager - Manages LLM model files on Android
 * 
 * Provides functionality for:
 * - Listing installed GGUF models
 * - Downloading models from URLs (HuggingFace)
 * - Downloading models from Ollama registry
 * - Deleting models
 * - Managing model storage directory
 */
class LLMModelManager(private val context: Context) {
    
    companion object {
        private const val TAG = "LLMModelManager"
        private const val MODELS_DIR = "models/llm"
    }
    
    /**
     * Progress callback for downloads
     */
    interface DownloadProgressListener {
        fun onProgress(percent: Int, status: String)
    }
    
    /**
     * Get the models directory in external storage
     */
    fun getModelsDirectory(): File {
        val modelsDir = File(context.getExternalFilesDir(null), MODELS_DIR)
        if (!modelsDir.exists()) {
            modelsDir.mkdirs()
            Log.i(TAG, "Created models directory: ${modelsDir.absolutePath}")
        }
        return modelsDir
    }
    
    /**
     * List all installed GGUF models
     * @return List of model info maps with keys: name, size, modified
     */
    fun listModels(): List<Map<String, Any>> {
        val modelsDir = getModelsDirectory()
        
        val models = modelsDir.listFiles { file -> 
            file.extension.equals("gguf", ignoreCase = true) 
        }?.map { file ->
            mapOf(
                "name" to file.name,
                "size" to file.length(),
                "modified" to file.lastModified()
            )
        } ?: emptyList()
        
        Log.i(TAG, "Found ${models.size} models in ${modelsDir.absolutePath}")
        return models
    }
    
    /**
     * Download model from URL (e.g., HuggingFace)
     * @param url Direct download URL
     * @param progressListener Progress callback (optional)
     * @return Map with success status and filename/error
     */
    suspend fun downloadFromUrl(
        url: String, 
        progressListener: DownloadProgressListener? = null
    ): Map<String, Any> = withContext(Dispatchers.IO) {
        try {
            Log.i(TAG, "Downloading model from URL: $url")
            
            // Extract filename from URL
            var filename = url.substringAfterLast("/").substringBefore("?")
            
            if (!filename.endsWith(".gguf", ignoreCase = true)) {
                return@withContext mapOf(
                    "success" to false,
                    "error" to "Invalid file: must be a .gguf model file"
                )
            }
            
            val modelsDir = getModelsDirectory()
            val destFile = File(modelsDir, filename)
            
            // Download file
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            connection.connectTimeout = 30000
            connection.readTimeout = 30000
            
            // Handle redirects
            if (connection.responseCode == HttpURLConnection.HTTP_MOVED_PERM || 
                connection.responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                connection.responseCode == HttpURLConnection.HTTP_SEE_OTHER) {
                val redirectUrl = connection.getHeaderField("Location")
                connection.disconnect()
                return@withContext downloadFromUrl(redirectUrl, progressListener)
            }
            
            val totalSize = connection.contentLength.toLong()
            var downloadedSize = 0L
            var lastReportedPercent = 0
            
            connection.inputStream.use { input ->
                FileOutputStream(destFile).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        downloadedSize += bytesRead
                        
                        val percent = ((downloadedSize * 100) / totalSize).toInt()
                        if (percent != lastReportedPercent) {
                            val downloadedMB = downloadedSize / (1024 * 1024)
                            val totalMB = totalSize / (1024 * 1024)
                            progressListener?.onProgress(
                                percent,
                                "Downloading: ${downloadedMB}MB / ${totalMB}MB"
                            )
                            lastReportedPercent = percent
                        }
                    }
                }
            }
            
            connection.disconnect()
            
            progressListener?.onProgress(100, "Download complete: $filename")
            Log.i(TAG, "Successfully downloaded model: $filename")
            
            mapOf(
                "success" to true,
                "filename" to filename
            )
            
        } catch (e: Exception) {
            Log.e(TAG, "Download failed", e)
            mapOf(
                "success" to false,
                "error" to "Download failed: ${e.message}"
            )
        }
    }
    
    /**
     * Pull model from Ollama registry
     * @param modelName Ollama model name (e.g., "llama3.2:3b")
     * @param progressListener Progress callback (optional)
     * @return Map with success status and filename/error
     */
    suspend fun pullFromOllama(
        modelName: String,
        progressListener: DownloadProgressListener? = null
    ): Map<String, Any> = withContext(Dispatchers.IO) {
        try {
            Log.i(TAG, "Pulling model from Ollama registry: $modelName")
            
            val (model, tag) = if (modelName.contains(":")) {
                val parts = modelName.split(":")
                Pair(parts[0], parts[1])
            } else {
                Pair(modelName, "latest")
            }
            
            val namespace = if (model.contains("/")) model else "library/$model"
            
            progressListener?.onProgress(0, "Pulling manifest...")
            
            // Get manifest
            val manifestUrl = "https://registry.ollama.ai/v2/$namespace/manifests/$tag"
            val manifestConnection = URL(manifestUrl).openConnection() as HttpURLConnection
            manifestConnection.requestMethod = "GET"
            manifestConnection.setRequestProperty("Accept", "application/vnd.docker.distribution.manifest.v2+json")
            manifestConnection.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            manifestConnection.connectTimeout = 30000
            manifestConnection.readTimeout = 30000
            
            Log.d(TAG, "Fetching manifest from: $manifestUrl")
            
            if (manifestConnection.responseCode != 200) {
                val errorBody = try {
                    manifestConnection.errorStream?.bufferedReader()?.use { it.readText() }
                } catch (e: Exception) {
                    null
                }
                manifestConnection.disconnect()
                Log.e(TAG, "Manifest fetch failed: HTTP ${manifestConnection.responseCode}, Body: $errorBody")
                return@withContext mapOf(
                    "success" to false,
                    "error" to "Model not found: $modelName (HTTP ${manifestConnection.responseCode})"
                )
            }
            
            val manifestJson = manifestConnection.inputStream.bufferedReader().use { it.readText() }
            manifestConnection.disconnect()
            
            Log.d(TAG, "Manifest JSON (first 500 chars): ${manifestJson.take(500)}")
            
            // Parse layers using Gson
            val gson = Gson()
            val manifest = try {
                gson.fromJson(manifestJson, OllamaManifest::class.java)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse manifest JSON", e)
                return@withContext mapOf(
                    "success" to false,
                    "error" to "Failed to parse manifest: ${e.message}"
                )
            }
            
            val layers = manifest.layers?.filter { it.digest.startsWith("sha256:") } ?: emptyList()
            
            Log.i(TAG, "Found ${layers.size} layers in manifest")
            layers.forEachIndexed { index, layer ->
                Log.d(TAG, "Layer $index: ${layer.digest.substring(0, 19)}... (${layer.size / 1024 / 1024}MB)")
            }
            
            if (layers.isEmpty()) {
                return@withContext mapOf(
                    "success" to false,
                    "error" to "No layers found in manifest"
                )
            }
            
            progressListener?.onProgress(2, "Found ${layers.size} layers to download")
            
            val modelsDir = getModelsDirectory()
            val downloadedFiles = mutableListOf<Pair<File, Long>>()
            
            // Download each layer as separate file
            layers.forEachIndexed { index, layer ->
                try {
                    val blobUrl = "https://registry.ollama.ai/v2/$namespace/blobs/${layer.digest}"
                    val tempFileName = "${model.replace("/", "_")}-$tag-${layer.digest.substring(7, 19)}.tmp"
                    val tempFile = File(modelsDir, tempFileName)
                    
                    Log.i(TAG, "Downloading layer ${index + 1}/${layers.size} from: $blobUrl")
                    
                    progressListener?.onProgress(
                        2 + (index * 93 / layers.size),
                        "Starting layer ${index + 1}/${layers.size}..."
                    )
                    
                    val downloadedSize = downloadLayer(
                        blobUrl,
                        tempFile,
                        layer.size,
                        index + 1,
                        layers.size,
                        progressListener
                    )
                    
                    Log.i(TAG, "Downloaded layer ${index + 1}: ${tempFile.name} (${downloadedSize / 1024 / 1024}MB)")
                    downloadedFiles.add(Pair(tempFile, downloadedSize))
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to download layer ${index + 1}/${layers.size}", e)
                    // Clean up any partially downloaded files
                    downloadedFiles.forEach { (file, _) ->
                        if (file.exists()) {
                            file.delete()
                            Log.d(TAG, "Cleaned up: ${file.name}")
                        }
                    }
                    return@withContext mapOf(
                        "success" to false,
                        "error" to "Failed to download layer ${index + 1}: ${e.message}"
                    )
                }
            }
            
            progressListener?.onProgress(95, "Processing files...")
            
            // Find largest file (the GGUF model)
            val largestFile = downloadedFiles.maxByOrNull { it.second }
                ?: throw Exception("No files downloaded")
            
            // Rename largest file to final name
            val outputFilename = "${model.replace("/", "_")}-$tag.gguf"
            val destFile = File(modelsDir, outputFilename)
            largestFile.first.renameTo(destFile)
            
            progressListener?.onProgress(97, "Cleaning up...")
            
            // Delete other files
            downloadedFiles.forEach { (file, _) ->
                if (file != largestFile.first && file.exists()) {
                    file.delete()
                }
            }
            
            progressListener?.onProgress(100, "Model ready: $outputFilename")
            Log.i(TAG, "Successfully pulled model: $outputFilename (${largestFile.second / 1024 / 1024}MB)")
            
            mapOf(
                "success" to true,
                "filename" to outputFilename,
                "note" to "Model saved as $outputFilename"
            )
            
        } catch (e: Exception) {
            Log.e(TAG, "Ollama pull failed", e)
            mapOf(
                "success" to false,
                "error" to "Ollama pull failed: ${e.message}"
            )
        }
    }
    
    /**
     * Download a single layer file
     * Returns the total bytes downloaded
     */
    private fun downloadLayer(
        url: String,
        destFile: File,
        layerSize: Long,
        currentLayer: Int,
        totalLayers: Int,
        progressListener: DownloadProgressListener?
    ): Long {
        Log.d(TAG, "downloadLayer: Starting download from $url")
        
        var connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        connection.connectTimeout = 30000
        connection.readTimeout = 30000
        
        Log.d(TAG, "downloadLayer: Initial response code: ${connection.responseCode}")
        
        // Follow redirects manually
        var redirectCount = 0
        while ((connection.responseCode == HttpURLConnection.HTTP_MOVED_PERM || 
                connection.responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                connection.responseCode == HttpURLConnection.HTTP_SEE_OTHER) && 
               redirectCount < 5) {
            val redirectUrl = connection.getHeaderField("Location")
            Log.d(TAG, "downloadLayer: Following redirect to $redirectUrl")
            connection.disconnect()
            connection = URL(redirectUrl).openConnection() as HttpURLConnection
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            connection.connectTimeout = 30000
            connection.readTimeout = 30000
            redirectCount++
        }
        
        if (connection.responseCode != 200) {
            val errorMsg = try {
                connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error body"
            } catch (e: Exception) {
                "Could not read error: ${e.message}"
            }
            connection.disconnect()
            Log.e(TAG, "downloadLayer: HTTP ${connection.responseCode}, Error: $errorMsg")
            throw Exception("Failed to download layer: HTTP ${connection.responseCode}")
        }
        
        val totalBytes = connection.contentLength.toLong()
        Log.i(TAG, "downloadLayer: Content-Length: $totalBytes bytes (${totalBytes / 1024 / 1024}MB), Expected: $layerSize bytes")
        
        var downloadedBytes = 0L
        var lastReportedPercent = -1
        
        FileOutputStream(destFile).use { output ->
            connection.inputStream.use { input ->
                val buffer = ByteArray(8192)
                var bytesRead: Int
                
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    output.write(buffer, 0, bytesRead)
                    downloadedBytes += bytesRead
                    
                    // Calculate progress for THIS layer only (0-100)
                    val layerPercent = if (totalBytes > 0) {
                        ((downloadedBytes * 100) / totalBytes).toInt()
                    } else {
                        0
                    }
                    
                    if (layerPercent != lastReportedPercent) {
                        val downloadedMB = (downloadedBytes / 1024.0 / 1024.0)
                        val totalMB = (totalBytes / 1024.0 / 1024.0)
                        progressListener?.onProgress(
                            layerPercent,
                            "Layer $currentLayer/$totalLayers: %.1fMB / %.1fMB".format(downloadedMB, totalMB)
                        )
                        lastReportedPercent = layerPercent
                    }
                }
            }
        }
        
        connection.disconnect()
        Log.i(TAG, "downloadLayer: Completed, downloaded $downloadedBytes bytes to ${destFile.name}")
        return downloadedBytes
    }
    
    /**
     * Import model from URI (file picker result)
     * @param sourceUri URI of the selected file
     * @param fileName Original file name (should be .gguf)
     * @return Map with success status, path, and error (if any)
     */
    fun importFromUri(sourceUri: android.net.Uri, fileName: String): Map<String, Any> {
        return try {
            // Validate filename
            if (!fileName.endsWith(".gguf", ignoreCase = true)) {
                return mapOf(
                    "success" to false,
                    "error" to "Invalid file type. Only .gguf files are supported."
                )
            }

            val modelsDir = getModelsDirectory()
            val destFile = File(modelsDir, fileName)

            if (destFile.exists()) {
                return mapOf(
                    "success" to false,
                    "error" to "Model already exists: $fileName"
                )
            }

            // Copy file from URI to models directory
            context.contentResolver.openInputStream(sourceUri)?.use { inputStream ->
                FileOutputStream(destFile).use { outputStream ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    var totalBytes = 0L
                    
                    while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                        outputStream.write(buffer, 0, bytesRead)
                        totalBytes += bytesRead
                    }
                    
                    Log.i(TAG, "Imported model: $fileName ($totalBytes bytes)")
                }
            } ?: return mapOf(
                "success" to false,
                "error" to "Failed to open file"
            )

            mapOf(
                "success" to true,
                "path" to destFile.absolutePath,
                "name" to fileName,
                "size" to destFile.length()
            )

        } catch (e: Exception) {
            Log.e(TAG, "Import failed", e)
            mapOf(
                "success" to false,
                "error" to "Import failed: ${e.message}"
            )
        }
    }
    
    /**
     * Delete a model
     * @param filename Model filename to delete
     * @return Map with success status and error (if any)
     */
    fun deleteModel(filename: String): Map<String, Any> {
        return try {
            val modelsDir = getModelsDirectory()
            val file = File(modelsDir, filename)
            
            // Security check: ensure file is within models directory
            if (!file.canonicalPath.startsWith(modelsDir.canonicalPath)) {
                return mapOf(
                    "success" to false,
                    "error" to "Invalid file path"
                )
            }
            
            if (!file.exists()) {
                return mapOf(
                    "success" to false,
                    "error" to "Model not found"
                )
            }
            
            val deleted = file.delete()
            if (deleted) {
                Log.i(TAG, "Deleted model: $filename")
                mapOf("success" to true)
            } else {
                mapOf(
                    "success" to false,
                    "error" to "Failed to delete file"
                )
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Delete failed", e)
            mapOf(
                "success" to false,
                "error" to "Delete failed: ${e.message}"
            )
        }
    }
}
