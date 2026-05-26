# AI Features Settings

The AI+ tab controls the higher-level tools that sit on top of the chosen LLM provider. It does not replace the main LLM selection. Instead, it turns extra tools on or off and exposes test actions for each one.

## Common pattern

Every feature block follows the same pattern:

| Element | Behavior |
| --- | --- |
| Feature switch | Enables or disables that feature independently of the others. |
| Feature summary | Describes what the feature enables. |
| Test action | Runs a provider-backed test call when testing is enabled in Settings. |
| Clear action | Clears the last shown test result. |
| Result area | Shows success, loading, or error output for the latest test. |

## Feature-by-feature controls

### Translator

| Control | Default | Behavior |
| --- | --- | --- |
| Translator toggle | On | Enables translation actions across the assistant UI. |
| Default Translation Language | `en` | Chooses the target language used by the test flow and by default translation behavior. |
| Test | N/A | Translates the built-in sample sentence `Hello, how are you?` from English into the selected target language. |
| Clear | N/A | Clears the last translation result. |

### Language Detector

| Control | Default | Behavior |
| --- | --- | --- |
| Language Detector toggle | On | Enables language detection features. |
| Test Text | `Bonjour, comment allez-vous?` | Sample text used for the detection test. |
| Test | N/A | Runs detection and reports the detected language plus confidence when available. |
| Clear | N/A | Clears the last detection result. |

### Summarizer

| Control | Default | Behavior |
| --- | --- | --- |
| Summarizer toggle | On | Enables summary generation actions. |
| Test | N/A | Runs a summary against the built-in AI paragraph sample. |
| Clear | N/A | Clears the last summary result. |

The current config defaults used by the summarizer logic are:

| Setting | Default |
| --- | --- |
| Summary type | `tldr` |
| Output format | `plain-text` |
| Length | `medium` |

### Text Rewriter

| Control | Default | Behavior |
| --- | --- | --- |
| Text Rewriter toggle | On | Enables rewrite actions for existing text. |
| Test | N/A | Rewrites the built-in sample sentence using a more formal tone. |
| Clear | N/A | Clears the last rewrite result. |

### Content Writer

| Control | Default | Behavior |
| --- | --- | --- |
| Content Writer toggle | On | Enables prompt-to-content writing actions. |
| Test | N/A | Generates a short paragraph about AI benefits using the built-in sample prompt. |
| Clear | N/A | Clears the last generated result. |

## Chrome AI feature flags

When Chrome AI is the current LLM provider and your Chrome version still needs extra AI feature flags, an additional warning message appears.

### Flags shown here

| Flag | Why it is shown |
| --- | --- |
| `translation-api` | Required for browser-side translation features |
| `language-detection-api` | Required for browser-side language detection |
| `summarization-api-for-gemini-nano` | Required for browser-side summarization |
| `rewriter-api` | Required for browser-side rewriting |

Each flag row includes a `Copy Flag URL` button, and the page also shows step-by-step instructions to enable the flags and relaunch Chrome.

## Missing or inactive tools

If toolbar actions such as Translate, Summarize, Rewrite, or Writer-style generation appear to be missing or inactive, check the AI+ tab after verifying the main LLM provider.