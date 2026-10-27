# Desktop

Desktop is the most capable VAssist runtime. You get local GGUF models, local GPT-SoVITS or Supertonic 3 speech, local Whisper transcription, camera and screen share, tray access, and direct control over runtime files.

## What's different on desktop

| Desktop feature        | Why it matters                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| App window             | Keeps the assistant visible as a standalone app instead of attaching it to one browser tab.                 |
| Separate input window  | Lets desktop use a lighter always-available input window while still feeding the same main chat.            |
| Tray controls          | You can hide VAssist without quitting it, then bring it back instantly from the tray.                       |
| Screen picker          | Desktop can choose between full displays and individual app windows for screen share.                       |
| Local service managers | Desktop can install and manage local AI runtimes that do not exist in the same form on the extension build. |

## Desktop modes

Open **Settings > UI > Mode** or **Quick Access > Mode** to switch between three desktop presentations:

| Mode      | Behavior                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| App       | The standard resizable VAssist window with an opaque background. This is the default mode.                                 |
| Floating  | A compact, transparent, always-on-top avatar window.                                                                       |
| Wallpaper | Places the Live Assistant behind desktop icons on Windows. Wallpaper mode is Windows-only and is click-through by default. |

In Floating and Wallpaper modes, turn on **Separate chat window** to show chat and input apart from the avatar. With it off, they stay together. **Interact** makes Wallpaper mode respond to pointer input. With it off, clicks pass through to the desktop. These controls are also available from Quick Access. See [UI Settings > Mode](/settings/ui#mode-sub-tab-desktop-only) for the control details.

In App and attached Wallpaper modes, open saved conversations with the sidebar button at the top left. In Floating mode, the chat controls menu beside the chat button contains history, new chat, temporary chat, and settings. With a separate chat window, those controls are also available beside the avatar.

To resize floating chat, drag the small grip at the lower right of the chat area. In a detached chat window, drag the grip at the window's lower-right corner. The avatar zoom controls remain separate from the chat size.

The setup wizard starts with Blue Milky Way selected. In **Settings > UI > Display**, choose bundled wallpapers, add image files or a folder, use a solid color, or customize a gradient. App and Wallpaper modes show the selected background and crossfade between multiple images when image mode is active. Floating mode stays clear. Your own files remain at their original paths. See [UI Settings](/settings/ui#desktop-backgrounds) for slideshow, image effects, color controls, and missing-file behavior, and [Wallpaper credits](/legal/wallpapers) for bundled image sources.

## Local AI on desktop

- Desktop Local LLM defaults to [`llama-server`](https://github.com/ggml-org/llama.cpp/tree/master/tools/server) and also offers [`node-llama-cpp`](https://github.com/withcatai/node-llama-cpp). Choose its runtime pack or the node-llama-cpp compute backend in Settings → LLM.
- Local desktop models are managed as GGUF files. Vision-capable models can also require a matching mmproj file.
- Desktop Local TTS offers GPT-SoVITS with saved reference voices or Supertonic 3 with built-in voices, language, and quality controls. Each engine has its own setup flow.
- Desktop Local STT offers faster-whisper or [whisper.cpp](https://github.com/ggml-org/whisper.cpp) through the local desktop service. The whisper.cpp runtime packs include Windows CPU, CUDA, and Vulkan builds, plus Linux x64 CPU.
- Desktop can optionally share its local AI server on the network so other devices can use it.

[AI and Media Stack](/architecture/ai-and-media-stack) covers the engines and file formats behind those options in more detail.

## Desktop capture

- You can select microphones instead of relying on the system default.
- Camera input can stay visible in a floating preview while you continue chatting.
- Screen share opens a picker for full displays or individual windows.
- Camera and screen sessions are cleaned up when voice mode ends so they do not stay open by accident.

## Related pages

<div class="doc-link-list">
	<a href="/getting-started/installation">Installation guide →</a>
	<a href="/guide/camera-and-screen-share">Camera and screen share →</a>
	<a href="/architecture/ai-and-media-stack">AI and media stack →</a>
</div>
