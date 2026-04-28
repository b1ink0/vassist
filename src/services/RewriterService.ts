/**
 * RewriterService - Multi-provider Text Rewriting service
 * 
 * Supports Chrome AI Rewriter API (on-device) and polyfills for OpenAI/Ollama.
 * Works in both extension mode (multi-tab) and dev mode (single instance).
 */
import OpenAI from 'openai';
import Logger from './LoggerService';
import { isExtension } from '../utils/PlatformUtils';

type RewriteState = {
  rewriterSessions: Map<string, any>;
  config: any;
  provider: string | null;
  llmClient: any;
  abortController: AbortController | null;
};
const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

class RewriterService {
  private isExtensionMode: boolean;
  private tabStates: Map<number, RewriteState> = new Map();
  private rewriterSessions: Map<string, any> = new Map();
  private config: any = null;
  private provider: string | null = null;
  private llmClient: any = null;
  private abortController: AbortController | null = null;

  constructor() {
    this.isExtensionMode = isExtension;
    
    if (this.isExtensionMode) {
      this.tabStates = new Map();
    } else {
      this.rewriterSessions = new Map(); // key: "tone-format-length-sharedContext", value: Rewriter session
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
  initTab(tabId: number | null): void {
    if (!this.isExtensionMode) return;
    if (tabId === null) return;
    
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        rewriterSessions: new Map(),
        config: null,
        provider: null,
        llmClient: null,
        abortController: null,
      });
      Logger.log('RewriterService', `Tab ${tabId} initialized`);
    }
  }

  /**
   * Cleanup tab state (extension mode only)
   * @param {number} tabId - Tab ID
   */
  cleanupTab(tabId: number | null): void {
    if (!this.isExtensionMode) return;
    if (tabId === null) return;
    
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
          Logger.warn('RewriterService', 'Error destroying session:', error);
        }
      }
      this.tabStates.delete(tabId);
      Logger.log('RewriterService', `Tab ${tabId} cleaned up`);
    }
  }

  /**
   * Get state object for current context
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Object} State object
   */
  _getState(tabId: number | null = null): any {
    if (this.isExtensionMode) {
      this.initTab(tabId);
      return this.tabStates.get(tabId as number);
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
  async configure(config: any, tabId: number | null = null): Promise<boolean> {
    const state = this._getState(tabId);
    const { provider } = config;
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    Logger.log('other', `${logPrefix} Configuring provider: ${provider}`);
    
    try {
      if (provider === 'chrome-ai') {
        // Check Chrome AI Rewriter availability
        if (!(self as any).Rewriter) {
          throw new Error('Chrome AI Rewriter not available. Chrome 139+ required with origin trial token.');
        }
        
        state.config = { provider: 'chrome-ai' };
        state.provider = 'chrome-ai';
        Logger.log('other', `${logPrefix} Chrome AI Rewriter configured`);
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
        Logger.log('other', `${logPrefix} OpenAI configured for rewriting`);
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
        Logger.log('other', `${logPrefix} Ollama configured for rewriting`);
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
  isConfigured(tabId: number | null = null): boolean {
    const state = this._getState(tabId);
    return state && state.config && state.provider;
  }

  /**
   * Abort ongoing rewrite request
   * @param {number} tabId - Tab ID (extension mode only)
   */
  abort(tabId: number | null = null): void {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    if (state.abortController) {
      Logger.log('other', `${logPrefix} Aborting rewrite request`);
      state.abortController.abort();
      state.abortController = null;
    }
  }

  /**
   * Check availability of rewriter
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} 'readily', 'downloading', 'downloadable', or 'unavailable'
   */
  async checkAvailability(tabId: number | null = null): Promise<string> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    if (!state.provider) {
      return 'unavailable';
    }
    
    if (state.provider === 'chrome-ai') {
      if (!(self as any).Rewriter) {
        return 'unavailable';
      }
      
      try {
        const availability = await (self as any).Rewriter.availability();
        Logger.log('other', `${logPrefix} Rewriter availability:`, availability);
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
   * Get or create rewriter session
   * @param {string} tone - Tone: 'as-is', 'more-formal', 'more-casual'
   * @param {string} format - Output format: 'as-is', 'plain-text', 'markdown'
   * @param {string} length - Rewrite length: 'as-is', 'shorter', 'longer'
   * @param {string} sharedContext - Optional context for the rewriter
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<Object>} Rewriter session
   */
  async _getOrCreateSession(tone = 'as-is', format = 'as-is', length = 'as-is', sharedContext = '', tabId: number | null = null): Promise<any> {
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
      Logger.log('other', `${logPrefix} Creating rewriter session: ${sessionKey}`);
      const session = await (self as any).Rewriter.create({
        tone,
        format,
        length,
        sharedContext,
        monitor(m: any) {
          m.addEventListener('downloadprogress', (e: any) => {
            Logger.log('other', `${logPrefix} Rewriter model download: ${(e.loaded * 100).toFixed(1)}%`);
          });
        }
      });
      
      state.rewriterSessions.set(sessionKey, session);
      Logger.log('other', `${logPrefix} Rewriter session created: ${sessionKey}`);
      return session;
    } catch (error) {
      Logger.error('other', `${logPrefix} Failed to create rewriter session:`, error);
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
  async rewrite(text: string, options: any = {}, tabId: number | null = null): Promise<string> {
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
    
    Logger.log('other', `${logPrefix} Rewriting (${tone}, ${format}, ${length}):`, text.substring(0, 50));
    
    if (state.provider === 'chrome-ai') {
      const session = await this._getOrCreateSession(tone, format, length, sharedContext, tabId);
      const rewritten = await session.rewrite(text, { context });
      Logger.log('other', `${logPrefix} Rewrite complete:`, rewritten.substring(0, 50));
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
  async *rewriteStreaming(text: string, options: any = {}, tabId: number | null = null): AsyncIterable<string> {
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
    
    Logger.log('other', `${logPrefix} Rewriting (streaming, ${tone}, ${format}, ${length}):`, text.substring(0, 50));
    
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
  async _rewriteWithOpenAICompatible(text: string, tone: string, format: string, length: string, context: string, tabId: number | null = null): Promise<string> {
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
      Logger.log('other', `${logPrefix} ${state.provider} rewrite complete`);
      return rewritten;
    } catch (error) {
      state.abortController = null;
      const normalizedError = asError(error);
      
      // Check if error is from abort
      const isAbort = normalizedError.name === 'AbortError' ||
                      normalizedError.message?.includes('abort') ||
                      normalizedError.message?.includes('cancel');
      
      if (isAbort) {
        Logger.log('other', `${logPrefix} Rewrite aborted by user`);
        throw new Error('Rewrite cancelled');
      }
      
      Logger.error('other', `${logPrefix} ${state.provider} rewrite failed:`, error);
      throw normalizedError;
    }
  }

  /**
   * Rewrite using OpenAI-compatible API (streaming polyfill for OpenAI/Ollama)
   * @private
   */
  async *_rewriteStreamingWithOpenAICompatible(text: string, tone: string, format: string, length: string, context: string, tabId: number | null = null): AsyncIterable<string> {
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
      const normalizedError = asError(error);
      
      // Check if error is from abort
      const isAbort = normalizedError.name === 'AbortError' ||
                      normalizedError.message?.includes('abort') ||
                      normalizedError.message?.includes('cancel');
      
      if (isAbort) {
        Logger.log('other', `${logPrefix} Streaming rewrite aborted by user`);
        return;
      }
      
      Logger.error('other', `${logPrefix} ${state.provider} streaming rewrite failed:`, error);
      throw normalizedError;
    }
  }

  /**
   * Build rewrite prompt for LLM polyfills
   * @private
   */
  _buildRewritePrompt(text: string, tone: string, format: string, length: string, context: string): string {
    const instructions: string[] = [];
    
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
  async destroy(tabId: number | null = null): Promise<void> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[RewriterService] Tab ${tabId}` : '[RewriterService]';
    
    Logger.log('other', `${logPrefix} Destroying all rewriter sessions`);
    
    for (const [key, session] of state.rewriterSessions.entries()) {
      try {
        if (session && typeof session.destroy === 'function') {
          session.destroy();
        }
      } catch (error) {
        Logger.warn('other', `${logPrefix} Error destroying session ${key}:`, error);
      }
    }
    
    state.rewriterSessions.clear();
    Logger.log('other', `${logPrefix} All sessions destroyed`);
  }
}

// Export singleton instance
const rewriterService = new RewriterService();
export default rewriterService;
