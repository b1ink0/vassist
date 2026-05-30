# Technical Overview

This section serves two different jobs:

- integration work for teams embedding VAssist into their own host app
- contributor work for people changing the VAssist runtime itself

If you are looking for user-facing help, start at [Start Here](/intro) or [Using VAssist](/guide/).

## If You Are Embedding VAssist

Start with the page that answers the next decision you actually need to make.

| Question                                             | Read this page                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Which package and entry point should I use?          | [Package Integration](/architecture/packages-and-integration)    |
| How do I mount and control a non-React instance?     | [@vassist/embed](/architecture/embed)                            |
| How do I use the React wrapper and `customizations`? | [@vassist/react](/architecture/react)                            |
| Which config field controls the thing I need?        | [Configuration Reference](/architecture/configuration-reference) |

## If You Are Changing VAssist Itself

| Question                                               | Read this page                                               |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| Which runtime owns this feature?                       | This page                                                    |
| Where does the code live?                              | [Repository Map](/architecture/repository-map)               |
| Which engines and model formats are in play?           | [AI and Media Stack](/architecture/ai-and-media-stack)       |
| What data is persisted or backed up?                   | [Storage and Data](/architecture/storage-and-data)           |
| How big is the repo and where are the generated trees? | [Repository Tree and Metrics](/architecture/repository-tree) |

## Runtime Model

VAssist is one shared application runtime with several outer shells around it.

| Layer                      | Main location                 | What it owns                                                                                          |
| -------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Shared application runtime | `src/`                        | Shared UI, stores, services, hooks, config, Babylon integration, and runtime-aware proxies            |
| Browser package surfaces   | `packages/`                   | Public browser APIs for plain JS hosts and React hosts                                                |
| Embed bootstrapping        | `embed/` and `src/embed/`     | Custom element definition, host APIs, config normalization, settings policy, branding, portal routing |
| Extension shell            | `extension/`                  | Content/background/offscreen runtime pieces and browser-specific bridge flow                          |
| Desktop shell              | `electron/`                   | Electron process wiring, local service management, IPC, packaging                                     |
| Android shell              | `android/` and `android-src/` | Native Android runtime, wallpaper mode, Android-local AI services, Android-facing web entry           |

## Request And Control Paths

The same UI can route work through very different execution paths.

| Situation                           | Path                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Browser host with builtin providers | UI -> service proxies -> browser-side provider/runtime code              |
| Browser host with secure bridge     | UI -> service proxies -> `transport.bridge` -> host/backend              |
| Extension                           | UI/content -> background and offscreen contexts -> provider/runtime code |
| Desktop local mode                  | UI -> service proxies -> Electron IPC -> local service/runtime           |
| Android local mode                  | UI -> bridge/store -> Android runtime service                            |

This is why `src/services/proxies/` matters: it is the routing layer that keeps one UI working across all shells.

## Package Boundary

The browser packages are thin public wrappers over the shared runtime.

- `packages/embed/src/` exposes imperative mount, update, remove, and type re-exports.
- `packages/react/src/` wraps the same runtime in React components and adds host-scoped React customizations.
- `src/embed/config.ts` is the central public config and type contract used by both packages.

If the docs and the exports ever disagree, `packages/embed/src/index.ts`, `packages/react/src/index.tsx`, and `src/embed/config.ts` are the files to trust first.

## Key Libraries

| Area                      | Library              | Why it is here                                   |
| ------------------------- | -------------------- | ------------------------------------------------ |
| Shared UI                 | React 19             | Common UI layer across shells                    |
| 3D rendering              | `@babylonjs/core`    | Live Assistant rendering                         |
| MMD model support         | `babylon-mmd`        | PMX/VMD loading and playback                     |
| Physics                   | `@babylonjs/havok`   | Cloth and hair simulation                        |
| Browser VAD               | `@ricky0123/vad-web` | Voice activity detection                         |
| Browser TTS               | `kokoro-js`          | ONNX-backed speech synthesis in browser contexts |
| Browser inference runtime | `onnxruntime-web`    | ONNX execution for supported browser features    |
| Desktop local LLM         | `node-llama-cpp`     | GGUF model execution on desktop                  |
| Persistence               | `dexie`              | IndexedDB-backed storage layer                   |
| Android bridge            | Capacitor            | Web-to-Android runtime bridge                    |

## Where To Look Next In Code

- `src/embed/` for host-facing config, branding, portal containers, and settings policy
- `src/services/proxies/` for runtime routing logic
- `src/components/` for shared product UI
- `packages/` for the public browser API boundary
- `electron/`, `extension/`, and `android/` for shell-specific code
