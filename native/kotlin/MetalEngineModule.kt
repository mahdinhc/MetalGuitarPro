package com.metalguitarpro

import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.HandlerThread
import android.provider.MediaStore
import android.util.Log
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.IOException
import java.util.concurrent.Executors

private const val TAG = "MetalEngine"

/**
 * Thin bridge between React Native and the C++ engine.
 *
 * Everything latency-critical (notes, parameters, transport) is a *blocking synchronous* method: it runs
 * directly on the JS thread and only pushes a command into the engine's lock-free queue (microseconds),
 * so there is no bridge batching between a touch and the audio thread.
 * Playback itself (sequencer, metronome) lives entirely inside the native audio callback.
 *
 * Robustness rules for this class:
 *  - no Throwable may escape a @ReactMethod or a background thread (an escaped Error kills the whole app);
 *  - a missing/broken native library degrades to a silent no-op engine instead of a crash;
 *  - stream start/stop from every module instance goes through ONE process-wide executor, so a reloaded
 *    module can never stop the stream that its successor just started.
 */
class MetalEngineModule(private val rc: ReactApplicationContext) :
    ReactContextBaseJavaModule(rc), LifecycleEventListener {

    override fun getName() = "MetalEngine"

    private companion object {
        val io = Executors.newSingleThreadExecutor { r -> Thread(r, "mgp-audio-io").apply { isDaemon = true } }
        val bg = Executors.newSingleThreadExecutor { r -> Thread(r, "mgp-export").apply { isDaemon = true } }
    }

    @Volatile private var wanted = false
    private var meterThread: HandlerThread? = null
    private var meterHandler: Handler? = null
    @Volatile private var meterOn = false
    private val stats = FloatArray(7)

    init { try { rc.addLifecycleEventListener(this) } catch (t: Throwable) { Log.e(TAG, "listener", t) } }

    /** Runs [f] only if the native library is loaded; swallows (and logs) anything it throws. */
    private inline fun guard(what: String, f: () -> Unit) {
        if (!NativeEngine.loaded) return
        try { f() } catch (t: Throwable) { Log.e(TAG, "$what failed", t) }
    }
    private fun post(what: String, f: () -> Unit) {
        try { io.execute { try { f() } catch (t: Throwable) { Log.e(TAG, "$what failed", t) } } }
        catch (t: Throwable) { Log.e(TAG, "$what rejected", t) }
    }

    // ---- lifecycle -----------------------------------------------------------------------------
    override fun onHostResume() { if (wanted) post("resume") { guard("start") { NativeEngine.nativeStart(); startMeter() } } }
    override fun onHostPause() { stopMeter(); if (wanted) post("pause") { guard("stop") { NativeEngine.nativeStop() } } }
    override fun onHostDestroy() { stopMeter(); wanted = false; post("destroy") { guard("stop") { NativeEngine.nativeStop() } } }

    override fun invalidate() {
        try { rc.removeLifecycleEventListener(this) } catch (_: Throwable) {}
        stopMeter()
        if (wanted) { wanted = false; post("invalidate") { guard("stop") { NativeEngine.nativeStop() } } }
        super.invalidate()
    }

    // ---- stream --------------------------------------------------------------------------------
    @ReactMethod
    fun start(promise: Promise) {
        try {
            io.execute {
                try {
                    val m = Arguments.createMap()
                    if (!NativeEngine.loaded) {
                        m.putBoolean("ok", false)
                        m.putString("error", "Audio engine not loaded: ${NativeEngine.loadError ?: "unknown reason"}")
                        promise.resolve(m); return@execute
                    }
                    val i = NativeEngine.nativeStart()
                    wanted = true
                    startMeter()
                    m.putBoolean("ok", i.size > 6 && i[0] > 0f)
                    m.putInt("sampleRate", i.getOrElse(1) { 0f }.toInt())
                    m.putInt("framesPerBurst", i.getOrElse(2) { 0f }.toInt())
                    m.putInt("bufferFrames", i.getOrElse(3) { 0f }.toInt())
                    m.putDouble("latencyMs", i.getOrElse(4) { 0f }.toDouble())
                    m.putString("api", if (i.getOrElse(5) { 0f }.toInt() == 1) "AAudio" else "OpenSL ES")
                    m.putBoolean("exclusive", i.getOrElse(6) { 0f } > 0f)
                    promise.resolve(m)
                } catch (err: Throwable) {
                    Log.e(TAG, "start failed", err)
                    try { promise.reject("E_AUDIO", err.message ?: "audio start failed", err) } catch (_: Throwable) {}
                }
            }
        } catch (err: Throwable) {
            try { promise.reject("E_AUDIO", err.message ?: "audio start failed", err) } catch (_: Throwable) {}
        }
    }

    @ReactMethod
    fun stop() { wanted = false; stopMeter(); post("stop") { guard("stop") { NativeEngine.nativeStop() } } }

    /** Lets JS ask why there is no sound (library missing, stream refused). */
    @ReactMethod
    fun getStatus(promise: Promise) {
        try {
            val m = Arguments.createMap()
            m.putBoolean("loaded", NativeEngine.loaded)
            m.putString("error", NativeEngine.loadError)
            m.putInt("sdk", Build.VERSION.SDK_INT)
            promise.resolve(m)
        } catch (t: Throwable) { try { promise.reject("E_STATUS", t) } catch (_: Throwable) {} }
    }

    // ---- meter / transport events (30 Hz) ----------------------------------------------------------
    private val tick = object : Runnable {
        override fun run() {
            if (!meterOn) return
            try {
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
            } catch (t: Throwable) {
                Log.e(TAG, "meter tick failed", t)       // never let it kill the HandlerThread (that would crash the app)
            }
            if (meterOn) meterHandler?.postDelayed(this, 33)
        }
    }

    @Synchronized private fun startMeter() {
        if (meterOn || !NativeEngine.loaded) return
        try {
            val t = HandlerThread("mgp-meter").also { it.start() }
            meterThread = t
            meterOn = true
            meterHandler = Handler(t.looper).also { it.post(tick) }
        } catch (t: Throwable) { meterOn = false; Log.e(TAG, "startMeter failed", t) }
    }

    @Synchronized private fun stopMeter() {
        meterOn = false
        try {
            meterHandler?.removeCallbacksAndMessages(null)
            meterThread?.quitSafely()
        } catch (t: Throwable) { Log.e(TAG, "stopMeter failed", t) }
        meterThread = null; meterHandler = null
    }

    @ReactMethod fun addListener(name: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    // ---- hot path: synchronous, non-blocking pushes ---------------------------------------------------
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setParam(id: Int, v: Double): Boolean { guard("setParam") { NativeEngine.nativeSetParam(id, v.toFloat()) }; return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setParams(a: ReadableArray): Boolean { guard("setParams") { NativeEngine.nativeSetParams(floats(a)) }; return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setTuning(a: ReadableArray): Boolean { guard("setTuning") { NativeEngine.nativeSetTuning(ints(a, 6, 40)) }; return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun noteOn(s: Int, fret: Int, vel: Double, flags: Int, delayMs: Double): Boolean {
        guard("noteOn") { NativeEngine.nativeNoteOn(s, fret, vel.toFloat(), flags, delayMs.toFloat()) }; return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun noteOff(s: Int, flags: Int, delayMs: Double): Boolean { guard("noteOff") { NativeEngine.nativeNoteOff(s, flags, delayMs.toFloat()) }; return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun move(s: Int, fret: Int, flags: Int): Boolean { guard("move") { NativeEngine.nativeMove(s, fret, flags) }; return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun muteAll(ms: Double): Boolean { guard("muteAll") { NativeEngine.nativeMuteAll(ms.toFloat()) }; return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setSequence(ev: ReadableArray, length: Double, loop: Boolean): Boolean {
        guard("setSequence") { NativeEngine.nativeSetSequence(floats(ev), length, loop) }; return true
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun play(beat: Double): Boolean { guard("play") { NativeEngine.nativePlay(beat) }; return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun stopPlay(): Boolean { guard("stopPlay") { NativeEngine.nativeStopPlay() }; return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun seek(beat: Double): Boolean { guard("seek") { NativeEngine.nativeSeek(beat) }; return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setBpm(bpm: Double): Boolean { guard("setBpm") { NativeEngine.nativeSetBpm(bpm) }; return true }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setMetronome(on: Boolean): Boolean { guard("setMetronome") { NativeEngine.nativeSetMetronome(on) }; return true }

    // ---- screen ---------------------------------------------------------------------------------------
    @ReactMethod
    fun setKeepAwake(on: Boolean) {
        try {
            val act = currentActivity ?: return
            act.runOnUiThread {
                try {
                    if (on) act.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    else act.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } catch (t: Throwable) { Log.e(TAG, "keepAwake", t) }
            }
        } catch (t: Throwable) { Log.e(TAG, "keepAwake", t) }
    }

    // ---- WAV export -------------------------------------------------------------------------------------
    @ReactMethod
    fun exportWav(
        params: ReadableArray, tuning: ReadableArray, events: ReadableArray,
        length: Double, bpm: Double, loops: Int, name: String, promise: Promise
    ) {
        val args = try {
            if (!NativeEngine.loaded) throw IOException("Audio engine not loaded")
            Triple(floats(params), ints(tuning, 6, 40), floats(events))
        } catch (err: Throwable) {
            try { promise.reject("E_EXPORT", err.message ?: "export failed", err) } catch (_: Throwable) {}
            return
        }
        val (p, t, e) = args
        try {
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
                    Log.e(TAG, "export failed", err)
                    try { promise.reject("E_EXPORT", err.message ?: "export failed", err) } catch (_: Throwable) {}
                }
            }
        } catch (err: Throwable) {
            try { promise.reject("E_EXPORT", err.message ?: "export failed", err) } catch (_: Throwable) {}
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

    // ---- argument conversion: tolerant of null / non-number entries (getDouble would throw and crash the app) --------
    private fun num(a: ReadableArray, i: Int, def: Double = 0.0): Double =
        try {
            if (a.getType(i) == ReadableType.Number) a.getDouble(i).let { if (it.isNaN() || it.isInfinite()) def else it } else def
        } catch (_: Throwable) { def }

    private fun floats(a: ReadableArray) = FloatArray(a.size()) { num(a, it).toFloat() }
    private fun ints(a: ReadableArray, n: Int, def: Int) = IntArray(n) { if (it < a.size()) num(a, it, def.toDouble()).toInt() else def }
}
