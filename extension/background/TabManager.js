/**
 * Tab Manager
 * Manages per-tab state and lifecycle
 */

import Logger from '../../src/services/Logger';
export class TabManager {
  constructor() {
    this.tabs = new Map(); // tabId -> tabState
    Logger.log('TabManager', 'Initialized');
  }

  /**
   * Initialize tab
   */
  initTab(tabId) {
    if (this.tabs.has(tabId)) {
      return this.tabs.get(tabId);
    }

    Logger.log('TabManager', 'Initializing tab ${tabId}');

    const tabState = {
      id: tabId,
      chatState: {
        messages: [],
        isProcessing: false
      },
      abortControllers: new Map(), // requestId -> AbortController
      created: Date.now(),
      lastActivity: Date.now()
    };

    this.tabs.set(tabId, tabState);
    return tabState;
  }

  /**
   * Get tab state
   */
  getTab(tabId) {
    return this.tabs.get(tabId);
  }

  /**
   * Update tab state
   */
  updateTab(tabId, updates) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      Object.assign(tab, updates);
      tab.lastActivity = Date.now();
    }
  }

  /**
   * Clean up tab
   */
  cleanupTab(tabId) {
    Logger.log('TabManager', 'Cleaning up tab ${tabId}');

    const tab = this.tabs.get(tabId);
    if (!tab) return;

    // Abort all pending requests
    for (const controller of tab.abortControllers.values()) {
      try {
        controller.abort();
      } catch (error) {
        Logger.warn('TabManager', 'Error aborting controller:', error);
      }
    }

    this.tabs.delete(tabId);
  }

  /**
   * Get all active tab IDs
   */
  getActiveTabs() {
    return Array.from(this.tabs.keys());
  }

  /**
   * Clean up inactive tabs (no activity for 1 hour)
   */
  cleanupInactiveTabs() {
    const oneHour = 60 * 60 * 1000;
    const now = Date.now();

    for (const [tabId, tab] of this.tabs.entries()) {
      if (now - tab.lastActivity > oneHour) {
        this.cleanupTab(tabId);
      }
    }
  }

  /**
   * Get abort controller for request
   */
  getAbortController(tabId, requestId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;
    return tab.abortControllers.get(requestId);
  }

  /**
   * Set abort controller for request
   */
  setAbortController(tabId, requestId, controller) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.abortControllers.set(requestId, controller);
    }
  }

  /**
   * Remove abort controller
   */
  removeAbortController(tabId, requestId) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.abortControllers.delete(requestId);
    }
  }
}

// Create singleton
export const tabManager = new TabManager();
