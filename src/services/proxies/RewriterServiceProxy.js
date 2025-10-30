/**
 * Rewriter Service Proxy
 * Dual-mode wrapper for RewriterService
 * Dev mode: Direct API calls
 * Extension mode: Background handles rewriting
 */

import { ServiceProxy } from './ServiceProxy.js';
import RewriterService from '../RewriterService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';

class RewriterServiceProxy extends ServiceProxy {
  constructor() {
    super('RewriterService');
    this.directService = RewriterService;
  }

  /**
   * Configure Rewriter with provider settings
   * @param {Object} config - Configuration
   * @param {string} config.provider - 'chrome-ai', 'openai', or 'ollama'
   */
  async configure(config) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('RewriterServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.REWRITER_CONFIGURE,
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
      if (!bridge) throw new Error('RewriterServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.REWRITER_CHECK_AVAILABILITY,
        {}
      );
      return response.availability;
    } else {
      return this.directService.checkAvailability();
    }
  }

  /**
   * Rewrite text (batch)
   * @param {string} text - Text to rewrite
   * @param {Object} options - Rewrite options
   * @returns {Promise<string>} Rewritten text
   */
  async rewrite(text, options = {}) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('RewriterServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.REWRITER_REWRITE,
        { text, options },
        { timeout: 60000 }
      );
      return response.rewrittenText;
    } else {
      return this.directService.rewrite(text, options);
    }
  }

  /**
   * Rewrite text (streaming)
   * @param {string} text - Text to rewrite
   * @param {Object} options - Rewrite options
   * @returns {AsyncIterable<string>} Streaming rewrite chunks
   */
  async *rewriteStreaming(text, options = {}) {
    if (this.isExtension) {
      // Extension mode: Use streaming message bridge with queue-based async iteration
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('RewriterServiceProxy: Bridge not available');
      
      // Create a queue to hold chunks as they arrive
      const chunkQueue = [];
      let streamComplete = false;
      let streamError = null;
      
      // Start streaming in background (don't await - we yield chunks as they arrive)
      const _STREAM_PROMISE = bridge.sendStreamingMessage(
        MessageTypes.REWRITER_REWRITE_STREAMING,
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
        console.error('[RewriterServiceProxy] Streaming failed:', streamError);
        throw streamError;
      }
    } else {
      // Dev mode: Use direct service streaming
      yield* this.directService.rewriteStreaming(text, options);
    }
  }

  /**
   * Abort ongoing rewrite request
   */
  async abort() {
    if (this.isExtension) {
      // Extension mode: Send abort message to background
      const bridge = await this.waitForBridge();
      if (!bridge) {
        console.warn('[RewriterServiceProxy] Bridge not available for abort');
        return;
      }
      try {
        await bridge.sendMessage(MessageTypes.REWRITER_ABORT, {});
      } catch (error) {
        console.error('[RewriterServiceProxy] Abort failed:', error);
      }
    } else {
      // Dev mode: Call the service's abort method directly
      this.directService.abort();
    }
  }

  /**
   * Destroy all rewriter sessions
   */
  async destroy() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('RewriterServiceProxy: Bridge not available');
      await bridge.sendMessage(MessageTypes.REWRITER_DESTROY, {});
    } else {
      await this.directService.destroy();
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method, ...args) {
    const methodMap = {
      configure: MessageTypes.REWRITER_CONFIGURE,
      rewrite: MessageTypes.REWRITER_REWRITE,
      checkAvailability: MessageTypes.REWRITER_CHECK_AVAILABILITY,
      destroy: MessageTypes.REWRITER_DESTROY
    };

    const messageType = methodMap[method];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error('RewriterServiceProxy: Bridge not available');
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method, ...args) {
    if (typeof this.directService[method] !== 'function') {
      throw new Error(`Method ${method} not found on RewriterService`);
    }

    return await this.directService[method](...args);
  }
}

// Export singleton instance
const rewriterServiceProxy = new RewriterServiceProxy();
export default rewriterServiceProxy;
