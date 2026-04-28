/**
 * Tab Manager
 * Manages per-tab state and lifecycle
 */

import Logger from '../../src/services/LoggerService';

interface TabState {
  id: number;
  chatState: {
    messages: object[];
    isProcessing: boolean;
  };
  abortControllers: Map<string, AbortController>;
  created: number;
  lastActivity: number;
}

export class TabManager {
  tabs: Map<number, TabState>;

  constructor() {
    this.tabs = new Map(); // tabId -> tabState
    Logger.log('TabManager', 'Initialized');
  }

  /**
   * Initialize tab
   */
  initTab(tabId: number): TabState {
    if (this.tabs.has(tabId)) {
      return this.tabs.get(tabId) as TabState;
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
  getTab(tabId: number): TabState | undefined {
    return this.tabs.get(tabId);
  }

  /**
   * Update tab state
   */
  updateTab(tabId: number, updates: Partial<TabState>): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      Object.assign(tab, updates);
      tab.lastActivity = Date.now();
    }
  }

  /**
   * Clean up tab
   */
  cleanupTab(tabId: number): void {
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
  getActiveTabs(): number[] {
    return Array.from(this.tabs.keys());
  }

  /**
   * Clean up inactive tabs (no activity for 1 hour)
   */
  cleanupInactiveTabs(): void {
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
  getAbortController(tabId: number, requestId: string): AbortController | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;
    return tab.abortControllers.get(requestId) ?? null;
  }

  /**
   * Set abort controller for request
   */
  setAbortController(tabId: number, requestId: string, controller: AbortController): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.abortControllers.set(requestId, controller);
    }
  }

  /**
   * Remove abort controller
   */
  removeAbortController(tabId: number, requestId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.abortControllers.delete(requestId);
    }
  }
}

// Create singleton
export const tabManager = new TabManager();
