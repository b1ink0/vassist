# Technical Overview

Reference for the repository layout, runtime boundaries, storage model, and AI or media stack. For user-facing guides, start at [Start Here](/intro) or [Using VAssist](/guide/).

## Reference pages

| Page                                                         | What it is for                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [AI and Media Stack](/architecture/ai-and-media-stack)       | The engines, provider backends, and file formats behind chat, speech, and the Live Assistant. |
| [Storage and Data](/architecture/storage-and-data)           | What kinds of data VAssist saves and why backup matters.                                      |
| [Repository Map](/architecture/repository-map)               | A quick folder guide for contributors.                                                        |
| [Repository Tree and Metrics](/architecture/repository-tree) | File and directory totals, line counts by file type, and the full generated tree.             |

## Key libraries

| Area                | Library              | Notes                                                  |
| ------------------- | -------------------- | ------------------------------------------------------ |
| UI framework        | React 19             | Shared across all platforms                            |
| 3D rendering        | `@babylonjs/core` v8 | WebGL rendering for the Live Assistant                 |
| MMD support         | `babylon-mmd` v1     | PMX/VMD loading and playback on top of BabylonJS       |
| Physics             | `@babylonjs/havok`   | Cloth and hair simulation                              |
| VAD                 | `@ricky0123/vad-web` | Silero VAD v5, voice activity detection                |
| TTS (browser)       | `kokoro-js`          | ONNX-based TTS in a shared audio worker                |
| ONNX runtime        | `onnxruntime-web`    | Powers Kokoro and VAD inference in the browser         |
| Local LLM (desktop) | `node-llama-cpp`     | llama.cpp bindings for GGUF models                     |
| Storage             | `dexie`              | IndexedDB wrapper for config, chat history, and assets |
| Mobile bridge       | Capacitor            | Web-to-Android bridge for the native app               |

## Repository layout

VAssist is one product with multiple runtime shells.

- `src/` holds most of the shared React UI, services, hooks, stores, and Babylon scene logic.
- `extension/` adds browser-specific injection, background logic, and offscreen support.
- `electron/` adds the desktop runtime, local service managers, and IPC handlers.
- `android/` adds the native Android launcher, wallpaper service, and Android-local AI services.
- `android-src/` contains the Android-facing web entry used by the shared app.

## How the app boots

1. Load config and stores.
2. Detect which runtime is active.
3. Decide whether setup must block normal use.
4. Mount the shared UI or the runtime-specific wrapper.
5. Route actions through the right provider or bridge for the current platform.

## Proxy and bridge layers

The UI is consistent across platforms, but the implementation behind each action differs:

- In direct web flows, features can run inside the same app context.
- In the extension, the same action may pass through content, background, and offscreen contexts.
- In desktop and Android-local modes, actions go through local servers or native bridges.

## Main product systems

- setup wizard
- chat and voice
- AI toolbar
- Live Assistant and Babylon scene
- settings and provider configuration

## Runtime-heavy systems

- Electron local AI server management
- Android native AI services and wallpaper rendering
- extension background and offscreen audio handling
- file-backed storage, backup, and import or export behavior
