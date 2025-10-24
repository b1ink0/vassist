/**
 * TranslatorService - Multi-provider Translation service
 * 
 * Supports Chrome AI Translator API (on-device) and polyfills for OpenAI/Ollama.
 * Works in both extension mode (multi-tab) and dev mode (single instance).
 */

import OpenAI from 'openai';

class TranslatorService {
  constructor() {
    this.isExtensionMode = __EXTENSION_MODE__;
    
    if (this.isExtensionMode) {
      this.tabStates = new Map();
      console.log('[TranslatorService] Initialized (Extension mode - multi-tab)');
    } else {
      this.translatorSessions = new Map(); // key: "sourceLanguage-targetLanguage", value: Translator session
      this.config = null;
      this.provider = null;
      this.llmClient = null;
      this.abortController = null;
      console.log('[TranslatorService] Initialized (Dev mode)');
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
        translatorSessions: new Map(),
        config: null,
        provider: null,
        llmClient: null,
        abortController: null,
      });
      console.log(`[TranslatorService] Tab ${tabId} initialized`);
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
      // Abort ongoing request
      if (state.abortController) {
        state.abortController.abort();
      }
      
      // Destroy all translator sessions
      for (const session of state.translatorSessions.values()) {
        try {
          if (session && typeof session.destroy === 'function') {
            session.destroy();
          }
        } catch (error) {
          console.warn(`[TranslatorService] Error destroying session:`, error);
        }
      }
      this.tabStates.delete(tabId);
      console.log(`[TranslatorService] Tab ${tabId} cleaned up`);
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
   * Configure translator with provider settings
   * @param {Object} config - Configuration
   * @param {string} config.provider - 'chrome-ai', 'openai', or 'ollama'
   * @param {Object} config.openai - OpenAI config (if provider is 'openai')
   * @param {Object} config.ollama - Ollama config (if provider is 'ollama')
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<boolean>} Success status
   */
  async configure(config, tabId = null) {
    const state = this._getState(tabId);
    const { provider } = config;
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    console.log(`${logPrefix} Configuring provider: ${provider}`);
    
    try {
      if (provider === 'chrome-ai') {
        // Check Chrome AI Translator availability
        if (!('Translator' in self)) {
          throw new Error('Chrome AI Translator not available. Chrome 138+ required.');
        }
        
        state.config = { provider: 'chrome-ai' };
        state.provider = 'chrome-ai';
        console.log(`${logPrefix} Chrome AI Translator configured`);
      } 
      else if (provider === 'openai') {
        const openaiConfig = config.openai;
        state.llmClient = new OpenAI({
          apiKey: openaiConfig.apiKey,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });
        
        state.config = {
          provider: 'openai',
          model: openaiConfig.model || 'gpt-4o-mini',
          temperature: openaiConfig.temperature || 0.3,
        };
        state.provider = 'openai';
        console.log(`${logPrefix} OpenAI configured for translation`);
      }
      else if (provider === 'ollama') {
        const ollamaConfig = config.ollama;
        state.llmClient = new OpenAI({
          apiKey: 'ollama',
          baseURL: ollamaConfig.endpoint + '/v1',
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });
        
        state.config = {
          provider: 'ollama',
          model: ollamaConfig.model,
          temperature: ollamaConfig.temperature || 0.3,
        };
        state.provider = 'ollama';
        console.log(`${logPrefix} Ollama configured for translation`);
      }
      else {
        throw new Error(`Unknown provider: ${provider}`);
      }
      
      return true;
    } catch (error) {
      console.error(`${logPrefix} Configuration failed:`, error);
      state.config = null;
      state.provider = null;
      state.llmClient = null;
      throw error;
    }
  }

  /**
   * Check if service is configured
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {boolean} True if configured
   */
  isConfigured(tabId = null) {
    const state = this._getState(tabId);
    return state && state.config && state.provider;
  }

  /**
   * Abort ongoing translation request
   * @param {number} tabId - Tab ID (extension mode only)
   */
  abort(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    if (state.abortController) {
      console.log(`${logPrefix} Aborting translation request`);
      state.abortController.abort();
      state.abortController = null;
    }
  }

  /**
   * Check availability of translation for a language pair
   * @param {string} sourceLanguage - Source language code (e.g., 'en')
   * @param {string} targetLanguage - Target language code (e.g., 'es')
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} 'readily', 'downloading', 'downloadable', or 'unavailable'
   */
  async checkAvailability(sourceLanguage, targetLanguage, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    if (!state.provider) {
      return 'unavailable';
    }
    
    if (state.provider === 'chrome-ai') {
      if (!('Translator' in self)) {
        return 'unavailable';
      }
      
      try {
        const availability = await self.Translator.availability({
          sourceLanguage,
          targetLanguage
        });
        console.log(`${logPrefix} Translator availability for ${sourceLanguage}->${targetLanguage}:`, availability);
        return availability;
      } catch (error) {
        console.error(`${logPrefix} Failed to check availability:`, error);
        return 'unavailable';
      }
    } else {
      // For OpenAI/Ollama, always ready (cloud-based)
      return 'readily';
    }
  }

  /**
   * Get or create translator session for language pair
   * @param {string} sourceLanguage - Source language code
   * @param {string} targetLanguage - Target language code
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<Object>} Translator session
   */
  async _getOrCreateSession(sourceLanguage, targetLanguage, tabId = null) {
    const state = this._getState(tabId);
    const sessionKey = `${sourceLanguage}-${targetLanguage}`;
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    if (state.provider !== 'chrome-ai') {
      // No sessions for OpenAI/Ollama
      return null;
    }
    
    if (state.translatorSessions.has(sessionKey)) {
      return state.translatorSessions.get(sessionKey);
    }
    
    // Create new Chrome AI Translator session
    try {
      console.log(`${logPrefix} Creating translator session: ${sessionKey}`);
      const session = await self.Translator.create({
        sourceLanguage,
        targetLanguage,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            console.log(`${logPrefix} Translation model download: ${(e.loaded * 100).toFixed(1)}%`);
          });
        }
      });
      
      state.translatorSessions.set(sessionKey, session);
      console.log(`${logPrefix} Translator session created: ${sessionKey}`);
      return session;
    } catch (error) {
      console.error(`${logPrefix} Failed to create translator session:`, error);
      throw error;
    }
  }

  /**
   * Translate text (batch, non-streaming)
   * @param {string} text - Text to translate
   * @param {string} sourceLanguage - Source language code
   * @param {string} targetLanguage - Target language code
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} Translated text
   */
  async translate(text, sourceLanguage, targetLanguage, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    if (!state.provider) {
      throw new Error('TranslatorService not configured');
    }
    
    console.log(`${logPrefix} Translating (${sourceLanguage}->${targetLanguage}):`, text.substring(0, 50));
    
    if (state.provider === 'chrome-ai') {
      const session = await this._getOrCreateSession(sourceLanguage, targetLanguage, tabId);
      const translated = await session.translate(text);
      console.log(`${logPrefix} Translation complete:`, translated.substring(0, 50));
      return translated;
    } 
    else if (state.provider === 'openai' || state.provider === 'ollama') {
      return await this._translateWithOpenAICompatible(text, sourceLanguage, targetLanguage, tabId);
    }
    
    throw new Error(`Unknown provider: ${state.provider}`);
  }

  /**
   * Translate text (streaming)
   * @param {string} text - Text to translate
   * @param {string} sourceLanguage - Source language code
   * @param {string} targetLanguage - Target language code
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {AsyncIterable<string>} Streaming translation chunks
   */
  async *translateStreaming(text, sourceLanguage, targetLanguage, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    if (!state.provider) {
      throw new Error('TranslatorService not configured');
    }
    
    console.log(`${logPrefix} Translating (streaming, ${sourceLanguage}->${targetLanguage}):`, text.substring(0, 50));
    
    if (state.provider === 'chrome-ai') {
      const session = await this._getOrCreateSession(sourceLanguage, targetLanguage, tabId);
      const stream = session.translateStreaming(text);
      
      for await (const chunk of stream) {
        yield chunk;
      }
    }
    else if (state.provider === 'openai' || state.provider === 'ollama') {
      yield* this._translateStreamingWithOpenAICompatible(text, sourceLanguage, targetLanguage, tabId);
    }
    else {
      throw new Error(`Unknown provider: ${state.provider}`);
    }
  }

  /**
   * Translate using OpenAI-compatible API (polyfill for OpenAI/Ollama)
   * @private
   */
  async _translateWithOpenAICompatible(text, sourceLanguage, targetLanguage, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    const prompt = `Translate the following text from ${this._getLanguageName(sourceLanguage)} to ${this._getLanguageName(targetLanguage)}. Only respond with the translation, no additional text or explanations.\n\nText: ${text}`;
    
    // Create abort controller for this request
    state.abortController = new AbortController();
    
    try {
      const response = await state.llmClient.chat.completions.create({
        model: state.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: state.config.temperature,
      }, {
        signal: state.abortController.signal
      });
      
      state.abortController = null;
      const translated = response.choices[0].message.content.trim();
      console.log(`${logPrefix} ${state.provider} translation complete`);
      return translated;
    } catch (error) {
      state.abortController = null;
      
      // Check if error is from abort
      const isAbort = error.name === 'AbortError' || 
                      error.message?.includes('abort') || 
                      error.message?.includes('cancel');
      
      if (isAbort) {
        console.log(`${logPrefix} Translation aborted by user`);
        throw new Error('Translation cancelled');
      }
      
      console.error(`${logPrefix} ${state.provider} translation failed:`, error);
      throw error;
    }
  }

  /**
   * Translate using OpenAI-compatible API (streaming polyfill for OpenAI/Ollama)
   * @private
   */
  async *_translateStreamingWithOpenAICompatible(text, sourceLanguage, targetLanguage, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    const prompt = `Translate the following text from ${this._getLanguageName(sourceLanguage)} to ${this._getLanguageName(targetLanguage)}. Only respond with the translation, no additional text or explanations.\n\nText: ${text}`;
    
    // Create abort controller for this request
    state.abortController = new AbortController();
    
    try {
      const stream = await state.llmClient.chat.completions.create({
        model: state.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: state.config.temperature,
        stream: true,
      }, {
        signal: state.abortController.signal
      });
      
      for await (const chunk of stream) {
        // Check if aborted
        if (!state.abortController) {
          console.log(`${logPrefix} Streaming aborted by user`);
          return;
        }
        
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }
      }
      
      state.abortController = null;
    } catch (error) {
      state.abortController = null;
      
      // Check if error is from abort
      const isAbort = error.name === 'AbortError' || 
                      error.message?.includes('abort') || 
                      error.message?.includes('cancel');
      
      if (isAbort) {
        console.log(`${logPrefix} Streaming translation aborted by user`);
        return;
      }
      
      console.error(`${logPrefix} ${state.provider} streaming translation failed:`, error);
      throw error;
    }
  }

  /**
   * Get language name from code
   * @private
   */
  _getLanguageName(code) {
    const languageNames = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'nl': 'Dutch',
      'pl': 'Polish',
      'tr': 'Turkish',
    };
    return languageNames[code] || code;
  }

  /**
   * Destroy all translator sessions
   * @param {number} tabId - Tab ID (extension mode only)
   */
  async destroy(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    console.log(`${logPrefix} Destroying all translator sessions`);
    
    for (const [key, session] of state.translatorSessions.entries()) {
      try {
        if (session && typeof session.destroy === 'function') {
          session.destroy();
        }
      } catch (error) {
        console.warn(`${logPrefix} Error destroying session ${key}:`, error);
      }
    }
    
    state.translatorSessions.clear();
    console.log(`${logPrefix} All sessions destroyed`);
  }
}

// Export singleton instance
const translatorService = new TranslatorService();
export default translatorService;
