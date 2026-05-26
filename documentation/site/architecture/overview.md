# Technical Overview

This reference covers the repository layout, runtime boundaries, storage model, and AI or media stack behind VAssist. Reader-focused guides live under [Start Here](/intro) and [Use VAssist](/guide/).

## Reference pages

| Page | What it is for |
| --- | --- |
| [AI and Media Stack](/architecture/ai-and-media-stack) | The engines, provider backends, and file formats behind chat, speech, and the companion. |
| [Storage and Data](/architecture/storage-and-data) | What kinds of data VAssist saves and why backup matters. |
| [Repository Map](/architecture/repository-map) | A quick folder guide for contributors. |
| [Repository Tree and Metrics](/architecture/repository-tree) | File and directory totals, line counts by file type, and the full generated tree. |

## Product layout

VAssist is one product with multiple runtime shells.

- `src/` holds most of the shared React UI, services, hooks, stores, and Babylon scene logic.
- `extension/` adds browser-specific injection, background logic, and offscreen support.
- `electron/` adds the desktop runtime, local service managers, and IPC handlers.
- `android/` adds the native Android launcher, wallpaper service, and Android-local AI services.
- `android-src/` contains the Android-facing web entry used by the shared app.

## Shared app flow

1. Load config and stores.
2. Detect which runtime is active.
3. Decide whether setup must block normal use.
4. Mount the shared UI or the runtime-specific wrapper for that mode.
5. Route high-level actions through the right provider or bridge for the current platform.

## Why the proxy and bridge layers exist

The UI tries to feel consistent across platforms, but the work behind each action is different.

- In direct web-style flows, some features can run inside the same app context.
- In extension mode, the same action may move through content, background, and offscreen contexts.
- In desktop and Android-local modes, the action can move through local servers or native bridges instead.

## Main product systems

- setup wizard
- chat and voice
- AI toolbar
- virtual companion and Babylon scene
- settings and provider configuration

## Runtime-heavy systems

- Electron local AI server management
- Android native AI services and wallpaper rendering
- extension background and offscreen audio handling
- file-backed storage, backup, and import or export behavior