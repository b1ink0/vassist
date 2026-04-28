/**
 * Content Bridge - Content Script Side
 * Handles communication with background service worker
 * Provides promise-based API for service calls
 */

/* global chrome */

import { MessageBridge } from '../shared/MessageBridge';

type BridgePayloadValue = string | number | boolean | null | undefined | object;
type BridgePayload = Record<string, BridgePayloadValue>;

interface OutgoingMessage {
  type: string;
  requestId: string;
  data: BridgePayload;
  timestamp: number;
  tabId?: number | null;
  priority?: number;
  streaming?: boolean;
}

export class ContentBridge extends MessageBridge {
  constructor() {
    super('ContentBridge');
    this.setupListeners();
  }

  /**
   * Set up listeners for push messages from background (streaming only)
   */
  setupListeners(): void {
    // Streaming is handled in content/index.js via chrome.runtime.onMessage
    // This ContentBridge doesn't need a listener - responses come via await
  }

  /**
   * Send message to background service worker
   * @param {Object} message - Message to send
   * @returns {Promise} Send result
   */
  async _sendMessageImpl(message: OutgoingMessage): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage(message);
      // Handle the response to resolve the pending promise
      if (response) {
        this.handleResponse(response);
      }
    } catch (error) {
      throw new Error('Failed to communicate with background service');
    }
  }

  /**
   * Check if extension context is valid
   * @returns {boolean} True if valid
   */
  isConnected() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  /**
   * Reconnect if connection lost
   */
  async reconnect() {
    // Extension context cannot reconnect - page needs reload
    throw new Error('Extension context invalidated');
  }
}

// Create singleton instance
export const contentBridge = new ContentBridge();
