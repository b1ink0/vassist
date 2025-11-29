package com.vassist.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.MimeTypeMap
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
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
    
    override fun onDestroy() {
        ViewCompat.setOnApplyWindowInsetsListener(webView, null)
        webView.destroy()
        super.onDestroy()
    }
}
