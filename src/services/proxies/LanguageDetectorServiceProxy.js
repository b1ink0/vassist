/**
 * Language Detector Service Proxy
 * Dual-mode wrapper for LanguageDetectorService
 * Dev mode: Direct API calls
 * Extension mode: Background handles detection
 */

import { ServiceProxy } from './ServiceProxy.js';
import LanguageDetectorService from '../LanguageDetectorService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';

class LanguageDetectorServiceProxy extends ServiceProxy {
  constructor() {
    super('LanguageDetectorService');
    this.directService = LanguageDetectorService;
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
      const { StorageServiceProxy } = await import('./StorageServiceProxy.js');
      const { DefaultAIConfig } = await import('../../config/aiConfig.js');
      const aiConfig = await StorageServiceProxy.configLoad('aiConfig', DefaultAIConfig);
      
      if (aiConfig && aiConfig.aiFeatures?.languageDetector?.enabled !== false) {
        await this.configure(aiConfig);
      }
    } finally {
      this._configuring = false;
    }
  }

  /**
   * Configure Language Detector with provider settings
   * @param {Object} config - Configuration
   * @param {string} config.provider - 'chrome-ai', 'openai', or 'ollama'
   */
  async configure(config) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('LanguageDetectorServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.LANGUAGE_DETECTOR_CONFIGURE,
        { config }
      );
      return response.configured;
    } else {
      return this.directService.configure(config);
    }
  }

  /**
   * Check if service is configured
   * @returns {Promise<boolean>} True if ready
   */
  async isConfigured() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) return false;
      try {
        const response = await bridge.sendMessage(MessageTypes.LANGUAGE_DETECTOR_IS_CONFIGURED, {});
        return response.configured;
      } catch {
        return false;
      }
    } else {
      return this.directService.isConfigured();
    }
  }

  /**
   * Check availability
   * @returns {Promise<string>} 'readily', 'downloading', 'downloadable', or 'unavailable'
   */
  async checkAvailability() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('LanguageDetectorServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.LANGUAGE_DETECTOR_CHECK_AVAILABILITY,
        {}
      );
      return response.availability;
    } else {
      return this.directService.checkAvailability();
    }
  }

  /**
   * Detect language of text
   * @param {string} text - Text to analyze
   * @returns {Promise<Array>} Array of {detectedLanguage: string, confidence: number}
   */
  async detect(text) {
    await this.ensureConfigured();
    
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('LanguageDetectorServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.LANGUAGE_DETECTOR_DETECT,
        { text },
        { timeout: 10000 }
      );
      return response.results;
    } else {
      return this.directService.detect(text);
    }
  }

  /**
   * Destroy language detector session
   */
  async destroy() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('LanguageDetectorServiceProxy: Bridge not available');
      await bridge.sendMessage(MessageTypes.LANGUAGE_DETECTOR_DESTROY, {});
    } else {
      await this.directService.destroy();
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method, ...args) {
    const methodMap = {
      configure: MessageTypes.LANGUAGE_DETECTOR_CONFIGURE,
      detect: MessageTypes.LANGUAGE_DETECTOR_DETECT,
      checkAvailability: MessageTypes.LANGUAGE_DETECTOR_CHECK_AVAILABILITY,
      destroy: MessageTypes.LANGUAGE_DETECTOR_DESTROY
    };

    const messageType = methodMap[method];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error('LanguageDetectorServiceProxy: Bridge not available');
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method, ...args) {
    if (typeof this.directService[method] !== 'function') {
      throw new Error(`Method ${method} not found on LanguageDetectorService`);
    }

    return await this.directService[method](...args);
  }
}

// Export singleton instance
const languageDetectorServiceProxy = new LanguageDetectorServiceProxy();
export default languageDetectorServiceProxy;
