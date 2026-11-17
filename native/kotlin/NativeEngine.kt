package com.metalguitarpro

import android.util.Log

/**
 * JNI declarations for libmgp_engine.so (see native/cpp/jni_bridge.cpp). Names must match exactly.
 *
 * Loading the library can fail (wrong ABI, missing libc++_shared.so, JNI_OnLoad error). That must never take the app
 * down: the failure is recorded in [loadError] and [MetalEngineModule] turns every call into a no-op, so the UI still
 * starts (silent) and can show what went wrong.
 */
object NativeEngine {
    @Volatile @JvmField var loaded = false
    @Volatile @JvmField var loadError: String? = null

    init {
        try {
            System.loadLibrary("mgp_engine")
            loaded = true
        } catch (t: Throwable) {          // UnsatisfiedLinkError is an Error, not an Exception: catch Throwable
            loadError = t.message ?: t.javaClass.simpleName
            Log.e("MetalEngine", "could not load libmgp_engine.so", t)
        }
    }

    @JvmStatic external fun nativeStart(): FloatArray
    @JvmStatic external fun nativeStop()
    @JvmStatic external fun nativeSetParam(id: Int, v: Float)
    @JvmStatic external fun nativeSetParams(v: FloatArray)
    @JvmStatic external fun nativeSetTuning(t: IntArray)
    @JvmStatic external fun nativeNoteOn(s: Int, fret: Int, vel: Float, flags: Int, delayMs: Float)
    @JvmStatic external fun nativeNoteOff(s: Int, flags: Int, delayMs: Float)
    @JvmStatic external fun nativeMove(s: Int, fret: Int, flags: Int)
    @JvmStatic external fun nativeMuteAll(ms: Float)
    @JvmStatic external fun nativeSetSequence(ev: FloatArray, length: Double, loop: Boolean)
    @JvmStatic external fun nativePlay(beat: Double)
    @JvmStatic external fun nativeStopPlay()
    @JvmStatic external fun nativeSeek(beat: Double)
    @JvmStatic external fun nativeSetBpm(bpm: Double)
    @JvmStatic external fun nativeSetMetronome(on: Boolean)
    @JvmStatic external fun nativeGetStats(out: FloatArray)
    @JvmStatic external fun nativeRenderWav(
        path: String, params: FloatArray, tuning: IntArray, ev: FloatArray,
        lengthBeats: Double, bpm: Double, loops: Int, sampleRate: Int
    ): Int
}
