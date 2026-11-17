#!/usr/bin/env bash
# Idempotent: safe to run locally and in CI.
# Only our own sources live in git (src/, native/). The Android project itself is generated from the
# official React Native template, so Gradle / AGP / Kotlin / NDK versions, the Gradle wrapper and
# autolinking are always the ones this RN version is tested with. Then we overlay:
#   native/kotlin/*.kt  -> the React Native module (bridge to the engine)
#   native/cpp/**       -> the C++ audio engine (built by CMake through Gradle, Oboe via Prefab)
set -euo pipefail
cd "$(dirname "$0")/.."

RN_VERSION="${RN_VERSION:-0.76.9}"
PKG=com.metalguitarpro
PKG_DIR=android/app/src/main/java/com/metalguitarpro

# a leftover hand-made android/ folder (no Gradle wrapper) is replaced by a fresh template
if [ -d android ] && [ ! -f android/gradlew ]; then
  echo ">> android/ has no gradlew - regenerating it"
  rm -rf android
fi

if [ ! -d android ]; then
  echo ">> Generating React Native $RN_VERSION scaffold"
  TMP="$(mktemp -d)"
  npx --yes @react-native-community/cli@latest init MetalGuitarPro \
      --version "$RN_VERSION" --package-name "$PKG" \
      --skip-install --skip-git-init --directory "$TMP/app"
  cp -rn "$TMP/app/." .          # never overwrites our own files (index.js, package.json, ...)
  rm -rf "$TMP" App.tsx __tests__
fi

if [ ! -d node_modules ]; then
  echo ">> npm install"
  npm install --no-audit --no-fund --legacy-peer-deps
fi

echo ">> Checking generated parameter tables"
python3 scripts/gen_params.py --check

echo ">> Applying native overlay"
mkdir -p "$PKG_DIR"
cp -f native/kotlin/*.kt "$PKG_DIR/"
CPP_DST=android/app/src/main/cpp
rm -rf "$CPP_DST" && mkdir -p "$CPP_DST"
cp -r native/cpp/. "$CPP_DST/"
rm -rf "$CPP_DST/tests"          # host-only test harness, not part of the app
python3 scripts/patch_android.py

# legacy bridge module (old architecture); more heap for the Gradle daemon
sed -i 's/^newArchEnabled=.*/newArchEnabled=false/' android/gradle.properties
sed -i 's/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g/' android/gradle.properties
chmod +x android/gradlew
echo ">> Done. Build: cd android && ./gradlew assembleRelease"
