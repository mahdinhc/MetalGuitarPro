// Unit checks for individual DSP blocks. Prints measurements; returns non-zero on failure.
#include <cstdio>
#include <vector>
#include "../Engine.h"
using namespace mgp;
static int fails = 0;
static void check(bool ok, const char* w) { printf("%s %s\n", ok ? "PASS" : "FAIL", w); fails += !ok; }

// magnitude of sine of freq f in x (single-bin DFT)
static double mag(const std::vector<float>& x, double f, double sr) {
  double re = 0, im = 0; for (size_t i = 0; i < x.size(); ++i) { double w = 2 * kPi * f * i / sr; re += x[i] * std::cos(w); im += x[i] * std::sin(w); }
  return 2 * std::sqrt(re * re + im * im) / x.size();
}
int main() {
  const double sr = 48000; const int B = 32;
  // fastTanh accuracy
  double me = 0; for (float x = -6; x <= 6; x += .001f) me = std::max(me, (double)std::fabs(fastTanh(x) - std::tanh(x)));
  printf("  fastTanh max error %.2e\n", me); check(me < 1.5e-4, "fastTanh within 1.5e-4 of tanh");

  // oversampler passband + delay
  Oversampler4 os; os.init(B);
  std::vector<float> in(B), up(B * 4), out(B);
  for (double f : {1000.0, 5000.0, 10000.0, 16000.0}) {
    os.reset(); std::vector<float> y; double ph = 0;
    for (int blk = 0; blk < 400; ++blk) { for (int i = 0; i < B; ++i) { in[i] = (float)std::sin(ph); ph += 2 * kPi * f / sr; } os.up(in.data(), B, up.data()); os.down(up.data(), B, out.data()); if (blk > 20) y.insert(y.end(), out.begin(), out.end()); }
    double g = 20 * std::log10(mag(y, f, sr) + 1e-12);
    printf("  oversampler passband %6.0f Hz: %+.3f dB\n", f, g);
    if (f <= 10000) check(std::fabs(g) < 0.1, "oversampler passband flat (+-0.1 dB up to 10 kHz)");
  }
  // alias rejection: hard-clip a 7.3 kHz sine (heavy odd harmonics). Harmonic 7 = 51.1k -> folds to 3.1k at 48k without oversampling.
  {
    auto run = [&](bool over) { std::vector<float> y; double ph = 0; os.reset();
      for (int blk = 0; blk < 600; ++blk) { for (int i = 0; i < B; ++i) { in[i] = 3.f * (float)std::sin(ph); ph += 2 * kPi * 7300.0 / sr; }
        if (over) { os.up(in.data(), B, up.data()); for (auto& v : up) v = clampf(v, -1, 1); os.down(up.data(), B, out.data()); }
        else for (int i = 0; i < B; ++i) out[i] = clampf(in[i], -1, 1);
        if (blk > 30) y.insert(y.end(), out.begin(), out.end()); }
      return y; };
    auto a = run(false), b = run(true);
    // 7th harmonic of 7.3k = 51.1k folds to |51.1k - 48k| = 3.1k
    double da = mag(a, 3100, sr), db = mag(b, 3100, sr);
    printf("  alias at 3.1 kHz: plain clip %.4f, 4x oversampled %.5f  (%.1f dB better)\n", da, db, 20 * std::log10(da / (db + 1e-12)));
    check(da / (db + 1e-12) > 8, "oversampling cuts clipping aliasing by > 18 dB");
  }
  // cabinet normalisation + reverb calibration (documented behaviour of the Web Audio ConvolverNode)
  for (int t = 0; t < 5; ++t) { CabInstance c; c.init(t, sr); printf("  cab %d normalisation scale %.4f\n", t, c.normalisation()); }
  { Reverb r; r.prepare(sr); Rng g(3); double e = 0; int n = 96000; for (int i = 0; i < n; ++i) { float l, rr; r.process(.5f * g.bipolar(), l, rr); if (i > 20000) e += .5 * ((double)l * l + (double)rr * rr); }
    double rms = std::sqrt(e / (n - 20000)) / .2886751; printf("  reverb power gain %.3f (target %.3f)\n", rms, 55.52 * std::sqrt(1.4 / sr)); check(std::fabs(rms / (55.52 * std::sqrt(1.4 / sr)) - 1) < .08, "reverb calibrated to convolver level"); }
  // compressor makeup like WebAudio: thr -10, knee 30, ratio 12 -> (1/0.333)^0.6 = 1.93
  { Compressor c; c.prepare(sr); c.set(-10, 30, 12, .003f, .25f); float g = 0; for (int i = 0; i < 10; ++i) g = c.gainFor(1e-6f); printf("  compressor quiet-signal gain %.3f (expect ~1.93)\n", g); check(std::fabs(g - 1.93) < .05, "compressor make-up matches Web Audio formula"); }
  // biquad sanity: 1 kHz peaking +6 dB
  { Filter f; f.init(FT::Peaking, 1000, 1, 6, sr); std::vector<float> y; double ph = 0; for (int i = 0; i < 20000; ++i) { float v = f.process((float)std::sin(ph)); ph += 2 * kPi * 1000 / sr; if (i > 5000) y.push_back(v); }
    double g = 20 * std::log10(mag(y, 1000, sr)); printf("  peaking filter gain %.2f dB\n", g); check(std::fabs(g - 6) < .1, "peaking biquad = +6 dB at centre"); }
  printf(fails ? "\n%d FAILED\n" : "\nall dsp checks passed\n", fails); return fails ? 1 : 0;
}
