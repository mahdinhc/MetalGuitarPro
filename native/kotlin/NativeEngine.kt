package com.metalguitarpro

/** JNI declarations for libmgp_engine.so (see native/cpp/jni_bridge.cpp). Names must match exactly. */
object NativeEngine {
    init { System.loadLibrary("mgp_engine") }

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
