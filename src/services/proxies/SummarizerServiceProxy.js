/**
 * Summarizer Service Proxy
 * Dual-mode wrapper for SummarizerService
 * Dev mode: Direct API calls
 * Extension mode: Background handles summarization
 */

import { ServiceProxy } from './ServiceProxy.js';
import SummarizerService from '../SummarizerService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';
import Logger from '../Logger';

class SummarizerServiceProxy extends ServiceProxy {
  constructor() {
    super('SummarizerService');
    this.directService = SummarizerService;
  }

  /**
   * Configure Summarizer with provider settings
   * @param {Object} config - Configuration
   * @param {string} config.provider - 'chrome-ai', 'openai', or 'ollama'
   */
  async configure(config) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('SummarizerServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.SUMMARIZER_CONFIGURE,
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
   * Check availability
   * @returns {Promise<string>} 'readily', 'downloading', 'downloadable', or 'unavailable'
   */
  async checkAvailability() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('SummarizerServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.SUMMARIZER_CHECK_AVAILABILITY,
        {}
      );
      return response.availability;
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
  async summarize(text, options = {}) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('SummarizerServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.SUMMARIZER_SUMMARIZE,
        { text, options },
        { timeout: 60000 }
      );
      return response.summary;
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
  async *summarizeStreaming(text, options = {}) {
    if (this.isExtension) {
      // Extension mode: Use streaming message bridge with queue-based async iteration
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('SummarizerServiceProxy: Bridge not available');
      
      // Create a queue to hold chunks as they arrive
      const chunkQueue = [];
      let streamComplete = false;
      let streamError = null;
      
      // Start streaming in background (don't await - we yield chunks as they arrive)
      const _STREAM_PROMISE = bridge.sendStreamingMessage(
        MessageTypes.SUMMARIZER_SUMMARIZE_STREAMING,
        { text, options },
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
        Logger.error('SummarizerServiceProxy', 'Streaming failed:', streamError);
        throw streamError;
      }
    } else {
      // Dev mode: Use direct service streaming
      yield* this.directService.summarizeStreaming(text, options);
    }
  }

  /**
   * Abort ongoing summarization request
   */
  async abort() {
    if (this.isExtension) {
      // Extension mode: Send abort message to background
      const bridge = await this.waitForBridge();
      if (!bridge) {
        Logger.warn('SummarizerServiceProxy', 'Bridge not available for abort');
        return;
      }
      try {
        await bridge.sendMessage(MessageTypes.SUMMARIZER_ABORT, {});
      } catch (error) {
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
  async destroy() {
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
  async callViaBridge(method, ...args) {
    const methodMap = {
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
  async callDirect(method, ...args) {
    if (typeof this.directService[method] !== 'function') {
      throw new Error(`Method ${method} not found on SummarizerService`);
    }

    return await this.directService[method](...args);
  }
}

// Export singleton instance
const summarizerServiceProxy = new SummarizerServiceProxy();
export default summarizerServiceProxy;
