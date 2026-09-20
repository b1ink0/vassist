# Android STT Compute Backends (sherpa-onnx)

Status: **CPU/XNNPACK live for all models. SenseVoice-on-QNN (Snapdragon NPU) is
implemented** — gated behind explicit opt-in + capability checks.

## XNNPACK / NNAPI status in prebuilt sherpa AARs

Prebuilt sherpa-onnx Android AARs (1.12.18, 1.13.6, static-link) are effectively
CPU-only:

- their bundled ORT registers only CPU + NNAPI EPs, and
- NNAPI is additionally disabled at compile time (sherpa builds with
  **ANDROID_API**=21 -> "Android NNAPI requires API level >= 27. Current API
  level 21" - that 21 is the build flag, not your device).

Requesting xnnpack/nnapi makes sherpa silently run CPU. The app's benchmark
detects this (timing within ~3% of CPU = internal fallback) and logs it.

Microsoft's official onnxruntime-android DOES include XNNPACK, and sherpa can
link against an external ORT via SHERPA_ONNXRUNTIME_LIB_DIR/INCLUDE_DIR.
Run tools/build-sherpa-android.sh to produce a custom AAR where XNNPACK
genuinely works - it is picked up automatically by the runtime probe.

## Backend chain

```
qnn      -> Qualcomm Hexagon NPU via sherpa's own QNN backend
            SenseVoice ONLY (sherpa publishes per-SoC context binaries;
            this AAR's API exposes qnnConfig on OfflineSenseVoiceModelConfig)
nnapi    -> ONNX Runtime NNAPI EP (Android accelerator; experimental)
cpu      -> plain ONNX Runtime CPU
```

- `auto` (default): benchmarks CPU vs NNAPI once per (model, device, engine
  version) with a fixed sample and caches the winner in SharedPreferences
  (`whisper_backend_prefs`). XNNPACK is NOT always faster.
- QNN is never selected automatically — user must set Compute Provider = QNN.
  If anything fails at load time, the existing fallback chain retries on CPU.
- Whisper/Dolphin requests with provider=qnn are routed back to the ONNX path.

## SenseVoice QNN — what's implemented

1. Model download: per-SoC context binary from sherpa's `asr-models-qnn-binary`
   release, e.g.
   `sherpa-onnx-qnn-SM8850-binary-5-seconds-sense-voice-zh-en-ja-ko-yue-2024-07-17-int8.tar.bz2`
   (~240 MB `model.bin`) → extracted to `filesDir/models/sensevoice/qnn/`.
   Requires a Snapdragon with a known HTP mapping (SM8550/8650/8750/8850...).
2. Recognizer wiring: `OfflineSenseVoiceModelConfig(model="", qnnConfig=
QnnConfig(backendLib=<nativeLibDir>/libQnnHtp.so, contextBinary=<model.bin>,
systemLib=<nativeLibDir>/libQnnSystem.so), language=..., useItn=false)`
   with `provider="qnn"`.
3. `ADSP_LIBRARY_PATH` env var set to `nativeLibraryDir` before recognizer
   creation (required by the Hexagon DSP loader).
4. UI: "SenseVoice NPU Accelerated" install card appears only when
   `/v1/models/status` reports `qnn.device_capable`; requires the regular
   SenseVoice model to be installed first (shared tokens.txt).
5. Constraints (from sherpa docs): fixed input shapes — audio longer than
   5 seconds is truncated; shorter is padded. No ITN/punctuation on QNN path.
   Measured RTF ~0.009 on SM8850 (~100x realtime) vs ~0.1 on CPU.

## QNN runtime libraries - fully automatic

The build downloads the PUBLIC Qualcomm QAIRT Community archive (no account
needed - same URL sherpa-onnx documents) and stages the 5 required .so files:

    gradle :app:fetchQnnLibs   # runs automatically as part of preBuild

Pinned: QAIRT 2.40.0.251030 (must match sherpa published model.bin).
Zip is cached in app/build/qnn-cache/ (~1.3 GB, one-time download).

Configure via gradle properties:

- -Pqnn.htp=v81 Hexagon arch (default v81 = SM8850/S26 Ultra; v80=SM8750, v75=SM8650, v73=SM8550)
- -Pqnn.sha256=<hex> optional integrity pin for the archive
- -Pqnn.version=x override pinned version

Staged into app/build/generated/qnnJniLibs/arm64-v8a/ and packaged automatically.
ADSP_LIBRARY_PATH is set to nativeLibraryDir at runtime by WhisperService.
AndroidManifest.xml declares <uses-native-library libcdsprpc.so/> (required=false) -
without it the app linker namespace cannot resolve Qualcomm vendor DSP libs and
QnnDeviceCreate fails with error 14001.

## Known risks / notes

- ORT 1.27.0 silently miscomputed an INT8 graph on SM8850 (fixed in 1.28.0;
  sherpa moved to 1.27.1). We run a decode self-test after every recognizer
  load; treat "session created" as insufficient evidence of correctness.
  NOTE: the QNN path does not use ONNX Runtime at all, so that class of bug
  does not affect NPU inference.
- Keep ONNX Runtime and `libsherpa-onnx-jni.so` version-matched if you ever
  rebuild the AAR — never hot-swap only one of them.
