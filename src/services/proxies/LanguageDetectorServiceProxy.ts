/**
 * Language Detector Service Proxy
 * Dual-mode wrapper for LanguageDetectorService
 * Dev mode: Direct API calls
 * Extension mode: Background handles detection
 */

import { ServiceProxy } from './ServiceProxy';
import LanguageDetectorService from '../LanguageDetectorService';
import { MessageTypes } from '../../../extension/shared/MessageTypes';
import StorageServiceProxy from './StorageServiceProxy';
import { DefaultAIConfig } from '../../config/aiConfig';

interface LanguageDetectionResult {
  detectedLanguage: string;
  confidence: number;
}

interface LanguageDetectorProxyConfig {
  aiFeatures?: {
    languageDetector?: {
      enabled?: boolean;
    };
  };
  [key: string]: string | number | boolean | null | undefined | object;
}

interface LanguageDetectorServiceLike extends Record<string, unknown> {
  configure(config: LanguageDetectorProxyConfig): Promise<boolean> | boolean;
  isConfigured(): Promise<boolean> | boolean;
  checkAvailability(): Promise<string> | string;
  detect(text: string): Promise<LanguageDetectionResult[]> | LanguageDetectionResult[];
  destroy(): Promise<void> | void;
}

class LanguageDetectorServiceProxy extends ServiceProxy {
  protected directService: LanguageDetectorServiceLike;

  constructor() {
    super('LanguageDetectorService');
    this.directService = LanguageDetectorService as unknown as LanguageDetectorServiceLike;
    this._configuring = false;
  }

  /**
   * Ensure service is configured (auto-loads from storage if needed)
   * @returns {Promise<void>}
   */
  async ensureConfigured(): Promise<void> {
    if (this._configuring) return;
    
    const configured = await this.isConfigured();
    if (configured) return;
    
    this._configuring = true;
    try {
      const aiConfig = await StorageServiceProxy.configLoad('aiConfig', DefaultAIConfig) as LanguageDetectorProxyConfig;
      
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
  async configure(config: LanguageDetectorProxyConfig): Promise<boolean> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('LanguageDetectorServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.LANGUAGE_DETECTOR_CONFIGURE,
        { config }
      ) as { configured?: boolean };
      return response.configured ?? false;
    } else {
      return this.directService.configure(config);
    }
  }

  /**
   * Check if service is configured
   * @returns {Promise<boolean>} True if ready
   */
  async isConfigured(): Promise<boolean> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) return false;
      try {
        const response = await bridge.sendMessage(MessageTypes.LANGUAGE_DETECTOR_IS_CONFIGURED, {}) as { configured?: boolean };
        return response.configured ?? false;
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
  async checkAvailability(): Promise<string> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('LanguageDetectorServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.LANGUAGE_DETECTOR_CHECK_AVAILABILITY,
        {}
      ) as { availability?: string };
      return response.availability ?? 'unavailable';
    } else {
      return this.directService.checkAvailability();
    }
  }

  /**
   * Detect language of text
   * @param {string} text - Text to analyze
   * @returns {Promise<Array>} Array of {detectedLanguage: string, confidence: number}
   */
  async detect(text: string): Promise<LanguageDetectionResult[]> {
    await this.ensureConfigured();
    
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('LanguageDetectorServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.LANGUAGE_DETECTOR_DETECT,
        { text },
        { timeout: 10000 }
      ) as { results?: LanguageDetectionResult[] };
      return response.results ?? [];
    } else {
      return this.directService.detect(text);
    }
  }

  /**
   * Destroy language detector session
   */
  async destroy(): Promise<void> {
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
  async callViaBridge(method: string, ...args: unknown[]): Promise<unknown> {
    const methodMap = {
      configure: MessageTypes.LANGUAGE_DETECTOR_CONFIGURE,
      detect: MessageTypes.LANGUAGE_DETECTOR_DETECT,
      checkAvailability: MessageTypes.LANGUAGE_DETECTOR_CHECK_AVAILABILITY,
      destroy: MessageTypes.LANGUAGE_DETECTOR_DESTROY
    };

    const messageType = methodMap[method as keyof typeof methodMap];
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
  async callDirect(method: string, ...args: unknown[]): Promise<unknown> {
    const candidateMethod = this.directService[method];
    if (typeof candidateMethod !== 'function') {
      throw new Error(`Method ${method} not found on LanguageDetectorService`);
    }

    return await (candidateMethod as (...params: unknown[]) => unknown)(...args);
  }
}

// Export singleton instance
const languageDetectorServiceProxy = new LanguageDetectorServiceProxy();
export default languageDetectorServiceProxy;
