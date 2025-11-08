/**
 * TTS Service Proxy
 * Dual-mode wrapper for TTSService
 * Dev mode: Direct TTS API + local audio
 * Extension mode: Background generates audio, offscreen plays
 */

import { ServiceProxy } from './ServiceProxy.js';
import TTSService from '../TTSService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';
import Logger from '../LoggerService';

class TTSServiceProxy extends ServiceProxy {
  constructor() {
    super('TTSService');
    this.directService = TTSService;
    this.lastConfigured = null; // Store last configured settings for initialization
  }

  /**
   * Configure TTS client with provider settings
   * @param {Object} config - TTS configuration
   */
  async configure(config) {
    // Store the config for later use in initializeKokoro
    this.lastConfigured = config;
    
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TTSServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.TTS_CONFIGURE,
        { config }
      );
      return response.configured;
    } else {
      return this.directService.configure(config);
    }
  }

  /**
   * Check if service is configured and enabled
   * @returns {boolean} True if ready
   */
  isConfigured() {
    if (this.isExtension) {
      return true; // Trust background state
    } else {
      return this.directService.isConfigured();
    }
  }

  /**
   * Get current provider name
   * @returns {string|null} Provider name or null
   */
  getCurrentProvider() {
    if (this.isExtension) {
      return null;
    } else {
      return this.directService.getCurrentProvider();
    }
  }

  /**
   * Initialize BVMD converter with scene
   * @param {Scene} scene - Babylon.js scene
   */
  initializeBVMDConverter(scene) {
    if (!this.isExtension) {
      this.directService.initializeBVMDConverter(scene);
    }
    // In extension mode, BVMD conversion happens in offscreen
  }

  /**
   * Set callback for triggering speak animations
   * @param {Function} callback - (text, bvmdBlobUrl) => void
   */
  setSpeakCallback(callback) {
    // Always set on direct service since playback happens in main world for both modes
    this.directService.setSpeakCallback(callback);
    this.speakCallback = callback;
  }

  /**
   * Set callback for when audio finishes playing
   * @param {Function} callback - () => void
   */
  setAudioFinishedCallback(callback) {
    // Always set on direct service since playback happens in main world for both modes
    this.directService.setAudioFinishedCallback(callback);
    this.audioFinishedCallback = callback;
  }

  /**
   * Set callback for when TTS is stopped/interrupted
   * @param {Function} callback - () => void
   */
  setStopCallback(callback) {
    // Always set on direct service since playback happens in main world for both modes
    this.directService.setStopCallback(callback);
    this.stopCallback = callback;
  }

  /**
   * Set callback for when audio playback starts
   * @param {Function} callback - (sessionId) => void
   */
  setAudioStartCallback(callback) {
    // Always use direct service for playback callbacks
    this.directService.onAudioStartCallback = callback;
  }

  /**
   * Set callback for when audio playback ends
   * @param {Function} callback - (sessionId) => void
   */
  setAudioEndCallback(callback) {
    // Always use direct service for playback callbacks
    this.directService.onAudioEndCallback = callback;
  }

  /**
   * Enable or disable lip sync generation
   * @param {boolean} enabled - Enable lip sync generation
   */
  setLipSyncEnabled(enabled) {
    if (!this.isExtension) {
      this.directService.setLipSyncEnabled(enabled);
    }
    // Could send message to background if needed
  }

  /**
   * Generate speech from text with optional lip sync
   * Dev mode: Direct TTS API with VMD/BVMD generation in main world
   * Extension mode: 
   *   1. Background generates TTS audio (ArrayBuffer)
   *   2. Offscreen generates VMD from audio (heavy processing)
   *   3. Main world converts VMD to BVMD (needs Babylon scene)
   * @param {string} text - Text to convert to speech
   * @param {boolean} generateLipSync - Generate lip sync data
   * @returns {Promise<{audio: Blob|ArrayBuffer, bvmdUrl: string|null}>} Audio and BVMD URL
   */
  async generateSpeech(text, generateLipSync = true) {
    if (this.isExtension) {
      // Extension mode flow:
      // 1. Background generates TTS audio (returns ArrayBuffer)
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TTSServiceProxy: Bridge not available');
      
      const response = await bridge.sendMessage(
        MessageTypes.TTS_GENERATE_SPEECH,
        { text, generateLipSync: false }, // Don't generate in background
        { timeout: 60000 }
      );
      
      // Check if audio generation was cancelled or failed
      if (!response || !response.audioBuffer) {
        Logger.log('TTSServiceProxy', 'TTS generation cancelled or failed');
        return null;
      }
      
      // Convert plain Array back to ArrayBuffer
      let audioBuffer;
      if (Array.isArray(response.audioBuffer)) {
        // Check if array is empty (stopped during generation)
        if (response.audioBuffer.length === 0) {
          Logger.log('TTSServiceProxy', 'TTS generation returned empty audio (likely stopped)');
          return null;
        }
        const uint8Array = new Uint8Array(response.audioBuffer);
        audioBuffer = uint8Array.buffer;
      } else if (response.audioBuffer instanceof Uint8Array) {
        audioBuffer = response.audioBuffer.buffer.slice(
          response.audioBuffer.byteOffset,
          response.audioBuffer.byteOffset + response.audioBuffer.byteLength
        );
      } else {
        audioBuffer = response.audioBuffer;
      }
      
      // Validate audio buffer is not empty
      if (!audioBuffer || audioBuffer.byteLength === 0) {
        Logger.log('TTSServiceProxy', 'Audio buffer is empty, skipping');
        return null;
      }
      
      // 2. If lip sync needed, process through offscreen (includes VMD→BVMD conversion)
      if (generateLipSync) {
        try {
          // IMPORTANT: Convert ArrayBuffer to Array before sending
          // Chrome's structured clone transfers ArrayBuffers but copies Arrays
          const audioArray = Array.from(new Uint8Array(audioBuffer));
          
          // Offscreen will: Generate VMD → Convert to BVMD → Return both as Arrays
          const lipSyncResponse = await bridge.sendMessage(
            MessageTypes.TTS_PROCESS_AUDIO_WITH_LIPSYNC,
            { 
              audioBuffer: audioArray,
              mimeType: response.mimeType // Pass through MIME type from TTS service
            },
            { timeout: 120000 } // 2 minutes for heavy processing
          );
          
          // Convert bvmdData from Array to BVMD blob URL
          let bvmdUrl = null;
          if (lipSyncResponse.bvmdData && Array.isArray(lipSyncResponse.bvmdData) && lipSyncResponse.bvmdData.length > 0) {
            const bvmdUint8 = new Uint8Array(lipSyncResponse.bvmdData);
            const bvmdBlob = new Blob([bvmdUint8], { type: 'application/octet-stream' });
            bvmdUrl = URL.createObjectURL(bvmdBlob);
          }
          
          return {
            audio: audioBuffer,
            bvmdUrl,
            mimeType: response.mimeType
          };
        } catch (error) {
          Logger.error('TTSServiceProxy', 'Lip sync processing failed:', error);
          // Return audio without lip sync
          return {
            audio: audioBuffer,
            bvmdUrl: null,
            mimeType: response.mimeType
          };
        }
      }
      
      // No lip sync needed, just return audio
      return {
        audio: audioBuffer,
        bvmdUrl: null,
        mimeType: response.mimeType
      };
      
    } else {
      // Dev mode: Direct service handles everything
      return await this.directService.generateSpeech(text, generateLipSync);
    }
  }

  /**
   * Split text into natural chunks for TTS
   * @param {string} text - Text to chunk
   * @param {number} maxChunkSize - Maximum chunk size
   * @param {number} minChunkSize - Minimum chunk size
   * @returns {string[]} Array of text chunks
   */
  chunkText(text, maxChunkSize = 500, minChunkSize = 100) {
    // This is a pure function, always use direct service
    return this.directService.chunkText(text, maxChunkSize, minChunkSize);
  }

  /**
   * Generate and queue audio chunks from text
   * @param {string} text - Full text to convert
   * @param {Function} onChunkReady - Callback when chunk ready
   * @param {number} maxChunkSize - Maximum chunk size
   * @param {number} minChunkSize - Minimum chunk size
   * @param {string} sessionId - Optional session ID for this playback
   * @returns {Promise<Array>} Array of audio chunks
   */
  async generateChunkedSpeech(text, onChunkReady = null, maxChunkSize = 500, minChunkSize = 100, sessionId = null) {
    if (this.isExtension) {
      // In extension mode, chunking might be handled differently
      // For now, use simple approach
      const chunks = this.chunkText(text, maxChunkSize, minChunkSize);
      const results = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const result = await this.generateSpeech(chunks[i], true);
        
        // Skip if generation was cancelled (null result or empty audio)
        if (!result || !result.audio) {
          Logger.log('TTSServiceProxy', `Chunk ${i + 1} generation cancelled or failed`);
          continue;
        }
        
        // Validate audio data is not empty
        const audioSize = result.audio instanceof ArrayBuffer 
          ? result.audio.byteLength 
          : (Array.isArray(result.audio) ? result.audio.length : 0);
          
        if (audioSize === 0) {
          Logger.log('TTSServiceProxy', `Chunk ${i + 1} has empty audio data, skipping`);
          continue;
        }
        
        // Convert ArrayBuffer to blob URL for playback
        const audioBlob = new Blob([result.audio], { type: result.mimeType || 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        Logger.log('TTSServiceProxy', 'Created audio blob URL:', audioUrl, 'MIME:', result.mimeType);
        
        // Push item in format expected by playAudioSequence
        results.push({
          text: chunks[i],
          audioUrl: audioUrl,
          bvmdUrl: result.bvmdUrl,
          sessionId: sessionId // Attach session ID to each chunk
        });
        
        if (onChunkReady) {
          onChunkReady(chunks[i], audioUrl, result.bvmdUrl, i, chunks.length);
        }
      }
      
      return results;
    } else {
      return await this.directService.generateChunkedSpeech(
        text,
        onChunkReady,
        maxChunkSize,
        minChunkSize,
        sessionId
      );
    }
  }

  /**
   * Get current audio queue length
   * Always use direct service in main world
   * @returns {number} Number of audio items in queue
   */
  getQueueLength() {
    return this.directService.getQueueLength();
  }

  /**
   * Check if audio is currently playing or queued
   * Always use direct service in main world
   * @returns {boolean} True if audio is active
   */
  isAudioActive() {
    return this.directService.isAudioActive();
  }

  /**
   * Add audio to playback queue
   * In both dev and extension mode, queue and playback happens in main world using direct service
   * @param {string} text - Text being spoken
   * @param {string} audioUrl - Audio blob URL
   * @param {string|null} bvmdUrl - BVMD blob URL for lip sync
   * @param {string|null} sessionId - Session ID for this audio
   */
  queueAudio(text, audioUrl, bvmdUrl = null, sessionId = null) {
    // Always use direct service for queue management and playback
    // Extension mode has already processed audio and lip sync, just needs to play
    this.directService.queueAudio(text, audioUrl, bvmdUrl, sessionId);
  }

  /**
   * Play audio blob URL
   * Always use direct service in main world
   * @param {string} text - Text being spoken
   * @param {string} audioUrl - Audio blob URL
   * @param {string|null} bvmdUrl - BVMD blob URL
   * @returns {Promise<void>} Resolves when audio finishes
   */
  async playAudio(text, audioUrl, bvmdUrl = null) {
    return await this.directService.playAudio(text, audioUrl, bvmdUrl);
  }

  /**
   * Play audio chunks sequentially
   * Always use direct service in main world
   * @param {Array} items - Array of audio items
   * @param {string} sessionId - Session ID for this playback sequence
   * @returns {Promise<void>} Resolves when all audio finishes
   */
  async playAudioSequence(items, sessionId = null) {
    return await this.directService.playAudioSequence(items, sessionId);
  }

  /**
   * Stop current playback and clear queue
   * Extension mode: Notify background, also stop local queue
   * Dev mode: Just stop local service
   */
  async stopPlayback() {
    // Always stop local direct service (handles queue in main world)
    this.directService.stopPlayback();
    
    if (this.isExtension) {
      // Also notify background to stop TTS generation
      const bridge = await this.waitForBridge();
      if (bridge) {
        bridge.sendMessage(MessageTypes.TTS_STOP_PLAYBACK, {})
          .catch(error => {
            Logger.error('TTSServiceProxy', 'Stop playback failed:', error);
          });
      }
    }
    
    // Trigger local callback
    if (this.stopCallback) {
      this.stopCallback();
    }
  }

  /**
   * Resume playback (clear stopped flag)
   * Extension mode: Notify background, also resume local queue
   * Dev mode: Just resume local service
   */
  async resumePlayback() {
    // Always resume local direct service
    this.directService.resumePlayback();
    
    if (this.isExtension) {
      // Also notify background to resume TTS generation
      const bridge = await this.waitForBridge();
      if (bridge) {
        bridge.sendMessage(MessageTypes.TTS_RESUME_PLAYBACK, {})
          .catch(error => {
            Logger.error('TTSServiceProxy', 'Resume playback failed:', error);
          });
      }
    }
  }

  /**
   * Initialize Kokoro TTS model
   * @param {Function} progressCallback - Progress callback (progress) => {}
   * @returns {Promise<boolean>} Success status
   */
  async initializeKokoro(progressCallback = null) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TTSServiceProxy: Bridge not available');
      
      // Determine config source: use lastConfigured if available, otherwise load from storage
      let kokoroConfig;
      if (this.lastConfigured && this.lastConfigured.kokoro) {
        Logger.log('TTSServiceProxy', 'Using lastConfigured for initialization:', this.lastConfigured.kokoro);
        kokoroConfig = this.lastConfigured.kokoro;
      } else {
        Logger.log('TTSServiceProxy', 'Loading config from storage for initialization');
        const { default: StorageServiceProxy } = await import('./StorageServiceProxy.js');
        const { DefaultTTSConfig } = await import('../../config/aiConfig.js');
        const config = await StorageServiceProxy.configLoad('ttsConfig', DefaultTTSConfig);
        kokoroConfig = config.kokoro || {};
      }
      
      // Set up message listener for progress updates via bridge
      let progressListener = null;
      if (progressCallback) {
        progressListener = (message) => {
          if (message.type === MessageTypes.KOKORO_DOWNLOAD_PROGRESS && message.data) {
            progressCallback(message.data);
          }
        };
        bridge.addMessageListener(progressListener);
      }
      
      try {
        const response = await bridge.sendMessage(
          MessageTypes.KOKORO_INIT,
          {
            modelId: kokoroConfig.modelId || 'onnx-community/Kokoro-82M-v1.0-ONNX',
            device: kokoroConfig.device || 'auto'
          },
          { timeout: 300000 } // 5 minutes for model download
        );
        return response.initialized;
      } finally {
        if (progressListener) {
          bridge.removeMessageListener(progressListener);
        }
      }
    } else {
      return await this.directService.initializeKokoro(progressCallback);
    }
  }

  /**
   * Check Kokoro TTS status
   * @returns {Promise<Object>} Status object
   */
  async checkKokoroStatus() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TTSServiceProxy: Bridge not available');
      
      const response = await bridge.sendMessage(MessageTypes.KOKORO_CHECK_STATUS, {});
      return response;
    } else {
      return await this.directService.checkKokoroStatus();
    }
  }

  /**
   * List Kokoro voices
   * @returns {Promise<string[]>} Array of voice IDs
   */
  async listKokoroVoices() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TTSServiceProxy: Bridge not available');
      
      const response = await bridge.sendMessage(MessageTypes.KOKORO_LIST_VOICES, {});
      return response.voices;
    } else {
      return await this.directService.listKokoroVoices();
    }
  }

  /**
   * Ping Kokoro to keep model loaded in memory (heartbeat)
   * Generates small audio without side effects
   * @returns {Promise<boolean>} True if model is alive
   */
  async pingKokoro() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) return false;
      
      try {
        const response = await bridge.sendMessage(MessageTypes.KOKORO_PING, {});
        return response.alive === true;
      } catch {
        return false; // Silent failure for heartbeat
      }
    } else {
      return await this.directService.pingKokoro();
    }
  }

  /**
   * Get Kokoro cache size
   * @returns {Promise<Object>} Cache size information
   */
  async getKokoroCacheSize() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TTSServiceProxy: Bridge not available');
      
      const response = await bridge.sendMessage(MessageTypes.KOKORO_GET_CACHE_SIZE, {});
      return response;
    } else {
      return await this.directService.getKokoroCacheSize();
    }
  }

  /**
   * Clear Kokoro cache and reset model
   * @returns {Promise<boolean>} Success status
   */
  async clearKokoroCache() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('TTSServiceProxy: Bridge not available');
      
      const response = await bridge.sendMessage(MessageTypes.KOKORO_CLEAR_CACHE, {});
      return response.cleared;
    } else {
      return await this.directService.clearKokoroCache();
    }
  }

  /**
   * Clean up blob URLs
   * Always use direct service in main world
   * @param {string[]} urls - URLs to revoke
   */
  cleanupBlobUrls(urls = null) {
    this.directService.cleanupBlobUrls(urls);
  }

  /**
   * Check if TTS is currently playing audio
   * Always use direct service in main world
   * @returns {boolean} True if audio is playing
   */
  isCurrentlyPlaying() {
    return this.directService.isCurrentlyPlaying();
  }

  /**
   * Test TTS with sample text
   * @param {string} testText - Text to test with
   * @returns {Promise<boolean>} True if successful
   */
  async testConnection(testText = 'Hello, this is a test.') {
    try {
      const audioItems = await this.generateChunkedSpeech(testText);
      
      if (!audioItems || audioItems.length === 0) {
        throw new Error('No audio generated');
      }
      
      await this.playAudioSequence(audioItems, 'test_connection');
      
      // Cleanup blob URLs
      const urls = audioItems.map(item => item.audioUrl).filter(Boolean);
      this.cleanupBlobUrls(urls);
      
      return true;
    } catch (error) {
      Logger.error('TTSServiceProxy', 'Test connection failed:', error);
      throw error;
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method, ...args) {
    const methodMap = {
      configure: MessageTypes.TTS_CONFIGURE,
      generateSpeech: MessageTypes.TTS_GENERATE_SPEECH,
      stopPlayback: MessageTypes.TTS_STOP_PLAYBACK,
      resumePlayback: MessageTypes.TTS_RESUME_PLAYBACK,
      testConnection: MessageTypes.TTS_TEST_CONNECTION,
      initializeKokoro: MessageTypes.KOKORO_INIT,
      checkKokoroStatus: MessageTypes.KOKORO_CHECK_STATUS,
      listKokoroVoices: MessageTypes.KOKORO_LIST_VOICES
    };

    const messageType = methodMap[method];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error('TTSServiceProxy: Bridge not available');
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method, ...args) {
    if (typeof this.directService[method] !== 'function') {
      throw new Error(`Method ${method} not found on TTSService`);
    }

    return await this.directService[method](...args);
  }
}

// Export singleton instance
const ttsServiceProxy = new TTSServiceProxy();
export default ttsServiceProxy;
