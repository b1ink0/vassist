/**
 * Content Script - Main Entry Point
 * Injects the Virtual Assistant React app into host pages
 * Uses Shadow DOM for complete isolation from host page CSS/JS
 */

/* global chrome */

import { ContentBridge } from './ContentBridge.js';
import { MessageTypes } from '../shared/MessageTypes.js';

console.log('[Content Script] Loading...');

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
    console.log('[Content Script] Initializing...');
    
    // Don't auto-inject - wait for user to click extension icon
    // The message listener at the bottom handles injection
    
    // Initialize tab in background
    const { promise } = this.bridge.sendMessage(MessageTypes.TAB_INIT, {});
    await promise;
    
    console.log('[Content Script] Ready');
  }

  async injectAssistant() {
    if (this.isInjected) {
      console.log('[Content Script] Already injected');
      return;
    }

    console.log('[Content Script] Injecting Virtual Assistant...');
    
    try {
      // Create container element
      console.log('[Content Script] Step 1: Creating container');
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
      console.log('[Content Script] Step 2: Creating Shadow DOM');
      this.shadowRoot = this.container.attachShadow({ mode: 'open' });
      
      // Inject styles into shadow DOM
      console.log('[Content Script] Step 3: Injecting styles...');
      await this.injectStyles();
      console.log('[Content Script] Step 3: Styles injected ✓');
      
      // Inject React app into shadow DOM
      console.log('[Content Script] Step 4: Injecting React app...');
      await this.injectReactApp();
      console.log('[Content Script] Step 4: React app injected ✓');
      
      // Append to body
      console.log('[Content Script] Step 5: Appending to body');
      document.body.appendChild(this.container);
      
      this.isInjected = true;
      this.isVisible = true;
      
      console.log('[Content Script] ✅ Virtual Assistant injected successfully');
      
    } catch (error) {
      console.error('[Content Script] ❌ Failed to inject assistant:', error);
      console.error('[Content Script] Error stack:', error.stack);
    }
  }

  async injectStyles() {
    console.log('[Content Script] injectStyles: Creating link element');
    // Inject Tailwind and app styles into shadow DOM
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('content-styles.css');
    
    console.log('[Content Script] injectStyles: CSS URL:', style.href);
    
    console.log('[Content Script] injectStyles: Appending to shadow root');
    this.shadowRoot.appendChild(style);
    
    // Wait for styles to load with a timeout fallback
    // Note: link elements in Shadow DOM may not fire onload reliably
    await new Promise((resolve) => {
      let resolved = false;
      
      const finish = (source) => {
        if (!resolved) {
          resolved = true;
          console.log('[Content Script] injectStyles: Finished via', source);
          resolve();
        }
      };
      
      style.onload = () => finish('onload');
      style.onerror = (error) => {
        console.warn('[Content Script] injectStyles: CSS load error:', error);
        finish('onerror');
      };
      
      // Fallback timeout - assume loaded after 500ms
      setTimeout(() => finish('timeout'), 500);
    });
    
    console.log('[Content Script] injectStyles: Complete');
  }

  async injectReactApp() {
    console.log('[Content Script] injectReactApp: Creating root div');
    // Create root div for React
    const root = document.createElement('div');
    root.id = 'react-root';
    root.style.cssText = `
      background: transparent;
      pointer-events: auto;
    `;
    
    this.shadowRoot.appendChild(root);
    console.log('[Content Script] injectReactApp: Root div appended to shadow root');
    
    // Set extension mode flag for main world
    // This flag tells React app that it's running as an extension
    // Resource URLs must be requested via ExtensionBridge.getResourceURL()
    window.__VASSIST_EXTENSION_MODE__ = true;
    console.log('[Content Script] injectReactApp: Set extension mode flag');
    
    // Setup message bridge for cross-world communication
    this._setupMessageBridge();
    
    // Load React bundle in the main document
    const scriptUrl = chrome.runtime.getURL('content-app.js');
    console.log('[Content Script] injectReactApp: Script URL:', scriptUrl);
    
    // Create script element in the main document
    this.scriptElement = document.createElement('script');
    this.scriptElement.src = scriptUrl;
    this.scriptElement.type = 'module';
    
    console.log('[Content Script] injectReactApp: Waiting for script to load...');
    
    // Wait for script to load
    await new Promise((resolve, reject) => {
      this.scriptElement.onload = () => {
        console.log('[Content Script] injectReactApp: Script loaded successfully ✓');
        resolve();
      };
      this.scriptElement.onerror = (error) => {
        console.error('[Content Script] injectReactApp: Failed to load script ❌', error);
        reject(error);
      };
      // Append to document head (not shadow root)
      console.log('[Content Script] injectReactApp: Appending script to document.head');
      document.head.appendChild(this.scriptElement);
    });
    
    console.log('[Content Script] injectReactApp: Complete');
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
      if (message.type === 'AI_STREAM_TOKEN') {
        // Find which main world request this belongs to
        for (const [mainRequestId, bgRequestId] of streamingRequests.entries()) {
          if (message.requestId === bgRequestId) {
            console.log('[Content Script Bridge] ✅ Forwarding stream token to main world:', message.data.token);
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
    });
    
    // Listen for messages from main world
    window.addEventListener('message', async (event) => {
      // Only accept messages from same window
      if (event.source !== window) return;
      
      // Check for our message format
      if (event.data && event.data.__VASSIST_MESSAGE__) {
        const { type, payload, requestId, streaming } = event.data;
        console.log('[Content Script Bridge] Received from main world:', type, streaming ? '(streaming)' : '');
        
        try {
          let response;
          
          // Handle special message types in content script
          if (type === 'GET_RESOURCE_URL') {
            // Generate URL using chrome.runtime.getURL
            const url = chrome.runtime.getURL(payload.path);
            response = { url };
            console.log('[Content Script Bridge] Generated URL:', url, 'for path:', payload.path);
            
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
              const { requestId: bgRequestId, promise } = this.bridge.sendMessage(type, payload);
              console.log('[Content Script Bridge] Background requestId:', bgRequestId);
              
              // Map main world requestId to background requestId
              streamingRequests.set(requestId, bgRequestId);
              
              // Wait for stream to complete
              response = await promise;
              
              console.log('[Content Script Bridge] Stream complete, response received');
              
              // Send stream end to main world
              window.postMessage({
                __VASSIST_STREAM_END__: true,
                requestId
              }, '*');
            } catch (error) {
              console.log('[Content Script Bridge] Stream error:', error);
              
              // Send stream error to main world
              window.postMessage({
                __VASSIST_STREAM_ERROR__: true,
                requestId,
                error: error.message
              }, '*');
            } finally {
              // Clean up mapping
              streamingRequests.delete(requestId);
              
              console.log('[Content Script Bridge] Stream mapping cleaned up for request:', requestId);
            }
          } else {
            // NON-STREAMING REQUEST
            console.log('[Content Script Bridge] Sending non-streaming request to background:', type);
            const { promise } = this.bridge.sendMessage(type, payload);
            response = await promise;
            console.log('[Content Script Bridge] Received response from background for', type, ':', response);
            
            // Send response back to main world
            window.postMessage({
              __VASSIST_RESPONSE__: true,
              requestId,
              payload: response
            }, '*');
            console.log('[Content Script Bridge] Forwarded response to main world for request:', requestId);
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
    
    console.log('[Content Script] Message bridge setup complete');
  }

  async toggle() {
    // If currently fading out, cancel the fade and show again
    if (this.isFadingOut) {
      console.log('[Content Script] Cancelling fade-out, keeping assistant visible');
      this.isFadingOut = false;
      // Restore opacity for both container and canvas
      if (this.container) {
        this.container.style.opacity = '1';
      }
      const canvas = document.getElementById('vassist-babylon-canvas');
      if (canvas) {
        canvas.style.opacity = '1';
      }
      return;
    }
    
    if (!this.isInjected) {
      // Not injected yet, inject it
      await this.injectAssistant();
    } else {
      // Already injected, fade out and cleanup
      await this.fadeOutAndCleanup();
    }
    
    console.log(`[Content Script] Assistant ${this.isInjected ? 'shown' : 'hidden'}`);
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
      console.log('[Content Script] Already fading out');
      return;
    }
    
    this.isFadingOut = true;
    console.log('[Content Script] Starting fade-out...');
    
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
      console.log('[Content Script] Fade-out was cancelled, skipping cleanup');
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
    console.log('[Content Script] Cleaning up...');
    
    // Notify background
    const { promise } = this.bridge.sendMessage(MessageTypes.TAB_CLEANUP, {});
    await promise;
    
    // Remove script element from document head
    if (this.scriptElement && this.scriptElement.parentNode) {
      console.log('[Content Script] Removing script element...');
      this.scriptElement.parentNode.removeChild(this.scriptElement);
      this.scriptElement = null;
      console.log('[Content Script] Script element removed');
    }
    
    // Remove container from DOM - this removes shadow DOM and all its contents
    // (including React app, Babylon canvas, everything)
    if (this.container && this.container.parentNode) {
      console.log('[Content Script] Removing container from DOM...');
      this.container.parentNode.removeChild(this.container);
      console.log('[Content Script] Container removed');
    }
    
    // Reset state - this allows re-injection
    this.container = null;
    this.shadowRoot = null;
    this.scriptElement = null;
    this.isInjected = false;
    this.isVisible = false;
    
    console.log('[Content Script] Cleanup complete');
  }
}

// Initialize injector
const injector = new VirtualAssistantInjector();

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content Script] Received message:', message);
  
  const handleMessage = async () => {
    try {
      switch (message.type) {
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
      console.error('[Content Script] Error handling message:', error);
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

console.log('[Content Script] Message listener registered');
