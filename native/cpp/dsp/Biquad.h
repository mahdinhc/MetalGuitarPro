#pragma once
#include "Util.h"

namespace mgp {

enum class FT : uint8_t { Pass, LowPass, HighPass, Peaking, LowShelf, HighShelf };

struct BiquadCoef { double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0; };

/// RBJ cookbook designs exactly as the Web Audio spec defines them, so presets tuned against the
/// original browser app keep their voicing: lowpass/highpass take Q in dB, peaking takes linear Q,
/// shelves use slope S = 1.
inline BiquadCoef designBiquad(FT t, double f, double q, double gainDb, double sr) {
  BiquadCoef c;
  if (t == FT::Pass) return c;
  f = clampd(f, 10.0, sr * 0.49);
  const double w0 = kTwoPi * f / sr, cs = std::cos(w0), sn = std::sin(w0);
  double b0, b1, b2, a0, a1, a2;
  switch (t) {
    case FT::LowPass: {
      const double al = sn / (2.0 * std::pow(10.0, q / 20.0));
      b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
    }
    case FT::HighPass: {
      const double al = sn / (2.0 * std::pow(10.0, q / 20.0));
      b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
    }
    case FT::Peaking: {
      const double A = std::pow(10.0, gainDb / 40.0), al = sn / (2.0 * std::max(q, 1e-3));
      b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; break;
    }
    case FT::LowShelf: {
      const double A = std::pow(10.0, gainDb / 40.0), al = sn / 2.0 * std::sqrt(2.0), k = 2 * std::sqrt(A) * al;
      b0 = A * ((A + 1) - (A - 1) * cs + k); b1 = 2 * A * ((A - 1) - (A + 1) * cs);
      b2 = A * ((A + 1) - (A - 1) * cs - k);
      a0 = (A + 1) + (A - 1) * cs + k; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - k; break;
    }
    default: {  // HighShelf
      const double A = std::pow(10.0, gainDb / 40.0), al = sn / 2.0 * std::sqrt(2.0), k = 2 * std::sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * cs + k); b1 = -2 * A * ((A - 1) + (A + 1) * cs);
      b2 = A * ((A + 1) + (A - 1) * cs - k);
      a0 = (A + 1) - (A - 1) * cs + k; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - k; break;
    }
  }
  c.b0 = b0 / a0; c.b1 = b1 / a0; c.b2 = b2 / a0; c.a1 = a1 / a0; c.a2 = a2 / a0;
  return c;
}

/// Transposed direct-form II in double precision (low-frequency filters at 4x rate need it).
class Biquad {
 public:
  void set(const BiquadCoef& c) { c_ = c; }
  void reset() { z1_ = z2_ = 0; }
  inline float process(float xf) {
    const double x = xf;
    const double y = c_.b0 * x + z1_;
    z1_ = c_.b1 * x - c_.a1 * y + z2_;
    z2_ = c_.b2 * x - c_.a2 * y;
    return (float)y;
  }
 private:
  BiquadCoef c_;
  double z1_ = 0, z2_ = 0;
};

/// A biquad with remembered design parameters, so it can be re-tuned cheaply per control block.
struct Filter {
  FT type = FT::Pass;
  double f = 1000, q = 0.7, g = 0, sr = 48000;
  Biquad bq;
  void init(FT t, double f_, double q_, double g_, double sr_) { type = t; f = f_; q = q_; g = g_; sr = sr_; update(); bq.reset(); }
  void update() { bq.set(designBiquad(type, f, q, g, sr)); }
  inline void tune(double f_, double g_) { f = f_; g = g_; update(); }
  inline float process(float x) { return bq.process(x); }
};

}  // namespace mgp
