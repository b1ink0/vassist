# Desktop

Desktop is the most complete local VAssist runtime: local GGUF models, local speech, camera and screen share, tray access, and direct control over runtime files and model downloads.

## What desktop is best at

- running local LLMs through the built-in desktop runtime
- running local GPT-SoVITS speech and local Whisper transcription
- combining chat with microphone, camera, and screen share
- staying available from the tray even when the main window is hidden

## What feels different on desktop

| Desktop feature | Why it matters |
| --- | --- |
| Main floating window | Keeps the assistant visible as a standalone app instead of attaching it to one browser tab. |
| Separate input window | Lets desktop use a lighter always-available input window while still feeding the same main chat. |
| Tray controls | You can hide VAssist without quitting it, then bring it back instantly from the tray. |
| Screen picker | Desktop can choose between full displays and individual app windows for screen share. |
| Local service managers | Desktop can install and manage local AI runtimes that do not exist in the same form on the extension build. |

## Local AI on desktop

- Desktop Local LLM uses [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) on top of [llama.cpp](https://github.com/ggerganov/llama.cpp).
- Local desktop models are managed as GGUF files. Vision-capable models can also require a matching mmproj file.
- Desktop Local TTS uses [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) and saved reference voices.
- Desktop Local STT uses Faster Whisper through the local desktop service.
- Desktop can optionally share its local AI server on the network so other devices can use it.

[AI and Media Stack](/architecture/ai-and-media-stack) covers the engines and file formats behind those options in more detail.

## Desktop capture

- You can select microphones instead of relying on the system default.
- Camera input can stay visible in a floating preview while you continue chatting.
- Screen share opens a picker for full displays or individual windows.
- Camera and screen sessions are cleaned up when voice mode ends so they do not stay open by accident.

## Desktop fits best when

- A strong local setup matters more than browser integration.
- Screen share, camera, local GGUF models, or GPT-SoVITS voice cloning are part of normal use.
- The app should stay available from the tray instead of living in one browser tab.

## Related pages

<div class="doc-link-list">
	<a href="/getting-started/installation">Open installation guide</a>
	<a href="/guide/camera-and-screen-share">Open camera and screen share guide</a>
	<a href="/architecture/ai-and-media-stack">Open AI and media stack reference</a>
</div>