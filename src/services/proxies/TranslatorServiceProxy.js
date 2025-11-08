/**
 * Translator Service Proxy
 * Dual-mode wrapper for TranslatorService
 * Dev mode: Direct API calls
 * Extension mode: Background handles translation
 */

import { ServiceProxy } from './ServiceProxy.js';
import TranslatorService from '../TranslatorService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';
import Logger from '../LoggerService';

class TranslatorServiceProxy extends ServiceProxy {
  constructor() {
    super('TranslatorService');
    this.directService = TranslatorService;
  }

  /**
   * Configure Translator with provider settings
   * @param {Object} config - Configuration
   * @param {string} config.provider - 'chrome-ai', 'openai', or 'ollama'
   */
  async configure(config) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TranslatorServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.TRANSLATOR_CONFIGURE,
        { config }
      );
      return response.configured;
    } else {
      return this.directService.configure(config);
    }
  }

  /**
   * Check if service is configured
   * @returns {boolean} True if ready
   */
  isConfigured() {
    if (this.isExtension) {
      return true; // Trust background state
    } else {
      return this.directService.isConfigured();
    }
  }

  /**
   * Check availability for language pair
   * @param {string} sourceLanguage - Source language code
   * @param {string} targetLanguage - Target language code
   * @returns {Promise<string>} 'readily', 'downloading', 'downloadable', or 'unavailable'
   */
  async checkAvailability(sourceLanguage, targetLanguage) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TranslatorServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.TRANSLATOR_CHECK_AVAILABILITY,
        { sourceLanguage, targetLanguage }
      );
      return response.availability;
    } else {
      return this.directService.checkAvailability(sourceLanguage, targetLanguage);
    }
  }

  /**
   * Translate text (batch)
   * @param {string} text - Text to translate
   * @param {string} sourceLanguage - Source language code
   * @param {string} targetLanguage - Target language code
   * @returns {Promise<string>} Translated text
   */
  async translate(text, sourceLanguage, targetLanguage) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TranslatorServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.TRANSLATOR_TRANSLATE,
        { text, sourceLanguage, targetLanguage },
        { timeout: 30000 }
      );
      return response.translatedText;
    } else {
      return this.directService.translate(text, sourceLanguage, targetLanguage);
    }
  }

  /**
   * Translate text (streaming)
   * @param {string} text - Text to translate
   * @param {string} sourceLanguage - Source language code
   * @param {string} targetLanguage - Target language code
   * @returns {AsyncIterable<string>} Streaming translation chunks
   */
  async *translateStreaming(text, sourceLanguage, targetLanguage) {
    if (this.isExtension) {
      // Extension mode: Use streaming message bridge with queue-based async iteration
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TranslatorServiceProxy: Bridge not available');
      
      // Create a queue to hold chunks as they arrive
      const chunkQueue = [];
      let streamComplete = false;
      let streamError = null;
      
      // Start streaming in background (don't await - we yield chunks as they arrive)
      const _STREAM_PROMISE = bridge.sendStreamingMessage(
        MessageTypes.TRANSLATOR_TRANSLATE_STREAMING,
        { text, sourceLanguage, targetLanguage },
        (chunk) => {
          chunkQueue.push(chunk);
        },
        { timeout: 120000 } // 2 minutes for streaming
      ).then(() => {
        streamComplete = true;
      }).catch((error) => {
        streamError = error;
        streamComplete = true;
      });
      
      // Yield chunks as they become available
      while (!streamComplete || chunkQueue.length > 0) {
        if (chunkQueue.length > 0) {
          yield chunkQueue.shift();
        } else {
          // Wait a bit before checking again
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      // If there was an error, throw it now
      if (streamError) {
        Logger.error('TranslatorServiceProxy', 'Streaming failed:', streamError);
        throw streamError;
      }
    } else {
      // Dev mode: Use direct service streaming
      yield* this.directService.translateStreaming(text, sourceLanguage, targetLanguage);
    }
  }

  /**
   * Abort ongoing translation request
   */
  async abort() {
    if (this.isExtension) {
      // Extension mode: Send abort message to background
      const bridge = await this.waitForBridge();
      if (!bridge) {
        Logger.warn('TranslatorServiceProxy', 'Bridge not available for abort');
        return;
      }
      try {
        await bridge.sendMessage(MessageTypes.TRANSLATOR_ABORT, {});
      } catch (error) {
        Logger.error('TranslatorServiceProxy', 'Abort failed:', error);
      }
    } else {
      // Dev mode: Call the service's abort method directly
      this.directService.abort();
    }
  }

  /**
   * Destroy all translator sessions
   */
  async destroy() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TranslatorServiceProxy: Bridge not available');
      await bridge.sendMessage(MessageTypes.TRANSLATOR_DESTROY, {});
    } else {
      await this.directService.destroy();
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method, ...args) {
    const methodMap = {
      configure: MessageTypes.TRANSLATOR_CONFIGURE,
      translate: MessageTypes.TRANSLATOR_TRANSLATE,
      checkAvailability: MessageTypes.TRANSLATOR_CHECK_AVAILABILITY,
      destroy: MessageTypes.TRANSLATOR_DESTROY
    };

    const messageType = methodMap[method];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error('TranslatorServiceProxy: Bridge not available');
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method, ...args) {
    if (typeof this.directService[method] !== 'function') {
      throw new Error(`Method ${method} not found on TranslatorService`);
    }

    return await this.directService[method](...args);
  }
}

// Export singleton instance
const translatorServiceProxy = new TranslatorServiceProxy();
export default translatorServiceProxy;
