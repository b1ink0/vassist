# Repository Map

Use this page when you know the job you need to do and want the shortest path to the right folder.

## If You Are Working On Browser Integration

| Path                                    | Open it for                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/embed/src/`                   | Public plain-JS entry points and re-exports                                                   |
| `packages/react/src/`                   | React wrapper components, props, and React-specific re-exports                                |
| `embed/main.tsx`                        | Low-level embed bootstrapping, custom element registration, and global host API wiring        |
| `src/embed/config.ts`                   | Public config contract, runtime snapshot types, settings target IDs, and config normalization |
| `src/embed/reactHostCustomizations.tsx` | React-only customization hooks and host-scoped registry                                       |
| `src/embed/branding.ts`                 | Label and icon override helpers                                                               |
| `src/embed/settingsPolicy.ts`           | Hide and read-only policy helpers                                                             |
| `src/embed/portalContainers.ts`         | Portal target resolution for popovers and canvas surfaces                                     |
| `src/embed/hostCommands.ts`             | Internal host command event naming and dispatch helpers used by the runtime                   |

## If You Are Working On Shared Product Behavior

| Path                    | Open it for                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `src/components/`       | Chat, settings, setup, toolbar, assistant, and shared UI pieces                                     |
| `src/services/`         | Core business logic for AI, voice, assets, page interaction, and media features                     |
| `src/services/proxies/` | Runtime-aware routing between browser, extension, desktop, Android, and host-bridge execution paths |
| `src/hooks/`            | App hooks, config hooks, bootstrap hooks, and platform helpers                                      |
| `src/stores/`           | Zustand stores and app-level state transitions                                                      |
| `src/config/`           | Default config, prompts, feature defaults, scene presets, and lists                                 |
| `src/utils/`            | Shared runtime utilities, resource loading, platform checks, and DOM helpers                        |
| `src/babylon/`          | Live Assistant scene, animation, camera, and interaction layers                                     |

## If You Are Working On Runtime-Specific Code

| Path           | What lives there                                                                       |
| -------------- | -------------------------------------------------------------------------------------- |
| `extension/`   | Chrome extension manifest, background logic, content scripts, offscreen runtime pieces |
| `electron/`    | Electron main/preload/renderer integration, local services, packaging glue             |
| `android/`     | Native Android project, Gradle setup, wallpaper runtime, Android-local AI services     |
| `android-src/` | Android-facing React entry used by the shared app                                      |

## Root-Level Orientation

| Path             | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `src/`           | Shared application runtime                            |
| `packages/`      | Public browser package boundary                       |
| `embed/`         | Embed runtime bootstrapping layer                     |
| `extension/`     | Browser extension shell                               |
| `electron/`      | Desktop shell                                         |
| `android/`       | Native Android shell                                  |
| `android-src/`   | Android web entry                                     |
| `public/`        | Shared assets bundled with the app                    |
| `tools/`         | Build-time helpers and Vite plugins                   |
| `documentation/` | Product docs, generated docs assets, and docs tooling |

## Docs Map

| Path                                  | Use it for                                    |
| ------------------------------------- | --------------------------------------------- |
| `documentation/site/getting-started/` | Install and setup flow                        |
| `documentation/site/guide/`           | Task-based user guides                        |
| `documentation/site/platforms/`       | Desktop, Android, and extension differences   |
| `documentation/site/settings/`        | Exact settings reference                      |
| `documentation/site/architecture/`    | Technical reference and integration reference |
| `documentation/site/public/assets/`   | Shared screenshots and GIFs used by docs      |

## When The Folder Map Is Not Enough

[Repository Tree and Metrics](/architecture/repository-tree) expands this into the generated file tree and counts. Use this page first, then jump to the tree if you need exact files.
