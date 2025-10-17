/**
 * AIService - Multi-provider AI service
 * 
 * Unified interface for Chrome AI, OpenAI, and Ollama.
 * Supports streaming responses for real-time chat bubbles.
 */

import OpenAI from 'openai';
import { AIProviders } from '../config/aiConfig';
import ChromeAIValidator from './ChromeAIValidator';

class AIService {
  constructor() {
    this.client = null;
    this.currentProvider = null;
    this.currentConfig = null;
    this.abortController = null;
    
    // Chrome AI session
    this.chromeAISession = null;
    
    console.log('[AIService] Initialized');
  }

  /**
   * Configure AI client with provider settings
   * @param {Object} config - AI configuration from aiConfig
   */
  configure(config) {
    const { provider } = config;
    
    console.log(`[AIService] Configuring provider: ${provider}`);
    
    try {
      if (provider === AIProviders.CHROME_AI) {
        // Validate Chrome AI availability
        if (!ChromeAIValidator.isSupported()) {
          throw new Error('Chrome AI not supported. Chrome 138+ required.');
        }
        
        this.currentConfig = {
          temperature: config.chromeAi.temperature,
          topK: config.chromeAi.topK,
        };
        
        console.log('[AIService] Chrome AI configured:', this.currentConfig);
      }
      else if (provider === AIProviders.OPENAI) {
        // Configure OpenAI client
        this.client = new OpenAI({
          apiKey: config.openai.apiKey,
          dangerouslyAllowBrowser: true, // Required for browser usage
        });
        
        this.currentConfig = {
          model: config.openai.model,
          temperature: config.openai.temperature,
          maxTokens: config.openai.maxTokens,
        };
        
        console.log('[AIService] OpenAI configured:', {
          model: this.currentConfig.model,
          temperature: this.currentConfig.temperature,
          maxTokens: this.currentConfig.maxTokens,
        });
      } 
      else if (provider === AIProviders.OLLAMA) {
        // Configure Ollama client (uses OpenAI-compatible API)
        this.client = new OpenAI({
          apiKey: 'ollama', // Dummy key - Ollama doesn't need auth
          baseURL: config.ollama.endpoint + '/v1', // User-editable endpoint!
          dangerouslyAllowBrowser: true,
        });
        
        this.currentConfig = {
          model: config.ollama.model,
          temperature: config.ollama.temperature,
          maxTokens: config.ollama.maxTokens,
        };
        
        console.log('[AIService] Ollama configured:', {
          endpoint: config.ollama.endpoint,
          model: this.currentConfig.model,
          temperature: this.currentConfig.temperature,
          maxTokens: this.currentConfig.maxTokens,
        });
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }
      
      this.currentProvider = provider;
      return true;
      
    } catch (error) {
      console.error('[AIService] Configuration failed:', error);
      this.client = null;
      this.currentProvider = null;
      this.currentConfig = null;
      throw error;
    }
  }

  /**
   * Check if service is configured and ready
   * @returns {boolean} True if ready
   */
  isConfigured() {
    // Chrome AI doesn't use client, just config and provider
    if (!this.currentConfig || !this.currentProvider) {
      return false;
    }
    // For Chrome AI, just having config is enough
    if (this.currentProvider === 'chrome-ai') {
      return true;
    }
    // For other providers, check for client
    return this.client !== null;
  }

  /**
   * Get current provider name
   * @returns {string|null} Provider name or null
   */
  getCurrentProvider() {
    return this.currentProvider;
  }

  /**
   * Send message with streaming support
   * 
   * @param {Array} messages - Array of message objects
   * @param {Function} onStream - Callback for streaming tokens: (token: string) => void
   * @returns {Promise<string>} Full response text
   */
  async sendMessage(messages, onStream = null) {
    if (!this.isConfigured()) {
      throw new Error('AIService not configured. Call configure() first.');
    }

    console.log(`[AIService] Sending message to ${this.currentProvider}:`, {
      messageCount: messages.length,
      model: this.currentConfig.model || 'chrome-ai',
    });

    // Chrome AI implementation
    if (this.currentProvider === AIProviders.CHROME_AI) {
      return await this.sendMessageChromeAI(messages, onStream);
    }

    // Create new abort controller for this request
    this.abortController = new AbortController();

    try {
      // Create streaming request with abort signal
      const stream = await this.client.chat.completions.create({
        model: this.currentConfig.model,
        messages: messages,
        temperature: this.currentConfig.temperature,
        max_tokens: this.currentConfig.maxTokens,
        stream: true, // Enable streaming
      }, {
        signal: this.abortController.signal
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

      console.log(`[AIService] Response received (${fullResponse.length} chars)`);
      this.abortController = null;
      
      return fullResponse;
      
    } catch (error) {
      this.abortController = null;
      
      // Check if error is from abort
      if (error.name === 'AbortError') {
        console.log('[AIService] Request aborted by user');
        throw new Error('Generation stopped by user');
      }
      
      console.error('[AIService] Request failed:', error);
      
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
   * Send message using Chrome AI LanguageModel
   * @param {Array} messages - Message array {role, content}
   * @param {Function} onStream - Streaming callback
   * @returns {Promise<string>} Full response
   */
  async sendMessageChromeAI(messages, onStream = null) {
    try {
      // Create session with initial context if first time
      if (!this.chromeAISession) {
        console.log('[AIService] Creating Chrome AI session...');
        
        // Separate system prompt from conversation
        const systemPrompts = messages.filter(m => m.role === 'system');
        const conversationMsgs = messages.filter(m => m.role !== 'system');
        
        this.chromeAISession = await self.LanguageModel.create({
          temperature: this.currentConfig.temperature,
          topK: this.currentConfig.topK,
          language: this.currentConfig.outputLanguage || 'en',
          initialPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
        });
        console.log('[AIService] Chrome AI session created');
        
        // Use conversation messages for prompt
        messages = conversationMsgs;
      }

      // Get the last user message for prompting
      const lastMessage = messages[messages.length - 1];
      console.log(`[AIService] Chrome AI prompting with ${messages.length} message(s)`);

      let fullResponse = '';

      if (onStream) {
        // Streaming mode
        const stream = this.chromeAISession.promptStreaming(lastMessage.content);
        
        for await (const chunk of stream) {
          fullResponse = chunk;
          // Calculate new content by comparing with previous full response
          const previousLength = fullResponse.length - chunk.length;
          const newContent = chunk.slice(previousLength > 0 ? previousLength : 0);
          if (newContent) {
            onStream(newContent);
          }
        }
      } else {
        // Non-streaming mode
        fullResponse = await this.chromeAISession.prompt(lastMessage.content);
      }

      console.log(`[AIService] Chrome AI response (${fullResponse.length} chars)`);
      return fullResponse;

    } catch (error) {
      console.error('[AIService] Chrome AI error:', error);
      
      // Cleanup session on error
      if (this.chromeAISession) {
        try {
          this.chromeAISession.destroy();
        } catch {
          // Ignore destroy errors
        }
        this.chromeAISession = null;
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
   */
  abortRequest() {
    // Chrome AI abort
    if (this.currentProvider === AIProviders.CHROME_AI && this.chromeAISession) {
      console.log('[AIService] Destroying Chrome AI session');
      try {
        this.chromeAISession.destroy();
      } catch {
        // Ignore destroy errors
      }
      this.chromeAISession = null;
      return true;
    }

    // OpenAI/Ollama abort
    if (this.abortController) {
      console.log('[AIService] Aborting current request');
      this.abortController.abort();
      this.abortController = null;
      return true;
    }
    return false;
  }

  /**
   * Check if there's an ongoing request
   * @returns {boolean} True if request is in progress
   */
  isGenerating() {
    return this.abortController !== null;
  }

  /**
   * Send message without streaming (simpler interface)
   * 
   * @param {Array} messages - Array of message objects
   * @returns {Promise<string>} Full response text
   */
  async sendMessageSync(messages) {
    if (!this.isConfigured()) {
      throw new Error('AIService not configured. Call configure() first.');
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.currentConfig.model,
        messages: messages,
        temperature: this.currentConfig.temperature,
        max_tokens: this.currentConfig.maxTokens,
        stream: false,
      });

      const response = completion.choices[0]?.message?.content || '';
      
      console.log(`[AIService] Response received (${response.length} chars)`);
      
      return response;
      
    } catch (error) {
      console.error('[AIService] Request failed:', error);
      throw error;
    }
  }

  /**
   * Test connection to configured provider
   * Sends a simple test message to verify configuration
   * 
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    if (!this.isConfigured()) {
      throw new Error('AIService not configured');
    }

    console.log(`[AIService] Testing connection to ${this.currentProvider}...`);

    // Chrome AI test
    if (this.currentProvider === AIProviders.CHROME_AI) {
      const result = await ChromeAIValidator.testConnection();
      if (!result.success) {
        throw new Error(result.message);
      }
      return true;
    }

    // OpenAI/Ollama test
    try {
      const testMessages = [
        { role: 'user', content: 'Say "OK" if you can hear me.' }
      ];

      const response = await this.sendMessageSync(testMessages);
      
      console.log('[AIService] Connection test successful:', response);
      return true;
      
    } catch (error) {
      console.error('[AIService] Connection test failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new AIService();
