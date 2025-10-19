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
 * Default AI Configuration
 */
export const DefaultAIConfig = {
  provider: AIProviders.CHROME_AI,
  
  chromeAi: {
    temperature: 1.0,
    topK: 3,
    outputLanguage: 'en', // Supported: en, es, ja
    enableImageSupport: true, // Enable multi-modal image support
  },
  
  openai: {
    apiKey: '',
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 2000,
  },
  
  ollama: {
    endpoint: 'http://localhost:11434',
    model: 'llama2',
    temperature: 0.7,
    maxTokens: 2000,
  },
  
  systemPrompt: 'You are a helpful virtual assistant. Be concise and friendly.',
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
  provider: TTSProviders.OPENAI,
  
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
  OpenAIVoices,
  DefaultAIConfig,
  DefaultTTSConfig,
  DefaultSTTConfig,
  validateAIConfig,
  validateTTSConfig,
  validateSTTConfig,
  getProviderDisplayName,
};
