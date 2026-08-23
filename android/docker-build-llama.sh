#!/usr/bin/env bash
# =============================================================================
# docker-build-llama.sh - runs INSIDE the snapdragon-toolchain container.
#
# Builds llama.cpp v0.2.0 (pinned) with CPU + Adreno OpenCL + Hexagon HTP
# backends using the upstream snapdragon presets, then compiles the VAssist
# JNI glue against the shared libs and copies every resulting .so into
# /work/llama/src/main/jniLibs/arm64-v8a/ for AGP to package.
#
# Host usage:
#   docker run --rm -v "<repo>/android:/work" \
#     ghcr.io/snapdragon-toolchain/arm64-android:v0.7 bash /work/docker-build-llama.sh
#
# The llama.cpp clone persists in android/.llama-build/llama-src and is reused
# across runs (incremental cmake rebuilds).
# =============================================================================
set -euo pipefail

PIN_DIR=/work/.llama-build/llama-src
JNI_CPP=/work/llama/src/main/cpp/llama-android.cpp
OUT_DIR=/work/llama/src/main/jniLibs/arm64-v8a

echo "== [1/5] Environment ======================================================"
echo "NDK:     ${ANDROID_NDK_ROOT:-unset}"
echo "OpenCL:  ${OPENCL_SDK_ROOT:-unset}"
echo "Hexagon: ${HEXAGON_SDK_ROOT:-unset} / tools ${HEXAGON_TOOLS_ROOT:-unset}"
[ -n "${ANDROID_NDK_ROOT:-}" ] || { echo "ANDROID_NDK_ROOT not set"; exit 1; }

echo "== [2/5] Apply VAssist patches ============================================="
python3 /work/llama/snapdragon/apply-vassist-patches.py "$PIN_DIR"

cd "$PIN_DIR"

echo "== [3/5] CMake configure (snapdragon release preset + mtmd) ================"
# Replicate docs/backend/snapdragon preset vars, plus what our JNI needs:
#   LLAMA_BUILD_TOOLS=ON  -> builds mtmd (vision) required by llama-android.cpp
#   LLAMA_BUILD_APP=OFF   -> unified llama binary needs tool impls we disable
cp -f docs/backend/snapdragon/CMakeUserPresets.json .
cmake --preset arm64-android-snapdragon-release -B build-snapdragon \
    -DLLAMA_BUILD_COMMON=ON \
    -DLLAMA_BUILD_TOOLS=ON \
    -DLLAMA_BUILD_APP=OFF \
    -DLLAMA_BUILD_EXAMPLES=OFF \
    -DLLAMA_BUILD_TESTS=OFF \
    -DLLAMA_BUILD_SERVER=OFF \
    -DLLAMA_CURL=OFF \
    -DGGML_BACKEND_DL=ON \
    -DGGML_VULKAN=ON \
    -DVulkan_GLSLC_EXECUTABLE="$ANDROID_NDK_ROOT/shader-tools/linux-x86_64/glslc" \
    -DSPIRV-Headers_DIR=/usr/share/cmake/SPIRV-Headers

echo "== [4/5] Build ============================================================="
cmake --build build-snapdragon -j "$(nproc)"

INSTALL_DIR="$PIN_DIR/pkg-snapdragon"
cmake --install build-snapdragon --prefix "$INSTALL_DIR" >/dev/null
echo "-- installed libs:"
ls -la "$INSTALL_DIR/lib" | head -30

echo "== [5/5] Compile JNI glue + stage into jniLibs ============================"
TOOLCHAIN_BIN="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin"
CXX="$TOOLCHAIN_BIN/aarch64-linux-android31-clang++"

rm -f "$OUT_DIR"/*.so
mkdir -p "$OUT_DIR"

# Link the JNI lib against the installed shared libs (plain sonames - no
# versioned suffixes - so they load directly from jniLibs on Android)
SRC_LIBS="-L$INSTALL_DIR/lib"

# -static-libstdc++: match AGP's default so libllama-android.so has no
# libc++_shared.so DT_NEEDED entry (nothing else in the stack needs it).
"$CXX" -shared -fPIC -O3 -DNDEBUG -std=c++17 -static-libstdc++ \
    -march=armv8.7a+fp16+dotprod+i8mm -fvectorize -ffp-model=fast -fno-finite-math-only \
    -D_GNU_SOURCE \
    -I"$PIN_DIR/include" \
    -I"$PIN_DIR/ggml/include" \
    -I"$PIN_DIR/common" \
    -I"$PIN_DIR/tools/mtmd" \
    "$JNI_CPP" \
    -o "$OUT_DIR/libllama-android.so" \
    $SRC_LIBS \
    -lllama -lllama-common -lmtmd -llog -landroid

# Stage every runtime .so needed on-device:
#   - lib/  : libggml, libggml-base, libllama, libllama-common, libmtmd ...
#   - bin/  : GGML_BACKEND_DL module backends (libggml-cpu/opencl/hexagon)
# Skip the *-impl tool libs and remove stale .so from previous runs first so
# DL and non-DL builds never mix.
for f in "$INSTALL_DIR"/lib/*.so "$INSTALL_DIR"/bin/libggml-*.so; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"
    case "$base" in
        *-impl.so) continue ;;
    esac
    cp -f "$f" "$OUT_DIR"/
done

cat > "$OUT_DIR/PREBUILT_SNAPDRAGON.txt" <<EOF
Prebuilt Snapdragon llama.cpp stack (CPU + OpenCL GPU + Hexagon NPU).
Source: llama.cpp @ $(git -C "$PIN_DIR" rev-parse HEAD)
Built inside ghcr.io/snapdragon-toolchain/arm64-android:v0.7 via docker-build-llama.sh.
When this folder contains libllama-android.so, gradle skips the CPU-only
externalNativeBuild and packages these libs instead.
EOF

echo "== DONE ===================================================================="
ls -la "$OUT_DIR"
