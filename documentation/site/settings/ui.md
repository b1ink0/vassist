# UI Settings

The UI tab controls the shell around the assistant rather than the AI providers themselves. It is where users reset onboarding, change visual behavior, control the toolbar, manage backups, and enable debugging helpers.

## Always-visible actions

| Control | Visibility | Behavior |
| --- | --- | --- |
| View Documentation | All runtimes | Opens the published documentation site in a new tab or external browser. |
| Start Setup Wizard Again | All runtimes | Clears setup completion state, re-runs onboarding, and reloads the app afterward. |

## Extension-only behavior

| Control | Default | Visibility | Behavior |
| --- | --- | --- | --- |
| Auto-load on Every Page | On | Extension runtime only | Automatically injects VAssist on every supported page. When off, the user must click the extension entry point manually on each page. |

## Interface appearance and chat shell

| Control | Default | Visibility | Behavior |
| --- | --- | --- | --- |
| Use Colored Icons | Off | All runtimes | Switches icons from monochrome gray to color. |
| Toolbar Only | Off | Only when Use Colored Icons is on | Limits icon colorization to the AI toolbar instead of coloring icons everywhere. |
| Chat Window Position | `bottom-right` on shared web or extension runtimes, `bottom-center` on desktop and Android | Only when the avatar is disabled and the runtime allows manual placement | Chooses a preset placement for the chat-first shell. Includes `Last Location` so the previous dragged position is restored. |
| Smooth Response Animation | Off | All runtimes | Animates container height while streaming assistant output. The UI warns that this can cost performance on lower-end devices. |
| Show Emote Duration Bar | On | All runtimes | Shows the playback progress bar while an emote is active. |
| Show Emote Time Labels | On | Only when Show Emote Duration Bar is on | Adds current time and total duration labels above the emote progress bar. |
| Application Theme | Adaptive | All runtimes | Sets the assistant shell theme. User-facing choices are Adaptive, Light, and Dark. |
| Detection Accuracy | `5` | Only when Application Theme is set to Adaptive | Changes the background sampling grid size from `3` to `10`. Higher values read more sample points from the page background for theme detection. |

### Adaptive theme behavior

Adaptive mode samples the current page background and swaps the assistant shell toward a higher-contrast presentation automatically. The setting only affects the assistant UI layer, not the website or native host around it.

## Android-only background controls

Android adds a background management block that is not shown on desktop or extension builds.

| Control group | Behavior |
| --- | --- |
| Custom background upload | Imports image assets such as JPEG, PNG, WebP, or GIF backgrounds. |
| Activate background | Marks one uploaded background as the active Android background. |
| Clear active background | Removes the current custom background without deleting the saved asset library. |
| Delete background asset | Permanently removes stored background files from Android storage. |

## AI Toolbar

| Control | Default | Visibility | Behavior |
| --- | --- | --- | --- |
| Enable AI Toolbar | On | All runtimes | Enables the floating in-page toolbar for selected text and related quick actions. |
| Show on Input Focus | On | Only when Enable AI Toolbar is on | Shows the toolbar and dictation helpers when the user focuses an editable text field. |
| Show on Image Hover | On | Only when Enable AI Toolbar is on | Shows image analysis affordances when hovering supported images. |

## Keyboard shortcuts

Keyboard shortcuts are hidden on Android. On other runtimes, the editor exposes these fields as one bundle:

| Shortcut field | Default | Behavior |
| --- | --- | --- |
| Enabled | Off | Master switch for shortcut handling. |
| Open Chat | Empty | Opens the assistant chat view. |
| Toggle Mode | Empty | Switches between supported interaction modes. |
| Toggle Visibility | Empty | Hides or reveals the assistant UI. |

## Backup and restore

The UI tab owns export and import because backups span almost every user-facing storage area in the app.

| Control | Default | Behavior |
| --- | --- | --- |
| Selective Export/Import | Off | When off, export and import always include everything. When on, the user chooses which data domains are included. |
| Export | N/A | Builds a ZIP archive and downloads it with a timestamped filename. |
| Import | N/A | Opens a ZIP picker, imports a VAssist backup, then reloads the app after success. |
| Status text | Empty until used | Shows progress such as preparing backup, importing backup, success, or validation failure. |

### Selective backup categories

| Category | Included data |
| --- | --- |
| Config | UI, AI, TTS, and STT configuration keys |
| Settings | General app settings namespace |
| Data / Presets | Generic app records and preset-like data |
| Chat History | Conversations and attached media references |
| Models | Avatar model files |
| Motions | Custom motion files |
| Emotes | Audio-motion emote bundles |
| Stages | Stage model files |
| Voices | Saved GPT-SoVITS reference voices |
| Backgrounds | Custom background assets |
| Other Files | Remaining file-backed records not covered above |

## Developer tools

| Control | Default | Behavior |
| --- | --- | --- |
| Enable Developer Tools | Off | Shows the draggable debug panel used for testing animation behavior, positioning, and scene diagnostics. |