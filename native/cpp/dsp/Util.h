#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>

namespace mgp {

constexpr double kPi = 3.14159265358979323846;
constexpr double kTwoPi = 2.0 * kPi;

inline float clampf(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }
inline double clampd(double x, double lo, double hi) { return x < lo ? lo : (x > hi ? hi : x); }
inline double dbToLin(double db) { return std::pow(10.0, db / 20.0); }

/// tanh via a [7/6] continued-fraction approximant (abs error < 1.1e-4 everywhere), clamped to +-1.
inline float fastTanh(float x) {
  if (x > 5.0f) return 1.f;
  if (x < -5.0f) return -1.f;
  const float x2 = x * x;
  const float a = x * (135135.f + x2 * (17325.f + x2 * (378.f + x2)));
  const float b = 135135.f + x2 * (62370.f + x2 * (3150.f + x2 * 28.f));
  const float r = a / b;
  return r > 1.f ? 1.f : (r < -1.f ? -1.f : r);
}

inline float flushDenorm(float x) { return std::fabs(x) < 1e-24f ? 0.f : x; }

/// xorshift32 white noise in [-1, 1). Deterministic, allocation free, audio-thread safe.
struct Rng {
  uint32_t s = 0x9E3779B9u;
  explicit Rng(uint32_t seed = 0x9E3779B9u) : s(seed ? seed : 1u) {}
  inline uint32_t next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; }
  inline float bipolar() { return (float)((int32_t)next()) * (1.0f / 2147483648.0f); }
  inline float unipolar() { return (float)(next() >> 8) * (1.0f / 16777216.0f); }
};

/// Flush-to-zero / denormals-are-zero for the calling thread (cheap insurance in feedback paths).
struct ScopedNoDenormals {
#if defined(__aarch64__)
  uint64_t old;
  ScopedNoDenormals() {
    uint64_t v; asm volatile("mrs %0, fpcr" : "=r"(v)); old = v;
    asm volatile("msr fpcr, %0" : : "r"(v | (1ull << 24)));
  }
  ~ScopedNoDenormals() { asm volatile("msr fpcr, %0" : : "r"(old)); }
#elif defined(__SSE__)
  unsigned old;
  ScopedNoDenormals();
  ~ScopedNoDenormals();
#else
  ScopedNoDenormals() {}
#endif
};
#if defined(__SSE__) && !defined(__aarch64__)
}  // namespace mgp
#include <xmmintrin.h>
namespace mgp {
inline ScopedNoDenormals::ScopedNoDenormals() { old = _mm_getcsr(); _mm_setcsr(old | 0x8040); }
inline ScopedNoDenormals::~ScopedNoDenormals() { _mm_setcsr(old); }
#endif

}  // namespace mgp
