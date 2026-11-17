cmake_minimum_required(VERSION 3.22.1)
project(mgp_engine LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Oboe comes from the Maven AAR as a Prefab package (see scripts/patch_android.py)
find_package(oboe REQUIRED CONFIG)

add_library(mgp_engine SHARED jni_bridge.cpp Engine.cpp AudioOutput.cpp)
target_compile_options(mgp_engine PRIVATE -O3 -fvisibility=hidden -Wall -Wextra -Wno-unused-parameter)
# 16 KB page-size compatible ELF segments (Android 15+ devices)
target_link_options(mgp_engine PRIVATE -Wl,-z,max-page-size=16384)
target_link_libraries(mgp_engine oboe::oboe log android)
