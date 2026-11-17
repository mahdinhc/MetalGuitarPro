#pragma once
#include <vector>
#include "Biquad.h"

namespace mgp {

/// Guitar cabinet simulation. The original app rendered each cabinet to an impulse response (three
/// early reflections followed by a biquad chain, per "microphone" channel) and convolved it. Since the
/// IR is a sparse FIR feeding IIR filters, running that structure directly is mathematically the same
/// system at roughly 1/40 of the cost of a 2880-tap convolution, and it needs no FFT.
struct CabStage { FT t; float f, q, g; };
struct CabChain { int n; CabStage s[7]; };

inline const CabChain (&cabTable(int type))[2] {
  static const CabChain T[5][2] = {
    {{7, {{FT::HighPass, 75, .8f, 0}, {FT::Peaking, 115, 1.1f, 5}, {FT::Peaking, 380, 1, -3}, {FT::Peaking, 2600, 1.4f, 6}, {FT::Peaking, 4200, 2, -4}, {FT::LowPass, 5200, .7f, 0}, {FT::LowPass, 6800, .6f, 0}}},
     {6, {{FT::HighPass, 80, .7f, 0}, {FT::Peaking, 140, 1, 4}, {FT::Peaking, 500, 1, 2}, {FT::Peaking, 2200, 1.2f, 3}, {FT::LowPass, 4200, .7f, 0}, {FT::LowPass, 5200, .6f, 0}}}},
    {{7, {{FT::HighPass, 70, .8f, 0}, {FT::Peaking, 100, 1, 4}, {FT::Peaking, 400, 1, -1}, {FT::Peaking, 2000, 1.2f, 5}, {FT::Peaking, 3500, 2, -3}, {FT::LowPass, 4500, .7f, 0}, {FT::LowPass, 5800, .6f, 0}}},
     {5, {{FT::HighPass, 85, .7f, 0}, {FT::Peaking, 180, 1, 3}, {FT::Peaking, 1200, 1, 3}, {FT::LowPass, 3800, .7f, 0}, {FT::LowPass, 4800, .6f, 0}}}},
    {{6, {{FT::HighPass, 110, .8f, 0}, {FT::Peaking, 200, 1, 3}, {FT::Peaking, 700, 1, -2}, {FT::Peaking, 2800, 1.2f, 5}, {FT::LowPass, 5500, .7f, 0}, {FT::LowPass, 7000, .6f, 0}}},
     {4, {{FT::HighPass, 130, .7f, 0}, {FT::Peaking, 300, 1, 2}, {FT::Peaking, 1500, 1, 2}, {FT::LowPass, 4500, .7f, 0}}}},
    {{6, {{FT::HighPass, 90, .8f, 0}, {FT::Peaking, 150, 1, 2}, {FT::Peaking, 1000, 1, 3}, {FT::Peaking, 3000, 1.2f, 4}, {FT::LowPass, 6000, .7f, 0}, {FT::LowPass, 7500, .6f, 0}}},
     {4, {{FT::HighPass, 100, .7f, 0}, {FT::Peaking, 220, 1, 3}, {FT::Peaking, 2000, 1, 2}, {FT::LowPass, 5000, .7f, 0}}}},
    {{4, {{FT::HighPass, 60, .7f, 0}, {FT::Peaking, 3500, 1, 2}, {FT::LowPass, 9000, .7f, 0}, {FT::LowPass, 10000, .6f, 0}}},
     {3, {{FT::HighPass, 70, .7f, 0}, {FT::Peaking, 200, 1, 2}, {FT::LowPass, 7500, .7f, 0}}}},
  };
  return T[type < 0 ? 0 : (type > 4 ? 4 : type)];
}

class CabInstance {
 public:
  void init(int type, double sr) {
    type_ = type; sr_ = sr;
    const auto& tbl = cabTable(type);
    for (int m = 0; m < 2; ++m) {
      n_[m] = tbl[m].n;
      for (int i = 0; i < n_[m]; ++i) { const auto& s = tbl[m].s[i]; f_[m][i].init(s.t, s.f, s.q, s.g, sr); }
      // early reflections: unit direct tap, +0.35 and -0.15 reflections (offsets per mic, as in the original IR)
      tapN_[m][0] = (int)std::floor(sr * 0.0004 * m);
      tapN_[m][1] = (int)std::floor(sr * (0.0009 + 0.0007 * m));
      tapN_[m][2] = (int)std::floor(sr * (0.0021 + 0.001 * m));
    }
    const int len = (int)std::floor(sr * 0.0035) + 4;
    hist_.assign(len, 0.f); mask_ = 0; int p = 1; while (p < len) p <<= 1; hist_.assign(p, 0.f); mask_ = p - 1; w_ = 0;
  }
  void reset() { std::fill(hist_.begin(), hist_.end(), 0.f); for (auto& a : f_) for (auto& f : a) f.bq.reset(); }
  inline void process(float x, float& l, float& r) {
    hist_[w_] = x;
    float y[2];
    for (int m = 0; m < 2; ++m) {
      float v = hist_[(w_ - tapN_[m][0]) & mask_] + 0.35f * hist_[(w_ - tapN_[m][1]) & mask_] - 0.15f * hist_[(w_ - tapN_[m][2]) & mask_];
      for (int i = 0; i < n_[m]; ++i) v = f_[m][i].process(v);
      y[m] = v;
    }
    w_ = (w_ + 1) & mask_;
    l = y[0]; r = y[1];
  }
  /// Same loudness normalisation the Web Audio ConvolverNode applies to an IR (RMS over its 60 ms length).
  float normalisation() {
    CabInstance tmp = *this; tmp.reset();
    const int n = (int)std::floor(sr_ * 0.06);
    double e = 0;
    for (int i = 0; i < n; ++i) { float l, r; tmp.process(i == 0 ? 1.f : 0.f, l, r); e += (double)l * l + (double)r * r; }
    double power = std::sqrt(e / (2.0 * n));
    if (!(power > 0.000125)) power = 0.000125;
    return (float)((1.0 / power) * std::pow(10.0, -58.0 * 0.05) * (44100.0 / sr_));
  }
 private:
  int type_ = 0; double sr_ = 48000;
  int n_[2] = {0, 0}, tapN_[2][3] = {};
  Filter f_[2][7];
  std::vector<float> hist_; int mask_ = 0, w_ = 0;
};

}  // namespace mgp
