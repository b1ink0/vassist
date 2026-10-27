package com.vassist.app.ar

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.util.Log
import android.view.ViewGroup
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.ar.core.Anchor
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Camera
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.HitResult
import com.google.ar.core.LightEstimate
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.FatalException
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

class ARCoreSessionManager(
    private val activity: Activity,
    private val glSurfaceView: GLSurfaceView,
    private val surfaceContainer: ViewGroup
) : GLSurfaceView.Renderer {
    data class StartResult(val success: Boolean, val error: String? = null)

    companion object {
        private const val TAG = "VASSIST_AR"
        private const val CAMERA_PERMISSION_REQUEST = 1002
        private const val PLANE_UPDATE_INTERVAL_NS = 500_000_000L
        private const val LIGHT_UPDATE_INTERVAL_NS = 250_000_000L
    }

    private var session: Session? = null
    private val backgroundRenderer = CameraBackgroundRenderer()
    var bridge: NativeARBridge? = null

    @Volatile
    private var isSessionRunning = false

    @Volatile
    private var currentFrame: Frame? = null

    private val anchors = ConcurrentHashMap<String, Anchor>()
    private var surfaceWidth = 0
    private var surfaceHeight = 0
    private var lastPlaneUpdate = 0L
    private var lastLightUpdate = 0L
    private var installRequested = false
    private var resumeAfterHostPause = false
    private var frameCount = 0L
    private var lastHitAvailable: Boolean? = null
    private var lastPlaneCount = -1
    private var lastTrackingState: TrackingState? = null

    init {
        glSurfaceView.preserveEGLContextOnPause = true
        glSurfaceView.setEGLContextClientVersion(2)
        glSurfaceView.setEGLConfigChooser(8, 8, 8, 8, 16, 0)
        glSurfaceView.setRenderer(this)
        glSurfaceView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    }

    private fun attachSurface() {
        val currentParent = glSurfaceView.parent as? ViewGroup
        if (currentParent === surfaceContainer) return
        currentParent?.removeView(glSurfaceView)
        // Index zero keeps the native camera underneath the transparent WebView.
        surfaceContainer.addView(glSurfaceView, 0)
    }

    private fun detachSurface() {
        (glSurfaceView.parent as? ViewGroup)?.removeView(glSurfaceView)
    }

    fun isSupported(): Boolean =
        ArCoreApk.getInstance().checkAvailability(activity).isSupported

    fun startSession(): StartResult {
        Log.i(TAG, "session:start requested")
        if (
            ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.CAMERA),
                CAMERA_PERMISSION_REQUEST
            )
            return StartResult(false, "Camera permission is required. Grant it, then try AR again.")
        }

        if (isSessionRunning) return StartResult(true)

        try {
            when (ArCoreApk.getInstance().requestInstall(activity, !installRequested)) {
                ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
                    installRequested = true
                    return StartResult(
                        false,
                        "Finish installing Google Play Services for AR, then try again."
                    )
                }
                ArCoreApk.InstallStatus.INSTALLED -> Unit
            }
        } catch (error: Exception) {
            Log.e(TAG, "Google Play Services for AR is unavailable", error)
            return StartResult(false, error.message ?: "Google Play Services for AR is unavailable")
        }

        if (session == null) {
            try {
                session = Session(activity).also { newSession ->
                    newSession.configure(
                        Config(newSession).apply {
                            updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
                            focusMode = Config.FocusMode.AUTO
                            planeFindingMode = Config.PlaneFindingMode.HORIZONTAL
                            lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR
                        }
                    )
                }
            } catch (error: Exception) {
                Log.e(TAG, "Failed to create ARCore session", error)
                return StartResult(false, error.message ?: "Failed to create ARCore session")
            }
        }

        return try {
            val currentSession = session ?: return StartResult(false, "ARCore session is unavailable")
            attachSurface()
            if (surfaceWidth > 0 && surfaceHeight > 0) {
                currentSession.setDisplayGeometry(
                    activity.windowManager.defaultDisplay.rotation,
                    surfaceWidth,
                    surfaceHeight
                )
            }
            currentSession.resume()
            glSurfaceView.onResume()
            isSessionRunning = true
            Log.i(TAG, "session:started surface=${surfaceWidth}x$surfaceHeight")
            StartResult(true)
        } catch (error: Exception) {
            val message = if (error is FatalException) {
                discardFailedSession()
                "ARCore could not access the camera or motion sensors. The AR session was reset. Close other camera or AR apps, then tap AR again."
            } else {
                detachSurface()
                error.message ?: "Failed to start ARCore"
            }
            Log.e(TAG, "Failed to resume ARCore session", error)
            StartResult(false, message)
        }
    }

    private fun discardFailedSession() {
        isSessionRunning = false
        resumeAfterHostPause = false
        currentFrame = null
        anchors.values.forEach { anchor ->
            runCatching { anchor.detach() }
        }
        anchors.clear()
        runCatching { session?.close() }
            .onFailure { error -> Log.w(TAG, "Failed to close invalid ARCore session", error) }
        session = null
        detachSurface()
        Log.i(TAG, "session:fatal-session-discarded; next start will create a fresh session")
    }

    fun stopSession() {
        if (isSessionRunning) {
            glSurfaceView.onPause()
            session?.pause()
        }
        isSessionRunning = false
        resumeAfterHostPause = false
        currentFrame = null
        detachSurface()
        Log.i(TAG, "session:stopped")
    }

    fun onHostPause() {
        resumeAfterHostPause = isSessionRunning
        if (!isSessionRunning) return
        glSurfaceView.onPause()
        session?.pause()
        isSessionRunning = false
        detachSurface()
    }

    fun onHostResume() {
        if (!resumeAfterHostPause || isSessionRunning) return
        try {
            attachSurface()
            session?.resume()
            glSurfaceView.onResume()
            isSessionRunning = true
        } catch (error: Exception) {
            resumeAfterHostPause = false
            if (error is FatalException) {
                discardFailedSession()
            } else {
                detachSurface()
            }
            Log.e(TAG, "Failed to resume ARCore after activity pause", error)
        }
    }

    fun dispose() {
        stopSession()
        anchors.values.forEach(Anchor::detach)
        anchors.clear()
        session?.close()
        session = null
    }

    fun hitTestAsync(
        normalizedX: Float,
        normalizedY: Float,
        callback: (JSONObject?) -> Unit
    ) {
        if (!isSessionRunning) {
            callback(null)
            return
        }
        glSurfaceView.queueEvent {
            val result = hitTestOnGlThread(normalizedX, normalizedY)
            activity.runOnUiThread { callback(result) }
        }
    }

    private fun hitTestOnGlThread(normalizedX: Float, normalizedY: Float): JSONObject? {
        val frame = currentFrame ?: return null
        val x = normalizedX.coerceIn(0f, 1f) * surfaceWidth
        val y = normalizedY.coerceIn(0f, 1f) * surfaceHeight
        val result = findPlaneHit(frame, x, y)?.let { hit ->
            formatHitResult(hit, normalizedX, normalizedY)
        }
        val available = result != null
        if (lastHitAvailable != available) {
            lastHitAvailable = available
            Log.i(TAG, "hit:${if (available) "surface-found" else "surface-lost"} at=$x,$y")
        }
        return result
    }

    fun createAnchorAsync(
        worldX: Float,
        worldY: Float,
        worldZ: Float,
        callback: (JSONObject?) -> Unit
    ) {
        if (!isSessionRunning) {
            callback(null)
            return
        }
        glSurfaceView.queueEvent {
            val anchor = createAnchorOnGlThread(worldX, worldY, worldZ)
            activity.runOnUiThread { callback(anchor) }
        }
    }

    private fun createAnchorOnGlThread(
        worldX: Float,
        worldY: Float,
        worldZ: Float
    ): JSONObject? {
        val currentSession = session ?: return null
        if (!worldX.isFinite() || !worldY.isFinite() || !worldZ.isFinite()) return null
        anchors.values.forEach(Anchor::detach)
        anchors.clear()
        // Anchor the exact world point previously returned for the visible
        // reticle. Re-running hitTest here can select a different point when
        // the phone moves between the reticle update and the tap callback.
        val anchor = currentSession.createAnchor(
            Pose.makeTranslation(worldX, worldY, worldZ)
        )
        val id = "anchor_${anchor.hashCode()}"
        anchors[id] = anchor
        Log.i(TAG, "anchor:created id=$id pose=${anchor.pose.tx()},${anchor.pose.ty()},${anchor.pose.tz()}")
        return formatAnchor(anchor, id)
    }

    private fun findPlaneHit(frame: Frame, x: Float, y: Float): HitResult? =
        frame.hitTest(x, y).firstOrNull { hit ->
            val trackable = hit.trackable
            trackable is Plane &&
                trackable.type == Plane.Type.HORIZONTAL_UPWARD_FACING &&
                trackable.trackingState == TrackingState.TRACKING &&
                trackable.isPoseInPolygon(hit.hitPose)
        }

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        Log.i(TAG, "surface:created")
        GLES20.glClearColor(0f, 0f, 0f, 0f)
        backgroundRenderer.createOnGlThread()
        session?.setCameraTextureName(backgroundRenderer.textureId)
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        Log.i(TAG, "surface:changed ${width}x$height")
        surfaceWidth = width
        surfaceHeight = height
        GLES20.glViewport(0, 0, width, height)
        session?.setDisplayGeometry(
            activity.windowManager.defaultDisplay.rotation,
            width,
            height
        )
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        if (!isSessionRunning) return
        val currentSession = session ?: return

        try {
            currentSession.setCameraTextureName(backgroundRenderer.textureId)
            val frame = currentSession.update()
            currentFrame = frame
            frameCount += 1
            if (lastTrackingState != frame.camera.trackingState) {
                lastTrackingState = frame.camera.trackingState
                Log.i(TAG, "tracking:${frame.camera.trackingState}")
            }
            if (frameCount % 120L == 0L) {
                Log.d(
                    TAG,
                    "frame:count=$frameCount timestamp=${frame.timestamp} " +
                        "tracking=${frame.camera.trackingState} anchors=${anchors.size}"
                )
            }
            backgroundRenderer.draw(frame)
            sendFrame(frame, frame.camera, currentSession)
        } catch (error: Exception) {
            Log.e(TAG, "ARCore render frame failed", error)
        }
    }

    private fun sendFrame(frame: Frame, camera: Camera, currentSession: Session) {
        val projection = FloatArray(16)
        val view = FloatArray(16)
        camera.getProjectionMatrix(projection, 0, 0.1f, 100f)
        camera.getViewMatrix(view, 0)

        val message = JSONObject().apply {
            put("type", "frame")
            put(
                "frame",
                JSONObject().apply {
                    put("timestamp", frame.timestamp)
                    put(
                        "camera",
                        JSONObject().apply {
                            put("projectionMatrix", JSONArray(projection))
                            put("viewMatrix", JSONArray(view))
                        }
                    )
                }
            )
            put(
                "trackingState",
                JSONObject().apply {
                    put("state", camera.trackingState.name.lowercase())
                }
            )

            if (frame.timestamp - lastPlaneUpdate >= PLANE_UPDATE_INTERVAL_NS) {
                put("planes", buildPlanes(currentSession))
                lastPlaneUpdate = frame.timestamp
            }
            if (anchors.isNotEmpty()) put("anchors", buildAnchors())
            if (frame.timestamp - lastLightUpdate >= LIGHT_UPDATE_INTERVAL_NS) {
                buildLightEstimate(frame)?.let { put("lightEstimate", it) }
                lastLightUpdate = frame.timestamp
            }
        }

        bridge?.sendFrame(message.toString())
    }

    private fun formatHitResult(
        hit: HitResult,
        normalizedX: Float,
        normalizedY: Float
    ): JSONObject {
        val pose = hit.hitPose
        return JSONObject().apply {
            put("id", "hit_${hit.trackable.hashCode()}")
            put("x", pose.tx())
            put("y", pose.ty())
            put("z", pose.tz())
            put("screenX", normalizedX)
            put("screenY", normalizedY)
        }
    }

    private fun formatAnchor(anchor: Anchor, id: String): JSONObject {
        val pose = anchor.pose
        return JSONObject().apply {
            put("id", id)
            put("x", pose.tx())
            put("y", pose.ty())
            put("z", pose.tz())
            put("qx", pose.qx())
            put("qy", pose.qy())
            put("qz", pose.qz())
            put("qw", pose.qw())
        }
    }

    private fun buildPlanes(currentSession: Session): JSONArray {
        val result = JSONArray()
        currentSession.getAllTrackables(Plane::class.java).forEach { plane ->
            if (plane.trackingState != TrackingState.TRACKING) return@forEach
            result.put(
                JSONObject().apply {
                    put("id", "plane_${plane.hashCode()}")
                    put("type", plane.type.name.lowercase())
                    put(
                        "center",
                        JSONArray(
                            floatArrayOf(
                                plane.centerPose.tx(),
                                plane.centerPose.ty(),
                                plane.centerPose.tz()
                            )
                        )
                    )
                    val polygon = JSONArray()
                    val points = plane.polygon
                    for (index in 0 until points.limit()) polygon.put(points[index])
                    put("polygon", polygon)
                }
            )
        }
        if (lastPlaneCount != result.length()) {
            lastPlaneCount = result.length()
            Log.i(TAG, "planes:count=$lastPlaneCount")
        }
        return result
    }

    private fun buildAnchors(): JSONArray = JSONArray().apply {
        anchors.forEach { (id, anchor) ->
            if (anchor.trackingState == TrackingState.TRACKING) {
                put(formatAnchor(anchor, id))
            }
        }
    }

    private fun buildLightEstimate(frame: Frame): JSONObject? {
        val estimate = frame.lightEstimate
        if (estimate.state != LightEstimate.State.VALID) return null

        return JSONObject().apply {
            put(
                "sphericalHarmonics",
                JSONArray(estimate.environmentalHdrAmbientSphericalHarmonics)
            )
            put(
                "mainLightDirection",
                JSONArray(estimate.environmentalHdrMainLightDirection)
            )
            put(
                "mainLightIntensity",
                JSONArray(estimate.environmentalHdrMainLightIntensity)
            )
        }
    }
}
