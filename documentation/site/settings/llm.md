# LLM Settings

Settings → LLM controls which AI model handles chat and toolbar actions. It has three sub-tabs: **Provider**, **Routing**, and **Profiles**.

## Choosing and switching providers

The **Provider** dropdown filters to providers that work on your current runtime. Android-only providers won't appear on desktop, and vice versa.

1. Open Settings → LLM.
2. Pick a provider from the **Provider** dropdown:
   - **OpenAI**: cloud API with API key
   - **Ollama**: self-hosted Ollama server on your machine or LAN
   - **Desktop Local**: runs a GGUF model directly on your PC via a built-in llama.cpp server
   - **Android Local**: on-device model on Android
   - **Chrome AI**: Gemini Nano, Chromium only
3. Fill in the required fields for that provider (API key, endpoint, model).
4. Click **Test Connection** to confirm the app can reach it.

## Working with saved backends

Saved backends store your full provider configuration under a name so you can switch setups with one click instead of re-entering credentials.

**To save a backend:**

1. Fill in all fields for the current provider (API key, endpoint, model, etc.).
2. Type a name in the **Backend name** field.
3. Click the **save** (💾) button. The configuration is stored under that name.

**To load a saved backend:**

- Open the **Saved Backends** dropdown and select a name. All fields fill in automatically.

**To update a saved backend:**

- Load it from the dropdown, make your changes, then click the **save** (💾) button again with the same name.

**To create a new slot without a preset:**

- Click the **+** (add) button. This clears the fields so you can fill in a fresh configuration, then save it under a new name.

**To delete a saved backend:**

- Select it from the dropdown, then click the **delete** (🗑) button. This removes it from the dropdown but doesn't affect the current active connection.

::: tip
Each provider keeps its own separate list. OpenAI backends don't appear in the Ollama dropdown.
:::

## Model routing

Routing lets different models handle different types of work. Your main model handles normal chat. A **Vision Model** handles image requests. A **Router Model** handles lightweight routing and classifier tasks. This is useful if your main model is expensive but most routing decisions can be done by a cheaper, faster model.

**To set up routing:**

1. Go to the **Routing** sub-tab.
2. Toggle **Enable Model Routing** on.
3. For **Vision Model**: toggle off **Use main LLM** to pick a dedicated model. When off, a backend selector and model picker appear. Choose a saved backend profile or the current provider connection, then select the model.
4. For **Router Model**: same steps.
5. Leave **Use main LLM** on for a role to keep using your primary model for that type of request.

Routing is available for OpenAI, Ollama, Android Local, and Desktop Local. Other providers show a read-only note.

## System prompt profiles

Profiles store named system prompt variants per provider. You can keep a professional-tone profile and a casual one, and switch between them without retyping.

**To create a profile:**

1. Go to the **Profiles** sub-tab.
2. Click **+** (add profile). A new profile is created, seeded with the text from the current profile.
3. Type a new name in **Profile Name**.
4. Edit the **System Prompt** text.

**To switch profiles:**

- Select a profile from the dropdown. The active provider switches to using that profile's prompt immediately.

**To delete a profile:**

- Select the profile you want to remove, then click **Delete current profile**. You can only delete a profile when more than one exists.

## Provider sub-tab

### Desktop local server (desktop only)

At the top of the LLM tab on desktop, there's a **Shared Local API Server** card. This lets you expose the local AI server on your LAN so other devices can connect to the same desktop runtime.

| Control                | Default | Behavior                                      |
| ---------------------- | ------- | --------------------------------------------- |
| Share On Local Network | Off     | Binds the server to your LAN interface.       |
| Shared Server Port     | Saved   | Port for the local server. Validated 1–65535. |

### Common controls (all providers)

| Control         | Behavior                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Provider        | Picks the active LLM. Providers that don't work on your runtime won't appear.                                                      |
| Saved Backends  | Name, save, load, and delete reusable backend profiles. Saving a profile captures all the visible fields for the current provider. |
| Test Connection | Checks whether the current provider is reachable and working.                                                                      |

### OpenAI

| Control              | Behavior                                                       |
| -------------------- | -------------------------------------------------------------- |
| Saved Backends       | Stores API key, model, token settings, and multimodal toggles. |
| API Key              | Your OpenAI API key.                                           |
| Model                | Fetched from OpenAI based on the key.                          |
| Enable Image Support | Allows image + text requests. On by default.                   |
| Enable Audio Support | Allows audio + text requests. On by default.                   |

### Ollama

| Control                      | Behavior                                               |
| ---------------------------- | ------------------------------------------------------ |
| Saved Backends               | Stores endpoint, model, and multimodal toggles.        |
| Endpoint URL                 | Host and port for your Ollama server.                  |
| Model                        | Fetched from the selected endpoint.                    |
| Enable Image / Audio Support | Enable when the model you picked actually supports it. |

### Android Local (Android only)

| Control             | Default                 | Behavior                                                                          |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| Info banner         | -                       | Describes on-device llama.cpp and in-app GGUF downloads.                          |
| Saved Backends      | -                       | Stores endpoint, model, temperature, and token limits.                            |
| Endpoint URL        | `http://127.0.0.1:8765` | Points at the in-app Android local server.                                        |
| Local model manager | -                       | Lists installed GGUF models, lets you set the active one, delete it if supported. |
| Temperature         | `0.7`                   | 0.0 – 2.0 in 0.1 steps.                                                           |
| Max Tokens          | `2048`                  | 64 – 2048 in 64-token steps.                                                      |

### Desktop Local (desktop only)

Desktop Local is the most complex provider because it manages both the llama.cpp compute backend and the GGUF model library.

#### Runtime

| Control             | Default         | Behavior                                                                |
| ------------------- | --------------- | ----------------------------------------------------------------------- |
| Info banner         | -               | Describes local llama.cpp execution and GPU acceleration options.       |
| Runtime status      | Model-dependent | Shows whether the runtime is ready, and warns if no model is loaded.    |
| Runtime Backend     | `auto`          | `auto`, `cpu`, `cuda`, `vulkan`, or `metal` depending on your hardware. |
| Refresh             | -               | Re-checks backend install state.                                        |
| Install / Reinstall | -               | Installs or reinstalls the selected backend.                            |
| Backend progress    | -               | Shows % and MB during installation.                                     |

::: tip
`auto` lets the runtime pick the best available backend. Only specify one manually if you need to force a particular GPU path.
:::

#### Advanced Settings

| Control      | Default                  | Behavior                                 |
| ------------ | ------------------------ | ---------------------------------------- |
| Endpoint URL | `http://127.0.0.1:11438` | Override the local AI server endpoint.   |
| Temperature  | `0.7`                    | 0.0 – 2.0                                |
| Max Tokens   | `2048`                   | 256 – 8192 in 256-token steps            |
| Context Size | `4096`                   | 512 – 32768 in 512-token steps           |
| GPU Layers   | `33`                     | Layers offloaded to GPU. `0` = CPU only. |
| Threads      | `4`                      | CPU worker thread count.                 |

#### Local model manager

The local model manager is where you install the GGUF files that Desktop Local actually runs.

**To import a model you already have:**

1. Click **Import Model** (upload icon).
2. Browse to a `.gguf` file and confirm. The model copies to the models folder and appears in the list.

**To download from Ollama:**

1. In the Download Model section, make sure the **Ollama** tab is selected.
2. Type a model name in the search field (e.g., `qwen`, `llama`, `mistral`). Results appear live as you type.
3. Click a model from the list. A **Choose Tag** section appears below. Filter the tags (e.g., `3b`, `7b`, `latest`) and click the one you want.
4. Click **Download**. A progress bar tracks the download. When it finishes, the model appears in **Installed Models**.

**To download from Hugging Face:**

1. Switch to the **Hugging Face** tab.
2. Type a search term. Repos with GGUF files appear in the list.
3. Click a repo. A file list appears showing the `.gguf` files in that repo.
4. Filter files if needed, then click the one you want.
5. Click **Download**.

**To set a model as the default:**

- Find it in **Installed Models** and toggle its switch on. Desktop Local will load this model at startup.

**To delete a model:**

- Click the trash (🗑) icon next to it in **Installed Models**.

| Control                    | Behavior                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Models Folder              | Shows the current folder, lets you change it or reset to default.                                                   |
| Import Model               | Imports a `.gguf` file from your filesystem.                                                                        |
| Download from Ollama       | Search model names → pick a model → pick a tag → Download.                                                          |
| Download from Hugging Face | Search GGUF repos → pick a repo → pick a `.gguf` file → Download.                                                   |
| Installed Models           | Lists models with size, modified date, and a vision badge when applicable. Delete or toggle a model as the default. |

### Chrome AI (browser and extension)

| Control                            | Default | Behavior                                                                                                                                                       |
| ---------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                             | -       | Current availability, readiness, or download state.                                                                                                            |
| Start Model Download               | -       | Appears when Chrome says the model is downloadable.                                                                                                            |
| Refresh Status                     | -       | Re-checks availability.                                                                                                                                        |
| Temperature                        | `1.0`   | Range slider from `0.0` to `2.0`.                                                                                                                              |
| Top-K                              | `3`     | Range slider from `1` to `10`.                                                                                                                                 |
| Output Language                    | `en`    | Selects `English`, `Spanish`, or `Japanese`.                                                                                                                   |
| Enable Image Support (Multi-modal) | On      | Enables image input when the browser model supports it.                                                                                                        |
| Enable Audio Support (Multi-modal) | On      | Enables audio input when the browser model supports it.                                                                                                        |
| Required Chrome Flags              | N/A     | Shows copy buttons for `optimization-guide-on-device-model` and `prompt-api-for-gemini-nano`, plus guidance to restart Chrome and visit `chrome://components`. |

## Routing sub-tab

Routing is currently implemented for OpenAI, Ollama, Android Local, and Desktop Local. Other providers show a read-only message that routing is not available yet.

### Shared routing behavior

| Control              | Behavior                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Enable Model Routing | Turns on separate model selection for vision and router workloads.                                   |
| Vision Model         | Owns image-heavy tasks.                                                                              |
| Router Model         | Owns routing or lighter classifier-style tasks.                                                      |
| Use main LLM         | When on, that role reuses the primary model. When off, the role expands into its own selector block. |

### Remote-provider routing

For OpenAI and Ollama, each expanded role shows:

| Control                  | Behavior                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Backend/profile selector | Chooses either the current provider connection or one saved backend profile.                |
| Model picker             | Uses the selected connection details to browse and choose the exact vision or router model. |

### Local-provider routing

For Android Local and Desktop Local, each expanded role shows:

| Control                      | Behavior                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend/profile selector     | Chooses either local on-device models or one saved remote backend profile.                                                                             |
| Local model list             | If no remote backend is selected, the panel lists installed local models with size, modified date, and a vision badge where applicable.                |
| Vision/router default toggle | Marks one local model as the dedicated model for that routing role.                                                                                    |
| Remote model picker          | If a remote backend profile is selected, the local list is replaced by a remote model picker using that profile's provider, endpoint, and credentials. |

## Profiles sub-tab

System prompt profiles live in the Profiles tab for the active provider.

| Control                        | Behavior                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| System Prompt Profile dropdown | Chooses the active prompt profile. Built-in defaults are merged with custom profiles.  |
| Add profile                    | Creates a new custom profile seeded from the currently selected profile's prompt text. |
| Delete current profile         | Removes the selected profile when more than one profile exists.                        |
| Profile Name                   | Renames the selected profile.                                                          |
| System Prompt                  | Edits the actual system prompt text for the selected profile.                          |

Profile edits persist automatically. Switching profiles keeps each profile's own prompt text, and the active provider's `systemPromptType` and `systemPrompt` values are updated to match the selected profile.
