#include "AudioOutput.h"
#include <android/log.h>
#include <thread>
#define TAG "MetalEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

namespace mgp {

OutputInfo AudioOutput::start() {
  std::lock_guard<std::mutex> g(m_);
  wanted_ = true;
  if (stream_) return infoLocked();
  oboe::AudioStreamBuilder b;
  b.setDirection(oboe::Direction::Output)
      ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
      ->setSharingMode(oboe::SharingMode::Exclusive)   // falls back to Shared automatically
      ->setFormat(oboe::AudioFormat::Float)
      ->setChannelCount(oboe::ChannelCount::Stereo)
      ->setUsage(oboe::Usage::Game)
      ->setContentType(oboe::ContentType::Music)
      ->setDataCallback(this)
      ->setErrorCallback(this);
  // sample rate left unspecified on purpose: the native rate avoids a resampler and its latency
  oboe::Result r = b.openStream(stream_);
  if (r != oboe::Result::OK || !stream_) { LOGE("openStream failed: %s", oboe::convertToText(r)); stream_.reset(); return OutputInfo(); }
  engine_.prepare((double)stream_->getSampleRate());   // stream is open but not started: no callbacks yet
  const int burst = stream_->getFramesPerBurst();
  stream_->setBufferSizeInFrames(burst * 2);           // double buffering, grown by autoTune() on underruns
  lastXruns_ = 0;
  r = stream_->requestStart();
  if (r != oboe::Result::OK) { LOGE("requestStart failed: %s", oboe::convertToText(r)); stream_->close(); stream_.reset(); return OutputInfo(); }
  OutputInfo i = infoLocked();
  LOGI("stream: %d Hz, burst %d, buffer %d, api %d, exclusive %d, %.1f ms", i.sampleRate, i.framesPerBurst, i.bufferFrames, i.api, (int)i.exclusive, i.latencyMs);
  return i;
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
  bool again; { std::lock_guard<std::mutex> g(m_); again = wanted_; stream_.reset(); }
  if (again && r == oboe::Result::ErrorDisconnected) start();   // headphones unplugged / route change
}

}  // namespace mgp
