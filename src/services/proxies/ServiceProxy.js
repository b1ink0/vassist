/**
 * Service Proxy Base Class
 * Automatically detects environment and routes to appropriate implementation
 * Dev mode: Direct service calls
 * Extension mode: Bridge messages to background via window.postMessage
 */

import { extensionBridge } from '../../utils/ExtensionBridge.js';

export class ServiceProxy {
  constructor(name) {
    this.name = name;
    this.isExtension = this.detectExtensionMode();
    
    console.log(`[${this.name}Proxy] Mode: ${this.isExtension ? 'Extension' : 'Dev'}`);
  }

  /**
   * Detect if running in extension mode
   * @returns {boolean} True if extension mode
   */
  detectExtensionMode() {
    // Check if the current script was loaded from a chrome-extension:// URL
    // When running as extension, import.meta.url will be chrome-extension://...
    // In dev mode with Vite, it will be http://localhost:5173/...
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return import.meta.url.startsWith('chrome-extension://');
    }
    
    return false;
  }

  /**
   * Get bridge for extension communication
   * For compatibility with existing proxy code that uses this.bridge
   */
  get bridge() {
    return extensionBridge;
  }

  /**
   * Route method call to appropriate implementation
   * @param {string} method - Method name
   * @param {Array} args - Method arguments
   * @returns {Promise<*>} Method result
   */
  async route(method, ...args) {
    if (this.isExtension) {
      // Extension mode: use window.postMessage bridge
      return await this.callViaBridge(method, ...args);
    } else {
      // Dev mode: call direct service
      return await this.callDirect(method, ...args);
    }
  }

  /**
   * Get extension bridge for cross-world communication
   * @returns {Object} ExtensionBridge instance
   */
  getBridge() {
    return extensionBridge;
  }

  /**
   * Call method via bridge (extension mode)
   * Must be implemented by subclass
   * @returns {Promise<*>} Result
   */
  async callViaBridge() {
    throw new Error(`${this.name}Proxy.callViaBridge() must be implemented by subclass`);
  }

  /**
   * Call method directly (dev mode)
   * Must be implemented by subclass
   * @returns {Promise<*>} Result
   */
  async callDirect() {
    throw new Error(`${this.name}Proxy.callDirect() must be implemented by subclass`);
  }

  /**
   * Check if running in extension mode
   * @returns {boolean} True if extension
   */
  isInExtensionMode() {
    return this.isExtension;
  }
}
