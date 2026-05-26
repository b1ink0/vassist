# AI and Media Stack

VAssist combines several AI backends, speech engines, and companion asset formats. The sections below map those names to the parts of the app where they appear.

## Language models

| Option | Where it appears | What it uses | What you manage |
| --- | --- | --- | --- |
| Desktop Local | Desktop | [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) on top of [llama.cpp](https://github.com/ggerganov/llama.cpp) | GGUF models, backend choice, context and token limits, local model folder |
| Android Local | Android | Native [llama.cpp](https://github.com/ggerganov/llama.cpp) inside the Android project | GGUF models stored in the app, local endpoint, on-device limits |
| Chrome AI | Browser and extension when supported | Browser-side Gemini Nano and related Chrome AI APIs | Browser flags, model download, output language, Chrome availability |
| Ollama | All platforms | [Ollama](https://ollama.com/) server | Endpoint URL and model name |
| OpenAI | All platforms | [OpenAI](https://platform.openai.com/docs/) hosted models | API key and model choice |

### GGUF and mmproj notes

- GGUF is the local model format used by the llama.cpp-based desktop and Android paths.
- Some multimodal local models also need a matching mmproj file for image support.
- That is why the local model controls in VAssist talk about model libraries, imports, downloads, and vision support instead of just asking for one model name.

## Speech output

| Option | Where it appears | What it uses | What you manage |
| --- | --- | --- | --- |
| Kokoro | Browser, extension, desktop | [kokoro-js](https://www.npmjs.com/package/kokoro-js) using the default `onnx-community/Kokoro-82M-v1.0-ONNX` model unless you override it | Voice, speed, backend, cache, model initialization |
| Android Local TTS | Android | sherpa-onnx VITS with a built-in VCTK multi-speaker pack | Speaker ID, speed, Android-local model package |
| Desktop Local TTS | Desktop | [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) hosted through the desktop runtime | Reference voices, install state, language, speed, sampling settings |
| GPT-SoVITS Remote | All platforms | Remote GPT-SoVITS server | Server URL, saved voices, language, speed, sampling settings |
| OpenAI TTS | All platforms | OpenAI speech models | API key, model, voice |
| OpenAI-compatible TTS | All platforms | OpenAI-style speech server | Endpoint, optional key, model, voice |

## Speech input

| Option | Where it appears | What it uses | What you manage |
| --- | --- | --- | --- |
| Android Local STT | Android | sherpa-onnx Whisper on device | Language and Android-local model package |
| Desktop Local STT | Desktop | Faster Whisper service through the desktop runtime | Whisper model, language, threads, local endpoint |
| Chrome AI STT | Browser and extension when supported | Browser-side Chrome AI speech recognition | Output language, model download, required flags |
| OpenAI Whisper | All platforms | OpenAI remote transcription | API key and remote model |
| OpenAI-compatible STT | All platforms | OpenAI-style remote transcription server | Endpoint, optional key, model, language |

## Companion formats and assets

VAssist uses MMD-style asset formats for the live companion.

| Asset type | What it is used for |
| --- | --- |
| PMX and BPMX models | Avatar and stage geometry |
| PMX stages | Background scenes for the companion |
| VMD and BVMD motions | Animation clips used for idle, talking, thinking, and other motion categories |
| Emotes | Named combinations of audio, motion, and optional camera movement |

### What those file names mean in practice

- PMX is the model format most users see when importing MMD-style avatars and stages.
- BPMX is the binary packed model form used by some built-in resources and converted assets.
- VMD is the common motion format for imported animation files.
- BVMD is the binary packed motion form used by built-in and converted motion assets.

## Speech-driven animation

- The companion can use spoken output for lip sync.
- VAssist also contains worker-side helpers for generating VMD motion data from audio and converting it into BVMD when needed.
- That is why the speech stack and the companion stack are connected in the codebase even though they look like separate features in the UI.

## Where to read next

<div class="doc-link-list">
  <a href="/getting-started/setup-wizard">Open setup guide</a>
  <a href="/platforms/desktop">Open desktop guide</a>
  <a href="/platforms/android">Open Android guide</a>
  <a href="/guide/avatar-motions-and-emotes">Open avatar, motions, and emotes guide</a>
</div>