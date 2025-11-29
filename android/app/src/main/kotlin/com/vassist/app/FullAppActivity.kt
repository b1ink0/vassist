package com.vassist.app

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.MimeTypeMap
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import com.vassist.app.webview.RendererWebView
import java.io.InputStream

/**
 * Activity that displays the full VAssist app with chat and settings
 */
class FullAppActivity : ComponentActivity() {
    
    companion object {
        private const val TAG = "FullAppActivity"
        // Load in full app mode (not wallpaper mode)
        const val APP_URL = "https://${RendererWebView.ASSET_LOADER_DOMAIN}/index.html?mode=app"
    }
    
    private lateinit var webView: WebView
    private var lastKeyboardHeight = 0
    
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    
    private val photoPickerLauncher = registerForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        fileChooserCallback?.onReceiveValue(uri?.let { arrayOf(it) } ?: arrayOf())
        fileChooserCallback = null
    }
    
    private val multiplePhotoPickerLauncher = registerForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia()
    ) { uris: List<Uri> ->
        fileChooserCallback?.onReceiveValue(uris.toTypedArray())
        fileChooserCallback = null
    }
    
    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments()
    ) { uris: List<Uri>? ->
        fileChooserCallback?.onReceiveValue(uris?.toTypedArray() ?: arrayOf())
        fileChooserCallback = null
    }
    
    private val singleFilePickerLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        fileChooserCallback?.onReceiveValue(uri?.let { arrayOf(it) } ?: arrayOf())
        fileChooserCallback = null
    }
    
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Enable edge-to-edge and handle insets ourselves
        WindowCompat.setDecorFitsSystemWindows(window, false)
        
        // Enable WebView debugging
        WebView.setWebContentsDebuggingEnabled(true)
        
        // Create WebView
        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        
        // Custom PathHandler that serves assets from the public/ subfolder
        val publicAssetsPathHandler = object : WebViewAssetLoader.PathHandler {
            override fun handle(path: String): WebResourceResponse? {
                return try {
                    val assetPath = "public/$path"
                    Log.d(TAG, "Loading asset: $assetPath")
                    
                    val inputStream: InputStream = assets.open(assetPath)
                    val mimeType = guessMimeType(path)
                    
                    WebResourceResponse(mimeType, "UTF-8", inputStream)
                } catch (e: Exception) {
                    Log.e(TAG, "Error loading asset: public/$path - ${e.message}")
                    null
                }
            }
        }
        
        // Use the same domain as RendererWebView to share IndexedDB storage
        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(RendererWebView.ASSET_LOADER_DOMAIN)
            .addPathHandler("/", publicAssetsPathHandler)
            .build()
        
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                request?.url?.let { url ->
                    return assetLoader.shouldInterceptRequest(url)
                }
                return super.shouldInterceptRequest(view, request)
            }
            
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "Page finished loading: $url")
            }
            
            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: android.webkit.WebResourceError?
            ) {
                Log.e(TAG, "WebView error: ${error?.errorCode} - ${error?.description} at ${request?.url}")
                super.onReceivedError(view, request, error)
            }
        }
        
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                consoleMessage?.let {
                    Log.d(TAG, "Console: ${it.message()} -- From line ${it.lineNumber()} of ${it.sourceId()}")
                }
                return true
            }
            
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback
                
                try {
                    val acceptTypes = fileChooserParams?.acceptTypes ?: arrayOf("*/*")
                    val mimeTypes = if (acceptTypes.isEmpty() || (acceptTypes.size == 1 && acceptTypes[0].isNullOrEmpty())) {
                        arrayOf("*/*")
                    } else {
                        acceptTypes.mapNotNull { type ->
                            when {
                                type.isNullOrEmpty() -> null
                                type.startsWith(".") -> getMimeTypeFromExtension(type.substring(1))
                                type.contains("/") -> type
                                else -> "*/*"
                            }
                        }.toTypedArray().ifEmpty { arrayOf("*/*") }
                    }
                    
                    Log.d(TAG, "File chooser opened with MIME types: ${mimeTypes.joinToString()}")
                    
                    val allowMultiple = fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE
                    
                    val isImageOnly = mimeTypes.all { it.startsWith("image/") }
                    val isVideoOnly = mimeTypes.all { it.startsWith("video/") }
                    val isImageOrVideo = mimeTypes.all { it.startsWith("image/") || it.startsWith("video/") }
                    
                    when {
                        isImageOnly -> {
                            Log.d(TAG, "Using Photo Picker for images")
                            if (allowMultiple) {
                                multiplePhotoPickerLauncher.launch(
                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                )
                            } else {
                                photoPickerLauncher.launch(
                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                )
                            }
                        }
                        isVideoOnly -> {
                            Log.d(TAG, "Using Photo Picker for videos")
                            if (allowMultiple) {
                                multiplePhotoPickerLauncher.launch(
                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)
                                )
                            } else {
                                photoPickerLauncher.launch(
                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)
                                )
                            }
                        }
                        isImageOrVideo -> {
                            Log.d(TAG, "Using Photo Picker for images and videos")
                            if (allowMultiple) {
                                multiplePhotoPickerLauncher.launch(
                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)
                                )
                            } else {
                                photoPickerLauncher.launch(
                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)
                                )
                            }
                        }
                        else -> {
                            Log.d(TAG, "Using Document Picker for files")
                            if (allowMultiple) {
                                filePickerLauncher.launch(mimeTypes)
                            } else {
                                singleFilePickerLauncher.launch(mimeTypes)
                            }
                        }
                    }
                    
                    return true
                } catch (e: Exception) {
                    Log.e(TAG, "Error opening file chooser: ${e.message}")
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = null
                    return false
                }
            }
        }
        
        // Configure WebView settings
        webView.settings.apply {
            javaScriptEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
        }
        
        // Handle back button
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })
        
        setContentView(webView)
        
        // Setup keyboard height detection using WindowInsets
        setupKeyboardListener()
        
        // Load the app in full app mode (with UI controls)
        webView.loadUrl(APP_URL)
    }
    
    /**
     * Setup listener to detect keyboard height changes using WindowInsetsCompat
     */
    private fun setupKeyboardListener() {
        val density = resources.displayMetrics.density
        
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
            val keyboardHeightPx = imeInsets.bottom
            
            if (keyboardHeightPx != lastKeyboardHeight) {
                lastKeyboardHeight = keyboardHeightPx
                
                val keyboardHeightCss = (keyboardHeightPx / density).toInt()
                
                Log.d(TAG, "Keyboard height changed: ${keyboardHeightPx}px physical -> ${keyboardHeightCss}px CSS (density: $density)")
                
                webView.post {
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('keyboardHeightChange', { detail: { height: $keyboardHeightCss } }));",
                        null
                    )
                }
            }
            
            insets
        }
    }
    
    private fun guessMimeType(path: String): String {
        val extension = MimeTypeMap.getFileExtensionFromUrl(path)
        return getMimeTypeFromExtension(extension ?: "") ?: "application/octet-stream"
    }
    
    /**
     * Get MIME type from file extension
     */
    private fun getMimeTypeFromExtension(extension: String): String? {
        return when (extension.lowercase()) {
            "html" -> "text/html"
            "js" -> "application/javascript"
            "mjs" -> "application/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "gif" -> "image/gif"
            "svg" -> "image/svg+xml"
            "webp" -> "image/webp"
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
            "zip" -> "application/zip"
            "pdf" -> "application/pdf"
            else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
        }
    }
    
    override fun onDestroy() {
        // Cancel any pending file chooser callback
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        
        ViewCompat.setOnApplyWindowInsetsListener(webView, null)
        webView.destroy()
        super.onDestroy()
    }
}
