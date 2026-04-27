/**
 * LanguageDetectorService - Multi-provider Language Detection service
 * 
 * Supports Chrome AI LanguageDetector API (on-device) and polyfills for OpenAI/Ollama.
 * Works in both extension mode (multi-tab) and dev mode (single instance).
 */

import OpenAI from 'openai';
import Logger from './LoggerService';

class LanguageDetectorService {
  constructor() {
    this.isExtensionMode = __EXTENSION_MODE__;
    
    if (this.isExtensionMode) {
      this.tabStates = new Map();
    } else {
      this.detectorSession = null;
      this.config = null;
      this.provider = null;
      this.llmClient = null;
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
        detectorSession: null,
        config: null,
        provider: null,
        llmClient: null,
      });
      Logger.log('LanguageDetectorService', `Tab ${tabId} initialized`);
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
      // Destroy detector session if it exists
      if (state.detectorSession) {
        try {
          if (typeof state.detectorSession.destroy === 'function') {
            state.detectorSession.destroy();
          }
        } catch (error) {
          Logger.warn('LanguageDetectorService', 'Error destroying session:', error);
        }
      }
      this.tabStates.delete(tabId);
      Logger.log('LanguageDetectorService', `Tab ${tabId} cleaned up`);
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
   * Configure language detector with provider settings
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
    const logPrefix = this.isExtensionMode ? `[LanguageDetectorService] Tab ${tabId}` : '[LanguageDetectorService]';
    
    Logger.log('other', `${logPrefix} Configuring provider: ${provider}`);
    
    try {
      if (provider === 'chrome-ai') {
        // Check Chrome AI LanguageDetector availability
        if (!('LanguageDetector' in self)) {
          throw new Error('Chrome AI LanguageDetector not available. Chrome 138+ required.');
        }
        
        state.config = { provider: 'chrome-ai' };
        state.provider = 'chrome-ai';
        Logger.log('other', `${logPrefix} Chrome AI LanguageDetector configured`);
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
          temperature: openaiConfig.temperature || 0.1,
        };
        state.provider = 'openai';
        Logger.log('other', `${logPrefix} OpenAI configured for language detection`);
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
          temperature: ollamaConfig.temperature || 0.1,
        };
        state.provider = 'ollama';
        Logger.log('other', `${logPrefix} Ollama configured for language detection`);
      }
      else {
        throw new Error(`Unknown provider: ${provider}`);
      }
      
      return true;
    } catch (error) {
      Logger.error('other', `${logPrefix} Configuration failed:`, error);
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
   * Check availability of language detection
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} 'readily', 'downloading', 'downloadable', or 'unavailable'
   */
  async checkAvailability(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[LanguageDetectorService] Tab ${tabId}` : '[LanguageDetectorService]';
    
    if (!state.provider) {
      return 'unavailable';
    }
    
    if (state.provider === 'chrome-ai') {
      if (!('LanguageDetector' in self)) {
        return 'unavailable';
      }
      
      try {
        const availability = await self.LanguageDetector.availability();
        Logger.log('other', `${logPrefix} LanguageDetector availability:`, availability);
        return availability;
      } catch (error) {
        Logger.error('other', `${logPrefix} Failed to check availability:`, error);
        return 'unavailable';
      }
    } else {
      // For OpenAI/Ollama, always ready (cloud-based)
      return 'readily';
    }
  }

  /**
   * Get or create language detector session
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<Object>} LanguageDetector session
   */
  async _getOrCreateSession(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[LanguageDetectorService] Tab ${tabId}` : '[LanguageDetectorService]';
    
    if (state.provider !== 'chrome-ai') {
      // No sessions for OpenAI/Ollama
      return null;
    }
    
    if (state.detectorSession) {
      return state.detectorSession;
    }
    
    // Create new Chrome AI LanguageDetector session
    try {
      Logger.log('other', `${logPrefix} Creating language detector session`);
      const session = await self.LanguageDetector.create();
      
      state.detectorSession = session;
      Logger.log('other', `${logPrefix} Language detector session created`);
      return session;
    } catch (error) {
      Logger.error('other', `${logPrefix} Failed to create language detector session:`, error);
      throw error;
    }
  }

  /**
   * Detect language of text
   * @param {string} text - Text to analyze
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<Array>} Array of {detectedLanguage: string, confidence: number} sorted by confidence
   */
  async detect(text, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[LanguageDetectorService] Tab ${tabId}` : '[LanguageDetectorService]';
    
    if (!state.provider) {
      throw new Error('LanguageDetectorService not configured');
    }
    
    Logger.log('other', `${logPrefix} Detecting language:`, text.substring(0, 50));
    
    if (state.provider === 'chrome-ai') {
      const session = await this._getOrCreateSession(tabId);
      const results = await session.detect(text);
      Logger.log('other', `${logPrefix} Detection complete:`, results.slice(0, 3));
      return results;
    } 
    else if (state.provider === 'openai' || state.provider === 'ollama') {
      return await this._detectWithOpenAICompatible(text, tabId);
    }
    
    throw new Error(`Unknown provider: ${state.provider}`);
  }

  /**
   * Detect language using OpenAI-compatible API (polyfill for OpenAI/Ollama)
   * @private
   */
  async _detectWithOpenAICompatible(text, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[LanguageDetectorService] Tab ${tabId}` : '[LanguageDetectorService]';
    
    const prompt = `Detect the language of the following text. Respond ONLY with a JSON array of language detections in this exact format, sorted by confidence (highest first):
[
  {"detectedLanguage": "en", "confidence": 0.95},
  {"detectedLanguage": "es", "confidence": 0.03}
]

Use ISO 639-1 language codes (en, es, fr, de, ja, zh, etc.). The confidence values should sum to approximately 1.0.

Text: ${text}`;
    
    try {
      const response = await state.llmClient.chat.completions.create({
        model: state.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: state.config.temperature,
      });
      
      const content = response.choices[0].message.content.trim();
      // Parse JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('Failed to parse language detection response');
      }
      
      const results = JSON.parse(jsonMatch[0]);
      Logger.log('other', `${logPrefix} ${state.provider} detection complete:`, results.slice(0, 3));
      return results;
    } catch (error) {
      Logger.error('other', `${logPrefix} ${state.provider} detection failed:`, error);
      // Fallback to English with low confidence
      return [
        { detectedLanguage: 'en', confidence: 0.5 }
      ];
    }
  }

  /**
   * Destroy language detector session
   * @param {number} tabId - Tab ID (extension mode only)
   */
  async destroy(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[LanguageDetectorService] Tab ${tabId}` : '[LanguageDetectorService]';
    
    if (state.detectorSession) {
      Logger.log('other', `${logPrefix} Destroying language detector session`);
      try {
        if (typeof state.detectorSession.destroy === 'function') {
          state.detectorSession.destroy();
        }
      } catch (error) {
        Logger.warn('other', `${logPrefix} Error destroying session:`, error);
      }
      state.detectorSession = null;
    }
  }
}

// Export singleton instance
const languageDetectorService = new LanguageDetectorService();
export default languageDetectorService;
