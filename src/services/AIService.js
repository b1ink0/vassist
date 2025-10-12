/**
 * AIService - Multi-provider AI service
 * 
 * Unified interface for OpenAI and Ollama (via OpenAI-compatible API).
 * Supports streaming responses for real-time chat bubbles.
 */

import OpenAI from 'openai';
import { AIProviders } from '../config/aiConfig';

class AIService {
  constructor() {
    this.client = null;
    this.currentProvider = null;
    this.currentConfig = null;
    
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
      if (provider === AIProviders.OPENAI) {
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
    return this.client !== null && this.currentConfig !== null;
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
   * @param {Array} messages - Array of message objects (OpenAI format)
   * @param {Function} onStream - Callback for streaming tokens: (token: string) => void
   * @returns {Promise<string>} Full response text
   */
  async sendMessage(messages, onStream = null) {
    if (!this.isConfigured()) {
      throw new Error('AIService not configured. Call configure() first.');
    }

    console.log(`[AIService] Sending message to ${this.currentProvider}:`, {
      messageCount: messages.length,
      model: this.currentConfig.model,
    });

    try {
      // Create streaming request
      const stream = await this.client.chat.completions.create({
        model: this.currentConfig.model,
        messages: messages,
        temperature: this.currentConfig.temperature,
        max_tokens: this.currentConfig.maxTokens,
        stream: true, // Enable streaming
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
      
      return fullResponse;
      
    } catch (error) {
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
