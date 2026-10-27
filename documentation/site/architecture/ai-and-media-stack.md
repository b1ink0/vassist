# AI and Media Stack

A map of the AI backends, speech engines, and Live Assistant asset formats VAssist uses.

## Language models

| Option        | Where it appears                     | What it uses                                                                                                                                                                                                         | What you manage                                                                                 |
| ------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Desktop Local | Desktop                              | [`llama-server`](https://github.com/ggml-org/llama.cpp/tree/master/tools/server) or [node-llama-cpp](https://github.com/withcatai/node-llama-cpp), both on top of [llama.cpp](https://github.com/ggml-org/llama.cpp) | GGUF models, inference engine and runtime backend, context and token limits, local model folder |
| Android Local | Android                              | Native [llama.cpp](https://github.com/ggml-org/llama.cpp) for GGUF and LiteRT-LM for `.litertlm` models                                                                                                              | GGUF or LiteRT-LM models stored in the app, compute unit, on-device limits                      |
| Chrome AI     | Browser and extension when supported | Browser-side Gemini Nano and related Chrome AI APIs                                                                                                                                                                  | Browser flags, model download, output language, Chrome availability                             |
| Ollama        | All platforms                        | [Ollama](https://ollama.com/) server                                                                                                                                                                                 | Endpoint URL and model name                                                                     |
| OpenAI        | All platforms                        | [OpenAI](https://platform.openai.com/docs/) hosted models                                                                                                                                                            | API key and model choice                                                                        |

The optional [Decision API](/settings/llm#decision-api) is configured separately from chat generation. It can use a remote endpoint, an embed host bridge, or the desktop-local decision worker. It is off by default. Android can use a remote endpoint but does not include the native decision service.

### GGUF and mmproj notes

- GGUF is the local model format used by the llama.cpp-based desktop and Android paths.
- Android also runs `.litertlm` models through LiteRT-LM.
- Some multimodal GGUF models also need a matching `mmproj` file for image support.
- That is why the local model controls in VAssist talk about model libraries, imports, downloads, and vision support instead of just asking for one model name.

## Speech output

| Option                | Where it appears            | What it uses                                                                                                                                                                            | What you manage                                                                                 |
| --------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Kokoro                | Browser, extension, desktop | [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) using the Kokoro-82M ONNX model, runs in a shared audio worker via `onnxruntime-web` so inference does not block the main thread | Voice, speed, backend, cache, model initialization                                              |
| Android Local TTS     | Android                     | sherpa-onnx voice packs: VCTK, Kitten Nano, and Supertonic                                                                                                                              | Installed pack, speaker, speed                                                                  |
| Desktop Local TTS     | Desktop                     | GPT-SoVITS or Supertonic 3 hosted through the desktop runtime                                                                                                                           | Engine, install state, reference or built-in voice, language, speed, quality, sampling settings |
| GPT-SoVITS Remote     | All platforms               | Remote GPT-SoVITS server                                                                                                                                                                | Server URL, saved voices, language, speed, sampling settings                                    |
| OpenAI TTS            | All platforms               | OpenAI speech models                                                                                                                                                                    | API key, model, voice                                                                           |
| OpenAI-compatible TTS | All platforms               | OpenAI-style speech server                                                                                                                                                              | Endpoint, optional key, model, voice                                                            |

## Speech input

| Option                | Where it appears                     | What it uses                                                                                         | What you manage                                                        |
| --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Android Local STT     | Android                              | On-device Whisper, SenseVoice, or Dolphin through sherpa-onnx                                        | Language, model, compute provider, optional Snapdragon QNN pack        |
| Desktop Local STT     | Desktop                              | faster-whisper or [whisper.cpp](https://github.com/ggml-org/whisper.cpp) through the desktop runtime | Engine, runtime pack, Whisper model, language, threads, local endpoint |
| Chrome AI STT         | Browser and extension when supported | Browser-side Chrome AI speech recognition                                                            | Output language, model download, required flags                        |
| OpenAI Whisper        | All platforms                        | OpenAI remote transcription                                                                          | API key and remote model                                               |
| OpenAI-compatible STT | All platforms                        | OpenAI-style remote transcription server                                                             | Endpoint, optional key, model, language                                |

## Voice activity detection

All platforms use [`@ricky0123/vad-web`](https://github.com/ricky0123/vad) running the **Silero VAD v5** ONNX model for voice activity detection.

- VAD decides when the user has started and stopped speaking so VAssist knows when to begin and end recording without a push-to-talk button.
- In voice conversation mode, VAD also watches for speech while the assistant is replying. If it detects confirmed human voice during playback, it automatically interrupts TTS and starts recording the new input.
- VAD runs inside the shared audio worker alongside Kokoro so it does not block the main thread.

## Live Assistant engine

The Live Assistant is rendered using [BabylonJS](https://www.babylonjs.com/) (`@babylonjs/core` v8) with two additional layers:

| Layer                           | Package                                                       | What it adds                                                                           |
| ------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| MMD model and animation support | [`babylon-mmd`](https://github.com/noname0310/babylon-mmd) v1 | PMX and BPMX model loading, VMD and BVMD motion playback, morph targets, physics bones |
| Physics                         | `@babylonjs/havok`                                            | Havok physics engine for cloth, hair, and accessory simulation on supported models     |

## Live Assistant formats and assets

VAssist uses MMD-style asset formats for the Live Assistant.

| Asset type           | What it is used for                                                           |
| -------------------- | ----------------------------------------------------------------------------- |
| PMX and BPMX models  | Avatar and stage geometry                                                     |
| PMX stages           | Background scenes for the Live Assistant                                      |
| VMD and BVMD motions | Animation clips used for idle, talking, thinking, and other motion categories |
| Emotes               | Named combinations of audio, motion, and optional camera movement             |

### What those file names mean in practice

- PMX is the model format most users see when importing MMD-style avatars and stages.
- BPMX is the binary packed model form used by some built-in resources and converted assets.
- VMD is the common motion format for imported animation files.
- BVMD is the binary packed motion form used by built-in and converted motion assets.

## Speech-driven animation

- The Live Assistant can use spoken output for lip sync.
- VAssist also contains worker-side helpers for generating VMD motion data from audio and converting it into BVMD when needed.
- That is why the speech stack and the Live Assistant stack are connected in the codebase even though they look like separate features in the UI.

## Where to read next

<div class="doc-link-list">
  <a href="/getting-started/setup-wizard">Setup wizard →</a>
  <a href="/platforms/desktop">Desktop →</a>
  <a href="/platforms/android">Android →</a>
  <a href="/guide/avatar-motions-and-emotes">Avatar, motions, and emotes →</a>
</div>
