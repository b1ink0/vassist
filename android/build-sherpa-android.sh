#!/usr/bin/env bash
# =============================================================================
# android/build-sherpa-android.sh
#
# Builds a REPRODUCIBLE sherpa-onnx Android AAR with a self-compiled ONNX
# Runtime that includes XNNPACK (+ optionally NNAPI and QNN), then installs it
# into android/app/libs/ for the vassist app.
#
# Run it directly:            bash android/build-sherpa-android.sh
# Or through Gradle:          cd android && ./gradlew.bat buildSherpaAar
#
# The app's Gradle config auto-detects the produced AAR
# (app/libs/sherpa-onnx-custom-xnnpack.aar) and prefers it over the stock one -
# no other changes needed. The runtime probe in ComputeBackendManager then
# enables XNNPACK automatically.
#
# Why: sherpa-onnx's prebuilt AARs bundle an ORT with only CPU (their NNAPI is
# compiled out via __ANDROID_API__=21 and there is no XNNPACK). Microsoft's
# official onnxruntime-android includes XNNPACK, and sherpa-onnx supports
# linking against an externally supplied ORT via SHERPA_ONNXRUNTIME_LIB_DIR /
# SHERPA_ONNXRUNTIME_INCLUDE_DIR.
#
# Requirements:
#   - Linux / macOS native, OR Windows with WSL (the Gradle task
#     `gradlew buildSherpaAar` routes through WSL automatically on Windows)
#   - cmake >= 3.24, ninja or make, python3, git, JDK 17
#   - ANDROID_NDK env var pointing at a LINUX Android NDK inside WSL
#     (a Windows NDK under /mnt/c cannot run in WSL - download the Linux one)
#   - ~10 GB free disk, 30-90 min first run (cached afterwards)
#
# Usage:
#   ./build-sherpa-android.sh                 # CPU + XNNPACK + NNAPI
#   QNN=1 ./build-sherpa-android.sh           # also enable QNN backend
#   ORT_VERSION=v1.20.1 SHERPA_VERSION=v1.13.6 ./build-sherpa-android.sh
# =============================================================================
set -euo pipefail

ORT_VERSION="${ORT_VERSION:-v1.20.1}"      # ONNX Runtime tag (>= 1.20 recommended)
SHERPA_VERSION="${SHERPA_VERSION:-v1.13.6}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"    # android/
WORKDIR="${WORKDIR:-$SCRIPT_DIR/.sherpa-build}"
QNN_ENABLED="${QNN:-0}"

: "${ANDROID_NDK:?Set ANDROID_NDK to your NDK path (Linux NDK inside WSL)}"

# Guard: a Windows NDK mounted under /mnt/* cannot execute inside WSL
if grep -qs '^/mnt/' <<< "${ANDROID_NDK//\\//}" && [ ! -x "$ANDROID_NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/clang" ]; then
    echo "ERROR: ANDROID_NDK points at a Windows NDK ($ANDROID_NDK) which cannot run inside WSL."
    echo "Download the LINUX NDK inside WSL, e.g.:"
    echo "  wget https://dl.google.com/android/repository/android-ndk-r26d-linux.zip"
    echo "  unzip android-ndk-r26d-linux.zip && export ANDROID_NDK=\$PWD/android-ndk-r26d"
    exit 1
fi

mkdir -p "$WORKDIR"
cd "$WORKDIR"

echo "== [1/4] ONNX Runtime $ORT_VERSION (CPU + XNNPACK + NNAPI) =========="
if [ ! -d onnxruntime ]; then
    git clone --depth 1 --branch "$ORT_VERSION" \
        https://github.com/microsoft/onnxruntime.git
fi
cd onnxruntime
./build.sh \
    --android \
    --android_abi arm64-v8a \
    --android_api 27 \
    --use_xnnpack \
    --use_nnapi \
    --build_shared_lib \
    --parallel
cd "$WORKDIR"

echo "== [2/4] sherpa-onnx $SHERPA_VERSION ===================================="
if [ ! -d sherpa-onnx ]; then
    git clone --depth 1 --branch "$SHERPA_VERSION" \
        https://github.com/k2-fsa/sherpa-onnx.git
fi
cd sherpa-onnx

export SHERPA_ONNXRUNTIME_LIB_DIR="$WORKDIR/onnxruntime/build/Android/Release"
export SHERPA_ONNXRUNTIME_INCLUDE_DIR="$WORKDIR/onnxruntime/include/onnxruntime/core/session"

# QNN backend is required for SenseVoice-on-Snapdragon-NPU; always enable it.
# (No QAIRT SDK needed at BUILD time - only the runtime .so files, which the
# app's fetchQnnLibs Gradle task stages automatically.)
export SHERPA_ONNX_ENABLE_QNN=ON

./build-android-arm64-v8a.sh

echo "== [3/4] Locate built AAR ==============================================="
AAR=$(find "$WORKDIR/sherpa-onnx" -name "sherpa-onnx-*-*.aar" | head -1)
[ -z "$AAR" ] && { echo "ERROR: no AAR produced"; exit 1; }
echo "Found: $AAR"

echo "== [4/4] Install into android/app/libs =================================="
DEST="$SCRIPT_DIR/app/libs/sherpa-onnx-custom-xnnpack.aar"
cp "$AAR" "$DEST"
echo "Installed: $DEST"

cat <<'EOF'

NEXT STEPS
----------
1. Rebuild the app - Gradle auto-detects sherpa-onnx-custom-xnnpack.aar in
   app/libs/ and prefers it over the stock AAR (check the [deps] log line).
2. The runtime probe in ComputeBackendManager enables XNNPACK automatically;
   the benchmark will start comparing CPU vs XNNPACK vs NNAPI.
3. Verify via: adb logcat -s WhisperService ComputeBackend
EOF
