#include "AudioOutput.h"
#include <android/log.h>
#include <chrono>
#include <thread>
#define TAG "MetalEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

namespace mgp {

// Opens the stream with the requested options. Returns the Oboe result; stream_ is set only on success.
oboe::Result AudioOutput::openWith(bool lowLatency, bool exclusive, bool useAAudio) {
  oboe::AudioStreamBuilder b;
  b.setDirection(oboe::Direction::Output)
      ->setPerformanceMode(lowLatency ? oboe::PerformanceMode::LowLatency : oboe::PerformanceMode::None)
      ->setSharingMode(exclusive ? oboe::SharingMode::Exclusive : oboe::SharingMode::Shared)
      ->setFormat(oboe::AudioFormat::Float)
      ->setChannelCount(oboe::ChannelCount::Stereo)
      ->setUsage(oboe::Usage::Game)
      ->setContentType(oboe::ContentType::Music)
      ->setDataCallback(this)
      ->setErrorCallback(this);
  if (!useAAudio) b.setAudioApi(oboe::AudioApi::OpenSLES);
  // sample rate left unspecified on purpose: the native rate avoids a resampler and its latency
  std::shared_ptr<oboe::AudioStream> s;
  oboe::Result r = b.openStream(s);
  if (r == oboe::Result::OK && s) stream_ = std::move(s);
  else if (r == oboe::Result::OK) r = oboe::Result::ErrorNull;
  return r;
}

OutputInfo AudioOutput::start() {
  std::lock_guard<std::mutex> g(m_);
  wanted_ = true;
  if (stream_) return infoLocked();

  // Some devices/ROMs refuse exclusive or low-latency AAudio streams (or AAudio altogether). Try progressively safer
  // configurations instead of giving up with no sound.
  struct Try { bool lowLat, excl, aaudio; const char* name; };
  static const Try tries[] = {
      {true, true, true, "AAudio low-latency exclusive"},
      {true, false, true, "AAudio low-latency shared"},
      {false, false, true, "AAudio shared"},
      {false, false, false, "OpenSL ES"},
  };
  oboe::Result r = oboe::Result::ErrorInternal;
  for (const Try& t : tries) {
    stream_.reset();
    r = openWith(t.lowLat, t.excl, t.aaudio);
    if (r != oboe::Result::OK || !stream_) { LOGE("openStream (%s) failed: %s", t.name, oboe::convertToText(r)); stream_.reset(); continue; }

    engine_.prepare((double)stream_->getSampleRate());   // stream is open but not started: no callbacks yet
    const int burst = stream_->getFramesPerBurst();
    if (burst > 0) stream_->setBufferSizeInFrames(burst * 2);   // double buffering, grown by autoTune() on underruns
    lastXruns_ = 0;
    r = stream_->requestStart();
    if (r == oboe::Result::OK) {
      OutputInfo i = infoLocked();
      LOGI("stream (%s): %d Hz, burst %d, buffer %d, api %d, exclusive %d, %.1f ms", t.name, i.sampleRate, i.framesPerBurst, i.bufferFrames, i.api, (int)i.exclusive, i.latencyMs);
      return i;
    }
    LOGE("requestStart (%s) failed: %s", t.name, oboe::convertToText(r));
    stream_->close(); stream_.reset();
  }
  return OutputInfo();
}

void AudioOutput::stop() {
  std::shared_ptr<oboe::AudioStream> s;
  { std::lock_guard<std::mutex> g(m_); wanted_ = false; s = std::move(stream_); stream_.reset(); }
  if (s) { s->stop(); s->close(); }
}

OutputInfo AudioOutput::infoLocked() {
  OutputInfo i;
  if (!stream_) return i;
  i.ok = true;
  i.sampleRate = stream_->getSampleRate();
  i.framesPerBurst = stream_->getFramesPerBurst();
  i.bufferFrames = stream_->getBufferSizeInFrames();
  i.api = stream_->getAudioApi() == oboe::AudioApi::AAudio ? 1 : 2;
  i.exclusive = stream_->getSharingMode() == oboe::SharingMode::Exclusive;
  auto lat = stream_->calculateLatencyMillis();
  i.latencyMs = lat ? (float)lat.value() : 0.f;
  auto xr = stream_->getXRunCount();
  i.xruns = xr ? xr.value() : 0;
  return i;
}
OutputInfo AudioOutput::info() { std::lock_guard<std::mutex> g(m_); return infoLocked(); }

void AudioOutput::autoTune() {
  std::lock_guard<std::mutex> g(m_);
  if (!stream_) return;
  auto xr = stream_->getXRunCount();
  if (!xr) return;
  if (xr.value() > lastXruns_) {
    lastXruns_ = xr.value();
    const int cap = stream_->getBufferCapacityInFrames(), cur = stream_->getBufferSizeInFrames(), burst = stream_->getFramesPerBurst();
    if (cur + burst <= cap) { stream_->setBufferSizeInFrames(cur + burst); LOGI("underrun: buffer -> %d frames", cur + burst); }
  }
}

oboe::DataCallbackResult AudioOutput::onAudioReady(oboe::AudioStream*, void* data, int32_t frames) {
  engine_.process(static_cast<float*>(data), frames);
  return oboe::DataCallbackResult::Continue;
}

void AudioOutput::onErrorAfterClose(oboe::AudioStream*, oboe::Result r) {
  LOGE("stream error: %s", oboe::convertToText(r));
  bool again;
  { std::lock_guard<std::mutex> g(m_); again = wanted_; stream_.reset(); }
  if (!again || restarting_.exchange(true)) return;
  // Reopen on a helper thread: the route may need a moment to settle (headphones unplugged, Bluetooth switch, audio
  // server restart), and we must not block or recurse inside Oboe's own error-callback thread.
  std::thread([this] {
    for (int attempt = 0; attempt < 5; ++attempt) {
      std::this_thread::sleep_for(std::chrono::milliseconds(150 * (attempt + 1)));
      bool want; { std::lock_guard<std::mutex> g(m_); want = wanted_; }
      if (!want) break;
      try { if (start().ok) break; } catch (...) {}
    }
    restarting_ = false;
  }).detach();
}

}  // namespace mgp
