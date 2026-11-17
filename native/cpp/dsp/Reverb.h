#pragma once
#include <vector>
#include "Util.h"

namespace mgp {

/// Stereo 8-line feedback-delay-network reverb with Hadamard mixing, frequency-dependent decay and
/// two input diffusers. Replaces the original's 1.4 s noise-burst convolver (same dark, dense tail)
/// at a fraction of the CPU cost. Output level is calibrated in prepare() to the power gain of the
/// Web Audio convolver's normalised impulse response so the Room knob keeps its meaning.
class Reverb {
 public:
  static constexpr int N = 8;
  void prepare(double sr) {
    sr_ = sr;
    static const double ms[N] = {29.7, 37.1, 41.1, 43.7, 53.3, 59.9, 67.1, 73.3};
    for (int i = 0; i < N; ++i) {
      len_[i] = (int)std::lround(ms[i] * sr / 1000.0);
      line_[i].assign(len_[i] + 1, 0.f); pos_[i] = 0; lp_[i] = 0;
      g_[i] = (float)std::pow(10.0, -3.0 * len_[i] / (kRt60 * sr));
    }
    damp_ = (float)std::exp(-kTwoPi * 3200.0 / sr);
    dl_[0].assign((int)std::lround(sr * 0.0049) + 1, 0.f); dl_[1].assign((int)std::lround(sr * 0.0037) + 1, 0.f);
    dp_[0] = dp_[1] = 0;
    gain_ = 1.f;
    // calibrate: white noise in, measure RMS out, scale to the convolver's normalised power gain
    Rng r(12345); const int n = (int)sr; double e = 0;
    for (int i = 0; i < n; ++i) { float l, rr; process(r.bipolar() * 0.5f, l, rr); if (i > n / 8) e += 0.5 * ((double)l * l + (double)rr * rr); }
    const double meas = std::sqrt(e / (n - n / 8)) / 0.2886751;  // input rms of uniform [-.5,.5) is 0.2887
    const double target = 55.52 * std::sqrt(1.4 / sr);
    gain_ = (float)(target / std::max(meas, 1e-6));
    reset();
  }
  void reset() {
    for (int i = 0; i < N; ++i) { std::fill(line_[i].begin(), line_[i].end(), 0.f); lp_[i] = 0; pos_[i] = 0; }
    for (auto& d : dl_) std::fill(d.begin(), d.end(), 0.f);
    dp_[0] = dp_[1] = 0;
  }
  inline void process(float in, float& outL, float& outR) {
    // two series Schroeder all-pass diffusers
    float x = in;
    for (int k = 0; k < 2; ++k) {
      auto& d = dl_[k]; const int L = (int)d.size();
      const float z = d[dp_[k]];
      const float v = x - 0.6f * z;
      d[dp_[k]] = v; if (++dp_[k] >= L) dp_[k] = 0;
      x = z + 0.6f * v;
    }
    float t[N];
    for (int i = 0; i < N; ++i) {
      const float s = line_[i][pos_[i]];
      lp_[i] = (1.f - damp_) * s + damp_ * lp_[i];
      t[i] = lp_[i] * g_[i];
    }
    // 8x8 Hadamard (fast Walsh-Hadamard), normalised
    for (int h = 1; h < N; h <<= 1)
      for (int i = 0; i < N; i += h << 1)
        for (int j = i; j < i + h; ++j) { const float a = t[j], b = t[j + h]; t[j] = a + b; t[j + h] = a - b; }
    const float nrm = 0.35355339f;
    for (int i = 0; i < N; ++i) {
      const float sgn = (i & 1) ? -1.f : 1.f;
      line_[i][pos_[i]] = flushDenorm(t[i] * nrm + x * 0.25f * sgn);
      if (++pos_[i] > len_[i]) pos_[i] = 0;
    }
    // taps: even lines -> L, odd lines -> R
    float l = 0, r = 0;
    for (int i = 0; i < N; i += 2) { l += lp_[i]; r += lp_[i + 1]; }
    outL = l * gain_ * 0.5f; outR = r * gain_ * 0.5f;
  }
 private:
  static constexpr double kRt60 = 1.05;
  double sr_ = 48000;
  std::vector<float> line_[N], dl_[2];
  int len_[N] = {}, pos_[N] = {}, dp_[2] = {};
  float lp_[N] = {}, g_[N] = {}, damp_ = 0, gain_ = 1;
};

}  // namespace mgp
