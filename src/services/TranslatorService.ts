/**
 * TranslatorService - Multi-provider Translation service
 * 
 * Supports Chrome AI Translator API (on-device) and polyfills for OpenAI/Ollama.
 * Works in both extension mode (multi-tab) and dev mode (single instance).
 */

import OpenAI from 'openai';
import Logger from './LoggerService';
import { isExtension } from '../utils/PlatformUtils';

type TranslatorProvider = 'chrome-ai' | 'openai' | 'ollama' | 'desktop-local';
type AvailabilityResult = 'readily' | 'downloading' | 'downloadable' | 'unavailable';

type TranslatorConfig = {
  provider: TranslatorProvider;
  model?: string;
  temperature?: number;
};

type ConfigureInput = {
  provider: TranslatorProvider;
  openai?: {
    apiKey: string;
    model?: string;
    temperature?: number;
  };
  ollama?: {
    endpoint: string;
    model: string;
    temperature?: number;
  };
  'desktop-local'?: {
    endpoint: string;
    model?: string;
    temperature?: number;
  };
};

interface TranslatorMonitor {
  addEventListener(event: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
}

interface TranslatorSession {
  translate(text: string): Promise<string>;
  translateStreaming(text: string): AsyncIterable<string>;
  destroy?(): void;
}

interface TranslatorAPI {
  availability(params: { sourceLanguage: string; targetLanguage: string }): Promise<AvailabilityResult>;
  create(params: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: TranslatorMonitor) => void;
  }): Promise<TranslatorSession>;
}

interface TranslatorState {
  translatorSessions: Map<string, TranslatorSession>;
  config: TranslatorConfig | null;
  provider: TranslatorProvider | null;
  llmClient: OpenAI | null;
  abortController: AbortController | null;
}

const getTranslatorApi = (): TranslatorAPI | null => {
  const maybeGlobal = self as typeof globalThis & { Translator?: TranslatorAPI };
  return maybeGlobal.Translator ?? null;
};

const asError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
};

const isAbortError = (error: unknown): boolean => {
  const normalized = asError(error);
  const msg = normalized.message.toLowerCase();
  return normalized.name === 'AbortError' || msg.includes('abort') || msg.includes('cancel');
};

class TranslatorService {
  private readonly isExtensionMode: boolean;
  private readonly tabStates: Map<number, TranslatorState>;
  private readonly devState: TranslatorState;

  constructor() {
    this.isExtensionMode = isExtension;
    this.tabStates = new Map();
    this.devState = {
      translatorSessions: new Map(),
      config: null,
      provider: null,
      llmClient: null,
      abortController: null,
    };
    
    if (this.isExtensionMode) {
      return;
    }
  }

  /**
   * Initialize state for a tab (extension mode only)
   * @param {number} tabId - Tab ID
   */
  initTab(tabId: number): void {
    if (!this.isExtensionMode) return;
    
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        translatorSessions: new Map(),
        config: null,
        provider: null,
        llmClient: null,
        abortController: null,
      });
      Logger.log('TranslatorService', `Tab ${tabId} initialized`);
    }
  }

  /**
   * Cleanup tab state (extension mode only)
   * @param {number} tabId - Tab ID
   */
  cleanupTab(tabId: number): void {
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
          Logger.warn('TranslatorService', 'Error destroying session:', error);
        }
      }
      this.tabStates.delete(tabId);
      Logger.log('TranslatorService', `Tab ${tabId} cleaned up`);
    }
  }

  /**
   * Get state object for current context
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Object} State object
   */
  _getState(tabId: number | null = null): TranslatorState {
    if (this.isExtensionMode) {
      if (tabId === null) {
        throw new Error('tabId is required in extension mode');
      }
      this.initTab(tabId);
      return this.tabStates.get(tabId) as TranslatorState;
    }
    return this.devState;
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
  async configure(config: ConfigureInput, tabId: number | null = null): Promise<boolean> {
    const state = this._getState(tabId);
    const { provider } = config;
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    Logger.log('other', `${logPrefix} Configuring provider: ${provider}`);
    
    try {
      if (provider === 'chrome-ai') {
        // Check Chrome AI Translator availability
        if (!getTranslatorApi()) {
          throw new Error('Chrome AI Translator not available. Chrome 138+ required.');
        }
        
        state.config = { provider: 'chrome-ai' };
        state.provider = 'chrome-ai';
        Logger.log('other', `${logPrefix} Chrome AI Translator configured`);
      } 
      else if (provider === 'openai') {
        const openaiConfig = config.openai;
        if (!openaiConfig?.apiKey) {
          throw new Error('Missing OpenAI configuration');
        }
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
        Logger.log('other', `${logPrefix} OpenAI configured for translation`);
      }
      else if (provider === 'ollama') {
        const ollamaConfig = config.ollama;
        if (!ollamaConfig?.endpoint || !ollamaConfig.model) {
          throw new Error('Missing Ollama configuration');
        }
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
        Logger.log('other', `${logPrefix} Ollama configured for translation`);
      }
      else if (provider === 'desktop-local') {
        const desktopConfig = config['desktop-local'];
        if (!desktopConfig?.endpoint) {
          throw new Error('Missing desktop-local configuration');
        }
        state.llmClient = new OpenAI({
          apiKey: 'desktop-local',
          baseURL: desktopConfig.endpoint + '/v1',
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });
        
        state.config = {
          provider: 'desktop-local',
          model: desktopConfig.model || 'local',
          temperature: desktopConfig.temperature || 0.3,
        };
        state.provider = 'desktop-local';
        Logger.log('other', `${logPrefix} Desktop Local configured for translation`);
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
      throw asError(error);
    }
  }

  /**
   * Check if service is configured
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {boolean} True if configured
   */
  isConfigured(tabId: number | null = null): boolean {
    const state = this._getState(tabId);
    return Boolean(state.config && state.provider);
  }

  /**
   * Abort ongoing translation request
   * @param {number} tabId - Tab ID (extension mode only)
   */
  abort(tabId: number | null = null): void {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    if (state.abortController) {
      Logger.log('other', `${logPrefix} Aborting translation request`);
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
  async checkAvailability(sourceLanguage: string, targetLanguage: string, tabId: number | null = null): Promise<AvailabilityResult> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    if (!state.provider) {
      return 'unavailable';
    }
    
    if (state.provider === 'chrome-ai') {
      const translatorApi = getTranslatorApi();
      if (!translatorApi) {
        return 'unavailable';
      }
      
      try {
        const availability = await translatorApi.availability({
          sourceLanguage,
          targetLanguage
        });
        Logger.log('other', `${logPrefix} Translator availability for ${sourceLanguage}->${targetLanguage}:`, availability);
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
   * Get or create translator session for language pair
   * @param {string} sourceLanguage - Source language code
   * @param {string} targetLanguage - Target language code
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<Object>} Translator session
   */
  async _getOrCreateSession(sourceLanguage: string, targetLanguage: string, tabId: number | null = null): Promise<TranslatorSession | null> {
    const state = this._getState(tabId);
    const sessionKey = `${sourceLanguage}-${targetLanguage}`;
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    if (state.provider !== 'chrome-ai') {
      // No sessions for OpenAI/Ollama
      return null;
    }
    
    if (state.translatorSessions.has(sessionKey)) {
      return state.translatorSessions.get(sessionKey) ?? null;
    }
    
    // Create new Chrome AI Translator session
    try {
      Logger.log('other', `${logPrefix} Creating translator session: ${sessionKey}`);
      const translatorApi = getTranslatorApi();
      if (!translatorApi) {
        throw new Error('Chrome AI Translator API unavailable');
      }

      const session = await translatorApi.create({
        sourceLanguage,
        targetLanguage,
        monitor(monitor: TranslatorMonitor) {
          monitor.addEventListener('downloadprogress', (e: { loaded: number }) => {
            Logger.log('other', `${logPrefix} Translation model download: ${(e.loaded * 100).toFixed(1)}%`);
          });
        }
      });
      
      state.translatorSessions.set(sessionKey, session);
      Logger.log('other', `${logPrefix} Translator session created: ${sessionKey}`);
      return session;
    } catch (error) {
      Logger.error('other', `${logPrefix} Failed to create translator session:`, error);
      throw asError(error);
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
  async translate(text: string, sourceLanguage: string, targetLanguage: string, tabId: number | null = null): Promise<string> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    if (!state.provider) {
      throw new Error('TranslatorService not configured');
    }
    
    Logger.log('other', `${logPrefix} Translating (${sourceLanguage}->${targetLanguage}):`, text.substring(0, 50));
    
    if (state.provider === 'chrome-ai') {
      const session = await this._getOrCreateSession(sourceLanguage, targetLanguage, tabId);
      if (!session) {
        throw new Error('Translator session unavailable');
      }
      const translated = await session.translate(text);
      Logger.log('other', `${logPrefix} Translation complete:`, translated.substring(0, 50));
      return translated;
    } 
    else if (state.provider === 'openai' || state.provider === 'ollama' || state.provider === 'desktop-local') {
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
  async *translateStreaming(text: string, sourceLanguage: string, targetLanguage: string, tabId: number | null = null): AsyncIterable<string> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    if (!state.provider) {
      throw new Error('TranslatorService not configured');
    }
    
    Logger.log('other', `${logPrefix} Translating (streaming, ${sourceLanguage}->${targetLanguage}):`, text.substring(0, 50));
    
    if (state.provider === 'chrome-ai') {
      const session = await this._getOrCreateSession(sourceLanguage, targetLanguage, tabId);
      if (!session) {
        throw new Error('Translator session unavailable');
      }
      const stream = session.translateStreaming(text);
      
      for await (const chunk of stream) {
        yield chunk;
      }
    }
    else if (state.provider === 'openai' || state.provider === 'ollama' || state.provider === 'desktop-local') {
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
  async _translateWithOpenAICompatible(text: string, sourceLanguage: string, targetLanguage: string, tabId: number | null = null): Promise<string> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    const prompt = `Translate the following text from ${this._getLanguageName(sourceLanguage)} to ${this._getLanguageName(targetLanguage)}. Only respond with the translation, no additional text or explanations.\n\nText: ${text}`;
    
    // Create abort controller for this request
    state.abortController = new AbortController();
    if (!state.llmClient || !state.config?.model) {
      throw new Error('Translator LLM client not configured');
    }
    
    try {
      const response = await state.llmClient.chat.completions.create({
        model: state.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: state.config.temperature ?? null,
      }, {
        signal: state.abortController.signal
      });
      
      state.abortController = null;
      const translated = response.choices[0]?.message?.content?.trim() ?? '';
      Logger.log('other', `${logPrefix} ${state.provider} translation complete`);
      return translated;
    } catch (error) {
      state.abortController = null;
      
      // Check if error is from abort
      const isAbort = isAbortError(error);
      
      if (isAbort) {
        Logger.log('other', `${logPrefix} Translation aborted by user`);
        throw new Error('Translation cancelled');
      }
      
      Logger.error('other', `${logPrefix} ${state.provider} translation failed:`, error);
      throw asError(error);
    }
  }

  /**
   * Translate using OpenAI-compatible API (streaming polyfill for OpenAI/Ollama)
   * @private
   */
  async *_translateStreamingWithOpenAICompatible(text: string, sourceLanguage: string, targetLanguage: string, tabId: number | null = null): AsyncIterable<string> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    const prompt = `Translate the following text from ${this._getLanguageName(sourceLanguage)} to ${this._getLanguageName(targetLanguage)}. Only respond with the translation, no additional text or explanations.\n\nText: ${text}`;
    
    // Create abort controller for this request
    state.abortController = new AbortController();
    if (!state.llmClient || !state.config?.model) {
      throw new Error('Translator LLM client not configured');
    }
    
    try {
      const stream = await state.llmClient.chat.completions.create({
        model: state.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: state.config.temperature ?? null,
        stream: true,
      }, {
        signal: state.abortController.signal
      });
      
      for await (const chunk of stream) {
        // Check if aborted
        if (!state.abortController) {
          Logger.log('other', `${logPrefix} Streaming aborted by user`);
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
      const isAbort = isAbortError(error);
      
      if (isAbort) {
        Logger.log('other', `${logPrefix} Streaming translation aborted by user`);
        return;
      }
      
      Logger.error('other', `${logPrefix} ${state.provider} streaming translation failed:`, error);
      throw asError(error);
    }
  }

  /**
   * Get language name from code
   * @private
   */
  _getLanguageName(code: string): string {
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
    const record = languageNames as Record<string, string>;
    return record[code] || code;
  }

  /**
   * Destroy all translator sessions
   * @param {number} tabId - Tab ID (extension mode only)
   */
  async destroy(tabId: number | null = null): Promise<void> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TranslatorService] Tab ${tabId}` : '[TranslatorService]';
    
    Logger.log('other', `${logPrefix} Destroying all translator sessions`);
    
    for (const [key, session] of state.translatorSessions.entries()) {
      try {
        if (session && typeof session.destroy === 'function') {
          session.destroy();
        }
      } catch (error) {
        Logger.warn('other', `${logPrefix} Error destroying session ${key}:`, error);
      }
    }
    
    state.translatorSessions.clear();
    Logger.log('other', `${logPrefix} All sessions destroyed`);
  }
}

// Export singleton instance
const translatorService = new TranslatorService();
export default translatorService;
