# Set Up VAssist

The setup wizard runs on first launch and starts with a welcome screen, followed by Live Assistant mode, AI provider, text-to-speech, speech-to-text, and extra tools. Android and desktop also have a background step after Live Assistant. Local engine and model downloads can take additional time.

::: info Android wallpaper
If you're on Android and plan to use the live wallpaper, do setup in the main app first. The wallpaper reads its settings from the app.
:::

## Overview

| Step             | What you configure                                                 |
| ---------------- | ------------------------------------------------------------------ |
| Welcome          | Intro and docs link. Chrome builds show Chrome AI guidance here.   |
| Live Assistant   | Avatar on/off, display mode, position (browser/extension installs) |
| Background       | Android and desktop only. Enable a bundled wallpaper and choose which ones to include. |
| AI Configuration | Your main AI provider                                              |
| Text-to-Speech   | Choose and configure spoken replies                                |
| Speech-to-Text   | Choose and configure microphone input                              |
| AI+ Features     | Optional tools: translate, summarize, rewrite, write               |

## 1. Welcome

Just an intro screen. Links to the docs and, on Chrome, shows any Chrome AI setup guidance that applies to your browser. Hit Next.

## 2. Live Assistant

Pick whether you want the 3D Live Assistant or a chat-first layout.

- **Avatar on**: choose Standard Mode (full body) or Portrait Mode (upper body crop). Browser and extension installs also let you pick a starting screen position.
- **Avatar off**: VAssist runs as a chat window, no 3D rendering.

You can change all of this later in Settings → 3D.

## 3. Background

Blue Milky Way is selected and enabled by default. Choose other bundled wallpapers to include them in the fade slideshow, or turn the background off. You can change this later in **Settings > UI > Display**. Desktop floating mode stays clear.

The setup step shares the background controls from Settings. Adjust brightness directly or open **More image effects** to choose a preset and tune contrast, saturation, blur, grayscale, sepia, or hue.

Choose **Images**, **Solid color**, or **Gradient** for the background. Gradient presets include Midnight, Ocean, Aurora, Sunset, and Forest. You can customize both colors and the angle.

On Android, the same selected wallpapers appear in the full app and live wallpaper. You can import your own images later in Settings. On desktop, you can combine the selected wallpapers with image files or a folder. See [wallpaper credits](/legal/wallpapers) for image sources and licensing.

## 4. AI Configuration

This is the most involved step. Pick one AI provider and finish only the fields it shows you.

### Which provider should I start with?

| Platform            | Default pick         | Switch if                                                       |
| ------------------- | -------------------- | --------------------------------------------------------------- |
| Android             | Android Local        | You already have OpenAI or Ollama set up                        |
| Desktop             | Desktop Local        | You'd rather use a cloud provider, or Ollama is already running |
| Browser / extension | Chrome AI (if ready) | Chrome AI isn't available yet, or you prefer OpenAI / Ollama    |

### What each provider asks you to do

| Provider      | What the wizard shows                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| Android Local | Model download and selection, compute unit, model parameters, Test Connection, endpoint in Advanced Settings |
| Desktop Local | Engine and runtime setup, model downloads and selection, model parameters, Test Connection                   |
| Chrome AI     | Status, required Chrome flags, Start Model Download, Refresh Status, Chrome internal links                   |
| OpenAI        | API key field, Test Connection                                                                               |
| Ollama        | Endpoint, model name, Test Connection                                                                        |

### Android Local

The default on Android. Runs local GGUF or LiteRT-LM models on-device.

1. Leave `Android Local` selected.
2. Download or select a model in the model manager.
3. Choose a compute unit if you want to change the default `Auto` selection.
4. Adjust model parameters if needed, then use **Test Connection**.
5. Continue when it responds.

The Advanced Settings endpoint field only matters if you've changed the default local address.

### Desktop Local

The default on desktop. Uses llama.cpp through the Electron runtime.

1. Leave `Desktop Local` selected.
2. Keep the default `llama-server` engine, or choose `node-llama-cpp` in **Inference Engine**.
3. Install a llama-server runtime pack, or open **Runtime Backend** for node-llama-cpp and pick your backend:
   - `auto`: safest first pick, lets the runtime figure it out
   - `cpu`: CPU only, slowest, but works everywhere
   - `cuda`: NVIDIA GPUs
   - `vulkan`: AMD GPUs or other Vulkan-capable hardware
   - `metal`: macOS (Apple Silicon and supported Intel Macs)
4. If the runtime needs installing, hit **Install** and wait for it to finish.
5. Download or import a GGUF model in the model manager and select it.
6. Adjust model parameters if needed, then hit **Test Connection**.
7. Continue when it responds.

::: tip
`auto` is fine for a first pass. You can change the engine and backend later in Settings → LLM.
:::

Advanced fields (Temperature, Max Tokens, Context Size, GPU Layers, Threads) can all stay at defaults during setup.

### Chrome AI

Browser-native Gemini Nano. No API key needed, but it requires a recent Chrome build and specific flags.

1. Keep `Chrome AI` if the wizard shows it as ready or downloadable.
2. If the **Required Chrome Flags** block appears, enable these flags and restart Chrome:

::: details Chrome AI required flags

- `chrome://flags/#optimization-guide-on-device-model` → `Enabled BypassPerfRequirement`
- `chrome://flags/#prompt-api-for-gemini-nano` → `Enabled`
- `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → `Enabled`
  :::

3. After restarting Chrome, go to `chrome://components` and let Chrome download **Optimization Guide On Device Model** if it's still missing.
4. Hit **Start Model Download** if the wizard offers it.
5. If the download keeps running in the background, check `chrome://on-device-internals/` and use **Refresh Status** in the wizard.
6. Continue when status shows Chrome AI is ready.

Chrome AI requires Chrome 138 or later. If it's still blocked and you need to move on, switch to OpenAI or Ollama.

### OpenAI

1. Switch to `OpenAI`.
2. Paste your API key.
3. Hit **Test Connection**.
4. Continue when it succeeds.

Model selection and token limits are in Settings → LLM.

### Ollama

1. Switch to `Ollama`.
2. Leave the endpoint as `http://localhost:11434` if Ollama is on the same machine.
3. Update the model name if needed (replace `llama2` with what you actually have installed).
4. Hit **Test Connection**.
5. Continue when it succeeds.

Change the endpoint only if Ollama is running on a different machine.

## 5. Text-to-Speech

Choose how the assistant speaks. This is a separate step from Speech-to-Text, so you can configure either feature without the other.

::: tip
`Disabled` is always a valid choice for either side. You can enable and configure voice later in Settings → TTS and Settings → STT.
:::

### Quick defaults by platform

| Platform            | Default TTS provider |
| ------------------- | -------------------- |
| Android             | Android Local        |
| Desktop             | Desktop Local        |
| Browser / extension | Kokoro               |

### What each choice asks you to do

| Provider          | What the wizard shows                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Android Local TTS | Voice-pack downloads, active pack and speaker selectors, speed, Test TTS                                   |
| Android Local STT | Model downloads, model, language and compute selectors, Test Recording                                     |
| Desktop Local TTS | Engine picker, GPT-SoVITS install and reference voice form, or Supertonic options                          |
| Desktop Local STT | Engine picker, faster-whisper setup or whisper.cpp runtime and model downloads, model and language pickers |
| Kokoro TTS        | Voice picker, speed, backend, Initialize Model, status, Test Voice                                         |
| Chrome AI STT     | Status, required flags, Start Model Download, output language, Refresh Status                              |

---

### Spoken replies (TTS)

#### Android Local TTS

The wizard lets you manage Android voice packs directly during setup.

1. Leave `Android Local` selected to use the default VITS VCTK pack, or download another available pack.
2. Select the active pack and speaker, then adjust speed if needed.
3. Use **Test TTS** to check speech before continuing.

You can change these choices later in **Settings → TTS**.

#### Desktop Local TTS

1. Leave `Desktop Local` selected.
2. Choose the TTS engine:
   - `GPT-SoVITS` supports reference voice cloning. Continue with the installation and reference voice steps below.
   - `Supertonic 3` uses its available voice, language, and quality controls. It does not need a GPT-SoVITS reference voice.
3. For GPT-SoVITS, choose a PyTorch backend:
   - `auto` for the first pass
   - `cpu`, `cuda`, `rocm`, `sycl`, or `metal` if you know your hardware
4. Hit **Install GPT-SoVITS** (or **Re-install** if it's partially broken) and wait for the install log to finish.
5. For GPT-SoVITS, add a reference voice:
   - a name for the voice
   - the exact words spoken in the audio sample
   - the language of that sample
   - a clip between 3 and 10 seconds (MP3, WAV, or M4A)
6. Save it and keep it selected.

::: warning Install time
The GPT-SoVITS install pulls Python, PyTorch, the models, and dependencies. Expect around 5 GB of disk space and 10–30 minutes depending on your connection and whether you're using a GPU backend.
:::

#### Kokoro TTS

Kokoro runs in the browser with no server needed.

1. Leave `Kokoro TTS` selected.
2. Pick a voice.
3. Leave backend on `Auto`.
4. Hit **Initialize Model** and wait for the download.
5. Run the voice test.

Backend options: `WebGPU` is faster (~350 MB download). `WASM` is smaller (~86 MB) and more stable on weaker hardware. Switch to WASM if WebGPU gives you garbled or broken audio.

#### OpenAI TTS

1. Switch to `OpenAI TTS`.
2. Paste your API key.
3. Pick a model and voice.
4. Hit the test button.

#### OpenAI-Compatible TTS

For setups that already have a compatible speech server running.

1. Enter the endpoint URL.
2. API key if the server needs one.
3. Model and voice name.
4. Test it.

---

## 6. Speech-to-Text

Choose how the assistant transcribes microphone input. This is a separate step from Text-to-Speech. You can disable either one independently.

### Quick defaults by platform

| Platform            | Default STT provider |
| ------------------- | -------------------- |
| Android             | Android Local        |
| Desktop             | Desktop Local        |
| Browser / extension | Chrome AI, if ready  |

### What each choice asks you to do

#### Android Local STT

The wizard provides the Android model downloader and the same model, language, and compute choices available in Settings.

1. Leave `Android Local` selected to use the downloaded model automatically, or download and select a specific model.
2. Choose the transcription language and compute provider. Use a multilingual Whisper model or SenseVoice for Chinese or Japanese. English-only Whisper models ignore the language setting.
3. Use **Test Recording** to check transcription before continuing.

NNAPI and XNNPACK may require a custom build. The experimental Snapdragon QNN option requires a compatible device and SenseVoice. You can change these choices later in **Settings → STT**.

#### Desktop Local STT

1. Leave `Desktop Local` selected.
2. Choose `faster-whisper` or [whisper.cpp](https://github.com/ggml-org/whisper.cpp) in **STT Engine**.
3. For faster-whisper, initialize or verify its runtime. For whisper.cpp, install a runtime pack and download a GGML model.
4. Pick a Whisper model:
   - `tiny` / `tiny.en`: faster, smaller, good enough for most uses
   - `base` / `base.en`: more accurate, larger download
   - `.en` variants are English-only but slightly faster
5. Hit **Initialize Whisper** (or **Complete Whisper Setup**) when using faster-whisper.
6. Wait for the setup log when installing faster-whisper or a whisper.cpp runtime.
7. Pick a transcription language (or leave on auto-detect), then use **Test Recording (3s)**.
8. Continue when the selected service is ready.

#### Chrome AI STT

1. Keep `Chrome AI` if status shows it as ready or downloadable.
2. Pick an output language.
3. If flags are missing, enable them and restart Chrome:

::: details Chrome AI STT required flags

- `chrome://flags/#optimization-guide-on-device-model`
- `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
  :::

4. Use `chrome://on-device-internals/` plus **Refresh Status** if the download stalls in the background.

If Chrome AI is still blocked, switch to `Disabled` or `OpenAI Whisper`.

#### OpenAI Whisper

1. Switch to `OpenAI Whisper`.
2. Paste your API key.
3. Pick the remote model.
4. Continue.

#### OpenAI-Compatible STT

1. Enter the endpoint URL.
2. API key if needed.
3. Model name.
4. Language (or leave on auto-detect).

## 7. AI+ Features

Five optional tools that sit on top of your main AI provider:

- **Translator**: translate selected text
- **Language Detector**: identify what language something is
- **Summarizer**: shorten longer passages
- **Text Rewriter**: rephrase, adjust tone, fix grammar
- **Content Writer**: generate new text from a prompt

All of these can be toggled off for a simpler start and re-enabled later in Settings → AI+.

## Done

Finishing setup saves your configuration and opens the main interface. If you ever want to redo these choices, go to **Settings → UI → Start Setup Wizard Again**.
