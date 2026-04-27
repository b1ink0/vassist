/**
 * AI Service Proxy
 * Dual-mode wrapper for AIService
 * Dev mode: Direct OpenAI/Ollama API calls
 * Extension mode: Message bridge to background worker
 */

import { ServiceProxy } from './ServiceProxy.js';
import AIService from '../AIService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';
import Logger from '../LoggerService';
import StorageServiceProxy from './StorageServiceProxy.js';
import { DefaultAIConfig } from '../../config/aiConfig.js';

class AIServiceProxy extends ServiceProxy {
  constructor() {
    super('AIService');
    this.directService = AIService;
    this._configuring = false;
  }

  /**
   * Ensure service is configured (auto-loads from storage if needed)
   * @returns {Promise<void>}
   */
  async ensureConfigured() {
    if (this._configuring) return;
    
    const configured = await this.isConfigured();
    if (configured) return;
    
    this._configuring = true;
    try {
      const aiConfig = await StorageServiceProxy.configLoad('aiConfig', DefaultAIConfig);
      
      if (aiConfig && aiConfig.provider) {
        Logger.log('AIServiceProxy', 'Auto-configuring from storage...');
        await this.configure(aiConfig);
      }
    } finally {
      this._configuring = false;
    }
  }

  /**
   * Configure AI client with provider settings
   * @param {Object} config - AI configuration
   */
  async configure(config) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('AIServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.AI_CONFIGURE, { config });
    } else {
      return this.directService.configure(config);
    }
  }

  /**
   * Check if service is configured and ready
   * @returns {Promise<boolean>} True if ready
   */
  async isConfigured() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) return false;
      try {
        const response = await bridge.sendMessage(MessageTypes.AI_IS_CONFIGURED, {});
        return response.configured;
      } catch {
        return false;
      }
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
   * @param {Object} options - Additional options { useUtilitySession: boolean }
   * @returns {Promise<string>} Full response text
   */
  async sendMessage(messages, onStream = null, options = {}) {
    await this.ensureConfigured();
    
    if (this.isExtension) {
      // Extension mode: streaming via message bridge
      return await this.sendMessageViabridge(messages, onStream, options);
    } else {
      // Dev mode: direct service call
      return await this.directService.sendMessage(messages, onStream, null, options);
    }
  }

  /**
   * Send message via bridge (extension mode) with streaming
   * @param {Array} messages - Message array
   * @param {Function} onStream - Stream callback
   * @param {Object} options - Additional options { useUtilitySession: boolean }
   * @returns {Promise<{success: boolean, response: string, cancelled: boolean, error: Error|null}>} Result object
   */
  async sendMessageViabridge(messages, onStream, options = {}) {
    const bridge = await this.waitForBridge();
    if (!bridge) {
      throw new Error('AIServiceProxy: Bridge not available');
    }

    try {
      if (onStream) {
        // Streaming mode - use AI_SEND_MESSAGE (background handler supports streaming)
        let fullResponse = '';
        
        await bridge.sendStreamingMessage(
          MessageTypes.AI_SEND_MESSAGE,
          { messages, options: { ...options, streaming: true } }, // Mark as streaming request
          (chunk) => {
            fullResponse += chunk;
            onStream(chunk);
          },
          { timeout: 120000 } // 2 minutes for AI streaming
        );
        
        // Return in same format as AIService.sendMessage()
        return { success: true, response: fullResponse, cancelled: false, error: null };
      } else {
        // Non-streaming mode - explicitly mark as non-streaming
        const response = await bridge.sendMessage(
          MessageTypes.AI_SEND_MESSAGE,
          { messages, options: { ...options, streaming: false } }, // Mark as non-streaming request
          { timeout: 60000 } // 1 minute timeout
        );
        
        // Return in same format as AIService.sendMessage()
        if (response?.success === false) {
          return response; // Already in correct format from background
        }
        
        return { success: true, response: response?.response || '', cancelled: false, error: null };
      }
    } catch (error) {
      // Return error in same format as AIService
      return { success: false, response: null, cancelled: false, error };
    }
  }

  /**
   * Send message without streaming (simpler interface)
   * @param {Array} messages - Array of message objects
   * @returns {Promise<string>} Full response text
   */
  async sendMessageSync(messages) {
    await this.ensureConfigured();
    
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('AIServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
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
  async abortRequest() {
    if (this.isExtension) {
      // Send abort message to background
      const bridge = await this.waitForBridge();
      if (bridge) {
        bridge.sendMessage(MessageTypes.AI_ABORT, {})
          .catch(error => {
            Logger.warn('AIServiceProxy', 'Abort failed:', error);
          });
      }
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
    await this.ensureConfigured();
    
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('AIServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
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
   * Check Chrome AI availability
   * @returns {Promise<Object>} Availability result object
   */
  async checkChromeAIAvailability() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('AIServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.CHROME_AI_CHECK_AVAILABILITY,
        {},
        { timeout: 10000 }
      );
      return response;
    } else {
      // Direct access to ChromeAIValidator through AIService
      const ChromeAIValidator = (await import('../ChromeAIValidator.js')).default;
      return await ChromeAIValidator.checkAvailability();
    }
  }

  /**
   * Check if Chrome AI is supported
   * @returns {Promise<boolean>} True if supported
   */
  async isChromeAISupported() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('AIServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.CHROME_AI_IS_SUPPORTED,
        {},
        { timeout: 5000 }
      );
      return response.supported || false;
    } else {
      const ChromeAIValidator = (await import('../ChromeAIValidator.js')).default;
      return ChromeAIValidator.isSupported();
    }
  }

  /**
   * Start Chrome AI model download
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Download result
   */
  async startChromeAIDownload(onProgress) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('AIServiceProxy: Bridge not available');
      
      // Set up message listener for progress updates via bridge
      let progressListener = null;
      if (onProgress) {
        progressListener = (message) => {
          if (message.type === MessageTypes.CHROME_AI_DOWNLOAD_PROGRESS && message.data) {
            onProgress(message.data);
          }
        };
        bridge.addMessageListener(progressListener);
      }
      
      try {
        // Trigger download in background
        const response = await bridge.sendMessage(
          MessageTypes.CHROME_AI_START_DOWNLOAD,
          {},
          { timeout: 300000 } // 5 minutes for download
        );

        if (!response.success) {
          throw new Error(response.message || 'Failed to start download');
        }
        return response;
      } finally {
        if (progressListener) {
          bridge.removeMessageListener(progressListener);
        }
      }
    } else {
      const ChromeAIValidator = (await import('../ChromeAIValidator.js')).default;
      return await ChromeAIValidator.monitorDownload(onProgress);
    }
  }

  /**
   * Download Chrome AI model (alias for startChromeAIDownload)
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Download result
   */
  async downloadChromeAIModel(onProgress) {
    return await this.startChromeAIDownload(onProgress);
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

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error('AIServiceProxy: Bridge not available');
    const response = await bridge.sendMessage(messageType, { args });
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
