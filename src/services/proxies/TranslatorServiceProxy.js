/**
 * Translator Service Proxy
 * Dual-mode wrapper for TranslatorService
 * Dev mode: Direct API calls
 * Extension mode: Background handles translation
 */

import { ServiceProxy } from './ServiceProxy.js';
import TranslatorService from '../TranslatorService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';

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
      // For extension mode, fall back to batch since streaming via message passing is complex
      const translated = await this.translate(text, sourceLanguage, targetLanguage);
      yield translated;
    } else {
      yield* this.directService.translateStreaming(text, sourceLanguage, targetLanguage);
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
