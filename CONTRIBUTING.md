# Contributing to VAssist

Thanks for taking a look at the project.

This repository ships the same core app in several hosts: a standalone web app, an embedded docs build, a Chrome extension, an Electron desktop app, and an Android app plus wallpaper flow. Most of the work happens in shared code, but each host has its own entrypoint and a little platform plumbing. This guide is here to help you land in the right place quickly.

## Prerequisites

- Bun 1.3.5 (the version declared in `package.json`)
- Chrome 138+ for extension and Chrome AI work
- Android Studio plus the Android SDK if you are touching Android builds
- Git

Building the Windows desktop live-wallpaper addon also requires Node.js, Python, Visual Studio C++ build tools (MSVC v143), and a Windows SDK. See [`electron/native/desktop-host/README.md`](electron/native/desktop-host/README.md).

## First Setup

From the repository root:

```bash
git clone https://github.com/b1ink0/vassist.git
cd vassist
bun install
```

Use Bun for dependency installation and project scripts. The repository pins the expected Bun version in `package.json`.

## Common Commands

### Development

| Goal                                      | Command                              | Notes                                               |
| ----------------------------------------- | ------------------------------------ | --------------------------------------------------- |
| Standalone web app                        | `bun run dev`                        | Fastest loop for shared UI and product behavior     |
| Web app and extension together            | `bun run dev:web-and-extension`      | Runs the web server and extension watch build       |
| Extension watch build                     | `bun run dev:extension`              | Rebuilds the extension bundle in watch mode         |
| Desktop renderer                          | `bun run dev:desktop`                | Runs the desktop-targeted Vite config               |
| Desktop preview                           | `bun run dev:preview:desktop`        | Builds the desktop renderer and launches Electron   |
| Android web build + sync                  | `bun run dev:android`                | Rebuilds the Android web layer and syncs Capacitor  |
| Android build + sync with packaged models | `bun run dev:android:package:models` | Same as above, but bundles models too               |
| Docs site with embedded assistant         | `bun run docs:dev`                   | Builds both browser packages, then starts VitePress |

### Checks

| Goal                | Command                       |
| ------------------- | ----------------------------- |
| Lint everything     | `bun run lint`                |
| App typecheck       | `bun run typecheck:app`       |
| Electron typecheck  | `bun run typecheck:electron`  |
| Extension typecheck | `bun run typecheck:extension` |
| Tools typecheck     | `bun run typecheck:tools`     |
| Full typecheck      | `bun run typecheck:all`       |

### Production Builds

| Goal                     | Command                            |
| ------------------------ | ---------------------------------- |
| Web app                  | `bun run build`                    |
| Web app and extension    | `bun run build:web-and-extension`  |
| Extension                | `bun run build:extension`          |
| Extension zip            | `bun run build:extension:zip`      |
| Desktop renderer build   | `bun run build:desktop:production` |
| Windows desktop package  | `bun run build:desktop:win`        |
| macOS desktop package    | `bun run build:desktop:mac`        |
| Android production build | `bun run build:android`            |
| Embed and React packages | `bun run build:packages`           |
| Docs site                | `bun run docs:build`               |

`build:desktop:linux` is not currently a complete packaging workflow. Do not use it as a release command until its build and packaging steps are defined.

## Repo Layout

- `src/` is the shared app: chat UI, setup wizard, settings, Babylon scenes, stores, hooks, services, and config.
- `extension/` contains the extension-specific code: manifest, content scripts, background worker, and offscreen documents.
- `electron/` contains the desktop renderer shell, preload, and Electron-facing assets.
- `electron/main/` owns desktop windows, IPC, and local service management. `electron/server/` owns the local AI gateway.
- `android-src/` contains the Android web entrypoints used by the app and wallpaper flows.
- `android/` is the Capacitor and Gradle project used for native Android packaging.
- `embed/` contains the embedded entrypoint used by the docs site and other host pages.
- `packages/embed/` and `packages/react/` expose the browser package APIs. Each owns its Vite config and declaration TypeScript config. These packages are Bun workspaces and are not published on npm yet.
- `documentation/` contains the VitePress docs site and the scripts that sync the embed build into it.
- `public/res/` holds runtime assets such as models, motions, backgrounds, and related media.
- `tools/` holds build utilities and Vite plugins.

The root Vite configs select the web, desktop, Android, and extension targets. Shared React setup, build constants, and aliases live in `tools/vite/shared-config.ts`. Keep target-specific plugins and output settings in their target config.

`electron-builder.shared.json` holds common packaging rules. The Windows and macOS configs extend it and retain their platform resources and exclusions. Changes to packaging filters need review of the resolved configuration and packaged file lists for both platforms.

## How the Runtimes Fit Together

Most product behavior should start in `src/`. The platform folders mostly decide how the shared app is hosted.

- Standalone web app: `src/main.tsx`
- Docs/embed entry: `embed/main.tsx`
- Extension entry: `extension/content/main.tsx`
- Desktop renderer entry: `electron/main.tsx`
- Android app and wallpaper entry: `android-src/main.tsx`

If the feature belongs to the product itself, change the shared code first. Only move into `extension/`, `electron/`, `android-src/`, or `embed/` when the host environment really needs different behavior.

## Where to Start for Common Changes

| If you are changing...                                     | Start here                                                                                     | Usually verify with                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Shared UI, setup, settings, chat flow                      | `src/components/`, `src/stores/`, `src/contexts/`, `src/config/`                               | `bun run dev`                                          |
| Docs embed behavior or docs-only hosting issues            | `embed/`, `packages/embed/`, `packages/embed/vite.config.ts`, `documentation/site/.vitepress/` | `bun run docs:dev`                                     |
| Extension injection, selection tools, shadow-root behavior | `extension/content/`, `extension/background/`                                                  | `bun run dev:extension`                                |
| Desktop runtime integration                                | `electron/`, `electron/main/`                                                                  | `bun run dev:desktop` or `bun run dev:preview:desktop` |
| Android runtime integration                                | `android-src/`, `android/`                                                                     | `bun run dev:android`                                  |
| Build scripts, embed sync, generated repo pages            | `package.json`, `tools/`, `documentation/scripts/`                                             | the matching build or docs command                     |

## Notes for Current Workflows

### Docs and embed

The docs site does not render the shared app directly from source. It loads the generated embed bundle copied into `documentation/site/public/embed`.

- `bun run docs:dev` builds the embed and React packages before starting VitePress. The docs site loads the generated embed bundle from `documentation/site/public/embed`.
- If you change `embed/`, embed asset resolution, or docs-side hosting code, test through the docs flow rather than only through the standalone web app.

### Extension

The extension UI is injected into a shadow root. That keeps host page styles from bleeding into the assistant, but it also means portals, overlays, and DOM queries need to stay shadow-root aware.

- `extension/content/` handles injection and the renderer mount.
- `extension/background/` handles service worker logic and provider-side work.
- `extension/offscreen/` handles audio-related offscreen behavior.

If you touch selection UI, Base UI portals, or toolbar positioning, test on a real website, not just a blank page.

### Desktop and Android

Desktop and Android both reuse the shared app, but the host integration is different.

- Desktop uses Electron plus local helper services.
- Android uses Capacitor and the native Android project under `android/`.

If your change touches platform APIs, check the host entrypoint and the platform-specific service layer before assuming the web behavior carries over unchanged.

## Adding New Features

### New AI or voice provider

At a minimum, you will usually touch these areas:

1. Register the provider and defaults in `src/config/aiConfig.ts`.
2. Add or update the relevant service and proxy layer in `src/services/` and `src/services/proxies/`.
3. Add runtime-specific support where needed in `extension/`, `electron/`, or Android-native code.
4. Expose the provider in settings and, if it matters on first run, the setup wizard.

### New setting

The common path is:

1. Add the default value in the right config file under `src/config/`.
2. Wire it through the config store or hooks if needed.
3. Add UI in the settings panel.
4. Add setup wizard support if it should be part of first-run onboarding.

### Docs updates

If you are changing user-facing behavior, the docs probably need to move with it.

- Product docs live under `documentation/site/`.
- Update the relevant settings page first, then check the setup guide, platform page, and architecture reference. Keep `README.md` focused on capabilities and entry points, and keep this guide focused on contributor workflows.
- The generated repository tree page comes from `bun run docs:generate:tree`. Do not hand-edit the generated inventory page.

## Testing Expectations

You do not need to run every runtime for every change, but you should test the runtime you actually touched.

- Shared UI or store change: test at least the standalone web app. Test an owning runtime too if the change is platform-sensitive.
- Docs/embed change: test with `bun run docs:dev`.
- Extension change: load the unpacked extension and test on a real page.
- Desktop change: run the desktop workflow.
- Android change: rebuild and sync Android.

Before opening a PR, run the checks that match your change. At minimum that usually means the relevant typecheck plus `bun run lint`.

## Debugging

- Web app and docs: use normal browser DevTools.
- Extension content UI: inspect the page and watch the content-script logs.
- Extension service worker: open the extension service worker inspector.
- Extension offscreen document: inspect it from the background side when audio behavior is involved.
- Desktop: use renderer DevTools and Electron logs.
- Android: use browser DevTools for the web layer and Android Studio or logcat for native issues.

The in-app debug panel is also useful for checking animation state, FPS, and general runtime state.

## Pull Requests

Keep PRs as focused as you can.

When you open one, include:

- what changed
- why it changed
- which runtime or runtimes you tested
- screenshots or short clips for UI changes when they help

If your change affects docs, embed hosting, or generated pages, mention that explicitly in the PR description.

## Questions

- Open a [Discussion](https://github.com/b1ink0/vassist/discussions) for design questions or broader ideas.
- Open an [Issue](https://github.com/b1ink0/vassist/issues) for bugs or concrete feature requests.
