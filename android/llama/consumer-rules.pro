# Llama.cpp Android - Consumer ProGuard rules
# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep LlamaAndroid class and all its methods
-keep class android.llama.cpp.LlamaAndroid { *; }
-keep class android.llama.cpp.LlamaAndroid$* { *; }
