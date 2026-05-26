# LLM Settings

The LLM tab controls the main model backend used for chat, toolbar actions, and higher-level AI tools. It is split into three sub-tabs: Provider, Routing, and Profiles.

## Provider sub-tab

### Desktop local server controls

Desktop builds show a `Shared Local API Server (LLM/TTS/STT)` card above the provider selector.

| Control | Default | Visibility | Behavior |
| --- | --- | --- | --- |
| Share On Local Network | Off | Desktop only | Binds the local server to the LAN so other devices can use the hosted desktop runtime. |
| Shared Server Port | Saved value, validated `1-65535` | Desktop only | Changes the port used by the shared local server. Invalid ports show an inline validation message. |

### Common provider controls

| Control | Behavior |
| --- | --- |
| Provider | Chooses the active LLM backend. The list is platform-filtered, so unsupported providers simply do not appear in some runtimes. |
| Saved Backends | Lets the user name, select, create, save, and delete reusable backend profiles for the current provider. Saving captures the provider-specific fields currently visible on screen. |
| Test Connection | Runs a connectivity or runtime availability check for the current LLM provider. |

### OpenAI provider

| Control | Behavior |
| --- | --- |
| Saved Backends | Stores API key, model, token settings, and multimodal toggles for OpenAI backends. |
| API Key | Password field for the OpenAI key. |
| Model | Remote model picker backed by the OpenAI connection. |
| Enable Image Support (Multi-modal) | Allows image-plus-text requests. Enabled by default. |
| Enable Audio Support (Multi-modal) | Allows audio-plus-text requests. Enabled by default. |

### Ollama provider

| Control | Behavior |
| --- | --- |
| Saved Backends | Stores endpoint, model, and multimodal toggles for Ollama-compatible connections. |
| Endpoint URL | Host and port for the Ollama or compatible server. |
| Model | Remote model picker against the selected endpoint. |
| Enable Image Support (Multi-modal) | Enables image input when the chosen model actually supports it. |
| Enable Audio Support (Multi-modal) | Enables audio input when the chosen model actually supports it. |

### Android Local provider

This provider is only shown in Android builds.

| Control | Default | Behavior |
| --- | --- | --- |
| Android Local LLM info banner | N/A | Summarizes on-device llama.cpp usage and in-app GGUF downloads. |
| Saved Backends | Stores endpoint, selected model, temperature, and token limits for Android local backends. |
| Endpoint URL | `http://127.0.0.1:8765` | Points at the in-app Android local server. |
| Local model manager | N/A | Lists installed GGUF models, lets the user select the active model, and exposes deletion hooks when supported. |
| Temperature | `0.7` | Range slider from `0.0` to `2.0` in `0.1` steps. |
| Max Tokens | `2048` | Range slider from `64` to `2048` in `64` token steps. |

### Desktop Local provider

Desktop Local is the most involved local option because it manages both the llama.cpp runtime backend and the local GGUF model library.

#### Runtime panel

| Control | Default | Behavior |
| --- | --- | --- |
| Desktop Local info banner | N/A | Summarizes local llama.cpp execution and available GPU acceleration. |
| Runtime status | Current model dependent | Shows whether the local runtime is ready and warns if no model is selected. |
| Runtime Backend selector | `auto` | Chooses the compute backend. The available list typically includes auto, CPU, CUDA, Vulkan, or Metal depending on the host. |
| Refresh | N/A | Re-checks backend install state. |
| Install / Reinstall | N/A | Installs or reinstalls the currently selected backend. |
| Backend progress | N/A | Shows percentage, status text, and downloaded megabytes while the backend install is running. |

#### Advanced Settings

| Control | Default | Behavior |
| --- | --- | --- |
| Endpoint URL | `http://127.0.0.1:11438` | Overrides the local desktop AI server endpoint. |
| Temperature | `0.7` | Range slider from `0.0` to `2.0`. |
| Max Tokens | `2048` | Numeric input from `256` to `8192` in `256` token steps. |
| Context Size | `4096` | Numeric input from `512` to `32768` in `512` token steps. |
| GPU Layers | `33` | Numeric input controlling how many layers are offloaded to the GPU. `0` means CPU only. |
| Threads | `4` | Numeric input for CPU worker thread count. |

#### Local model manager

| Control group | Behavior |
| --- | --- |
| Models Folder | Shows the active storage path, lets the user pick a custom folder, and allows resetting back to the default location. |
| Import Model | Imports a local `.gguf` file through the desktop file picker. |
| Download Model | Lets the user switch between `Ollama` and `Hugging Face`, browse registries, paste a manual model reference or direct URL, then pull or download the model with progress feedback. |
| Installed Models | Lists each local model with size and modified date, shows an image badge when the model advertises vision support, allows deletion, and lets the user mark one model as the active default. |

### Chrome AI provider

The Chrome AI panel exists for browser-native Gemini Nano usage when the provider is available in the current runtime.

| Control | Default | Behavior |
| --- | --- | --- |
| Status | N/A | Shows current availability, readiness, or download state. |
| Start Model Download | N/A | Appears when the browser reports that the model is downloadable. |
| Refresh Status | N/A | Re-checks availability and download state. |
| Temperature | `1.0` | Range slider from `0.0` to `2.0`. |
| Top-K | `3` | Range slider from `1` to `10`. |
| Output Language | `en` | Selects `English`, `Spanish`, or `Japanese`. |
| Enable Image Support (Multi-modal) | On | Enables image input when the browser model supports it. |
| Enable Audio Support (Multi-modal) | On | Enables audio input when the browser model supports it. |
| Required Chrome Flags | N/A | Shows copy buttons for `optimization-guide-on-device-model` and `prompt-api-for-gemini-nano`, plus guidance to restart Chrome and visit `chrome://components`. |

## Routing sub-tab

Routing is currently implemented for OpenAI, Ollama, Android Local, and Desktop Local. Other providers show a read-only message that routing is not available yet.

### Shared routing behavior

| Control | Behavior |
| --- | --- |
| Enable Model Routing | Turns on separate model selection for vision and router workloads. |
| Vision Model | Owns image-heavy tasks. |
| Router Model | Owns routing or lighter classifier-style tasks. |
| Use main LLM | When on, that role reuses the primary model. When off, the role expands into its own selector block. |

### Remote-provider routing

For OpenAI and Ollama, each expanded role shows:

| Control | Behavior |
| --- | --- |
| Backend/profile selector | Chooses either the current provider connection or one saved backend profile. |
| Model picker | Uses the selected connection details to browse and choose the exact vision or router model. |

### Local-provider routing

For Android Local and Desktop Local, each expanded role shows:

| Control | Behavior |
| --- | --- |
| Backend/profile selector | Chooses either local on-device models or one saved remote backend profile. |
| Local model list | If no remote backend is selected, the panel lists installed local models with size, modified date, and a vision badge where applicable. |
| Vision/router default toggle | Marks one local model as the dedicated model for that routing role. |
| Remote model picker | If a remote backend profile is selected, the local list is replaced by a remote model picker using that profile's provider, endpoint, and credentials. |

## Profiles sub-tab

System prompt profiles live in the Profiles tab for the active provider.

| Control | Behavior |
| --- | --- |
| System Prompt Profile dropdown | Chooses the active prompt profile. Built-in defaults are merged with custom profiles. |
| Add profile | Creates a new custom profile seeded from the currently selected profile's prompt text. |
| Delete current profile | Removes the selected profile when more than one profile exists. |
| Profile Name | Renames the selected profile. |
| System Prompt | Edits the actual system prompt text for the selected profile. |

Profile edits persist automatically. Switching profiles keeps each profile's own prompt text, and the active provider's `systemPromptType` and `systemPrompt` values are updated to match the selected profile.