/**
 * Service Proxy Base Class
 * Automatically detects environment and routes to appropriate implementation
 * Dev mode: Direct service calls
 * Extension mode: Bridge messages to background via window.postMessage
 */

import { isExtension } from "../../utils/PlatformUtils";

export interface BridgeSendOptions {
  timeout?: number;
}

export interface ExtensionBridgeLike {
  sendMessage(
    type: string,
    payload?: unknown,
    options?: BridgeSendOptions,
  ): Promise<unknown>;
  sendStreamingMessage?(
    type: string,
    payload: unknown,
    onChunk: (chunk: string) => void,
    options?: BridgeSendOptions,
  ): Promise<void>;
  addMessageListener?(listener: (message: unknown) => void): void;
  removeMessageListener?(listener: (message: unknown) => void): void;
}

declare global {
  interface Window {
    __VASSIST_BRIDGE__?: ExtensionBridgeLike;
  }
}

export class ServiceProxy {
  protected name: string;
  protected isExtension: boolean;
  protected _bridge: ExtensionBridgeLike | null;
  protected directService: Record<string, unknown>;
  protected _configuring: boolean;

  constructor(name: string) {
    this.name = name;
    this.isExtension = isExtension;
    this._bridge = null;
    this.directService = {};
    this._configuring = false;

    // Pre-load bridge immediately in extension mode (synchronous)
    if (this.isExtension && typeof window !== "undefined") {
      try {
        // Import ExtensionBridge synchronously (it's already loaded in main.js)
        import("../../utils/ExtensionBridge")
          .then((module) => {
            const bridge = (module as { extensionBridge?: ExtensionBridgeLike })
              .extensionBridge;
            if (bridge) {
              this._bridge = bridge;
            }
          })
          .catch(() => {
            // Silently fail - will retry via waitForBridge
          });
      } catch {
        // Silently fail - will retry via waitForBridge
      }
    }
  }

  /**
   * Get bridge for extension communication
   * Waits for bridge to load if needed (with timeout)
   * @returns {Object|null} ExtensionBridge instance or null if not in extension mode
   */
  getBridge(): ExtensionBridgeLike | null {
    if (!this.isExtension) {
      return null;
    }

    // Check if we're in a service worker context (no window object)
    const isServiceWorker =
      typeof window === "undefined" && typeof self !== "undefined";

    if (isServiceWorker) {
      // In service worker, we don't need a bridge - services run directly here
      return null;
    }

    if (typeof window === "undefined") {
      return null;
    }

    // Return bridge if already loaded
    if (this._bridge) {
      return this._bridge;
    }

    // If bridge not yet loaded, try to get it from ExtensionBridge singleton
    // The singleton is auto-created when module loads
    try {
      // Try direct access to the module's export if it's been imported
      if (window.__VASSIST_BRIDGE__) {
        this._bridge = window.__VASSIST_BRIDGE__;
        return this._bridge;
      }
    } catch {
      // Ignore errors during fallback
    }

    return null;
  }

  /**
   * Wait for bridge to be available (used when bridge might not be loaded yet)
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Object|null>} Bridge instance
   */
  async waitForBridge(timeout = 5000): Promise<ExtensionBridgeLike | null> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const bridge = this.getBridge();
      if (bridge) {
        return bridge;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
  }

  /**
   * Call method via bridge (extension mode)
   * Must be implemented by subclass
   * @returns {Promise<*>} Result
   */
  async callViaBridge(_method: string, ..._args: unknown[]): Promise<unknown> {
    throw new Error(
      `${this.name}Proxy.callViaBridge() must be implemented by subclass`,
    );
  }

  /**
   * Call method directly (dev mode)
   * Must be implemented by subclass
   * @returns {Promise<*>} Result
   */
  async callDirect(_method: string, ..._args: unknown[]): Promise<unknown> {
    throw new Error(
      `${this.name}Proxy.callDirect() must be implemented by subclass`,
    );
  }

  /**
   * Check if running in extension mode
   * @returns {boolean} True if extension
   */
  isInExtensionMode() {
    return this.isExtension;
  }
}
