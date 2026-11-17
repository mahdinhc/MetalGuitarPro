package com.metalguitarpro

import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.HandlerThread
import android.provider.MediaStore
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.IOException
import java.util.concurrent.Executors

/**
 * Thin bridge between React Native and the C++ engine.
 *
 * Everything latency-critical (notes, parameters, transport) is a *blocking synchronous* method: it runs
 * directly on the JS thread and only pushes a command into the engine's lock-free queue (microseconds),
 * so there is no bridge batching between a touch and the audio thread.
 * Playback itself (sequencer, metronome) lives entirely inside the native audio callback.
 */
class MetalEngineModule(private val rc: ReactApplicationContext) :
    ReactContextBaseJavaModule(rc), LifecycleEventListener {

    override fun getName() = "MetalEngine"

    private val io = Executors.newSingleThreadExecutor()      // stream start/stop, ordered
    private val bg = Executors.newSingleThreadExecutor()      // slow work (WAV export)
    private var wanted = false
    private var meterThread: HandlerThread? = null
    private var meterHandler: Handler? = null
    @Volatile private var meterOn = false
    private val stats = FloatArray(7)

    init { rc.addLifecycleEventListener(this) }

    // ---- lifecycle -----------------------------------------------------------------------------
    override fun onHostResume() { if (wanted) io.execute { NativeEngine.nativeStart(); startMeter() } }
    override fun onHostPause() { stopMeter(); if (wanted) io.execute { NativeEngine.nativeStop() } }
    override fun onHostDestroy() { stopMeter(); wanted = false; io.execute { NativeEngine.nativeStop() } }

    // ---- stream --------------------------------------------------------------------------------
    @ReactMethod
    fun start(promise: Promise) {
        io.execute {
            try {
                val i = NativeEngine.nativeStart()
                wanted = true
                startMeter()
                val m = Arguments.createMap()
                m.putBoolean("ok", i[0] > 0f)
                m.putInt("sampleRate", i[1].toInt())
                m.putInt("framesPerBurst", i[2].toInt())
                m.putInt("bufferFrames", i[3].toInt())
                m.putDouble("latencyMs", i[4].toDouble())
                m.putString("api", if (i[5].toInt() == 1) "AAudio" else "OpenSL ES")
                m.putBoolean("exclusive", i[6] > 0f)
                promise.resolve(m)
            } catch (err: Throwable) {
                promise.reject("E_AUDIO", err.message ?: "audio start failed", err)
            }
        }
    }

    @ReactMethod
    fun stop() { wanted = false; stopMeter(); io.execute { NativeEngine.nativeStop() } }

    // ---- meter / transport events (30 Hz) ----------------------------------------------------------
    private val tick = object : Runnable {
        override fun run() {
            if (!meterOn) return
            NativeEngine.nativeGetStats(stats)
            if (rc.hasActiveReactInstance()) {
                val m: WritableMap = Arguments.createMap()
                m.putDouble("peak", stats[0].toDouble())
                m.putDouble("cpu", stats[1].toDouble())
                m.putDouble("beat", stats[2].toDouble())
                m.putBoolean("playing", stats[3] > 0.5f)
                m.putInt("xruns", stats[4].toInt())
                m.putInt("bufferFrames", stats[5].toInt())
                m.putDouble("latencyMs", stats[6].toDouble())
                rc.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("mgpMeter", m)
            }
            meterHandler?.postDelayed(this, 33)
        }
    }

    @Synchronized private fun startMeter() {
        if (meterOn) return
        meterOn = true
        val t = HandlerThread("mgp-meter").also { it.start() }
        meterThread = t
        meterHandler = Handler(t.looper).also { it.post(tick) }
    }

    @Synchronized private fun stopMeter() {
        meterOn = false
        meterHandler?.removeCallbacksAndMessages(null)
        meterThread?.quitSafely()
        meterThread = null; meterHandler = null
    }

    @ReactMethod fun addListener(name: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    // ---- hot path: synchronous, non-blocking pushes ---------------------------------------------------
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setParam(id: Int, v: Double): Boolean { NativeEngine.nativeSetParam(id, v.toFloat()); return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setParams(a: ReadableArray): Boolean { NativeEngine.nativeSetParams(floats(a)); return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setTuning(a: ReadableArray): Boolean {
        NativeEngine.nativeSetTuning(IntArray(6) { if (it < a.size()) a.getInt(it) else 40 }); return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun noteOn(s: Int, fret: Int, vel: Double, flags: Int, delayMs: Double): Boolean {
        NativeEngine.nativeNoteOn(s, fret, vel.toFloat(), flags, delayMs.toFloat()); return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun noteOff(s: Int, flags: Int, delayMs: Double): Boolean { NativeEngine.nativeNoteOff(s, flags, delayMs.toFloat()); return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun move(s: Int, fret: Int, flags: Int): Boolean { NativeEngine.nativeMove(s, fret, flags); return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun muteAll(ms: Double): Boolean { NativeEngine.nativeMuteAll(ms.toFloat()); return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setSequence(ev: ReadableArray, length: Double, loop: Boolean): Boolean {
        NativeEngine.nativeSetSequence(floats(ev), length, loop); return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun play(beat: Double): Boolean { NativeEngine.nativePlay(beat); return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun stopPlay(): Boolean { NativeEngine.nativeStopPlay(); return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun seek(beat: Double): Boolean { NativeEngine.nativeSeek(beat); return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setBpm(bpm: Double): Boolean { NativeEngine.nativeSetBpm(bpm); return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setMetronome(on: Boolean): Boolean { NativeEngine.nativeSetMetronome(on); return true }

    // ---- screen ---------------------------------------------------------------------------------------
    @ReactMethod
    fun setKeepAwake(on: Boolean) {
        val act = currentActivity ?: return
        act.runOnUiThread {
            if (on) act.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else act.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // ---- WAV export -------------------------------------------------------------------------------------
    @ReactMethod
    fun exportWav(
        params: ReadableArray, tuning: ReadableArray, events: ReadableArray,
        length: Double, bpm: Double, loops: Int, name: String, promise: Promise
    ) {
        val p = floats(params)
        val t = IntArray(6) { if (it < tuning.size()) tuning.getInt(it) else 40 }
        val e = floats(events)
        bg.execute {
            try {
                val tmp = File(rc.cacheDir, "bounce.wav")
                val frames = NativeEngine.nativeRenderWav(tmp.absolutePath, p, t, e, length, bpm, loops, 48000)
                if (frames <= 0) throw IOException("render failed")
                val clean = name.replace(Regex("[^A-Za-z0-9_. -]"), "_").ifBlank { "riff" }
                val shown = saveToMusic(tmp, "$clean.wav")
                tmp.delete()
                val m = Arguments.createMap()
                m.putString("path", shown); m.putInt("frames", frames); m.putDouble("seconds", frames / 48000.0)
                promise.resolve(m)
            } catch (err: Throwable) {
                promise.reject("E_EXPORT", err.message ?: "export failed", err)
            }
        }
    }

    private fun saveToMusic(src: File, displayName: String): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Audio.Media.DISPLAY_NAME, displayName)
                put(MediaStore.Audio.Media.MIME_TYPE, "audio/wav")
                put(MediaStore.Audio.Media.RELATIVE_PATH, "Music/MetalGuitarPro")
                put(MediaStore.Audio.Media.IS_PENDING, 1)
            }
            val resolver = rc.contentResolver
            val uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("could not create media entry")
            resolver.openOutputStream(uri)?.use { out -> src.inputStream().use { it.copyTo(out) } }
                ?: throw IOException("could not open output")
            values.clear(); values.put(MediaStore.Audio.Media.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return "Music/MetalGuitarPro/$displayName"
        }
        val dir = File(rc.getExternalFilesDir(Environment.DIRECTORY_MUSIC), "MetalGuitarPro").also { it.mkdirs() }
        val dst = File(dir, displayName)
        src.copyTo(dst, overwrite = true)
        return dst.absolutePath
    }

    private fun floats(a: ReadableArray) = FloatArray(a.size()) { a.getDouble(it).toFloat() }
}
