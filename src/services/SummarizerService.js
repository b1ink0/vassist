/**
 * SummarizerService - Multi-provider Text Summarization service
 * 
 * Supports Chrome AI Summarizer API (on-device) and polyfills for OpenAI/Ollama.
 * Works in both extension mode (multi-tab) and dev mode (single instance).
 */

import OpenAI from 'openai';
import Logger from './LoggerService';

class SummarizerService {
  constructor() {
    this.isExtensionMode = __EXTENSION_MODE__;
    
    if (this.isExtensionMode) {
      this.tabStates = new Map();
    } else {
      this.summarizerSessions = new Map(); // key: "type-format-length", value: Summarizer session
      this.config = null;
      this.provider = null;
      this.llmClient = null;
      this.abortController = null;
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
        summarizerSessions: new Map(),
        config: null,
        provider: null,
        llmClient: null,
        abortController: null,
      });
      Logger.log('SummarizerService', `Tab ${tabId} initialized`);
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
      
      // Destroy all summarizer sessions
      for (const session of state.summarizerSessions.values()) {
        try {
          if (session && typeof session.destroy === 'function') {
            session.destroy();
          }
        } catch (error) {
          Logger.warn('SummarizerService', 'Error destroying session:', error);
        }
      }
      this.tabStates.delete(tabId);
      Logger.log('SummarizerService', `Tab ${tabId} cleaned up`);
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
   * Configure summarizer with provider settings
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
    const logPrefix = this.isExtensionMode ? `[SummarizerService] Tab ${tabId}` : '[SummarizerService]';
    
    Logger.log('other', `${logPrefix} Configuring provider: ${provider}`);
    
    try {
      if (provider === 'chrome-ai') {
        // Check Chrome AI Summarizer availability
        if (!('Summarizer' in self)) {
          throw new Error('Chrome AI Summarizer not available. Chrome 138+ required.');
        }
        
        state.config = { provider: 'chrome-ai' };
        state.provider = 'chrome-ai';
        Logger.log('other', `${logPrefix} Chrome AI Summarizer configured`);
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
          temperature: openaiConfig.temperature || 0.5,
        };
        state.provider = 'openai';
        Logger.log('other', `${logPrefix} OpenAI configured for summarization`);
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
          temperature: ollamaConfig.temperature || 0.5,
        };
        state.provider = 'ollama';
        Logger.log('other', `${logPrefix} Ollama configured for summarization`);
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
   * Abort ongoing summarization request
   * @param {number} tabId - Tab ID (extension mode only)
   */
  abort(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[SummarizerService] Tab ${tabId}` : '[SummarizerService]';
    
    if (state.abortController) {
      Logger.log('other', `${logPrefix} Aborting summarization request`);
      state.abortController.abort();
      state.abortController = null;
    }
  }

  /**
   * Check availability of summarization
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} 'readily', 'downloading', 'downloadable', or 'unavailable'
   */
  async checkAvailability(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[SummarizerService] Tab ${tabId}` : '[SummarizerService]';
    
    if (!state.provider) {
      return 'unavailable';
    }
    
    if (state.provider === 'chrome-ai') {
      if (!('Summarizer' in self)) {
        return 'unavailable';
      }
      
      try {
        const availability = await self.Summarizer.availability();
        Logger.log('other', `${logPrefix} Summarizer availability:`, availability);
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
   * Get or create summarizer session
   * @param {string} type - Summary type: 'tldr', 'key-points', 'teaser', 'headline'
   * @param {string} format - Output format: 'plain-text' or 'markdown'
   * @param {string} length - Summary length: 'short', 'medium', 'long'
   * @param {string} sharedContext - Optional context for the summarizer
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<Object>} Summarizer session
   */
  async _getOrCreateSession(type = 'tldr', format = 'plain-text', length = 'medium', sharedContext = '', tabId = null) {
    const state = this._getState(tabId);
    const sessionKey = `${type}-${format}-${length}-${sharedContext}`;
    const logPrefix = this.isExtensionMode ? `[SummarizerService] Tab ${tabId}` : '[SummarizerService]';
    
    if (state.provider !== 'chrome-ai') {
      // No sessions for OpenAI/Ollama
      return null;
    }
    
    if (state.summarizerSessions.has(sessionKey)) {
      return state.summarizerSessions.get(sessionKey);
    }
    
    // Create new Chrome AI Summarizer session
    try {
      Logger.log('other', `${logPrefix} Creating summarizer session: ${sessionKey}`);
      const session = await self.Summarizer.create({
        type,
        format,
        length,
        sharedContext,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            Logger.log('other', `${logPrefix} Summarizer model download: ${(e.loaded * 100).toFixed(1)}%`);
          });
        }
      });
      
      state.summarizerSessions.set(sessionKey, session);
      Logger.log('other', `${logPrefix} Summarizer session created: ${sessionKey}`);
      return session;
    } catch (error) {
      Logger.error('other', `${logPrefix} Failed to create summarizer session:`, error);
      throw error;
    }
  }

  /**
   * Summarize text (batch, non-streaming)
   * @param {string} text - Text to summarize
   * @param {Object} options - Summarization options
   * @param {string} options.type - Summary type: 'tldr', 'key-points', 'teaser', 'headline'
   * @param {string} options.format - Output format: 'plain-text' or 'markdown'
   * @param {string} options.length - Summary length: 'short', 'medium', 'long'
   * @param {string} options.context - Optional additional context
   * @param {string} options.sharedContext - Optional shared context for the session
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} Summary
   */
  async summarize(text, options = {}, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[SummarizerService] Tab ${tabId}` : '[SummarizerService]';
    
    if (!state.provider) {
      throw new Error('SummarizerService not configured');
    }
    
    const {
      type = 'tldr',
      format = 'plain-text',
      length = 'medium',
      context = '',
      sharedContext = ''
    } = options;
    
    Logger.log('other', `${logPrefix} Summarizing (${type}, ${format}, ${length}):`, text.substring(0, 50));
    
    if (state.provider === 'chrome-ai') {
      const session = await this._getOrCreateSession(type, format, length, sharedContext, tabId);
      const summary = await session.summarize(text, { context });
      Logger.log('other', `${logPrefix} Summarization complete:`, summary.substring(0, 50));
      return summary;
    } 
    else if (state.provider === 'openai' || state.provider === 'ollama') {
      return await this._summarizeWithOpenAICompatible(text, type, format, length, context, tabId);
    }
    
    throw new Error(`Unknown provider: ${state.provider}`);
  }

  /**
   * Summarize text (streaming)
   * @param {string} text - Text to summarize
   * @param {Object} options - Summarization options (same as summarize())
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {AsyncIterable<string>} Streaming summary chunks
   */
  async *summarizeStreaming(text, options = {}, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[SummarizerService] Tab ${tabId}` : '[SummarizerService]';
    
    if (!state.provider) {
      Logger.error('other', `${logPrefix} Service not configured! State:`, {
        hasState: !!state,
        provider: state?.provider,
        config: state?.config,
        isExtensionMode: this.isExtensionMode,
        tabId,
        totalTabs: this.isExtensionMode ? this.tabStates.size : 'N/A'
      });
      throw new Error('SummarizerService not configured');
    }
    
    const {
      type = 'tldr',
      format = 'plain-text',
      length = 'medium',
      context = '',
      sharedContext = ''
    } = options;
    
    Logger.log('other', `${logPrefix} Summarizing (streaming, ${type}, ${format}, ${length}):`, text.substring(0, 50));
    
    if (state.provider === 'chrome-ai') {
      const session = await this._getOrCreateSession(type, format, length, sharedContext, tabId);
      const stream = session.summarizeStreaming(text, { context });
      
      for await (const chunk of stream) {
        yield chunk;
      }
    }
    else if (state.provider === 'openai' || state.provider === 'ollama') {
      yield* this._summarizeStreamingWithOpenAICompatible(text, type, format, length, context, tabId);
    }
    else {
      throw new Error(`Unknown provider: ${state.provider}`);
    }
  }

  /**
   * Summarize using OpenAI-compatible API (polyfill for OpenAI/Ollama)
   * @private
   */
  async _summarizeWithOpenAICompatible(text, type, format, length, context, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[SummarizerService] Tab ${tabId}` : '[SummarizerService]';
    
    const prompt = this._buildSummaryPrompt(text, type, format, length, context);
    
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
      const summary = response.choices[0].message.content.trim();
      Logger.log('other', `${logPrefix} ${state.provider} summarization complete`);
      return summary;
    } catch (error) {
      Logger.error('other', `${logPrefix} ${state.provider} summarization failed:`, error);
      throw error;
    }
  }

  /**
   * Summarize using OpenAI-compatible API (streaming polyfill for OpenAI/Ollama)
   * @private
   */
  async *_summarizeStreamingWithOpenAICompatible(text, type, format, length, context, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[SummarizerService] Tab ${tabId}` : '[SummarizerService]';
    
    const prompt = this._buildSummaryPrompt(text, type, format, length, context);
    
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
      const isAbort = error.name === 'AbortError' || 
                      error.message?.includes('abort') || 
                      error.message?.includes('cancel');
      
      if (isAbort) {
        Logger.log('other', `${logPrefix} Streaming aborted by user`);
        return;
      }
      
      Logger.error('other', `${logPrefix} ${state.provider} streaming summarization failed:`, error);
      throw error;
    }
  }

  /**
   * Build summary prompt for LLM polyfills
   * @private
   */
  _buildSummaryPrompt(text, type, format, length, context) {
    let typeInstruction = '';
    let lengthInstruction = '';
    
    // Type-specific instructions
    switch (type) {
      case 'tldr':
        typeInstruction = 'Provide a brief overview/TL;DR of the text.';
        break;
      case 'key-points':
        typeInstruction = 'Extract and list the key points from the text as bullet points.';
        break;
      case 'teaser':
        typeInstruction = 'Create an engaging teaser/hook for the text.';
        break;
      case 'headline':
        typeInstruction = 'Create a concise headline or title for the text.';
        break;
      default:
        typeInstruction = 'Summarize the text.';
    }
    
    // Length-specific instructions
    switch (length) {
      case 'short':
        lengthInstruction = type === 'key-points' ? 'Use 3 bullet points maximum.' :
                           type === 'headline' ? 'Single short phrase only.' :
                           'Keep it to 1-2 sentences maximum.';
        break;
      case 'medium':
        lengthInstruction = type === 'key-points' ? 'Use 5-7 bullet points.' :
                           type === 'headline' ? 'N/A' :
                           'Keep it to 2-4 sentences.';
        break;
      case 'long':
        lengthInstruction = type === 'key-points' ? 'Use 10+ bullet points.' :
                           type === 'headline' ? 'N/A' :
                           'Use 4+ sentences for detailed summary.';
        break;
    }
    
    // Format instruction
    const formatInstruction = format === 'markdown' ? 
      'Use markdown formatting.' : 
      'Use plain text only, no markdown.';
    
    let prompt = `${typeInstruction} ${lengthInstruction} ${formatInstruction}`;
    
    if (context) {
      prompt += `\n\nAdditional context: ${context}`;
    }
    
    prompt += `\n\nText to summarize:\n${text}`;
    
    return prompt;
  }

  /**
   * Destroy all summarizer sessions
   * @param {number} tabId - Tab ID (extension mode only)
   */
  async destroy(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[SummarizerService] Tab ${tabId}` : '[SummarizerService]';
    
    Logger.log('other', `${logPrefix} Destroying all summarizer sessions`);
    
    for (const [key, session] of state.summarizerSessions.entries()) {
      try {
        if (session && typeof session.destroy === 'function') {
          session.destroy();
        }
      } catch (error) {
        Logger.warn('other', `${logPrefix} Error destroying session ${key}:`, error);
      }
    }
    
    state.summarizerSessions.clear();
    Logger.log('other', `${logPrefix} All sessions destroyed`);
  }
}

// Export singleton instance
const summarizerService = new SummarizerService();
export default summarizerService;
