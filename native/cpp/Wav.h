#pragma once
#include <cstdint>
#include <cstdio>
#include <vector>

namespace mgp {
/// Writes interleaved stereo float samples as 16-bit PCM WAV. Returns false on I/O error.
inline bool writeWav16(const char* path, const std::vector<float>& interleaved, int sampleRate) {
  FILE* f = fopen(path, "wb");
  if (!f) return false;
  const uint32_t n = (uint32_t)interleaved.size(), bytes = n * 2;
  auto w32 = [&](uint32_t v) { fwrite(&v, 4, 1, f); };
  auto w16 = [&](uint16_t v) { fwrite(&v, 2, 1, f); };
  fwrite("RIFF", 1, 4, f); w32(36 + bytes); fwrite("WAVEfmt ", 1, 8, f);
  w32(16); w16(1); w16(2); w32((uint32_t)sampleRate); w32((uint32_t)sampleRate * 4); w16(4); w16(16);
  fwrite("data", 1, 4, f); w32(bytes);
  std::vector<int16_t> pcm(n);
  for (uint32_t i = 0; i < n; ++i) { float x = interleaved[i]; x = x > 1.f ? 1.f : (x < -1.f ? -1.f : x); pcm[i] = (int16_t)(x * 32767.f); }
  const bool ok = fwrite(pcm.data(), 2, n, f) == n;
  return fclose(f) == 0 && ok;
}
}  // namespace mgp
