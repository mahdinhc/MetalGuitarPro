#pragma once
#include <atomic>
#include <memory>
#include <mutex>
#include <oboe/Oboe.h>
#include "Engine.h"

namespace mgp {

struct OutputInfo {
  bool ok = false;
  int sampleRate = 0, framesPerBurst = 0, bufferFrames = 0, api = 0 /*0 unknown,1 AAudio,2 OpenSL*/;
  bool exclusive = false;
  float latencyMs = 0;
  int xruns = 0;
};

/// Low-latency Oboe output stream that pulls audio straight from the Engine on the audio thread.
class AudioOutput : public oboe::AudioStreamDataCallback, public oboe::AudioStreamErrorCallback {
 public:
  explicit AudioOutput(Engine& e) : engine_(e) {}
  ~AudioOutput() { stop(); }
  OutputInfo start();
  void stop();
  OutputInfo info();
  /// Grows the stream buffer by one burst when underruns are detected (cheap; call at UI rate).
  void autoTune();

  oboe::DataCallbackResult onAudioReady(oboe::AudioStream*, void* data, int32_t frames) override;
  void onErrorAfterClose(oboe::AudioStream*, oboe::Result r) override;

 private:
  OutputInfo infoLocked();
  oboe::Result openWith(bool lowLatency, bool exclusive, bool useAAudio);
  Engine& engine_;
  std::shared_ptr<oboe::AudioStream> stream_;
  std::mutex m_;
  bool wanted_ = false;
  int lastXruns_ = 0;
  std::atomic<bool> restarting_{false};
};

}  // namespace mgp
