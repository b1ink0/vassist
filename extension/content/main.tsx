/**
 * Extension Content Script Entry Point
 * Handles shadow DOM initialization and renders the App in extension mode
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
// Import ExtensionBridge first to ensure it's initialized before any services
import { extensionBridge } from '../../src/utils/ExtensionBridge';
import App from '../../src/App';
import Logger from '../../src/services/LoggerService';
import type { Root } from 'react-dom/client';

// Make bridge globally accessible
window.__VASSIST_BRIDGE__ = extensionBridge;


let isInitialized = false;
let reactRoot: Root | null = null;
let isInitializing = false;

const getShadowRoot = () => {
  const container = document.getElementById('virtual-assistant-extension-root');
  if (!container || !container.shadowRoot) {
    return null;
  }
  return container.shadowRoot.getElementById('react-root');
};

const initReactApp = () => {
  if (isInitializing) {
    Logger.log('Extension Content', 'Already initializing, skipping...');
    return;
  }
  
  if (isInitialized && reactRoot) {
    Logger.log('Extension Content', 'Already initialized, skipping');
    return;
  }
  
  try {
    const rootElement = getShadowRoot();
    
    if (!rootElement) {
      Logger.log('Extension Content', 'React root element not found, skipping initialization');
      return;
    }
    
    Logger.log('Extension Content', 'Initializing React app in shadow DOM...');
    isInitializing = true;
    
    reactRoot = createRoot(rootElement);
    isInitialized = true;
    
    reactRoot.render(
      <React.StrictMode>
        <App mode="extension" />
      </React.StrictMode>
    );
    
    Logger.log('Extension Content', 'React app rendered successfully');
    isInitializing = false;
    
  } catch (error) {
    Logger.error('Extension Content', 'Failed to initialize React app:', error);
    isInitializing = false;
  }
};

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of Array.from(mutation.addedNodes)) {
      if (node instanceof HTMLElement && node.id === 'virtual-assistant-extension-root') {
        Logger.log('Extension Content', 'Container detected, initializing...');
        isInitialized = false;
        reactRoot = null;
        isInitializing = false;
        setTimeout(initReactApp, 100);
      }
    }
    
    for (const node of Array.from(mutation.removedNodes)) {
      if (node instanceof HTMLElement && node.id === 'virtual-assistant-extension-root') {
        Logger.log('Extension Content', 'Container removed, cleaning up...');
        
        if (reactRoot) {
          Logger.log('Extension Content', 'Unmounting React app...');
          try {
            reactRoot.unmount();
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Ignore portal-related unmount errors (canvas is in document.body via portal)
            Logger.log('Extension Content', 'React unmount error (expected for portals):', errorMessage);
          }
        }
        
        isInitialized = false;
        reactRoot = null;
        isInitializing = false;
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

const checkExisting = () => {
  const existing = document.getElementById('virtual-assistant-extension-root');
  if (existing && existing.shadowRoot && !isInitialized) {
    Logger.log('Extension Content', 'Found existing container, initializing...');
    setTimeout(initReactApp, 100);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkExisting);
} else {
  checkExisting();
}

export default initReactApp;
