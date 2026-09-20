# STT Settings

Settings → STT controls speech input and transcription. The master **Enable Speech-to-Text** switch must be on before provider controls appear.

## Choosing a provider

- **Desktop Local**: runs Whisper on your machine via Electron. No network required, works offline. Requires a one-time setup.
- **Android Local**: on-device Whisper, Android only. Download the model once and it stays available offline.
- **OpenAI / OpenAI-compatible**: cloud transcription. No local setup, but requires an API key and an internet connection.
- **Chrome AI Multimodal**: in-browser Gemini Nano on supported Chrome builds. No external server or API key.

After picking a provider, use **Test Recording (3s)** in Common controls to verify it's working before you start a session.

## Common controls

| Control               | Behavior                                                           |
| --------------------- | ------------------------------------------------------------------ |
| Enable Speech-to-Text | Master switch. Provider sections are hidden until this is on.      |
| Provider              | Active transcription backend. Filtered by runtime.                 |
| Test Recording (3s)   | Records a short clip and transcribes it with the current provider. |

## Android Local

Android Local runs Whisper on-device. No network needed once the model is installed.

**To set up Android Local:**

1. If the model isn't installed, tap the **download** button in the Whisper model downloader (~113 MB). A progress bar tracks the download.
2. Once installed, select your **Language** from the dropdown, or leave it on `auto` if you switch between languages.
3. Tap **Test Recording (3s)** to speak a sentence and confirm transcription is working.

To remove the model and free up space, tap the **delete** (🗑) button in the model downloader.

| Control                  | Behavior                                                            |
| ------------------------ | ------------------------------------------------------------------- |
| Whisper model downloader | Download or remove the Android Whisper model.                       |
| Language                 | `English`, `Spanish`, `Japanese`, `Chinese`, `German`, or `French`. |

## Desktop Local

Runs Whisper through Electron on your machine. Requires a one-time setup step.

**To set up Desktop Local:**

1. Click **Initialize** (or **Install**) in the setup controls. Watch the **Setup Log** for progress.
2. If anything goes wrong, click **Verify / repair** to re-run setup on the existing install.
3. Once the status shows success, select a **Whisper Model**:
   - `tiny`: fastest, lowest memory
   - `base`: better accuracy, still fast (recommended for everyday use)
   - `tiny.en` / `base.en`: English-only variants, slightly faster if you only speak English
4. Set **Language**. Leave it on `auto` unless you're getting wrong language detection, in which case fixing it to your language improves accuracy.
5. Use **Test Recording (3s)** to verify it's transcribing correctly.

When Desktop Local is active, a **microphone selector** appears in the Actions area. If your recordings are picking up the wrong source, select your headset or preferred mic there.

### Setup controls

| Control              | Behavior                                   |
| -------------------- | ------------------------------------------ |
| Setup status         | Shows logs and success/failure banners.    |
| Initialize / install | Starts setup when the runtime isn't ready. |
| Verify / repair      | Re-runs setup on an existing install.      |
| Cancel               | Stops an in-flight setup action.           |
| Setup Log            | Scrollable output during installation.     |

### Transcription controls

The **Whisper Model** setting controls the tradeoff between accuracy and speed:

- **`tiny`**: fastest, smallest memory footprint. Good starting point.
- **`base`**: noticeably more accurate, still reasonably fast. Recommended for everyday use.
- **`tiny.en` / `base.en`**: English-only variants. Marginally faster than their multilingual counterparts if you only ever speak English.

Leave **Language** on `auto` unless you are getting wrong language detection. Setting a fixed language avoids detection overhead and can improve accuracy for non-English speech.

| Control       | Default | Behavior                                                                                          |
| ------------- | ------- | ------------------------------------------------------------------------------------------------- |
| Whisper Model | `tiny`  | `tiny`, `base`, `tiny.en`, or `base.en`. The `.en` variants are English-only but slightly faster. |
| Language      | `auto`  | Auto-detect or a fixed language.                                                                  |

### Advanced Settings

| Control      | Default                  | Behavior                               |
| ------------ | ------------------------ | -------------------------------------- |
| Endpoint URL | `http://127.0.0.1:11438` | Override the local AI server endpoint. |
| Threads      | `4`                      | CPU thread count, 1–16.                |

### Microphone selection

When Desktop Local is active and microphones are available, an input device picker appears in the Actions area.

## OpenAI

OpenAI transcription uses the Whisper API. No local setup needed but requires an API key and sends audio to OpenAI.

**To set up OpenAI STT:**

1. Enter your **API Key** (starts with `sk-`).
2. Select a **Model** from the dropdown. The list is fetched from OpenAI using your key.
3. Click **Test Recording (3s)** to verify the connection.
4. Optionally save as a named backend using **Saved Backends**.

| Control        | Behavior                                 |
| -------------- | ---------------------------------------- |
| Saved Backends | Named presets storing API key and model. |
| API Key        | Your OpenAI key.                         |
| Model          | Fetched from OpenAI based on the key.    |

## OpenAI-compatible

Works with any transcription service that implements the OpenAI `/audio/transcriptions` endpoint.

**To set up OpenAI-compatible STT:**

1. Enter the **Endpoint URL** for your compatible service.
2. Add an **API Key** if the service requires one.
3. Select a **Model** from the dropdown (fetched from the endpoint).
4. Set **Language** if auto-detect isn't reliable for your service.
5. Click **Test Recording (3s)** to verify.
6. Optionally save as a named backend.

| Control        | Behavior                                            |
| -------------- | --------------------------------------------------- |
| Saved Backends | Stores endpoint, model, language, and optional key. |
| Endpoint URL   | Base URL for the compatible service.                |
| API Key        | Optional.                                           |
| Model          | Fetched from the endpoint.                          |
| Language       | `auto` or a fixed language.                         |

## Chrome AI Multimodal

Browser-native Gemini Nano transcription. Only available in supported Chrome builds.

**To enable Chrome AI STT:**

1. Check the **Status**. If it says the model is downloadable, click **Start Model Download**.
2. If the status says Chrome flags are required, click each flag's **copy** button, paste the URL into Chrome's address bar, enable the flag, then restart Chrome. After restarting, visit `chrome://components` and wait for the model component to update.
3. Click **Refresh Status** to confirm the model is ready.
4. Set your **Output Language** if needed.

::: info
Chrome 138 or newer is required. If your Chrome build doesn't support it, the tab shows a warning.
:::

| Control               | Behavior                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Status                | Availability and current download state.                                                                                            |
| Start Model Download  | Appears when Chrome reports the model is downloadable.                                                                              |
| Refresh Status        | Re-checks availability.                                                                                                             |
| Output Language       | `English`, `Spanish`, or `Japanese`.                                                                                                |
| Required Chrome Flags | Copy buttons for `optimization-guide-on-device-model` and `prompt-api-for-gemini-nano-multimodal-input`, plus restart instructions. |

::: info
Chrome 138 or newer is required. If the runtime reports no Chrome AI support, the tab shows a warning.
:::
| Delete | Removes the selected saved backend. |
