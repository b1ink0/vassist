# STT Settings

The STT tab controls how VAssist records and transcribes speech. Like TTS, it has one master enable switch, one provider selector, provider-specific setup sections, and a common recording test at the bottom.

## Common controls

| Control | Behavior |
| --- | --- |
| Enable Speech-to-Text | Master switch for speech input. Provider-specific sections stay collapsed until this is enabled. |
| Provider | Chooses the active transcription backend. The provider list is filtered by runtime. |
| Test Recording (3s) | Records a short sample and transcribes it with the current provider. |

## Android Local provider

Android Local uses the built-in Android Whisper path.

| Control | Behavior |
| --- | --- |
| Whisper model downloader | Handles Android Whisper model download and removal. |
| Language | Fixed selector with `English`, `Spanish`, `Japanese`, `Chinese`, `German`, and `French`. |
| Info text | Reminds the user that transcription is powered by Whisper locally on the device. |

## Desktop Local provider

Desktop Local uses a Whisper runtime managed through Electron.

### Setup and health controls

| Control | Behavior |
| --- | --- |
| Setup status | Shows setup logs plus completion or failure banners. |
| Initialize / install flow | Starts the desktop Whisper setup when not ready. |
| Verify / repair flow | Re-runs setup to verify the current install. |
| Cancel | Stops an in-flight setup action. |
| Setup Log | Scrollable log output area for installation and verification work. |

### Core transcription controls

| Control | Default | Behavior |
| --- | --- | --- |
| Whisper Model | `tiny` | Selects `tiny`, `base`, `tiny.en`, or `base.en`. Multilingual models cover more languages, while `.en` models are English-only. |
| Language | `auto` | Chooses auto-detection or a fixed language such as English, Spanish, French, German, Italian, Portuguese, Chinese, Japanese, or Korean. |

### Advanced Settings

| Control | Default | Behavior |
| --- | --- | --- |
| Endpoint URL | `http://127.0.0.1:11438` | Overrides the local AI server endpoint used for desktop STT. |
| Threads | `4` | Numeric CPU thread count from `1` to `16`. |

### Desktop-only microphone selection

When Desktop Local is the active provider and microphones are available, the Actions area shows:

| Control | Behavior |
| --- | --- |
| Microphone | Dropdown of enumerated `audioinput` devices from the browser or Electron environment. |

## OpenAI provider

| Control | Behavior |
| --- | --- |
| Saved Backends | Lets the user create, save, select, and delete reusable OpenAI STT backend profiles. |
| API Key | Password field for the OpenAI key. |
| Model | Remote model picker for OpenAI transcription models. |

## OpenAI-compatible provider

| Control | Behavior |
| --- | --- |
| Saved Backends | Stores endpoint, model, language, and optional key values as reusable presets. |
| Endpoint URL | Required base URL for the compatible speech-to-text service. |
| API Key (Optional) | Optional auth field. |
| Model | Remote model picker using the selected endpoint and key. |
| Language | `auto` by default, or one of the same fixed languages offered in the component selector. |

## Chrome AI Multimodal provider

Chrome AI speech input is meant for browser-native Gemini Nano transcription and is mainly relevant in supported Chrome builds.

| Control | Behavior |
| --- | --- |
| Status | Shows availability, ready state, or current download state. |
| Start Model Download | Appears when Chrome reports that the on-device model can be downloaded. |
| Refresh Status | Re-checks the browser-side availability state. |
| Output Language | Selects `English`, `Spanish`, or `Japanese` for transcription output. |
| Required Chrome Flags | Shows copy buttons for `optimization-guide-on-device-model` and `prompt-api-for-gemini-nano-multimodal-input`, plus restart guidance. |

If the runtime reports no Chrome AI support, the tab also shows an explicit warning that Chrome 138 or newer is required.

## Saved backend pattern

The OpenAI and OpenAI-compatible STT providers both reuse the same saved-backend pattern:

| Control | Behavior |
| --- | --- |
| Backend name | Free-text label for the preset. |
| Backend dropdown | Loads a previously saved provider profile. |
| New | Clears the current selection so the user can define a fresh backend. |
| Save | Persists the current provider fields into the selected or new profile. |
| Delete | Removes the selected saved backend. |