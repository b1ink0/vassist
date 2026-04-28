/**
 * Summarizer Service Proxy
 * Dual-mode wrapper for SummarizerService
 * Dev mode: Direct API calls
 * Extension mode: Background handles summarization
 */

import { ServiceProxy } from './ServiceProxy';
import SummarizerService from '../SummarizerService';
import { MessageTypes } from '../../../extension/shared/MessageTypes';
import Logger from '../LoggerService';
import StorageServiceProxy from './StorageServiceProxy';
import { DefaultAIConfig } from '../../config/aiConfig';

interface SummarizerServiceLike {
  configure(config: unknown): Promise<boolean> | boolean;
  isConfigured(): boolean;
  checkAvailability(): Promise<string> | string;
  summarize(text: string, options?: Record<string, unknown>): Promise<string>;
  summarizeStreaming(text: string, options?: Record<string, unknown>): AsyncIterable<string>;
  abort(): void;
  destroy(): Promise<void> | void;
  [method: string]: unknown;
}

interface SummarizerProxyConfig {
  aiFeatures?: {
    summarizer?: {
      enabled?: boolean;
    };
  };
  [key: string]: unknown;
}

class SummarizerServiceProxy extends ServiceProxy {
  protected directService: SummarizerServiceLike;
  protected _configuring: boolean;

  constructor() {
    super('SummarizerService');
    this.directService = SummarizerService as unknown as SummarizerServiceLike;
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
      const storedConfig = await StorageServiceProxy.configLoad('aiConfig', null) as SummarizerProxyConfig | null;
      const aiConfig = storedConfig ?? (DefaultAIConfig as unknown as SummarizerProxyConfig);
      
      if (aiConfig && aiConfig.aiFeatures?.summarizer?.enabled !== false) {
        await this.configure(aiConfig);
      }
    } finally {
      this._configuring = false;
    }
  }

  /**
   * Configure Summarizer with provider settings
   * @param {Object} config - Configuration
   * @param {string} config.provider - 'chrome-ai', 'openai', or 'ollama'
   */
  async configure(config: Record<string, unknown>): Promise<boolean> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('SummarizerServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.SUMMARIZER_CONFIGURE,
        { config }
      ) as { configured?: boolean };
      return response.configured === true;
    } else {
      return await this.directService.configure(config);
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
        const response = await bridge.sendMessage(MessageTypes.SUMMARIZER_IS_CONFIGURED, {}) as { configured?: boolean };
        return response.configured === true;
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
      if (!bridge) throw new Error('SummarizerServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.SUMMARIZER_CHECK_AVAILABILITY,
        {}
      ) as { availability?: string };
      return response.availability || 'unavailable';
    } else {
      return this.directService.checkAvailability();
    }
  }

  /**
   * Summarize text (batch)
   * @param {string} text - Text to summarize
   * @param {Object} options - Summarization options
   * @returns {Promise<string>} Summary
   */
  async summarize(text: string, options: Record<string, unknown> = {}): Promise<string> {
    await this.ensureConfigured();
    
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('SummarizerServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.SUMMARIZER_SUMMARIZE,
        { text, options },
        { timeout: 60000 }
      ) as { summary?: string };
      return response.summary || '';
    } else {
      return this.directService.summarize(text, options);
    }
  }

  /**
   * Summarize text (streaming)
   * @param {string} text - Text to summarize
   * @param {Object} options - Summarization options
   * @returns {AsyncIterable<string>} Streaming summary chunks
   */
  async *summarizeStreaming(text: string, options: Record<string, unknown> = {}): AsyncGenerator<string, void, void> {
    await this.ensureConfigured();
    
    if (this.isExtension) {
      // Extension mode: Use streaming message bridge with queue-based async iteration
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('SummarizerServiceProxy: Bridge not available');
      
      // Create a queue to hold chunks as they arrive
      const chunkQueue: string[] = [];
      let streamComplete = false;
      let streamError: unknown = null;
      
      // Start streaming in background (don't await - we yield chunks as they arrive)
      const streamPromise = bridge.sendStreamingMessage?.(
        MessageTypes.SUMMARIZER_SUMMARIZE_STREAMING,
        { text, options },
        (chunk: string) => {
          chunkQueue.push(chunk);
        },
        { timeout: 120000 } // 2 minutes for streaming
      );

      if (!streamPromise) {
        throw new Error('SummarizerServiceProxy: Streaming bridge is not available');
      }

      streamPromise.then(() => {
        streamComplete = true;
      }).catch((error: unknown) => {
        streamError = error;
        streamComplete = true;
      });
      
      // Yield chunks as they become available
      while (!streamComplete || chunkQueue.length > 0) {
        if (chunkQueue.length > 0) {
          const nextChunk = chunkQueue.shift();
          if (nextChunk !== undefined) {
            yield nextChunk;
          }
        } else {
          // Wait a bit before checking again
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      // If there was an error, throw it now
      if (streamError) {
        Logger.error('SummarizerServiceProxy', 'Streaming failed:', streamError);
        throw (streamError instanceof Error ? streamError : new Error(String(streamError)));
      }
    } else {
      // Dev mode: Use direct service streaming
      yield* this.directService.summarizeStreaming(text, options);
    }
  }

  /**
   * Abort ongoing summarization request
   */
  async abort(): Promise<void> {
    if (this.isExtension) {
      // Extension mode: Send abort message to background
      const bridge = await this.waitForBridge();
      if (!bridge) {
        Logger.warn('SummarizerServiceProxy', 'Bridge not available for abort');
        return;
      }
      try {
        await bridge.sendMessage(MessageTypes.SUMMARIZER_ABORT, {});
      } catch (error: unknown) {
        Logger.error('SummarizerServiceProxy', 'Abort failed:', error);
      }
    } else {
      // Dev mode: Call the service's abort method directly
      this.directService.abort();
    }
  }

  /**
   * Destroy all summarizer sessions
   */
  async destroy(): Promise<void> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('SummarizerServiceProxy: Bridge not available');
      await bridge.sendMessage(MessageTypes.SUMMARIZER_DESTROY, {});
    } else {
      await this.directService.destroy();
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method: string, ...args: unknown[]): Promise<unknown> {
    const methodMap: Record<string, string> = {
      configure: MessageTypes.SUMMARIZER_CONFIGURE,
      summarize: MessageTypes.SUMMARIZER_SUMMARIZE,
      checkAvailability: MessageTypes.SUMMARIZER_CHECK_AVAILABILITY,
      destroy: MessageTypes.SUMMARIZER_DESTROY
    };

    const messageType = methodMap[method];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error('SummarizerServiceProxy: Bridge not available');
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method: string, ...args: unknown[]): Promise<unknown> {
    const candidateMethod = this.directService[method];
    if (typeof candidateMethod !== 'function') {
      throw new Error(`Method ${method} not found on SummarizerService`);
    }

    return await (candidateMethod as (...params: unknown[]) => unknown)(...args);
  }
}

// Export singleton instance
const summarizerServiceProxy = new SummarizerServiceProxy();
export default summarizerServiceProxy;
