/**
 * TTS Service Proxy
 * Dual-mode wrapper for TTSService
 * Dev mode: Direct TTS API + local audio
 * Extension mode: Background generates audio, offscreen plays
 */

import { ServiceProxy } from './ServiceProxy.js';
import TTSService from '../TTSService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';

class TTSServiceProxy extends ServiceProxy {
  constructor() {
    super('TTSService');
    this.directService = TTSService;
  }

  /**
   * Configure TTS client with provider settings
   * @param {Object} config - TTS configuration
   */
  async configure(config) {
    if (this.isExtension) {
      const response = await this.bridge.sendMessage(
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
    if (!this.isExtension) {
      this.directService.setSpeakCallback(callback);
    }
    // In extension mode, we'll handle this differently via messages
    this.speakCallback = callback;
  }

  /**
   * Set callback for when audio finishes playing
   * @param {Function} callback - () => void
   */
  setAudioFinishedCallback(callback) {
    if (!this.isExtension) {
      this.directService.setAudioFinishedCallback(callback);
    }
    this.audioFinishedCallback = callback;
  }

  /**
   * Set callback for when TTS is stopped/interrupted
   * @param {Function} callback - () => void
   */
  setStopCallback(callback) {
    if (!this.isExtension) {
      this.directService.setStopCallback(callback);
    }
    this.stopCallback = callback;
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
   * @param {string} text - Text to convert to speech
   * @param {boolean} generateLipSync - Generate lip sync data
   * @returns {Promise<{audio: Blob, bvmdUrl: string|null}>} Audio blob and BVMD URL
   */
  async generateSpeech(text, generateLipSync = true) {
    if (this.isExtension) {
      const response = await this.bridge.sendMessage(
        MessageTypes.TTS_GENERATE_SPEECH,
        { text, generateLipSync },
        { timeout: 60000 } // 1 minute for TTS generation
      );
      
      // Response contains audioUrl and bvmdUrl (blob URLs created in background)
      return {
        audio: response.audioBlob, // May need to fetch and convert
        bvmdUrl: response.bvmdUrl
      };
    } else {
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
   * @returns {Promise<Array>} Array of audio chunks
   */
  async generateChunkedSpeech(text, onChunkReady = null, maxChunkSize = 500, minChunkSize = 100) {
    if (this.isExtension) {
      // In extension mode, chunking might be handled differently
      // For now, use simple approach
      const chunks = this.chunkText(text, maxChunkSize, minChunkSize);
      const results = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const result = await this.generateSpeech(chunks[i], true);
        results.push(result);
        
        if (onChunkReady) {
          onChunkReady(chunks[i], result.audioUrl, result.bvmdUrl, i, chunks.length);
        }
      }
      
      return results;
    } else {
      return await this.directService.generateChunkedSpeech(
        text,
        onChunkReady,
        maxChunkSize,
        minChunkSize
      );
    }
  }

  /**
   * Get current audio queue length
   * @returns {number} Number of audio items in queue
   */
  getQueueLength() {
    if (this.isExtension) {
      // Could send message to check, but for performance return cached value
      return 0;
    } else {
      return this.directService.getQueueLength();
    }
  }

  /**
   * Check if audio is currently playing or queued
   * @returns {boolean} True if audio is active
   */
  isAudioActive() {
    if (this.isExtension) {
      return false; // Could add message to check
    } else {
      return this.directService.isAudioActive();
    }
  }

  /**
   * Add audio to playback queue
   * @param {string} text - Text being spoken
   * @param {string} audioUrl - Audio blob URL
   * @param {string|null} bvmdUrl - BVMD blob URL for lip sync
   */
  queueAudio(text, audioUrl, bvmdUrl = null) {
    if (this.isExtension) {
      this.bridge.sendMessage(MessageTypes.TTS_QUEUE_AUDIO, {
        text,
        audioUrl,
        bvmdUrl
      }).catch(error => {
        console.error('[TTSServiceProxy] Queue audio failed:', error);
      });
    } else {
      this.directService.queueAudio(text, audioUrl, bvmdUrl);
    }
  }

  /**
   * Play audio blob URL
   * @param {string} text - Text being spoken
   * @param {string} audioUrl - Audio blob URL
   * @param {string|null} bvmdUrl - BVMD blob URL
   * @returns {Promise<void>} Resolves when audio finishes
   */
  async playAudio(text, audioUrl, bvmdUrl = null) {
    if (!this.isExtension) {
      return await this.directService.playAudio(text, audioUrl, bvmdUrl);
    }
    // In extension mode, playback happens in offscreen via queue
  }

  /**
   * Play audio chunks sequentially
   * @param {Array} items - Array of audio items
   * @returns {Promise<void>} Resolves when all audio finishes
   */
  async playAudioSequence(items) {
    if (!this.isExtension) {
      return await this.directService.playAudioSequence(items);
    }
    // In extension mode, use queue
    for (const item of items) {
      this.queueAudio(item.text, item.audioUrl, item.bvmdUrl);
    }
  }

  /**
   * Stop current playback and clear queue
   */
  stopPlayback() {
    if (this.isExtension) {
      this.bridge.sendMessage(MessageTypes.TTS_STOP_PLAYBACK, {})
        .catch(error => {
          console.error('[TTSServiceProxy] Stop playback failed:', error);
        });
      
      // Trigger local callback
      if (this.stopCallback) {
        this.stopCallback();
      }
    } else {
      this.directService.stopPlayback();
    }
  }

  /**
   * Resume playback (clear stopped flag)
   */
  resumePlayback() {
    if (this.isExtension) {
      this.bridge.sendMessage(MessageTypes.TTS_RESUME_PLAYBACK, {})
        .catch(error => {
          console.error('[TTSServiceProxy] Resume playback failed:', error);
        });
    } else {
      this.directService.resumePlayback();
    }
  }

  /**
   * Clean up blob URLs
   * @param {string[]} urls - URLs to revoke
   */
  cleanupBlobUrls(urls = null) {
    if (!this.isExtension) {
      this.directService.cleanupBlobUrls(urls);
    }
    // In extension mode, background handles cleanup
  }

  /**
   * Check if TTS is currently playing audio
   * @returns {boolean} True if audio is playing
   */
  isCurrentlyPlaying() {
    if (this.isExtension) {
      return false; // Could add message to check
    } else {
      return this.directService.isCurrentlyPlaying();
    }
  }

  /**
   * Test TTS with sample text
   * @param {string} testText - Text to test with
   * @returns {Promise<boolean>} True if successful
   */
  async testConnection(testText = 'Hello, this is a test.') {
    if (this.isExtension) {
      const response = await this.bridge.sendMessage(
        MessageTypes.TTS_TEST_CONNECTION,
        { testText },
        { timeout: 30000 }
      );
      return response.success || false;
    } else {
      return await this.directService.testConnection(testText);
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
      testConnection: MessageTypes.TTS_TEST_CONNECTION
    };

    const messageType = methodMap[method];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const response = await this.bridge.sendMessage(messageType, { args });
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
