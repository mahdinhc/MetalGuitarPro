// Host-side verification harness for the audio engine (no Android needed).
//   g++ -std=c++17 -O2 -I.. ../Engine.cpp host_test.cpp -o host_test && ./host_test <outdir>
// Writes WAVs for offline analysis (tests/analyze.py) and runs stress / timing / CPU checks.
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <string>
#include "../Engine.h"
#include "../Wav.h"
using namespace mgp;

static std::vector<float> render(Engine& e, double seconds, int sr) {
  std::vector<float> out; out.reserve((size_t)(seconds * sr * 2));
  std::vector<float> buf(2 * 480);
  long total = (long)(seconds * sr);
  while (total > 0) { int n = (int)std::min<long>(480, total); e.process(buf.data(), n); out.insert(out.end(), buf.begin(), buf.begin() + 2 * n); total -= n; }
  return out;
}
static void setP(Engine& e, int id, float v) { e.setParam(id, v); }
static void clean(Engine& e) {
  setP(e, P_gain, 5); setP(e, P_boost, 0); setP(e, P_gate, 0); setP(e, P_room, 0); setP(e, P_cabT, 4); setP(e, P_pres, 0);
  setP(e, P_bass, 0); setP(e, P_mid, 0); setP(e, P_treb, 0); setP(e, P_master, 60);
}
static bool finite(const std::vector<float>& v, float& peak) { peak = 0; for (float x : v) { if (!std::isfinite(x)) return false; peak = std::max(peak, std::fabs(x)); } return true; }

int main(int argc, char** argv) {
  const std::string dir = argc > 1 ? argv[1] : ".";
  const int sr = argc > 2 ? atoi(argv[2]) : 48000;
  int fails = 0;
  auto check = [&](bool ok, const char* what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what); if (!ok) ++fails; };

  // 1. each open string, clean tone -> pitch analysis
  { Engine e; e.prepare(sr); clean(e);
    std::vector<float> all;
    for (int s = 0; s < 6; ++s) { e.noteOn(s, 0, .9f, 0, 0); auto o = render(e, 1.2, sr); all.insert(all.end(), o.begin(), o.end()); e.noteOff(s, 0, 0); render(e, .3, sr); }
    float pk; check(finite(all, pk), "strings: finite output"); printf("  open-string peak %.3f\n", pk);
    writeWav16((dir + "/strings.wav").c_str(), all, sr); }

  // 2. metal preset, power chord strum at max gain -> level + aliasing check
  { Engine e; e.prepare(sr);
    setP(e, P_gain, 100); setP(e, P_master, 100); setP(e, P_room, 30); setP(e, P_dly, 30); setP(e, P_chor, 40);
    for (int s = 0; s < 3; ++s) e.noteOn(s, 2, 1.f, 0, s * 8.f);
    auto o = render(e, 3, sr); float pk; check(finite(o, pk), "metal max: finite"); check(pk <= 1.0f, "metal max: limited to <= 1.0");
    printf("  metal max peak %.3f\n", pk); writeWav16((dir + "/metal.wav").c_str(), o, sr); }

  // 3. sequencer timing: 4 notes on beats 0,1,2,3 at 120 bpm, clean tone
  { Engine e; e.prepare(sr); clean(e); e.setBpm(120);
    std::vector<float> ev;
    for (int b = 0; b < 4; ++b) {
      float on[8] = {(float)b, EV_ON, 0, 5, .9f, 0, 0, (float)b}; float off[8] = {b + .45f, EV_OFF, 0, 0, 0, 0, 0, (float)b};
      ev.insert(ev.end(), on, on + 8); ev.insert(ev.end(), off, off + 8); }
    e.setSequence(ev.data(), 8, 4.0, true); e.setMetronome(false); e.play(0);
    auto o = render(e, 4.5, sr); writeWav16((dir + "/seq.wav").c_str(), o, sr);
    auto st = e.stats(); printf("  seq beat after 4.5s = %.3f (9 beats mod 4 = 1.0 expected)\n", st.beat); }

  // 4. legato / slide / bend / vibrato features render without NaN
  { Engine e; e.prepare(sr); clean(e); setP(e, P_vib, 1); e.noteOn(1, 5, .9f, 0, 0); render(e, .3, sr);
    e.move(1, 9, 1); render(e, .5, sr); e.move(1, 7, 0); render(e, .3, sr); setP(e, P_bend, -2); auto o = render(e, .5, sr); float pk;
    check(finite(o, pk), "slide/legato/whammy/vibrato finite"); }

  // 5. stress: random params + random notes + sample-rate variants, run under ASan/UBSan in CI
  { for (int rate : {44100, 48000, 96000}) { Engine e; e.prepare(rate); Rng r(7); bool ok = true; float pk;
      for (int blk = 0; blk < 800; ++blk) {
        for (int k = 0; k < 4; ++k) { int id = (int)(r.unipolar() * P_COUNT) % P_COUNT; float lo = kParamMeta[id].min, hi = kParamMeta[id].max; e.setParam(id, lo + r.unipolar() * (hi - lo)); }
        if (r.unipolar() < .1f) e.noteOn((int)(r.unipolar() * 6) % 6, (int)(r.unipolar() * 22), r.unipolar(), (int)(r.unipolar() * 8), 0);
        if (r.unipolar() < .05f) e.noteOff((int)(r.unipolar() * 6) % 6, 0, 0);
        if (r.unipolar() < .03f) e.move((int)(r.unipolar() * 6) % 6, (int)(r.unipolar() * 22), r.unipolar() < .5f);
        if (r.unipolar() < .01f) e.muteAll(20);
        auto o = render(e, .02, rate); ok &= finite(o, pk) && pk <= 1.0001f; }
      char m[64]; snprintf(m, sizeof m, "stress @%d Hz finite + limited", rate); check(ok, m); } }

  // 5b. hostile input from the bridge (NaN, out-of-range, null): must neither crash nor poison the audio
  { Engine e; e.prepare(sr);
    const float nan = std::nanf("");
    for (int i = 0; i < P_COUNT; ++i) e.setParam(i, nan);
    e.setParam(-1, 1); e.setParam(P_COUNT + 7, 1); e.setBpm(nan); e.setBpm(0); e.setBpm(1e9);
    int bad[6] = {-50, 500, 0, 127, 128, -1}; e.setTuning(bad);
    e.noteOn(-3, 5, nan, 0, nan); e.noteOn(99, -40, 1, 0, 0); e.noteOn(2, 70000, 1, 0, 0); e.noteOff(-1, 0, 0); e.noteOff(77, 0, 0); e.move(-9, 3, 3); e.move(40, 3, 2);
    e.setSequence(nullptr, 5, nan, true); e.setSequence(nullptr, -1, -3, false);
    float junk[16] = {nan, 1, 0, 3, 1, 0, 0, 0,   -4, 99, 77, 3, 1, 0, 0, 0};
    e.setSequence(junk, 2, 4, true);
    e.play(nan); e.seek(nan); e.setMetronome(true);
    for (int i = 0; i < 6; ++i) e.noteOn(i, 3, 1, NF_TREM, 0);
    auto o = render(e, 1.0, sr); float pk; check(finite(o, pk) && pk <= 1.0001f, "hostile bridge input stays finite and limited");
    e.setParam(P_gain, 50); e.noteOn(0, 0, 1, 0, 0); auto o2 = render(e, .5, sr);
    float pk2 = 0; check(finite(o2, pk2) && pk2 > 0.001f, "engine still makes sound after hostile input"); }

  // 6. CPU: worst case (all strings, max gain, all fx) real-time factor
  { Engine e; e.prepare(sr); setP(e, P_gain, 100); setP(e, P_room, 80); setP(e, P_dly, 60); setP(e, P_chor, 80); setP(e, P_vib, 1);
    for (int s = 0; s < 6; ++s) e.noteOn(s, 3, 1, NF_TREM, 0);
    const double secs = 20; auto t0 = std::chrono::steady_clock::now(); auto o = render(e, secs, sr);
    double dt = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    printf("  worst-case: %.1f s of audio in %.3f s -> %.2f%% of one core (host CPU)\n", secs, dt, 100 * dt / secs);
    float pk; check(finite(o, pk), "cpu test finite"); }

  printf(fails ? "\n%d FAILED\n" : "\nall engine checks passed\n", fails);
  return fails ? 1 : 0;
}
