/**
 * Extension Bridge for Main World
 * Allows React app (running in main world) to communicate with content script (isolated world)
 * Uses window.postMessage for cross-world communication
 */

import Logger from '../services/LoggerService';

type BridgeOptions = { timeout?: number };
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onChunk?: (chunk: string) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
  timeout?: number;
};

class ExtensionBridge {
  private requestId: number;
  private pending: Map<number, PendingRequest>;
  private messageListeners: Set<(message: unknown) => void>;

  constructor() {
    this.requestId = 0;
    this.pending = new Map(); // Track pending requests
    this.messageListeners = new Set(); // Track message listeners
    this._setupMessageListener();
  }

  /**
   * Setup listener for responses from content script
   */
  _setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      // Only accept messages from same window
      if (event.source !== window) return;
      
      // Check for broadcast messages (not tied to a specific request)
      if (event.data && event.data.__VASSIST_BROADCAST__) {
        // Notify all registered listeners
        this.messageListeners.forEach((listener) => {
          try {
            listener(event.data);
          } catch (error) {
            Logger.error('ExtensionBridge', 'Listener error:', error);
          }
        });
        return;
      }
      
      // Check for regular response format
      if (event.data && event.data.__VASSIST_RESPONSE__) {
        const { requestId, payload, error } = event.data;
        
        const pending = this.pending.get(requestId);
        if (pending) {
          Logger.log('ExtensionBridge', '✅ Found pending promise, resolving for requestId:', requestId);
          this.pending.delete(requestId);
          
          if (typeof error === 'string' && error) {
            pending.reject(new Error(error));
          } else {
            pending.resolve(payload);
          }
        } else {
          Logger.warn('ExtensionBridge', '❌ No pending promise found for requestId:', requestId);
        }
      }
      
      // Check for streaming token
      if (event.data && event.data.__VASSIST_STREAM_TOKEN__) {
        const { requestId, token } = event.data;
        
        const pending = this.pending.get(requestId);
        if (pending && pending.onChunk) {
          Logger.log('ExtensionBridge', '✅ Calling onChunk callback for token:', token);
          // Reset timeout on each chunk
          if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
            pending.timeoutId = setTimeout(() => {
              this.pending.delete(requestId);
              pending.reject(new Error('Streaming timeout'));
            }, pending.timeout);
          }
          
          // Call chunk callback
          pending.onChunk(token);
        } else {
          Logger.warn('ExtensionBridge', '❌ No pending request found for requestId:', requestId, 'Available:', Array.from(this.pending.keys()));
        }
      }
      
      // Check for stream end
      if (event.data && event.data.__VASSIST_STREAM_END__) {
        const { requestId } = event.data;
        
        const pending = this.pending.get(requestId);
        if (pending) {
          if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
          }
          this.pending.delete(requestId);
          pending.resolve(undefined);
        }
      }
      
      // Check for stream error
      if (event.data && event.data.__VASSIST_STREAM_ERROR__) {
        const { requestId, error } = event.data;
        
        const pending = this.pending.get(requestId);
        if (pending) {
          if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
          }
          this.pending.delete(requestId);
          pending.reject(new Error(typeof error === 'string' ? error : 'Streaming error'));
        }
      }
    });
  }

  /**
   * Send message to background via content script
   * @param {string} type - Message type
   * @param {Object} payload - Message payload
   * @param {Object} options - Options (timeout, etc.)
   * @returns {Promise<Object>} Response from background
   */
  async sendMessage(type: string, payload?: unknown, options: BridgeOptions = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      const timeout = options.timeout || 30000;
      
      // Set timeout for request
      const timeoutId = setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error(`Request timeout: ${type}`));
        }
      }, timeout);
      
      // Store promise callbacks with timeout cleanup (do this BEFORE sending message)
      this.pending.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
      
      // Send message to content script (after pending is set)
      window.postMessage({
        __VASSIST_MESSAGE__: true,
        type,
        payload,
        requestId,
        timeout // Pass timeout to content script
      }, '*');
      
      Logger.log('ExtensionBridge', 'Sent to content script:', type);
    });
  }

  /**
   * Send streaming message to background via content script
   * Sets up listeners for stream tokens and calls onChunk for each token
   * @param {string} type - Message type
   * @param {Object} payload - Message payload
   * @param {Function} onChunk - Callback for each chunk
   * @param {Object} options - Options (timeout, etc.)
   * @returns {Promise<void>} Resolves when stream completes
   */
  async sendStreamingMessage(type: string, payload: unknown, onChunk: (chunk: string) => void, options: BridgeOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      const timeout = options.timeout || 120000; // 2 minutes for streaming
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error(`Streaming timeout: ${type}`));
        }
      }, timeout);
      
      // Store pending request with streaming support
      this.pending.set(requestId, {
        resolve: () => {
          clearTimeout(timeoutId);
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        onChunk,
        timeoutId,
        timeout
      });
      
      // Send streaming request to content script
      window.postMessage({
        __VASSIST_MESSAGE__: true,
        type,
        payload,
        requestId,
        streaming: true, // Flag for streaming request
        timeout // Pass timeout to content script
      }, '*');
      
      Logger.log('ExtensionBridge', 'Sent streaming request:', type, 'requestId:', requestId);
    });
  }

  /**
   * Check if running in extension mode
   * @returns {boolean} True if in extension mode
   */
  isExtensionMode(): boolean {
    return typeof window !== 'undefined' && !!window.__VASSIST_BRIDGE__;
  }

  /**
   * Get resource URL from content script
   * Content script has access to chrome.runtime.getURL, we don't
   * @param {string} path - Resource path (e.g., 'res/private_test/model/1.bpmx')
   * @returns {Promise<string>} Full URL to resource
   */
  async getResourceURL(path: string): Promise<string> {
    try {
      const response = await this.sendMessage('GET_RESOURCE_URL', { path }, { timeout: 5000 }) as { url?: string };
      return response.url || `/${path}`;
    } catch (error) {
      Logger.error('ExtensionBridge', 'Failed to get resource URL:', error);
      return `/${path}`; // Fallback to relative path
    }
  }

  /**
   * Add a message listener for broadcast messages
   * Used for progress updates, notifications, etc.
   * @param {Function} listener - Callback function (message) => {}
   */
  addMessageListener(listener: (message: unknown) => void): void {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function');
    }
    this.messageListeners.add(listener);
    Logger.log('ExtensionBridge', 'Added message listener, total:', this.messageListeners.size);
  }

  /**
   * Remove a message listener
   * @param {Function} listener - Callback function to remove
   */
  removeMessageListener(listener: (message: unknown) => void): void {
    this.messageListeners.delete(listener);
    Logger.log('ExtensionBridge', 'Removed message listener, total:', this.messageListeners.size);
  }
}

// Export singleton instance
export const extensionBridge = new ExtensionBridge();
export default extensionBridge;

// Expose on window for extension mode
if (typeof window !== 'undefined') {
  window.__VASSIST_BRIDGE__ = extensionBridge;
}
