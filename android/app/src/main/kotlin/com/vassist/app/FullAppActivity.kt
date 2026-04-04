package com.vassist.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.MimeTypeMap
import android.webkit.PermissionRequest
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
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import com.vassist.app.ai.LocalAIBridge
import com.vassist.app.ai.LocalAIServer
import com.vassist.app.webview.RendererWebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.InputStream

/**
 * Activity that displays the full VAssist app with chat and settings
 */
class FullAppActivity : ComponentActivity() {
    
    companion object {
        private const val TAG = "FullAppActivity"
        // Load in full app mode (not wallpaper mode)
        const val APP_URL = "https://${RendererWebView.ASSET_LOADER_DOMAIN}/index.html?mode=app"
        private const val REQUEST_CHOOSE_IMAGE = 1001
    }
    
    private lateinit var webView: WebView
    private var lastKeyboardHeight = 0
    
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    private var aiServer: LocalAIServer? = null
    private var aiBridge: LocalAIBridge? = null
    private var aiInitialized = false
    
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermissionRequest: PermissionRequest? = null
    private var cameraPhotoUri: Uri? = null
    
    private val microphonePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        pendingPermissionRequest?.let { request ->
            runOnUiThread {
                if (isGranted) {
                    Log.d(TAG, "Microphone permission granted, allowing WebView access")
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else {
                    Log.d(TAG, "Microphone permission denied")
                    request.deny()
                }
            }
            pendingPermissionRequest = null
        }
    }
    
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
    
    private val modelImportLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            handleModelImport(uri)
        } else {
            aiBridge?.emitImportError("No file selected")
        }
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
            
            // Handle permission requests from WebView (microphone, camera, etc.)
            override fun onPermissionRequest(request: PermissionRequest?) {
                runOnUiThread {
                    request?.let { permRequest ->
                        val resources = permRequest.resources
                        Log.d(TAG, "WebView permission request: ${resources.joinToString()} from ${permRequest.origin}")
                        
                        if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                            if (ContextCompat.checkSelfPermission(
                                    this@FullAppActivity, 
                                    Manifest.permission.RECORD_AUDIO
                                ) == PackageManager.PERMISSION_GRANTED
                            ) {
                                Log.d(TAG, "Microphone permission already granted, allowing WebView")
                                permRequest.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                            } else {
                                Log.d(TAG, "Requesting microphone permission from user")
                                pendingPermissionRequest = permRequest
                                microphonePermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        } else {
                            permRequest.grant(resources)
                        }
                    }
                }
            }
            
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback
                
                try {
                    // Check if capture attribute is present (for camera)
                    val isCaptureMode = fileChooserParams?.isCaptureEnabled ?: false
                    
                    val acceptTypes = fileChooserParams?.acceptTypes ?: arrayOf("*/*")
                    val mimeTypes = if (acceptTypes.isEmpty() || (acceptTypes.size == 1 && acceptTypes[0].isNullOrEmpty())) {
                        arrayOf("*/*")
                    } else {
                        acceptTypes.mapNotNull { type ->
                            when {
                                type.isNullOrEmpty() -> null
                                type.startsWith(".") -> {
                                    val mime = getMimeTypeFromExtension(type.substring(1))
                                    if (mime == "application/octet-stream") "*/*" else mime
                                }
                                type.contains("/") -> type
                                else -> "*/*"
                            }
                        }.toTypedArray().ifEmpty { arrayOf("*/*") }
                    }
                    
                    val hasMultipleAudioTypes = mimeTypes.count { it.startsWith("audio/") } > 1
                    val finalMimeTypes = if (hasMultipleAudioTypes) {
                        mimeTypes.filter { !it.startsWith("audio/") }.toTypedArray() + "audio/*"
                    } else {
                        mimeTypes
                    }.distinct().toTypedArray()
                    
                    Log.d(TAG, "File chooser opened with MIME types: ${finalMimeTypes.joinToString()}")
                    
                    val allowMultiple = fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE
                    
                    val isImageOnly = finalMimeTypes.all { it.startsWith("image/") }
                    val isVideoOnly = finalMimeTypes.all { it.startsWith("video/") }
                    val isImageOrVideo = finalMimeTypes.all { it.startsWith("image/") || it.startsWith("video/") }
                    
                    when {
                        isImageOnly -> {
                            Log.d(TAG, "Creating chooser for camera and gallery")
                            showImageChooser()
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
                                filePickerLauncher.launch(finalMimeTypes)
                            } else {
                                singleFilePickerLauncher.launch(finalMimeTypes)
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
            
            @Suppress("DEPRECATION")
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW)
            }
        }
        
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) 
            != PackageManager.PERMISSION_GRANTED) {
            microphonePermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
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
        
        // Initialize AI server and JavaScript interface BEFORE loading page
        initializeLocalAI()
        
        // Restore WebView state if available, otherwise load URL
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
            Log.d(TAG, "Restored WebView state from savedInstanceState")
        } else {
            webView.loadUrl(APP_URL)
            Log.d(TAG, "Loading WebView from URL: $APP_URL")
        }
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
    
    /**
     * Initialize the local AI server and add JavaScript bridge to WebView
     */
    @SuppressLint("SetJavaScriptEnabled")
    private fun initializeLocalAI() {
        // Prevent multiple initializations
        if (aiInitialized) return
        aiInitialized = true
        
        try {
            val server = LocalAIServer.getInstance(this)
            aiServer = server
            val bridge = LocalAIBridge(server, this, webView) {
                runOnUiThread {
                    modelImportLauncher.launch(arrayOf("*/*"))
                }
            }
            aiBridge = bridge
            
            webView.addJavascriptInterface(bridge, LocalAIBridge.JS_INTERFACE_NAME)
            Log.i(TAG, "Added JavaScript interface: ${LocalAIBridge.JS_INTERFACE_NAME}")
            
            // Start server in background
            scope.launch(Dispatchers.IO) {
                try {
                    if (!server.isAlive) {
                        server.start()
                        Log.i(TAG, "Local AI server started on ${LocalAIServer.getBaseUrl()}")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error starting AI server", e)
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to setup local AI", e)
        }
    }
    
    private fun handleModelImport(uri: Uri) {
        scope.launch(Dispatchers.IO) {
            try {
                // Get file name from URI
                val fileName = contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (cursor.moveToFirst() && nameIndex >= 0) {
                        cursor.getString(nameIndex)
                    } else null
                } ?: "imported_model.gguf"

                Log.i(TAG, "Importing model: $fileName from $uri")

                // Use bridge to handle import
                val result = aiBridge?.handleModelImport(uri, fileName) ?: mapOf(
                    "success" to false,
                    "error" to "AI Bridge not initialized"
                )

                // Notify JavaScript
                if (result["success"] == true) {
                    aiBridge?.emitImportComplete(result)
                } else {
                    aiBridge?.emitImportError(result["error"] as? String ?: "Unknown error")
                }

            } catch (e: Exception) {
                Log.e(TAG, "handleModelImport failed", e)
                aiBridge?.emitImportError(e.message ?: "Import failed")
            }
        }
    }
    
    private fun showImageChooser() {
        try {
            // Create camera intent
            val photoFile = java.io.File.createTempFile(
                "camera_photo_${System.currentTimeMillis()}",
                ".jpg",
                cacheDir
            )
            
            val photoUri = androidx.core.content.FileProvider.getUriForFile(
                this,
                "${packageName}.fileprovider",
                photoFile
            )
            cameraPhotoUri = photoUri
            
            val cameraIntent = android.content.Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(android.provider.MediaStore.EXTRA_OUTPUT, photoUri)
            }
            
            // Create gallery intent using ACTION_GET_CONTENT for better compatibility
            val galleryIntent = android.content.Intent(android.content.Intent.ACTION_GET_CONTENT).apply {
                type = "image/*"
                addCategory(android.content.Intent.CATEGORY_OPENABLE)
            }
            
            // Create chooser with camera as one of the options (not as initial intent)
            val chooserIntent = android.content.Intent.createChooser(galleryIntent, "Select Image")
            chooserIntent.putExtra(android.content.Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
            
            startActivityForResult(chooserIntent, REQUEST_CHOOSE_IMAGE)
        } catch (e: Exception) {
            Log.e(TAG, "Error showing image chooser", e)
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = null
        }
    }
    
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        
        if (requestCode == REQUEST_CHOOSE_IMAGE) {
            if (resultCode == RESULT_OK) {
                val uri = data?.data ?: cameraPhotoUri
                fileChooserCallback?.onReceiveValue(uri?.let { arrayOf(it) } ?: arrayOf())
            } else {
                fileChooserCallback?.onReceiveValue(null)
            }
            fileChooserCallback = null
            cameraPhotoUri = null
        }
    }
    
    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
        Log.d(TAG, "Saved WebView state to Bundle")
    }
    
    override fun onDestroy() {
        // Cancel any pending file chooser callback
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        
        scope.cancel()
        aiServer?.let { server ->
            server.shutdown()
            Log.i(TAG, "Local AI server shutdown")
        }
        aiServer = null
        aiBridge = null
        
        ViewCompat.setOnApplyWindowInsetsListener(webView, null)
        webView.destroy()
        super.onDestroy()
    }
}
