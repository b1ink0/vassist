/**
 * Writer Service Proxy
 * Dual-mode wrapper for WriterService
 * Dev mode: Direct API calls
 * Extension mode: Background handles writing
 */

import { ServiceProxy } from './ServiceProxy.js';
import WriterService from '../WriterService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';
import Logger from '../Logger';

class WriterServiceProxy extends ServiceProxy {
  constructor() {
    super('WriterService');
    this.directService = WriterService;
  }

  /**
   * Configure Writer with provider settings
   * @param {Object} config - Configuration
   * @param {string} config.provider - 'chrome-ai', 'openai', or 'ollama'
   */
  async configure(config) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('WriterServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.WRITER_CONFIGURE,
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
      if (!bridge) throw new Error('WriterServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.WRITER_CHECK_AVAILABILITY,
        {}
      );
      return response.availability;
    } else {
      return this.directService.checkAvailability();
    }
  }

  /**
   * Write content (batch)
   * @param {string} prompt - Writing prompt/instruction
   * @param {Object} options - Write options
   * @returns {Promise<string>} Written content
   */
  async write(prompt, options = {}) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('WriterServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.WRITER_WRITE,
        { prompt, options },
        { timeout: 60000 }
      );
      return response.writtenContent;
    } else {
      return this.directService.write(prompt, options);
    }
  }

  /**
   * Write content (streaming)
   * @param {string} prompt - Writing prompt/instruction
   * @param {Object} options - Write options
   * @returns {AsyncIterable<string>} Streaming write chunks
   */
  async *writeStreaming(prompt, options = {}) {
    if (this.isExtension) {
      // Extension mode: Use streaming message bridge with queue-based async iteration
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('WriterServiceProxy: Bridge not available');
      
      // Create a queue to hold chunks as they arrive
      const chunkQueue = [];
      let streamComplete = false;
      let streamError = null;
      
      // Start streaming in background (don't await - we yield chunks as they arrive)
      const _STREAM_PROMISE = bridge.sendStreamingMessage(
        MessageTypes.WRITER_WRITE_STREAMING,
        { prompt, options },
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
        Logger.error('WriterServiceProxy', 'Streaming failed:', streamError);
        throw streamError;
      }
    } else {
      // Dev mode: Use direct service streaming
      yield* this.directService.writeStreaming(prompt, options);
    }
  }

  /**
   * Abort ongoing write request
   */
  async abort() {
    if (this.isExtension) {
      // Extension mode: Send abort message to background
      const bridge = await this.waitForBridge();
      if (!bridge) {
        Logger.warn('WriterServiceProxy', 'Bridge not available for abort');
        return;
      }
      try {
        await bridge.sendMessage(MessageTypes.WRITER_ABORT, {});
      } catch (error) {
        Logger.error('WriterServiceProxy', 'Abort failed:', error);
      }
    } else {
      // Dev mode: Call the service's abort method directly
      this.directService.abort();
    }
  }

  /**
   * Destroy all writer sessions
   */
  async destroy() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('WriterServiceProxy: Bridge not available');
      await bridge.sendMessage(MessageTypes.WRITER_DESTROY, {});
    } else {
      await this.directService.destroy();
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method, ...args) {
    const methodMap = {
      configure: MessageTypes.WRITER_CONFIGURE,
      write: MessageTypes.WRITER_WRITE,
      checkAvailability: MessageTypes.WRITER_CHECK_AVAILABILITY,
      destroy: MessageTypes.WRITER_DESTROY
    };

    const messageType = methodMap[method];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error('WriterServiceProxy: Bridge not available');
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method, ...args) {
    if (typeof this.directService[method] !== 'function') {
      throw new Error(`Method ${method} not found on WriterService`);
    }

    return await this.directService[method](...args);
  }
}

// Export singleton instance
const writerServiceProxy = new WriterServiceProxy();
export default writerServiceProxy;
