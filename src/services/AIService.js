/**
 * AIService - Multi-provider AI service
 * 
 * Unified interface for Chrome AI, OpenAI, and Ollama.
 */

import OpenAI from 'openai';
import { AIProviders } from '../config/aiConfig';
import ChromeAIValidator from './ChromeAIValidator';

class AIService {
  constructor() {
    this.isExtensionMode = __EXTENSION_MODE__;
    
    if (this.isExtensionMode) {
      this.tabStates = new Map();
      console.log('[AIService] Initialized (Extension mode - multi-tab)');
    } else {
      this.client = null;
      this.provider = null;
      this.config = null;
      this.abortController = null;
      this.chromeAISession = null;
      console.log('[AIService] Initialized (Dev mode - single instance)');
    }
  }

  /**
   * Initialize state for a tab (extension mode only)
   * @param {number} tabId - Tab ID
   */
  initTab(tabId) {
    if (!this.isExtensionMode) return;
    
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        client: null,
        config: null,
        provider: null,
        abortController: null,
        chromeAISession: null,
      });
      console.log(`[AIService] Tab ${tabId} initialized`);
    }
  }

  /**
   * Cleanup tab state (extension mode only)
   * @param {number} tabId - Tab ID
   */
  cleanupTab(tabId) {
    if (!this.isExtensionMode) return;
    
    const state = this.tabStates.get(tabId);
    if (state) {
      if (state.abortController) {
        state.abortController.abort();
      }
      this.tabStates.delete(tabId);
      console.log(`[AIService] Tab ${tabId} cleaned up`);
    }
  }

  /**
   * Get state object for current context
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Object} State object
   */
  _getState(tabId = null) {
    if (this.isExtensionMode) {
      this.initTab(tabId);
      return this.tabStates.get(tabId);
    }
    return this; // In dev mode, state is on the instance itself
  }

  /**
   * Configure AI client with provider settings
   * Dev mode: configure(config)
   * Extension mode: configure(config, tabId)
   * @param {Object} config - Config object
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<boolean>} Success status
   */
  configure(config, tabId = null) {
    const state = this._getState(tabId);
    const { provider } = config;
    const logPrefix = this.isExtensionMode ? `[AIService] Tab ${tabId}` : '[AIService]';
    console.log(`${logPrefix} - Configuring provider: ${provider}`);
    
    try {
      if (provider === AIProviders.CHROME_AI || provider === 'chrome-ai') {
        if (!ChromeAIValidator.isSupported()) {
          throw new Error('Chrome AI not supported. Chrome 138+ required.');
        }
        
        const chromeAiConfig = config.chromeAi || config;
        const newImageSupport = chromeAiConfig.enableImageSupport !== false;
        
        // Check if image support setting changed
        const imageSupportChanged = state.config && 
          (state.config.enableImageSupport !== newImageSupport);
        
        // If image support changed, destroy existing session to force recreation
        if (imageSupportChanged && state.chromeAISession) {
          console.log(`${logPrefix} - Image support changed, destroying existing session`);
          try {
            state.chromeAISession.destroy();
          } catch (error) {
            console.warn(`${logPrefix} - Error destroying session:`, error);
          }
          state.chromeAISession = null;
        }
        
        state.config = {
          temperature: chromeAiConfig.temperature,
          topK: chromeAiConfig.topK,
          enableImageSupport: newImageSupport,
        };
        
        console.log(`${logPrefix} - Chrome AI configured:`, state.config);
      }
      else if (provider === AIProviders.OPENAI || provider === 'openai') {
        const openaiConfig = config.openai || config;
        state.client = new OpenAI({
          apiKey: openaiConfig.apiKey,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });
        
        state.config = {
          model: openaiConfig.model,
          temperature: openaiConfig.temperature,
          maxTokens: openaiConfig.maxTokens,
        };
        
        console.log(`${logPrefix} - OpenAI configured:`, {
          model: state.config.model,
          temperature: state.config.temperature,
          maxTokens: state.config.maxTokens,
        });
      } 
      else if (provider === AIProviders.OLLAMA || provider === 'ollama') {
        const ollamaConfig = config.ollama || config;
        state.client = new OpenAI({
          apiKey: 'ollama',
          baseURL: ollamaConfig.endpoint + '/v1',
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });
        
        state.config = {
          model: ollamaConfig.model,
          temperature: ollamaConfig.temperature,
          maxTokens: ollamaConfig.maxTokens,
        };
        
        console.log(`${logPrefix} - Ollama configured:`, {
          endpoint: ollamaConfig.endpoint,
          model: state.config.model,
        });
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }
      
      state.provider = provider;
      return true;
      
    } catch (error) {
      console.error(`${logPrefix} - Configuration failed:`, error);
      state.client = null;
      state.config = null;
      state.provider = null;
      throw error;
    }
  }

  /**
   * Check if service is configured and ready
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {boolean} True if ready
   */
  isConfigured(tabId = null) {
    const state = this._getState(tabId);
    
    if (!state || !state.config || !state.provider) {
      return false;
    }
    if (state.provider === 'chrome-ai' || state.provider === AIProviders.CHROME_AI) {
      return true;
    }
    return state.client !== null;
  }

  /**
   * Get current provider name
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {string|null} Provider name or null
   */
  getCurrentProvider(tabId = null) {
    const state = this._getState(tabId);
    return state?.provider || null;
  }

  /**
   * Convert data URL to Blob
   * @param {string} dataUrl - Data URL (e.g., data:image/jpeg;base64,...)
   * @returns {Blob} Image blob
   */
  _dataUrlToBlob(dataUrl) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  /**
   * Format messages for multi-modal support
   * Converts ChatManager format to provider-specific format
   * @param {Array} messages - Messages from ChatManager
   * @param {string} provider - Provider name
   * @returns {Array} Formatted messages
   */
  _formatMultiModalMessages(messages, provider) {
    return messages.map(msg => {
      // If no images, return as-is
      if (!msg.images || msg.images.length === 0) {
        return { role: msg.role, content: msg.content };
      }

      // Multi-modal message with images
      if (provider === AIProviders.CHROME_AI || provider === 'chrome-ai') {
        // Chrome AI format: content is array of {type, value}
        const content = [
          { type: 'text', value: msg.content }
        ];
        
        // Add images
        for (const imageDataUrl of msg.images) {
          content.push({
            type: 'image',
            value: this._dataUrlToBlob(imageDataUrl)
          });
        }
        
        return { role: msg.role, content };
      } else {
        // OpenAI/Ollama format: content is array of {type, text/image_url}
        const content = [
          { type: 'text', text: msg.content }
        ];
        
        // Add images
        for (const imageDataUrl of msg.images) {
          content.push({
            type: 'image_url',
            image_url: { url: imageDataUrl }
          });
        }
        
        return { role: msg.role, content };
      }
    });
  }

  /**
   * Send message with streaming support
   * 
   * @param {Array} messages - Array of message objects
   * @param {Function|null} onStream - Callback for streaming tokens
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} Full response text
   */
  async sendMessage(messages, onStream = null, tabId = null) {
    const state = this._getState(tabId);
    
    if (!this.isConfigured(tabId)) {
      throw new Error('AIService not configured. Call configure() first.');
    }

    const logPrefix = this.isExtensionMode ? `[AIService] Tab ${tabId}` : '[AIService]';
    
    // Check if any message contains images
    const hasImages = messages.some(m => m.images && m.images.length > 0);
    
    console.log(`${logPrefix} - Sending message to ${state.provider}:`, {
      messageCount: messages.length,
      model: state.config.model || 'chrome-ai',
      hasImages,
    });

    // Format messages for multi-modal if needed
    const formattedMessages = hasImages 
      ? this._formatMultiModalMessages(messages, state.provider)
      : messages;

    // Chrome AI implementation
    if (state.provider === AIProviders.CHROME_AI || state.provider === 'chrome-ai') {
      return await this._sendMessageChromeAI(state, formattedMessages, onStream, logPrefix);
    }

    // Create new abort controller for this request
    state.abortController = new AbortController();

    try {
      // Create streaming request with abort signal
      const stream = await state.client.chat.completions.create({
        model: state.config.model,
        messages: formattedMessages,
        temperature: state.config.temperature,
        max_tokens: state.config.maxTokens,
        stream: true,
      }, {
        signal: state.abortController.signal
      });

      let fullResponse = '';
      
      // Process streaming chunks
      for await (const chunk of stream) {
        // Check if request was aborted
        if (!state.abortController) {
          console.log(`${logPrefix} - Streaming aborted`);
          throw new Error('Generation stopped by user');
        }
        
        const content = chunk.choices[0]?.delta?.content || '';
        
        if (content) {
          fullResponse += content;
          
          // Call streaming callback if provided
          if (onStream) {
            onStream(content);
          }
        }
      }

      console.log(`${logPrefix} - Response received (${fullResponse.length} chars)`);
      state.abortController = null;
      
      return fullResponse;
      
    } catch (error) {
      state.abortController = null;
      
      // Check if error is from abort
      if (error.name === 'AbortError') {
        console.log(`${logPrefix} - Request aborted by user`);
        throw new Error('Generation stopped by user');
      }
      
      console.error(`${logPrefix} - Request failed:`, error);
      
      // Enhance error message for common issues
      if (error.message?.includes('401')) {
        throw new Error('Invalid API key. Please check your configuration.');
      } else if (error.message?.includes('429')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.message?.includes('fetch')) {
        throw new Error('Network error. Please check your connection and endpoint URL.');
      } else {
        throw error;
      }
    }
  }

  /**
   * Send message using Chrome AI LanguageModel (internal method)
   * @param {Object} state - State object
   * @param {Array} messages - Message array {role, content}
   * @param {Function} onStream - Streaming callback
   * @param {string} logPrefix - Log prefix
   * @returns {Promise<string>} Full response
   */
  async _sendMessageChromeAI(state, messages, onStream, logPrefix) {
    try {
      if (!state.chromeAISession) {
        console.log(`${logPrefix} - Creating Chrome AI session...`);
        
        const systemPrompts = messages.filter(m => m.role === 'system');
        const conversationMsgs = messages.filter(m => m.role !== 'system');
        
        if (!self.LanguageModel) {
          throw new Error('Chrome AI LanguageModel not available');
        }
        
        // Session config
        const sessionConfig = {
          temperature: state.config.temperature,
          topK: state.config.topK,
          language: state.config.outputLanguage || 'en',
          initialPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
        };
        
        // Add multi-modal support if enabled in config (default: true)
        const imageSupport = state.config.enableImageSupport !== false;
        if (imageSupport) {
          sessionConfig.expectedInputs = [
            { type: 'text' },
            { type: 'image' }
          ];
        }
        
        state.chromeAISession = await self.LanguageModel.create(sessionConfig);
        console.log(`${logPrefix} - Chrome AI session created ${imageSupport ? 'with image support' : ''}`);
        
        messages = conversationMsgs;
      }

      const lastMessage = messages[messages.length - 1];
      console.log(`${logPrefix} - Chrome AI prompting with ${messages.length} message(s)`);

      // For multi-modal messages (content is array), pass as message object with role
      // For text-only messages (content is string), pass just the string
      const isMultiModal = Array.isArray(lastMessage.content);
      const promptInput = isMultiModal ? [lastMessage] : lastMessage.content;
      
      let fullResponse = '';

      if (onStream) {
        const stream = state.chromeAISession.promptStreaming(promptInput);
        
        for await (const chunk of stream) {
          // Check if session was destroyed (aborted)
          if (!state.chromeAISession) {
            console.log(`${logPrefix} - Chrome AI streaming aborted`);
            throw new Error('Generation stopped by user');
          }
          
          fullResponse = chunk;
          const previousLength = fullResponse.length - chunk.length;
          const newContent = chunk.slice(previousLength > 0 ? previousLength : 0);
          if (newContent) {
            onStream(newContent);
          }
        }
      } else {
        fullResponse = await state.chromeAISession.prompt(promptInput);
      }

      console.log(`${logPrefix} - Chrome AI response (${fullResponse.length} chars)`);
      return fullResponse;

    } catch (error) {
      console.error(`${logPrefix} - Chrome AI error:`, error);
      
      if (state.chromeAISession) {
        try {
          state.chromeAISession.destroy();
        } catch (destroyError) {
          console.warn('Failed to destroy session:', destroyError);
        }
        state.chromeAISession = null;
      }

      if (error.name === 'NotSupportedError') {
        throw new Error('Chrome AI not available. Enable required flags at chrome://flags');
      } else if (error.name === 'QuotaExceededError') {
        throw new Error('Chrome AI context limit exceeded (1028 tokens). Start a new conversation.');
      } else {
        throw error;
      }
    }
  }

  /**
   * Abort the current ongoing request
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {boolean} True if aborted
   */
  abortRequest(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[AIService] Tab ${tabId}` : '[AIService]';
    
    if (state && (state.provider === 'chrome-ai' || state.provider === AIProviders.CHROME_AI) && state.chromeAISession) {
      console.log(`${logPrefix} - Destroying Chrome AI session`);
      try {
        state.chromeAISession.destroy();
      } catch (destroyError) {
        console.warn('Failed to destroy session:', destroyError);
      }
      state.chromeAISession = null;
      return true;
    }
    
    if (state && state.abortController) {
      console.log(`${logPrefix} - Aborting current request`);
      state.abortController.abort();
      state.abortController = null;
      return true;
    }
    return false;
  }

  isGenerating(tabId = null) {
    const state = this._getState(tabId);
    return state && state.abortController !== null;
  }

  /**
   * Send message without streaming (simpler interface)
   * @param {Array|number} messagesOrTabId - Messages (dev) or tabId (extension)
   * @param {Array} messages - Messages (extension mode only)
   * @returns {Promise<string>} Full response text
   */
  async sendMessageSync(messagesOrTabId, messages = null) {
    if (this.isExtensionMode) {
      return await this.sendMessage(messages, null, messagesOrTabId);
    } else {
      return await this.sendMessage(messagesOrTabId, null, null);
    }
  }

  async testConnection(tabId = null) {
    if (!this.isConfigured(tabId)) {
      throw new Error('AIService not configured');
    }

    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[AIService] Tab ${tabId}` : '[AIService]';
    console.log(`${logPrefix} - Testing connection to ${state.provider}...`);

    if ((state.provider === AIProviders.CHROME_AI || state.provider === 'chrome-ai') && !this.isExtensionMode) {
      const result = await ChromeAIValidator.testConnection();
      if (!result.success) {
        throw new Error(result.message);
      }
      return true;
    }

    try {
      const testMessages = [
        { role: 'user', content: 'Say "OK" if you can hear me.' }
      ];

      const response = await this.sendMessage(testMessages, null, tabId);
      
      console.log(`${logPrefix} - Connection test successful:`, response);
      return true;
      
    } catch (error) {
      console.error(`${logPrefix} - Connection test failed:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export default new AIService();
