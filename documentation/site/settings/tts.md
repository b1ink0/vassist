# TTS Settings

Settings → TTS controls spoken replies. The master **Enable Text-to-Speech** switch must be on before any provider controls appear.

## Choosing a provider

Pick based on where you're running and what quality you need:

- **Desktop Local (GPT-SoVITS)**: highest voice quality, clones a voice from a short audio sample. Requires a one-time installation of several GB.
- **GPT-SoVITS Remote**: same quality as Desktop Local but the synthesis server runs on another machine.
- **Kokoro**: browser-side local speech. No external server, runs in the page, good quality without installation complexity.
- **OpenAI / OpenAI-compatible**: cloud synthesis. Fast, reliable, but requires an API key and sends audio to a remote service.
- **Android Local**: on-device VITS, Android only. Runs without any network.

## Common controls

| Control               | Default                                               | Behavior                                                        |
| --------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Enable Text-to-Speech | Off                                                   | Master switch. Hides all provider controls when off.            |
| Provider              | Saved                                                 | Active speech backend.                                          |
| Test Text             | `Hello, this is a test of the text to speech system.` | Text used by **Test TTS**.                                      |
| Test Language         | `English`                                             | GPT-SoVITS only. Language for the speech test.                  |
| Test TTS              | -                                                     | Speaks the test text. Disabled while a test is already running. |

## Android Local

Android Local uses the built-in VITS voice pack. The VCTK pack has 109 speakers with distinct voices. Use Test TTS to audition them quickly.

**To set up Android Local:**

1. If the model isn't installed yet, tap the **download** button next to the VITS model (~145 MB). A progress bar tracks the download.
2. Once installed, select your **Speaker ID** (0–108). Each number is a different voice.
3. Adjust **Speed** if the default pace feels too slow or too fast.
4. Tap **Test TTS** to hear the result.

To remove the model and free up space, tap the **delete** (🗑) button in the model downloader.

| Control               | Default | Behavior                                                      |
| --------------------- | ------- | ------------------------------------------------------------- |
| VITS Model downloader | -       | Download and delete the Android VITS model package (~145 MB). |
| Voice                 | `VCTK`  | Built-in VCTK multi-speaker voice pack.                       |
| Speaker ID            | `0`     | 0–108 to pick a voice from the pack.                          |
| Speed                 | `1.0x`  | 0.5x–2.0x.                                                    |

## Desktop Local (GPT-SoVITS)

Desktop Local runs GPT-SoVITS locally through Electron. You'll see an installation block first, then the voice library.

### Installation

::: warning
GPT-SoVITS is a large install. The automated setup downloads models and Python packages. It takes time and uses a few GB of disk space.
:::

**To install GPT-SoVITS:**

1. Select your **PyTorch Backend**. Use **Auto Detect** unless you know you need a specific one (`CUDA` for NVIDIA, `ROCm` for AMD, `Metal` for Apple Silicon).
2. Click **Install GPT-SoVITS**. Watch the **Installation Log** for progress.
3. If the install fails, click **Retry Installation** or **Re-install GPT-SoVITS** for a clean restart.
4. Once the log shows success, the status updates and the voice library section appears.

| Control               | Behavior                                                                               |
| --------------------- | -------------------------------------------------------------------------------------- |
| Install status        | Whether GPT-SoVITS is installed, partial, or missing.                                  |
| PyTorch Backend       | Choose `Auto Detect`, `CPU`, `CUDA`, `ROCm`, `SYCL/XPU`, or `Metal` before installing. |
| Install GPT-SoVITS    | Full automated install from scratch.                                                   |
| Re-install GPT-SoVITS | Clean reinstall for broken or partial installations.                                   |
| Verify Installation   | Re-runs setup in verification mode.                                                    |
| Cancel                | Stops the active install.                                                              |
| Installation Log      | Streaming output from the installer.                                                   |
| Retry Installation    | Appears after a failure.                                                               |

### Reference voice library

GPT-SoVITS clones tone and accent from a short audio sample you provide. A good reference voice makes a big difference in output quality.

**What makes a good reference audio:**

- 3–10 seconds of clean speech with no background noise
- Only one speaker
- Matches the language you'll be synthesizing

**To add a reference voice:**

1. Give it a **name** so you can find it later.
2. Paste or type the **exact transcript** of what is spoken in the audio clip. This transcript is used during synthesis. If it's wrong, output quality will suffer.
3. Set the correct **language**.
4. Hit **Upload Audio File** and pick your MP3, WAV, or M4A clip.
5. Hit **Save Voice**.
6. Toggle the new voice as **default** from the voice list.

GPT-SoVITS Remote uses the same voice library as Desktop Local, so voices saved here appear in both.

**To manage voices in your library:**

- **Rename:** Click the pencil (✏️ `edit-2`) icon next to a voice. Type the new name, then click the checkmark (✓ `check`) to save or the X (`x`) to cancel.
- **Delete:** Click the trash (`trash-2`) icon next to a voice.
- **Set as default:** Toggle the switch on the voice row you want to use. Only one voice can be the default at a time.

| Control           | Behavior                                       |
| ----------------- | ---------------------------------------------- |
| Voice Name        | Name for a new reference voice.                |
| Reference Text    | The exact phrase spoken in the uploaded audio. |
| Language          | Language of the reference text and audio.      |
| Upload Audio File | MP3, WAV, or M4A, 3–10 seconds.                |
| Save Voice        | Persists the entry and makes it selectable.    |
| Voice row         | Rename, delete, or mark as default.            |

### Advanced parameters

| Control     | Default | Behavior               |
| ----------- | ------- | ---------------------- |
| Speed       | `1.0`   | Output playback speed. |
| Top K       | `15`    | Sampling parameter.    |
| Top P       | `0.7`   | Nucleus sampling.      |
| Temperature | `0.7`   | Sampling temperature.  |

## GPT-SoVITS Remote

GPT-SoVITS Remote connects to a GPT-SoVITS synthesis server running on another machine. Same voice quality as Desktop Local, but you don't need to install anything on the device you're chatting from.

**To set up GPT-SoVITS Remote:**

1. Enter the **Server URL** for your remote GPT-SoVITS instance.
2. Add reference voices using the same **Reference voice library** as Desktop Local. Voices are shared between both.
3. Optionally save the endpoint as a saved backend using the **Saved Backends** controls.

| Control        | Behavior                                     |
| -------------- | -------------------------------------------- |
| Saved Backends | Named presets for remote GPT-SoVITS servers. |
| Server URL     | Endpoint for the remote host.                |

## Kokoro

Browser-side local speech. No server required.

Kokoro requires a one-time model download. Before you can use it you need to initialize it:

1. Pick a **Device Backend**: **WebGPU** is faster and recommended if your browser supports it. **WASM** is smaller and more stable on older or lower-power hardware. Leave it on **Auto** to let the app choose.
2. Hit **Initialize Model**. The model files will download. Watch the progress bar.
3. Wait for the status to say the model is ready. This only happens once. After that the model is cached locally.

Once initialized, pick a **Voice** from the grouped picker and adjust **Speech Speed** if needed. **Keep Model Loaded** is on by default and keeps the model warm so there's no cold-start delay between uses.

If you need to free up disk space, use **Cache Management → Clear Cache**. You'll need to initialize again after clearing.

| Control           | Default    | Behavior                                                                               |
| ----------------- | ---------- | -------------------------------------------------------------------------------------- |
| Voice             | `AF_HEART` | Grouped by accent and gender.                                                          |
| Speech Speed      | `1.0x`     | 0.5x–2.0x.                                                                             |
| Device Backend    | `Auto`     | `Auto`, `WebGPU`, or `WASM`. WebGPU is faster. WASM is more stable on weaker hardware. |
| Model ID          | Empty      | Advanced override for the Hugging Face model ID.                                       |
| Keep Model Loaded | On         | Keeps the model warm to avoid cold-start delays.                                       |
| Initialize Model  | -          | One-time download and initialization.                                                  |
| Check Status      | -          | Re-check readiness without reinstalling.                                               |
| Download progress | -          | Progress bar during model download.                                                    |
| Cache Management  | -          | Check size or clear cached Kokoro assets.                                              |

## OpenAI

OpenAI TTS is a cloud service. It's fast and reliable but requires an API key and processes text on OpenAI's servers.

**To set up OpenAI TTS:**

1. Enter your **API Key** (starts with `sk-`).
2. Select a **Model** from the dropdown. The list is fetched from OpenAI using your key.
3. Select a **Voice** from the fixed list.
4. Click **Test TTS** to confirm it's working.
5. Optionally save the configuration with **Saved Backends** so you can reload it later.

| Control        | Behavior                                                  |
| -------------- | --------------------------------------------------------- |
| Saved Backends | Stores API key, model, voice, and speed as named presets. |
| API Key        | Your OpenAI key.                                          |
| Model          | Fetched from OpenAI based on the key.                     |
| Voice          | Fixed OpenAI voice list.                                  |

## OpenAI-compatible

OpenAI-compatible works with any TTS service that speaks the OpenAI API format (e.g., a locally hosted Kokoro API server or a third-party provider).

**To set up OpenAI-compatible TTS:**

1. Enter the **Endpoint URL** for your compatible service.
2. Add an **API Key** if the service requires one (leave empty if not).
3. Select a **Model** from the dropdown (fetched from the endpoint).
4. Enter a **Voice** identifier. Type the voice name exactly as the API expects it.
5. Click **Test TTS** to verify.
6. Optionally save as a named backend using **Saved Backends**.

| Control        | Behavior                                  |
| -------------- | ----------------------------------------- |
| Saved Backends | Stores endpoint, key, model, and voice.   |
| Endpoint URL   | Host and port for the compatible service. |
| API Key        | Optional.                                 |
| Model          | Fetched from the endpoint.                |
| Voice          | Free-text voice identifier.               |
| Voice          | Free-text voice identifier.               |
