# Set Up VAssist

The setup wizard runs on first launch and covers five screens: Live Assistant mode, AI provider, voice, and extra tools. Most people are done in under five minutes if they stick with the defaults for their platform.

::: info Android wallpaper
If you're on Android and plan to use the live wallpaper, do setup in the main app first. The wallpaper reads its settings from the app.
:::

## Overview

| Step             | What you configure                                                 |
| ---------------- | ------------------------------------------------------------------ |
| Welcome          | Intro and docs link. Chrome builds show Chrome AI guidance here.   |
| Live Assistant   | Avatar on/off, display mode, position (browser/extension installs) |
| AI Configuration | Your main AI provider                                              |
| Voice            | Speech output (TTS) and speech input (STT) separately              |
| AI+ Features     | Optional tools: translate, summarize, rewrite, write               |

## 1. Welcome

Just an intro screen. Links to the docs and, on Chrome, shows any Chrome AI setup guidance that applies to your browser. Hit Next.

## 2. Live Assistant

Pick whether you want the 3D Live Assistant or a chat-first layout.

- **Avatar on**: choose Standard Mode (full body) or Portrait Mode (upper body crop). Browser and extension installs also let you pick a starting screen position.
- **Avatar off**: VAssist runs as a chat window, no 3D rendering.

You can change all of this later in Settings → 3D.

## 3. AI Configuration

This is the most involved step. Pick one AI provider and finish only the fields it shows you.

### Which provider should I start with?

| Platform            | Default pick         | Switch if                                                       |
| ------------------- | -------------------- | --------------------------------------------------------------- |
| Android             | Android Local        | You already have OpenAI or Ollama set up                        |
| Desktop             | Desktop Local        | You'd rather use a cloud provider, or Ollama is already running |
| Browser / extension | Chrome AI (if ready) | Chrome AI isn't available yet, or you prefer OpenAI / Ollama    |

### What each provider asks you to do

| Provider      | What the wizard shows                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| Android Local | Ready state, model label, Test Connection, endpoint field in Advanced Settings             |
| Desktop Local | Backend picker, install status, Install button, progress bar, Test Connection              |
| Chrome AI     | Status, required Chrome flags, Start Model Download, Refresh Status, Chrome internal links |
| OpenAI        | API key field, Test Connection                                                             |
| Ollama        | Endpoint, model name, Test Connection                                                      |

### Android Local

The default on Android. Runs Qwen3-0.6B-Q4 on-device.

1. Leave `Android Local` selected.
2. Hit **Test Connection**.
3. Continue when it responds.

The Advanced Settings endpoint field only matters if you've changed the default local address.

### Desktop Local

The default on desktop. Uses llama.cpp through the Electron runtime.

1. Leave `Desktop Local` selected.
2. Open **Runtime Backend** and pick your backend:
   - `auto`: safest first pick, lets the runtime figure it out
   - `cpu`: CPU only, slowest, but works everywhere
   - `cuda`: NVIDIA GPUs
   - `vulkan`: AMD GPUs or other Vulkan-capable hardware
   - `metal`: macOS (Apple Silicon and supported Intel Macs)
3. If the backend needs installing, hit **Install** and wait for it to finish.
4. Hit **Test Connection**.
5. Continue when it responds.

::: tip
`auto` is fine for a first pass. You can switch backends later in Settings → LLM if you want to tune things.
:::

The backend install and the GGUF model library are separate. After setup, go to Settings → LLM → Desktop Local to download or import models.

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

## 4. Voice

Voice is split into two sections: TTS (spoken replies) at the top, and STT (microphone input) below. They're independent. You can have both on, one on, or both off.

::: tip
`Disabled` is always a valid choice for either side. You can enable and configure voice later in Settings → TTS and Settings → STT.
:::

### Quick defaults by platform

| Platform            | TTS (spoken replies) | STT (mic input)      |
| ------------------- | -------------------- | -------------------- |
| Android             | Android Local        | Android Local        |
| Desktop             | Desktop Local        | Desktop Local        |
| Browser / extension | Kokoro               | Chrome AI (if ready) |

### What each choice asks you to do

| Provider                | What the wizard shows                                                           |
| ----------------------- | ------------------------------------------------------------------------------- |
| Android Local TTS / STT | Ready state, endpoint in Advanced Settings                                      |
| Desktop Local TTS       | GPT-SoVITS install, backend picker, install log, reference voice form           |
| Desktop Local STT       | Whisper setup, Initialize/Verify buttons, setup log, model and language pickers |
| Kokoro TTS              | Voice picker, speed, backend, Initialize Model, status, Test Voice              |
| Chrome AI STT           | Status, required flags, Start Model Download, output language, Refresh Status   |

---

### Spoken replies (TTS)

#### Android Local TTS

1. Leave `Android Local` selected.
2. Continue if it looks ready.
3. Advanced Settings only matters if the endpoint changed.

The VITS model download, speaker selection, and speed are all in Settings → TTS if you need them.

#### Desktop Local TTS (GPT-SoVITS)

1. Leave `Desktop Local` selected.
2. Choose a PyTorch backend:
   - `auto` for the first pass
   - `cpu`, `cuda`, `rocm`, `sycl`, or `metal` if you know your hardware
3. Hit **Install GPT-SoVITS** (or **Re-install** if it's partially broken).
4. Wait for the install log to finish.
5. Add a reference voice:
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

### Microphone input (STT)

#### Android Local STT

1. Leave `Android Local` selected.
2. Continue if it looks ready.
3. Advanced Settings only matters if the endpoint changed.

The Whisper model download and language picker are in Settings → STT.

#### Desktop Local STT

1. Leave `Desktop Local` selected.
2. Pick a Whisper model:
   - `tiny` / `tiny.en`: faster, smaller, good enough for most uses
   - `base` / `base.en`: more accurate, larger download
   - `.en` variants are English-only but slightly faster
3. Hit **Initialize Whisper** (or **Complete Whisper Setup**).
4. Wait for the setup log.
5. Pick a transcription language (or leave on auto-detect).
6. Continue when the service is ready.

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

## 5. AI+ Features

Five optional tools that sit on top of your main AI provider:

- **Translator**: translate selected text
- **Language Detector**: identify what language something is
- **Summarizer**: shorten longer passages
- **Text Rewriter**: rephrase, adjust tone, fix grammar
- **Content Writer**: generate new text from a prompt

All of these can be toggled off for a simpler start and re-enabled later in Settings → AI+.

## Done

Finishing setup saves your configuration and opens the main interface. If you ever want to redo these choices, go to **Settings → UI → Start Setup Wizard Again**.
