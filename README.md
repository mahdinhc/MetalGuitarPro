# Metal Guitar Pro (Android, React Native + C++ audio engine)

A mobile rebuild of the browser app *Metal Guitar Pro*: a playable six-string electric guitar with a full
high-gain amp, cabinet and effects chain, a piano-roll riff editor and 14 factory tones. The UI is React Native; the
**audio engine is C++ on Oboe (AAudio)**, so sound never depends on the JavaScript thread.

## Features (everything from the original, plus a few additions)

| Area | What you get |
|---|---|
| **Play** | Strum / Lead modes, multi-touch fretting with hammer-on, pull-off and slide, swipe-to-strum with swipe-speed dynamics, palm-mute edge on the strum zone, 14 chord shapes with up/down strums, capo (0-9), neck window up to fret 22 (fits 5-12 frets to your screen), whammy (spring-back), wah, hold-to-play Palm mute and Vibrato, Mute all, power chords, let ring, harmonics, tremolo picking |
| **Riff** | Piano roll: draw / select (lasso) / erase / pan, multi-select, two-finger pinch zoom on both axes, 6 snap values, chord stamps, 1-16 bars, BPM 40-260, loop, click, 80-step undo/redo, duplicate, transpose, length, velocity, palm mute, vibrato, harmonic, slide, hammer/pull, tremolo, power chord, let ring, bend, manual string choice, automatic string assignment, starter riffs, autosave |
| **Tone** | 8 tunings, 5 cabinets, TS boost, bridge pickup, gain / EQ / presence / tight / depth / sag / mid-frequency / noise gate / sustain / pick / stiffness / slide / vibrato / delay / chorus / room, **save your own presets**, reset to preset |
| **Extras** | Live **WAV export** of the riff (offline render through the same engine), peak + CPU meters, latency/underrun readout, light/dark theme, haptics, keep-screen-on, portrait **and** landscape layouts, TalkBack labels |

## Why the engine is C++ (and what that buys)

* **Sample-accurate sequencer inside the audio callback.** The original scheduled notes with JS timers. Here the riff
  is handed to the engine once as an event list; playback, looping, metronome, tremolo repeats and legato/slide links run
  on the audio thread. Measured onset error is within one 32-sample block (0.67 ms) of the ideal grid and independent of UI load.
* **Low latency.** Oboe `LowLatency` + exclusive mode + float stereo at the device's native sample rate (no resampler).
  The stream grows its buffer by one burst automatically on underruns. Touch events call the engine through a
  *synchronous* native method that only pushes into a lock-free queue, so there is no bridge batching in the path.
* **No allocation, no locks, no denormals on the audio thread.** Commands go through a ring buffer, parameters are atomics, sequence
  swaps are pointer hand-offs with deferred freeing, FTZ is enabled, feedback paths are flushed.
* **Better DSP than Web Audio gave us.** The three waveshaper stages run inside one **4x oversampled** block
  (half-band polyphase, 52 dB less aliasing than plain clipping, 0.4 ms latency). Strings have **two voices each** so re-picking
  crossfades instead of clicking. The 2880-tap cabinet convolution became the equivalent sparse-FIR + biquad structure, and
  the 1.4 s reverb convolver became an 8-line FDN, both calibrated to the loudness the original presets were tuned against.
* **Cheap.** Worst case (6 strings tremolo-picking, max gain, every effect on) measured **3.35 % of one 2.1 GHz core**.

## Verified here, and what is not

Verified in CI and locally (`bash scripts/test_all.sh`, about 1 minute, no device needed):

* engine under AddressSanitizer + UBSan: random parameters/notes at 44.1, 48 and 96 kHz, output always finite and limited
* all six open strings within 2.3 cents of equal temperament; sequencer onsets on grid
* oversampler passband flat to 0.01 dB, alias rejection 52 dB; reverb and compressor level calibration
* TypeScript riff model, string assignment, sequence builder, fretboard and piano-roll controllers (22 tests, including simulated multi-touch)
* the TS parameter table matches the C++ enum; every Kotlin `external fun` has a matching JNI symbol; the JNI bridge and Oboe wrapper compile

**Not verified (I had no Android toolchain or device):** the Gradle build itself, the React Native UI on screen, real Oboe
behaviour, and how the tones *sound*. The numbers say the DSP is correct and faithful to the original's structure, but
voicing is subjective: please A/B the presets against the HTML version and tell me what to adjust. Expect to fix a small
compile error or two on the first CI run; the log will point at the line (the same caveat applied to the OpenCut sample).

## Build the APK with GitHub Actions

1. Create an empty GitHub repository and push this folder to it:
   ```bash
   git init && git add . && git commit -m "Metal Guitar Pro"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Open the **Actions** tab. The *Android build* workflow starts by itself (first run about 15-25 min, later runs are faster).
   * job **verify** runs the engine/logic test suite,
   * job **build** generates the Android project, compiles the C++ engine with CMake, and runs Gradle.
3. When it is green, open the run and download the **MetalGuitarPro-apk** artifact. Unzip it and install the APK on your phone
   (allow "install unknown apps"). Use *Run workflow* to rebuild without a commit.
4. **Releases:** `git tag v1.0.0 && git push --tags` attaches the APK to a GitHub Release.
5. **Own signing key (optional, needed for Play Store/updates):**
   ```bash
   keytool -genkeypair -v -keystore release.keystore -alias mgp -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 release.keystore      # paste into the secret below
   ```
   Add repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
   Without them the APK is signed with the debug key, which is fine for sideloading.

The Android project is *generated* from the official React Native 0.76.9 template on every build (`scripts/bootstrap.sh`),
then `scripts/patch_android.py` adds Oboe, the CMake build, signing and the launcher icon. Only our own sources live in git.

## Local build

```bash
npm run bootstrap            # needs Node 18+, JDK 17, Android SDK + NDK
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```
Run the checks any time with `npm test`.

## If the app still closes at launch

The app is built so that a failing part degrades instead of crashing: a missing native library gives a silent app with a
message, a damaged save file is reset, and a render error shows a "Try again / Reset saved data" screen. If it still
dies, the cause is somewhere none of those guards reach, and the log names it. Connect the phone and run:

```bash
adb logcat -c && adb shell am start -n com.metalguitarpro/.MainActivity
adb logcat -d AndroidRuntime:E MetalEngine:V ReactNativeJS:V SoLoader:V DEBUG:V libc:F *:S
```

`AndroidRuntime` = Java/Kotlin exception, `DEBUG`/`libc` = native crash (the lines under `backtrace:` point into
`libmgp_engine.so`, `libreanimated.so` or `libreact_codegen_rnskia.so`), `MetalEngine` = engine load/stream messages.

## Layout

```
shared/params.json         single source of truth for every parameter (range, default, group)
scripts/gen_params.py      generates native/cpp/ParamIds.h and src/core/paramDefs.ts (CI fails if stale)
native/cpp/                C++ engine: Engine.cpp (voices, amp, FX, sequencer), dsp/*.h, AudioOutput (Oboe), jni_bridge.cpp
native/cpp/tests/          host harness: ASan stress, DSP unit tests, audio analysis, Oboe/JNI stubs
native/kotlin/             React Native module (sync hot path, 30 Hz meter/transport events, WAV export, lifecycle)
src/core/                  pure TypeScript: music data, presets, riff model, sequence builder, fretboard + roll controllers
src/store/ src/native/     zustand stores, engine facade, shared meter values (Reanimated)
src/screens/ src/components/ src/ui/   Play / Riff / Tone screens, Skia piano roll, controls
tests/                     Node tests for src/core
```

## Changing a parameter or adding a tone

Edit `shared/params.json`, run `python3 scripts/gen_params.py`, use `P_<id>` in `Engine.cpp`. Factory presets are in
`src/core/music.ts`; the test suite checks that every preset only uses real parameters within range.

## Known limits / next steps

* Touches reach the engine through the JS thread (about one frame of jitter if JS is busy). The next latency step would be a
  native touch surface for the neck; the controller logic is already isolated in `src/core/fretboard.ts` and could move to C++.
* Skia is pinned to 1.5.0 (matches RN 0.76 / Reanimated 3.16). Newer Skia needs a newer RN.
* For Play Store uploads targeting recent Android versions, move to a newer RN/NDK (16 KB page alignment; the engine library
  already links with 16 KB alignment, the RN libraries in 0.76 do not).
* Bluetooth headphones add 100+ ms of latency that no app can remove.

## Demo audio

`demo/` holds two WAVs rendered by the C++ engine itself on a PC (the same code the app runs): a riff using every articulation
(palm mutes, power chord, slide, hammer-on, bend, vibrato, harmonic, tremolo picking) and a power-chord strum at maximum gain with
delay and chorus. Listen to these first to judge the voicing.
