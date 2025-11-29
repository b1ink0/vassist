package com.vassist.app.webview

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.webkit.ConsoleMessage
import android.webkit.MimeTypeMap
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.util.Log
import androidx.webkit.WebViewAssetLoader
import java.io.InputStream

/**
 * Custom WebView for rendering the VAssist app as a live wallpaper
 * Uses WebViewAssetLoader to serve local assets via HTTPS, enabling fetch() for WASM files
 */
@SuppressLint("SetJavaScriptEnabled")
class RendererWebView(
    context: Context,
    private val width: Int,
    private val height: Int
) : WebView(context) {

    companion object {
        private const val TAG = "RendererWebView"
        const val ASSET_LOADER_DOMAIN = "vassist.app"
        // Serve from root since assets are in public/ folder
        const val BASE_URL = "https://$ASSET_LOADER_DOMAIN/index.html"
    }

    private var firstLoad = true
    private var isPaused = false
    
    /**
     * Pause the wallpaper rendering (called when wallpaper is not visible)
     */
    fun pauseWallpaper() {
        if (!isPaused) {
            isPaused = true
            Log.d(TAG, "Pausing wallpaper")
            evaluateJavascript("window.dispatchEvent(new CustomEvent('wallpaperVisibility', { detail: { visible: false } }));", null)
            onPause()
        }
    }
    
    /**
     * Resume the wallpaper rendering (called when wallpaper becomes visible)
     */
    fun resumeWallpaper() {
        if (isPaused) {
            isPaused = false
            Log.d(TAG, "Resuming wallpaper")
            onResume()
            evaluateJavascript("window.dispatchEvent(new CustomEvent('wallpaperVisibility', { detail: { visible: true } }));", null)
        }
    }
    
    /**
     * Custom PathHandler that serves assets from the public/ subfolder
     */
    private inner class PublicAssetsPathHandler(private val context: Context) : WebViewAssetLoader.PathHandler {
        override fun handle(path: String): WebResourceResponse? {
            return try {
                // Prepend "public/" to the requested path
                val assetPath = "public/$path"
                Log.d(TAG, "Loading asset: $assetPath")
                
                val inputStream: InputStream = context.assets.open(assetPath)
                val mimeType = guessMimeType(path)
                
                WebResourceResponse(mimeType, "UTF-8", inputStream)
            } catch (e: Exception) {
                Log.e(TAG, "Error loading asset: public/$path - ${e.message}")
                null
            }
        }
        
        private fun guessMimeType(path: String): String {
            val extension = MimeTypeMap.getFileExtensionFromUrl(path)
            return when (extension?.lowercase()) {
                "html" -> "text/html"
                "js" -> "application/javascript"
                "mjs" -> "application/javascript"
                "css" -> "text/css"
                "json" -> "application/json"
                "png" -> "image/png"
                "jpg", "jpeg" -> "image/jpeg"
                "gif" -> "image/gif"
                "svg" -> "image/svg+xml"
                "wasm" -> "application/wasm"
                "woff" -> "font/woff"
                "woff2" -> "font/woff2"
                "ttf" -> "font/ttf"
                "otf" -> "font/otf"
                "mp3" -> "audio/mpeg"
                "wav" -> "audio/wav"
                "ogg" -> "audio/ogg"
                "mp4" -> "video/mp4"
                "webm" -> "video/webm"
                "bvmd" -> "application/octet-stream"
                "pmx" -> "application/octet-stream"
                "vmd" -> "application/octet-stream"
                "bpmx" -> "application/octet-stream"
                else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "application/octet-stream"
            }
        }
    }
    
    // WebViewAssetLoader to serve local assets via HTTPS
    // Maps root "/" to "public/" folder in assets using custom handler
    private val assetLoader = WebViewAssetLoader.Builder()
        .setDomain(ASSET_LOADER_DOMAIN)
        .addPathHandler("/", PublicAssetsPathHandler(context))
        .build()

    /**
     * Helper to add Cross-Origin headers required for SharedArrayBuffer
     */
    private fun addCrossOriginHeaders(response: WebResourceResponse?): WebResourceResponse? {
        if (response == null) return null
        
        val headers = response.responseHeaders?.toMutableMap() ?: mutableMapOf()
        headers["Cross-Origin-Opener-Policy"] = "same-origin"
        headers["Cross-Origin-Embedder-Policy"] = "require-corp"
        headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        response.responseHeaders = headers
        
        return response
    }
    
    private val webViewClient = object : WebViewClient() {
        
        // Intercept requests to serve local assets via WebViewAssetLoader
        // Add Cross-Origin headers to ALL responses for SharedArrayBuffer support
        override fun shouldInterceptRequest(
            view: WebView?,
            request: WebResourceRequest?
        ): WebResourceResponse? {
            request?.url?.let { url ->
                Log.d(TAG, "Intercepting request: $url")
                val response = assetLoader.shouldInterceptRequest(url)
                return addCrossOriginHeaders(response)
            }
            return super.shouldInterceptRequest(view, request)
        }
        
        override fun shouldOverrideUrlLoading(
            view: WebView?,
            request: WebResourceRequest?
        ): Boolean {
            Log.d(TAG, "shouldOverrideUrlLoading: ${request?.url}")
            return false
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
            super.onPageStarted(view, url, favicon)
            Log.d(TAG, "Page started loading: $url")
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            super.onPageFinished(view, url)
            Log.d(TAG, "Page finished loading: $url")
            if (firstLoad) {
                firstLoad = false
            }
        }
        
        override fun onReceivedError(
            view: WebView?,
            errorCode: Int,
            description: String?,
            failingUrl: String?
        ) {
            Log.e(TAG, "WebView error: $errorCode - $description at $failingUrl")
            super.onReceivedError(view, errorCode, description, failingUrl)
        }

        override fun onReceivedError(
            view: WebView?,
            request: WebResourceRequest?,
            error: android.webkit.WebResourceError?
        ) {
            Log.e(TAG, "WebView resource error: ${error?.errorCode} - ${error?.description} at ${request?.url}")
            super.onReceivedError(view, request, error)
        }

        override fun onReceivedHttpError(
            view: WebView?,
            request: WebResourceRequest?,
            errorResponse: android.webkit.WebResourceResponse?
        ) {
            Log.e(TAG, "HTTP error: ${errorResponse?.statusCode} for ${request?.url}")
            super.onReceivedHttpError(view, request, errorResponse)
        }
    }
    
    private val webChromeClient = object : WebChromeClient() {
        override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
            consoleMessage?.let {
                Log.d(TAG, "Console: ${it.message()} -- From line ${it.lineNumber()} of ${it.sourceId()}")
            }
            return true
        }
    }

    init {
        // Enable debugging for development
        setWebContentsDebuggingEnabled(true)
        
        // Configure WebView settings
        settings.apply {
            javaScriptEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            domStorageEnabled = true
            databaseEnabled = true
            
            // File access settings
            allowFileAccess = true
            allowContentAccess = true
            
            useWideViewPort = true
            loadWithOverviewMode = true
            
            // Enable hardware acceleration
            setLayerType(LAYER_TYPE_HARDWARE, null)
            
            // Allow mixed content
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            
            // Media settings
            mediaPlaybackRequiresUserGesture = false
            
            // WebGL and 3D support
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }
        
        // Make interactive
        isClickable = true
        isFocusable = true
        isFocusableInTouchMode = true
        
        // Set transparent background
        setBackgroundColor(Color.TRANSPARENT)
        
        setWebViewClient(webViewClient)
        setWebChromeClient(webChromeClient)
        
        Log.d(TAG, "RendererWebView initialized with WebViewAssetLoader, dimensions: ${width}x${height}")
    }
}
