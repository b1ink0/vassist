package com.vassist.app.ai

import android.content.Context
import android.net.Uri
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.net.URLDecoder
import java.net.URLEncoder
import java.net.URL

/**
 * Data classes for Ollama manifest parsing
 */
data class OllamaManifest(
    @SerializedName("layers") val layers: List<OllamaLayer>? = null
)

data class OllamaLayer(
    @SerializedName("digest") val digest: String,
    @SerializedName("size") val size: Long,
    @SerializedName("mediaType") val mediaType: String? = null
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

    private val gson = Gson()

    data class CatalogItem(
        val id: String,
        val label: String,
        val value: String,
        val description: String? = null,
        val secondaryLabel: String? = null,
        val downloads: Long? = null,
        val likes: Long? = null
    )
    
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
     * List all installed GGUF models (excluding mmproj files)
     * @return List of model info maps with keys: name, size, modified, hasImageSupport
     */
    fun listModels(): List<Map<String, Any>> {
        val modelsDir = getModelsDirectory()
        
        val models = modelsDir.listFiles { file -> 
            (file.extension.equals("gguf", ignoreCase = true) ||
             file.extension.equals("litertlm", ignoreCase = true)) &&
            !file.name.startsWith("mmproj-", ignoreCase = true)
        }?.map { file ->
            // Check if corresponding mmproj file exists (for traditional LLaVA models)
            val mmprojFile = File(modelsDir, "mmproj-${file.name}")
            
            // Check if the model is a known single-file vision model by parsing GGUF metadata natively!
            val isNativeVisionModel = isVisionModelGguf(file)
            
            mapOf(
                "name" to file.name,
                "size" to file.length(),
                "modified" to file.lastModified(),
                "hasImageSupport" to (mmprojFile.exists() || isNativeVisionModel)
            )
        } ?: emptyList()
        
        Log.i(TAG, "Found ${models.size} models in ${modelsDir.absolutePath}")
        return models
    }

    /**
     * Parses the GGUF metadata header locally to definitively check if the model supports vision natively.
     */
    private fun isVisionModelGguf(file: File): Boolean {
        if (!file.exists() || file.length() < 24) return false

        try {
            RandomAccessFile(file, "r").use { raf ->
                val headerBytes = ByteArray(24)
                raf.readFully(headerBytes)
                val buffer = ByteBuffer.wrap(headerBytes).order(ByteOrder.LITTLE_ENDIAN)

                val magic = buffer.getInt()
                if (magic != 0x46554747) { // "GGUF" in ASCII
                    return false
                }

                val version = buffer.getInt()
                val tensorCount = buffer.getLong()
                val kvCount = buffer.getLong()

                // Safe limit to avoid reading the whole file if something is wrong
                val maxKvsToRead = minOf(kvCount, 100L)

                for (i in 0 until maxKvsToRead) {
                    val keyLenBytes = ByteArray(8)
                    raf.readFully(keyLenBytes)
                    val keyLen = ByteBuffer.wrap(keyLenBytes).order(ByteOrder.LITTLE_ENDIAN).getLong()

                    if (keyLen < 0 || keyLen > 1024) break // Sanity check

                    val keyBytes = ByteArray(keyLen.toInt())
                    raf.readFully(keyBytes)
                    val key = String(keyBytes, Charsets.UTF_8)

                    val valueTypeBytes = ByteArray(4)
                    raf.readFully(valueTypeBytes)
                    val valueType = ByteBuffer.wrap(valueTypeBytes).order(ByteOrder.LITTLE_ENDIAN).getInt()

                    if (key == "general.architecture" && valueType == 8) { // 8 is STRING
                        val strLenBytes = ByteArray(8)
                        raf.readFully(strLenBytes)
                        val strLen = ByteBuffer.wrap(strLenBytes).order(ByteOrder.LITTLE_ENDIAN).getLong()

                        if (strLen in 1..256) {
                            val strBytes = ByteArray(strLen.toInt())
                            raf.readFully(strBytes)
                            val arch = String(strBytes, Charsets.UTF_8).lowercase()
                            
                            Log.d(TAG, "Parsed GGUF architecture for ${file.name}: $arch")
                            
                            // Known multimodal architectures supported by llama.cpp
                            return arch in listOf("mllama", "qwen2vl", "qwen35", "llava", "clip", "minicpmv")
                        }
                    }

                    // Skip value data based on type to reach the next KV pair
                    skipGgufValue(raf, valueType)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing GGUF header for ${file.name}", e)
        }
        return false
    }

    private fun skipGgufValue(raf: RandomAccessFile, type: Int) {
        when (type) {
            0, 1, 7 -> raf.skipBytes(1) // UINT8, INT8, BOOL
            2, 3 -> raf.skipBytes(2) // UINT16, INT16
            4, 5, 6 -> raf.skipBytes(4) // UINT32, INT32, FLOAT32
            10, 11, 12 -> raf.skipBytes(8) // UINT64, INT64, FLOAT64
            8 -> { // STRING
                val lenBytes = ByteArray(8)
                raf.readFully(lenBytes)
                val len = ByteBuffer.wrap(lenBytes).order(ByteOrder.LITTLE_ENDIAN).getLong()
                raf.skipBytes(len.toInt())
            }
            9 -> { // ARRAY
                val typeBytes = ByteArray(4)
                raf.readFully(typeBytes)
                val itemType = ByteBuffer.wrap(typeBytes).order(ByteOrder.LITTLE_ENDIAN).getInt()
                
                val lenBytes = ByteArray(8)
                raf.readFully(lenBytes)
                val len = ByteBuffer.wrap(lenBytes).order(ByteOrder.LITTLE_ENDIAN).getLong()
                
                for (i in 0 until len) {
                    skipGgufValue(raf, itemType)
                }
            }
        }
    }

    private fun paginateItems(items: List<CatalogItem>, page: Int, pageSize: Int): Map<String, Any?> {
        val normalizedPage = page.coerceAtLeast(1)
        val normalizedPageSize = pageSize.coerceIn(1, 50)
        val startIndex = (normalizedPage - 1) * normalizedPageSize
        val endIndex = (startIndex + normalizedPageSize).coerceAtMost(items.size)
        val pageItems = if (startIndex >= items.size) emptyList() else items.subList(startIndex, endIndex)
        val nextCursor = if (endIndex < items.size) (normalizedPage + 1).toString() else null

        return mapOf(
            "success" to true,
            "items" to pageItems,
            "total" to items.size,
            "nextCursor" to nextCursor
        )
    }

    private fun createConnection(url: String, accept: String = "application/json"): HttpURLConnection {
        return (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("User-Agent", "VAssist/1.0")
            setRequestProperty("Accept", accept)
            connectTimeout = 30000
            readTimeout = 30000
        }
    }

    private fun parseNextCursor(linkHeader: String?): String? {
        if (linkHeader.isNullOrBlank()) {
            return null
        }
        val nextMatch = Regex("<([^>]+)>;\\s*rel=\"next\"", RegexOption.IGNORE_CASE).find(linkHeader)
            ?: return null
        val nextUrl = nextMatch.groupValues.getOrNull(1).orEmpty()
        if (nextUrl.isBlank()) {
            return null
        }

        return try {
            Regex("[?&]cursor=([^&>]+)").find(nextUrl)?.groupValues?.getOrNull(1)?.let {
                URLDecoder.decode(it, Charsets.UTF_8.name())
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun encodeRepoId(repoId: String): String {
        return repoId.split("/").joinToString("/") { segment ->
            URLEncoder.encode(segment, Charsets.UTF_8.name()).replace("+", "%20")
        }
    }

    private fun encodePathSegments(filePath: String): String {
        return filePath.split("/").joinToString("/") { segment ->
            URLEncoder.encode(segment, Charsets.UTF_8.name()).replace("+", "%20")
        }
    }

    suspend fun searchOllamaModels(query: String, page: Int, pageSize: Int): Map<String, Any?> = withContext(Dispatchers.IO) {
        try {
            val connection = createConnection("https://ollama.com/library", "text/html")
            val html = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()

            val normalizedQuery = query.trim().lowercase()
            val seen = linkedSetOf<String>()
            val regex = Regex("/library/([a-z0-9._-]+)", RegexOption.IGNORE_CASE)
            regex.findAll(html).forEach { match ->
                val slug = match.groupValues.getOrNull(1)?.trim()?.lowercase().orEmpty()
                if (slug.isNotBlank()) {
                    seen.add(slug)
                }
            }

            val items = seen
                .filter { normalizedQuery.isBlank() || it.contains(normalizedQuery) }
                .sorted()
                .map { slug ->
                    CatalogItem(
                        id = slug,
                        label = slug,
                        value = slug,
                        secondaryLabel = "Ollama library"
                    )
                }

            paginateItems(items, page, pageSize)
        } catch (e: Exception) {
            Log.e(TAG, "searchOllamaModels failed", e)
            mapOf("success" to false, "items" to emptyList<CatalogItem>(), "error" to e.message)
        }
    }

    suspend fun listOllamaModelTags(modelId: String, query: String, page: Int, pageSize: Int): Map<String, Any?> = withContext(Dispatchers.IO) {
        try {
            val normalizedModelId = modelId.trim().lowercase()
            if (normalizedModelId.isBlank()) {
                return@withContext mapOf("success" to true, "items" to emptyList<CatalogItem>(), "total" to 0, "nextCursor" to null)
            }

            val connection = createConnection("https://ollama.com/library/${URLEncoder.encode(normalizedModelId, Charsets.UTF_8.name()).replace("+", "%20")}", "text/html")
            val html = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()

            val normalizedQuery = query.trim().lowercase()
            val seen = linkedSetOf<String>()
            val tagRegex = Regex("${Regex.escape(normalizedModelId)}:([a-z0-9._-]+)", RegexOption.IGNORE_CASE)
            tagRegex.findAll(html).forEach { match ->
                val tag = match.groupValues.getOrNull(1)?.trim()?.lowercase().orEmpty()
                if (tag.isNotBlank()) {
                    val value = "$normalizedModelId:$tag"
                    if (normalizedQuery.isBlank() || value.contains(normalizedQuery) || tag.contains(normalizedQuery)) {
                        seen.add(value)
                    }
                }
            }

            val values = if (seen.isEmpty()) listOf("$normalizedModelId:latest") else seen.toList()
            val items = values.map { value ->
                CatalogItem(
                    id = value,
                    label = value,
                    value = value,
                    secondaryLabel = if (value.endsWith(":latest")) "Default tag" else "Variant"
                )
            }

            paginateItems(items, page, pageSize)
        } catch (e: Exception) {
            Log.e(TAG, "listOllamaModelTags failed", e)
            mapOf("success" to false, "items" to emptyList<CatalogItem>(), "error" to e.message)
        }
    }

    suspend fun searchHuggingFaceModels(query: String, cursor: String?, pageSize: Int): Map<String, Any?> = withContext(Dispatchers.IO) {
        try {
            // Search both GGUF- and LiteRT-LM-tagged repos and merge results.
            // The opaque pagination cursor encodes both underlying cursors.
            data class PageResult(val items: List<Pair<String, JsonObject?>>, val next: String?, val total: Int?)

            fun fetch(filter: String, cursorPart: String?): PageResult {
                val uriBuilder = Uri.parse("https://huggingface.co/api/models").buildUpon()
                    .appendQueryParameter("filter", filter)
                    .appendQueryParameter("limit", pageSize.coerceIn(1, 50).toString())
                    .appendQueryParameter("sort", "trendingScore")
                if (query.trim().isNotBlank()) {
                    uriBuilder.appendQueryParameter("search", query.trim())
                }
                if (!cursorPart.isNullOrBlank()) {
                    uriBuilder.appendQueryParameter("cursor", cursorPart)
                }
                val connection = createConnection(uriBuilder.build().toString())
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                val linkHeader = connection.getHeaderField("Link")
                val totalHeader = connection.getHeaderField("X-Total-Count")
                connection.disconnect()

                val payload = gson.fromJson(body, JsonArray::class.java)
                val items = payload.mapNotNull { element ->
                    val obj = element as? JsonObject ?: return@mapNotNull null
                    val repoId = obj.get("id")?.asString ?: return@mapNotNull null
                    repoId to obj
                }
                return PageResult(items, parseNextCursor(linkHeader), totalHeader?.toIntOrNull())
            }

            // Decode merged cursor: Base64 of "ggufCursor|litertCursor" (either side may be empty)
            var ggufCursor: String? = null
            var litertCursor: String? = null
            if (!cursor.isNullOrBlank()) {
                try {
                    val decoded = String(java.util.Base64.getUrlDecoder().decode(cursor), Charsets.UTF_8)
                    ggufCursor = decoded.substringBefore("|").ifBlank { null }
                    litertCursor = decoded.substringAfter("|").ifBlank { null }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to decode merged HF cursor", e)
                }
            }

            val halfLimit = (pageSize.coerceIn(1, 50) + 1) / 2

            fun fetchWithLimit(filter: String, cursorPart: String?): PageResult {
                val savedLimit = pageSize
                // temporarily respect half limit per source so merged page ~= pageSize
                val result = if (halfLimit < pageSize) {
                    try {
                        val uriBuilder = Uri.parse("https://huggingface.co/api/models").buildUpon()
                            .appendQueryParameter("filter", filter)
                            .appendQueryParameter("limit", halfLimit.toString())
                            .appendQueryParameter("sort", "trendingScore")
                        if (query.trim().isNotBlank()) uriBuilder.appendQueryParameter("search", query.trim())
                        if (!cursorPart.isNullOrBlank()) uriBuilder.appendQueryParameter("cursor", cursorPart)
                        val connection = createConnection(uriBuilder.build().toString())
                        val body = connection.inputStream.bufferedReader().use { it.readText() }
                        val linkHeader = connection.getHeaderField("Link")
                        val totalHeader = connection.getHeaderField("X-Total-Count")
                        connection.disconnect()
                        val payload = gson.fromJson(body, JsonArray::class.java)
                        PageResult(payload.mapNotNull { element ->
                            val obj = element as? JsonObject ?: return@mapNotNull null
                            val repoId = obj.get("id")?.asString ?: return@mapNotNull null
                            repoId to obj
                        }, parseNextCursor(linkHeader), totalHeader?.toIntOrNull())
                    } catch (e: Exception) {
                        Log.e(TAG, "HF sub-search failed for filter=$filter", e)
                        PageResult(emptyList(), null, null)
                    }
                } else fetch(filter, cursorPart)
                return result
            }

            val ggufPage = fetchWithLimit("gguf", ggufCursor)
            val litertPage = fetchWithLimit("litert-lm", litertCursor)

            // Merge, dedupe by repo id (prefer first occurrence), derive label from tags
            data class MergedItem(val item: CatalogItem)

            val seen = LinkedHashMap<String, CatalogItem>()
            fun register(repoId: String, obj: JsonObject?, defaultTag: String) {
                if (seen.containsKey(repoId)) {
                    // Enrich existing label if the other tag also matches this repo
                    return
                }
                val downloads = obj?.get("downloads")?.takeIf { !it.isJsonNull }?.asLong
                val likes = obj?.get("likes")?.takeIf { !it.isJsonNull }?.asLong
                val pipelineTag = obj?.get("pipeline_tag")?.takeIf { !it.isJsonNull }?.asString
                val tags = obj?.getAsJsonArray("tags")
                val hasGguf = tags?.any { it.isJsonPrimitive && it.asString == "gguf" } == true || defaultTag == "GGUF"
                val hasLitert = tags?.any { it.isJsonPrimitive && (it.asString == "litertlm" || it.asString == "litert-lm") } == true || defaultTag == "LiteRT-LM"
                val formatLabel = when {
                    hasGguf && hasLitert -> "GGUF + LiteRT-LM"
                    hasLitert -> "LiteRT-LM"
                    else -> "GGUF"
                }
                val descriptionParts = listOfNotNull(
                    downloads?.let { "${String.format("%,d", it)} downloads" },
                    likes?.let { "${String.format("%,d", it)} likes" },
                    pipelineTag,
                    formatLabel
                )
                seen[repoId] = CatalogItem(
                    id = repoId,
                    label = repoId,
                    value = repoId,
                    description = descriptionParts.joinToString(" • ").ifBlank { null },
                    secondaryLabel = formatLabel,
                    downloads = downloads,
                    likes = likes
                )
            }

            ggufPage.items.forEach { (id, obj) -> register(id, obj, "GGUF") }
            litertPage.items.forEach { (id, obj) -> register(id, obj, "LiteRT-LM") }

            val items = seen.values.toList()

            // Re-encode both cursors for the next page
            val nextCursor = if (ggufPage.next != null || litertPage.next != null) {
                java.util.Base64.getUrlEncoder().encodeToString(
                    "${ggufPage.next.orEmpty()}|${litertPage.next.orEmpty()}".toByteArray(Charsets.UTF_8)
                )
            } else null

            mapOf(
                "success" to true,
                "items" to items,
                "nextCursor" to nextCursor,
                "total" to (ggufPage.total ?: 0) + (litertPage.total ?: 0)
            )
        } catch (e: Exception) {
            Log.e(TAG, "searchHuggingFaceModels failed", e)
            mapOf("success" to false, "items" to emptyList<CatalogItem>(), "error" to e.message)
        }
    }

    suspend fun listHuggingFaceFiles(repoId: String, query: String, page: Int, pageSize: Int): Map<String, Any?> = withContext(Dispatchers.IO) {
        try {
            val normalizedRepoId = repoId.trim()
            if (normalizedRepoId.isBlank()) {
                return@withContext mapOf("success" to true, "items" to emptyList<CatalogItem>(), "total" to 0, "nextCursor" to null)
            }

            val connection = createConnection("https://huggingface.co/api/models/${encodeRepoId(normalizedRepoId)}")
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()

            val payload = gson.fromJson(body, JsonObject::class.java)
            val revision = payload.get("sha")?.takeIf { !it.isJsonNull }?.asString ?: "main"
            val siblings = payload.getAsJsonArray("siblings") ?: JsonArray()
            val normalizedQuery = query.trim().lowercase()

            val items = siblings.mapNotNull { element ->
                val obj = element as? JsonObject ?: return@mapNotNull null
                val filePath = obj.get("rfilename")?.takeIf { !it.isJsonNull }?.asString ?: return@mapNotNull null
                val lowerFilePath = filePath.lowercase()
                val isModelFile = lowerFilePath.endsWith(".gguf") || lowerFilePath.endsWith(".litertlm")
                if (!isModelFile || lowerFilePath.contains("mmproj") || (normalizedQuery.isNotBlank() && !lowerFilePath.contains(normalizedQuery))) {
                    return@mapNotNull null
                }

                CatalogItem(
                    id = filePath,
                    label = filePath.substringAfterLast('/'),
                    value = "https://huggingface.co/$normalizedRepoId/resolve/$revision/${encodePathSegments(filePath)}?download=true",
                    description = normalizedRepoId,
                    secondaryLabel = filePath
                )
            }.sortedBy { it.secondaryLabel ?: it.label }

            paginateItems(items, page, pageSize)
        } catch (e: Exception) {
            Log.e(TAG, "listHuggingFaceFiles failed", e)
            mapOf("success" to false, "items" to emptyList<CatalogItem>(), "error" to e.message)
        }
    }
    
    /**
     * Download model from URL (e.g., HuggingFace)
     * Also checks for and downloads mmproj files for vision-capable models
     * @param url Direct download URL
     * @param progressListener Progress callback (optional)
     * @return Map with success status and filename/error
     */
    suspend fun downloadFromUrl(
        url: String, 
        progressListener: DownloadProgressListener? = null
    ): Map<String, Any?> = withContext(Dispatchers.IO) {
        try {
            Log.i(TAG, "Downloading model from URL: $url")
            
            // Extract filename from URL
            var filename = url.substringAfterLast("/").substringBefore("?")
            
            if (!filename.endsWith(".gguf", ignoreCase = true) &&
                !filename.endsWith(".litertlm", ignoreCase = true)) {
                return@withContext mapOf(
                    "success" to false,
                    "error" to "Invalid file: must be a .gguf or .litertlm model file"
                )
            }
            
            val modelsDir = getModelsDirectory()
            val destFile = File(modelsDir, filename)
            
            // Download main model file
            progressListener?.onProgress(0, "Downloading model...")
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
                        
                        val percent = ((downloadedSize * 50) / totalSize).toInt() // First 50% for main model
                        if (percent != lastReportedPercent) {
                            val downloadedMB = downloadedSize / (1024 * 1024)
                            val totalMB = totalSize / (1024 * 1024)
                            progressListener?.onProgress(
                                percent,
                                "Model: ${downloadedMB}MB / ${totalMB}MB"
                            )
                            lastReportedPercent = percent
                        }
                    }
                }
            }
            
            connection.disconnect()
            
            progressListener?.onProgress(50, "Model downloaded, checking for vision encoder...")
            Log.i(TAG, "Successfully downloaded model: $filename")
            
            // Check if HuggingFace URL and try to find mmproj file
            var mmprojDownloaded = false
            if (url.contains("huggingface.co")) {
                try {
                    // Extract repo info from URL
                    val urlPattern = Regex("huggingface\\.co/([^/]+/[^/]+)/resolve/([^/]+)/(.*)")
                    val match = urlPattern.find(url)
                    
                    if (match != null) {
                        val repo = match.groupValues[1]
                        val branch = match.groupValues[2]
                        
                        Log.d(TAG, "Checking HuggingFace repo: $repo for mmproj files")
                        
                        // Check repo API for mmproj files
                        val apiUrl = "https://huggingface.co/api/models/$repo/tree/$branch"
                        val apiConnection = URL(apiUrl).openConnection() as HttpURLConnection
                        apiConnection.requestMethod = "GET"
                        apiConnection.setRequestProperty("User-Agent", "Mozilla/5.0")
                        apiConnection.connectTimeout = 10000
                        apiConnection.readTimeout = 10000
                        
                        if (apiConnection.responseCode == 200) {
                            val apiResponse = apiConnection.inputStream.bufferedReader().use { it.readText() }
                            apiConnection.disconnect()
                            
                            // Look for mmproj file in response
                            if (apiResponse.contains("mmproj") && apiResponse.contains(".gguf")) {
                                val mmprojPattern = Regex("\"path\"\\s*:\\s*\"([^\"]*mmproj[^\"]*\\.gguf)\"")
                                val mmprojMatch = mmprojPattern.find(apiResponse)
                                
                                if (mmprojMatch != null) {
                                    val mmprojPath = mmprojMatch.groupValues[1]
                                    val mmprojUrl = "https://huggingface.co/$repo/resolve/$branch/$mmprojPath"
                                    
                                    Log.i(TAG, "Found mmproj file, downloading: $mmprojPath")
                                    progressListener?.onProgress(51, "Downloading vision encoder...")
                                    
                                    mmprojDownloaded = downloadMmprojFile(mmprojUrl, filename, progressListener)
                                }
                            }
                        } else {
                            apiConnection.disconnect()
                        }
                    }
                    
                    // If not found in main repo, try ggml-org fallback
                    if (!mmprojDownloaded) {
                        val baseModelName = filename.replace(Regex("-Q[0-9]_[0-9KML]+.*\\.gguf$"), "").replace(".gguf", "")
                        val fallbackRepo = "ggml-org/$baseModelName-GGUF"
                        
                        Log.d(TAG, "Trying fallback repo: $fallbackRepo")
                        
                        val fallbackApiUrl = "https://huggingface.co/api/models/$fallbackRepo/tree/main"
                        val fallbackConnection = URL(fallbackApiUrl).openConnection() as HttpURLConnection
                        fallbackConnection.requestMethod = "GET"
                        fallbackConnection.setRequestProperty("User-Agent", "Mozilla/5.0")
                        fallbackConnection.connectTimeout = 10000
                        fallbackConnection.readTimeout = 10000
                        
                        if (fallbackConnection.responseCode == 200) {
                            val fallbackResponse = fallbackConnection.inputStream.bufferedReader().use { it.readText() }
                            fallbackConnection.disconnect()
                            
                            if (fallbackResponse.contains("mmproj") && fallbackResponse.contains(".gguf")) {
                                val mmprojPattern = Regex("\"path\"\\s*:\\s*\"([^\"]*mmproj[^\"]*\\.gguf)\"")
                                val mmprojMatch = mmprojPattern.find(fallbackResponse)
                                
                                if (mmprojMatch != null) {
                                    val mmprojPath = mmprojMatch.groupValues[1]
                                    val mmprojUrl = "https://huggingface.co/$fallbackRepo/resolve/main/$mmprojPath"
                                    
                                    Log.i(TAG, "Found mmproj in fallback repo, downloading: $mmprojPath")
                                    progressListener?.onProgress(51, "Downloading vision encoder...")
                                    
                                    mmprojDownloaded = downloadMmprojFile(mmprojUrl, filename, progressListener)
                                }
                            }
                        } else {
                            fallbackConnection.disconnect()
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to check for mmproj file: ${e.message}")
                }
            }
            
            if (mmprojDownloaded) {
                progressListener?.onProgress(100, "Model with vision support ready")
                Log.i(TAG, "Model has vision support (mmproj downloaded)")
            } else {
                progressListener?.onProgress(100, "Model ready: $filename")
            }
            
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
     * Download mmproj file for a model
     * Returns true if successful, false otherwise
     */
    private fun downloadMmprojFile(
        mmprojUrl: String,
        mainModelFilename: String,
        progressListener: DownloadProgressListener?
    ): Boolean {
        return try {
            val modelsDir = getModelsDirectory()
            val mmprojFilename = "mmproj-$mainModelFilename"
            val mmprojDestFile = File(modelsDir, mmprojFilename)
            
            val connection = URL(mmprojUrl).openConnection() as HttpURLConnection
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
                return downloadMmprojFile(redirectUrl, mainModelFilename, progressListener)
            }
            
            if (connection.responseCode != 200) {
                connection.disconnect()
                return false
            }
            
            val totalSize = connection.contentLength.toLong()
            var downloadedSize = 0L
            var lastReportedPercent = 50
            
            connection.inputStream.use { input ->
                FileOutputStream(mmprojDestFile).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        downloadedSize += bytesRead
                        
                        val percent = 50 + ((downloadedSize * 50) / totalSize).toInt() // 50-100% for mmproj
                        if (percent != lastReportedPercent) {
                            val downloadedMB = downloadedSize / (1024 * 1024)
                            val totalMB = totalSize / (1024 * 1024)
                            progressListener?.onProgress(
                                percent,
                                "Vision: ${downloadedMB}MB / ${totalMB}MB"
                            )
                            lastReportedPercent = percent
                        }
                    }
                }
            }
            
            connection.disconnect()
            Log.i(TAG, "Successfully downloaded mmproj: $mmprojFilename")
            true
            
        } catch (e: Exception) {
            Log.w(TAG, "Failed to download mmproj file: ${e.message}")
            false
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
    ): Map<String, Any?> = withContext(Dispatchers.IO) {
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
            
            // Separate model layers from projector (mmproj) layers
            val modelLayers = layers.filter { it.mediaType != "application/vnd.ollama.image.projector" }
            val mmprojLayers = layers.filter { it.mediaType == "application/vnd.ollama.image.projector" }
            
            Log.i(TAG, "Found ${modelLayers.size} model layers and ${mmprojLayers.size} projector layers in manifest")
            layers.forEachIndexed { index, layer ->
                Log.d(TAG, "Layer $index: ${layer.digest.substring(0, 19)}... (${layer.size / 1024 / 1024}MB) - ${layer.mediaType ?: "unknown"}")
            }
            
            if (modelLayers.isEmpty()) {
                return@withContext mapOf(
                    "success" to false,
                    "error" to "No model layers found in manifest"
                )
            }
            
            progressListener?.onProgress(2, "Found ${modelLayers.size} model layers to download")
            
            val modelsDir = getModelsDirectory()
            val downloadedModelFiles = mutableListOf<Pair<File, Long>>()
            
            // Download model layers
            modelLayers.forEachIndexed { index, layer ->
                try {
                    val blobUrl = "https://registry.ollama.ai/v2/$namespace/blobs/${layer.digest}"
                    val tempFileName = "${model.replace("/", "_")}-$tag-${layer.digest.substring(7, 19)}.tmp"
                    val tempFile = File(modelsDir, tempFileName)
                    
                    Log.i(TAG, "Downloading model layer ${index + 1}/${modelLayers.size} from: $blobUrl")
                    
                    progressListener?.onProgress(
                        2 + (index * 45 / modelLayers.size),
                        "Model layer ${index + 1}/${modelLayers.size}..."
                    )
                    
                    val downloadedSize = downloadLayer(
                        blobUrl,
                        tempFile,
                        layer.size,
                        index + 1,
                        modelLayers.size,
                        progressListener
                    )
                    
                    Log.i(TAG, "Downloaded model layer ${index + 1}: ${tempFile.name} (${downloadedSize / 1024 / 1024}MB)")
                    downloadedModelFiles.add(Pair(tempFile, downloadedSize))
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to download model layer ${index + 1}/${modelLayers.size}", e)
                    downloadedModelFiles.forEach { (file, _) ->
                        if (file.exists()) {
                            file.delete()
                            Log.d(TAG, "Cleaned up: ${file.name}")
                        }
                    }
                    return@withContext mapOf(
                        "success" to false,
                        "error" to "Failed to download model layer ${index + 1}: ${e.message}"
                    )
                }
            }
            
            // Download mmproj layers if they exist
            val downloadedMmprojFiles = mutableListOf<Pair<File, Long>>()
            if (mmprojLayers.isNotEmpty()) {
                progressListener?.onProgress(47, "Found vision encoder, downloading...")
                
                mmprojLayers.forEachIndexed { index, layer ->
                    try {
                        val blobUrl = "https://registry.ollama.ai/v2/$namespace/blobs/${layer.digest}"
                        val tempFileName = "mmproj-${model.replace("/", "_")}-$tag-${layer.digest.substring(7, 19)}.tmp"
                        val tempFile = File(modelsDir, tempFileName)
                        
                        Log.i(TAG, "Downloading vision encoder layer ${index + 1}/${mmprojLayers.size} from: $blobUrl")
                        
                        progressListener?.onProgress(
                            47 + (index * 45 / mmprojLayers.size),
                            "Vision encoder ${index + 1}/${mmprojLayers.size}..."
                        )
                        
                        val downloadedSize = downloadLayer(
                            blobUrl,
                            tempFile,
                            layer.size,
                            index + 1,
                            mmprojLayers.size,
                            progressListener
                        )
                        
                        Log.i(TAG, "Downloaded vision encoder layer ${index + 1}: ${tempFile.name} (${downloadedSize / 1024 / 1024}MB)")
                        downloadedMmprojFiles.add(Pair(tempFile, downloadedSize))
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to download vision encoder layer ${index + 1}/${mmprojLayers.size}", e)
                        downloadedModelFiles.forEach { (file, _) -> if (file.exists()) file.delete() }
                        downloadedMmprojFiles.forEach { (file, _) -> if (file.exists()) file.delete() }
                        return@withContext mapOf(
                            "success" to false,
                            "error" to "Failed to download vision encoder layer ${index + 1}: ${e.message}"
                        )
                    }
                }
            }
            
            progressListener?.onProgress(92, "Processing files...")
            
            // Find largest model file (the main GGUF model)
            val largestModelFile = downloadedModelFiles.maxByOrNull { it.second }
                ?: throw Exception("No model files downloaded")
            
            // Rename largest model file to final name
            val outputFilename = "${model.replace("/", "_")}-$tag.gguf"
            val destFile = File(modelsDir, outputFilename)
            largestModelFile.first.renameTo(destFile)
            
            // Process mmproj files if they exist
            if (downloadedMmprojFiles.isNotEmpty()) {
                progressListener?.onProgress(95, "Processing vision encoder...")
                
                val largestMmprojFile = downloadedMmprojFiles.maxByOrNull { it.second }
                    ?: throw Exception("No mmproj files downloaded")
                
                val mmprojFilename = "mmproj-$outputFilename"
                val mmprojDestFile = File(modelsDir, mmprojFilename)
                largestMmprojFile.first.renameTo(mmprojDestFile)
                
                Log.i(TAG, "Saved vision encoder as: $mmprojFilename (${largestMmprojFile.second / 1024 / 1024}MB)")
                
                // Delete other mmproj files
                downloadedMmprojFiles.forEach { (file, _) ->
                    if (file != largestMmprojFile.first && file.exists()) {
                        file.delete()
                    }
                }
            }
            
            progressListener?.onProgress(97, "Cleaning up...")
            
            // Delete other model files
            downloadedModelFiles.forEach { (file, _) ->
                if (file != largestModelFile.first && file.exists()) {
                    file.delete()
                }
            }
            
            progressListener?.onProgress(100, "Model ready: $outputFilename")
            Log.i(TAG, "Successfully pulled model: $outputFilename (${largestModelFile.second / 1024 / 1024}MB)")
            if (downloadedMmprojFiles.isNotEmpty()) {
                Log.i(TAG, "Model has vision support (mmproj included)")
            }
            
            mapOf(
                "success" to true,
                "filename" to outputFilename,
                "note" to if (downloadedMmprojFiles.isNotEmpty()) {
                    "Model saved with vision support"
                } else {
                    "Model saved as $outputFilename"
                }
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
    fun importFromUri(sourceUri: android.net.Uri, fileName: String): Map<String, Any?> {
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
     * Delete a model (and its associated mmproj file if exists)
     * @param filename Model filename to delete
     * @return Map with success status and error (if any)
     */
    fun deleteModel(filename: String): Map<String, Any?> {
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
            
            // Delete main model file
            val deleted = file.delete()
            if (!deleted) {
                return mapOf(
                    "success" to false,
                    "error" to "Failed to delete file"
                )
            }
            
            Log.i(TAG, "Deleted model: $filename")
            
            // Also delete corresponding mmproj file if it exists (cascade delete)
            val mmprojFile = File(modelsDir, "mmproj-$filename")
            if (mmprojFile.exists()) {
                val mmprojDeleted = mmprojFile.delete()
                if (mmprojDeleted) {
                    Log.i(TAG, "Cascade deleted mmproj file: mmproj-$filename")
                } else {
                    Log.w(TAG, "Failed to delete mmproj file: mmproj-$filename")
                }
            }
            
            mapOf("success" to true)
            
        } catch (e: Exception) {
            Log.e(TAG, "Delete failed", e)
            mapOf(
                "success" to false,
                "error" to "Delete failed: ${e.message}"
            )
        }
    }
}
