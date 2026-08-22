/**
 * AI Provider Configuration
 *
 * Defines available AI providers and their default settings.
 * All settings are editable via the Control Panel Config tab.
 */

const isAndroidMode =
  typeof __ANDROID_MODE__ !== "undefined" && __ANDROID_MODE__;
const isDesktopMode =
  typeof __DESKTOP_MODE__ !== "undefined" && __DESKTOP_MODE__;

/**
 * Android Local AI Server Configuration
 */
const ANDROID_LOCAL_SERVER = {
  baseUrl: "http://127.0.0.1:8765",
};

/**
 * Desktop Local AI Server Configuration
 * Single unified HTTP server (like Android) that proxies to native binaries
 */
const DESKTOP_LOCAL_SERVER = {
  baseUrl: "http://127.0.0.1:11438", // Unified endpoint - Electron handles internal routing
};

/**
 * Available AI Providers
 */
export const AIProviders = {
  ANDROID_LOCAL: "android-local",
  DESKTOP_LOCAL: "desktop-local",
  CHROME_AI: "chrome-ai",
  OPENAI: "openai",
  OLLAMA: "ollama",
};

/**
 * Available TTS Providers
 */
export const TTSProviders = {
  ANDROID_LOCAL: "android-local",
  DESKTOP_LOCAL: "desktop-local",
  KOKORO: "kokoro", // Kokoro-JS local TTS
  OPENAI: "openai",
  OPENAI_COMPATIBLE: "openai-compatible", // Generic OpenAI-compatible TTS API
  GPTSOVITS_REMOTE: "gptsovits-remote", // Remote GPT-SoVITS server (all platforms)
};

/**
 * Available STT (Speech-to-Text) Providers
 */
export const STTProviders = {
  ANDROID_LOCAL: "android-local",
  DESKTOP_LOCAL: "desktop-local",
  CHROME_AI_MULTIMODAL: "chrome-ai-multimodal",
  OPENAI: "openai",
  OPENAI_COMPATIBLE: "openai-compatible",
};

/**
 * GPT-SoVITS Supported Languages
 */
export const GPTSoVITSLanguages = {
  ENGLISH: "en",
  CHINESE: "zh",
  JAPANESE: "ja",
  KOREAN: "ko",
  CANTONESE: "yue",
};

/**
 * OpenAI TTS Voices
 */
export const OpenAIVoices = {
  ALLOY: "alloy",
  ECHO: "echo",
  FABLE: "fable",
  ONYX: "onyx",
  NOVA: "nova",
  SHIMMER: "shimmer",
};

/**
 * Kokoro TTS Voices
 * High-quality neural voices supporting multiple languages
 */
export const KokoroVoices = {
  AF_HEART: "af_heart",
  AF_ALLOY: "af_alloy",
  AF_AOEDE: "af_aoede",
  AF_BELLA: "af_bella",
  AF_JESSICA: "af_jessica",
  AF_KORE: "af_kore",
  AF_NICOLE: "af_nicole",
  AF_NOVA: "af_nova",
  AF_RIVER: "af_river",
  AF_SARAH: "af_sarah",
  AF_SKY: "af_sky",

  AM_ADAM: "am_adam",
  AM_ECHO: "am_echo",
  AM_ERIC: "am_eric",
  AM_FENRIR: "am_fenrir",
  AM_LIAM: "am_liam",
  AM_MICHAEL: "am_michael",
  AM_ONYX: "am_onyx",
  AM_PUCK: "am_puck",
  AM_SANTA: "am_santa",

  BF_ALICE: "bf_alice",
  BF_EMMA: "bf_emma",
  BF_ISABELLA: "bf_isabella",
  BF_LILY: "bf_lily",

  BM_DANIEL: "bm_daniel",
  BM_FABLE: "bm_fable",
  BM_GEORGE: "bm_george",
  BM_LEWIS: "bm_lewis",
};

/**
 * Kokoro Model Quantization Options
 */
export const KokoroQuantization = {
  FP32: "fp32", // ~300MB - Highest quality, slower - WebGPU only
  FP16: "fp16", // ~163MB - Very high quality
  Q8: "q8", // 86MB - Best balance (recommended) - WASM only
  Q4: "q4", // ~154MB - Good quality, fastest
  Q4F16: "q4f16", // ~154MB - Good quality, fastest
};

/**
 * Kokoro Device Backend Options
 */
export const KokoroDevice = {
  AUTO: "auto", // Auto-detect (WebGPU if available, else WASM)
  WEBGPU: "webgpu", // GPU acceleration (2-10x faster)
  WASM: "wasm", // CPU fallback (universal compatibility)
};

/**
 * Chrome AI Required Flags
 * User must enable these at chrome://flags for Chrome AI to work
 */
export const ChromeAIFlags = {
  OPTIMIZATION_GUIDE: {
    flag: "optimization-guide-on-device-model",
    value: "Enabled BypassPerfRequirement",
    url: "chrome://flags/#optimization-guide-on-device-model",
    description: "Enable on-device AI model",
  },
  PROMPT_API: {
    flag: "prompt-api-for-gemini-nano",
    value: "Enabled",
    url: "chrome://flags/#prompt-api-for-gemini-nano",
    description: "Enable Prompt API (LanguageModel)",
  },
  MULTIMODAL_INPUT: {
    flag: "multimodal-input",
    value: "Enabled",
    url: "chrome://flags/#multimodal-input",
    description: "Enable multimodal input (required for audio/image)",
  },
};

/**
 * Chrome AI Availability States
 */
export const ChromeAIAvailability = {
  UNAVAILABLE: "no", // Not supported on this device (actual API value)
  DOWNLOADABLE: "after-download", // Can be downloaded (actual API value)
  DOWNLOADING: "downloading", // Currently downloading (not in spec but used)
  READILY: "readily", // Ready to use immediately
  AVAILABLE: "available", // Model available (may need download trigger)
};

/**
 * Chrome AI Supported Output Languages
 */
export const ChromeAILanguages = {
  ENGLISH: "en",
  SPANISH: "es",
  JAPANESE: "ja",
};

/**
 * Common Translation Languages
 * Supported by most translation services
 */
export const TranslationLanguages = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "ja", name: "Japanese" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "tr", name: "Turkish" },
  { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" },
  { code: "id", name: "Indonesian" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "no", name: "Norwegian" },
  { code: "el", name: "Greek" },
  { code: "he", name: "Hebrew" },
  { code: "cs", name: "Czech" },
  { code: "ro", name: "Romanian" },
  { code: "hu", name: "Hungarian" },
];

export type AIRemoteProfileProvider =
  | "openai"
  | "ollama"
  | "android-local"
  | "desktop-local";

export interface AIRemoteProviderProfile {
  id: string;
  name: string;
  provider: AIRemoteProfileProvider;
  endpoint?: string;
  apiKey?: string;
  model: string;
  customModelsPath?: string | null;
  shareOnNetwork?: boolean;
  serverPort?: number;
  backend?: string;
  temperature?: number;
  maxTokens?: number;
  contextSize?: number;
  gpuLayers?: number;
  threads?: number;
  enableImageSupport?: boolean;
  enableAudioSupport?: boolean;
}

export interface AIRoutingModelConfig {
  useSameAsMain?: boolean;
  modelName?: string;
  selectedModel?: string;
  profileId?: string;
}

export interface AIRoutingConfig {
  enabled?: boolean;
  visionModel?: AIRoutingModelConfig;
  routerModel?: AIRoutingModelConfig;
}

export interface TTSRemoteProviderProfile {
  id: string;
  name: string;
  provider: "openai" | "openai-compatible" | "gptsovits-remote";
  endpoint?: string;
  apiKey?: string;
  model: string;
  voice?: string;
  speed?: number;
}

export interface STTRemoteProviderProfile {
  id: string;
  name: string;
  provider: "openai" | "openai-compatible";
  endpoint?: string;
  apiKey?: string;
  model: string;
  language?: string;
  temperature?: number;
}

/**
 * Default AI Configuration
 */
export const DefaultAIConfig = {
  provider: isAndroidMode
    ? AIProviders.ANDROID_LOCAL
    : isDesktopMode
      ? AIProviders.DESKTOP_LOCAL
      : AIProviders.CHROME_AI,
  remoteProfiles: [] as AIRemoteProviderProfile[],

  chromeAi: {
    temperature: 1.0,
    topK: 3,
    outputLanguage: "en", // Supported: en, es, ja
    enableImageSupport: true, // Enable multi-modal image support
    enableAudioSupport: true, // Enable multi-modal audio support
    systemPromptType: "default", // Personality type from PromptConfig.systemPrompts
    systemPrompt: "", // Custom system prompt (only used when systemPromptType is 'custom')
    selectedSystemPromptProfileId: "default",
    systemPromptProfiles: [],
  },

  openai: {
    apiKey: "",
    model: "gpt-4-turbo-preview",
    temperature: 0.7,
    maxTokens: 2000,
    enableImageSupport: true, // Enable multi-modal image support
    enableAudioSupport: true, // Enable multi-modal audio support
    systemPromptType: "default", // Personality type from PromptConfig.systemPrompts
    systemPrompt: "", // Custom system prompt (only used when systemPromptType is 'custom')
    selectedSystemPromptProfileId: "default",
    systemPromptProfiles: [],
    routing: {
      enabled: false,
      visionModel: {
        useSameAsMain: true,
        modelName: "",
        profileId: "",
      },
      routerModel: {
        useSameAsMain: true,
        modelName: "",
        profileId: "",
      },
    } as AIRoutingConfig,
  },

  ollama: {
    endpoint: "http://localhost:11434",
    model: "llama2",
    temperature: 0.7,
    maxTokens: 2000,
    enableImageSupport: true, // Enable multi-modal image support
    enableAudioSupport: true, // Enable multi-modal audio support
    systemPromptType: "default", // Personality type from PromptConfig.systemPrompts
    systemPrompt: "", // Custom system prompt (only used when systemPromptType is 'custom')
    selectedSystemPromptProfileId: "default",
    systemPromptProfiles: [],
    routing: {
      enabled: false,
      visionModel: {
        useSameAsMain: true,
        modelName: "",
        profileId: "",
      },
      routerModel: {
        useSameAsMain: true,
        modelName: "",
        profileId: "",
      },
    } as AIRoutingConfig,
  },

  "android-local": {
    endpoint: ANDROID_LOCAL_SERVER.baseUrl,
    model: "qwen3-local",
    temperature: 0.7,
    maxTokens: 2048,
    systemPromptType: "default",
    systemPrompt: "",
    selectedSystemPromptProfileId: "default",
    systemPromptProfiles: [],
    routing: {
      enabled: false,
      visionModel: {
        useSameAsMain: true,
        selectedModel: "",
        profileId: "",
      },
      routerModel: {
        useSameAsMain: true,
        selectedModel: "",
        profileId: "",
      },
    } as AIRoutingConfig,
  },

  "desktop-local": {
    endpoint: DESKTOP_LOCAL_SERVER.baseUrl,
    model: "qwen3:0.6b", // Default model name
    customModelsPath: null,
    shareOnNetwork: false,
    serverPort: 11438,
    backend: "auto",
    temperature: 0.7,
    maxTokens: 2048,
    contextSize: 4096,
    gpuLayers: 99, // Use GPU acceleration
    threads: 4,
    systemPromptType: "default",
    systemPrompt: "",
    selectedSystemPromptProfileId: "default",
    systemPromptProfiles: [],
    routing: {
      enabled: false,
      visionModel: {
        useSameAsMain: true,
        selectedModel: "",
        profileId: "",
      },
      routerModel: {
        useSameAsMain: true,
        selectedModel: "",
        profileId: "",
      },
    } as AIRoutingConfig,
  },

  systemPrompt: "You are a helpful virtual assistant. Be concise and friendly.",

  aiFeatures: {
    translator: {
      enabled: true,
      defaultTargetLanguage: "en",
    },
    languageDetector: {
      enabled: true,
    },
    summarizer: {
      enabled: true,
      defaultType: "tldr",
      defaultFormat: "plain-text",
      defaultLength: "medium",
    },
    rewriter: {
      enabled: true,
      defaultTone: "as-is",
      defaultFormat: "as-is",
      defaultLength: "as-is",
    },
    writer: {
      enabled: true,
      defaultTone: "neutral",
      defaultFormat: "plain-text",
      defaultLength: "medium",
    },
  },
};

/**
 * Default TTS Configuration
 *
 * Text-to-Speech settings for voice generation.
 * Similar pattern to AI config for consistency.
 */
export const DefaultTTSConfig = {
  enabled: false,
  accurateLipSync: true,
  legacyLipSync: false,
  remoteProfiles: [] as TTSRemoteProviderProfile[],

  provider: isAndroidMode
    ? TTSProviders.ANDROID_LOCAL
    : isDesktopMode
      ? TTSProviders.DESKTOP_LOCAL
      : TTSProviders.KOKORO,

  kokoro: {
    modelId: "onnx-community/Kokoro-82M-v1.0-ONNX",
    voice: KokoroVoices.AF_HEART,
    speed: 1.0,
    device: KokoroDevice.AUTO,
    keepModelLoaded: true,
  },

  openai: {
    apiKey: "",
    model: "tts-1",
    voice: OpenAIVoices.NOVA,
    speed: 1.0,
  },

  "openai-compatible": {
    endpoint: "http://localhost:8000",
    apiKey: "",
    model: "tts",
    voice: "default",
    speed: 1.0,
  },

  "android-local": {
    endpoint: ANDROID_LOCAL_SERVER.baseUrl,
    model: "vits-local",
    voice: "default",
    speakerId: 0,
    speed: 1.0,
  },

  "desktop-local": {
    endpoint: DESKTOP_LOCAL_SERVER.baseUrl,
    model: "gpt-sovits",
    pytorchBackend: "auto", // auto | cpu | cuda | rocm | sycl | metal
    // Voice cloning reference
    referenceVoiceId: null, // Voice ID from IndexedDB
    referenceAudio: null, // Path to reference audio file
    referenceText: "", // Text spoken in reference audio
    referenceLanguage: GPTSoVITSLanguages.ENGLISH,
    // TTS parameters
    speed: 1.0,
    topK: 15,
    topP: 0.7,
    temperature: 0.7,
    // Training config
    trained: false,
    checkpointPath: null,
  },

  "gptsovits-remote": {
    endpoint: "http://localhost:11438", // Remote GPT-SoVITS server URL
    model: "gpt-sovits",
    // Voice cloning reference (same as desktop-local)
    referenceVoiceId: null,
    referenceText: "",
    referenceLanguage: GPTSoVITSLanguages.ENGLISH,
    // TTS parameters
    speed: 1.0,
    topK: 15,
    topP: 0.7,
    temperature: 0.7,
  },

  chunkSize: 500,
  minChunkSize: 100,
};

/**
 * Default STT (Speech-to-Text) Configuration
 */
export const DefaultSTTConfig = {
  enabled: false,
  remoteProfiles: [] as STTRemoteProviderProfile[],
  provider: isAndroidMode
    ? STTProviders.ANDROID_LOCAL
    : isDesktopMode
      ? STTProviders.DESKTOP_LOCAL
      : STTProviders.CHROME_AI_MULTIMODAL,

  "chrome-ai-multimodal": {
    temperature: 0.1,
    topK: 3,
    outputLanguage: "en", // Supported: en, es, ja
  },

  openai: {
    apiKey: "",
    model: "whisper-1",
    language: "en",
    temperature: 0,
  },

  "openai-compatible": {
    endpoint: "http://localhost:8000",
    apiKey: "",
    model: "whisper",
    language: "auto",
    temperature: 0,
  },

  "android-local": {
    endpoint: ANDROID_LOCAL_SERVER.baseUrl,
    model: "whisper-local",
    language: "en",
    // Compute backend for on-device whisper: auto (benchmark cpu/nnapi),
    // cpu, nnapi, or qnn (experimental, SenseVoice on Snapdragon NPU)
    provider: "auto",
  },

  "desktop-local": {
    endpoint: DESKTOP_LOCAL_SERVER.baseUrl,
    model: "tiny",
    language: "auto",
    threads: 4,
  },

  recordingFormat: "webm",
  maxRecordingDuration: 60,
  audioDeviceSwitchDelay: 300,
};

export type AIProvider = (typeof AIProviders)[keyof typeof AIProviders];
export type TTSProvider = (typeof TTSProviders)[keyof typeof TTSProviders];
export type STTProvider = (typeof STTProviders)[keyof typeof STTProviders];

export type AIConfig = typeof DefaultAIConfig;
export type TTSConfig = typeof DefaultTTSConfig;
export type STTConfig = typeof DefaultSTTConfig;

/**
 * Validate AI configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateAIConfig(
  config: Partial<AIConfig> & { provider?: AIProvider | string },
) {
  const errors = [];

  if (!config.provider) {
    errors.push("Provider not selected");
  }

  if (config.provider === AIProviders.CHROME_AI) {
    if (!("LanguageModel" in self)) {
      errors.push(
        "Chrome AI not available. Chrome 138+ required with flags enabled.",
      );
    }

    if (config.chromeAi?.temperature !== undefined) {
      if (config.chromeAi.temperature < 0 || config.chromeAi.temperature > 2) {
        errors.push("Temperature must be between 0 and 2");
      }
    }

    if (config.chromeAi?.topK !== undefined) {
      if (config.chromeAi.topK < 1 || config.chromeAi.topK > 128) {
        errors.push("TopK must be between 1 and 128");
      }
    }
  }

  if (config.provider === AIProviders.OPENAI) {
    if (!config.openai?.apiKey || config.openai.apiKey.trim() === "") {
      errors.push("OpenAI API Key is required");
    }
    if (!config.openai?.model || config.openai.model.trim() === "") {
      errors.push("OpenAI Model is required");
    }
  }

  if (config.provider === AIProviders.OLLAMA) {
    if (!config.ollama?.endpoint || config.ollama.endpoint.trim() === "") {
      errors.push("Ollama Endpoint is required");
    }
    if (!config.ollama?.model || config.ollama.model.trim() === "") {
      errors.push("Ollama Model is required");
    }
  }

  if (config.provider === AIProviders.ANDROID_LOCAL) {
    if (
      config["android-local"]?.endpoint &&
      config["android-local"].endpoint.trim() === ""
    ) {
      errors.push("Android Local Endpoint cannot be empty");
    }
  }

  if (config.provider === AIProviders.DESKTOP_LOCAL) {
    if (
      config["desktop-local"]?.endpoint &&
      config["desktop-local"].endpoint.trim() === ""
    ) {
      errors.push("Desktop Local Endpoint cannot be empty");
    }
    if (config["desktop-local"]?.serverPort !== undefined) {
      const port = Number(config["desktop-local"].serverPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push(
          "Desktop Local Shared Server Port must be between 1 and 65535",
        );
      }
    }
  }

  if (config.aiFeatures) {
    const validTypes = ["tldr", "key-points", "teaser", "headline"];
    const validFormats = ["plain-text", "markdown"];
    const validLengths = ["short", "medium", "long"];

    if (config.aiFeatures.summarizer) {
      const { defaultType, defaultFormat, defaultLength } =
        config.aiFeatures.summarizer;

      if (defaultType && !validTypes.includes(defaultType)) {
        errors.push(`Invalid summarizer type: ${defaultType}`);
      }
      if (defaultFormat && !validFormats.includes(defaultFormat)) {
        errors.push(`Invalid summarizer format: ${defaultFormat}`);
      }
      if (defaultLength && !validLengths.includes(defaultLength)) {
        errors.push(`Invalid summarizer length: ${defaultLength}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate TTS configuration
 * @param {Object} config - TTS configuration to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateTTSConfig(
  config: Partial<TTSConfig> & { provider?: TTSProvider | string },
) {
  const errors = [];

  if (!config.enabled) {
    return { valid: true, errors: [] };
  }

  if (!config.provider) {
    errors.push("TTS Provider not selected");
  }

  if (config.provider === TTSProviders.KOKORO) {
    if (!config.kokoro) {
      return { valid: true, errors: [] };
    }
    if (config.kokoro.modelId && config.kokoro.modelId.trim() === "") {
      errors.push("Kokoro Model ID cannot be empty");
    }
    if (config.kokoro?.speed !== undefined) {
      if (config.kokoro.speed < 0.5 || config.kokoro.speed > 2.0) {
        errors.push("Kokoro speed must be between 0.5 and 2.0");
      }
    }
  }

  if (config.provider === TTSProviders.OPENAI) {
    if (!config.openai?.apiKey || config.openai.apiKey.trim() === "") {
      errors.push("OpenAI TTS API Key is required");
    }
    if (!config.openai?.model || config.openai.model.trim() === "") {
      errors.push("OpenAI TTS Model is required");
    }
    if (!config.openai?.voice) {
      errors.push("OpenAI TTS Voice is required");
    }
  }

  if (config.provider === TTSProviders.OPENAI_COMPATIBLE) {
    if (
      !config["openai-compatible"]?.endpoint ||
      config["openai-compatible"].endpoint.trim() === ""
    ) {
      errors.push("Custom TTS Endpoint is required");
    }
    if (
      !config["openai-compatible"]?.model ||
      config["openai-compatible"].model.trim() === ""
    ) {
      errors.push("Custom TTS Model is required");
    }
  }

  if (config.provider === TTSProviders.ANDROID_LOCAL) {
    if (
      config["android-local"]?.endpoint &&
      config["android-local"].endpoint.trim() === ""
    ) {
      errors.push("Android Local TTS Endpoint cannot be empty");
    }
  }

  if (config.provider === TTSProviders.DESKTOP_LOCAL) {
    if (
      config["desktop-local"]?.endpoint &&
      config["desktop-local"].endpoint.trim() === ""
    ) {
      errors.push("Desktop Local TTS Endpoint cannot be empty");
    }
    if (
      !config["desktop-local"]?.referenceText &&
      config["desktop-local"]?.trained
    ) {
      errors.push("GPT-SoVITS reference text is required for voice cloning");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate STT configuration
 * @param {Object} config - STT configuration to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateSTTConfig(
  config: Partial<STTConfig> & { provider?: STTProvider | string },
) {
  const errors = [];

  if (!config.enabled) {
    return { valid: true, errors: [] };
  }

  if (!config.provider) {
    errors.push("STT Provider not selected");
  }

  if (config.provider === STTProviders.CHROME_AI_MULTIMODAL) {
    if (!("LanguageModel" in self)) {
      errors.push(
        "Chrome AI not available. Chrome 138+ required with flags enabled.",
      );
    }

    if (config["chrome-ai-multimodal"]?.temperature !== undefined) {
      if (
        config["chrome-ai-multimodal"].temperature < 0 ||
        config["chrome-ai-multimodal"].temperature > 2
      ) {
        errors.push("Temperature must be between 0 and 2");
      }
    }

    if (config["chrome-ai-multimodal"]?.topK !== undefined) {
      if (
        config["chrome-ai-multimodal"].topK < 1 ||
        config["chrome-ai-multimodal"].topK > 128
      ) {
        errors.push("TopK must be between 1 and 128");
      }
    }
  }

  if (config.provider === STTProviders.OPENAI) {
    if (!config.openai?.apiKey || config.openai.apiKey.trim() === "") {
      errors.push("OpenAI STT API Key is required");
    }
    if (!config.openai?.model || config.openai.model.trim() === "") {
      errors.push("OpenAI STT Model is required");
    }
  }

  if (config.provider === STTProviders.OPENAI_COMPATIBLE) {
    if (
      !config["openai-compatible"]?.endpoint ||
      config["openai-compatible"].endpoint.trim() === ""
    ) {
      errors.push("Custom STT Endpoint is required");
    }
    if (
      !config["openai-compatible"]?.model ||
      config["openai-compatible"].model.trim() === ""
    ) {
      errors.push("Custom STT Model is required");
    }
  }

  if (config.provider === STTProviders.ANDROID_LOCAL) {
    if (
      config["android-local"]?.endpoint &&
      config["android-local"].endpoint.trim() === ""
    ) {
      errors.push("Android Local STT Endpoint cannot be empty");
    }
  }

  if (config.provider === STTProviders.DESKTOP_LOCAL) {
    if (
      config["desktop-local"]?.endpoint &&
      config["desktop-local"].endpoint.trim() === ""
    ) {
      errors.push("Desktop Local STT Endpoint cannot be empty");
    }
    if (
      !config["desktop-local"]?.model ||
      config["desktop-local"].model.trim() === ""
    ) {
      errors.push("Desktop Local Whisper model path is required");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getProviderDisplayName(provider: string): string {
  switch (provider) {
    case AIProviders.ANDROID_LOCAL:
      return "Android Local LLM";
    case AIProviders.DESKTOP_LOCAL:
      return "Desktop Local LLM";
    case AIProviders.OPENAI:
      return "OpenAI";
    case AIProviders.OLLAMA:
      return "OpenAI-Compatible / Ollama";
    default:
      return provider;
  }
}

export default {
  AIProviders,
  TTSProviders,
  STTProviders,
  ChromeAIFlags,
  ChromeAIAvailability,
  ChromeAILanguages,
  TranslationLanguages,
  OpenAIVoices,
  KokoroVoices,
  KokoroQuantization,
  KokoroDevice,
  GPTSoVITSLanguages,
  DefaultAIConfig,
  DefaultTTSConfig,
  DefaultSTTConfig,
  validateAIConfig,
  validateTTSConfig,
  validateSTTConfig,
  getProviderDisplayName,
};
