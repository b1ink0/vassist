---
sidebar_position: 4
---

# TTS Settings

Configure Text-to-Speech (TTS) to have the AI speak responses aloud. Choose between local Kokoro TTS, OpenAI's cloud service, or custom OpenAI-compatible endpoints.

## Enable Text-to-Speech

Toggle to enable or disable TTS globally:

- **Enabled** - AI can speak responses in chat
- **Disabled** - Text-only mode (default)

When disabled, all other TTS settings are hidden.

## Provider Selection

VAssist supports multiple TTS providers:

### Kokoro TTS (Local)

**High-quality neural TTS running locally in your browser**

- ✅ **Free** - No API costs
- ✅ **Private** - All processing happens locally
- ✅ **Offline** - Works without internet (after download)
- ✅ **High Quality** - Neural voices with natural speech
- ✅ **Multi-Voice** - 30+ voices across accents
- ⚠️ **Download Required** - ~86MB (WASM) or ~350MB (WebGPU)

**Best for**: Privacy, offline use, zero cost, natural voices

### OpenAI TTS

**Cloud-based TTS using OpenAI's API**

- ✅ **High Quality** - Professional voice synthesis
- ✅ **Reliable** - Production-ready service
- ✅ **HD Option** - Premium quality with tts-1-hd
- ⚠️ **Paid** - Requires API key and usage billing

**Best for**: Production use, HD quality needs

### OpenAI-Compatible

**Custom TTS endpoint compatible with OpenAI API**

- ✅ **Flexible** - Use any OpenAI-compatible TTS service
- ✅ **Self-Hosted** - Run your own TTS server
- ✅ **Cost Control** - No external API fees

**Best for**: Custom deployments, self-hosted solutions

## Kokoro TTS Configuration

### Voice Selection

Choose from **30+ neural voices** organized by accent and gender:

#### American English - Female
- Heart, Alloy, Aoede, Bella, Jessica, Kore, Nicole, Nova, River, Sarah, Sky

#### American English - Male
- Adam, Echo, Eric, Fenrir, Liam, Michael, Onyx, Puck, Santa

#### British English - Female
- Alice, Emma, Isabella, Lily

#### British English - Male
- Daniel, Fable, George, Lewis

Each voice has a unique personality and speaking style. Try different voices to find your favorite!

### Speech Speed

**Range**: 0.5x - 2.0x  
**Default**: 1.0x (Normal)

Adjust how fast or slow the voice speaks:

- **0.5x** - Very slow (good for learning)
- **1.0x** - Normal speaking pace
- **1.5x** - Faster (saves time)
- **2.0x** - Very fast (efficiency)

### Device Backend

**Options**: Auto (Recommended), WebGPU, WASM

Controls how the TTS model runs:

#### Auto (Recommended)

Automatically chooses the best backend for your device:

- WebGPU if graphics card supports it (faster)
- WASM fallback for universal compatibility

**Best for**: Most users

#### WebGPU

GPU-accelerated processing:

- ✅ **2-10x faster** than WASM
- ✅ **Higher quality** - fp32 precision
- ⚠️ **Larger download** - ~350MB
- ⚠️ **Requires** Compatible graphics card

**Best for**: Devices with dedicated GPU, when speed matters

#### WASM

CPU-based processing:

- ✅ **Universal compatibility** - Works on any device
- ✅ **Smaller download** - ~86MB (q8 quantization)
- ⚠️ **Slower** - Significantly slower than WebGPU

**Best for**: Older devices, limited storage, compatibility

:::warning Performance Note
If the model or page lags with WebGPU, switch to WASM for better stability. WASM is slower but more stable. For optimal performance, consider using OpenAI or OpenAI-Compatible providers instead.
:::

### Advanced Settings

#### Model ID

**Default**: `onnx-community/Kokoro-82M-v1.0-ONNX`

HuggingFace model identifier. Leave empty to use default.

#### Keep Model Loaded

**Default**: Enabled

Periodically generates silent audio to keep the model in memory:

- ✅ Prevents lag on first TTS use
- ✅ Faster response times
- ⚠️ Uses slightly more resources

Disable if you prefer lower resource usage and don't mind initial lag.

### Initialization

Before using Kokoro TTS, you must download the model:

1. **Configure voice and settings** (optional - can use defaults)
2. **Click "Initialize Model"** - Downloads the model to browser cache
3. **Wait for download** - Progress bar shows download status
4. **Model Ready** - Button shows checkmark when complete

**Download sizes**:
- WASM: ~86MB (q8 quantized)
- WebGPU: ~350MB (fp32 precision)
- Auto: Chooses based on your device

This download happens **only once**. The model is saved in browser cache for offline use.

### Cache Management

After initialization, you can manage the model cache:

#### Check Size

Click **Check Size** to see current cache usage (in MB).

#### Clear Cache

Click **Clear Cache** to remove the downloaded model:

- Frees up storage space (~86-350MB)
- Requires re-download before next use

:::warning
Clearing cache will delete the model. You'll need to re-download it (~86-350MB) to use Kokoro TTS again.
:::

## OpenAI TTS Configuration

### API Key

Your OpenAI API key from [platform.openai.com](https://platform.openai.com/api-keys)

Format: `sk-...`

:::tip
Keep your API key secure. VAssist stores it locally in browser storage.
:::

### Model

Choose the OpenAI TTS model:

#### tts-1 (Standard)

- Standard quality voices
- Faster generation
- Lower cost
- Good for most use cases

#### tts-1-hd (HD)

- Premium quality voices
- More natural-sounding
- Higher cost
- Best audio fidelity

### Voice

Choose from **6 OpenAI voices**:

- **Alloy** - Neutral, balanced
- **Echo** - Warm, smooth
- **Fable** - Expressive, friendly
- **Onyx** - Deep, authoritative
- **Nova** - Bright, energetic
- **Shimmer** - Soft, gentle

Each voice has a distinct character and tone. Preview voices on [OpenAI's TTS page](https://platform.openai.com/docs/guides/text-to-speech).

## OpenAI-Compatible Configuration

For self-hosted or custom TTS services that implement the OpenAI API format.

### Endpoint URL

**Default**: `http://localhost:8000`

Base URL of your TTS service. VAssist will append `/v1/audio/speech` automatically.

### API Key (Optional)

Leave empty if your endpoint doesn't require authentication.

Enter the API key if your service requires it.

### Model

**Default**: `tts`

Model identifier your service expects. Depends on your TTS implementation.

### Voice

**Default**: `default`

Voice identifier your service supports. Consult your TTS provider's documentation.

## Testing TTS

Click **Test TTS** to verify your configuration:

- ✅ **Success** - You should hear a test phrase
- ❌ **Error** - Check settings and try again

**Test requirements**:
- TTS must be enabled
- Provider must be configured correctly
- For Kokoro: Model must be initialized
- For OpenAI: Valid API key and credits
- For OpenAI-Compatible: Endpoint must be reachable

## Troubleshooting

### Kokoro: Model Won't Download

- Check browser supports Cache API and WASM/WebGPU
- Try switching device backend (Auto → WASM)
- Clear browser cache and retry
- Check internet connection
- Look for errors in browser console

### Kokoro: Laggy/Slow Performance

- Switch from WebGPU to WASM backend
- Reduce speech speed to 0.8x-1.0x
- Disable "Keep Model Loaded"
- Consider using OpenAI or custom endpoint instead

### OpenAI: Connection Failed

- Verify API key is correct (starts with `sk-`)
- Check you have credits in OpenAI account
- Ensure model name is correct (tts-1 or tts-1-hd)
- Check internet connection

### OpenAI-Compatible: Connection Failed

- Verify endpoint URL is correct and reachable
- Check service is running
- Ensure model and voice names match server's expectations
- Test endpoint directly (curl or Postman)

### No Audio Playing

- Check browser isn't muted
- Verify system volume is up
- Check browser permissions for audio
- Try different voice/provider
- Look for errors in browser console

## Next Steps

- [STT Settings](./stt-settings.md) - Configure voice input
- [LLM Settings](./llm-settings.md) - Configure AI provider
- [AI Features](./ai-features.md) - Toggle individual features
