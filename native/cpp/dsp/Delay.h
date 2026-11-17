#pragma once
#include <vector>
#include "Util.h"

namespace mgp {

/// Circular delay line with linear-interpolated fractional reads.
class DelayLine {
 public:
  void init(int maxSamples) {
    int n = 16; while (n < maxSamples + 4) n <<= 1;
    buf_.assign(n, 0.f); mask_ = n - 1; w_ = 0;
  }
  void reset() { std::fill(buf_.begin(), buf_.end(), 0.f); }
  inline void write(float x) { buf_[w_] = x; w_ = (w_ + 1) & mask_; }
  /// delay in samples (>= 1): 1 returns the most recently written sample
  inline float read(float d) const {
    const float p = (float)w_ - d + (float)(mask_ + 1);
    const int i = (int)p; const float f = p - (float)i;
    return buf_[i & mask_] * (1.f - f) + buf_[(i + 1) & mask_] * f;
  }
 private:
  std::vector<float> buf_;
  int mask_ = 15, w_ = 0;
};

}  // namespace mgp
