/**
 * Audio Worker Client
 * Provides unified interface for audio processing in both dev and extension modes
 * - Dev mode: Uses SharedWorker, decodes audio on main thread
 * - Extension mode: Uses offscreen document (handled by extension infrastructure)
 * Handles AudioContext operations on main thread, delegates heavy work to worker
 */

/* global chrome */

import { MessageTypes, generateRequestId } from '../../extension/shared/MessageTypes.js';
import Logger from '../services/LoggerService';

export class AudioWorkerClient {
  constructor() {
    this.mode = this.detectMode();
    this.worker = null;
    this.port = null;
    this.connectionId = null;
    this.pendingRequests = new Map();
    this.audioContext = null;
    this.isReady = false;
    
    // Note: Don't use Logger.log in constructor to avoid circular dependency with singleton initialization
  }

  /**
   * Detect runtime mode
   * @returns {'dev'|'extension'}
   */
  detectMode() {
    // Check if running in Chrome extension context
    return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ? 'extension' : 'dev';
  }

  /**
   * Initialize worker connection (SharedWorker for dev mode)
   * Extension mode doesn't need initialization here (uses offscreen)
   * @returns {Promise<void>}
   */
  async init() {
    if (this.isReady) {
      Logger.log('AudioWorkerClient', 'Already initialized');
      return;
    }
    
    if (this.mode === 'extension') {
      // Extension mode uses offscreen document, no init needed here
      Logger.log('AudioWorkerClient', 'Extension mode detected, skipping SharedWorker init');
      this.isReady = true;
      return;
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Create SharedWorker for dev mode
        this.worker = new SharedWorker(
          new URL('./shared-audio-worker.js', import.meta.url),
          { type: 'module', name: 'sharedAudioWorker' }
        );
        
        this.port = this.worker.port;
        
        // Set up message handler
        this.port.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        this.port.onmessageerror = (error) => {
          Logger.error('AudioWorkerClient', 'Message error:', error);
        };
        
        // Start port (required for SharedWorker)
        this.port.start();
        
        // Create AudioContext for main thread operations (dev mode only)
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        Logger.log('AudioWorkerClient', 'AudioContext created for dev mode');
        
        // Mark as ready
        this.isReady = true;
        Logger.log('AudioWorkerClient', 'SharedWorker initialized');
        resolve();
        
      } catch (error) {
        Logger.error('AudioWorkerClient', 'Initialization failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming message from worker
   */
  handleMessage(message) {
    const { type, requestId, data, error } = message;
    
    // Skip ready message (handled in init)
    if (type === 'WORKER_READY') return;
    
    // Handle progress messages - route to active progress callback
    if (type === MessageTypes.KOKORO_DOWNLOAD_PROGRESS) {
      if (this._kokoroProgressCallback) {
        // Safely call the progress callback with the data
        try {
          this._kokoroProgressCallback(data || {});
        } catch (err) {
          Logger.warn('AudioWorkerClient', 'Progress callback error:', err);
        }
      }
      return;
    }
    
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      // Don't warn for progress messages that might arrive after cleanup
      if (type !== MessageTypes.KOKORO_DOWNLOAD_PROGRESS) {
        Logger.warn('AudioWorkerClient', `No pending request for ${requestId}`);
      }
      return;
    }
    
    // Remove from pending
    this.pendingRequests.delete(requestId);
    
    // Clear timeout
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    
    // Resolve or reject
    if (type === MessageTypes.SUCCESS) {
      pending.resolve(data);
    } else if (type === MessageTypes.ERROR) {
      pending.reject(new Error(error || 'Unknown error'));
    } else {
      pending.reject(new Error(`Unknown response type: ${type}`));
    }
  }

  /**
   * Send message to worker and wait for response
   * @param {string} type - Message type
   * @param {Object} data - Message data
   * @param {Object} options - Options (timeout, etc.)
   * @returns {Promise<any>} Response data
   */
  async sendMessage(type, data = {}, options = {}) {
    if (!this.isReady) {
      await this.init();
    }
    
    const requestId = generateRequestId();
    const timeout = options.timeout || 120000; // 2 minutes default
    
    // Extension mode: Use chrome.runtime.sendMessage to background (which forwards to offscreen)
    if (this.mode === 'extension') {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
        }, timeout);
        
        chrome.runtime.sendMessage({
          type,
          requestId,
          data,
          target: 'background' // Route to background script
        }, (response) => {
          clearTimeout(timeoutId);
          
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (response && response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });
    }
    
    // Dev mode: Use SharedWorker port
    return new Promise((resolve, reject) => {
      // Store pending request
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
      }, timeout);
      
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId
      });
      
      // Send message
      this.port.postMessage({
        type,
        requestId,
        data,
        target: 'worker' // For filtering
      });
    });
  }

  /**
   * Process audio with lip sync generation
   * Main entry point for TTS integration
   * 
   * @param {ArrayBuffer} audioBuffer - Raw audio data
   * @returns {Promise<{bvmdData: Array|null}>} BVMD data as Array
   */
  async processAudioWithLipSync(audioBuffer) {
    try {
      Logger.log('AudioWorkerClient', `Processing audio with lip sync (${this.mode} mode)...`);
      
      if (this.mode === 'dev') {
        // Dev mode: Decode on main thread, send PCM to SharedWorker
        
        if (!this.isReady) {
          await this.init();
        }
        
        // Step 1: Decode audio on main thread (AudioContext required)
        const audioContextBuffer = await this.audioContext.decodeAudioData(audioBuffer.slice(0));
        
        Logger.log('AudioWorkerClient', `Audio decoded: ${audioContextBuffer.duration.toFixed(2)}s`);
        
        // Step 2: Extract Float32Array (raw audio data)
        const audioData = audioContextBuffer.getChannelData(0); // First channel
        const sampleRate = audioContextBuffer.sampleRate;
        
        // Step 3: Send to SharedWorker for heavy processing
        // Worker will: compute spectrogram → analyze vowels → generate VMD → convert to BVMD
        const response = await this.sendMessage(
          MessageTypes.TTS_PROCESS_AUDIO_WITH_LIPSYNC,
          {
            audioData: Array.from(audioData), // Convert Float32Array to Array for transfer
            sampleRate: sampleRate,
            originalAudioBuffer: Array.from(new Uint8Array(audioBuffer)) // Keep original for return
          },
          { timeout: 120000 }
        );
        
        Logger.log('AudioWorkerClient', 'Processing complete');
        
        return response;
        
      } else {
        // Extension mode: This shouldn't be called directly in extension mode
        // Extension uses offscreen document which is managed by background script
        throw new Error('processAudioWithLipSync should not be called in extension mode. Use offscreen document.');
      }
      
    } catch (error) {
      Logger.error('AudioWorkerClient', 'Processing failed:', error);
      throw error;
    }
  }

  /**
   * Generate VMD from audio buffer
   * For testing/debugging (dev mode only)
   * 
   * @param {ArrayBuffer} audioBuffer - Raw audio data
   * @param {string} modelName - Model name
   * @returns {Promise<{vmdData: Array}>} VMD data as Array
   */
  async generateVMD(audioBuffer, modelName = 'Model') {
    if (this.mode !== 'dev') {
      throw new Error('generateVMD is only available in dev mode');
    }
    
    try {
      if (!this.isReady) {
        await this.init();
      }
      
      // Decode audio on main thread
      const audioContextBuffer = await this.audioContext.decodeAudioData(audioBuffer.slice(0));
      
      // Extract audio data
      const audioData = audioContextBuffer.getChannelData(0);
      const sampleRate = audioContextBuffer.sampleRate;
      
      // Send to worker
      const response = await this.sendMessage(
        MessageTypes.OFFSCREEN_VMD_GENERATE,
        {
          audioData: Array.from(audioData),
          sampleRate: sampleRate,
          modelName: modelName
        },
        { timeout: 120000 }
      );
      
      return response;
      
    } catch (error) {
      Logger.error('AudioWorkerClient', 'VMD generation failed:', error);
      throw error;
    }
  }

  /**
   * Initialize Kokoro TTS model
   * @param {Object} config - Kokoro configuration
   * @param {string} config.modelId - Model ID
   * @param {string} config.dtype - Quantization (q8 recommended)
   * @param {string} config.device - Device backend (auto/webgpu/wasm)
   * @param {Function} progressCallback - Progress callback (progress) => {}
   * @returns {Promise<{initialized: boolean, message: string}>}
   */
  async initKokoro(config, progressCallback = null) {
    try {
      Logger.log('AudioWorkerClient', `Initializing Kokoro (${this.mode} mode)...`, config);
      
      if (!this.isReady) {
        await this.init();
      }
      
      Logger.log('AudioWorkerClient', 'initKokoro called with config:', JSON.stringify(config, null, 2));
      
      // Store progress callback for handleMessage to use
      if (progressCallback) {
        this._kokoroProgressCallback = progressCallback;
      }
      
      const messageData = {
        modelId: config.modelId || 'onnx-community/Kokoro-82M-v1.0-ONNX',
        device: config.device || (this.mode === 'dev' ? 'wasm' : 'auto')
        // NOTE: dtype is auto-determined in KokoroTTSCore based on device (q8 for wasm, fp32 for webgpu)
      };
      
      Logger.log('AudioWorkerClient', 'Sending KOKORO_INIT message with:', JSON.stringify(messageData, null, 2));
      
      const response = await this.sendMessage(
        MessageTypes.KOKORO_INIT,
        messageData,
        { timeout: 300000 } // 5 minutes for model download
      );
      
      // Clean up progress callback
      if (this._kokoroProgressCallback) {
        delete this._kokoroProgressCallback;
      }
      
      Logger.log('AudioWorkerClient', 'Kokoro initialized:', response);
      return response;
      
    } catch (error) {
      // Clean up on error too
      if (this._kokoroProgressCallback) {
        delete this._kokoroProgressCallback;
      }
      Logger.error('AudioWorkerClient', 'Kokoro initialization failed:', error);
      throw error;
    }
  }

  /**
   * Generate speech using Kokoro TTS
   * @param {string} text - Text to synthesize
   * @param {Object} options - Generation options
   * @param {string} options.voice - Voice ID
   * @param {number} options.speed - Speed multiplier
   * @returns {Promise<ArrayBuffer>} Audio as ArrayBuffer
   */
  async generateKokoroSpeech(text, options = {}) {
    try {
      Logger.log('AudioWorkerClient', `generateKokoroSpeech called (${this.mode} mode) with text:`, typeof text, `"${text?.substring?.(0, 50)}..."`);
      
      if (!this.isReady) {
        await this.init();
      }
      
      Logger.log('AudioWorkerClient', 'Sending message to worker with text:', typeof text, text?.substring?.(0, 50));
      
      const response = await this.sendMessage(
        MessageTypes.KOKORO_GENERATE,
        {
          text,
          voice: options.voice || 'af_heart',
          speed: options.speed !== undefined ? options.speed : 1.0
        },
        { timeout: 60000 }
      );
      
      // Convert Array back to ArrayBuffer
      if (Array.isArray(response.audioBuffer)) {
        const audioBuffer = new Uint8Array(response.audioBuffer).buffer;
        return audioBuffer;
      }
      
      return response.audioBuffer;
      
    } catch (error) {
      Logger.error('AudioWorkerClient', 'Kokoro generation failed:', error);
      throw error;
    }
  }

  /**
   * Check Kokoro TTS status
   * @returns {Promise<Object>} Status object
   */
  async checkKokoroStatus() {
    try {
      if (!this.isReady) {
        await this.init();
      }
      
      const response = await this.sendMessage(
        MessageTypes.KOKORO_CHECK_STATUS,
        {},
        { timeout: 30000 } // Increased from 5000ms to 30000ms for slow model loading
      );
      
      return response;
      
    } catch (error) {
      Logger.error('AudioWorkerClient', 'Kokoro status check failed:', error);
      throw error;
    }
  }

  /**
   * List available Kokoro voices
   * @returns {Promise<string[]>} Array of voice IDs
   */
  async listKokoroVoices() {
    try {
      if (!this.isReady) {
        await this.init();
      }
      
      const response = await this.sendMessage(
        MessageTypes.KOKORO_LIST_VOICES,
        {},
        { timeout: 30000 }
      );
      
      return response.voices || [];
      
    } catch (error) {
      Logger.error('AudioWorkerClient', 'Kokoro list voices failed:', error);
      throw error;
    }
  }

  /**
   * Ping Kokoro to keep model loaded in memory (heartbeat)
   * Lightweight check with no side effects
   * @returns {Promise<boolean>} True if model is loaded
   */
  async pingKokoro() {
    try {
      if (!this.isReady) {
        return false;
      }
      
      const response = await this.sendMessage(
        MessageTypes.KOKORO_PING,
        {},
        { timeout: 3000 }
      );
      
      return response.alive === true;
      
    } catch {
      // Silent failure for heartbeat - don't spam logs
      return false;
    }
  }

  /**
   * Get Kokoro cache size
   * @returns {Promise<Object>} Cache size information
   */
  async getKokoroCacheSize() {
    try {
      if (!this.isReady) {
        await this.init();
      }
      
      const response = await this.sendMessage(
        MessageTypes.KOKORO_GET_CACHE_SIZE,
        {},
        { timeout: 30000 }
      );
      
      return response || { usage: 0, quota: 0, databases: [] };
      
    } catch (error) {
      Logger.error('AudioWorkerClient', 'Kokoro cache size check failed:', error);
      throw error;
    }
  }

  /**
   * Clear Kokoro cache and reset model
   * @returns {Promise<boolean>} Success status
   */
  async clearKokoroCache() {
    try {
      if (!this.isReady) {
        await this.init();
      }
      
      const response = await this.sendMessage(
        MessageTypes.KOKORO_CLEAR_CACHE,
        {},
        { timeout: 30000 }
      );
      
      return response.cleared || false;
      
    } catch (error) {
      Logger.error('AudioWorkerClient', 'Kokoro cache clear failed:', error);
      throw error;
    }
  }

  /**
   * Analyze audio (compute spectrogram)
   * For testing/debugging (dev mode only)
   * 
   * @param {ArrayBuffer} audioBuffer - Raw audio data
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeAudio(audioBuffer) {
    if (this.mode !== 'dev') {
      throw new Error('analyzeAudio is only available in dev mode');
    }
    
    try {
      if (!this.isReady) {
        await this.init();
      }
      
      // Decode audio on main thread
      const audioContextBuffer = await this.audioContext.decodeAudioData(audioBuffer.slice(0));
      
      // Extract audio data
      const audioData = audioContextBuffer.getChannelData(0);
      const sampleRate = audioContextBuffer.sampleRate;
      
      // Send to worker
      const response = await this.sendMessage(
        MessageTypes.OFFSCREEN_AUDIO_PROCESS,
        {
          audioData: Array.from(audioData),
          sampleRate: sampleRate
        },
        { timeout: 60000 }
      );
      
      return response;
      
    } catch (error) {
      Logger.error('AudioWorkerClient', 'Audio analysis failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    if (this.port) {
      this.port.close();
      this.port = null;
    }
    
    this.worker = null;
    this.isReady = false;
    this.pendingRequests.clear();
    
    Logger.log('AudioWorkerClient', 'Cleaned up');
  }
}

// Export singleton instance
export const audioWorkerClient = new AudioWorkerClient();
