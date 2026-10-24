# UI Settings

Settings → UI controls the shell around the assistant: themes, toolbar behavior, shortcuts, backups, and developer tools.

The UI tab has **Display**, **Chat**, and **Tools** sub-tabs on every platform. Desktop also has a **Mode** sub-tab when desktop mode controls are available. The headings on this page follow those sub-tabs. Platform-specific controls appear within the shared sub-tabs where supported.

## Display sub-tab

### General actions

These two buttons are at the top of the Display sub-tab.

| Control                  | Behavior                                               |
| ------------------------ | ------------------------------------------------------ |
| View Documentation       | Opens the docs in a new tab or external browser.       |
| Start Setup Wizard Again | Resets onboarding state and relaunches the setup flow. |

### Extension-only

**Auto-load on Every Page** controls whether VAssist activates automatically when you open a tab. When it's on (the default), the assistant appears on every page without you having to do anything. Turn it off if you want to decide manually which pages get the assistant. Click the extension icon yourself to activate it on that tab.

| Control                 | Default | Behavior                                                                                              |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| Auto-load on Every Page | On      | When on, VAssist injects automatically. When off, you click the extension icon manually on each page. |

### Appearance

**Changing the theme:** Set **Application Theme** to `Light` or `Dark` for a fixed appearance. `Adaptive` is the default: it samples the page background and picks higher-contrast colors so the assistant stays readable on any website. Adaptive only affects the assistant panel, not the surrounding page.

On desktop, the selected theme is also applied to the separate input window.

Attached App and Wallpaper controls use the same shared glass appearance as Android and the web. Floating and detached desktop controls use stronger surfaces in Light mode because those transparent windows cannot blur the desktop behind them. Adaptive chooses Light or Dark automatically using background detection.

**Repositioning the chat window:** **Chat Window Position** sets where the panel sits when the 3D avatar is off. Pick any preset to snap to a corner. Set it to `Last Location` and wherever you drag the panel is remembered across reloads, useful if you always want it in a specific spot on a specific page.

**Colored icons:** Turn on **Use Colored Icons** to switch from the default monochrome icons to color versions throughout the UI. If you only want that on the AI toolbar and not everywhere, also enable **Toolbar Only**.

| Control              | Default                                                           | Behavior                                                                                                                         |
| -------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Use Colored Icons    | Off                                                               | Switches icons from monochrome to color.                                                                                         |
| Toolbar Only         | Off                                                               | Only when Colored Icons is on. Restricts colorization to the AI toolbar.                                                         |
| Chat Window Position | `bottom-right` (web/extension), `bottom-center` (desktop/Android) | Only when the avatar is off and the runtime allows placement. Includes `Last Location` to restore the previous dragged position. |
| Application Theme    | Adaptive                                                          | `Adaptive`, `Light`, or `Dark`.                                                                                                  |
| Detection Accuracy   | `5`                                                               | Only when Theme is Adaptive. Grid size for background sampling, 3–10. Higher = more sample points.                               |

::: info
Adaptive theme only affects the assistant UI layer, not the website or native host around it.
:::

### Android backgrounds

The **Stages** toggle above the background controls opens the same stage picker and options available in **3D > Models > Stages**. Choose a preview to select a stage. Stage options include brightness, time or mood, seasons, animation, parallax, shadows, and avatar alignment where supported. Turn Stages off to return to your saved background. Stage controls are dimmed when the avatar is off.

The setup wizard also offers these controls when the avatar is enabled. Stages render in the Android app and live wallpaper, and in desktop App and Wallpaper modes. Desktop Floating mode keeps its transparent background.

During Android AR, the camera view temporarily hides the configured background and stage, and pauses the background slideshow. Leaving AR restores the saved background and stage.

Manages built-in and custom wallpapers behind the Live Assistant on Android. Blue Milky Way is selected and enabled by default. Choose **Images**, **Solid color**, or **Gradient** as the background type.

The bundled image sources and licensing details are listed in [Wallpaper credits](/legal/wallpapers).

Open **Settings > UI > Display** in the full Android app. Select the built-in wallpapers to use. The first selected wallpaper appears first. Imported images are stored in VAssist, with a 10 MB limit per image. **Background slideshow** is off by default. When enabled, selected built-in wallpapers and uploaded images fade in sequence, starting from the active image when one is selected. The default time per image is 30 seconds and the fade duration is 2 seconds.

**Background brightness** starts at 60% to keep wallpapers from overpowering the interface. Adjust it from 20% to 100% to dim or brighten the images.

The same background controls are available in the setup wizard and Settings. Open **More image effects** for presets, then tune contrast, saturation, blur, grayscale, sepia, or hue. These effects apply to bundled and custom backgrounds.

**To add backgrounds:**

1. Choose which bundled wallpapers to include, or use **Show background** to hide the background.
2. Tap the upload button and pick a JPEG, PNG, WebP, or GIF file. Uploads remain on this device.
3. Tap an uploaded image to make it the active image. With at least two selected or uploaded images, enable **Background slideshow** to fade through them in the Android app and live wallpaper. Set the time per image and fade duration below the toggle.

**Background parallax** is on by default. It gently follows phone tilt and rotation with a subtle slow drift. The sensor offset eases toward center when the phone settles. When a 3D stage is active, the wallpaper slideshow pauses on its current image and parallax moves the stage environment instead. Turn parallax off to keep the image and stage still. System reduced-motion preferences disable the effect.

**To switch or remove the active background:** Tap a different image to switch, or use **Clear Background** to remove it without deleting the file. To delete a background from storage entirely, tap the delete icon on that item.

| Control                   | Behavior                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Background type           | Show images, a solid color, or a customizable gradient.                                |
| Background color          | Choose a solid background color with the native color picker.                          |
| Gradient preset           | Start with Midnight, Ocean, Aurora, Sunset, or Forest, then customize it.              |
| Gradient colors and angle | Set both gradient colors and its direction.                                            |
| Show background           | Show or hide the selected image in the app and live wallpaper.                         |
| Background brightness     | Set image brightness from 20% to 100%. Defaults to 60%.                                |
| More image effects        | Apply a preset or adjust contrast, saturation, blur, grayscale, sepia, and hue.        |
| Built-in wallpaper        | Choose which bundled wallpapers to use.                                                |
| Custom background upload  | Import JPEG, PNG, WebP, or GIF.                                                        |
| Activate background       | Choose the starting uploaded image when slideshow is enabled, or the only image shown. |
| Background slideshow      | Fade through selected built-in wallpapers and uploaded images.                         |
| Time per image            | Choose how long each image is shown before the next fade.                              |
| Fade duration             | Choose how long the transition between images takes.                                   |
| Clear Background          | Stop the slideshow and clear the active background without deleting saved images.      |
| Delete background asset   | Permanently delete a stored asset.                                                     |

### Desktop backgrounds

In **Settings > UI > Display**, choose **Images**, **Solid color**, or **Gradient**. Images are selected from the bundled wallpapers, image files, or a folder. Blue Milky Way is selected and enabled by default. Desktop packages full-resolution built-in files with the app. For your own files, Desktop stores their paths and reads the images from their original locations. It does not copy them into VAssist storage. Supported formats are JPEG, PNG, WebP, and GIF. Images larger than 50 MB are skipped.

The bundled backgrounds are shared by Android and desktop. Blue Milky Way is the default selection.

### Built-in backgrounds

<div class="doc-figure-grid">
  <figure class="doc-figure">
    <img src="/assets/backgrounds/milky-way.webp" alt="Blue Milky Way wallpaper showing a colorful night sky" loading="lazy" />
    <figcaption>Blue Milky Way, selected by default</figcaption>
  </figure>
  <figure class="doc-figure">
    <img src="/assets/backgrounds/night-fence.webp" alt="Dark night sky above a fence" loading="lazy" />
    <figcaption>Dark stars and fence</figcaption>
  </figure>
  <figure class="doc-figure">
    <img src="/assets/backgrounds/aurora-homes.webp" alt="Northern lights above a mountain village" loading="lazy" />
    <figcaption>Aurora and houses</figcaption>
  </figure>
  <figure class="doc-figure">
    <img src="/assets/backgrounds/fog-cabin.webp" alt="A cabin in a foggy woodland at night" loading="lazy" />
    <figcaption>Woodland cabin</figcaption>
  </figure>
  <figure class="doc-figure">
    <img src="/assets/backgrounds/city-night.webp" alt="City at night with light trails" loading="lazy" />
    <figcaption>City after dark</figcaption>
  </figure>
  <figure class="doc-figure">
    <img src="/assets/backgrounds/soft-lights.webp" alt="Abstract soft colored bokeh lights" loading="lazy" />
    <figcaption>Soft coloured lights</figcaption>
  </figure>
</div>

See [Wallpaper credits](/legal/wallpapers) for image sources and licensing.

The background appears in **App** and **Wallpaper** modes. **Floating** mode remains clear so the avatar window stays transparent. When multiple images are selected, VAssist fades between them by default. The first selected built-in image appears first. You can turn the slideshow off and set **Time per image** and **Fade duration**. The default interval is 30 seconds and the default fade duration is 2 seconds.

**Background brightness** starts at 60% and can be adjusted from 20% to 100% to dim or brighten the images.

The setup wizard and Settings use the same background controls. Open **More image effects** for presets, then tune contrast, saturation, blur, grayscale, sepia, or hue. These effects apply to bundled and custom backgrounds.

For a non-image background, choose **Solid color** and select a color, or choose **Gradient**. Gradient presets include Midnight, Ocean, Aurora, Sunset, and Forest. Set the start and end colors and adjust the angle to customize the gradient.

**Background parallax** is on by default. In App mode and interactive Wallpaper mode, the background follows mouse movement. Non-interactive Wallpaper mode does not track the mouse. When a 3D stage is active, the slideshow pauses on its current image and parallax moves the stage environment instead. Turn off **Background parallax** to keep the image and stage still. System reduced-motion preferences disable the effect.

If an image is moved, deleted, or cannot be read, VAssist skips it. Use **Refresh** to scan a selected folder again after its contents change. Clearing the selection removes the saved paths from VAssist settings but does not delete the source images.

The selected image list shows filenames and an image count. **Show desktop background** turns rendering off without clearing that selection. Both platforms accept a time per image from 5 to 3600 seconds and a fade duration from 0 to 15 seconds. The fade begins after the time per image has elapsed. Unreadable images are skipped while the current valid image stays visible.

## Chat sub-tab

**Smooth Response Animation** animates the chat window height as responses stream in. It can affect performance on lower-end devices, so turn it off if the chat feels sluggish.

| Control                   | Default | Behavior                                                                                      |
| ------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| Smooth Response Animation | Off     | Animates the container height while responses stream. Can cost performance on slower devices. |
| Show Emote Duration Bar   | On      | Shows a playback progress bar while an emote plays.                                           |
| Show Emote Time Labels    | On      | Only when Duration Bar is on. Adds current and total time labels above the bar.               |
| Emote Button Progress     | `none`  | Choose bottom bar, emote button ring, or both.                                                |

## Mode sub-tab (desktop only)

Choose how the desktop app is displayed. The same controls are available in **Quick Access > Mode**.

| Control  | Default  | Behavior                                                                                                                                                                                                               |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode     | App      | **App** uses the standard resizable window. **Floating** shows a compact, transparent, always-on-top avatar window. **Wallpaper** places the Live Assistant behind the desktop icons and is supported on Windows only. |
| Controls | Attached | In Floating or Wallpaper mode, choose whether the avatar and chat controls stay together or use separate windows. This setting does not change App mode.                                                               |
| Interact | Off      | Shown only in Wallpaper mode. When off, the wallpaper is click-through. Turn it on to interact with the wallpaper.                                                                                                     |

This sub-tab appears only when the desktop mode API is available.

## Tools sub-tab

### AI Toolbar

The AI Toolbar is the floating popup that appears when you select text on a page. It offers translate, summarize, rewrite, and other one-click AI actions. It also appears near input fields and images depending on the toggles here.

- Turn off **Enable AI Toolbar** entirely if you don't want the popup at all.
- **Show on Input Focus** shows dictation helpers when you click into a text field. Turn it off if the toolbar appearing on every input field is distracting.
- **Show on Image Hover** shows image-analysis affordances when you hover an image. Turn it off if you rarely use image actions.

What actions the toolbar offers is mostly controlled by the AI+ settings tab. In embedded hosts, the host can also force built-in toolbar visibility and ordering through the embed config.

| Control             | Default | Behavior                                                                      |
| ------------------- | ------- | ----------------------------------------------------------------------------- |
| Enable AI Toolbar   | On      | The floating in-page toolbar for selected text and quick actions.             |
| Show on Input Focus | On      | Only when toolbar is on. Shows dictation helpers when you focus a text field. |
| Show on Image Hover | On      | Only when toolbar is on. Shows image analysis affordances on hover.           |

### Keyboard shortcuts

The controls are in **UI → Tools**. They are hidden on Android. On desktop, browser, and extension, configure the available shortcuts in this section.

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

### Backup and restore

Backups contain selected VAssist configuration, chat history, and app-stored assets in a ZIP file. They do not include local LLM model folders or installed desktop runtimes managed outside app storage. Download or install those separately on the destination device.

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

### Developer tools

Turning on **Enable Developer Tools** reveals a draggable debug panel. Only useful if you're testing animation playback, scene diagnostics, or positioning behavior. Leave it off otherwise.

| Control                         | Default | Behavior                                                                                   |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| Enable Developer Tools          | Off     | Reveals a draggable debug panel for testing animation, positioning, and scene diagnostics. |
| Enable Native Electron DevTools | Off     | Desktop only. Opens the native Electron DevTools for all desktop windows.                  |
