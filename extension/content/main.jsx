/**
 * Extension Content Script Entry Point
 * Handles shadow DOM initialization and renders the App in extension mode
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App.jsx';

console.log('[Extension Content] Module loaded');

let isInitialized = false;
let reactRoot = null;
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
    console.log('[Extension Content] Already initializing, skipping...');
    return;
  }
  
  if (isInitialized && reactRoot) {
    console.log('[Extension Content] Already initialized, skipping');
    return;
  }
  
  try {
    const rootElement = getShadowRoot();
    
    if (!rootElement) {
      console.log('[Extension Content] React root element not found, skipping initialization');
      return;
    }
    
    console.log('[Extension Content] Initializing React app in shadow DOM...');
    isInitializing = true;
    
    reactRoot = createRoot(rootElement);
    isInitialized = true;
    
    reactRoot.render(
      <React.StrictMode>
        <App mode="extension" />
      </React.StrictMode>
    );
    
    console.log('[Extension Content] React app rendered successfully');
    isInitializing = false;
    
  } catch (error) {
    console.error('[Extension Content] Failed to initialize React app:', error);
    isInitializing = false;
  }
};

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.id === 'virtual-assistant-extension-root') {
        console.log('[Extension Content] Container detected, initializing...');
        isInitialized = false;
        reactRoot = null;
        isInitializing = false;
        setTimeout(initReactApp, 100);
      }
    }
    
    for (const node of mutation.removedNodes) {
      if (node.id === 'virtual-assistant-extension-root') {
        console.log('[Extension Content] Container removed, cleaning up...');
        
        if (reactRoot) {
          console.log('[Extension Content] Unmounting React app...');
          reactRoot.unmount();
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
    console.log('[Extension Content] Found existing container, initializing...');
    setTimeout(initReactApp, 100);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkExisting);
} else {
  checkExisting();
}

export default initReactApp;
