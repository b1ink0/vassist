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
  OPENAI: 'openai', // OpenAI Whisper
  OPENAI_COMPATIBLE: 'openai-compatible', // Generic OpenAI-compatible STT API
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
 * Default AI Configuration
 * 
 * These are the default values - users can override via Control Panel.
 * All Ollama settings (endpoint, model, temperature, maxTokens) are editable.
 */
export const DefaultAIConfig = {
  // Active provider
  provider: AIProviders.OPENAI,
  
  // OpenAI Settings (all editable in UI)
  openai: {
    apiKey: '', // User must provide
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 2000,
  },
  
  // Ollama Settings (all editable in UI)
  ollama: {
    endpoint: 'http://localhost:11434', // Fully editable - user can change host/port
    model: 'llama2', // Editable - user can use any model
    temperature: 0.7, // Editable
    maxTokens: 2000, // Editable
  },
  
  // Shared Settings
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
 * 
 * Speech recognition settings for voice input.
 */
export const DefaultSTTConfig = {
  // Enable/disable STT
  enabled: false,
  
  // Active STT provider
  provider: STTProviders.OPENAI,
  
  // OpenAI Whisper Settings
  openai: {
    apiKey: '', // Can share with AI or be separate
    model: 'whisper-1',
    language: 'en', // ISO-639-1 language code (optional, leave empty for auto-detect)
    temperature: 0, // 0-1, lower is more consistent
  },
  
  // Generic OpenAI-Compatible STT Settings
  'openai-compatible': {
    endpoint: 'http://localhost:8000', // Base URL only, service will append /v1/audio/transcriptions
    apiKey: '', // Optional API key
    model: 'whisper', // Model name
    language: 'en',
    temperature: 0,
  },
  
  // Recording settings
  recordingFormat: 'webm', // Format for MediaRecorder
  maxRecordingDuration: 60, // Maximum recording duration in seconds
  
  // Audio device switching delay (Windows headset issue)
  // Some audio devices (especially headsets) need time to switch between input/output
  // Increase if you hear distorted audio after recording
  audioDeviceSwitchDelay: 300, // milliseconds (0-1000)
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
  OpenAIVoices,
  DefaultAIConfig,
  DefaultTTSConfig,
  DefaultSTTConfig,
  validateAIConfig,
  validateTTSConfig,
  validateSTTConfig,
  getProviderDisplayName,
};
