/**
 * Background Service Worker
 * Main entry point for extension background processing
 * Handles AI, TTS, STT services and coordinates with offscreen document
 */

/* global chrome */

import { backgroundBridge } from './BackgroundBridge.js';
import { tabManager } from './TabManager.js';
import { offscreenManager } from './OffscreenManager.js';
import { storageService } from './StorageService.js';
import { MessageTypes } from '../shared/MessageTypes.js';

// Import services
import aiService from './services/AIService.js';
import ttsService from './services/TTSService.js';
import sttService from './services/STTService.js';

console.log('[Background] Service worker starting...');

/**
 * Register message handlers
 */
function registerHandlers() {
  // Storage handlers
  backgroundBridge.registerHandler(MessageTypes.STORAGE_GET, async (message) => {
    const { key, defaultValue } = message.data;
    return await storageService.get(key, defaultValue);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_SET, async (message) => {
    const { key, value } = message.data;
    return await storageService.set(key, value);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_REMOVE, async (message) => {
    const { key } = message.data;
    return await storageService.remove(key);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CLEAR, async () => {
    return await storageService.clear();
  });

  // Tab management
  backgroundBridge.registerHandler(MessageTypes.TAB_INIT, async (_message, _sender, tabId) => {
    if (tabId) {
      // Initialize tab in tab manager and all services
      tabManager.initTab(tabId);
      aiService.initTab(tabId);
      ttsService.initTab(tabId);
      sttService.initTab(tabId);
      return { initialized: true };
    }
    return null;
  });

  backgroundBridge.registerHandler(MessageTypes.TAB_CLEANUP, async (_message, _sender, tabId) => {
    if (tabId) {
      // Cleanup tab in all services
      tabManager.cleanupTab(tabId);
      aiService.cleanupTab(tabId);
      ttsService.cleanupTab(tabId);
      sttService.cleanupTab(tabId);
    }
    return { cleaned: true };
  });

  // AI Service handlers
  backgroundBridge.registerHandler(MessageTypes.AI_CONFIGURE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { config } = message.data;
    await aiService.configure(tabId, config);
    return { configured: true };
  });

  backgroundBridge.registerHandler(MessageTypes.AI_SEND_MESSAGE, async (message, sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    
    const { messages } = message.data;
    let fullResponse = '';
    
    // Stream response back to content script
    await aiService.sendMessage(tabId, messages, (token) => {
      // Send streaming token back to content script
      chrome.tabs.sendMessage(sender.tab.id, {
        type: MessageTypes.AI_STREAM_TOKEN,
        requestId: message.requestId,
        data: { token }
      }).catch(err => console.error('[Background] Failed to send stream token:', err));
      
      fullResponse += token;
    });
    
    return { response: fullResponse };
  });

  backgroundBridge.registerHandler(MessageTypes.AI_ABORT_REQUEST, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const aborted = aiService.abortRequest(tabId);
    return { aborted };
  });

  backgroundBridge.registerHandler(MessageTypes.AI_IS_GENERATING, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const isGenerating = aiService.isGenerating(tabId);
    return { isGenerating };
  });

  // TTS Service handlers
  backgroundBridge.registerHandler(MessageTypes.TTS_CONFIGURE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { config } = message.data;
    await ttsService.configure(tabId, config);
    return { configured: true };
  });

  backgroundBridge.registerHandler(MessageTypes.TTS_GENERATE_SPEECH, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { text } = message.data;
    const result = await ttsService.generateSpeech(tabId, text);
    
    if (!result) {
      return { audioBuffer: null, mimeType: null }; // Generation was stopped
    }
    
    // Convert ArrayBuffer to plain Array to survive structured cloning
    // Chrome's sendMessage transfers both ArrayBuffers AND Uint8Arrays (detaches them)
    // Only plain arrays are guaranteed to be copied, not transferred
    const audioData = Array.from(new Uint8Array(result.audioBuffer));
    console.log('[Background] Converted ArrayBuffer to Array:', audioData.length, 'bytes');
    return { audioBuffer: audioData, mimeType: result.mimeType };
  });

  backgroundBridge.registerHandler(MessageTypes.TTS_STOP_GENERATION, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    ttsService.stopGeneration(tabId);
    return { stopped: true };
  });

  backgroundBridge.registerHandler(MessageTypes.TTS_RESUME_GENERATION, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    ttsService.resumeGeneration(tabId);
    return { resumed: true };
  });

  // Additional TTS handlers for playback control
  backgroundBridge.registerHandler(MessageTypes.TTS_STOP_PLAYBACK, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    // In extension mode, stop generation is the same as stop playback
    ttsService.stopGeneration(tabId);
    return { stopped: true };
  });

  backgroundBridge.registerHandler(MessageTypes.TTS_RESUME_PLAYBACK, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    // In extension mode, resume generation is the same as resume playback
    ttsService.resumeGeneration(tabId);
    return { resumed: true };
  });

  // TTS Audio Processing with Lip Sync (via offscreen)
  backgroundBridge.registerHandler(MessageTypes.TTS_PROCESS_AUDIO_WITH_LIPSYNC, async (message) => {
    console.log('[Background] TTS_PROCESS_AUDIO_WITH_LIPSYNC');
    
    // DON'T convert to ArrayBuffer! Keep as Array for offscreen message passing
    // Chrome's sendMessage transfers ArrayBuffers but copies Arrays
    // Offscreen will convert Array back to ArrayBuffer when it receives it
    const { audioBuffer, mimeType } = message.data;
    
    if (!Array.isArray(audioBuffer)) {
      throw new Error('audioBuffer must be an Array, got: ' + typeof audioBuffer);
    }
    
    console.log('[Background] Forwarding Array to offscreen:', audioBuffer.length, 'bytes');
    
    // Send as Array directly to offscreen
    const offscreenMessage = {
      ...message,
      data: {
        audioBuffer: audioBuffer, // Keep as Array!
        mimeType: mimeType
      }
    };
    
    // sendToOffscreen now handles startJob/endJob internally
    const result = await offscreenManager.sendToOffscreen(offscreenMessage);
    
    // Convert ArrayBuffer in result back to Array for sending to main world
    if (result.data.audioBuffer instanceof ArrayBuffer) {
      result.data.audioBuffer = Array.from(new Uint8Array(result.data.audioBuffer));
      console.log('[Background] Converted result audioBuffer to Array');
    }
    if (result.data.bvmdData instanceof ArrayBuffer) {
      result.data.bvmdData = Array.from(new Uint8Array(result.data.bvmdData));
      console.log('[Background] Converted result bvmdData to Array');
    }
    
    return result.data; // Contains { audioBuffer: Array, bvmdData: Array|null }
  });

  // STT Service handlers
  backgroundBridge.registerHandler(MessageTypes.STT_CONFIGURE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { config } = message.data;
    await sttService.configure(tabId, config);
    return { configured: true };
  });

  backgroundBridge.registerHandler(MessageTypes.STT_TRANSCRIBE_AUDIO, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { audioBuffer, mimeType } = message.data;
    
    // Convert Array back to ArrayBuffer (received as Array from content script)
    if (!Array.isArray(audioBuffer)) {
      throw new Error('audioBuffer must be an Array, got: ' + typeof audioBuffer);
    }
    
    const arrayBuffer = new Uint8Array(audioBuffer).buffer;
    console.log(`[Background] STT_TRANSCRIBE_AUDIO: converted Array (${audioBuffer.length} bytes) to ArrayBuffer`);
    
    const text = await sttService.transcribeAudio(tabId, arrayBuffer, mimeType);
    return { text };
  });

  // Offscreen/Audio handlers
  backgroundBridge.registerHandler(MessageTypes.OFFSCREEN_AUDIO_PLAY, async (message) => {
    console.log('[Background] OFFSCREEN_AUDIO_PLAY');
    offscreenManager.startJob();
    
    try {
      const result = await offscreenManager.sendToOffscreen(message);
      return result.data;
    } finally {
      offscreenManager.endJob();
    }
  });

  backgroundBridge.registerHandler(MessageTypes.OFFSCREEN_AUDIO_STOP, async (message) => {
    console.log('[Background] OFFSCREEN_AUDIO_STOP');
    const result = await offscreenManager.sendToOffscreen(message);
    return result.data;
  });

  backgroundBridge.registerHandler(MessageTypes.OFFSCREEN_VMD_GENERATE, async (message) => {
    console.log('[Background] OFFSCREEN_VMD_GENERATE');
    offscreenManager.startJob();
    
    try {
      const result = await offscreenManager.sendToOffscreen(message);
      return result.data;
    } finally {
      offscreenManager.endJob();
    }
  });

  console.log('[Background] Handlers registered');
}

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // First install
    console.log('[Background] First install - setting up defaults');
    // TODO: Set default configuration
  } else if (details.reason === 'update') {
    // Update
    console.log('[Background] Extension updated');
    // TODO: Handle migration if needed
  }
});

/**
 * Handle browser action click (extension icon)
 */
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[Background] Action clicked for tab:', tab.id);
  
  try {
    // Inject the content script (IIFE wrapper that loads ES module)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    
    console.log('[Content Script] Injected successfully');
    
    // Wait for content script to initialize (increased delay)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send toggle message and wait for response
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_ASSISTANT'
    });
    
    console.log('[Background] Toggle response:', response);
    
  } catch (error) {
    // If already injected, just send toggle message
    if (error.message && error.message.includes('Cannot access')) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'TOGGLE_ASSISTANT'
        });
        console.log('[Background] Toggle response (already injected):', response);
      } catch (toggleError) {
        console.error('[Background] Failed to toggle:', toggleError);
      }
    } else {
      console.error('[Background] Failed to inject:', error);
    }
  }
});

/**
 * Clean up inactive tabs periodically
 */
setInterval(() => {
  tabManager.cleanupInactiveTabs();
}, 60000); // Every minute

/**
 * Keep service worker alive during active sessions
 */
let keepAliveInterval;
function startKeepAlive() {
  if (!keepAliveInterval) {
    keepAliveInterval = setInterval(() => {
      const activeTabs = tabManager.getActiveTabs();
      if (activeTabs.length > 0) {
        console.log('[Background] Keep alive -', activeTabs.length, 'active tabs');
        // Keep offscreen alive if there are active tabs
        offscreenManager.keepAlive();
      } else {
        // No active tabs, can stop keep-alive
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }
      }
    }, 20000); // Every 20 seconds
  }
}

// Start keep-alive on first tab initialization
chrome.tabs.onCreated.addListener(() => {
  startKeepAlive();
});

// Initialize
registerHandlers();
console.log('[Background] Service worker ready');
