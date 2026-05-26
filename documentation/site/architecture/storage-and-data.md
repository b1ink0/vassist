# Storage and Data

VAssist stores both lightweight configuration and heavier user assets. The exact storage layer depends on the runtime and the type of data being saved.

## Main data families

| Data family | Examples |
| --- | --- |
| Config | UI, LLM, TTS, STT, and AI feature settings |
| Chat history | Messages, linked attachments, temporary or persistent sessions |
| Visual assets | Models, stages, motions, emotes, backgrounds |
| Voice assets | Saved reference voices and related metadata |
| Local models | Desktop-local and Android-local model files |

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

### Android local storage

Android local models and related assets are managed through the Android runtime and do not automatically mirror desktop-local storage.

## Why backup matters

Because VAssist mixes configuration, media, and model-related assets, backup and restore is not just convenience. It is the only built-in way to move a complete personalized setup without manually re-importing every model, motion, emote, voice, or background.