package com.vassist.app.service

import android.app.Presentation
import android.content.Context
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.service.wallpaper.WallpaperService
import android.util.DisplayMetrics
import android.util.Log
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.ViewGroup
import com.vassist.app.webview.RendererWebView

/**
 * Live Wallpaper Service for VAssist
 * Renders the web app as a live wallpaper using a WebView
 */
class VAssistWallpaperService : WallpaperService() {

    companion object {
        private const val TAG = "VAssistWallpaper"
    }

    override fun onCreateEngine(): Engine {
        Log.d(TAG, "Creating wallpaper engine")
        return WallpaperEngine(this)
    }

    inner class WallpaperEngine(
        private val context: Context
    ) : WallpaperService.Engine() {

        private var rendererWebView: RendererWebView? = null
        private var virtualDisplay: VirtualDisplay? = null
        private var presentation: Presentation? = null

        override fun onCreate(surfaceHolder: SurfaceHolder?) {
            super.onCreate(surfaceHolder)
            Log.d(TAG, "Engine onCreate")
            setTouchEventsEnabled(true)
        }

        override fun onSurfaceCreated(holder: SurfaceHolder?) {
            super.onSurfaceCreated(holder)
            Log.d(TAG, "Surface created")
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
            super.onSurfaceChanged(holder, format, width, height)
            Log.d(TAG, "Surface changed: ${width}x${height}")
            
            // Clean up previous display
            cleanup()

            val flags = DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY
            
            val metrics = resources.displayMetrics
            val density = metrics.densityDpi
            Log.d(TAG, "Using screen density: $density DPI")

            val displayManager = getSystemService(DISPLAY_SERVICE) as DisplayManager
            virtualDisplay = displayManager.createVirtualDisplay(
                "VAssistWallpaper",
                width,
                height,
                density,
                holder.surface,
                flags
            )
            
            virtualDisplay?.let { vd ->
                Log.d(TAG, "Virtual display created")
                presentation = Presentation(context, vd.display)
                presentation?.show()

                // Create WebView with full dimensions
                rendererWebView = RendererWebView(presentation!!.context, width, height)
                rendererWebView?.bringToFront()
                
                rendererWebView?.let { webView ->
                    val params = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    presentation?.setContentView(webView, params)
                    
                    val url = RendererWebView.BASE_URL
                    Log.d(TAG, "Loading URL: $url")
                    webView.loadUrl(url)
                }
            } ?: Log.e(TAG, "Failed to create virtual display")
        }

        override fun onVisibilityChanged(visible: Boolean) {
            super.onVisibilityChanged(visible)
            Log.d(TAG, "Visibility changed: $visible")
            
            if (visible) {
                rendererWebView?.let { webView ->
                    val currentUrl = webView.url
                    Log.d(TAG, "Current URL: $currentUrl")
                    if (currentUrl.isNullOrEmpty() || currentUrl == "about:blank") {
                        val url = RendererWebView.BASE_URL
                        Log.d(TAG, "Reloading URL: $url")
                        webView.loadUrl(url)
                    }
                }
            }
        }

        override fun onTouchEvent(event: MotionEvent) {
            super.onTouchEvent(event)
            rendererWebView?.dispatchTouchEvent(event)
        }

        override fun onDestroy() {
            Log.d(TAG, "Engine onDestroy")
            cleanup()
            super.onDestroy()
        }
        
        private fun cleanup() {
            rendererWebView?.loadUrl("about:blank")
            rendererWebView?.destroy()
            rendererWebView = null
            presentation?.dismiss()
            presentation = null
            virtualDisplay?.release()
            virtualDisplay = null
        }
    }
}
