/**
 * AI Provider Configuration
 * 
 * Defines available AI providers and their default settings.
 * All settings are editable via the Control Panel Config tab.
 */

/**
 * Available AI Providers
 */
export const AIProviders = {
  CHROME_AI: 'chrome-ai',
  OPENAI: 'openai',
  OLLAMA: 'ollama',
};

/**
 * Available TTS Providers
 */
export const TTSProviders = {
  KOKORO: 'kokoro', // Kokoro-JS local TTS
  OPENAI: 'openai',
  OPENAI_COMPATIBLE: 'openai-compatible', // Generic OpenAI-compatible TTS API
};

/**
 * Available STT (Speech-to-Text) Providers
 */
export const STTProviders = {
  CHROME_AI_MULTIMODAL: 'chrome-ai-multimodal',
  OPENAI: 'openai',
  OPENAI_COMPATIBLE: 'openai-compatible',
};

/**
 * OpenAI TTS Voices
 */
export const OpenAIVoices = {
  ALLOY: 'alloy',
  ECHO: 'echo',
  FABLE: 'fable',
  ONYX: 'onyx',
  NOVA: 'nova',
  SHIMMER: 'shimmer',
};

/**
 * Kokoro TTS Voices
 * High-quality neural voices supporting multiple languages
 */
export const KokoroVoices = {
  // American English - Female
  AF_HEART: 'af_heart',
  AF_ALLOY: 'af_alloy',
  AF_AOEDE: 'af_aoede',
  AF_BELLA: 'af_bella',
  AF_JESSICA: 'af_jessica',
  AF_KORE: 'af_kore',
  AF_NICOLE: 'af_nicole',
  AF_NOVA: 'af_nova',
  AF_RIVER: 'af_river',
  AF_SARAH: 'af_sarah',
  AF_SKY: 'af_sky',
  
  // American English - Male
  AM_ADAM: 'am_adam',
  AM_ECHO: 'am_echo',
  AM_ERIC: 'am_eric',
  AM_FENRIR: 'am_fenrir',
  AM_LIAM: 'am_liam',
  AM_MICHAEL: 'am_michael',
  AM_ONYX: 'am_onyx',
  AM_PUCK: 'am_puck',
  AM_SANTA: 'am_santa',
  
  // British English - Female
  BF_ALICE: 'bf_alice',
  BF_EMMA: 'bf_emma',
  BF_ISABELLA: 'bf_isabella',
  BF_LILY: 'bf_lily',
  
  // British English - Male
  BM_DANIEL: 'bm_daniel',
  BM_FABLE: 'bm_fable',
  BM_GEORGE: 'bm_george',
  BM_LEWIS: 'bm_lewis',
};

/**
 * Kokoro Model Quantization Options
 */
export const KokoroQuantization = {
  FP32: 'fp32',   // ~300MB - Highest quality, slower - WebGPU only
  FP16: 'fp16',   // ~163MB - Very high quality
  Q8: 'q8',       // 86MB - Best balance (recommended) - WASM only
  Q4: 'q4',       // ~154MB - Good quality, fastest
  Q4F16: 'q4f16', // ~154MB - Good quality, fastest
};

/**
 * Kokoro Device Backend Options
 */
export const KokoroDevice = {
  AUTO: 'auto',     // Auto-detect (WebGPU if available, else WASM)
  WEBGPU: 'webgpu', // GPU acceleration (2-10x faster)
  WASM: 'wasm',     // CPU fallback (universal compatibility)
};

/**
 * Chrome AI Required Flags
 * User must enable these at chrome://flags for Chrome AI to work
 */
export const ChromeAIFlags = {
  OPTIMIZATION_GUIDE: {
    flag: 'optimization-guide-on-device-model',
    value: 'Enabled BypassPerfRequirement',
    url: 'chrome://flags/#optimization-guide-on-device-model',
    description: 'Enable on-device AI model'
  },
  PROMPT_API: {
    flag: 'prompt-api-for-gemini-nano',
    value: 'Enabled',
    url: 'chrome://flags/#prompt-api-for-gemini-nano',
    description: 'Enable Prompt API (LanguageModel)'
  },
  MULTIMODAL_INPUT: {
    flag: 'multimodal-input',
    value: 'Enabled',
    url: 'chrome://flags/#multimodal-input',
    description: 'Enable multimodal input (required for audio/image)'
  }
};

/**
 * Chrome AI Availability States
 */
export const ChromeAIAvailability = {
  UNAVAILABLE: 'no',               // Not supported on this device (actual API value)
  DOWNLOADABLE: 'after-download',  // Can be downloaded (actual API value)
  DOWNLOADING: 'downloading',      // Currently downloading (not in spec but used)
  READILY: 'readily',              // Ready to use immediately
  AVAILABLE: 'available',          // Model available (may need download trigger)
};

/**
 * Chrome AI Supported Output Languages
 */
export const ChromeAILanguages = {
  ENGLISH: 'en',
  SPANISH: 'es',
  JAPANESE: 'ja',
};

/**
 * Common Translation Languages
 * Supported by most translation services
 */
export const TranslationLanguages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'ja', name: 'Japanese' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'id', name: 'Indonesian' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
];

/**
 * Default AI Configuration
 */
export const DefaultAIConfig = {
  provider: AIProviders.CHROME_AI,
  
  chromeAi: {
    temperature: 1.0,
    topK: 3,
    outputLanguage: 'en', // Supported: en, es, ja
    enableImageSupport: true, // Enable multi-modal image support
    enableAudioSupport: true, // Enable multi-modal audio support
  },
  
  openai: {
    apiKey: '',
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 2000,
    enableImageSupport: true, // Enable multi-modal image support
    enableAudioSupport: true, // Enable multi-modal audio support
  },
  
  ollama: {
    endpoint: 'http://localhost:11434',
    model: 'llama2',
    temperature: 0.7,
    maxTokens: 2000,
    enableImageSupport: true, // Enable multi-modal image support
    enableAudioSupport: true, // Enable multi-modal audio support
  },
  
  systemPrompt: 'You are a helpful virtual assistant. Be concise and friendly.',
  
  // AI Features Configuration (Available for all providers)
  aiFeatures: {
    translator: {
      enabled: true, // Enable translator feature
      defaultTargetLanguage: 'en', // Default language for translations
    },
    languageDetector: {
      enabled: true, // Enable language detector feature
    },
    summarizer: {
      enabled: true, // Enable summarizer feature
      defaultType: 'tldr', // 'tldr', 'key-points', 'teaser', 'headline'
      defaultFormat: 'plain-text', // 'plain-text' or 'markdown'
      defaultLength: 'medium', // 'short', 'medium', 'long'
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
  // Enable/disable TTS
  enabled: false,
  
  // Active TTS provider
  provider: TTSProviders.KOKORO,
  
  // Kokoro TTS Settings
  kokoro: {
    modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX', // HuggingFace model ID
    voice: KokoroVoices.AF_HEART, // Default voice
    speed: 1.0, // 0.5 to 2.0 recommended
    device: KokoroDevice.AUTO, // Auto-detect best backend (quantization is automatic)
  },
  
  // OpenAI TTS Settings
  openai: {
    apiKey: '', // Can share with AI or be separate
    model: 'tts-1', // tts-1 or tts-1-hd
    voice: OpenAIVoices.NOVA,
    speed: 1.0, // 0.25 to 4.0
  },
  
  // Generic OpenAI-Compatible TTS Settings
  'openai-compatible': {
    endpoint: 'http://localhost:8000', // Base URL only, service will append /v1/audio/speech
    apiKey: '', // Optional API key
    model: 'tts', // Model name
    voice: 'default',
    speed: 1.0,
  },
  
  // Chunking settings for natural-sounding speech
  chunkSize: 500, // Characters per chunk (approximate)
  minChunkSize: 100, // Minimum chunk size before forced split
};

/**
 * Default STT (Speech-to-Text) Configuration
 */
export const DefaultSTTConfig = {
  enabled: false,
  provider: STTProviders.CHROME_AI_MULTIMODAL,
  
  'chrome-ai-multimodal': {
    temperature: 0.1,
    topK: 3,
    outputLanguage: 'en', // Supported: en, es, ja
  },
  
  openai: {
    apiKey: '',
    model: 'whisper-1',
    language: 'en',
    temperature: 0,
  },
  
  'openai-compatible': {
    endpoint: 'http://localhost:8000',
    apiKey: '',
    model: 'whisper',
    language: 'en',
    temperature: 0,
  },
  
  recordingFormat: 'webm',
  maxRecordingDuration: 60,
  audioDeviceSwitchDelay: 300,
};

/**
 * Validate AI configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateAIConfig(config) {
  const errors = [];
  
  if (!config.provider) {
    errors.push('Provider not selected');
  }

  if (config.provider === AIProviders.CHROME_AI) {
    if (!('LanguageModel' in self)) {
      errors.push('Chrome AI not available. Chrome 138+ required with flags enabled.');
    }
    
    if (config.chromeAi?.temperature !== undefined) {
      if (config.chromeAi.temperature < 0 || config.chromeAi.temperature > 2) {
        errors.push('Temperature must be between 0 and 2');
      }
    }
    
    if (config.chromeAi?.topK !== undefined) {
      if (config.chromeAi.topK < 1 || config.chromeAi.topK > 128) {
        errors.push('TopK must be between 1 and 128');
      }
    }
  }
  
  if (config.provider === AIProviders.OPENAI) {
    if (!config.openai?.apiKey || config.openai.apiKey.trim() === '') {
      errors.push('OpenAI API Key is required');
    }
    if (!config.openai?.model || config.openai.model.trim() === '') {
      errors.push('OpenAI Model is required');
    }
  }
  
  if (config.provider === AIProviders.OLLAMA) {
    if (!config.ollama?.endpoint || config.ollama.endpoint.trim() === '') {
      errors.push('Ollama Endpoint is required');
    }
    if (!config.ollama?.model || config.ollama.model.trim() === '') {
      errors.push('Ollama Model is required');
    }
  }
  
  // Validate AI Features
  if (config.aiFeatures) {
    const validTypes = ['tldr', 'key-points', 'teaser', 'headline'];
    const validFormats = ['plain-text', 'markdown'];
    const validLengths = ['short', 'medium', 'long'];
    
    if (config.aiFeatures.summarizer) {
      const { defaultType, defaultFormat, defaultLength } = config.aiFeatures.summarizer;
      
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
export function validateTTSConfig(config) {
  const errors = [];
  
  if (!config.enabled) {
    // If TTS is disabled, no validation needed
    return { valid: true, errors: [] };
  }
  
  if (!config.provider) {
    errors.push('TTS Provider not selected');
  }
  
  if (config.provider === TTSProviders.KOKORO) {
    // Kokoro validation - use defaults if not set
    if (!config.kokoro) {
      // Kokoro config missing, but that's okay - will use defaults
      return { valid: true, errors: [] };
    }
    if (config.kokoro.modelId && config.kokoro.modelId.trim() === '') {
      errors.push('Kokoro Model ID cannot be empty');
    }
    if (config.kokoro?.speed !== undefined) {
      if (config.kokoro.speed < 0.5 || config.kokoro.speed > 2.0) {
        errors.push('Kokoro speed must be between 0.5 and 2.0');
      }
    }
  }
  
  if (config.provider === TTSProviders.OPENAI) {
    if (!config.openai?.apiKey || config.openai.apiKey.trim() === '') {
      errors.push('OpenAI TTS API Key is required');
    }
    if (!config.openai?.model || config.openai.model.trim() === '') {
      errors.push('OpenAI TTS Model is required');
    }
    if (!config.openai?.voice) {
      errors.push('OpenAI TTS Voice is required');
    }
  }
  
  if (config.provider === TTSProviders.OPENAI_COMPATIBLE) {
    if (!config['openai-compatible']?.endpoint || config['openai-compatible'].endpoint.trim() === '') {
      errors.push('Custom TTS Endpoint is required');
    }
    if (!config['openai-compatible']?.model || config['openai-compatible'].model.trim() === '') {
      errors.push('Custom TTS Model is required');
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
export function validateSTTConfig(config) {
  const errors = [];
  
  if (!config.enabled) {
    // If STT is disabled, no validation needed
    return { valid: true, errors: [] };
  }
  
  if (!config.provider) {
    errors.push('STT Provider not selected');
  }

  if (config.provider === STTProviders.CHROME_AI_MULTIMODAL) {
    if (!('LanguageModel' in self)) {
      errors.push('Chrome AI not available. Chrome 138+ required with flags enabled.');
    }
    
    if (config['chrome-ai-multimodal']?.temperature !== undefined) {
      if (config['chrome-ai-multimodal'].temperature < 0 || config['chrome-ai-multimodal'].temperature > 2) {
        errors.push('Temperature must be between 0 and 2');
      }
    }
    
    if (config['chrome-ai-multimodal']?.topK !== undefined) {
      if (config['chrome-ai-multimodal'].topK < 1 || config['chrome-ai-multimodal'].topK > 128) {
        errors.push('TopK must be between 1 and 128');
      }
    }
  }
  
  if (config.provider === STTProviders.OPENAI) {
    if (!config.openai?.apiKey || config.openai.apiKey.trim() === '') {
      errors.push('OpenAI STT API Key is required');
    }
    if (!config.openai?.model || config.openai.model.trim() === '') {
      errors.push('OpenAI STT Model is required');
    }
  }
  
  if (config.provider === STTProviders.OPENAI_COMPATIBLE) {
    if (!config['openai-compatible']?.endpoint || config['openai-compatible'].endpoint.trim() === '') {
      errors.push('Custom STT Endpoint is required');
    }
    if (!config['openai-compatible']?.model || config['openai-compatible'].model.trim() === '') {
      errors.push('Custom STT Model is required');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get provider display name
 * @param {string} provider - Provider key
 * @returns {string} Display name
 */
export function getProviderDisplayName(provider) {
  switch (provider) {
    case AIProviders.OPENAI:
      return 'OpenAI';
    case AIProviders.OLLAMA:
      return 'Ollama (Local)';
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
  DefaultAIConfig,
  DefaultTTSConfig,
  DefaultSTTConfig,
  validateAIConfig,
  validateTTSConfig,
  validateSTTConfig,
  getProviderDisplayName,
};
