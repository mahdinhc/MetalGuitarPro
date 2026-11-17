// Minimal API-compatible stub of the Oboe subset used by AudioOutput, ONLY for host compile checks.
#pragma once
#include <cstdint>
#include <memory>
namespace oboe {
enum class Result { OK, ErrorDisconnected, ErrorNull, ErrorInternal };
inline const char* convertToText(Result) { return "r"; }
enum class Direction { Output }; enum class PerformanceMode { None, LowLatency }; enum class SharingMode { Exclusive, Shared };
enum class AudioFormat { Float }; enum class ChannelCount { Stereo }; enum class Usage { Game }; enum class ContentType { Music };
enum class AudioApi { AAudio, OpenSLES }; enum class DataCallbackResult { Continue, Stop };
template <class T> struct ResultWithValue { T v; explicit operator bool() const { return true; } T value() const { return v; } };
class AudioStream;
struct AudioStreamDataCallback { virtual ~AudioStreamDataCallback() = default; virtual DataCallbackResult onAudioReady(AudioStream*, void*, int32_t) = 0; };
struct AudioStreamErrorCallback { virtual ~AudioStreamErrorCallback() = default; virtual void onErrorAfterClose(AudioStream*, Result) {} };
class AudioStream {
 public:
  int32_t getSampleRate() { return 48000; } int32_t getFramesPerBurst() { return 192; } int32_t getBufferSizeInFrames() { return 384; }
  int32_t getBufferCapacityInFrames() { return 1920; } Result setBufferSizeInFrames(int32_t) { return Result::OK; }
  AudioApi getAudioApi() { return AudioApi::AAudio; } SharingMode getSharingMode() { return SharingMode::Exclusive; }
  ResultWithValue<double> calculateLatencyMillis() { return {5.0}; } ResultWithValue<int32_t> getXRunCount() { return {0}; }
  Result requestStart() { return Result::OK; } Result stop() { return Result::OK; } Result close() { return Result::OK; }
};
class AudioStreamBuilder {
 public:
  AudioStreamBuilder* setDirection(Direction) { return this; } AudioStreamBuilder* setPerformanceMode(PerformanceMode) { return this; }
  AudioStreamBuilder* setSharingMode(SharingMode) { return this; } AudioStreamBuilder* setFormat(AudioFormat) { return this; }
  AudioStreamBuilder* setChannelCount(ChannelCount) { return this; } AudioStreamBuilder* setUsage(Usage) { return this; }
  AudioStreamBuilder* setContentType(ContentType) { return this; } AudioStreamBuilder* setDataCallback(AudioStreamDataCallback*) { return this; }
  AudioStreamBuilder* setErrorCallback(AudioStreamErrorCallback*) { return this; }
  AudioStreamBuilder* setAudioApi(AudioApi) { return this; }
  Result openStream(std::shared_ptr<AudioStream>& s) { s = std::make_shared<AudioStream>(); return Result::OK; }
};
}
