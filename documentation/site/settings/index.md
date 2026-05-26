# Settings Reference

The Settings reference follows the same tab order and conditional behavior used in the app. It is a feature-first lookup for the exact tab, toggle, picker, or provider section.

<div class="media-placeholder">
	<strong>Screenshot placeholder</strong>
	<span>Settings screen with the main tabs visible.</span>
</div>

## Common settings behavior

- Settings are auto-saved as you change them.
- Provider-specific sections only appear after you pick the matching provider.
- Some controls only exist on one platform, such as extension-only auto-load, Android background management, desktop model folders, or Chrome AI status messages.
- Defaults listed here match the current app defaults.

## Tab map

| Tab | Main controls |
| --- | --- |
| UI | Documentation link, setup reset, theme behavior, toolbar toggles, chat placement, shortcuts, backup/export/import, Android backgrounds, and debug tools |
| 3D | Avatar visibility, portrait framing, scene performance, PMX model and stage management, motion routing, and emote asset management |
| LLM | Main provider selection, saved backends, desktop local runtime hosting, routing, local model management, and system prompt profiles |
| TTS | Global speech toggle, provider-specific speech controls, GPT-SoVITS voice libraries, Kokoro local setup, and speech test tools |
| STT | Global transcription toggle, provider-specific speech input controls, desktop Whisper setup, Chrome AI speech status, microphone selection, and recording tests |
| AI+ | Feature gates for translation, language detection, summarization, rewriting, writing, plus test actions and Chrome AI feature flag guidance |

## Cross-tab behavior

| Pattern | Behavior |
| --- | --- |
| Master enable toggle | Tabs like TTS and STT hide almost all provider controls until the master toggle is on. |
| Conditional nested controls | Examples: emote time labels only show when the duration bar is enabled, portrait clipping only shows in portrait mode, and routing model pickers only show when "Use main LLM" is off. |
| Saved backend profiles | LLM, TTS, and STT can all store reusable connection presets so the user does not have to re-enter endpoint, key, model, or backend settings each time. |
| Platform-specific tooling | Desktop local providers expose runtime installation and local file management. Android local providers expose built-in model downloaders. Chrome AI providers expose status and required flag guidance. |