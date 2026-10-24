# Storage and Data

VAssist stores lightweight config and heavier user assets. The exact storage layer depends on runtime and data type.

## Main data families

| Data family   | Examples                                                       |
| ------------- | -------------------------------------------------------------- |
| Config        | UI, LLM, TTS, STT, and AI feature settings                     |
| Chat history  | Messages, linked attachments, temporary or persistent sessions |
| Visual assets | Models, stages, motions, emotes, backgrounds                   |
| Voice assets  | Saved reference voices and related metadata                    |
| Local models  | Desktop-local and Android-local model files managed by native runtimes |

## Backup-visible categories

The backup system uses the same categories users can selectively export or import from the UI tab:

- config
- settings
- data or presets
- chats
- models
- motions
- emotes
- stages
- voices
- backgrounds
- other files

## Platform-specific storage differences

### Browser and extension style storage

Shared web-facing flows lean on browser-friendly storage patterns for config and app data.

### Desktop local storage

Desktop local model and runtime assets live in desktop-managed locations rather than only in browser storage. This is necessary because local inference backends and voice tooling need filesystem access.

Desktop includes bundled full-resolution wallpapers in Electron resources. User-selected images stay at their original paths, and folders remain folder paths in UI configuration. The renderer reads external image data through Electron IPC without copying files into app storage. Backups can preserve those settings, but do not include the external image files. The paths must remain accessible on the destination machine.

### Android local storage

Android local models and related assets are managed through the Android runtime and do not automatically mirror desktop-local storage.

Android includes lightweight bundled wallpaper files with the app. Custom backgrounds are imported image blobs in the app's background asset category. The active custom image is stored with those assets, while selected built-in IDs, slideshow enablement, parallax, and timing live in UI configuration. Include both config and backgrounds when transferring custom background setup in a backup.

## Why backup matters

Backups move the configuration, history, and app-stored assets included in the selected categories. They do not archive local LLM model folders or installed desktop runtimes managed outside app storage. Install or download those native runtime assets separately on another device.
