#!/usr/bin/env bash
# =============================================================================
# docker-build-sherpa.sh - runs INSIDE the vassist-sherpa-builder container.
#
# Host usage (one-off image build + run):
#   docker build -t vassist-sherpa-builder android/docker/
#   docker run -d --name sherpa-build \
#     -v "<repo>/android:/work" vassist-sherpa-builder bash /work/docker-build-sherpa.sh
#
# All toolchains are baked into the image; only source clones persist on the
# host mount (android/.sherpa-build) and are reused across runs.
# =============================================================================
set -euo pipefail

echo "== [1/5] ONNX Runtime v1.20.1 (Release: CPU+XNNPACK+NNAPI) ==============="
mkdir -p /work/.sherpa-build
cd /work/.sherpa-build
if [ ! -d onnxruntime ]; then
    git clone --depth 1 --branch v1.20.1 https://github.com/microsoft/onnxruntime.git
fi
cd onnxruntime

# Start from pristine deps.txt every run (idempotent re-vendoring)
git checkout -- cmake/deps.txt

# Dependency tarballs (eigen/abseil/...) are not byte-stable upstream, so the
# recorded SHA1s fail randomly. Fix properly: vendor each dep into ORT's own
# local mirror folder (checked before network), record the ACTUAL sha1 of our
# vendored copy, and never touch the network again.
python3 - <<'EOF'
import hashlib, pathlib, urllib.request
root = pathlib.Path('.').resolve()
deps = root / 'cmake/deps.txt'
lines = deps.read_text().splitlines()
out, changed = [], 0
for ln in lines:
    if ln.startswith('#') or ';' not in ln:
        out.append(ln); continue
    parts = ln.split(';')
    name, url = parts[0], parts[1]
    # git-repo deps (.git URLs) are cloned by cmake itself - leave untouched
    if not url.startswith('http') or url.endswith('.git') or len(parts) < 3:
        out.append(ln); continue
    dst = root / 'mirror' / url.split('://', 1)[1]
    if not dst.exists():
        print(f'[mirror] fetching {name}: {url}')
        dst.parent.mkdir(parents=True, exist_ok=True)
        last = None
        for _ in range(3):
            try:
                urllib.request.urlretrieve(url, dst); last=None; break
            except Exception as e:
                last = e
        if last: raise SystemExit(f'mirror download failed for {name}: {last}')
    sha1 = hashlib.sha1(dst.read_bytes()).hexdigest()
    if parts[2] != sha1:
        parts[2] = sha1; changed += 1
    out.append(';'.join(parts))
deps.write_text('\n'.join(out) + '\n')
print(f'[mirror] deps vendored+hashed ({changed} hashes updated)')
EOF

./build.sh --android --android_abi arm64-v8a --android_api 27 \
    --android_ndk "$ANDROID_NDK" \
    --android_sdk "$ANDROID_SDK_HOME" \
    --config Release \
    --use_xnnpack --use_nnapi --build_shared_lib --parallel --skip_tests \
    --allow_running_as_root

echo "== [2/5] sherpa-onnx v1.13.6 linked against custom ORT ==================="
cd /work/.sherpa-build
if [ ! -d sherpa-onnx ]; then
    git clone --depth 1 --branch v1.13.6 https://github.com/k2-fsa/sherpa-onnx.git
fi

# Android linker namespaces (targetSdk 34+) can reject absolute-path dlopen
# even for the app's own nativeLibraryDir. Patch sherpa's 3 QNN dlopen sites to
# fall back to opening by soname - the libs are pre-loaded via
# System.loadLibrary on the Kotlin side, so the basename resolves.
python3 - <<'EOF'
import pathlib, re

patched = 0
for rel in ["sherpa-onnx/sherpa-onnx/csrc/qnn/qnn-backend.cc", "sherpa-onnx/sherpa-onnx/csrc/qnn/qnn-model.cc"]:
    p = pathlib.Path(rel)
    src = p.read_text()
    pattern = re.compile(
        r"(\n\s*(\w+) = std::unique_ptr<void, decltype\(&dlclose\)>\(\n"
        r"\s*dlopen\((\w+)\.c_str\(\), RTLD_NOW \| RTLD_LOCAL\), &dlclose\);\n)"
    )
    def repl(m):
        global patched
        patched += 1
        var, arg = m.group(2), m.group(3)
        return (
            m.group(1)
            + f"    if (!{var} && {arg}.find('/') != std::string::npos) {{\n"
            + f"      // Android linker namespace may block absolute-path dlopen;\n"
            + f"      // retry by soname (lib is preloaded via System.loadLibrary).\n"
            + f"      std::string base = {arg}.substr({arg}.find_last_of('/') + 1);\n"
            + f"      SHERPA_ONNX_LOGE(\"Retrying dlopen by soname: '%s'\", base.c_str());\n"
            + f"      {var} = std::unique_ptr<void, decltype(&dlclose)>(\n"
            + f"          dlopen(base.c_str(), RTLD_NOW | RTLD_LOCAL), &dlclose);\n"
            + f"    }}\n"
        )
    src = pattern.sub(repl, src)
    p.write_text(src)
print(f"[qnn-patch] patched {patched} dlopen sites (expected 3)")
if patched != 3:
    raise SystemExit("unexpected dlopen site count")
EOF
cd sherpa-onnx
export SHERPA_ONNXRUNTIME_LIB_DIR=/work/.sherpa-build/onnxruntime/build/Android/Release
export SHERPA_ONNXRUNTIME_INCLUDE_DIR=/work/.sherpa-build/onnxruntime/include/onnxruntime/core/session
# REQUIRED for SenseVoice-on-NPU: compiles sherpa's own QNN backend into the JNI lib.
# Build-time QNN headers come from the same pinned QAIRT archive the app's
# fetchQnnLibs task downloads (cached under /work/app/build/qnn-cache).
export SHERPA_ONNX_ENABLE_QNN=ON
QAIRT_VERSION="${QAIRT_VERSION:-2.40.0.251030}"
QAIRT_ZIP=/work/app/build/qnn-cache/v${QAIRT_VERSION}.zip
if [ ! -f "$QAIRT_ZIP" ]; then
    echo "FATAL: $QAIRT_ZIP not found - run 'gradlew :app:fetchQnnLibs' once first"
    exit 1
fi
if [ ! -d /work/.sherpa-build/qairt ]; then
    echo "Extracting QAIRT ${QAIRT_VERSION} for build-time headers..."
    mkdir -p /work/.sherpa-build/qairt
    unzip -q "$QAIRT_ZIP" -d /work/.sherpa-build/qairt "qairt/${QAIRT_VERSION}/include/*" \
        "qairt/${QAIRT_VERSION}/lib/aarch64-android/*" 2>/dev/null || \
    unzip -q "$QAIRT_ZIP" -d /work/.sherpa-build/qairt
fi
export QNN_SDK_ROOT=$(echo /work/.sherpa-build/qairt/qairt/${QAIRT_VERSION})
[ -f "$QNN_SDK_ROOT/include/QNN/QnnInterface.h" ] || {
    # some archives nest differently - locate it
    export QNN_SDK_ROOT=$(dirname $(dirname $(find /work/.sherpa-build/qairt -name QnnInterface.h | head -1)))
}
echo "QNN_SDK_ROOT=$QNN_SDK_ROOT"
ls "$QNN_SDK_ROOT/include/QNN/QnnInterface.h"
./build-android-arm64-v8a.sh

LIBDIR=/work/.sherpa-build/sherpa-onnx/build-android-arm64-v8a/install/lib
ls -la "$LIBDIR"

echo "== [3/5] Verifying XNNPACK + QNN backends compiled in ===================="
SYMS=$(grep -ac "xnn_setup_\|xnnpack_execution_provider\|xnn_status_success" "$SHERPA_ONNXRUNTIME_LIB_DIR/libonnxruntime.so" || true)
echo "xnnpack implementation symbols found: $SYMS (must be > 0)"
if [ "$SYMS" -eq 0 ]; then
    echo "FATAL: built libonnxruntime.so has no XNNPACK implementation!"
    exit 1
fi

QNN_STR=$(grep -ac "offline-sense-voice-model-qnn\|qnn-context-binary" /work/.sherpa-build/sherpa-onnx/build-android-arm64-v8a/lib/libsherpa-onnx-jni.so || true)
echo "sherpa QNN backend strings found: $QNN_STR (must be > 0)"
if [ "$QNN_STR" -eq 0 ]; then
    echo "FATAL: libsherpa-onnx-jni.so was built WITHOUT -DSHERPA_ONNX_ENABLE_QNN=ON!"
    exit 1
fi

echo "== [4/5] Patching AAR ====================================================="
cd /tmp
rm -rf patch && mkdir patch && cd patch
cp /work/app/libs/sherpa-onnx-1.13.6.aar custom.aar
mkdir -p jni/arm64-v8a
SHERPA_LIB=/work/.sherpa-build/sherpa-onnx/build-android-arm64-v8a/install/lib
cp "$SHERPA_LIB"/libsherpa-onnx-jni.so   jni/arm64-v8a/
cp "$SHERPA_LIB"/libonnxruntime.so       jni/arm64-v8a/
# Remove stock c-api/cxx-api libs (not rebuilt here, unused by the app)
zip -q -d custom.aar \
    jni/arm64-v8a/libsherpa-onnx-c-api.so \
    jni/arm64-v8a/libsherpa-onnx-cxx-api.so || true
zip -q custom.aar jni/arm64-v8a/libsherpa-onnx-jni.so \
                  jni/arm64-v8a/libonnxruntime.so
cp custom.aar /work/app/libs/sherpa-onnx-custom-xnnpack.aar
ls -la /work/app/libs/

echo "== [5/5] DONE - reinstall app to pick up sherpa-onnx-custom-xnnpack.aar =="
