# TTS Settings

The TTS tab controls spoken replies and spoken playback. It includes one master enable switch, one provider selector, provider-specific setup sections, and a common speech test area at the bottom.

## Common controls

| Control | Default | Behavior |
| --- | --- | --- |
| Enable Text-to-Speech | Saved per user | Master switch for spoken output. Provider-specific controls are hidden until this is enabled. |
| Provider | Saved per user | Chooses the active speech backend. Android local is only exposed on Android builds. |
| Test Text | `Hello, this is a test of the text to speech system.` | Text used by the shared `Test TTS` action. |
| Test Language | `English` | Only shown for Desktop Local GPT-SoVITS. Selects the test language used for the speech test. |
| Test TTS | N/A | Speaks the current Test Text through the selected provider. Disabled while testing is already running. |

## Android Local provider

Android Local uses the native Android-side VITS stack rather than browser-only synthesis.

| Control | Default | Behavior |
| --- | --- | --- |
| VITS Model downloader | N/A | Shows model download and deletion actions for the Android VITS model package. The current package size is documented as roughly `145 MB`. |
| Voice | `VCTK` fixed library | Shows the built-in VCTK multi-speaker voice pack rather than a free-form provider model field. |
| Speaker ID | `0` | Numeric input from `0` to `108` for voice selection inside the VCTK pack. |
| Speed | `1.0x` | Range slider from `0.5x` to `2.0x`. |

## Desktop Local provider

Desktop Local uses GPT-SoVITS hosted by Electron on the local machine.

### Installation block

Desktop Local shows a full GPT-SoVITS installation section before the reference-voice library.

| Control | Behavior |
| --- | --- |
| Install status | Shows whether GPT-SoVITS is installed, partially installed, or missing. |
| PyTorch Backend | Chooses `Auto Detect`, `CPU`, `CUDA`, `ROCm`, `SYCL/XPU`, or `Metal` before installation. |
| Install GPT-SoVITS | Starts the full automated install when nothing is installed yet. |
| Re-install GPT-SoVITS | Forces a clean reinstall when partial or existing installs need repair. |
| Verify Installation | Re-runs setup in verification mode when GPT-SoVITS is already installed. |
| Cancel | Stops an active install. |
| Installation Log | Shows streaming setup logs, completion, or failure output. |
| Retry Installation | Appears after failure. |

### Reference voice library

Desktop Local and GPT-SoVITS Remote both use the same voice-library editor.

| Control | Behavior |
| --- | --- |
| Voice Name | Name for the new saved reference voice. |
| Reference Text | The exact text spoken in the uploaded audio. |
| Language | Language of that reference text and sample audio. |
| Upload Audio File | Accepts MP3, WAV, or M4A. The audio is validated to be between 3 and 10 seconds long. |
| Save Voice | Persists the reference voice and makes it available for selection. |
| Voice row edit | Renames a saved voice and updates reference text or language metadata. |
| Voice row delete | Removes the saved reference voice. |
| Voice row default toggle | Marks that voice as the reference voice for current synthesis settings. |

### Advanced GPT-SoVITS parameters

Outside setup mode, GPT-SoVITS also exposes:

| Control | Default | Behavior |
| --- | --- | --- |
| Speed | `1.0` | Output speed control. |
| Top K | `15` | Sampling parameter for GPT-SoVITS generation. |
| Top P | `0.7` | Nucleus sampling parameter. |
| Temperature | `0.7` | Sampling temperature. |

## GPT-SoVITS Remote provider

This provider reuses the same reference-voice library as Desktop Local but assumes the synthesis server already exists elsewhere.

| Control | Behavior |
| --- | --- |
| Saved Backends | Lets the user name, select, create, save, and delete reusable remote GPT-SoVITS server profiles. |
| Server URL | Endpoint for the remote GPT-SoVITS host. |
| Reference voice library | Same voice-name, transcript, language, upload, rename, delete, and default selection controls as Desktop Local. |
| Advanced GPT-SoVITS parameters | Same Speed, Top K, Top P, and Temperature controls as the local flow. |

## Kokoro provider

Kokoro is the local browser-side speech option and exposes the richest guided setup text in the current TTS UI.

| Control | Default | Behavior |
| --- | --- | --- |
| Voice | `AF_HEART` default voice | Voice picker grouped by accent and gender. |
| Speech Speed | `1.0x` | Range slider from `0.5x` to `2.0x`. |
| Device Backend | `Auto` | Chooses `Auto`, `WebGPU`, or `WASM`. Setup guidance outlines the size and performance tradeoffs. |
| Model ID | Empty uses default | Advanced field for overriding the Hugging Face model ID. Hidden during setup mode. |
| Keep Model Loaded | On | Periodically keeps the model resident to avoid cold-start lag. |
| Initialize Model | N/A | Starts the one-time Kokoro download and initialization. |
| Check Status | N/A | Re-checks readiness without reinstalling. |
| Download progress | N/A | Shows a progress bar with percentage and status text during model download. |
| Cache Management: Check Size | N/A | Available only after Kokoro is initialized in Settings. Reads the current local cache size. |
| Cache Management: Clear Cache | N/A | Clears cached Kokoro assets, then refreshes status. |

Kokoro also shows a performance note outside setup mode explaining that WebGPU is faster while WASM is smaller and more stable on weaker devices.

## OpenAI provider

| Control | Behavior |
| --- | --- |
| Saved Backends | Stores API key, model, voice, and speed values as reusable presets. |
| API Key | Password field for the OpenAI TTS key. |
| Model | Remote model picker for OpenAI speech models. |
| Voice | Fixed OpenAI voice selector using the built-in voice list. |

## OpenAI-compatible provider

| Control | Behavior |
| --- | --- |
| Saved Backends | Stores endpoint, optional key, model, voice, and speed for compatible providers. |
| Endpoint URL | Host and port for the compatible TTS service. |
| API Key (Optional) | Optional auth field. |
| Model | Remote model picker against the selected endpoint. |
| Voice | Free-text voice identifier. |