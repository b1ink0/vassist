# Set Up VAssist

The setup wizard appears the first time you open VAssist. It walks you through the main choices that shape the app before you start using it.

By the time you finish, VAssist is ready to use with your preferred companion, AI service, voice settings, and extra tools.

Android live wallpaper mode reads the choices saved in the main app. Setup happens in the main Android app first, not inside the wallpaper view.

<div class="media-placeholder">
	<strong>GIF placeholder</strong>
	<span>Complete five-step setup flow from Welcome to Finish.</span>
</div>

## What you will go through

You move through five screens in order.

| Step | What you choose |
| --- | --- |
| Welcome | Intro, documentation link, and Chrome AI help where it applies |
| Virtual Companion | Whether the avatar is on, which display mode it uses, and position choices in browser or extension installs |
| AI Configuration | Your main AI service, with different local, browser, or cloud choices depending on platform |
| Voice | Separate speech output and speech input choices, each with their own provider list |
| AI+ Features | Optional tools such as Translate, Summarize, Rewrite, and Writer |

## 1. Welcome

The first screen is a quick introduction. It introduces VAssist, links out to the docs, and can show Chrome AI setup help when you are using a browser or extension install.

<div class="media-placeholder">
	<strong>Screenshot placeholder</strong>
	<span>Welcome screen with the docs link and any Chrome AI guidance.</span>
</div>

## 2. Virtual Companion

This step decides whether VAssist opens with the animated companion or a chat-first layout.

- Turn the avatar on or off.
- Choose Standard Mode or Portrait Mode when the avatar is enabled.
- In browser or extension installs, choose where the companion appears on your screen.
- If you turn the avatar off, VAssist continues as a chat-focused experience.

<div class="media-placeholder">
	<strong>Screenshot placeholder</strong>
	<span>Virtual companion step with avatar, display mode, and position choices.</span>
</div>

## 3. AI Configuration

This step decides which AI service handles chat and most AI actions.

Choose one AI service here, then finish only the fields shown for that choice.

### Fastest way through this screen

| Platform | Keep this selected first | Switch only if |
| --- | --- | --- |
| Android | Android Local | You already plan to use OpenAI or Ollama instead of the on-device model |
| Desktop | Desktop Local | You want cloud setup now, or you already run Ollama |
| Browser or extension | Chrome AI if it is ready | Chrome AI is unavailable, still blocked by browser setup, or you already prefer OpenAI or Ollama |

### Use this order

1. Start with the default option already selected for your platform.
2. Finish the install, flag, or download work shown for that provider.
3. Fill only the fields shown for that provider.
4. Run `Test Connection` when that button is available.
5. If the local or browser path is still not ready and you need to keep moving, switch to OpenAI or Ollama for now.

### What this screen can actually ask you to do

| Choice | What the wizard may show |
| --- | --- |
| Android Local | A ready state, a model label, `Test Connection`, and an endpoint field in Advanced Settings |
| Desktop Local | A runtime-backend picker, backend install status, an `Install` button, backend progress, and `Test Connection` |
| Chrome AI | Status, required Chrome flags, `Start Model Download`, `Refresh Status`, and a link to Chrome internal pages |
| OpenAI | API key field and `Test Connection` |
| Ollama | Endpoint, model name, and `Test Connection` |

### What each choice means during setup

#### Android Local

Android Local is the normal first choice on Android. It is the built-in on-device model path shown in the wizard as Qwen3-0.6B.

1. Leave `Android Local` selected.
2. Run `Test Connection`.
3. Continue if it responds.

The wizard shows this path as ready to use and labels it as Qwen3-0.6B-Q4, optimized for mobile. The endpoint field only matters when the Android-local service is exposed somewhere other than the default local address.

#### Desktop Local

Desktop Local is the normal first choice on desktop. It is the built-in local model path based on llama.cpp through the Electron runtime.

1. Leave `Desktop Local` selected.
2. Open `Runtime Backend` and decide whether to stay on `auto` or choose a specific backend.
3. Keep `auto` for the first pass if you are not sure which backend fits your machine.
4. Choose a specific backend only when you already know the hardware match:
	- `cpu` for CPU-only fallback or troubleshooting
	- `cuda` for NVIDIA GPUs
	- `vulkan` for AMD GPUs or other Vulkan-capable GPUs
	- `metal` for macOS systems that support Metal
5. If you choose a specific backend and it says it is not installed, press `Install` and wait for the progress bar to finish.
6. Run `Test Connection`.
7. Continue once it responds.

Not every machine shows every backend as usable. Unsupported choices can be hidden or disabled by the runtime check. `auto` is the safest first pass when you do not want to choose a backend manually.

The setup wizard covers the compute backend, but the full GGUF model library is managed later in Settings, where you can import or download models. Plan for extra disk space there as well, because the backend install and at least one local GGUF model are separate pieces.

The advanced fields such as Temperature, Max Tokens, Context Size, GPU Layers, and Threads can stay at their defaults during setup.

#### Chrome AI

Chrome AI is the simplest browser-side choice when the browser already supports it. No API key is needed.

1. Keep `Chrome AI` selected if the wizard says it is ready, downloadable, or still checking.
2. If the `Required Chrome Flags` block is shown, enable these flags and restart Chrome:
	- `chrome://flags/#optimization-guide-on-device-model` = `Enabled BypassPerfRequirement`
	- `chrome://flags/#prompt-api-for-gemini-nano` = `Enabled`
	- `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` = `Enabled`
3. Open `chrome://components` and let Chrome download `Optimization Guide On Device Model` if it is still missing.
4. If the status says a model download is available, press `Start Model Download`.
5. If the download keeps running in the background, check `chrome://on-device-internals/` and use `Refresh Status` in the wizard.
6. Continue once the status says Chrome AI is ready.

Chrome AI requires a current Chrome build. The setup UI calls out Chrome 138 or later when the browser is too old.

If Chrome AI is still not ready and setup needs to finish now, switch to OpenAI or Ollama instead of staying blocked on browser setup.

#### OpenAI

OpenAI is the simplest cloud choice in setup.

1. Switch to `OpenAI` if you already have an API key and want the fastest remote setup path.
2. Paste the API key.
3. Run `Test Connection`.
4. Continue once it succeeds.

Model selection and finer tuning can wait until Settings.

#### Ollama

Ollama is the simplest choice when Ollama is already running on your machine or another machine you can reach.

1. Switch to `Ollama` if you already run an Ollama server.
2. Leave the server address on `http://localhost:11434` if Ollama is running on the same machine.
3. Replace `llama2` with the model you actually have installed if needed.
4. Run `Test Connection`.
5. Continue once it succeeds.

Change the server address only when Ollama is not running on the same machine as VAssist.

<div class="media-placeholder">
	<strong>Screenshot placeholder</strong>
	<span>AI service choices with one option expanded and its setup details visible.</span>
</div>

## 4. Voice

Voice setup is split into two separate parts in the same screen:

- Text-to-Speech at the top for spoken replies
- Speech-to-Text underneath for microphone input

You can finish setup with both on, only one on, or both off.

### Fastest way through this screen

| Platform | Spoken replies | Microphone input |
| --- | --- | --- |
| Android | Keep `Android Local` | Keep `Android Local` |
| Desktop | Keep `Desktop Local` for local voice; otherwise use `Disabled` or `OpenAI TTS` | Keep `Desktop Local` for local voice input; otherwise use `Disabled` or `OpenAI Whisper` |
| Browser or extension | Keep `Kokoro TTS` | Keep `Chrome AI` if it is ready; otherwise use `Disabled` or `OpenAI Whisper` |

### Use this order

1. Decide whether you want spoken replies right now.
2. Decide whether you want microphone input right now.
3. Set either side to `Disabled` if that part can wait.
4. If you keep the default platform choice, finish only the setup work shown for that provider.
5. If you switch to a cloud or server option, fill the required fields and test it.

### What this screen can actually ask you to do

| Choice | What the setup wizard shows |
| --- | --- |
| Android Local TTS and STT | A ready state and an endpoint field in Advanced Settings |
| Desktop Local TTS | GPT-SoVITS install status, backend picker, install log, and the reference-voice form |
| Desktop Local STT | Whisper setup status, `Initialize` or `Verify` buttons, a setup log, model choice, and language choice |
| Kokoro TTS | Voice choice, speed, backend choice, `Initialize Model`, status, and `Test Voice` |
| Chrome AI STT | Status, required flags, `Start Model Download`, output language, and `Refresh Status` |

The first-launch wizard is a first-pass setup screen, not the full model manager. Some Android-local download and cleanup controls live later in Settings instead of inside this step.

### Spoken replies

#### Android Local TTS

Android Local TTS is the normal first choice on Android. It is the built-in VITS voice path.

1. Leave `Android Local` selected.
2. Continue if it already looks ready.
3. Open Advanced Settings only if the Android-local endpoint changed.

In the setup wizard, this card does not expose the Android model download button. It only shows the ready state and endpoint field.

If Android speech is missing later, open Settings and download or re-download the VITS model there. The Android TTS settings screen exposes the VITS download flow at about `~145 MB`, with about `~152 MB` freed again if you delete it later.

Speaker selection and speed tuning are also handled later in Settings.

#### Desktop Local TTS

Desktop Local TTS is the local desktop speech path. It uses GPT-SoVITS and supports reference-voice setup.

1. Leave `Desktop Local` selected for local speech.
2. Choose a `PyTorch Backend`:
	- `auto` for the safest first pass
	- `cpu` for CPU-only fallback
	- `cuda` for NVIDIA GPUs
	- `rocm` for AMD GPUs
	- `sycl` for Intel GPU or XPU setups
	- `metal` for Apple Silicon
3. Press `Install GPT-SoVITS` if it is not ready, or `Re-install` if the setup is partial or damaged.
4. Watch the installation log and wait for it to finish.
5. Add one reference voice:
	- a voice name
	- the exact words spoken in the sample
	- the spoken language
	- one MP3, WAV, or M4A clip
6. Keep the sample short. The voice uploader validates clips between 3 and 10 seconds.
7. Save that voice and keep it selected.

The installer can pull in a Python runtime, the selected PyTorch backend, GPT-SoVITS models, and the rest of the required dependencies. The setup UI estimates about `~5GB` of disk space and `10-30 minutes`, with GPU builds taking the largest share.

Unsupported backend choices fall back automatically when the desktop setup cannot use them.

If voice cloning can wait, switching to `Disabled` or `OpenAI TTS` is the faster way through setup.

#### Disabled TTS

`Disabled` turns spoken replies off and keeps the rest of the app working normally. Pick this when text chat matters more than voice on the first pass.

#### Kokoro TTS

Kokoro is the normal first choice for spoken replies in the browser and extension. It is also available on desktop.

1. Leave `Kokoro TTS` selected.
2. Pick a voice.
3. Leave the backend on `Auto` for the first pass.
4. Initialize the model and wait for the download to finish.
5. Run the voice test before continuing.

`WebGPU` is the faster backend and the larger download at about `~350 MB`. `WASM` is the slower but smaller and more compatible fallback at about `~86 MB`.

If WebGPU causes lag, broken audio, or garbled speech, switch to `WASM`.

#### OpenAI TTS

OpenAI TTS is the fastest remote speech option when you already use OpenAI.

1. Switch to `OpenAI TTS`.
2. Paste the API key.
3. Pick a model and voice.
4. Run the test button.
5. Continue once it sounds right.

#### OpenAI-Compatible TTS

OpenAI-Compatible TTS is only for setups that already have a compatible speech server.

1. Enter the endpoint URL.
2. Add the API key if the server uses one.
3. Enter the model and voice name expected by that server.
4. Run the test button.

### Microphone input

#### Android Local STT

Android Local STT is the normal first choice on Android. It is the built-in Whisper transcription path.

1. Leave `Android Local` selected.
2. Continue if it already looks ready.
3. Open Advanced Settings only if the Android-local endpoint changed.

In the setup wizard, this card does not expose the Android Whisper download button. It only shows the ready state and endpoint field.

If Android speech input is missing later, open Settings and download or re-download the Whisper model there. The Android STT settings screen exposes that download flow at about `~99 MB`.

#### Desktop Local STT

Desktop Local STT is the local desktop speech-recognition path. It uses Whisper through the desktop runtime.

1. Leave `Desktop Local` selected for local microphone input.
2. Pick a Whisper model before you start the setup.
3. Press `Initialize Whisper` or `Complete Whisper Setup`.
4. Use `Verify` if you want the wizard to check the installation again.
5. Wait for the setup log to finish.
6. Pick the transcription language.
7. Continue once the local service is ready.

The Whisper setup pulls in the local runtime pieces plus the model you chose. `tiny` and `tiny.en` are the lighter first-pass choices. `base` and `base.en` use more storage and usually give better accuracy.

`tiny` is the smallest multilingual option. `base` is larger but more accurate. `tiny.en` and `base.en` are the English-only variants.

Leave endpoint and CPU thread settings at their defaults unless you are troubleshooting.

#### Disabled STT

`Disabled` keeps setup text-only. Pick this when you are typing for now and do not need microphone input on the first pass.

#### Chrome AI STT

Chrome AI STT is the normal first browser-side choice when Chrome already supports it.

1. Keep `Chrome AI` selected if status shows that it is ready or downloadable.
2. Choose the transcription output language.
3. Enable the required flags and restart Chrome if the flags section says they are still missing:
	- `chrome://flags/#optimization-guide-on-device-model`
	- `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
4. Open `chrome://components` if Chrome still needs the Gemini Nano component.
5. Press `Start Model Download` if the wizard offers it.
6. Use `chrome://on-device-internals/` plus `Refresh Status` if the download appears to continue in the background.

If Chrome AI is still blocked and setup needs to finish now, switch to `Disabled` or `OpenAI Whisper` instead of staying stuck here.

#### OpenAI Whisper

OpenAI Whisper is the simplest remote speech-input option when you already use OpenAI.

1. Switch to `OpenAI Whisper`.
2. Paste the API key.
3. Pick the remote model.
4. Continue once the connection looks right.

#### OpenAI-Compatible STT

OpenAI-Compatible STT is for setups that already have a compatible transcription server.

1. Enter the endpoint URL.
2. Add the API key if the server uses one.
3. Enter the model name.
4. Pick the input language or leave it on auto-detect.

### Before you continue

- TTS and STT are separate choices. They do not have to come from the same provider.
- The default platform choices are the fastest first pass in most cases.
- `Disabled` is the right choice whenever one side of voice can wait until later.
- Android-local download, delete, and deeper tuning controls are fuller in Settings than they are in this wizard.
- Fine tuning and extra testing can happen later in Settings.
- [AI and Media Stack](/architecture/ai-and-media-stack) explains what the short provider names map to behind the scenes.

<div class="media-placeholder">
	<strong>GIF placeholder</strong>
	<span>Voice step showing both the TTS section and the STT section with one provider open on each side.</span>
</div>

## 5. AI+ Features

The last step controls the extra tools that sit on top of your main AI service.

- Translator for turning text into another language.
- Language detector for identifying the language of text.
- Summarizer for shortening longer text.
- Text rewriter for changing tone, style, or wording.
- Content writer for creating new text from a prompt.

Any of these can stay off for a simpler setup. They can all be changed later in Settings.

<div class="media-placeholder">
	<strong>Screenshot placeholder</strong>
	<span>Final AI+ feature toggles and the Finish button.</span>
</div>

## When setup is done

Finishing setup saves your choices and opens the normal VAssist interface.

## Run setup again later

To run first-launch choices again, open Settings, go to the UI tab, and select Start Setup Wizard Again.