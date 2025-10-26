/**
 * Background Service Worker
 * Main entry point for extension background processing
 * Handles AI, TTS, STT services and coordinates with offscreen document
 */

/* global chrome */

import { backgroundBridge } from './BackgroundBridge.js';
import { tabManager } from './TabManager.js';
import { offscreenManager } from './OffscreenManager.js';
import { MessageTypes } from '../shared/MessageTypes.js';

// Import services directly from src (unified implementation)
import storageManager from '../../src/storage/StorageManager.js';
import aiService from '../../src/services/AIService.js';
import ttsService from '../../src/services/TTSService.js';
import sttService from '../../src/services/STTService.js';
import translatorService from '../../src/services/TranslatorService.js';
import languageDetectorService from '../../src/services/LanguageDetectorService.js';
import summarizerService from '../../src/services/SummarizerService.js';

console.log('[Background] Service worker starting...');

/**
 * Register message handlers
 */
async function registerHandlers() {
  // Storage handlers - CONFIG namespace
  backgroundBridge.registerHandler(MessageTypes.STORAGE_CONFIG_SAVE, async (message) => {
    const { key, value } = message.data;
    return await storageManager.config.save(key, value);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CONFIG_LOAD, async (message) => {
    const { key, defaultValue } = message.data;
    return await storageManager.config.load(key, defaultValue);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CONFIG_EXISTS, async (message) => {
    const { key } = message.data;
    return await storageManager.config.exists(key);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CONFIG_REMOVE, async (message) => {
    const { key } = message.data;
    return await storageManager.config.remove(key);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CONFIG_GET_ALL, async () => {
    return await storageManager.config.getAll();
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CONFIG_CLEAR, async () => {
    return await storageManager.config.clear();
  });

  // Storage handlers - SETTINGS namespace
  backgroundBridge.registerHandler(MessageTypes.STORAGE_SETTINGS_SAVE, async (message) => {
    const { key, value } = message.data;
    return await storageManager.settings.save(key, value);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_SETTINGS_LOAD, async (message) => {
    const { key, defaultValue } = message.data;
    return await storageManager.settings.load(key, defaultValue);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_SETTINGS_EXISTS, async (message) => {
    const { key } = message.data;
    return await storageManager.settings.exists(key);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_SETTINGS_REMOVE, async (message) => {
    const { key } = message.data;
    return await storageManager.settings.remove(key);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_SETTINGS_GET_ALL, async () => {
    return await storageManager.settings.getAll();
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_SETTINGS_CLEAR, async () => {
    return await storageManager.settings.clear();
  });

  // Storage handlers - CACHE namespace
  backgroundBridge.registerHandler(MessageTypes.STORAGE_CACHE_SAVE, async (message) => {
    const { key, value, ttlSeconds } = message.data;
    return await storageManager.cache.save(key, value, ttlSeconds);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CACHE_LOAD, async (message) => {
    const { key } = message.data;
    return await storageManager.cache.load(key);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CACHE_EXISTS, async (message) => {
    const { key } = message.data;
    return await storageManager.cache.exists(key);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CACHE_REMOVE, async (message) => {
    const { key } = message.data;
    return await storageManager.cache.remove(key);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CACHE_GET_ALL, async () => {
    return await storageManager.cache.getAll();
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CACHE_CLEANUP, async () => {
    return await storageManager.cache.cleanup();
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CACHE_CLEAR, async () => {
    return await storageManager.cache.clear();
  });

  // Storage handlers - CHAT namespace
  backgroundBridge.registerHandler(MessageTypes.STORAGE_CHAT_SAVE, async (message) => {
    const { chatId, data } = message.data;
    console.log('[Background] STORAGE_CHAT_SAVE handler called for:', chatId);
    console.log('[Background] Chat data keys:', Object.keys(data || {}));
    try {
      const result = await storageManager.chat.save(chatId, data);
      console.log('[Background] STORAGE_CHAT_SAVE success, saved to IndexedDB:', chatId);
      return result;
    } catch (error) {
      console.error('[Background] STORAGE_CHAT_SAVE failed:', error);
      throw error;
    }
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CHAT_LOAD, async (message) => {
    const { chatId } = message.data;
    return await storageManager.chat.load(chatId);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CHAT_EXISTS, async (message) => {
    const { chatId } = message.data;
    return await storageManager.chat.exists(chatId);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CHAT_REMOVE, async (message) => {
    const { chatId } = message.data;
    return await storageManager.chat.remove(chatId);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CHAT_GET_ALL, async () => {
    return await storageManager.chat.getAll();
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_CHAT_CLEAR, async () => {
    return await storageManager.chat.clear();
  });

  // Storage handlers - FILES namespace
  backgroundBridge.registerHandler(MessageTypes.STORAGE_FILE_SAVE, async (message) => {
    const { fileId, data, category } = message.data;
    console.log('[Background] STORAGE_FILE_SAVE handler called for:', fileId);
    
    // Convert serialized data back to Blob if needed
    let storageData = data;
    if (data && typeof data === 'object' && Array.isArray(data.data)) {
      console.log('[Background] Converting Uint8Array back to Blob for storage');
      const blobType = data._blobType || 'application/octet-stream';
      const uint8Array = new Uint8Array(data.data);
      const blob = new Blob([uint8Array], { type: blobType });
      storageData = {
        ...data,
        data: blob, // Now it's a Blob again
      };
      delete storageData._blobType;
    }
    
    try {
      const result = await storageManager.files.save(fileId, storageData, category);
      console.log('[Background] STORAGE_FILE_SAVE success:', fileId);
      return result;
    } catch (error) {
      console.error('[Background] STORAGE_FILE_SAVE failed:', error);
      throw error;
    }
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_FILE_LOAD, async (message) => {
    const { fileId } = message.data;
    const result = await storageManager.files.load(fileId);
    
    // Convert Blob to Array for message serialization (structured clone limitation)
    if (result && typeof result === 'object' && result.data instanceof Blob) {
      console.log('[Background] Converting Blob to Uint8Array for transfer');
      const buffer = await result.data.arrayBuffer();
      result.data = Array.from(new Uint8Array(buffer));
      result._blobType = result._blobType || 'application/octet-stream';
    }
    
    return result;
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_FILE_EXISTS, async (message) => {
    const { fileId } = message.data;
    return await storageManager.files.exists(fileId);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_FILE_REMOVE, async (message) => {
    const { fileId } = message.data;
    return await storageManager.files.remove(fileId);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_FILES_GET_ALL, async () => {
    return await storageManager.files.getAll();
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_FILES_GET_BY_CATEGORY, async (message) => {
    const { category } = message.data;
    return await storageManager.files.getByCategory(category);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_FILES_CLEAR, async () => {
    return await storageManager.files.clear();
  });

  // Storage handlers - DATA namespace
  backgroundBridge.registerHandler(MessageTypes.STORAGE_DATA_SAVE, async (message) => {
    const { key, value, category } = message.data;
    return await storageManager.data.save(key, value, category);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_DATA_LOAD, async (message) => {
    const { key } = message.data;
    return await storageManager.data.load(key);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_DATA_EXISTS, async (message) => {
    const { key } = message.data;
    return await storageManager.data.exists(key);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_DATA_REMOVE, async (message) => {
    const { key } = message.data;
    return await storageManager.data.remove(key);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_DATA_GET_ALL, async () => {
    return await storageManager.data.getAll();
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_DATA_GET_BY_CATEGORY, async (message) => {
    const { category } = message.data;
    return await storageManager.data.getByCategory(category);
  });

  backgroundBridge.registerHandler(MessageTypes.STORAGE_DATA_CLEAR, async () => {
    return await storageManager.data.clear();
  });

  // Tab management
  backgroundBridge.registerHandler(MessageTypes.TAB_INIT, async (_message, _sender, tabId) => {
    if (tabId) {
      // Initialize tab in tab manager and all services
      tabManager.initTab(tabId);
      aiService.initTab(tabId);
      ttsService.initTab(tabId);
      sttService.initTab(tabId);
      translatorService.initTab(tabId);
      languageDetectorService.initTab(tabId);
      summarizerService.initTab(tabId);
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
      translatorService.cleanupTab(tabId);
      languageDetectorService.cleanupTab(tabId);
      summarizerService.cleanupTab(tabId);
    }
    return { cleaned: true };
  });

  // AI Service handlers
  backgroundBridge.registerHandler(MessageTypes.AI_CONFIGURE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { config } = message.data;
    console.log('[Background] AI_CONFIGURE called for tab:', tabId);
    await aiService.configure(config, tabId);
    console.log('[Background] AI_CONFIGURE complete for tab:', tabId);
    return { configured: true };
  });

  backgroundBridge.registerHandler(MessageTypes.AI_SEND_MESSAGE, async (message, sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    
    const { messages } = message.data;
    let fullResponse = '';
    
    // Stream response back to content script (messages, onStream, tabId)
    await aiService.sendMessage(messages, (token) => {
      // Send streaming token back to content script
      chrome.tabs.sendMessage(sender.tab.id, {
        type: MessageTypes.AI_STREAM_TOKEN,
        requestId: message.requestId,
        data: { token }
      }).catch(err => console.error('[Background] Failed to send stream token:', err));
      
      fullResponse += token;
    }, tabId);
    
    return { response: fullResponse };
  });

  backgroundBridge.registerHandler(MessageTypes.AI_ABORT, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const aborted = aiService.abortRequest(tabId);
    return { aborted };
  });

  backgroundBridge.registerHandler(MessageTypes.AI_IS_GENERATING, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const isGenerating = aiService.isGenerating(tabId);
    return { isGenerating };
  });

  backgroundBridge.registerHandler(MessageTypes.AI_TEST_CONNECTION, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const success = await aiService.testConnection(tabId);
    return { success };
  });

  // TTS Service handlers
  backgroundBridge.registerHandler(MessageTypes.TTS_CONFIGURE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { config } = message.data;
    await ttsService.configure(config, tabId);
    return { configured: true };
  });

  backgroundBridge.registerHandler(MessageTypes.TTS_GENERATE_SPEECH, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { text } = message.data;
    console.log('[Background] TTS_GENERATE_SPEECH called for tab:', tabId, 'text:', text?.substring(0, 50));
    
    // Check if TTS is configured for this tab
    if (!ttsService.isConfigured(tabId)) {
      console.error('[Background] TTS not configured for tab:', tabId);
      const state = ttsService.tabStates?.get(tabId);
      console.error('[Background] Tab state:', state);
      throw new Error(`TTS service not configured for tab ${tabId}`);
    }
    
    // Get the configured provider for this tab
    const tabState = ttsService.tabStates.get(tabId);
    const provider = tabState?.provider;
    
    // For Kokoro provider, bypass TTSService and use offscreen directly
    if (provider === 'kokoro') {
      console.log('[Background] Kokoro provider detected, using offscreen directly');
      
      // Check if Kokoro is initialized, if not, initialize it automatically
      try {
        const statusCheck = await offscreenManager.sendToOffscreen({
          type: MessageTypes.KOKORO_CHECK_STATUS,
          requestId: `auto_check_${Date.now()}`
        });
        
        if (!statusCheck.data.initialized) {
          console.log('[Background] Kokoro not initialized, auto-initializing...');
          
          const autoInitId = `auto_init_${Date.now()}`;
          offscreenManager.startLongRunningJob(autoInitId);
          
          try {
            const initMessage = {
              type: MessageTypes.KOKORO_INIT,
              requestId: autoInitId,
              data: {
                modelId: tabState.config?.modelId || 'onnx-community/Kokoro-82M-v1.0-ONNX',
                dtype: tabState.config?.dtype || 'q8',
                device: tabState.config?.device || 'auto'
              }
            };
            
            const initResult = await offscreenManager.sendToOffscreen(initMessage);
            
            if (!initResult.data.initialized) {
              throw new Error('Failed to auto-initialize Kokoro model');
            }
            
            console.log('[Background] Kokoro auto-initialized successfully');
          } finally {
            offscreenManager.endLongRunningJob(autoInitId);
          }
        }
      } catch (initError) {
        console.error('[Background] Kokoro auto-initialization failed:', initError);
        throw new Error(`Kokoro initialization failed: ${initError.message}`);
      }
      
      // Forward to KOKORO_GENERATE handler
      const genRequestId = `gen_${Date.now()}`;
      offscreenManager.startLongRunningJob(genRequestId);
      
      try {
        const kokoroMessage = {
          type: MessageTypes.KOKORO_GENERATE,
          requestId: genRequestId,
          data: {
            text,
            voice: tabState.config?.voice || 'af_heart',
            speed: tabState.config?.speed !== undefined ? tabState.config.speed : 1.0
          }
        };
        
        const result = await offscreenManager.sendToOffscreen(kokoroMessage);
        
        // Convert ArrayBuffer to Array
        if (result.data.audioBuffer instanceof ArrayBuffer) {
          result.data.audioBuffer = Array.from(new Uint8Array(result.data.audioBuffer));
          console.log('[Background] Converted Kokoro audioBuffer to Array:', result.data.audioBuffer.length);
        }
        
        return { audioBuffer: result.data.audioBuffer, mimeType: 'audio/wav' };
      } finally {
        offscreenManager.endLongRunningJob(genRequestId);
      }
    }
    
    // For other providers (OpenAI, etc.), use TTSService
    const result = await ttsService.generateSpeech(text, /*generateLipSync*/ false, tabId);
    
    if (!result) {
      console.warn('[Background] TTS_GENERATE_SPEECH returned null/undefined - generation failed or stopped');
      return { audioBuffer: null, mimeType: null }; // Generation was stopped
    }
    
    // Convert ArrayBuffer to plain Array to survive structured cloning
    // Chrome's sendMessage transfers both ArrayBuffers AND Uint8Arrays (detaches them)
    // Only plain arrays are guaranteed to be copied, not transferred
    if (!result.audioBuffer) {
      console.error('[Background] TTS result has no audioBuffer:', result);
      return { audioBuffer: null, mimeType: null };
    }
    
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

  // Kokoro TTS handlers
  backgroundBridge.registerHandler(MessageTypes.KOKORO_INIT, async (message, sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    console.log('[Background] KOKORO_INIT called for tab:', tabId);
    
    // CRITICAL: Mark as long-running job BEFORE forwarding
    // Kokoro model download can take 1-2 minutes, needs keepalive
    const requestId = message.requestId;
    offscreenManager.startLongRunningJob(requestId);
    
    // Forward to offscreen for model initialization
    const offscreenMessage = {
      type: MessageTypes.KOKORO_INIT,
      requestId: requestId,
      data: message.data
    };
    
    // Set up progress listener to relay progress from offscreen to content script
    const progressListener = (offscreenResponse) => {
      // Only handle progress messages
      if (offscreenResponse.type === MessageTypes.KOKORO_DOWNLOAD_PROGRESS) {
        // Relay progress to content script
        chrome.tabs.sendMessage(sender.tab.id, {
          type: MessageTypes.KOKORO_DOWNLOAD_PROGRESS,
          data: offscreenResponse.data
        }).catch(err => console.error('[Background] Failed to send Kokoro progress:', err));
        
        // Each progress update keeps the document alive
        offscreenManager.keepAlive();
        // Don't return anything for progress messages - they don't need responses
      }
      // For all other messages, don't interfere (no return = undefined = doesn't consume the message)
    };
    
    // Register temporary listener for progress updates
    chrome.runtime.onMessage.addListener(progressListener);
    
    try {
      const result = await offscreenManager.sendToOffscreen(offscreenMessage);
      console.log('[Background] KOKORO_INIT result from offscreen:', result);
      console.log('[Background] KOKORO_INIT returning data:', result?.data);
      return result.data;
    } finally {
      // Clean up progress listener and end long-running job
      chrome.runtime.onMessage.removeListener(progressListener);
      offscreenManager.endLongRunningJob(requestId);
    }
  });

  backgroundBridge.registerHandler(MessageTypes.KOKORO_GENERATE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    console.log('[Background] KOKORO_GENERATE called for tab:', tabId);
    
    // Mark as long-running job - generation can take 5-15 seconds for long text
    const requestId = message.requestId;
    offscreenManager.startLongRunningJob(requestId);
    
    try {
      // Forward to offscreen for speech generation
      const result = await offscreenManager.sendToOffscreen(message);
      
      // Convert ArrayBuffer in result to Array for sending to main world
      if (result.data.audioBuffer instanceof ArrayBuffer) {
        result.data.audioBuffer = Array.from(new Uint8Array(result.data.audioBuffer));
        console.log('[Background] Converted Kokoro audioBuffer to Array:', result.data.audioBuffer.length);
      }
      
      return result.data;
    } finally {
      offscreenManager.endLongRunningJob(requestId);
    }
  });

  backgroundBridge.registerHandler(MessageTypes.KOKORO_CHECK_STATUS, async (message) => {
    console.log('[Background] KOKORO_CHECK_STATUS');
    
    // Forward to offscreen for status check
    const result = await offscreenManager.sendToOffscreen(message);
    return result?.data || { initialized: false, initializing: false };
  });

  backgroundBridge.registerHandler(MessageTypes.KOKORO_LIST_VOICES, async (message) => {
    console.log('[Background] KOKORO_LIST_VOICES');
    
    // Forward to offscreen for voice list
    const result = await offscreenManager.sendToOffscreen(message);
    return result?.data || { voices: [] };
  });

  backgroundBridge.registerHandler(MessageTypes.KOKORO_GET_CACHE_SIZE, async (message) => {
    console.log('[Background] KOKORO_GET_CACHE_SIZE');
    
    // Forward to offscreen for cache size check
    const result = await offscreenManager.sendToOffscreen(message);
    return result?.data || { usage: 0, quota: 0, databases: [] };
  });

  backgroundBridge.registerHandler(MessageTypes.KOKORO_CLEAR_CACHE, async (message) => {
    console.log('[Background] KOKORO_CLEAR_CACHE');
    
    // Forward to offscreen for cache clearing
    const result = await offscreenManager.sendToOffscreen(message);
    return result?.data || { cleared: false };
  });

  // TTS Audio Processing with Lip Sync (via offscreen)
  backgroundBridge.registerHandler(MessageTypes.TTS_PROCESS_AUDIO_WITH_LIPSYNC, async (message) => {
    console.log('[Background] TTS_PROCESS_AUDIO_WITH_LIPSYNC');
    
    // Mark as long-running job - audio processing + VMD generation can take 10-30 seconds
    const requestId = message.requestId;
    offscreenManager.startLongRunningJob(requestId);
    
    try {
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
    } finally {
      offscreenManager.endLongRunningJob(requestId);
    }
  });

  // STT Service handlers
  backgroundBridge.registerHandler(MessageTypes.STT_CONFIGURE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { config } = message.data;
    await sttService.configure(config, tabId);
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
    
    const text = await sttService.transcribeAudio(arrayBuffer, mimeType, tabId);
    return { text };
  });

  // Translator Service handlers
  backgroundBridge.registerHandler(MessageTypes.TRANSLATOR_CONFIGURE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { config } = message.data;
    await translatorService.configure(config, tabId);
    return { configured: true };
  });

  backgroundBridge.registerHandler(MessageTypes.TRANSLATOR_CHECK_AVAILABILITY, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { sourceLanguage, targetLanguage } = message.data;
    const availability = await translatorService.checkAvailability(sourceLanguage, targetLanguage, tabId);
    return { availability };
  });

  backgroundBridge.registerHandler(MessageTypes.TRANSLATOR_TRANSLATE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { text, sourceLanguage, targetLanguage } = message.data;
    console.log(`[Background] TRANSLATOR_TRANSLATE (${sourceLanguage}->${targetLanguage}):`, text.substring(0, 50));
    const translatedText = await translatorService.translate(text, sourceLanguage, targetLanguage, tabId);
    return { translatedText };
  });

  backgroundBridge.registerHandler(MessageTypes.TRANSLATOR_TRANSLATE_STREAMING, async (message, sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { text, sourceLanguage, targetLanguage } = message.data;
    console.log(`[Background] TRANSLATOR_TRANSLATE_STREAMING (${sourceLanguage}->${targetLanguage}):`, text.substring(0, 50));
    
    let fullTranslation = '';
    
    // Stream translation chunks back to content script
    for await (const chunk of translatorService.translateStreaming(text, sourceLanguage, targetLanguage, tabId)) {
      // Send streaming token back to content script
      chrome.tabs.sendMessage(sender.tab.id, {
        type: MessageTypes.AI_STREAM_TOKEN,
        requestId: message.requestId,
        data: { token: chunk }
      }).catch(err => console.error('[Background] Failed to send translation stream token:', err));
      
      fullTranslation += chunk;
    }
    
    return { translatedText: fullTranslation };
  });

  backgroundBridge.registerHandler(MessageTypes.TRANSLATOR_ABORT, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    translatorService.abort(tabId);
    return { aborted: true };
  });

  backgroundBridge.registerHandler(MessageTypes.TRANSLATOR_DESTROY, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    await translatorService.destroy(tabId);
    return { destroyed: true };
  });

  // Language Detector Service handlers
  backgroundBridge.registerHandler(MessageTypes.LANGUAGE_DETECTOR_CONFIGURE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { config } = message.data;
    await languageDetectorService.configure(config, tabId);
    return { configured: true };
  });

  backgroundBridge.registerHandler(MessageTypes.LANGUAGE_DETECTOR_CHECK_AVAILABILITY, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const availability = await languageDetectorService.checkAvailability(tabId);
    return { availability };
  });

  backgroundBridge.registerHandler(MessageTypes.LANGUAGE_DETECTOR_DETECT, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { text } = message.data;
    console.log(`[Background] LANGUAGE_DETECTOR_DETECT:`, text.substring(0, 50));
    const results = await languageDetectorService.detect(text, tabId);
    return { results };
  });

  backgroundBridge.registerHandler(MessageTypes.LANGUAGE_DETECTOR_DESTROY, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    await languageDetectorService.destroy(tabId);
    return { destroyed: true };
  });

  // Summarizer Service handlers
  backgroundBridge.registerHandler(MessageTypes.SUMMARIZER_CONFIGURE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { config } = message.data;
    await summarizerService.configure(config, tabId);
    return { configured: true };
  });

  backgroundBridge.registerHandler(MessageTypes.SUMMARIZER_CHECK_AVAILABILITY, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const availability = await summarizerService.checkAvailability(tabId);
    return { availability };
  });

  backgroundBridge.registerHandler(MessageTypes.SUMMARIZER_SUMMARIZE, async (message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { text, options } = message.data;
    console.log(`[Background] SUMMARIZER_SUMMARIZE (${options?.type || 'tldr'}):`, text.substring(0, 50));
    const summary = await summarizerService.summarize(text, options, tabId);
    return { summary };
  });

  backgroundBridge.registerHandler(MessageTypes.SUMMARIZER_SUMMARIZE_STREAMING, async (message, sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    const { text, options } = message.data;
    console.log(`[Background] SUMMARIZER_SUMMARIZE_STREAMING (${options?.type || 'tldr'}):`, text.substring(0, 50));
    
    let fullSummary = '';
    
    // Stream summary chunks back to content script
    for await (const chunk of summarizerService.summarizeStreaming(text, options, tabId)) {
      // Send streaming token back to content script
      chrome.tabs.sendMessage(sender.tab.id, {
        type: MessageTypes.AI_STREAM_TOKEN,
        requestId: message.requestId,
        data: { token: chunk }
      }).catch(err => console.error('[Background] Failed to send summary stream token:', err));
      
      fullSummary += chunk;
    }
    
    return { summary: fullSummary };
  });

  backgroundBridge.registerHandler(MessageTypes.SUMMARIZER_ABORT, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    summarizerService.abort(tabId);
    return { aborted: true };
  });

  backgroundBridge.registerHandler(MessageTypes.SUMMARIZER_DESTROY, async (_message, _sender, tabId) => {
    if (!tabId) throw new Error('Tab ID required');
    await summarizerService.destroy(tabId);
    return { destroyed: true };
  });

  // Offscreen/Audio handlers
  backgroundBridge.registerHandler(MessageTypes.OFFSCREEN_AUDIO_PLAY, async (message) => {
    console.log('[Background] OFFSCREEN_AUDIO_PLAY');
    
    // Audio playback is usually quick, but mark as job to prevent premature closure
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
    
    // Mark as long-running job - VMD generation can take 10-20 seconds
    const requestId = message.requestId;
    offscreenManager.startLongRunningJob(requestId);
    
    try {
      const result = await offscreenManager.sendToOffscreen(message);
      return result.data;
    } finally {
      offscreenManager.endLongRunningJob(requestId);
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
    // Send toggle message to content script (which is always loaded via manifest)
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_ASSISTANT'
    });
    
    console.log('[Background] Toggle response:', response);
  } catch (error) {
    console.error('[Background] Failed to toggle assistant:', error);
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
