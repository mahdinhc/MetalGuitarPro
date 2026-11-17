"""Patches the freshly generated React Native Android project for Metal Guitar Pro. Idempotent."""
import pathlib, re, sys

main = pathlib.Path("android/app/src/main")

# ---- AndroidManifest.xml ---------------------------------------------------------------------------------
mf = main / "AndroidManifest.xml"
s = mf.read_text(encoding="utf-8")
extra = [
    '<uses-permission android:name="android.permission.VIBRATE" />',
    '<uses-feature android:name="android.hardware.audio.low_latency" android:required="false" />',
    '<uses-feature android:name="android.hardware.audio.pro" android:required="false" />',
]
key = lambda x: x.split('"')[1]
add = "".join("    " + p + "\n" for p in extra if key(p) not in s)
if add:
    s = s.replace("<application", add + "    <application", 1)
# the app supports portrait and landscape (follows the system rotation lock); don't force an orientation
mf.write_text(s, encoding="utf-8")

# ---- MainApplication.kt ----------------------------------------------------------------------------------
files = list(main.glob("java/**/MainApplication.kt"))
if not files:
    sys.exit("MainApplication.kt not found")
p = files[0]
t = p.read_text(encoding="utf-8")
if "MetalGuitarPackage" not in t:
    marker = "// add(MyReactNativePackage())"
    if marker not in t:
        sys.exit("Could not patch MainApplication.kt (template changed?) - add MetalGuitarPackage() manually")
    p.write_text(t.replace(marker, "add(com.metalguitarpro.MetalGuitarPackage())"), encoding="utf-8")

# ---- strings.xml: display name ---------------------------------------------------------------------------
sx = main / "res/values/strings.xml"
if sx.exists():
    x = sx.read_text(encoding="utf-8")
    sx.write_text(re.sub(r'(<string name="app_name">)[^<]*(</string>)', r"\1Metal Guitar Pro\2", x), encoding="utf-8")

# ---- app/build.gradle ------------------------------------------------------------------------------------
gr = pathlib.Path("android/app/build.gradle")
g = gr.read_text(encoding="utf-8")

if "mgp_engine" not in g:
    # 1) Oboe (Prefab AAR)
    g2 = re.sub(r"dependencies\s*\{", 'dependencies {\n    implementation "com.google.oboe:oboe:1.9.0"', g, count=1)
    if g2 == g:
        sys.exit("Could not add Oboe to android/app/build.gradle - add com.google.oboe:oboe:1.9.0 manually")
    g = g2
    # 2) CMake build of the engine + prefab
    g2 = re.sub(r"(\nandroid\s*\{)", r'''\1
    // mgp_engine: C++ audio engine (native/cpp), built with CMake; Oboe is consumed through Prefab
    externalNativeBuild {
        cmake {
            path "src/main/cpp/CMakeLists.txt"
            version "3.22.1"
        }
    }
    buildFeatures {
        prefab true
    }''', g, count=1)
    if g2 == g:
        sys.exit("Could not patch android {} block in app/build.gradle")
    g = g2
    # 3) per-variant CMake args + ABI list (honours -PreactNativeArchitectures from CI)
    abi = "" if re.search(r"\bsplits\s*\{", g) else '''
        ndk {
            abiFilters.addAll((project.findProperty("reactNativeArchitectures") ?: "arm64-v8a,armeabi-v7a,x86_64").toString().split(","))
        }'''
    g2 = re.sub(r"defaultConfig\s*\{", '''defaultConfig {
        externalNativeBuild {
            cmake {
                cppFlags "-std=c++17"
                arguments "-DANDROID_STL=c++_shared"
            }
        }''' + abi, g, count=1)
    if g2 == g:
        sys.exit("Could not patch defaultConfig in app/build.gradle")
    g = g2

if "MGP_KEYSTORE_FILE" not in g:
    g = re.sub(r"versionCode\s+\d+", 'versionCode Integer.parseInt(System.getenv("MGP_VERSION_CODE") ?: "1")', g, count=1)
    sc = '''signingConfigs {
        release {
            def ks = System.getenv("MGP_KEYSTORE_FILE")
            if (ks) {
                storeFile file(ks)
                storePassword System.getenv("MGP_KEYSTORE_PASSWORD")
                keyAlias System.getenv("MGP_KEY_ALIAS")
                keyPassword System.getenv("MGP_KEY_PASSWORD")
            }
        }'''
    g2 = re.sub(r"signingConfigs\s*\{", sc, g, count=1)
    if g2 == g:
        sys.exit("Could not patch signingConfigs in android/app/build.gradle")
    g = g2
    old = "signingConfig signingConfigs.debug"
    i = g.rfind(old)   # the release build type comes after the debug one
    g = g[:i] + 'signingConfig System.getenv("MGP_KEYSTORE_FILE") ? signingConfigs.release : signingConfigs.debug' + g[i + len(old):]

if "vectoricons" not in g:
    g += '''

project.ext.vectoricons = [iconFontNames: ['MaterialCommunityIcons.ttf']]
apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")
'''
gr.write_text(g, encoding="utf-8")
print("patched manifest, MainApplication, strings, build.gradle")

# ---- adaptive launcher icon: ember guitar pick with a lightning bolt (+ monochrome for themed icons) -----------
res = main / "res"
(res / "drawable").mkdir(parents=True, exist_ok=True)
(res / "values").mkdir(parents=True, exist_ok=True)
(res / "mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)

FG = """<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="%(a)s" android:pathData="M54,82C54,82 31,64 31,46C31,36 38,30 54,30C70,30 77,36 77,46C77,64 54,82 54,82Z"/>
    <path android:fillColor="%(b)s" android:pathData="M58,38L46,57H54L50,70L63,50H55Z"/>
</vector>
"""
(res / "drawable" / "ic_launcher_foreground.xml").write_text(FG % {"a": "#FF5A36", "b": "#0A0A0C"}, encoding="utf-8")
(res / "drawable" / "ic_launcher_monochrome.xml").write_text(FG % {"a": "#FFFFFF", "b": "#000000"}, encoding="utf-8")
(res / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#0A0A0C</color></resources>\n', encoding="utf-8")
ADAPTIVE = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
"""
for n in ("ic_launcher.xml", "ic_launcher_round.xml"):
    (res / "mipmap-anydpi-v26" / n).write_text(ADAPTIVE, encoding="utf-8")
for d in res.glob("mipmap-*dpi"):          # drop the template's default raster icons
    for f in list(d.glob("ic_launcher*")):
        f.unlink()
print("patched launcher icon")
