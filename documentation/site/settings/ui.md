# UI Settings

Settings → UI controls the shell around the assistant: themes, toolbar behavior, shortcuts, backups, and developer tools.

## General actions

These two buttons are always visible at the top of the UI tab regardless of any other setting.

| Control                  | Behavior                                               |
| ------------------------ | ------------------------------------------------------ |
| View Documentation       | Opens the docs in a new tab or external browser.       |
| Start Setup Wizard Again | Resets onboarding state and relaunches the setup flow. |

## Extension-only

**Auto-load on Every Page** controls whether VAssist activates automatically when you open a tab. When it's on (the default), the assistant appears on every page without you having to do anything. Turn it off if you want to decide manually which pages get the assistant. Click the extension icon yourself to activate it on that tab.

| Control                 | Default | Behavior                                                                                              |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| Auto-load on Every Page | On      | When on, VAssist injects automatically. When off, you click the extension icon manually on each page. |

## Appearance and chat shell

**Changing the theme:** Set **Application Theme** to `Light` or `Dark` for a fixed appearance. `Adaptive` is the default: it samples the page background and picks higher-contrast colors so the assistant stays readable on any website. Adaptive only affects the assistant panel, not the surrounding page.

**Repositioning the chat window:** **Chat Window Position** sets where the panel sits when the 3D avatar is off. Pick any preset to snap to a corner. Set it to `Last Location` and wherever you drag the panel is remembered across reloads, useful if you always want it in a specific spot on a specific page.

**Colored icons:** Turn on **Use Colored Icons** to switch from the default monochrome icons to color versions throughout the UI. If you only want that on the AI toolbar and not everywhere, also enable **Toolbar Only**.

**Performance:** **Smooth Response Animation** animates the chat window height as responses stream in. It looks polished but can cause jitter on slower devices. Leave it off if anything feels sluggish.

| Control                   | Default                                                           | Behavior                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Use Colored Icons         | Off                                                               | Switches icons from monochrome to color.                                                                                         |
| Toolbar Only              | Off                                                               | Only when Colored Icons is on. Restricts colorization to the AI toolbar.                                                         |
| Chat Window Position      | `bottom-right` (web/extension), `bottom-center` (desktop/Android) | Only when the avatar is off and the runtime allows placement. Includes `Last Location` to restore the previous dragged position. |
| Smooth Response Animation | Off                                                               | Animates the container height while responses stream. Can cost performance on slower devices.                                    |
| Show Emote Duration Bar   | On                                                                | Shows a playback progress bar while an emote plays.                                                                              |
| Show Emote Time Labels    | On                                                                | Only when Duration Bar is on. Adds current time and total duration labels above the bar.                                         |
| Application Theme         | Adaptive                                                          | `Adaptive`, `Light`, or `Dark`.                                                                                                  |
| Detection Accuracy        | `5`                                                               | Only when Theme is Adaptive. Grid size for background sampling, 3–10. Higher = more sample points.                               |

::: info
Adaptive theme only affects the assistant UI layer, not the website or native host around it.
:::

## Android backgrounds

Manages wallpaper assets behind the Live Assistant on Android.

**To add a background:**

1. Tap the upload button and pick a JPEG, PNG, WebP, or GIF file.
2. Once uploaded it appears in the list. Tap it to set it as the active background.

**To switch or remove the active background:** Tap a different image to switch, or use **Clear active background** to remove it without deleting the file. To delete a background from storage entirely, tap **Delete background asset** on that item.

| Control                  | Behavior                                                   |
| ------------------------ | ---------------------------------------------------------- |
| Custom background upload | Import JPEG, PNG, WebP, or GIF.                            |
| Activate background      | Set one uploaded image as the active background.           |
| Clear active background  | Remove the active background without deleting the library. |
| Delete background asset  | Permanently delete a stored asset.                         |

## AI Toolbar

The AI Toolbar is the floating popup that appears when you select text on a page. It offers translate, summarize, rewrite, and other one-click AI actions. It also appears near input fields and images depending on the toggles here.

- Turn off **Enable AI Toolbar** entirely if you don't want the popup at all.
- **Show on Input Focus** shows dictation helpers when you click into a text field. Turn it off if the toolbar appearing on every input field is distracting.
- **Show on Image Hover** shows image-analysis affordances when you hover an image. Turn it off if you rarely use image actions.

What actions the toolbar offers is controlled by the AI+ settings tab, not here.

| Control             | Default | Behavior                                                                      |
| ------------------- | ------- | ----------------------------------------------------------------------------- |
| Enable AI Toolbar   | On      | The floating in-page toolbar for selected text and quick actions.             |
| Show on Input Focus | On      | Only when toolbar is on. Shows dictation helpers when you focus a text field. |
| Show on Image Hover | On      | Only when toolbar is on. Shows image analysis affordances on hover.           |

## Keyboard shortcuts

Hidden on Android. On desktop and web, you can assign global hotkeys for three actions.

**To set a shortcut:**

1. Make sure **Enabled** is toggled on. If the master switch is off, no shortcuts will fire even if fields are filled in.
2. Click inside the field for the action you want (Open Chat, Toggle Mode, or Toggle Visibility).
3. Press the key combination you want (e.g., `Ctrl+Shift+A`). The field captures your next keypress immediately.
4. The shortcut saves automatically.

**To clear a shortcut:** Click the field and press Backspace. An empty field means no shortcut for that action.

| Shortcut          | Default | Behavior                             |
| ----------------- | ------- | ------------------------------------ |
| Enabled           | Off     | Master switch for shortcut handling. |
| Open Chat         | Empty   | Opens the chat view.                 |
| Toggle Mode       | Empty   | Switches between interaction modes.  |
| Toggle Visibility | Empty   | Hides or shows the assistant UI.     |

## Backup and restore

Backups cover everything: settings, chat history, custom models, motions, emotes, voices, and more, all in a single ZIP file.

**To export a backup:**

1. Click **Export**. The app builds the ZIP and downloads it with a timestamped filename automatically.
2. If you only want specific categories (e.g., just chat history and voices), turn on **Selective Export/Import** first, check which categories to include, then click Export.

**To restore on a new machine:**

1. If your backup was a full export, click **Import** and pick the ZIP file. It imports everything and reloads the app.
2. If you want to import only certain categories from the backup, turn on **Selective Export/Import** first, then Import. You can pick which sections to bring in.
3. The app reloads automatically when the import finishes.

**Status** shows what's happening during export/import and displays any errors.

| Control                 | Default          | Behavior                                                                                                       |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Selective Export/Import | Off              | When on, you choose which data categories are included. When off, export and import always include everything. |
| Export                  | -                | Builds a ZIP archive and downloads it with a timestamped filename.                                             |
| Import                  | -                | Opens a ZIP picker, imports the backup, then reloads the app.                                                  |
| Status                  | Empty until used | Shows progress or error messages during export/import.                                                         |

### Backup categories

| Category       | What's included                     |
| -------------- | ----------------------------------- |
| Config         | UI, AI, TTS, STT configuration keys |
| Settings       | General app settings namespace      |
| Data / Presets | Generic app records and preset data |
| Chat History   | Conversations and media references  |
| Models         | Avatar model files                  |
| Motions        | Custom motion files                 |
| Emotes         | Audio-motion emote bundles          |
| Stages         | Stage model files                   |
| Voices         | GPT-SoVITS reference voices         |
| Backgrounds    | Custom background assets            |
| Other Files    | Remaining file-backed records       |

## Developer tools

Turning on **Enable Developer Tools** reveals a draggable debug panel. Only useful if you're testing animation playback, scene diagnostics, or positioning behavior. Leave it off otherwise.

| Control                | Default | Behavior                                                                                   |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------ |
| Enable Developer Tools | Off     | Reveals a draggable debug panel for testing animation, positioning, and scene diagnostics. |
