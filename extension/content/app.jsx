/**
 * Content Script React App
 * Main React application that runs inside the shadow DOM
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import AppContent from '../../src/components/AppContent.jsx';

console.log('[Content App] Module loaded');

// Track if we've already initialized to avoid double initialization
let isInitialized = false;
let reactRoot = null;
let isInitializing = false; // Prevent concurrent initializations

// Get shadow root from the DOM
const getShadowRoot = () => {
  const container = document.getElementById('virtual-assistant-extension-root');
  if (!container || !container.shadowRoot) {
    return null;
  }
  return container.shadowRoot.getElementById('react-root');
};

// Initialize React app
const initReactApp = () => {
  // Prevent concurrent initializations
  if (isInitializing) {
    console.log('[Content App] Already initializing, skipping...');
    return;
  }
  
  // If already initialized, skip
  if (isInitialized && reactRoot) {
    console.log('[Content App] Already initialized, skipping');
    return;
  }
  
  try {
    const rootElement = getShadowRoot();
    
    if (!rootElement) {
      console.log('[Content App] React root element not found, skipping initialization');
      return;
    }
    
    console.log('[Content App] Initializing React app in shadow DOM...');
    isInitializing = true;
    
    // Create React root
    reactRoot = createRoot(rootElement);
    isInitialized = true;
    
    // Render the AppContent component (shared with dev mode)
    reactRoot.render(
      <React.StrictMode>
        <AppContent mode="extension" />
      </React.StrictMode>
    );
    
    console.log('[Content App] React app rendered successfully');
    isInitializing = false;
    
  } catch (error) {
    console.error('[Content App] Failed to initialize React app:', error);
    isInitializing = false;
  }
};

// Watch for shadow root to be added
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.id === 'virtual-assistant-extension-root') {
        console.log('[Content App] Container detected, initializing...');
        // Reset state for fresh initialization
        isInitialized = false;
        reactRoot = null;
        isInitializing = false;
        // Wait for shadow DOM to be ready
        setTimeout(initReactApp, 100);
      }
    }
    
    for (const node of mutation.removedNodes) {
      if (node.id === 'virtual-assistant-extension-root') {
        console.log('[Content App] Container removed, cleaning up...');
        
        // Unmount React app if it's mounted
        if (reactRoot) {
          console.log('[Content App] Unmounting React app...');
          reactRoot.unmount();
        }
        
        // Reset state
        isInitialized = false;
        reactRoot = null;
        isInitializing = false;
      }
    }
  }
});

// Start observing - this will handle all future injections
observer.observe(document.body, { childList: true, subtree: true });

// Try immediate initialization ONLY if container already exists
// (This handles the case where script loads after container is injected)
const checkExisting = () => {
  const existing = document.getElementById('virtual-assistant-extension-root');
  if (existing && existing.shadowRoot && !isInitialized) {
    console.log('[Content App] Found existing container, initializing...');
    setTimeout(initReactApp, 100);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkExisting);
} else {
  checkExisting();
}

export default initReactApp;
