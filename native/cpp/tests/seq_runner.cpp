// Renders a raw float32 event file (from tests/dump_sequence.ts) through the engine -> WAV, prints stats.
#include <cstdio>
#include <vector>
#include "../Engine.h"
#include "../Wav.h"
using namespace mgp;
int main(int argc, char** argv) {
  if (argc < 4) return 2;
  FILE* f = fopen(argv[1], "rb"); if (!f) return 2;
  std::vector<float> ev(1 << 16); size_t n = fread(ev.data(), 4, ev.size(), f); fclose(f); ev.resize(n);
  Engine e; e.prepare(48000); e.setBpm(140);
  e.setParam(P_gain, 75); e.setParam(P_room, 20);
  e.setSequence(ev.data(), (int)(n / kEvStride), 8.0, true); e.play(0);
  std::vector<float> out, b(960); for (int i = 0; i < 48000 * 7 / 480 * 1; ++i) { e.process(b.data(), 480); out.insert(out.end(), b.begin(), b.end()); }
  float pk = 0; bool ok = true; for (float x : out) { if (!std::isfinite(x)) ok = false; pk = std::max(pk, std::fabs(x)); }
  auto st = e.stats();
  printf("events=%zu rendered=%.1fs peak=%.3f finite=%d beat=%.2f playing=%.0f\n", n / kEvStride, out.size() / 96000.0, pk, ok, st.beat, st.playing);
  writeWav16(argv[2], out, 48000);
  return ok && pk > .05f && pk <= 1.f ? 0 : 1;
}
