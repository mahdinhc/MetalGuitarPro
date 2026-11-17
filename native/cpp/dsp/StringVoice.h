#pragma once
#include "Util.h"

namespace mgp {

/// One plucked-string waveguide (Karplus-Strong with fractional delay, one-pole loop filter,
/// all-pass stiffness, pitch glide, vibrato and whammy). Direct port of the browser app's string
/// model; every string owns two voices so re-picking crossfades instead of clicking.
struct StringVoice {
  static constexpr int kBuf = 8192, kMask = kBuf - 1;
  float buf[kBuf];
  int w = 0;
  double ft = 100, fc = 100, gl = 1, vp = 0;
  float a = 0.5f, t60 = 5, lp = 0, pr = 0, vol = 0, volT = 0, k = 0.05f, age = 0, ax = 0, ao = 0;
  int lf = 0, owner = -1;
  bool on = false;

  void clear() { std::memset(buf, 0, sizeof(buf)); w = 0; lp = pr = ax = ao = 0; }

  /// Adds a pick-position-filtered noise burst of length L into the loop.
  void excite(Rng& rng, int L, float amp, int pos, float kk) {
    L = std::min(L, kBuf - 8);
    float n[kBuf / 2];
    L = std::min(L, kBuf / 2 - 1);
    float z = 0;
    for (int i = 0; i < L; ++i) { z += kk * (rng.bipolar() - z); n[i] = z; }
    for (int i = 0; i < L; ++i) buf[(w - L + i) & kMask] += amp * (n[i] - (i >= pos ? 0.9f * n[i - pos] : 0.f));
  }

  void release(double sr, float seconds) { volT = 0; k = (float)(1.0 / (sr * std::max(seconds, 1e-3f))); }

  /// Renders one control block (n samples, additive into out).
  void render(int n, double sr, float vrate, float vdep, float stiff, bool vibOn, float bendMul, float* out) {
    fc += (ft - fc) * gl;
    age += (float)(n / sr);
    vp += kTwoPi * vrate * n / sr;
    const float ve = vibOn ? clampf((age - 0.3f) / 0.4f, 0.f, 1.f) : 0.f;
    const double f = fc * bendMul * std::pow(2.0, std::sin(vp) * vdep * ve / 1200.0);
    const double c = stiff / 100.0 * 0.35 * std::min(1.0, 150.0 / f);
    const double Dr = clampd(sr / f - (1 - a) / a - (1 - c) / (1 + c), 2.0, (double)(kBuf - 4));
    const float g = (float)std::min(0.99995, std::pow(0.001, 1.0 / (t60 * f)));
    const float cf = (float)c;
    int wl = w; float lpl = lp, prl = pr, voll = vol, axl = ax, aol = ao;
    const float al = a, vt = volT, kk = k;
    for (int i = 0; i < n; ++i) {
      const float p = (float)(wl + kBuf) - (float)Dr;
      const int ip = (int)p; const float fr = p - (float)ip;
      const float y = buf[ip & kMask] * (1.f - fr) + buf[(ip + 1) & kMask] * fr;
      const float o = cf * y + axl - cf * aol;
      axl = y; aol = o;
      lpl += al * (o - lpl);
      buf[wl] = flushDenorm(lpl * g);
      wl = (wl + 1) & kMask;
      voll += (vt - voll) * kk;
      out[i] += (y - 0.55f * prl) * voll;
      prl = y;
    }
    w = wl; lp = lpl; pr = prl; vol = voll; ax = axl; ao = aol;
    if ((volT == 0.f && vol < 1e-4f) || age > t60 * 1.3f) on = false;
  }
};

}  // namespace mgp
