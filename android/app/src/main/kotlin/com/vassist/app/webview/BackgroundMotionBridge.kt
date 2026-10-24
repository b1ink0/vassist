package com.vassist.app.webview

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Surface
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.sqrt

/** Provides low-rate, lifecycle-bound tilt data to the local background renderer. */
class BackgroundMotionBridge(
    context: Context,
    private val webView: WebView,
) : SensorEventListener {
    companion object {
        const val JS_INTERFACE_NAME = "VAssistBackgroundMotion"
        private const val TAG = "BackgroundMotion"
        private const val RECENTER_DELAY_MS = 350L
        private const val RECENTER_TIME_MS = 850.0
        private const val SPEED_FILTER_TIME_MS = 70.0
        private const val MAX_TILT_DEGREES = 12.0
        private const val MAX_AZIMUTH_DEGREES = 45.0
        private const val MAX_ANGULAR_SPEED_DEGREES_PER_SECOND = 180.0
        private const val MAX_ANGULAR_ACCELERATION_DEGREES_PER_SECOND_SQUARED = 2_400.0
        private const val ANGULAR_SPEED_GAIN = 0.3
        private const val ANGULAR_ACCELERATION_GAIN = 0.06
        private const val AZIMUTH_SPEED_GAIN = 0.12
        private const val AZIMUTH_ACCELERATION_GAIN = 0.02
        private const val MOTION_SPEED_THRESHOLD = 0.8
    }

    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val sensor = sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
        ?: sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private var requested = false
    private var hostVisible = false
    private var disposed = false
    private var registered = false
    private var pitch = 0.0
    private var roll = 0.0
    private var azimuth = 0.0
    private var previousPitch = 0.0
    private var previousRoll = 0.0
    private var previousAzimuth = 0.0
    private var filteredPitchSpeed = 0.0
    private var filteredRollSpeed = 0.0
    private var filteredAzimuthSpeed = 0.0
    private var previousSensorTimestamp = 0L
    private var neutralPitch: Double? = null
    private var neutralRoll: Double? = null
    private var neutralAzimuth: Double? = null
    private var lastMotionAt = 0L
    private var lastSentX = 0.0
    private var lastSentY = 0.0

    @JavascriptInterface
    fun start() {
        mainHandler.post {
            if (disposed) return@post
            requested = true
            updateRegistration()
        }
    }

    @JavascriptInterface
    fun stop() {
        mainHandler.post {
            requested = false
            updateRegistration()
        }
    }

    fun setHostVisible(visible: Boolean) {
        mainHandler.post {
            if (disposed) return@post
            hostVisible = visible
            updateRegistration()
        }
    }

    fun dispose() {
        mainHandler.post {
            if (disposed) return@post
            requested = false
            hostVisible = false
            disposed = true
            stopSensor()
        }
    }

    private fun updateRegistration() {
        val shouldRun = requested && hostVisible && sensor != null && !disposed
        if (shouldRun == registered) return

        if (shouldRun) {
            val motionSensor = sensor ?: return
            neutralPitch = null
            neutralRoll = null
            neutralAzimuth = null
            previousSensorTimestamp = 0L
            filteredPitchSpeed = 0.0
            filteredRollSpeed = 0.0
            filteredAzimuthSpeed = 0.0
            registered = sensorManager.registerListener(
                this,
                motionSensor,
                SensorManager.SENSOR_DELAY_GAME,
                mainHandler,
            )
            if (registered) {
                emit(0.0, 0.0)
            } else {
                Log.w(TAG, "Could not register the device rotation sensor")
            }
        } else {
            stopSensor()
        }
    }

    private fun stopSensor() {
        if (registered) sensorManager.unregisterListener(this)
        registered = false
        neutralPitch = null
        neutralRoll = null
        neutralAzimuth = null
        previousSensorTimestamp = 0L
        filteredPitchSpeed = 0.0
        filteredRollSpeed = 0.0
        filteredAzimuthSpeed = 0.0
        if (!disposed) emit(0.0, 0.0)
    }

    override fun onSensorChanged(event: SensorEvent) {
        val rotationMatrix = FloatArray(9)
        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
        val remappedMatrix = FloatArray(9)
        val axes = when (windowManager.defaultDisplay.rotation) {
            Surface.ROTATION_90 -> SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
            Surface.ROTATION_180 -> SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
            Surface.ROTATION_270 -> SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
            else -> SensorManager.AXIS_X to SensorManager.AXIS_Y
        }
        if (!SensorManager.remapCoordinateSystem(
                rotationMatrix,
                axes.first,
                axes.second,
                remappedMatrix,
            )
        ) return

        val orientation = FloatArray(3)
        SensorManager.getOrientation(remappedMatrix, orientation)
        val nextAzimuth = Math.toDegrees(orientation[0].toDouble())
        val nextPitch = Math.toDegrees(orientation[1].toDouble())
        val nextRoll = Math.toDegrees(orientation[2].toDouble())
        val now = SystemClock.uptimeMillis()
        val previousFilteredPitchSpeed = filteredPitchSpeed
        val previousFilteredRollSpeed = filteredRollSpeed
        val previousFilteredAzimuthSpeed = filteredAzimuthSpeed
        var elapsedMs = 0.0

        if (neutralPitch == null || neutralRoll == null || neutralAzimuth == null) {
            neutralPitch = nextPitch
            neutralRoll = nextRoll
            neutralAzimuth = nextAzimuth
            lastMotionAt = now
        }

        if (previousSensorTimestamp != 0L) {
            val elapsedSeconds =
                ((event.timestamp - previousSensorTimestamp) / 1_000_000_000.0)
                    .coerceIn(0.001, 0.2)
            elapsedMs = elapsedSeconds * 1_000.0
            val pitchSpeed = angleDelta(nextPitch, previousPitch) / elapsedSeconds
            val rollSpeed = angleDelta(nextRoll, previousRoll) / elapsedSeconds
            val azimuthSpeed = angleDelta(nextAzimuth, previousAzimuth) / elapsedSeconds
            val filterAmount = 1.0 - exp(-elapsedMs / SPEED_FILTER_TIME_MS)
            filteredPitchSpeed += (pitchSpeed - filteredPitchSpeed) * filterAmount
            filteredRollSpeed += (rollSpeed - filteredRollSpeed) * filterAmount
            filteredAzimuthSpeed += (azimuthSpeed - filteredAzimuthSpeed) * filterAmount

            if (
                sqrt(
                    filteredPitchSpeed * filteredPitchSpeed +
                        filteredRollSpeed * filteredRollSpeed +
                        filteredAzimuthSpeed * filteredAzimuthSpeed,
                ) > MOTION_SPEED_THRESHOLD
            ) {
                lastMotionAt = now
            }
        }

        previousSensorTimestamp = event.timestamp
        previousPitch = nextPitch
        previousRoll = nextRoll
        previousAzimuth = nextAzimuth
        pitch = nextPitch
        roll = nextRoll
        azimuth = nextAzimuth
        updateParallax(
            now,
            elapsedMs,
            previousFilteredPitchSpeed,
            previousFilteredRollSpeed,
            previousFilteredAzimuthSpeed,
        )
    }

    private fun updateParallax(
        now: Long,
        elapsedMs: Double,
        previousFilteredPitchSpeed: Double,
        previousFilteredRollSpeed: Double,
        previousFilteredAzimuthSpeed: Double,
    ) {
        val basePitch = neutralPitch ?: pitch.also { neutralPitch = it }
        val baseRoll = neutralRoll ?: roll.also { neutralRoll = it }
        val baseAzimuth = neutralAzimuth ?: azimuth.also { neutralAzimuth = it }

        var pitchDelta = angleDelta(pitch, basePitch)
        var rollDelta = angleDelta(roll, baseRoll)
        var azimuthDelta = angleDelta(azimuth, baseAzimuth)
        if (now - lastMotionAt > RECENTER_DELAY_MS && elapsedMs > 0.0) {
            val amount = 1.0 - exp(-elapsedMs / RECENTER_TIME_MS)
            neutralPitch = basePitch + pitchDelta * amount
            neutralRoll = baseRoll + rollDelta * amount
            neutralAzimuth = baseAzimuth + azimuthDelta * amount
            pitchDelta = angleDelta(pitch, neutralPitch ?: pitch)
            rollDelta = angleDelta(roll, neutralRoll ?: roll)
            azimuthDelta = angleDelta(azimuth, neutralAzimuth ?: azimuth)
        }

        val pitchSpeed = (filteredPitchSpeed + previousFilteredPitchSpeed) * 0.5
        val rollSpeed = (filteredRollSpeed + previousFilteredRollSpeed) * 0.5
        val azimuthSpeed =
            (filteredAzimuthSpeed + previousFilteredAzimuthSpeed) * 0.5
        val elapsedSeconds = elapsedMs / 1_000.0
        val pitchAcceleration = if (elapsedSeconds > 0.0) {
            ((filteredPitchSpeed - previousFilteredPitchSpeed) / elapsedSeconds)
                .coerceIn(
                    -MAX_ANGULAR_ACCELERATION_DEGREES_PER_SECOND_SQUARED,
                    MAX_ANGULAR_ACCELERATION_DEGREES_PER_SECOND_SQUARED,
                )
        } else {
            0.0
        }
        val rollAcceleration = if (elapsedSeconds > 0.0) {
            ((filteredRollSpeed - previousFilteredRollSpeed) / elapsedSeconds)
                .coerceIn(
                    -MAX_ANGULAR_ACCELERATION_DEGREES_PER_SECOND_SQUARED,
                    MAX_ANGULAR_ACCELERATION_DEGREES_PER_SECOND_SQUARED,
                )
        } else {
            0.0
        }
        val azimuthAcceleration = if (elapsedSeconds > 0.0) {
            ((filteredAzimuthSpeed - previousFilteredAzimuthSpeed) / elapsedSeconds)
                .coerceIn(
                    -MAX_ANGULAR_ACCELERATION_DEGREES_PER_SECOND_SQUARED,
                    MAX_ANGULAR_ACCELERATION_DEGREES_PER_SECOND_SQUARED,
                )
        } else {
            0.0
        }
        val x = (
            -rollDelta / MAX_TILT_DEGREES -
                (azimuthDelta / MAX_AZIMUTH_DEGREES) * 0.35 -
                (rollSpeed / MAX_ANGULAR_SPEED_DEGREES_PER_SECOND) * ANGULAR_SPEED_GAIN -
                (azimuthSpeed / MAX_ANGULAR_SPEED_DEGREES_PER_SECOND) * AZIMUTH_SPEED_GAIN -
                (rollAcceleration /
                    MAX_ANGULAR_ACCELERATION_DEGREES_PER_SECOND_SQUARED) *
                ANGULAR_ACCELERATION_GAIN -
                (azimuthAcceleration /
                    MAX_ANGULAR_ACCELERATION_DEGREES_PER_SECOND_SQUARED) *
                AZIMUTH_ACCELERATION_GAIN
            ).coerceIn(-1.0, 1.0)
        val y = (
            -pitchDelta / MAX_TILT_DEGREES -
                (pitchSpeed / MAX_ANGULAR_SPEED_DEGREES_PER_SECOND) * ANGULAR_SPEED_GAIN -
                (pitchAcceleration /
                    MAX_ANGULAR_ACCELERATION_DEGREES_PER_SECOND_SQUARED) *
                ANGULAR_ACCELERATION_GAIN
            ).coerceIn(-1.0, 1.0)
        if (abs(x - lastSentX) > 0.001 || abs(y - lastSentY) > 0.001) {
            emit(x, y)
        }
    }

    private fun angleDelta(value: Double, reference: Double): Double {
        return ((value - reference + 180.0 + 360.0) % 360.0) - 180.0
    }

    private fun emit(x: Double, y: Double) {
        lastSentX = x
        lastSentY = y
        val xValue = x.toString()
        val yValue = y.toString()
        val script =
            "window.dispatchEvent(new CustomEvent('vassist:background-tilt'," +
                "{detail:{x:$xValue,y:$yValue}}));"
        if (Looper.myLooper() != Looper.getMainLooper()) {
            webView.post { dispatchToWebView(script) }
        } else {
            dispatchToWebView(script)
        }
    }

    private fun dispatchToWebView(script: String) {
        if (disposed || webView.url.isNullOrEmpty() || webView.url == "about:blank") return
        webView.evaluateJavascript(script, null)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
