# Repository Map

The repository map is a folder-level index of the project. It is the fastest way to locate a feature area before opening the full generated tree.

## Root-level map

| Path | Purpose |
| --- | --- |
| `src/` | Shared product UI, hooks, stores, services, Babylon scene code, and shared configuration |
| `extension/` | Chrome extension runtime pieces: manifest, background, content, offscreen, and shared bridge types |
| `electron/` | Electron runtime orchestration, IPC, local server management, Python helper coordination, and packaging glue |
| `android/` | Native Android project, Gradle files, Kotlin runtime code, wallpaper service, and Android-local AI services |
| `android-src/` | Android-facing React entry and related web content |
| `public/` | Shared app assets, including bundled avatar and motion resources |
| `tools/` | Build-time helpers and Vite plugins |
| `documentation/` | Product docs, docs assets, and docs-generation scripts |
| `dist-android/`, `dist-desktop/`, `dist-desktop-release/` | Build outputs when they exist in the checkout |

## Where the docs live

| Path | Purpose |
| --- | --- |
| `documentation/site/getting-started/` | Install and setup guides |
| `documentation/site/guide/` | Task-based usage guides |
| `documentation/site/platforms/` | Desktop, Android, and extension differences |
| `documentation/site/settings/` | Exact settings reference |
| `documentation/site/architecture/` | Technical reference, repository map, and generated repository tree or metrics |
| `documentation/site/public/assets/` | Shared screenshots and GIFs used by the docs |

## Notable shared folders inside `src/`

| Path | Purpose |
| --- | --- |
| `src/components/` | Chat, settings, setup, toolbar, assistant, and shared UI pieces |
| `src/babylon/` | Scene, camera, animation, and interaction managers |
| `src/services/` | Business logic for AI, voice, assets, storage, and page interaction |
| `src/services/proxies/` | Runtime-aware routing layer for shared service calls |
| `src/hooks/` | App, config, bootstrap, and platform hooks |
| `src/stores/` | Zustand-based state containers |
| `src/config/` | Default config, prompt templates, scene presets, and animation categories |
| `src/workers/` | Shared audio worker and worker client logic |

## Full tree vs folder map

[Repository Tree and Metrics](/architecture/repository-tree) expands this into a file-by-file listing with counts. The map below stays at the folder level for quicker orientation.