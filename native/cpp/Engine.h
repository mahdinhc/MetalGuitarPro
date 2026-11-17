#pragma once
#include <atomic>
#include <memory>
#include <mutex>
#include <vector>
#include "ParamIds.h"
#include "dsp/Biquad.h"
#include "dsp/Cabinet.h"
#include "dsp/Compressor.h"
#include "dsp/Delay.h"
#include "dsp/Oversampler.h"
#include "dsp/Reverb.h"
#include "dsp/StringVoice.h"

namespace mgp {

constexpr int kBlock = 32;       // control-rate block (events are quantised to this: 0.67 ms @ 48 kHz)
constexpr int kStrings = 6;
constexpr int kVoices = kStrings * 2;

// note flags (OR-ed with the matching global toggles inside the engine)
enum NoteFlag : int { NF_MUTE = 1, NF_HARM = 2, NF_RING = 4, NF_TREM = 8 };

// sequence event types
enum EvType : uint8_t { EV_ON = 0, EV_OFF = 1, EV_MOVE = 2, EV_BEND = 3, EV_VIB_ON = 4, EV_VIB_OFF = 5 };
constexpr int kEvStride = 8;  // beat, type, string, fret, vel, flags, arg, id

struct SeqEvent { double beat; uint8_t type; int8_t str; int16_t fret; float vel; int32_t flags; float arg; int32_t id; };
struct SeqData {
  std::vector<SeqEvent> ev;
  double length = 4;  // beats
  bool loop = true;
};

/// Builds a sorted, loop-wrapped event list from the flat array produced by the JS layer.
std::unique_ptr<SeqData> buildSequence(const float* flat, int count, double lengthBeats, bool loop);

struct EngineStats { float peak, cpu, beat, playing; uint32_t blocks; };

class Engine {
 public:
  Engine();
  ~Engine();
  /// (Re)initialise DSP for a sample rate. Not real-time safe; the audio thread must be stopped.
  void prepare(double sampleRate);
  double sampleRate() const { return sr_; }

  // ---- control API: callable from any non-audio thread, never blocks the audio thread ----------
  void setParam(int id, float v);
  void setParams(const float* v, int n);
  void setTuning(const int* midi6);
  void noteOn(int str, int fret, float vel, int flags, float delayMs);
  void noteOff(int str, int flags, float delayMs);
  /// flags: bit0 slide (else legato), bit1 only-if-ringing
  void move(int str, int fret, int flags);
  void muteAll(float fadeMs);
  void setSequence(const float* flat, int count, double lengthBeats, bool loop);
  void play(double fromBeat);
  void stopPlay();
  void seek(double beat);
  void setBpm(double bpm) { bpm_.store((float)bpm, std::memory_order_relaxed); }
  void setMetronome(bool on) { metro_.store(on, std::memory_order_relaxed); }
  EngineStats stats(bool resetPeak = true);

  // ---- audio thread ------------------------------------------------------------------------------
  /// Renders `frames` interleaved stereo frames.
  void process(float* out, int frames);
  /// Offline helper (host tests / WAV export): same as process() but with no real-time pacing.
  int blockLatencySamples() const { return (int)Oversampler4::latency48k(); }

 private:
  enum CmdType : uint8_t { C_ON, C_OFF, C_MOVE, C_MUTE_ALL, C_PLAY, C_STOP, C_SEEK, C_SEQ };
  struct Cmd { CmdType type; int8_t str; int16_t fret; int32_t flags; float f0, f1; double d0; void* ptr; };
  struct Pending { int64_t due; Cmd c; };
  struct Sm { float v = 0, t = 0; };

  void push(const Cmd& c);
  bool pop(Cmd& c);
  void exec(const Cmd& c);
  void runCommands();
  void renderBlock(float* l, float* r);
  void stepSequencer();
  void fireRange(const SeqData* d, double a, double b);
  void clicks(double a, double b, double len, bool loop);
  void startNote(int str, int fret, float vel, int flags, int owner, bool live);
  void releaseString(int str, int flags);
  void moveString(int str, int fret, bool slide, int flags);
  void releaseAll(float ms);
  void updateAmp(bool force);
  void smooth(Sm& s) const { s.v += (s.t - s.v) * alpha_; if (std::fabs(s.t - s.v) < 1e-5f * (1.f + std::fabs(s.t))) s.v = s.t; }

  // params / tuning (written by control threads, read by audio thread)
  std::atomic<float> params_[P_COUNT];
  std::atomic<int> tuning_[kStrings];
  std::atomic<float> bpm_{120.f};
  std::atomic<bool> metro_{false};
  float p_[P_COUNT];  // per-block snapshot

  // command queue: MPSC (producers serialised by a mutex), single consumer = audio thread
  static constexpr int kQ = 4096;
  Cmd q_[kQ];
  std::atomic<uint32_t> qh_{0}, qt_{0};
  std::mutex qm_;
  std::vector<Pending> pend_;   // pre-reserved; audio thread only
  // garbage returned from the audio thread for deferred deletion
  SeqData* garb_[16] = {};
  std::atomic<uint32_t> gh_{0}, gt_{0};
  std::mutex gm_;
  void collectGarbage();

  double sr_ = 48000;
  float alpha_ = 0.03f;
  int64_t clock_ = 0;
  Rng rng_;

  // strings
  StringVoice* voices_ = nullptr;  // kVoices, heap allocated (large)
  int slot_[kStrings] = {};
  int vibCount_ = 0;
  float bendC_ = 0;
  struct Live { bool held = false, trem = false; int fret = 0, flags = 0, owner = -1; float vel = 0.85f; int64_t next = 0; bool alt = false; } live_[kStrings];
  float gateEnv_ = 0, gateG_ = 0;

  // sequencer
  SeqData* seq_ = nullptr;
  bool playing_ = false, oneShotDone_ = false;
  double beat_ = 0;
  std::atomic<double> beatOut_{0};
  std::atomic<bool> playOut_{false};
  struct Click { bool on = false; float t = 0, freq = 1000, ph = 0; } click_[3];

  // amp
  Filter pu_, wah_;
  Oversampler4 os_;
  std::vector<float> up_, dn_;
  Filter hp_, bst_, lp1_, hp2_, lp2_, hp3_, bass_, mid_, treb_, pres_, dp_;
  Compressor sag_, comp_;
  Sm preG_, hpF_, bstG_, bassG_, midG_, trebG_, presG_, midF_, depG_, puF_, puG_, wahF_, wahG_;
  Sm master_, cabG_, dryG_, revG_, dlyG_, dlyT_, chorG_;
  // cabinets (+ crossfade)
  CabInstance cabs_[5];
  float cabScale_[5] = {1, 1, 1, 1, 1};
  int cabCur_ = 0, cabPrev_ = -1;
  float cabFade_ = 1.f;  // 0..1 crossfade from cabPrev_ to cabCur_
  Reverb rev_;
  DelayLine dL_, dR_, ch_[2];
  Filter dLp_, dHp_;
  double lfoPh_[2] = {0, 0};
  float lastPeak_ = 0;
  std::atomic<float> peak_{0}, cpu_{0};
  std::atomic<uint32_t> blocks_{0};
  float stage_[kBlock * 2];
  int stagePos_ = kBlock;  // frames consumed of stage_
  bool ready_ = false;
  float mono_[kBlock], lbuf_[kBlock], rbuf_[kBlock];
};

}  // namespace mgp
