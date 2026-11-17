#pragma once
#include <vector>
#include "Util.h"

namespace mgp {

/// Kaiser-windowed half-band low-pass: h[0] = 0.5, even taps zero, odd taps non-zero.
/// Returns the taps at odd offsets 1,3,5..M (index j-1 for offset 2j-1).
inline std::vector<double> designHalfband(int M, double beta) {
  auto i0 = [](double x) { double s = 1, t = 1; for (int k = 1; k < 40; ++k) { t *= (x / (2 * k)) * (x / (2 * k)); s += t; } return s; };
  std::vector<double> h;
  for (int n = 1; n <= M; n += 2) {
    const double r = (double)n / (M + 1);
    const double w = i0(beta * std::sqrt(std::max(0.0, 1 - r * r))) / i0(beta);
    h.push_back(std::sin(kPi * n / 2.0) / (kPi * n) * w);
  }
  return h;
}

/// 2x interpolator. Output pair per input: [x[n-J], half-sample interpolation]. Latency J input samples.
class HalfbandUp {
 public:
  void init(int M, double beta) {
    auto h = designHalfband(M, beta);
    J_ = (int)h.size(); c_.resize(J_);
    for (int j = 0; j < J_; ++j) c_[j] = (float)(2.0 * h[j]);
    hist_.assign(2 * J_ * 2, 0.f); pos_ = 0;
  }
  void reset() { std::fill(hist_.begin(), hist_.end(), 0.f); pos_ = 0; }
  void process(const float* in, int n, float* out) {
    const int H = 2 * J_;
    for (int i = 0; i < n; ++i) {
      // double-length history so the last H samples are always contiguous
      hist_[pos_] = hist_[pos_ + H] = in[i];
      pos_ = (pos_ + 1) % H;
      const float* x = &hist_[pos_];  // x[0] oldest ... x[H-1] newest (= p)
      // p = H-1 ; n = p - J ; samples x[n-j+1] -> idx (H-1-J-j+1), x[n+j] -> idx (H-1-J+j)
      const int nI = H - 1 - J_;
      float acc = 0.f;
      for (int j = 1; j <= J_; ++j) acc += c_[j - 1] * (x[nI - j + 1] + x[nI + j]);
      out[2 * i] = x[nI];
      out[2 * i + 1] = acc;
    }
  }
 private:
  int J_ = 0, pos_ = 0;
  std::vector<float> c_, hist_;
};

/// 2x decimator (half-band low-pass then drop every other sample).
class HalfbandDown {
 public:
  void init(int M, double beta) {
    auto h = designHalfband(M, beta);
    M_ = M; J_ = (int)h.size(); c_.resize(J_);
    for (int j = 0; j < J_; ++j) c_[j] = (float)h[j];
    len_ = 2 * M_ + 1; hist_.assign(len_ * 2, 0.f); pos_ = 0;
  }
  void reset() { std::fill(hist_.begin(), hist_.end(), 0.f); pos_ = 0; }
  /// in: 2n samples, out: n samples
  void process(const float* in, int n, float* out) {
    for (int i = 0; i < n; ++i) {
      for (int k = 0; k < 2; ++k) { hist_[pos_] = hist_[pos_ + len_] = in[2 * i + k]; pos_ = (pos_ + 1) % len_; }
      const float* v = &hist_[pos_];  // v[len-1] newest = q ; center = q - M -> idx len-1-M = M
      float acc = 0.5f * v[M_];
      for (int j = 1; j <= J_; ++j) { const int o = 2 * j - 1; acc += c_[j - 1] * (v[M_ - o] + v[M_ + o]); }
      out[i] = acc;
    }
  }
 private:
  int M_ = 0, J_ = 0, len_ = 0, pos_ = 0;
  std::vector<float> c_, hist_;
};

/// 4x oversampling as two cascaded half-band stages (processes at most `maxIn` samples per call).
class Oversampler4 {
 public:
  static constexpr int kFactor = 4;
  void init(int maxIn) {
    up1_.init(15, 7.0); up2_.init(7, 6.0); dn1_.init(7, 6.0); dn2_.init(15, 7.0);
    mid_.assign(maxIn * 2, 0.f);
  }
  void reset() { up1_.reset(); up2_.reset(); dn1_.reset(); dn2_.reset(); }
  void up(const float* in, int n, float* out4) { up1_.process(in, n, mid_.data()); up2_.process(mid_.data(), 2 * n, out4); }
  void down(const float* in4, int n, float* out) { dn1_.process(in4, 2 * n, mid_.data()); dn2_.process(mid_.data(), n, out); }
  /// total group delay in input-rate samples (approximate, for reporting)
  static constexpr double latency48k() { return 19.0; }
 private:
  HalfbandUp up1_, up2_;
  HalfbandDown dn1_, dn2_;
  std::vector<float> mid_;
};

}  // namespace mgp
