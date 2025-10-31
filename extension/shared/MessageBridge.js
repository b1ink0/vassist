/**
 * Base Message Bridge
 * Shared functionality for content, background, and offscreen bridges
 */

import { generateRequestId } from './MessageTypes.js';
import Logger from '../../src/services/Logger';

export class MessageBridge {
  constructor(name) {
    this.name = name;
    this.pendingRequests = new Map(); // requestId -> { resolve, reject, timeout }
    this.defaultTimeout = 30000; // 30 seconds
    
    Logger.log('${this.name}', 'Message bridge initialized');
  }

  /**
   * Send message with promise-based response
   * @param {string} type - Message type
   * @param {Object} data - Message data
   * @param {Object} options - Options (timeout, priority)
   * @returns {Object} { requestId, promise } - Request ID and response promise
   */
  sendMessage(type, data = {}, options = {}) {
    const requestId = generateRequestId();
    const timeout = options.timeout || this.defaultTimeout;
    
    const message = {
      type,
      data,
      requestId,
      tabId: options.tabId || null,
      timestamp: Date.now(),
      priority: options.priority || 1
    };
    
    const promise = new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Message timeout after ${timeout}ms: ${type}`));
      }, timeout);
      
      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutId,
        type
      });
      
      // Send message (implemented by subclass)
      this._sendMessageImpl(message).catch(error => {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(error);
      });
    });
    
    // Return both requestId and promise
    return { requestId, promise };
  }

  /**
   * Send message for streaming response
   * @param {string} type - Message type
   * @param {Object} data - Message data
   * @param {Function} onChunk - Chunk callback
   * @param {Object} options - Options
   * @returns {Promise} Completion promise
   */
  async sendStreamingMessage(type, data = {}, onChunk, options = {}) {
    const requestId = generateRequestId();
    const timeout = options.timeout || 120000; // 2 minutes for streaming
    
    const message = {
      type,
      data,
      requestId,
      streaming: true,
      tabId: options.tabId || null,
      timestamp: Date.now()
    };
    
    return new Promise((resolve, reject) => {
      // Set up timeout (resets on each chunk)
      let timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Streaming timeout: ${type}`));
      }, timeout);
      
      // Store pending request with chunk handler
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutId,
        type,
        onChunk: (chunk) => {
          // Reset timeout on each chunk
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            this.pendingRequests.delete(requestId);
            reject(new Error(`Streaming timeout: ${type}`));
          }, timeout);
          
          onChunk(chunk);
        }
      });
      
      // Send message
      this._sendMessageImpl(message).catch(error => {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(error);
      });
    });
  }

  /**
   * Handle incoming response
   * @param {Object} response - Response message
   */
  handleResponse(response) {
    const { requestId, type, data, error } = response;
    
    if (!requestId) {
      Logger.warn('${this.name}', 'Response without requestId:', response);
      return;
    }
    
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      // Request may have timed out or already completed
      return;
    }
    
    // Handle streaming chunk
    if (type === 'STREAM_CHUNK' && pending.onChunk) {
      pending.onChunk(data);
      return;
    }
    
    // Handle stream end
    if (type === 'STREAM_END') {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.resolve(data);
      return;
    }
    
    // Handle error
    if (type === 'ERROR' || error) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.reject(new Error(error || data?.message || 'Unknown error'));
      return;
    }
    
    // Handle success
    if (type === 'SUCCESS') {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.resolve(data);
      return;
    }
  }

  /**
   * Clean up pending requests (on disconnect, etc.)
   */
  cleanup() {
    Logger.log('${this.name}', 'Cleaning up ${this.pendingRequests.size} pending requests');
    
    for (const [_requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Bridge connection closed'));
    }
    
    this.pendingRequests.clear();
  }

  /**
   * Get pending request count
   */
  getPendingCount() {
    return this.pendingRequests.size;
  }

  /**
   * Subclass must implement actual message sending
   * @returns {Promise} Send result
   */
  async _sendMessageImpl() {
    throw new Error('_sendMessageImpl must be implemented by subclass');
  }
}
