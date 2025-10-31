/**
 * Content Script - Main Entry Point
 * Injects the Virtual Assistant React app into host pages
 * Uses Shadow DOM for complete isolation from host page CSS/JS
 */

/* global chrome */

import { ContentBridge } from './ContentBridge.js';
import { MessageTypes } from '../shared/MessageTypes.js';
import Logger from '../../src/services/Logger';

Logger.log('Content Script', 'Loading...');

class VirtualAssistantInjector {
  constructor() {
    this.shadowRoot = null;
    this.container = null;
    this.scriptElement = null; // Track the injected script
    this.bridge = new ContentBridge();
    this.isInjected = false;
    this.isVisible = false;
    this.isFadingOut = false; // Track fade-out state
    
    this.init();
  }

  async init() {
    Logger.log('Content Script', 'Initializing...');
    
    // Initialize tab in background
    const { promise } = this.bridge.sendMessage(MessageTypes.TAB_INIT, {});
    await promise;
    
    // Check if auto-load is enabled
    try {
      // Read from CONFIG namespace (not SETTINGS) - uiConfig is saved to config namespace
      const { promise: configPromise } = this.bridge.sendMessage(MessageTypes.STORAGE_CONFIG_LOAD, {
        key: 'uiConfig',
        defaultValue: null
      });
      
      const uiConfig = await configPromise;
      const autoLoadEnabled = uiConfig?.autoLoadOnAllPages !== false; // Default to true if not set
      
      Logger.log('Content Script', 'Auto-load setting:', autoLoadEnabled);
      Logger.log('Content Script', 'Full uiConfig:', uiConfig);
      
      if (autoLoadEnabled) {
        Logger.log('Content Script', 'Auto-loading assistant...');
        await this.injectAssistant();
      } else {
        Logger.log('Content Script', 'Auto-load disabled - waiting for manual trigger');
      }
    } catch (error) {
      Logger.error('Content Script', 'Failed to check auto-load setting:', error);
      // On error, don't auto-load (safer default)
    }
    
    Logger.log('Content Script', 'Ready');
  }

  async injectAssistant() {
    if (this.isInjected) {
      Logger.log('Content Script', 'Already injected');
      return;
    }

    Logger.log('Content Script', 'Injecting Virtual Assistant...');
    
    try {
      // Create container element
      Logger.log('Content Script', 'Step 1: Creating container');
      this.container = document.createElement('div');
      this.container.id = 'virtual-assistant-extension-root';
      
      // Set container to fill viewport and allow fixed positioning inside shadow DOM
      // Lower z-index to allow canvas/UI elements to be draggable
      // Add transition for smooth fade-out
      this.container.style.cssText = `
        position: fixed;
        z-index: 9998;
        pointer-events: none;
        opacity: 1;
        transition: opacity 700ms ease-in-out;
      `;
      
      // Create Shadow DOM for complete isolation
      Logger.log('Content Script', 'Step 2: Creating Shadow DOM');
      this.shadowRoot = this.container.attachShadow({ mode: 'open' });
      
      // Inject styles into shadow DOM
      Logger.log('Content Script', 'Step 3: Injecting styles...');
      await this.injectStyles();
      Logger.log('Content Script', 'Step 3: Styles injected ✓');
      
      // Inject React app into shadow DOM
      Logger.log('Content Script', 'Step 4: Injecting React app...');
      await this.injectReactApp();
      Logger.log('Content Script', 'Step 4: React app injected ✓');
      
      // Append to body
      Logger.log('Content Script', 'Step 5: Appending to body');
      document.body.appendChild(this.container);
      
      this.isInjected = true;
      this.isVisible = true;
      
      Logger.log('Content Script', '✅ Virtual Assistant injected successfully');
      
    } catch (error) {
      Logger.error('Content Script', '❌ Failed to inject assistant:', error);
      Logger.error('Content Script', 'Error stack:', error.stack);
    }
  }

  async injectStyles() {
    Logger.log('Content Script', 'injectStyles: Creating link element');
    // Inject Tailwind and app styles into shadow DOM
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('content-styles.css');
    
    Logger.log('Content Script', 'injectStyles: CSS URL:', style.href);
    
    Logger.log('Content Script', 'injectStyles: Appending to shadow root');
    this.shadowRoot.appendChild(style);
    
    // Wait for styles to load with a timeout fallback
    // Note: link elements in Shadow DOM may not fire onload reliably
    await new Promise((resolve) => {
      let resolved = false;
      
      const finish = (source) => {
        if (!resolved) {
          resolved = true;
          Logger.log('Content Script', 'injectStyles: Finished via', source);
          resolve();
        }
      };
      
      style.onload = () => finish('onload');
      style.onerror = (error) => {
        Logger.warn('Content Script', 'injectStyles: CSS load error:', error);
        finish('onerror');
      };
      
      // Fallback timeout - assume loaded after 500ms
      setTimeout(() => finish('timeout'), 500);
    });
    
    Logger.log('Content Script', 'injectStyles: Complete');
  }

  async injectReactApp() {
    Logger.log('Content Script', 'injectReactApp: Creating root div');
    // Create root div for React
    const root = document.createElement('div');
    root.id = 'react-root';
    root.style.cssText = `
      background: transparent;
      pointer-events: auto;
    `;
    
    this.shadowRoot.appendChild(root);
    Logger.log('Content Script', 'injectReactApp: Root div appended to shadow root');
    
    // Setup message bridge for cross-world communication
    this._setupMessageBridge();
    
    // Load React bundle in the main document
    const scriptUrl = chrome.runtime.getURL('content-app.js');
    Logger.log('Content Script', 'injectReactApp: Script URL:', scriptUrl);
    
    // Create script element in the main document
    this.scriptElement = document.createElement('script');
    this.scriptElement.src = scriptUrl;
    this.scriptElement.type = 'module';
    
    Logger.log('Content Script', 'injectReactApp: Waiting for script to load...');
    
    // Wait for script to load
    await new Promise((resolve, reject) => {
      this.scriptElement.onload = () => {
        Logger.log('Content Script', 'injectReactApp: Script loaded successfully ✓');
        resolve();
      };
      this.scriptElement.onerror = (error) => {
        Logger.error('Content Script', 'injectReactApp: Failed to load script ❌', error);
        reject(error);
      };
      // Append to document head (not shadow root)
      Logger.log('Content Script', 'injectReactApp: Appending script to document.head');
      document.head.appendChild(this.scriptElement);
    });
    
    Logger.log('Content Script', 'injectReactApp: Complete');
  }

  /**
   * Setup message bridge between main world (React app) and content script
   * Uses window.postMessage for cross-world communication
   */
  /**
   * Set up message bridge between main world and background
   */
  _setupMessageBridge() {
    // Track streaming requests to properly route tokens
    const streamingRequests = new Map(); // mainWorldRequestId -> backgroundRequestId
    
    // Global listener for ALL stream tokens from background
    chrome.runtime.onMessage.addListener((message) => {
      // Forward stream tokens
      if (message.type === 'AI_STREAM_TOKEN') {
        // Find which main world request this belongs to
        for (const [mainRequestId, bgRequestId] of streamingRequests.entries()) {
          if (message.requestId === bgRequestId) {
            Logger.log('Content Script Bridge', '✅ Forwarding stream token to main world:', message.data.token);
            // Forward to main world with original requestId
            window.postMessage({
              __VASSIST_STREAM_TOKEN__: true,
              requestId: mainRequestId,
              token: message.data.token
            }, '*');
            break;
          }
        }
      }
      
      // Forward broadcast messages (like progress updates)
      if (message.type === MessageTypes.KOKORO_DOWNLOAD_PROGRESS) {
        Logger.log('Content Script Bridge', '✅ Forwarding Kokoro progress to main world');
        window.postMessage({
          __VASSIST_BROADCAST__: true,
          type: message.type,
          data: message.data
        }, '*');
      }
    });
    
    // Listen for messages from main world
    window.addEventListener('message', async (event) => {
      // Only accept messages from same window
      if (event.source !== window) return;
      
      // Check for our message format
      if (event.data && event.data.__VASSIST_MESSAGE__) {
        const { type, payload, requestId, streaming, timeout } = event.data;
        Logger.log('Content Script Bridge', 'Received from main world:', type, streaming ? '(streaming)' : '', timeout ? `(timeout: ${timeout}ms)` : '');
        
        try {
          let response;
          
          // Handle special message types in content script
          if (type === 'GET_RESOURCE_URL') {
            // Generate URL using chrome.runtime.getURL
            const url = chrome.runtime.getURL(payload.path);
            response = { url };
            Logger.log('Content Script Bridge', 'Generated URL:', url, 'for path:', payload.path);
            
            // Send response back to main world
            window.postMessage({
              __VASSIST_RESPONSE__: true,
              requestId,
              payload: response
            }, '*');
          } else if (streaming) {
            // STREAMING REQUEST - Set up token forwarding
            console.log('[Content Script Bridge] Setting up streaming for request (from main world):', requestId);
            
            try {
              // Send request to background and get the actual background requestId
              const { requestId: bgRequestId, promise } = this.bridge.sendMessage(type, payload, { timeout });
              Logger.log('Content Script Bridge', 'Background requestId:', bgRequestId);
              
              // Map main world requestId to background requestId
              streamingRequests.set(requestId, bgRequestId);
              
              // Wait for stream to complete
              response = await promise;
              
              Logger.log('Content Script Bridge', 'Stream complete, response received');
              
              // Send stream end to main world
              window.postMessage({
                __VASSIST_STREAM_END__: true,
                requestId
              }, '*');
            } catch (error) {
              Logger.log('Content Script Bridge', 'Stream error:', error);
              
              // Send stream error to main world
              window.postMessage({
                __VASSIST_STREAM_ERROR__: true,
                requestId,
                error: error.message
              }, '*');
            } finally {
              // Clean up mapping
              streamingRequests.delete(requestId);
              
              Logger.log('Content Script Bridge', 'Stream mapping cleaned up for request:', requestId);
            }
          } else {
            // NON-STREAMING REQUEST
            Logger.log('Content Script Bridge', 'Sending non-streaming request to background:', type, timeout ? `(timeout: ${timeout}ms)` : '');
            const { promise } = this.bridge.sendMessage(type, payload, { timeout });
            response = await promise;
            Logger.log('Content Script Bridge', 'Received response from background for', type, ':', response);
            
            // Send response back to main world
            window.postMessage({
              __VASSIST_RESPONSE__: true,
              requestId,
              payload: response
            }, '*');
            Logger.log('Content Script Bridge', 'Forwarded response to main world for request:', requestId);
          }
        } catch (error) {
          // Send error back to main world
          window.postMessage({
            __VASSIST_RESPONSE__: true,
            requestId,
            error: error.message
          }, '*');
        }
      }
    });
    
    Logger.log('Content Script', 'Message bridge setup complete');
  }

  async toggle() {
    // If currently fading out, cancel the fade and show again
    if (this.isFadingOut) {
      Logger.log('Content Script', 'Cancelling fade-out, keeping assistant visible');
      this.isFadingOut = false;
      // Restore opacity for both container and canvas
      if (this.container) {
        this.container.style.opacity = '1';
      }
      const canvas = document.getElementById('vassist-babylon-canvas');
      if (canvas) {
        canvas.style.opacity = '1';
      }
      this.isVisible = true;
      return;
    }
    
    if (!this.isInjected) {
      // Not injected yet, inject it
      await this.injectAssistant();
      this.isVisible = true;
    } else if (this.isVisible) {
      // Already visible, hide it (but don't cleanup - just fade out)
      await this.fadeOutAndCleanup();
      this.isVisible = false;
    } else {
      // Already injected but hidden, show it again
      if (this.container) {
        this.container.style.opacity = '1';
      }
      const canvas = document.getElementById('vassist-babylon-canvas');
      if (canvas) {
        canvas.style.opacity = '1';
      }
      this.isVisible = true;
    }
    
    Logger.log('Content Script', `Assistant ${this.isVisible ? 'shown' : 'hidden'}`);
  }

  show() {
    if (!this.isInjected) {
      this.injectAssistant();
    }
  }

  hide() {
    if (this.isInjected) {
      this.fadeOutAndCleanup();
    }
  }

  async fadeOutAndCleanup() {
    if (this.isFadingOut) {
      Logger.log('Content Script', 'Already fading out');
      return;
    }
    
    this.isFadingOut = true;
    Logger.log('Content Script', 'Starting fade-out...');
    
    // Fade out container
    if (this.container) {
      this.container.style.opacity = '0';
    }
    
    // Also fade out the canvas (it's in document.body via portal)
    const canvas = document.getElementById('vassist-babylon-canvas');
    if (canvas) {
      canvas.style.opacity = '0';
    }
    
    // Wait for fade-out animation (700ms to match canvas transition)
    await new Promise(resolve => setTimeout(resolve, 700));
    
    // Check if fade-out was cancelled (user clicked again)
    if (!this.isFadingOut) {
      Logger.log('Content Script', 'Fade-out was cancelled, skipping cleanup');
      // Restore opacity if cancelled
      if (this.container) {
        this.container.style.opacity = '1';
      }
      if (canvas) {
        canvas.style.opacity = '1';
      }
      return;
    }
    
    // Proceed with cleanup
    await this.cleanup();
    this.isFadingOut = false;
  }

  async cleanup() {
    Logger.log('Content Script', 'Cleaning up...');
    
    // Notify background
    const { promise } = this.bridge.sendMessage(MessageTypes.TAB_CLEANUP, {});
    await promise;
    
    // Remove script element from document head
    if (this.scriptElement && this.scriptElement.parentNode) {
      Logger.log('Content Script', 'Removing script element...');
      this.scriptElement.parentNode.removeChild(this.scriptElement);
      this.scriptElement = null;
      Logger.log('Content Script', 'Script element removed');
    }
    
    // Remove container from DOM - this removes shadow DOM and all its contents
    // (including React app, Babylon canvas, everything)
    if (this.container && this.container.parentNode) {
      Logger.log('Content Script', 'Removing container from DOM...');
      this.container.parentNode.removeChild(this.container);
      Logger.log('Content Script', 'Container removed');
    }
    
    // Reset state - this allows re-injection
    this.container = null;
    this.shadowRoot = null;
    this.scriptElement = null;
    this.isInjected = false;
    this.isVisible = false;
    
    Logger.log('Content Script', 'Cleanup complete');
  }
}

// Initialize injector
const injector = new VirtualAssistantInjector();

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  Logger.log('Content Script', 'Received message:', message);
  
  const handleMessage = async () => {
    try {
      switch (message.type) {
        case 'PING':
          // Simple ping to check if content script is loaded
          return { success: true, loaded: true };
          
        case 'TOGGLE_ASSISTANT':
          await injector.toggle();
          return { success: true, isVisible: injector.isInjected };
          
        case 'SHOW_ASSISTANT':
          await injector.show();
          return { success: true };
          
        case 'HIDE_ASSISTANT':
          await injector.hide();
          return { success: true };
          
        default:
          return { success: false, error: 'Unknown message type' };
      }
    } catch (error) {
      Logger.error('Content Script', 'Error handling message:', error);
      return { success: false, error: error.message };
    }
  };
  
  // Handle async response
  handleMessage().then(sendResponse);
  return true; // Keep channel open for async response
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  injector.cleanup();
});

// Export for external control (if needed)
window.__virtualAssistant = injector;

Logger.log('Content Script', 'Message listener registered');
