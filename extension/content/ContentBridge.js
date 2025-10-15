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
   * Set up listeners for responses from background
   */
  setupListeners() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      // Handle responses and streaming chunks
      this.handleResponse(message);
      sendResponse({ received: true });
      return true;
    });
  }

  /**
   * Send message to background service worker
   * @param {Object} message - Message to send
   * @returns {Promise} Send result
   */
  async _sendMessageImpl(message) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      // Handle the response directly
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
