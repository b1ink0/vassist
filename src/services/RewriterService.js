/**
 * RewriterService - Multi-provider Text Rewriting service
 * 
 * Supports Chrome AI Rewriter API (on-device) and polyfills for OpenAI/Ollama.
 * Works in both extension mode (multi-tab) and dev mode (single instance).
 */

import OpenAI from 'openai';

class RewriterService {
  constructor() {
    this.isExtensionMode = __EXTENSION_MODE__;
    
    if (this.isExtensionMode) {
      this.tabStates = new Map();
      console.log('[RewriterService] Initialized (Extension mode - multi-tab)');
    } else {
      this.rewriterSessions = new Map(); // key: "tone-format-length-sharedContext", value: Rewriter session
      this.config = null;
      this.provider = null;
      this.llmClient = null;
      this.abortController = null;
      console.log('[RewriterService] Initialized (Dev mode)');
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
        rewriterSessions: new Map(),
        config: null,
        provider: null,
        llmClient: null,
        abortController: null,
      });
      console.log(`[RewriterService] Tab ${tabId} initialized`);
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
      
      // Destroy all rewriter sessions
      for (const session of state.rewriterSessions.values()) {
        try {
          if (session && typeof session.destroy === 'function') {
            session.destroy();
          }
        } catch (error) {
          console.warn(`[RewriterService] Error destroying session:`, error);
        }
      }
      this.tabStates.delete(tabId);
      console.log(`[RewriterService] Tab ${tabId} cleaned up`);
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
   * Configure rewriter with provider settings
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
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    console.log(`${logPrefix} Configuring provider: ${provider}`);
    
    try {
      if (provider === 'chrome-ai') {
        // Check Chrome AI Rewriter availability
        if (!('Rewriter' in self)) {
          throw new Error('Chrome AI Rewriter not available. Chrome 139+ required with origin trial token.');
        }
        
        state.config = { provider: 'chrome-ai' };
        state.provider = 'chrome-ai';
        console.log(`${logPrefix} Chrome AI Rewriter configured`);
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
          temperature: openaiConfig.temperature || 0.7,
        };
        state.provider = 'openai';
        console.log(`${logPrefix} OpenAI configured for rewriting`);
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
          temperature: ollamaConfig.temperature || 0.7,
        };
        state.provider = 'ollama';
        console.log(`${logPrefix} Ollama configured for rewriting`);
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
   * Abort ongoing rewrite request
   * @param {number} tabId - Tab ID (extension mode only)
   */
  abort(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    if (state.abortController) {
      console.log(`${logPrefix} Aborting rewrite request`);
      state.abortController.abort();
      state.abortController = null;
    }
  }

  /**
   * Check availability of rewriter
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} 'readily', 'downloading', 'downloadable', or 'unavailable'
   */
  async checkAvailability(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    if (!state.provider) {
      return 'unavailable';
    }
    
    if (state.provider === 'chrome-ai') {
      if (!('Rewriter' in self)) {
        return 'unavailable';
      }
      
      try {
        const availability = await self.Rewriter.availability();
        console.log(`${logPrefix} Rewriter availability:`, availability);
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
   * Get or create rewriter session
   * @param {string} tone - Tone: 'as-is', 'more-formal', 'more-casual'
   * @param {string} format - Output format: 'as-is', 'plain-text', 'markdown'
   * @param {string} length - Rewrite length: 'as-is', 'shorter', 'longer'
   * @param {string} sharedContext - Optional context for the rewriter
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<Object>} Rewriter session
   */
  async _getOrCreateSession(tone = 'as-is', format = 'as-is', length = 'as-is', sharedContext = '', tabId = null) {
    const state = this._getState(tabId);
    const sessionKey = `${tone}-${format}-${length}-${sharedContext}`;
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    if (state.provider !== 'chrome-ai') {
      // No sessions for OpenAI/Ollama
      return null;
    }
    
    if (state.rewriterSessions.has(sessionKey)) {
      return state.rewriterSessions.get(sessionKey);
    }
    
    // Create new Chrome AI Rewriter session
    try {
      console.log(`${logPrefix} Creating rewriter session: ${sessionKey}`);
      const session = await self.Rewriter.create({
        tone,
        format,
        length,
        sharedContext,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            console.log(`${logPrefix} Rewriter model download: ${(e.loaded * 100).toFixed(1)}%`);
          });
        }
      });
      
      state.rewriterSessions.set(sessionKey, session);
      console.log(`${logPrefix} Rewriter session created: ${sessionKey}`);
      return session;
    } catch (error) {
      console.error(`${logPrefix} Failed to create rewriter session:`, error);
      throw error;
    }
  }

  /**
   * Rewrite text (batch, non-streaming)
   * @param {string} text - Text to rewrite
   * @param {Object} options - Rewrite options
   * @param {string} options.tone - Tone: 'as-is', 'more-formal', 'more-casual'
   * @param {string} options.format - Output format: 'as-is', 'plain-text', 'markdown'
   * @param {string} options.length - Rewrite length: 'as-is', 'shorter', 'longer'
   * @param {string} options.context - Optional additional context
   * @param {string} options.sharedContext - Optional shared context for the session
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} Rewritten text
   */
  async rewrite(text, options = {}, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    if (!state.provider) {
      throw new Error('RewriterService not configured');
    }
    
    const {
      tone = 'as-is',
      format = 'as-is',
      length = 'as-is',
      context = '',
      sharedContext = ''
    } = options;
    
    console.log(`${logPrefix} Rewriting (${tone}, ${format}, ${length}):`, text.substring(0, 50));
    
    if (state.provider === 'chrome-ai') {
      const session = await this._getOrCreateSession(tone, format, length, sharedContext, tabId);
      const rewritten = await session.rewrite(text, { context });
      console.log(`${logPrefix} Rewrite complete:`, rewritten.substring(0, 50));
      return rewritten;
    } 
    else if (state.provider === 'openai' || state.provider === 'ollama') {
      return await this._rewriteWithOpenAICompatible(text, tone, format, length, context, tabId);
    }
    
    throw new Error(`Unknown provider: ${state.provider}`);
  }

  /**
   * Rewrite text (streaming)
   * @param {string} text - Text to rewrite
   * @param {Object} options - Rewrite options (same as rewrite())
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {AsyncIterable<string>} Streaming rewrite chunks
   */
  async *rewriteStreaming(text, options = {}, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    if (!state.provider) {
      throw new Error('RewriterService not configured');
    }
    
    const {
      tone = 'as-is',
      format = 'as-is',
      length = 'as-is',
      context = '',
      sharedContext = ''
    } = options;
    
    console.log(`${logPrefix} Rewriting (streaming, ${tone}, ${format}, ${length}):`, text.substring(0, 50));
    
    if (state.provider === 'chrome-ai') {
      const session = await this._getOrCreateSession(tone, format, length, sharedContext, tabId);
      const stream = session.rewriteStreaming(text, { context });
      
      for await (const chunk of stream) {
        yield chunk;
      }
    }
    else if (state.provider === 'openai' || state.provider === 'ollama') {
      yield* this._rewriteStreamingWithOpenAICompatible(text, tone, format, length, context, tabId);
    }
    else {
      throw new Error(`Unknown provider: ${state.provider}`);
    }
  }

  /**
   * Rewrite using OpenAI-compatible API (polyfill for OpenAI/Ollama)
   * @private
   */
  async _rewriteWithOpenAICompatible(text, tone, format, length, context, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    const prompt = this._buildRewritePrompt(text, tone, format, length, context);
    
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
      const rewritten = response.choices[0].message.content.trim();
      console.log(`${logPrefix} ${state.provider} rewrite complete`);
      return rewritten;
    } catch (error) {
      state.abortController = null;
      
      // Check if error is from abort
      const isAbort = error.name === 'AbortError' || 
                      error.message?.includes('abort') || 
                      error.message?.includes('cancel');
      
      if (isAbort) {
        console.log(`${logPrefix} Rewrite aborted by user`);
        throw new Error('Rewrite cancelled');
      }
      
      console.error(`${logPrefix} ${state.provider} rewrite failed:`, error);
      throw error;
    }
  }

  /**
   * Rewrite using OpenAI-compatible API (streaming polyfill for OpenAI/Ollama)
   * @private
   */
  async *_rewriteStreamingWithOpenAICompatible(text, tone, format, length, context, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    const prompt = this._buildRewritePrompt(text, tone, format, length, context);
    
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
        console.log(`${logPrefix} Streaming rewrite aborted by user`);
        return;
      }
      
      console.error(`${logPrefix} ${state.provider} streaming rewrite failed:`, error);
      throw error;
    }
  }

  /**
   * Build rewrite prompt for LLM polyfills
   * @private
   */
  _buildRewritePrompt(text, tone, format, length, context) {
    let instructions = [];
    
    // Tone-specific instructions
    if (tone === 'more-formal') {
      instructions.push('Rewrite the text in a more formal, professional tone.');
    } else if (tone === 'more-casual') {
      instructions.push('Rewrite the text in a more casual, conversational tone.');
    } else {
      instructions.push('Rewrite the text while maintaining the original tone.');
    }
    
    // Length-specific instructions
    if (length === 'shorter') {
      instructions.push('Make the text shorter while preserving key information.');
    } else if (length === 'longer') {
      instructions.push('Expand the text with more detail and elaboration.');
    } else {
      instructions.push('Keep the text at approximately the same length.');
    }
    
    // Format instruction
    if (format === 'markdown') {
      instructions.push('Use markdown formatting in the output.');
    } else if (format === 'plain-text') {
      instructions.push('Use plain text only, no markdown.');
    } else {
      instructions.push('Preserve the original formatting style.');
    }
    
    instructions.push('Return ONLY the rewritten text with no explanations or meta-commentary.');
    
    let prompt = instructions.join(' ');
    
    if (context) {
      prompt += `\n\nAdditional context: ${context}`;
    }
    
    prompt += `\n\nText to rewrite:\n${text}`;
    
    return prompt;
  }

  /**
   * Destroy all rewriter sessions
   * @param {number} tabId - Tab ID (extension mode only)
   */
  async destroy(tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    console.log(`${logPrefix} Destroying all rewriter sessions`);
    
    for (const [key, session] of state.rewriterSessions.entries()) {
      try {
        if (session && typeof session.destroy === 'function') {
          session.destroy();
        }
      } catch (error) {
        console.warn(`${logPrefix} Error destroying session ${key}:`, error);
      }
    }
    
    state.rewriterSessions.clear();
    console.log(`${logPrefix} All sessions destroyed`);
  }
}

// Export singleton instance
const rewriterService = new RewriterService();
export default rewriterService;
