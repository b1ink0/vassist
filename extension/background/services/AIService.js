/**
 * AIService - Multi-provider AI service (Background Worker Version)
 * 
 * Runs in service worker context with multi-tab support.
 * Each tab gets independent streaming state and abort controllers.
 */

/* global chrome */
import OpenAI from 'openai';

class AIService {
  constructor() {
    // Multi-tab state tracking
    // Map<tabId, { client, config, provider, abortController }>
    this.tabStates = new Map();
    
    console.log('[Background AIService] Initialized');
  }

  /**
   * Initialize state for a tab
   * @param {number} tabId - Tab ID
   */
  initTab(tabId) {
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        client: null,
        config: null,
        provider: null,
        abortController: null,
      });
      console.log(`[AIService] Tab ${tabId} initialized`);
    }
  }

  /**
   * Cleanup tab state
   * @param {number} tabId - Tab ID
   */
  cleanupTab(tabId) {
    const state = this.tabStates.get(tabId);
    if (state) {
      // Abort any ongoing request
      if (state.abortController) {
        state.abortController.abort();
      }
      this.tabStates.delete(tabId);
      console.log(`[AIService] Tab ${tabId} cleaned up`);
    }
  }

  /**
   * Get tab state (create if doesn't exist)
   * @param {number} tabId - Tab ID
   * @returns {Object} Tab state
   */
  getTabState(tabId) {
    this.initTab(tabId);
    return this.tabStates.get(tabId);
  }

  /**
   * Configure AI client for a specific tab
   * @param {number} tabId - Tab ID
   * @param {Object} config - AI configuration
   * @returns {Promise<boolean>} Success status
   */
  async configure(tabId, config) {
    const { provider, openai, ollama } = config;
    const state = this.getTabState(tabId);
    
    console.log(`[AIService] Configuring tab ${tabId} with provider: ${provider}`);
    
    try {
      if (provider === 'openai') {
        // Configure OpenAI client
        state.client = new OpenAI({
          apiKey: openai.apiKey,
          dangerouslyAllowBrowser: false, // Not in browser - service worker
        });
        
        state.config = {
          model: openai.model,
          temperature: openai.temperature,
          maxTokens: openai.maxTokens,
        };
        
        console.log(`[AIService] Tab ${tabId} - OpenAI configured:`, {
          model: state.config.model,
          temperature: state.config.temperature,
          maxTokens: state.config.maxTokens,
        });
      } 
      else if (provider === 'ollama') {
        // Configure Ollama client (uses OpenAI-compatible API)
        state.client = new OpenAI({
          apiKey: 'ollama', // Dummy key
          baseURL: ollama.endpoint + '/v1',
          dangerouslyAllowBrowser: false,
        });
        
        state.config = {
          model: ollama.model,
          temperature: ollama.temperature,
          maxTokens: ollama.maxTokens,
        };
        
        console.log(`[AIService] Tab ${tabId} - Ollama configured:`, {
          endpoint: ollama.endpoint,
          model: state.config.model,
        });
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }
      
      state.provider = provider;
      return true;
      
    } catch (error) {
      console.error(`[AIService] Tab ${tabId} - Configuration failed:`, error);
      state.client = null;
      state.config = null;
      state.provider = null;
      throw error;
    }
  }

  /**
   * Check if tab is configured
   * @param {number} tabId - Tab ID
   * @returns {boolean} True if ready
   */
  isConfigured(tabId) {
    const state = this.tabStates.get(tabId);
    return state && state.client !== null && state.config !== null;
  }

  /**
   * Send message with streaming support for a specific tab
   * 
   * @param {number} tabId - Tab ID
   * @param {Array} messages - Array of message objects (OpenAI format)
   * @param {Function} onStream - Callback for streaming tokens: (token: string) => void
   * @returns {Promise<string>} Full response text
   */
  async sendMessage(tabId, messages, onStream = null) {
    if (!this.isConfigured(tabId)) {
      throw new Error('AIService not configured for this tab. Call configure() first.');
    }

    const state = this.getTabState(tabId);
    
    console.log(`[AIService] Tab ${tabId} - Sending message to ${state.provider}:`, {
      messageCount: messages.length,
      model: state.config.model,
    });

    // Create new abort controller for this request
    state.abortController = new AbortController();

    try {
      // Create streaming request with abort signal
      const stream = await state.client.chat.completions.create({
        model: state.config.model,
        messages: messages,
        temperature: state.config.temperature,
        max_tokens: state.config.maxTokens,
        stream: true,
      }, {
        signal: state.abortController.signal
      });

      let fullResponse = '';
      
      // Process streaming chunks
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        
        if (content) {
          fullResponse += content;
          
          // Call streaming callback if provided
          if (onStream) {
            onStream(content);
          }
        }
      }

      console.log(`[AIService] Tab ${tabId} - Response received (${fullResponse.length} chars)`);
      state.abortController = null;
      
      return fullResponse;
      
    } catch (error) {
      state.abortController = null;
      
      // Check if error is from abort
      if (error.name === 'AbortError') {
        console.log(`[AIService] Tab ${tabId} - Request aborted by user`);
        throw new Error('Generation stopped by user');
      }
      
      console.error(`[AIService] Tab ${tabId} - Request failed:`, error);
      
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
   * Abort the current ongoing request for a tab
   * @param {number} tabId - Tab ID
   * @returns {boolean} True if aborted
   */
  abortRequest(tabId) {
    const state = this.tabStates.get(tabId);
    if (state && state.abortController) {
      console.log(`[AIService] Tab ${tabId} - Aborting current request`);
      state.abortController.abort();
      state.abortController = null;
      return true;
    }
    return false;
  }

  /**
   * Check if there's an ongoing request for a tab
   * @param {number} tabId - Tab ID
   * @returns {boolean} True if request is in progress
   */
  isGenerating(tabId) {
    const state = this.tabStates.get(tabId);
    return state && state.abortController !== null;
  }

  /**
   * Test connection for a specific tab
   * @param {number} tabId - Tab ID
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection(tabId) {
    if (!this.isConfigured(tabId)) {
      throw new Error('AIService not configured for this tab');
    }

    const state = this.getTabState(tabId);
    console.log(`[AIService] Tab ${tabId} - Testing connection to ${state.provider}...`);

    try {
      const testMessages = [
        { role: 'user', content: 'Say "OK" if you can hear me.' }
      ];

      const response = await this.sendMessage(tabId, testMessages);
      
      console.log(`[AIService] Tab ${tabId} - Connection test successful:`, response);
      return true;
      
    } catch (error) {
      console.error(`[AIService] Tab ${tabId} - Connection test failed:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export default new AIService();
