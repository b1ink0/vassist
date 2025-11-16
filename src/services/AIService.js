/**
 * AIService - Multi-provider AI service
 * 
 * Unified interface for Chrome AI, OpenAI, and Ollama.
 */

import OpenAI from 'openai';
import { AIProviders } from '../config/aiConfig';
import ChromeAIValidator from './ChromeAIValidator';
import Logger from './LoggerService';

class AIService {
  constructor() {
    this.isExtensionMode = __EXTENSION_MODE__;
    
    if (this.isExtensionMode) {
      this.tabStates = new Map();
    } else {
      this.client = null;
      this.provider = null;
      this.config = null;
      this.abortController = null;
      this.chromeAISession = null;
      this.chromeAIUtilitySession = null; // Separate session for utility calls (analyzer, etc.)
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
        chromeAIUtilitySession: null, // Separate session for utility calls (analyzer, etc.)
      });
      Logger.log('AIService', `Tab ${tabId} initialized`);
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
      Logger.log('AIService', `Tab ${tabId} cleaned up`);
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
    Logger.log('other', `${logPrefix} - Configuring provider: ${provider}`);
    
    try {
      if (provider === AIProviders.CHROME_AI || provider === 'chrome-ai') {
        if (!ChromeAIValidator.isSupported()) {
          throw new Error('Chrome AI not supported. Chrome 138+ required.');
        }
        
        const chromeAiConfig = config.chromeAi || config;
        const newImageSupport = chromeAiConfig.enableImageSupport !== false;
        const newAudioSupport = chromeAiConfig.enableAudioSupport !== false;
        
        // Check if image or audio support settings changed
        const imageSupportChanged = state.config && 
          (state.config.enableImageSupport !== newImageSupport);
        const audioSupportChanged = state.config && 
          (state.config.enableAudioSupport !== newAudioSupport);
        
        // If image or audio support changed, destroy existing session to force recreation
        if ((imageSupportChanged || audioSupportChanged) && state.chromeAISession) {
          Logger.log('other', `${logPrefix} - Multi-modal support changed, destroying existing session`);
          try {
            state.chromeAISession.destroy();
          } catch (error) {
            Logger.warn('other', `${logPrefix} - Error destroying main session:`, error);
          }
          state.chromeAISession = null;
        }
        
        // Also destroy utility session if multi-modal support changed
        if ((imageSupportChanged || audioSupportChanged) && state.chromeAIUtilitySession) {
          Logger.log('other', `${logPrefix} - Multi-modal support changed, destroying utility session`);
          try {
            state.chromeAIUtilitySession.destroy();
          } catch (error) {
            Logger.warn('other', `${logPrefix} - Error destroying utility session:`, error);
          }
          state.chromeAIUtilitySession = null;
        }
        
        state.config = {
          temperature: chromeAiConfig.temperature,
          topK: chromeAiConfig.topK,
          enableImageSupport: newImageSupport,
          enableAudioSupport: newAudioSupport,
        };
        
        Logger.log('other', `${logPrefix} - Chrome AI configured:`, state.config);
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
          enableImageSupport: openaiConfig.enableImageSupport !== false,
          enableAudioSupport: openaiConfig.enableAudioSupport !== false,
        };
        
        Logger.log('other', `${logPrefix} - OpenAI configured:`, {
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
          enableImageSupport: ollamaConfig.enableImageSupport !== false,
          enableAudioSupport: ollamaConfig.enableAudioSupport !== false,
        };
        
        Logger.log('other', `${logPrefix} - Ollama configured:`, {
          endpoint: ollamaConfig.endpoint,
          model: state.config.model,
        });
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }
      
      state.provider = provider;
      return true;
      
    } catch (error) {
      Logger.error('other', `${logPrefix} - Configuration failed:`, error);
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
   * Convert data URL to ArrayBuffer
   * @param {string} dataUrl - Data URL (e.g., data:audio/wav;base64,...)
   * @returns {ArrayBuffer} Audio array buffer
   */
  _dataUrlToArrayBuffer(dataUrl) {
    const arr = dataUrl.split(',');
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return u8arr.buffer;
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
      // Check if multi-modal (has images or audios)
      const hasImages = msg.images && msg.images.length > 0;
      const hasAudios = msg.audios && msg.audios.length > 0;
      
      // If no attachments, return as-is
      if (!hasImages && !hasAudios) {
        return { role: msg.role, content: msg.content };
      }

      // Multi-modal message with images and/or audios
      if (provider === AIProviders.CHROME_AI || provider === 'chrome-ai') {
        // Chrome AI format: content is array of {type, value}
        const content = [
          { type: 'text', value: msg.content }
        ];
        
        // Add images
        if (hasImages) {
          for (const imageDataUrl of msg.images) {
            content.push({
              type: 'image',
              value: this._dataUrlToBlob(imageDataUrl)
            });
          }
        }
        
        // Add audios
        if (hasAudios) {
          for (const audioDataUrl of msg.audios) {
            content.push({
              type: 'audio',
              value: this._dataUrlToArrayBuffer(audioDataUrl)
            });
          }
        }
        
        return { role: msg.role, content };
      } else {
        // OpenAI/Ollama format: content is array of {type, text/image_url/input_audio}
        const content = [
          { type: 'text', text: msg.content }
        ];
        
        // Add images
        if (hasImages) {
          for (const imageDataUrl of msg.images) {
            content.push({
              type: 'image_url',
              image_url: { url: imageDataUrl }
            });
          }
        }
        
        // Add audios (OpenAI format for audio input)
        if (hasAudios) {
          for (const audioDataUrl of msg.audios) {
            // Extract base64 data from data URL
            const base64Data = audioDataUrl.split(',')[1];
            content.push({
              type: 'input_audio',
              input_audio: { 
                data: base64Data,
                format: 'wav' // Default to wav, can be made dynamic
              }
            });
          }
        }
        
        return { role: msg.role, content };
      }
    });
  }

  /**
   * Prepare request body for API call based on provider
   * @param {Object} state - State object
   * @param {Array} formattedMessages - Formatted messages
   * @returns {Object} Request body for API call
   */
  _prepareRequestBody(state, formattedMessages) {
    return {
      model: state.config.model,
      messages: formattedMessages,
      temperature: state.config.temperature,
      max_tokens: state.config.maxTokens,
      stream: true,
    };
  }

  /**
   * Send message with streaming support
   * 
   * @param {Array} messages - Array of message objects
   * @param {Function|null} onStream - Callback for streaming tokens
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @param {Object} options - Additional options { useUtilitySession: boolean }
   * @returns {Promise<{success: boolean, response: string|null, cancelled: boolean, error: Error|null}>}
   */
  async sendMessage(messages, onStream = null, tabId = null, options = {}) {
    const state = this._getState(tabId);
    
    if (!this.isConfigured(tabId)) {
      return { success: false, response: null, cancelled: false, error: new Error('AIService not configured. Call configure() first.') };
    }

    const logPrefix = this.isExtensionMode ? `[AIService] Tab ${tabId}` : '[AIService]';
    
    // Check if any message contains images or audios
    const hasImages = messages.some(m => m.images && m.images.length > 0);
    const hasAudios = messages.some(m => m.audios && m.audios.length > 0);
    const hasAttachments = hasImages || hasAudios;
    
    Logger.log('other', `${logPrefix} - Sending message to ${state.provider}:`, {
      messageCount: messages.length,
      model: state.config.model || 'chrome-ai',
      hasImages,
      hasAudios,
      useUtilitySession: options.useUtilitySession || false,
    });

    // Format messages for multi-modal if needed
    const formattedMessages = hasAttachments 
      ? this._formatMultiModalMessages(messages, state.provider)
      : messages;

    // Chrome AI implementation
    if (state.provider === AIProviders.CHROME_AI || state.provider === 'chrome-ai') {
      return await this._sendMessageChromeAI(state, formattedMessages, onStream, logPrefix, options.useUtilitySession);
    }

    // Create new abort controller for this request
    state.abortController = new AbortController();

    try {
      // Prepare request body
      const requestBody = this._prepareRequestBody(state, formattedMessages);
      
      // Create streaming request with abort signal
      const stream = await state.client.chat.completions.create(requestBody, {
        signal: state.abortController.signal
      });

      let fullResponse = '';
      
      // Process streaming chunks
      for await (const chunk of stream) {
        // Check if request was aborted - return cancelled, don't throw
        if (!state.abortController) {
          Logger.log('other', `${logPrefix} - Streaming aborted by user`);
          state.abortController = null;
          return { success: false, response: fullResponse, cancelled: true, error: null };
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

      Logger.log('other', `${logPrefix} - Response received (${fullResponse.length} chars)`);
      state.abortController = null;
      
      return { success: true, response: fullResponse, cancelled: false, error: null };
      
    } catch (error) {
      state.abortController = null;
      
      // Check if error is from abort - check name AND message
      const errorMsg = error.message?.toLowerCase() || '';
      const isAbort = error.name === 'AbortError' || 
                      errorMsg.includes('abort') || 
                      errorMsg.includes('cancel');
      
      if (isAbort) {
        Logger.log('other', `${logPrefix} - Request aborted by user`);
        return { success: false, response: null, cancelled: true, error: null };
      }
      
      Logger.error('other', `${logPrefix} - Request failed:`, error);
      
      // Return error result with enhanced message
      let errorMessage = error.message;
      if (error.message?.includes('401')) {
        errorMessage = 'Invalid API key. Please check your configuration.';
      } else if (error.message?.includes('429')) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if (error.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and endpoint URL.';
      }
      
      return { success: false, response: null, cancelled: false, error: new Error(errorMessage) };
    }
  }

  /**
   * Send message using Chrome AI LanguageModel (internal method)
   * @param {Object} state - State object
   * @param {Array} messages - Message array {role, content}
   * @param {Function} onStream - Streaming callback
   * @param {string} logPrefix - Log prefix
   * @param {boolean} useUtilitySession - Use utility session instead of main session
   * @returns {Promise<{success: boolean, response: string|null, cancelled: boolean, error: Error|null}>}
   */
  async _sendMessageChromeAI(state, messages, onStream, logPrefix, useUtilitySession = false) {
    const sessionKey = useUtilitySession ? 'chromeAIUtilitySession' : 'chromeAISession';
    
    try {
      const systemPrompts = messages.filter(m => m.role === 'system');
      const conversationMsgs = messages.filter(m => m.role !== 'system');
      
      let sessionToUse = state[sessionKey];
      
      if (!sessionToUse) {
        Logger.log('other', `${logPrefix} - Creating Chrome AI ${useUtilitySession ? 'utility' : 'main'} session...`);
        
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
        const audioSupport = state.config.enableAudioSupport !== false;
        
        if (imageSupport || audioSupport) {
          sessionConfig.expectedInputs = [
            { type: 'text' }
          ];
          
          if (imageSupport) {
            sessionConfig.expectedInputs.push({ type: 'image' });
          }
          
          if (audioSupport) {
            sessionConfig.expectedInputs.push({ type: 'audio' });
          }
        }
        
        sessionToUse = await self.LanguageModel.create(sessionConfig);
        state[sessionKey] = sessionToUse;
        
        Logger.log('other', `${logPrefix} - Chrome AI ${useUtilitySession ? 'utility' : 'main'} session created`);
        
        messages = conversationMsgs;
      }

      const lastMessage = messages[messages.length - 1];
      Logger.log('other', `${logPrefix} - Chrome AI prompting with ${messages.length} message(s)`);

      // For multi-modal messages (content is array), pass as message object with role
      // For text-only messages (content is string), pass just the string
      const isMultiModal = Array.isArray(lastMessage.content);
      const promptInput = isMultiModal ? [lastMessage] : lastMessage.content;
      
      let fullResponse = '';

      if (onStream) {
        const stream = sessionToUse.promptStreaming(promptInput);
        
        for await (const chunk of stream) {
          // Check if session was destroyed (aborted) - return cancelled
          if (!state[sessionKey]) {
            Logger.log('other', `${logPrefix} - Chrome AI streaming aborted by user`);
            return { success: false, response: fullResponse, cancelled: true, error: null };
          }
          
          fullResponse += chunk;
          if (chunk && onStream) {
            onStream(chunk);
          }
        }
      } else {
        fullResponse = await sessionToUse.prompt(promptInput);
      }

      Logger.log('other', `${logPrefix} - Chrome AI response (${fullResponse.length} chars)`);
      
      // Clean up excessive whitespace and newlines
      fullResponse = fullResponse.trim().replace(/\n\s*\n\s*\n/g, '\n\n');
      
      return { success: true, response: fullResponse, cancelled: false, error: null };

    } catch (error) {
      Logger.error('other', `${logPrefix} - Chrome AI error:`, error);
      
      if (state[sessionKey]) {
        try {
          state[sessionKey].destroy();
        } catch (destroyError) {
          Logger.warn('other', `Failed to destroy ${useUtilitySession ? 'utility' : 'main'} session:`, destroyError);
        }
        state[sessionKey] = null;
      }

      let errorMessage = error.message;
      if (error.name === 'NotSupportedError') {
        errorMessage = 'Chrome AI not available. Enable required flags at chrome://flags';
      } else if (error.name === 'QuotaExceededError') {
        errorMessage = 'Chrome AI context limit exceeded (1028 tokens). Start a new conversation.';
      }
      
      return { success: false, response: null, cancelled: false, error: new Error(errorMessage) };
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
    
    let aborted = false;
    
    // Abort both main and utility Chrome AI sessions
    if (state && (state.provider === 'chrome-ai' || state.provider === AIProviders.CHROME_AI)) {
      if (state.chromeAISession) {
        Logger.log('other', `${logPrefix} - Destroying Chrome AI main session`);
        try {
          state.chromeAISession.destroy();
        } catch (destroyError) {
          Logger.warn('other', 'Failed to destroy main session:', destroyError);
        }
        state.chromeAISession = null;
        aborted = true;
      }
      
      if (state.chromeAIUtilitySession) {
        Logger.log('other', `${logPrefix} - Destroying Chrome AI utility session`);
        try {
          state.chromeAIUtilitySession.destroy();
        } catch (destroyError) {
          Logger.warn('other', 'Failed to destroy utility session:', destroyError);
        }
        state.chromeAIUtilitySession = null;
        aborted = true;
      }
      
      if (aborted) return true;
    }
    
    if (state && state.abortController) {
      Logger.log('other', `${logPrefix} - Aborting current request`);
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
    Logger.log('other', `${logPrefix} - Testing connection to ${state.provider}...`);

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

      const result = await this.sendMessage(testMessages, null, tabId);
      
      if (!result.success) {
        throw result.error || new Error('Connection test failed');
      }
      
      Logger.log('other', `${logPrefix} - Connection test successful:`, result.response);
      return true;
      
    } catch (error) {
      Logger.error('other', `${logPrefix} - Connection test failed:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export default new AIService();
