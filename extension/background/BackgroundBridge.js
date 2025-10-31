/**
 * Background Bridge - Service Worker Side
 * Handles messages from content scripts and offscreen documents
 * Manages multiple tab connections and routes to appropriate services
 */

/* global chrome */

import { MessageTypes } from '../shared/MessageTypes.js';
import Logger from '../../src/services/Logger';

export class BackgroundBridge {
  constructor() {
    this.name = 'BackgroundBridge';
    this.tabStates = new Map(); // tabId -> { chatState, abortControllers, etc. }
    this.messageHandlers = new Map(); // messageType -> handler function
    this.offscreenReady = false;
    
    this.setupListeners();
    Logger.log('BackgroundBridge', 'Initialized');
  }

  /**
   * Set up message listeners
   */
  setupListeners() {
    // Listen for messages from content scripts and offscreen
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // CRITICAL: Only handle messages targeted to background or without target
      // Ignore messages for offscreen or other contexts
      if (message.target && message.target !== 'background') {
        // Not for us, ignore silently (no response)
        return false;
      }
      
      // Ignore progress messages - they're handled by temporary listeners
      // These come from offscreen during downloads
      if (message.type === MessageTypes.KOKORO_DOWNLOAD_PROGRESS) {
        // Not an error - just not for the main handler
        return false;
      }
      
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
          Logger.error('BackgroundBridge', 'Message handling error:', error);
          sendResponse({
            type: MessageTypes.ERROR,
            requestId: message.requestId,
            error: error.message
          });
        });
      
      // Return true to indicate async response
      return true;
    });

    // Listen for tab removal to clean up state
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.cleanupTab(tabId);
    });

    Logger.log('BackgroundBridge', 'Listeners set up');
  }

  /**
   * Register a message handler
   * @param {string} messageType - Message type to handle
   * @param {Function} handler - Handler function (message, sender) => Promise<data>
   */
  registerHandler(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
    Logger.log('BackgroundBridge', 'Registered handler for ${messageType}');
  }

  /**
   * Handle incoming message
   * @param {Object} message - Message from content script or offscreen
   * @param {Object} sender - Message sender info
   * @returns {Promise<Object>} Response
   */
  async handleMessage(message, sender) {
    const { type, requestId, tabId: messageTabId } = message;
    const tabId = messageTabId || sender.tab?.id;

    Logger.log('BackgroundBridge', 'Received ${type} from tab ${tabId}, request ${requestId}');

    // Initialize tab state if needed
    if (tabId && !this.tabStates.has(tabId)) {
      this.initializeTab(tabId);
    }

    // Find handler
    const handler = this.messageHandlers.get(type);
    if (!handler) {
      throw new Error(`No handler registered for message type: ${type}`);
    }

    // Call handler
    try {
      const data = await handler(message, sender, tabId);
      
      return {
        type: MessageTypes.SUCCESS,
        requestId,
        data
      };
    } catch (error) {
      Logger.error('BackgroundBridge', 'Handler error for ${type}:', error);
      throw error;
    }
  }

  /**
   * Send message to specific tab
   * @param {number} tabId - Target tab ID
   * @param {Object} message - Message to send
   */
  async sendToTab(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      Logger.error('BackgroundBridge', 'Failed to send to tab ${tabId}:', error);
    }
  }

  /**
   * Send message to offscreen document
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} Response
   */
  async sendToOffscreen(message) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      return response;
    } catch (error) {
      Logger.error('BackgroundBridge', 'Failed to send to offscreen:', error);
      throw error;
    }
  }

  /**
   * Initialize tab state
   * @param {number} tabId - Tab ID
   */
  initializeTab(tabId) {
    Logger.log('BackgroundBridge', 'Initializing tab ${tabId}');
    
    this.tabStates.set(tabId, {
      chatState: {
        messages: [],
        isProcessing: false
      },
      abortControllers: new Map(), // requestId -> AbortController
      lastActivity: Date.now()
    });
  }

  /**
   * Get tab state
   * @param {number} tabId - Tab ID
   * @returns {Object} Tab state
   */
  getTabState(tabId) {
    return this.tabStates.get(tabId);
  }

  /**
   * Update tab state
   * @param {number} tabId - Tab ID
   * @param {Object} updates - State updates
   */
  updateTabState(tabId, updates) {
    const state = this.tabStates.get(tabId);
    if (state) {
      Object.assign(state, updates);
      state.lastActivity = Date.now();
    }
  }

  /**
   * Clean up tab state when tab closes
   * @param {number} tabId - Tab ID
   */
  cleanupTab(tabId) {
    Logger.log('BackgroundBridge', 'Cleaning up tab ${tabId}');
    
    const state = this.tabStates.get(tabId);
    if (state) {
      // Abort any pending requests for this tab
      for (const controller of state.abortControllers.values()) {
        controller.abort();
      }
      
      this.tabStates.delete(tabId);
    }
  }

  /**
   * Get all active tab IDs
   * @returns {number[]} Array of tab IDs
   */
  getActiveTabs() {
    return Array.from(this.tabStates.keys());
  }

  /**
   * Clean up inactive tabs (no activity for 1 hour)
   */
  cleanupInactiveTabs() {
    const oneHour = 60 * 60 * 1000;
    const now = Date.now();
    
    for (const [tabId, state] of this.tabStates.entries()) {
      if (now - state.lastActivity > oneHour) {
        this.cleanupTab(tabId);
      }
    }
  }
}

// Create singleton instance
export const backgroundBridge = new BackgroundBridge();
