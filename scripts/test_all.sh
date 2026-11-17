#!/usr/bin/env bash
# Everything that can be verified without an Android device: runs locally and in CI.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
if command -v tsx >/dev/null 2>&1; then TSX=tsx; else TSX="npx --no-install tsx"; fi
CPP=native/cpp

echo "== generated parameter tables"; python3 scripts/gen_params.py --check
echo "== TypeScript core (riff model, fretboard, controller)"; $TSX tests/core.test.ts
echo "== C++ engine: ASan/UBSan stress + feature tests"
g++ -std=c++17 -O1 -g -fsanitize=address,undefined -fno-sanitize-recover=undefined -I$CPP $CPP/Engine.cpp $CPP/tests/host_test.cpp -o "$OUT/host_test"
"$OUT/host_test" "$OUT"
echo "== C++ DSP blocks"
g++ -std=c++17 -O1 -g -fsanitize=address,undefined -fno-sanitize-recover=undefined -I$CPP $CPP/Engine.cpp $CPP/tests/dsp_test.cpp -o "$OUT/dsp_test"
"$OUT/dsp_test"
echo "== audio analysis (pitch accuracy, sequencer timing)"
python3 $CPP/tests/analyze.py "$OUT"
echo "== TS sequence -> C++ engine, end to end"
$TSX tests/dump_sequence.ts "$OUT/ev.bin"
g++ -std=c++17 -O1 -I$CPP $CPP/Engine.cpp $CPP/tests/seq_runner.cpp -o "$OUT/seq_runner"
"$OUT/seq_runner" "$OUT/ev.bin" "$OUT/full.wav" x
echo "== JNI bridge + Oboe wrapper compile (against API stubs) and symbol check"
g++ -std=c++17 -D__ANDROID__ -Wall -Wextra -Wno-unused-parameter -c -I$CPP/tests/stubs -I$CPP $CPP/jni_bridge.cpp -o "$OUT/jni.o"
g++ -std=c++17 -Wall -Wextra -Wno-unused-parameter -fsyntax-only -I$CPP/tests/stubs -I$CPP $CPP/AudioOutput.cpp
python3 - "$OUT/jni.o" <<'PY'
import re, subprocess, sys
kt = set(re.findall(r'external fun (native\w+)', open('native/kotlin/NativeEngine.kt').read()))
nm = subprocess.run(['nm', sys.argv[1]], capture_output=True, text=True).stdout
cpp = set(re.findall(r'Java_com_metalguitarpro_NativeEngine_(native\w+)', nm))
assert kt == cpp, f"JNI mismatch: kotlin-only={kt - cpp} cpp-only={cpp - kt}"
assert re.search(r' T JNI_OnLoad$', nm, re.M), "JNI_OnLoad must have C linkage"
print(f"JNI symbols match ({len(kt)} functions), JNI_OnLoad exported")
PY
echo; echo "ALL CHECKS PASSED"
