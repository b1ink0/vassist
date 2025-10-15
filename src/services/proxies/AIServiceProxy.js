/**
 * AI Service Proxy
 * Dual-mode wrapper for AIService
 * Dev mode: Direct OpenAI/Ollama API calls
 * Extension mode: Message bridge to background worker
 */

import { ServiceProxy } from './ServiceProxy.js';
import AIService from '../AIService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';

class AIServiceProxy extends ServiceProxy {
  constructor() {
    super('AIService');
    this.directService = AIService; // Use existing service in dev mode
  }

  /**
   * Configure AI client with provider settings
   * @param {Object} config - AI configuration
   */
  async configure(config) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.AI_CONFIGURE, { config });
    } else {
      return this.directService.configure(config);
    }
  }

  /**
   * Check if service is configured and ready
   * @returns {boolean} True if ready
   */
  isConfigured() {
    if (this.isExtension) {
      // In extension mode, we trust the background state
      // Could add a message to check, but for performance we skip it
      return true;
    } else {
      return this.directService.isConfigured();
    }
  }

  /**
   * Get current provider name
   * @returns {string|null} Provider name or null
   */
  getCurrentProvider() {
    if (this.isExtension) {
      // Could add message to get provider, but not critical
      return null;
    } else {
      return this.directService.getCurrentProvider();
    }
  }

  /**
   * Send message with streaming support
   * @param {Array} messages - Array of message objects (OpenAI format)
   * @param {Function} onStream - Callback for streaming tokens
   * @returns {Promise<string>} Full response text
   */
  async sendMessage(messages, onStream = null) {
    if (this.isExtension) {
      // Extension mode: streaming via message bridge
      return await this.sendMessageViabridge(messages, onStream);
    } else {
      // Dev mode: direct service call
      return await this.directService.sendMessage(messages, onStream);
    }
  }

  /**
   * Send message via bridge (extension mode) with streaming
   * @param {Array} messages - Message array
   * @param {Function} onStream - Stream callback
   * @returns {Promise<string>} Full response
   */
  async sendMessageViabridge(messages, onStream) {
    if (!this.bridge) {
      throw new Error('Bridge not initialized');
    }

    if (onStream) {
      // Streaming mode - use AI_SEND_MESSAGE (background handler supports streaming)
      let fullResponse = '';
      
      await this.bridge.sendStreamingMessage(
        MessageTypes.AI_SEND_MESSAGE,
        { messages },
        (chunk) => {
          fullResponse += chunk;
          onStream(chunk);
        },
        { timeout: 120000 } // 2 minutes for AI streaming
      );
      
      return fullResponse;
    } else {
      // Non-streaming mode
      const response = await this.bridge.sendMessage(
        MessageTypes.AI_SEND_MESSAGE,
        { messages },
        { timeout: 60000 } // 1 minute timeout
      );
      
      return response.response || '';
    }
  }

  /**
   * Send message without streaming (simpler interface)
   * @param {Array} messages - Array of message objects
   * @returns {Promise<string>} Full response text
   */
  async sendMessageSync(messages) {
    if (this.isExtension) {
      const response = await this.bridge.sendMessage(
        MessageTypes.AI_SEND_MESSAGE,
        { messages },
        { timeout: 60000 }
      );
      return response.text || '';
    } else {
      return await this.directService.sendMessageSync(messages);
    }
  }

  /**
   * Abort the current ongoing request
   */
  abortRequest() {
    if (this.isExtension) {
      // Send abort message to background
      this.bridge.sendMessage(MessageTypes.AI_ABORT, {})
        .catch(error => {
          console.warn('[AIServiceProxy] Abort failed:', error);
        });
      return true;
    } else {
      return this.directService.abortRequest();
    }
  }

  /**
   * Check if there's an ongoing request
   * @returns {boolean} True if request is in progress
   */
  isGenerating() {
    if (this.isExtension) {
      // In extension mode, background tracks this
      // For simplicity, return false (could add message to check)
      return false;
    } else {
      return this.directService.isGenerating();
    }
  }

  /**
   * Test connection to configured provider
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    if (this.isExtension) {
      const response = await this.bridge.sendMessage(
        MessageTypes.AI_TEST_CONNECTION,
        {},
        { timeout: 30000 }
      );
      return response.success || false;
    } else {
      return await this.directService.testConnection();
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method, ...args) {
    // Map method names to message types
    const methodMap = {
      configure: MessageTypes.AI_CONFIGURE,
      sendMessage: MessageTypes.AI_SEND_MESSAGE,
      sendMessageSync: MessageTypes.AI_SEND_MESSAGE,
      abortRequest: MessageTypes.AI_ABORT,
      testConnection: MessageTypes.AI_TEST_CONNECTION
    };

    const messageType = methodMap[method];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const response = await this.bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method, ...args) {
    if (typeof this.directService[method] !== 'function') {
      throw new Error(`Method ${method} not found on AIService`);
    }

    return await this.directService[method](...args);
  }
}

// Export singleton instance
const aiServiceProxy = new AIServiceProxy();
export default aiServiceProxy;
