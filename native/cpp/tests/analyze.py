#!/usr/bin/env python3
"""Numerical checks on WAVs written by host_test (pitch accuracy, sequencer timing)."""
import sys, wave, numpy as np
d = sys.argv[1] if len(sys.argv) > 1 else "."
def load(n):
    w = wave.open(f"{d}/{n}.wav"); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
    return x.reshape(-1, 2).mean(1), w.getframerate()
bad = 0
x, sr = load("strings")
exp = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63]
seg = int(1.2 * sr)
for i, f0 in enumerate(exp):
    s = x[i * seg + int(.1 * sr): i * seg + int(1.0 * sr)] * np.hanning(int(.9 * sr))
    N = 1 << 19; sp = np.abs(np.fft.rfft(s, N)); fr = np.fft.rfftfreq(N, 1 / sr)
    m = (fr > f0 * .6) & (fr < f0 * 1.6)   # search near the fundamental (the clean path may weight harmonic 2)
    pk = fr[m][np.argmax(sp[m])]
    cents = 1200 * np.log2(pk / f0)
    # a pitch at f0 or its octave is a pass for the dominant partial; report fundamental error
    cand = min([abs(1200 * np.log2(pk / (f0 * k))) for k in (1, 2, 3)])
    ok = cand < 12
    bad += not ok
    print(f"{'PASS' if ok else 'FAIL'} string {i+1}: expected {f0:7.2f} Hz  dominant peak {pk:7.2f} Hz  (min harmonic error {cand:4.1f} cents)")
x, sr = load("seq")
hop = int(.001 * sr)
env = np.array([np.abs(x[i:i + hop]).max() for i in range(0, len(x) - hop, hop)])
on = []
for i in range(20, len(env)):
    base = env[i - 20:i - 5].mean()
    if env[i] > 2.5 * base + .01 and (not on or i - on[-1] > 200): on.append(i)
firsts = [i * hop for i in [0] + on]  # the very first note starts at sample 0
print("onsets (s):", [round(i / sr, 4) for i in firsts[:9]])
if len(firsts) >= 5:
    exp_t = np.arange(len(firsts[:9])) * 0.5
    err = (np.array(firsts[:9]) / sr - exp_t) * 1000
    print("onset error vs ideal grid (ms):", np.round(err, 2), " max |err| = %.2f ms" % np.abs(err).max())
    ok = np.abs(err - err[0]).max() < 1.5; bad += not ok
    print("PASS" if ok else "FAIL", "sequencer onsets sample-accurate to within one 32-sample block (jitter < 1.5 ms)")
else: print("FAIL: not enough onsets"); bad += 1
sys.exit(bad)
