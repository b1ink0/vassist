/**
 * Content Bridge - Content Script Side
 * Handles communication with background service worker
 * Provides promise-based API for service calls
 */

/* global chrome */

import { MessageBridge } from '../shared/MessageBridge.js';

export class ContentBridge extends MessageBridge {
  constructor() {
    super('ContentBridge');
    this.setupListeners();
  }

  /**
   * Set up listeners for push messages from background (streaming only)
   */
  setupListeners() {
    // Streaming is handled in content/index.js via chrome.runtime.onMessage
    // This ContentBridge doesn't need a listener - responses come via await
  }

  /**
   * Send message to background service worker
   * @param {Object} message - Message to send
   * @returns {Promise} Send result
   */
  async _sendMessageImpl(message) {
    try {
      console.log(`[${this.name}] Sending message to background:`, message.type, message.requestId);
      const response = await chrome.runtime.sendMessage(message);
      console.log(`[${this.name}] Received response from background:`, response?.type, response?.requestId);
      // Handle the response to resolve the pending promise
      if (response) {
        this.handleResponse(response);
      }
    } catch (error) {
      console.error(`[${this.name}] Failed to send message:`, error);
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
    console.error(`[${this.name}] Extension context invalidated - page reload required`);
    throw new Error('Extension context invalidated');
  }
}

// Create singleton instance
export const contentBridge = new ContentBridge();
