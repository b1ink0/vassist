<div align="center">
  <img src="public/VA.svg" alt="VAssist Logo" width="64" />
  <h1>VAssist</h1>
  <p>Cross-platform AI assistant available as a Browser Extension, Desktop App, and Android App, with in-page tools, full chat, voice interaction, and a customizable virtual companion.</p>
</div>

<div align="center">

[Try Demo](https://vassist-demo.vercel.app) • [Documentation](https://b1ink0.github.io/vassist/docs/intro) • [Installation](#installation)

</div>

## Overview

<div align="center">
  <img src="./assets/overview.gif" alt="VAssist Overview" width="540" height="360" />
</div>

VAssist is built around three core surfaces:

- **Chat Interface** - Full conversation workspace with streaming, attachments, voice mode, and history branching
- **Virtual Companion** - Animated assistant with responsive states and interaction feedback
- **AI Toolbar** - Appears on selection/focus and runs rewrite, summarize, translate, writer, dictation, and image tools

The experience is provider-configurable from setup/settings, so chat/voice/tools can run with different LLM, STT, and TTS backends.

[View full documentation →](https://b1ink0.github.io/vassist/docs/intro)

## Features

VAssist combines three workflows in one interface:

- In-page tools for rewrite, summarize, translate, writing, dictation, and image actions
- Full chat with streaming, attachments, page context, and history branching
- A customizable 3D companion with PMX models, stages, VMD motions, and emotes
- Android live wallpaper mode for running the companion avatar on the home screen

### Chat Interface

<div align="center">
  <img src="./assets/chat.png" alt="Chat Interface" />
</div>

Open full chat for streaming responses, page context, attachments, and history branching.

---

### Virtual Companion

<div align="center">
  <img src="./assets/companion.png" alt="Virtual Companion" />
</div>

Use a customizable companion with model/stage/motion/emote controls and runtime-aware behavior.

---

### AI Toolbar

<div align="center">
  <img src="./assets/toolbars.png" alt="AI Toolbar" />
</div>

Select text in-page to open quick rewrite, summarize, translate, writer, dictation, and image actions.

---

### Provider and Runtime Details

VAssist lets you configure LLM, STT, and TTS providers independently from setup/settings.

- LLM providers: Chrome AI, OpenAI, Ollama, android-local, desktop-local
- STT providers: Chrome AI Multimodal, OpenAI, OpenAI-compatible, android-local, desktop-local
- TTS providers: Kokoro, OpenAI, OpenAI-compatible, GPT-SoVITS remote, android-local, desktop-local

<details>
<summary>Local provider implementation details</summary>

- android-local runs through the in-app Android local AI server and uses llama.cpp with GGUF model management; mmproj pairing is supported for vision-capable models
- desktop-local runs through the desktop local AI server and uses node-llama-cpp for local LLM inference
- Android local STT is handled by WhisperService (whisper-tiny.en) using sherpa-onnx on-device inference
- Android local TTS is handled by VitsService (vits-vctk, multi-speaker) using sherpa-onnx on-device inference
- Desktop local STT is proxied by the local server to the Faster Whisper Python service
- Desktop local TTS is proxied by the local server to GPT-SoVITS and returned as WAV audio
- Both local runtimes expose OpenAI-style audio routes for transcription and speech through the local server surface

</details>

---

### Companion Customization

- Upload custom PMX companion models and PMX stages
- Import VMD animations, assign categories, and control which motions are enabled
- Create/import emotes with motion, audio, and camera variants
- Apply the configured avatar as an Android live wallpaper from the app setup flow

## Installation

### Install From Releases

Download artifacts from [releases](https://github.com/b1ink0/vassist/releases):

- Desktop App: install the desktop installer package for your OS
- Android App: install the APK on your Android device
- Browser Extension: download `vassist-extension.zip`

<details>
<summary>Extension install (Chrome)</summary>

1. Download `vassist-extension.zip` from [releases](https://github.com/b1ink0/vassist/releases).
2. Extract the zip file.
3. Open `chrome://extensions`.
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked**.
6. Select the extracted folder.

</details>

### Build From Source

#### Requirements

- Bun (recommended) or Node.js
- Chrome (for extension runtime)
- Android Studio + SDK (for Android build/run)

1. Clone and install dependencies:

```bash
git clone https://github.com/b1ink0/vassist.git
cd vassist
bun install
```

2. Choose your runtime:

- Extension: `bun run dev:extension` (or build zip with `bun run build:extension:zip`)
- Desktop app: `bun run dev:desktop` (or production build with `bun run build:desktop:production`)
- Android app: `bun run dev:android` (or production build with `bun run build:android`)

<details>
<summary>Android run (Capacitor dev flow)</summary>

1. Build and sync Android assets:

```bash
bun run dev:android
```

2. Open Android project:

```bash
bun run cap:open:android
```

3. Run from Android Studio on emulator/device.
4. Use the Android app option to set VAssist as your live wallpaper.

</details>

<details>
<summary>Optional Chrome AI mode</summary>

If you specifically want Chrome built-in AI providers, enable the required Chrome AI flags in your browser.

</details>

[Detailed installation guide →](https://b1ink0.github.io/vassist/docs/installation)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

```bash
git clone https://github.com/b1ink0/vassist.git
cd vassist
bun install

bun run dev:extension          # Extension development build (watch)
bun run dev:desktop            # Desktop renderer development
bun run dev:android            # Android web build + Capacitor sync
bun run build:extension        # Build extension
bun run build:extension:zip    # Create distributable
bun run build:desktop:production
bun run build:android
```

## Built With

- **React** - UI framework
- **Vite** - Build tool
- **Electron** - Desktop runtime
- **Capacitor (Android)** - Android runtime bridge
- **Babylon.js** - Character rendering and animation
- **babylon-mmd** - PMX/VMD companion pipeline
- **Tailwind CSS** - Styling
- **Dexie.js** - IndexedDB wrapper
- **Kokoro.js** - On-device TTS
- **node-llama-cpp** - Desktop local LLM integration
- **llama.cpp** - Android local LLM backend (native)
- **Express + NanoHTTPD** - Local OpenAI-style API servers
- **Whisper + VITS integrations** - Local STT/TTS service backends
- **Chrome AI APIs** - Native on-device AI integration

## License

GPL-3.0 License - see [LICENSE](LICENSE) file for details.

## Links

[🐛 Issues](https://github.com/b1ink0/vassist/issues) • [💬 Discussions](https://github.com/b1ink0/vassist/discussions) • [📖 Docs](https://b1ink0.github.io/vassist/docs/intro)

---
