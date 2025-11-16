---
sidebar_position: 3
---

# LLM Settings

Configure the Language Model provider powering VAssist's AI chat and toolbar features. Choose between Chrome's built-in AI, OpenAI's API, or a local Ollama server.

## Provider Selection

VAssist supports three LLM providers:

### Chrome AI

**On-device AI running locally in Chrome**

- ✅ **Free** - No API costs
- ✅ **Private** - All processing happens locally
- ✅ **Fast** - No network latency
- ✅ **Offline** - Works without internet (after download)
- ⚠️ **Requires** Chrome 138+ with specific flags enabled

**Best for**: Privacy-conscious users, offline use, zero cost

### OpenAI

**Cloud-based API using OpenAI models**

- ✅ **Powerful** - Access to latest GPT models
- ✅ **Flexible** - Wide range of models (GPT-4, GPT-3.5, etc.)
- ✅ **Reliable** - Production-ready service
- ⚠️ **Paid** - Requires API key and usage billing

### Ollama

**Local open-source models on your machine**

- ✅ **Free** - No API costs
- ✅ **Private** - Complete data control
- ✅ **Customizable** - Run any Ollama-compatible model
- ✅ **Offline** - Works without internet
- ⚠️ **Requires** Local Ollama server installation

**Best for**: Privacy, customization, local development

## Chrome AI Configuration

### Status & Availability

Check if Chrome AI is available on your device:

- **Readily Available** - Ready to use immediately
- **Downloadable** - Click "Start Model Download" button
- **Downloading** - Model downloading in progress
- **Unavailable** - Not supported on this device

For download progress, visit `chrome://on-device-internals/`

### Model Parameters

#### Temperature

**Range**: 0.0 - 2.0  
**Default**: 1.0

Controls randomness in responses:

- **0.0** - Deterministic, always same answer
- **1.0** - Balanced creativity and consistency
- **2.0** - Very creative, varied responses

**Use Cases**:
- Low (0.0-0.5): Factual questions, code generation, translations
- Medium (0.5-1.5): General chat, creative writing
- High (1.5-2.0): Brainstorming, storytelling, artistic tasks

#### Top-K

**Range**: 1 - 10  
**Default**: 3

Limits token choices for more focused responses:

- **1** - Most focused, least variety
- **3** - Balanced (recommended)
- **10** - Most variety, less focused

Lower values make responses more predictable and coherent.

#### Output Language

**Options**: English (en), Spanish (es), Japanese (ja)  
**Default**: en

Specifies the output language for optimal quality and safety. Choose your preferred language for AI responses.

### Multi-modal Support

#### Image Support

**Default**: Enabled

Allows sending images with text prompts for visual analysis:

- Describe images
- Extract text from screenshots
- Identify objects in photos
- Analyze diagrams and charts

#### Audio Support

**Default**: Enabled

Allows sending audio files with text prompts:

- Transcribe voice recordings
- Summarize audio content
- Translate spoken language

### Required Chrome Flags

Chrome AI requires these flags to be enabled:

1. **optimization-guide-on-device-model**
   - Set to: `Enabled BypassPerfRequirement`

2. **prompt-api-for-gemini-nano**
   - Set to: `Enabled`

After enabling flags:
1. Restart Chrome
2. Visit `chrome://components`
3. Find "Optimization Guide On Device Model"
4. Click "Check for update" to download the AI model

## OpenAI Configuration

### API Key

Your OpenAI API key from [platform.openai.com](https://platform.openai.com/api-keys)

Format: `sk-...`

:::tip
Keep your API key secure. VAssist stores it locally in browser storage.
:::

### Model

The OpenAI model to use for chat completions.

**Examples**:
- `gpt-4o` - Latest GPT-4 with vision
- `gpt-4-turbo-preview` - GPT-4 Turbo
- `gpt-3.5-turbo` - Faster, more economical

See [OpenAI Models](https://platform.openai.com/docs/models) for available options.

### Multi-modal Support

#### Image Support

**Default**: Enabled

Enables sending images with chat messages (requires vision-capable model like `gpt-4o`).

#### Audio Support

**Default**: Enabled

Enables sending audio files with chat messages.

## Ollama Configuration

### Endpoint URL

**Default**: `http://localhost:11434`

URL of your local Ollama server. Change if running on different port or remote server.

:::info
Make sure Ollama is running before testing connection. Install from [ollama.ai](https://ollama.ai)
:::

### Model

The Ollama model to use.

**Examples**:
- `llama2` - Meta's Llama 2
- `mistral` - Mistral AI
- `codellama` - Code-focused Llama
- `llava` - Vision-capable model

List available models: `ollama list`  
Pull new models: `ollama pull <model-name>`

### Multi-modal Support

#### Image Support

**Default**: Enabled

:::warning
Requires multi-modal capable model like `llava` or `bakllava`.
:::

#### Audio Support

**Default**: Enabled

:::warning
Requires multi-modal capable model with audio support.
:::

## System Prompt Configuration

The system prompt defines the AI's personality and behavior. Available for all providers.

### Personality Presets

Choose a pre-defined personality:

#### Default
*"You are a helpful virtual assistant. Be concise and friendly."*

General-purpose assistant suitable for most use cases.

#### Professional
*"You are a professional virtual assistant..."*

Accurate, well-structured responses with formal tone. For business and professional contexts.

#### Friendly
*"You are a friendly and casual virtual assistant..."*

Warm, approachable, conversational. Uses simple language with positive attitude.

#### Technical Expert
*"You are a technical expert assistant..."*

Detailed technical information with precise terminology. Includes code examples and best practices.

#### Creative
*"You are a creative assistant..."*

Helps with brainstorming, creative writing, and artistic endeavors. Imaginative and expressive.

#### Concise
*"You are a concise virtual assistant..."*

Brief, to-the-point responses. Eliminates unnecessary information.

#### Teacher
*"You are an educational assistant..."*

Explains concepts clearly with examples and analogies. Breaks down complex topics.

#### Custom
Write your own system prompt for complete control over AI behavior.

### Custom System Prompt

When you select "Custom" personality, you can write your own system prompt.

Define how the AI should:
- Respond to questions
- Format answers
- Handle specific topics
- Use tone and language style

:::tip
Editing any preset prompt automatically switches to "Custom" mode. You can use a preset as a starting point and modify it.
:::

## Testing Connection

Click **Test Connection** to verify your LLM configuration:

- ✅ **Success** - Provider is configured correctly
- ❌ **Error** - Check your settings and try again

Common errors:
- **Chrome AI**: Flags not enabled, model not downloaded
- **OpenAI**: Invalid API key, incorrect model name
- **Ollama**: Server not running, model not pulled

## Tips

### For Privacy

- **Chrome AI**: All processing on-device, no data sent to servers
- **Ollama**: Complete control over data, runs locally

## Troubleshooting

### Chrome AI Not Available

- Update Chrome to version 138 or later
- Enable required flags (see above)
- Check device compatibility at `chrome://on-device-internals/`

### OpenAI Connection Failed

- Verify API key is correct (starts with `sk-`)
- Check you have credits in your OpenAI account
- Ensure model name is spelled correctly

### Ollama Connection Failed

- Verify Ollama is running: `ollama serve`
- Check endpoint URL is correct
- Ensure model is pulled: `ollama pull <model-name>`

## Next Steps

- [TTS Settings](./tts-settings.md) - Configure voice output
- [STT Settings](./stt-settings.md) - Configure voice input
- [AI Features](./ai-features.md) - Toggle individual AI capabilities
