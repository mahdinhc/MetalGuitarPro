// JNI glue between com.metalguitarpro.NativeEngine (Kotlin) and the C++ engine.
#include <jni.h>
#include <memory>
#include <string>
#include <vector>
#include "Engine.h"
#include "Wav.h"
#ifdef __ANDROID__
#include "AudioOutput.h"
#endif

using namespace mgp;

static Engine* gEngine = nullptr;
#ifdef __ANDROID__
static AudioOutput* gOut = nullptr;
#endif

#define JFN(ret, name) extern "C" JNIEXPORT ret JNICALL Java_com_metalguitarpro_NativeEngine_##name

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM*, void*) {
  gEngine = new Engine();
  gEngine->prepare(48000);
#ifdef __ANDROID__
  gOut = new AudioOutput(*gEngine);
#endif
  return JNI_VERSION_1_6;
}

static std::vector<float> toVec(JNIEnv* env, jfloatArray a) {
  std::vector<float> v;
  if (!a) return v;
  const jsize n = env->GetArrayLength(a);
  v.resize((size_t)n);
  if (n) env->GetFloatArrayRegion(a, 0, n, v.data());
  return v;
}

JFN(jfloatArray, nativeStart)(JNIEnv* env, jclass) {
  float info[8] = {0};
#ifdef __ANDROID__
  OutputInfo i = gOut->start();
  info[0] = i.ok ? 1.f : 0.f; info[1] = (float)i.sampleRate; info[2] = (float)i.framesPerBurst; info[3] = (float)i.bufferFrames;
  info[4] = i.latencyMs; info[5] = (float)i.api; info[6] = i.exclusive ? 1.f : 0.f;
#endif
  jfloatArray out = env->NewFloatArray(8);
  env->SetFloatArrayRegion(out, 0, 8, info);
  return out;
}
JFN(void, nativeStop)(JNIEnv*, jclass) {
#ifdef __ANDROID__
  gOut->stop();
#endif
}
JFN(void, nativeSetParam)(JNIEnv*, jclass, jint id, jfloat v) { gEngine->setParam(id, v); }
JFN(void, nativeSetParams)(JNIEnv* env, jclass, jfloatArray a) { auto v = toVec(env, a); gEngine->setParams(v.data(), (int)v.size()); }
JFN(void, nativeSetTuning)(JNIEnv* env, jclass, jintArray a) {
  int t[6] = {40, 45, 50, 55, 59, 64};
  if (a && env->GetArrayLength(a) >= 6) env->GetIntArrayRegion(a, 0, 6, t);
  gEngine->setTuning(t);
}
JFN(void, nativeNoteOn)(JNIEnv*, jclass, jint s, jint f, jfloat vel, jint flags, jfloat delayMs) { gEngine->noteOn(s, f, vel, flags, delayMs); }
JFN(void, nativeNoteOff)(JNIEnv*, jclass, jint s, jint flags, jfloat delayMs) { gEngine->noteOff(s, flags, delayMs); }
JFN(void, nativeMove)(JNIEnv*, jclass, jint s, jint f, jint flags) { gEngine->move(s, f, flags); }
JFN(void, nativeMuteAll)(JNIEnv*, jclass, jfloat ms) { gEngine->muteAll(ms); }
JFN(void, nativeSetSequence)(JNIEnv* env, jclass, jfloatArray ev, jdouble length, jboolean loop) {
  auto v = toVec(env, ev);
  gEngine->setSequence(v.data(), (int)(v.size() / kEvStride), length, loop == JNI_TRUE);
}
JFN(void, nativePlay)(JNIEnv*, jclass, jdouble beat) { gEngine->play(beat); }
JFN(void, nativeStopPlay)(JNIEnv*, jclass) { gEngine->stopPlay(); }
JFN(void, nativeSeek)(JNIEnv*, jclass, jdouble beat) { gEngine->seek(beat); }
JFN(void, nativeSetBpm)(JNIEnv*, jclass, jdouble bpm) { gEngine->setBpm(bpm); }
JFN(void, nativeSetMetronome)(JNIEnv*, jclass, jboolean on) { gEngine->setMetronome(on == JNI_TRUE); }

/// out: [peak, cpu, beat, playing, xruns, bufferFrames, latencyMs]
JFN(void, nativeGetStats)(JNIEnv* env, jclass, jfloatArray out) {
  if (!out || env->GetArrayLength(out) < 7) return;
  EngineStats s = gEngine->stats(true);
  float r[7] = {s.peak, s.cpu, s.beat, s.playing, 0, 0, 0};
#ifdef __ANDROID__
  gOut->autoTune();
  OutputInfo i = gOut->info();
  r[4] = (float)i.xruns; r[5] = (float)i.bufferFrames; r[6] = i.latencyMs;
#endif
  env->SetFloatArrayRegion(out, 0, 7, r);
}

/// Offline bounce of the riff through a private Engine instance (does not disturb live audio).
/// Returns the number of frames written, or -1 on failure.
JFN(jint, nativeRenderWav)(JNIEnv* env, jclass, jstring path, jfloatArray params, jintArray tuning, jfloatArray ev,
                           jdouble lengthBeats, jdouble bpm, jint loops, jint sampleRate) {
  const char* p = env->GetStringUTFChars(path, nullptr);
  std::string file = p ? p : "";
  if (p) env->ReleaseStringUTFChars(path, p);
  if (file.empty() || bpm < 20 || lengthBeats <= 0) return -1;
  const int sr = sampleRate > 8000 ? sampleRate : 48000;
  loops = loops < 1 ? 1 : (loops > 8 ? 8 : loops);
  Engine e; e.prepare(sr);
  auto pv = toVec(env, params); e.setParams(pv.data(), (int)pv.size());
  int t[6] = {40, 45, 50, 55, 59, 64};
  if (tuning && env->GetArrayLength(tuning) >= 6) env->GetIntArrayRegion(tuning, 0, 6, t);
  e.setTuning(t);
  auto evv = toVec(env, ev);
  e.setSequence(evv.data(), (int)(evv.size() / kEvStride), lengthBeats, true);
  e.setBpm(bpm); e.setMetronome(false); e.play(0);
  const double seconds = std::min(600.0, lengthBeats * loops * 60.0 / bpm);
  const long body = (long)(seconds * sr), tail = (long)(2.5 * sr);
  std::vector<float> out; out.reserve((size_t)(body + tail) * 2);
  std::vector<float> buf(2 * 480);
  for (long done = 0; done < body + tail;) {
    if (done >= body && done - body < 480) e.stopPlay();
    const int n = (int)std::min<long>(480, body + tail - done);
    e.process(buf.data(), n);
    out.insert(out.end(), buf.begin(), buf.begin() + 2 * n);
    done += n;
  }
  if (!writeWav16(file.c_str(), out, sr)) return -1;
  return (jint)(out.size() / 2);
}
