<script setup lang="ts">
import AppIcon from "../.vitepress/theme/components/AppIcon.vue"
</script>

# TTS Settings

Settings → TTS controls spoken replies. The master **Enable Text-to-Speech** switch must be on before any provider controls appear.

## Choosing a provider

Pick based on where you're running and what quality you need:

- **Desktop Local**: choose GPT-SoVITS, which clones a voice from a short audio sample, or Supertonic 3, which offers built-in voices. Each engine requires a one-time installation.
- **GPT-SoVITS Remote**: same quality as Desktop Local but the synthesis server runs on another machine.
- **Kokoro**: browser-side local speech. No external server, runs in the page, good quality without installation complexity.
- **OpenAI / OpenAI-compatible**: cloud synthesis. Fast, reliable, but requires an API key and sends audio to a remote service.
- **Android Local**: downloadable on-device VCTK, Kitten Nano, and Supertonic voice packs for offline speech.

## Common controls

| Control               | Default                                               | Behavior                                                                                          |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Enable Text-to-Speech | Off                                                   | Master switch. Hides all provider controls when off.                                              |
| Provider              | Saved                                                 | Active speech backend.                                                                            |
| Accurate Lip Sync     | On                                                    | Uses the newer audio-driven mouth animation when compatible assets and a 3D avatar are available. |
| Use Legacy Lip Sync   | Off                                                   | Forces the older generic mouth motion instead of accurate lip-sync analysis.                      |
| Test Text             | `Hello, this is a test of the text to speech system.` | Text used by **Test TTS**.                                                                        |
| Test Language         | `English`                                             | GPT-SoVITS only. Language for the speech test.                                                    |
| Test TTS              | -                                                     | Speaks the test text. Disabled while a test is already running.                                   |

Accurate lip sync is enabled by default. If the selected TTS provider cannot supply what the audio-driven analyzer needs, the runtime falls back to the available generic mouth motion. These controls affect the Live Assistant avatar. They do not change speech generation or playback.

## Android Local

Android Local uses downloadable on-device voice packs. After installing a pack, select it as the active model, choose a speaker when the pack offers speaker selection, then use **Test TTS** to hear it.

| Voice pack | Voices and languages | Download size | Installed size |
| ---------- | -------------------- | ------------- | -------------- |
| VCTK English | 109 English voices | About 145 MB | About 152 MB |
| Kitten Nano English | 8 English voices | About 26 MB | About 41 MB |
| Supertonic 3 Japanese | 10 voices, 31 languages | About 123 MB | About 139 MB |

**To set up Android Local:**

1. Download one or more packs from the Android voice pack manager.
2. Choose the active pack and speaker. The VCTK pack has speaker IDs `0` to `108`.
3. Adjust **Speed** if needed, then tap **Test TTS**.

The packs run locally after download. Use the delete control on a pack to remove it and free storage.

| Control                    | Behavior                                           |
| -------------------------- | -------------------------------------------------- |
| Android voice pack manager | Download, select, and remove offline voice packs.  |
| Speaker                    | Select a voice for packs with multiple speakers.   |
| Speed                      | Adjust playback speed.                             |

## Desktop Local

Desktop Local runs through Electron. Select the **TTS Engine** to choose GPT-SoVITS or Supertonic 3. Each engine has a separate install flow and its own controls.

### Supertonic 3

Supertonic uses built-in voices and does not use the GPT-SoVITS reference voice library.

1. Select **Supertonic 3 (Local Voice, fast, built-in voices)**.
2. Click **Install Supertonic 3** and wait for installation to finish.
3. Select a **Voice**, **Language**, and **Quality**.

The installer downloads about 400 MB and runs the engine on CPU. Voice choices range from Female (F1–F5) and Male (M1–M5). The language selector includes Auto and English, Japanese, Korean, German, French, Spanish, Chinese, Italian, Portuguese, and Russian. Quality ranges from Fast (5 steps) to Best quality (12 steps).

### GPT-SoVITS

Select **GPT-SoVITS (Clone Voice, reference audio)** to install GPT-SoVITS and manage reference voices as described below.

#### Installation

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

#### Reference voice library

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

- **Rename:** Click the <AppIcon name="edit-2" /> icon next to a voice. Type the new name, then click the <AppIcon name="check" /> icon to save or the <AppIcon name="x" /> icon to cancel.
- **Delete:** Click the <AppIcon name="trash-2" /> icon next to a voice.
- **Set as default:** Toggle the switch on the voice row you want to use. Only one voice can be the default at a time.

| Control           | Behavior                                       |
| ----------------- | ---------------------------------------------- |
| Voice Name        | Name for a new reference voice.                |
| Reference Text    | The exact phrase spoken in the uploaded audio. |
| Language          | Language of the reference text and audio.      |
| Upload Audio File | MP3, WAV, or M4A, 3–10 seconds.                |
| Save Voice        | Persists the entry and makes it selectable.    |
| Voice row         | Rename, delete, or mark as default.            |

#### Advanced parameters

The GPT-SoVITS settings panel currently displays these controls, but desktop-local synthesis requests do not send their values to the GPT-SoVITS backend. They currently have no effect on desktop-local GPT-SoVITS output. Supertonic 3 uses its own voice, language, speed, and quality settings.

| Control     | Default | Behavior               |
| ----------- | ------- | ---------------------- |
| Speed       | `1.0`   | Displayed control, not currently sent for GPT-SoVITS. |
| Top K       | `15`    | Displayed control, not currently sent for GPT-SoVITS. |
| Top P       | `0.7`   | Displayed control, not currently sent for GPT-SoVITS. |
| Temperature | `0.7`   | Displayed control, not currently sent for GPT-SoVITS. |

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
