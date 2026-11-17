// Minimal signature-compatible subset of <jni.h>, ONLY for host compile checks (real builds use the NDK's).
#pragma once
#include <cstdint>
#define JNIEXPORT __attribute__((visibility("default")))
#define JNICALL
typedef int32_t jint; typedef int64_t jlong; typedef float jfloat; typedef double jdouble; typedef uint8_t jboolean; typedef jint jsize;
#define JNI_TRUE 1
#define JNI_FALSE 0
#define JNI_VERSION_1_6 0x00010006
#define JNI_ERR (-1)
struct _jobject {}; typedef _jobject* jobject; typedef _jobject* jclass; typedef _jobject* jstring;
typedef _jobject* jfloatArray; typedef _jobject* jintArray;
struct JavaVM;
struct JNIEnv {
  jsize GetArrayLength(jobject); void GetFloatArrayRegion(jfloatArray, jsize, jsize, jfloat*); void GetIntArrayRegion(jintArray, jsize, jsize, jint*);
  jfloatArray NewFloatArray(jsize); void SetFloatArrayRegion(jfloatArray, jsize, jsize, const jfloat*);
  const char* GetStringUTFChars(jstring, jboolean*); void ReleaseStringUTFChars(jstring, const char*);
  jboolean ExceptionCheck(); void ExceptionClear();
};
