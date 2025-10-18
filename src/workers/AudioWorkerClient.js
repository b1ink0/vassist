/**
 * Audio Worker Client
 * Provides unified interface for audio processing in both dev and extension modes
 * - Dev mode: Uses SharedWorker, decodes audio on main thread
 * - Extension mode: Uses offscreen document (handled by extension infrastructure)
 * Handles AudioContext operations on main thread, delegates heavy work to worker
 */

/* global chrome */

import { MessageTypes, generateRequestId } from '../../extension/shared/MessageTypes.js';

export class AudioWorkerClient {
  constructor() {
    this.mode = this.detectMode();
    this.worker = null;
    this.port = null;
    this.connectionId = null;
    this.pendingRequests = new Map();
    this.audioContext = null;
    this.isReady = false;
    
    console.log(`[AudioWorkerClient] Mode: ${this.mode}`);
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
      console.log('[AudioWorkerClient] Already initialized');
      return;
    }
    
    if (this.mode === 'extension') {
      // Extension mode uses offscreen document, no init needed here
      console.log('[AudioWorkerClient] Extension mode detected, skipping SharedWorker init');
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
          console.error('[AudioWorkerClient] Message error:', error);
        };
        
        // Start port (required for SharedWorker)
        this.port.start();
        
        // Create AudioContext for main thread operations (dev mode only)
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('[AudioWorkerClient] AudioContext created for dev mode');
        
        // Mark as ready
        this.isReady = true;
        console.log('[AudioWorkerClient] SharedWorker initialized');
        resolve();
        
      } catch (error) {
        console.error('[AudioWorkerClient] Initialization failed:', error);
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
    
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      console.warn(`[AudioWorkerClient] No pending request for ${requestId}`);
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
      console.log(`[AudioWorkerClient] Processing audio with lip sync (${this.mode} mode)...`);
      
      if (this.mode === 'dev') {
        // Dev mode: Decode on main thread, send PCM to SharedWorker
        
        if (!this.isReady) {
          await this.init();
        }
        
        // Step 1: Decode audio on main thread (AudioContext required)
        const audioContextBuffer = await this.audioContext.decodeAudioData(audioBuffer.slice(0));
        
        console.log(`[AudioWorkerClient] Audio decoded: ${audioContextBuffer.duration.toFixed(2)}s`);
        
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
        
        console.log('[AudioWorkerClient] Processing complete');
        
        return response;
        
      } else {
        // Extension mode: This shouldn't be called directly in extension mode
        // Extension uses offscreen document which is managed by background script
        throw new Error('processAudioWithLipSync should not be called in extension mode. Use offscreen document.');
      }
      
    } catch (error) {
      console.error('[AudioWorkerClient] Processing failed:', error);
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
      console.error('[AudioWorkerClient] VMD generation failed:', error);
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
      console.error('[AudioWorkerClient] Audio analysis failed:', error);
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
    
    console.log('[AudioWorkerClient] Cleaned up');
  }
}

// Export singleton instance
export const audioWorkerClient = new AudioWorkerClient();
