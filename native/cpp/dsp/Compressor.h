#pragma once
#include "Util.h"

namespace mgp {

/// Feed-forward soft-knee compressor modelled on the Web Audio DynamicsCompressor
/// (same static curve and the same automatic make-up gain of (1/g(0 dB))^0.6).
class Compressor {
 public:
  void prepare(double sr) { sr_ = sr; update(); env_ = 0; }
  void set(float thresholdDb, float kneeDb, float ratio, float attack, float release) {
    if (thr_ == thresholdDb && knee_ == kneeDb && ratio_ == ratio && att_ == attack && rel_ == release) return;
    thr_ = thresholdDb; knee_ = kneeDb; ratio_ = ratio; att_ = attack; rel_ = release; update();
  }
  inline float process(float x) { return x * gainFor(std::fabs(x)); }
  /// Linear gain (incl. make-up) for a detector level; lets two channels share one detector.
  inline float gainFor(float level) {
    const float ax = level + 1e-9f;
    const float xdb = 20.f * std::log10(ax);
    const float gr = curve(xdb) - xdb;  // <= 0
    const float c = gr < env_ ? ac_ : rc_;
    env_ = gr + c * (env_ - gr);
    return std::pow(10.f, env_ * 0.05f) * makeup_;
  }
  void reset() { env_ = 0; }
 private:
  float curve(float x) const {
    const float d = x - thr_;
    if (2 * d < -knee_) return x;
    if (2 * std::fabs(d) <= knee_) { const float t = d + knee_ * 0.5f; return x + (1.f / ratio_ - 1.f) * t * t / (2 * knee_); }
    return thr_ + d / ratio_;
  }
  void update() {
    ac_ = (float)std::exp(-1.0 / (std::max(att_, 1e-4f) * sr_));
    rc_ = (float)std::exp(-1.0 / (std::max(rel_, 1e-3f) * sr_));
    const float g0 = std::pow(10.f, (curve(0.f) - 0.f) * 0.05f);
    makeup_ = std::pow(1.f / g0, 0.6f);
  }
  double sr_ = 48000;
  float thr_ = -24, knee_ = 30, ratio_ = 12, att_ = 0.003f, rel_ = 0.25f, env_ = 0, ac_ = 0, rc_ = 0, makeup_ = 1;
};

}  // namespace mgp
