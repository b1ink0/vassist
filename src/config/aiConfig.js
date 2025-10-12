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
  DefaultAIConfig,
  validateAIConfig,
  getProviderDisplayName,
};
