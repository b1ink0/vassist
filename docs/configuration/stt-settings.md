---
sidebar_position: 5
---

# STT Settings

Configure Speech-to-Text (STT) to convert spoken audio into text for voice input. Choose between Chrome's built-in AI, OpenAI Whisper, or custom OpenAI-compatible endpoints.

## Enable Speech-to-Text

Toggle to enable or disable STT globally:

- **Enabled** - Voice input available in chat
- **Disabled** - Text-only input

## Provider Selection

VAssist supports three STT providers:

### Chrome AI Multimodal

**On-device audio transcription using Chrome's AI**

- ✅ **Free** - No API costs
- ✅ **Private** - All processing happens locally
- ✅ **Offline** - Works without internet (after download)
- ✅ **No API Key** - No account required
- ⚠️ **Requires** Chrome 138+ with specific flags enabled
- ⚠️ **Limited Languages** - English, Spanish, Japanese only

**Best for**: Privacy-conscious users, offline use, zero cost

### OpenAI (Whisper)

**Cloud-based speech recognition using OpenAI's Whisper API**

- ✅ **High Accuracy** - Professional-grade transcription
- ✅ **Multi-Language** - 50+ languages supported
- ✅ **Reliable** - Production-ready service
- ⚠️ **Paid** - Requires API key and usage billing

**Best for**: Multi-language support, production use, high accuracy needs

### OpenAI-Compatible

**Custom STT endpoint compatible with OpenAI API**

- ✅ **Flexible** - Use any OpenAI-compatible STT service
- ✅ **Self-Hosted** - Run your own Whisper server
- ✅ **Cost Control** - No external API fees
- ✅ **Privacy** - Data stays on your infrastructure

**Best for**: Custom deployments, self-hosted solutions, privacy

## Chrome AI Multimodal Configuration

### Status & Availability

Check if Chrome AI is available on your device:

- **Readily Available** - Ready to use immediately
- **Downloadable** - Click "Start Model Download" button
- **Downloading** - Model downloading in progress
- **Unavailable** - Not supported on this device

For real-time download progress, visit `chrome://on-device-internals/`

Click **Refresh Status** to recheck availability at any time.

### Output Language

**Options**: English (en), Spanish (es), Japanese (ja)  
**Default**: English (en)

Language for transcription output. Chrome AI currently supports only these three languages.

:::info
Chrome AI uses the same model as the LLM provider. If you already have it downloaded for LLM, you don't need to download again.
:::

### Required Chrome Flags

Chrome AI STT requires these flags to be enabled:

1. **optimization-guide-on-device-model**
   - Set to: `Enabled BypassPerfRequirement`

2. **prompt-api-for-gemini-nano-multimodal-input**
   - Set to: `Enabled`

After enabling flags:
1. Restart Chrome
2. Visit `chrome://components`
3. Find "Optimization Guide On Device Model"
4. Click "Check for update" to download the AI model

:::tip
These are the same flags required for Chrome AI LLM provider. If you've already enabled them, you're good to go!
:::

## OpenAI (Whisper) Configuration

### API Key

**Required**

Your OpenAI API key from [platform.openai.com](https://platform.openai.com/api-keys)

Format: `sk-...`

:::tip
Keep your API key secure. VAssist stores it locally in browser storage.
:::

### Model

**Default**: `whisper-1`

The OpenAI Whisper model to use for transcription.

Currently, OpenAI only offers `whisper-1` model. Leave as default unless OpenAI releases new models.

### Features

OpenAI Whisper provides:

- **Multi-Language Support** - 50+ languages automatically detected
- **High Accuracy** - State-of-the-art speech recognition
- **Punctuation** - Automatic punctuation in transcripts
- **Timestamps** - Optional word-level timestamps

See [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text) for details.

## OpenAI-Compatible Configuration

For self-hosted or custom STT services that implement the OpenAI API format.

### Endpoint URL

**Required**

Base URL of your STT service. VAssist will append `/v1/audio/transcriptions` automatically.

### API Key (Optional)

Leave empty if your endpoint doesn't require authentication.

Enter the API key if your service requires it for access control.

### Model

**Default**: `whisper`

Model identifier your service expects. Depends on your STT implementation.

Consult your STT provider's documentation for supported models.

## Testing STT

Click **Test Recording (3s)** to verify your configuration:

1. **Grant Microphone Permission** - Browser will request access
2. **Speak for 3 seconds** - Recording starts automatically
3. **Wait for Transcription** - Processing may take a few seconds
4. **Check Result** - Transcribed text appears in alert/console

**Test requirements**:
- STT must be enabled
- Provider must be configured correctly
- Microphone access granted
- For Chrome AI: Model must be downloaded
- For OpenAI: Valid API key and credits
- For OpenAI-Compatible: Endpoint must be reachable

:::info
The test records for exactly 3 seconds to quickly verify the setup. Real voice input in chat can record for up to 60 seconds.
:::

## Tips

### For Privacy

- **Chrome AI**: 100% on-device, no data sent anywhere
- **OpenAI-Compatible**: Self-hosted option keeps data local

## Troubleshooting

### Chrome AI Not Available

- Update Chrome to version 138 or later
- Enable required flags (see above)
- Check device compatibility at `chrome://on-device-internals/`
- Restart Chrome after enabling flags

### Microphone Not Working

- Check browser permissions (allow microphone access)
- Verify microphone is working in system settings
- Try different browser/profile
- Check if another app is using the microphone

### No Transcription / Empty Result

- **Chrome AI**: 
  - Verify model is downloaded (check status)
  - Try switching to English language
  - Speak louder/clearer
- **OpenAI**: 
  - Verify API key is correct
  - Check you have credits in OpenAI account
  - Ensure audio is audible
- **OpenAI-Compatible**:
  - Verify endpoint is reachable
  - Check server logs for errors
  - Ensure model name is correct

### Poor Transcription Quality

- Use better microphone (not built-in laptop mic)
- Reduce background noise
- Speak clearly and at normal pace
- Check microphone input level in system settings

## Next Steps

- [AI Features](./ai-features.md) - Toggle individual AI capabilities
- [LLM Settings](./llm-settings.md) - Configure AI provider
- [TTS Settings](./tts-settings.md) - Configure voice output
