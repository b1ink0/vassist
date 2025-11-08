/**
 * Kokoro TTS Core
 * Worker-safe Kokoro TTS logic (works in Worker, SharedWorker and Offscreen contexts)
 * Handles model initialization, audio generation, voice management
 * Supports both WebGPU (fp32, ~300MB) and WASM (q8, ~86MB) backends
 */

/**
 * Kokoro TTS Core Class
 * Singleton instance manages model lifecycle
 */
import Logger from '../../services/LoggerService';
export class KokoroTTSCore {
  constructor() {
    this.tts = null; // KokoroTTS instance
    this.isInitialized = false;
    this.isInitializing = false;
    this.modelId = null;
    this.config = null;
    this.initPromise = null;
    
    // Note: Don't use Logger.log in constructor to avoid circular dependency with singleton initialization
  }

  /**
   * Initialize Kokoro TTS model
   * @param {Object} config - Configuration object
   * @param {string} config.modelId - HuggingFace model ID
   * @param {string} config.device - Device backend (auto, webgpu, wasm)
   * @param {Function} progressCallback - Progress callback (progress) => {}
   * @returns {Promise<boolean>} Success status
   * 
   * NOTE: dtype (quantization) is automatically determined based on device:
   * - webgpu -> fp32 (required for WebGPU backend)
   * - wasm -> q8 (recommended for WASM backend, best balance)
   */
  async initialize(config, progressCallback = null) {
    // If already initialized with same config, return success
    if (this.isInitialized && this.modelId === config.modelId) {
      Logger.log('KokoroTTSCore', 'Already initialized with model:', this.modelId);
      return true;
    }

    // If currently initializing, wait for it
    if (this.isInitializing && this.initPromise) {
      Logger.log('KokoroTTSCore', 'Initialization in progress, waiting...');
      return await this.initPromise;
    }

    this.isInitializing = true;
    
    this.initPromise = (async () => {
      try {
        Logger.log('KokoroTTSCore', 'Initializing Kokoro TTS...', config);

        // Dynamic import of kokoro-js
        // Note: transformers.js env should be configured BEFORE this import
        // - In offscreen (extension): env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('assets/')
        // - In SharedWorker (dev): transformers.js auto-detects bundled WASM files in assets
        const { KokoroTTS } = await import('kokoro-js');
        
        Logger.log('KokoroTTSCore', 'Loaded kokoro-js');
        
        // Determine device backend
        let device = config.device || 'auto';
        
        // Auto-detect if requested (workers now support WebGPU via navigator.gpu)
        if (device === 'auto' && typeof navigator !== 'undefined') {
          try {
            if (navigator.gpu) {
              const adapter = await navigator.gpu.requestAdapter();
              device = adapter ? 'webgpu' : 'wasm';
            } else {
              device = 'wasm';
            }
          } catch (error) {
            Logger.warn('KokoroTTSCore', 'WebGPU detection failed, using WASM:', error);
            device = 'wasm';
          }
        }

        // CRITICAL: Map device to correct dtype
        // WebGPU REQUIRES fp32, WASM works best with q8
        const dtype = device === 'webgpu' ? 'fp32' : 'q8';
        
        Logger.log('KokoroTTSCore', `Loading model with device=${device}, dtype=${dtype} (auto-mapped)`);

        // Load model with progress tracking and retry logic
        try {
          this.tts = await KokoroTTS.from_pretrained(config.modelId, {
            dtype: dtype,
            device: device,
            progress_callback: (progress) => {
              // Safely handle progress object
              if (!progress || typeof progress !== 'object') {
                Logger.warn('KokoroTTSCore', 'Invalid progress object:', progress);
                return;
              }
              
              // Calculate progress percentage
              const loaded = progress.loaded || 0;
              const total = progress.total || 0;
              const percent = total > 0 ? (loaded / total) * 100 : 0;
              
              Logger.log('KokoroTTSCore', `Download progress: ${percent.toFixed(1)}%`);
              
              if (progressCallback) {
                progressCallback({
                  loaded,
                  total,
                  percent,
                  file: progress.file || 'model files'
                });
              }
            }
          });
        } catch (deviceError) {
          Logger.error('KokoroTTSCore', 'Failed with ${device} backend:', deviceError);
          
          // Fallback: If WebGPU failed, try WASM with q8
          if (device === 'webgpu') {
            Logger.log('KokoroTTSCore', 'Falling back to WASM backend...');
            device = 'wasm';
            
            this.tts = await KokoroTTS.from_pretrained(config.modelId, {
              dtype: 'q8', // WASM always uses q8
              device: 'wasm',
              progress_callback: (progress) => {
                // Safely handle progress object
                if (!progress || typeof progress !== 'object') {
                  return;
                }
                
                const loaded = progress.loaded || 0;
                const total = progress.total || 0;
                const percent = total > 0 ? (loaded / total) * 100 : 0;
                
                if (progressCallback) {
                  progressCallback({
                    loaded,
                    total,
                    percent,
                    file: progress.file || 'model files (WASM fallback)'
                  });
                }
              }
            });
            
            Logger.log('KokoroTTSCore', 'WASM fallback successful');
          } else {
            throw deviceError;
          }
        }

        this.modelId = config.modelId;
        this.config = { ...config, device: device }; // Store actual device used
        this.isInitialized = true;
        this.isInitializing = false;

        Logger.log('KokoroTTSCore', 'Model loaded successfully with', device, 'backend');
      
        // Log available voices for debugging
        try {
          const voices = await this.tts.list_voices();
          Logger.log('KokoroTTSCore', 'Available voices:', voices);
        } catch (voiceError) {
          Logger.warn('KokoroTTSCore', 'Could not list voices:', voiceError);
        }
      
        return true;

      } catch (error) {
        Logger.error('KokoroTTSCore', 'Initialization failed:', error);
        this.isInitializing = false;
        this.isInitialized = false;
        this.tts = null;
        
        // Provide user-friendly error messages
        // Safely access error.message with fallback
        const errorMsg = error?.message || error?.toString() || 'Unknown initialization error';
        let errorMessage = errorMsg;
        
        if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          errorMessage = 'Network error: Unable to download model. Check your internet connection and try again.';
        } else if (errorMsg.includes('quota') || errorMsg.includes('storage')) {
          errorMessage = 'Storage error: Not enough disk space. Free up some space and try again.';
        } else if (errorMsg.includes('WebGPU') || errorMsg.includes('gpu')) {
          errorMessage = 'GPU error: WebGPU not available. Using WASM fallback failed.';
        }
        
        throw new Error(errorMessage);
      }
    })();

    return await this.initPromise;
  }

  /**
   * Generate speech from text
   * @param {string} text - Text to synthesize
   * @param {Object} options - Generation options
   * @param {string} options.voice - Voice ID
   * @param {number} options.speed - Speed multiplier (0.5 - 2.0)
   * @returns {Promise<ArrayBuffer>} Audio data as ArrayBuffer
   */
  async generate(text, options = {}) {
    if (!this.isInitialized || !this.tts) {
      throw new Error('Kokoro TTS not initialized. Call initialize() first.');
    }

    try {
      Logger.log('KokoroTTSCore', `Generating speech: "${text.substring(0, 50)}..." with voice=${options.voice}, speed=${options.speed}`);

      // Generate audio - kokoro-js v1.2.1 returns RawAudio object
      const result = await this.tts.generate(text, {
        voice: options.voice || 'af_heart',
        speed: options.speed !== undefined ? options.speed : 1.0
      });

      Logger.log('KokoroTTSCore', 'Raw result type:', typeof result, result);
      
      // IMPORTANT: The native .toBlob() creates 32-bit float WAV (audioFormat: 3)
      // which many browsers/audio players don't support properly.
      // We MUST convert to 16-bit PCM WAV (audioFormat: 1) for compatibility.
      
      // Extract audio samples from RawAudio object
      let audioSamples;
      let sampleRate = 24000; // Default Kokoro sample rate
      
      if (result && typeof result === 'object') {
        if (result.audio instanceof Float32Array) {
          // RawAudio object
          audioSamples = result.audio;
          sampleRate = result.sampling_rate || 24000;
          
          // Find min/max without spreading (avoids stack overflow)
          let min = audioSamples[0], max = audioSamples[0];
          for (let i = 1; i < audioSamples.length; i++) {
            if (audioSamples[i] < min) min = audioSamples[i];
            if (audioSamples[i] > max) max = audioSamples[i];
          }
          Logger.log('KokoroTTSCore', `Sample range: min=${min}, max=${max}`);
        } else if (result instanceof Float32Array) {
          // Direct Float32Array (older API)
          audioSamples = result;
        } else {
          Logger.error('KokoroTTSCore', 'Invalid audio format:', result);
          throw new Error(`Invalid audio format returned from kokoro-js. Expected RawAudio object or Float32Array, got ${typeof result}`);
        }
      } else {
        Logger.error('KokoroTTSCore', 'Invalid result type:', typeof result, result);
        throw new Error(`Invalid result type from kokoro-js: ${typeof result}`);
      }

      // Convert to WAV format for playback (16-bit PCM)
      const wavBuffer = this.float32ToWav(audioSamples, sampleRate);
      
      Logger.log('KokoroTTSCore', `Generated ${wavBuffer.byteLength} bytes of audio (${audioSamples.length} samples at ${sampleRate}Hz)`);
      
      return wavBuffer;

    } catch (error) {
      Logger.error('KokoroTTSCore', 'Generation failed:', error);
      throw new Error(`Kokoro speech generation failed: ${error.message}`);
    }
  }

  /**
   * List available voices
   * @returns {Promise<string[]>} Array of voice IDs
   */
  async listVoices() {
    if (!this.isInitialized || !this.tts) {
      throw new Error('Kokoro TTS not initialized. Call initialize() first.');
    }

    try {
      const voices = await this.tts.list_voices();
      return voices;
    } catch (error) {
      Logger.error('KokoroTTSCore', 'Failed to list voices:', error);
      throw new Error(`Failed to list voices: ${error.message}`);
    }
  }

  /**
   * Get initialization status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      initializing: this.isInitializing,
      modelId: this.modelId,
      config: this.config
    };
  }

  /**
   * Destroy the TTS model and free up memory
   */
  async destroy() {
    Logger.log('KokoroTTSCore', 'Destroying model...');
    
    this.tts = null;
    this.isInitialized = false;
    this.isInitializing = false;
    this.modelId = null;
    this.config = null;
    this.initPromise = null;
    
    Logger.log('KokoroTTSCore', 'Model destroyed');
  }

  /**
   * Ping/heartbeat to keep model loaded in memory
   * Lightweight check that doesn't generate audio or trigger any side effects
   * @returns {Promise<boolean>} True if model is still loaded
   */
  async ping() {
    if (!this.isInitialized || !this.tts) {
      return false;
    }
    
    try {
      // Simple check that model is accessible without generating audio
      // Just verify the TTS instance exists and is valid
      return this.tts !== null && this.isInitialized;
    } catch (error) {
      Logger.warn('KokoroTTSCore', 'Ping failed:', error);
      return false;
    }
  }

  /**
   * Clear cache and reset model
   * Called when user clears cache from UI
   */
  async clearCache() {
    Logger.log('KokoroTTSCore', 'Clearing cache and resetting model...');
    
    try {
      // First destroy the model instance
      await this.destroy();
      
      // Then clear transformers.js cache from IndexedDB
      // transformers.js stores models in 'transformers-cache' database
      if (typeof indexedDB !== 'undefined') {
        const databases = await indexedDB.databases();
        for (const db of databases) {
          if (db.name && db.name.includes('transformers')) {
            Logger.log('KokoroTTSCore', 'Deleting database:', db.name);
            await new Promise((resolve, reject) => {
              const request = indexedDB.deleteDatabase(db.name);
              request.onsuccess = resolve;
              request.onerror = reject;
            });
          }
        }
      }
      
      // Also clear any Cache Storage API caches
      if (typeof caches !== 'undefined') {
        const cacheKeys = await caches.keys();
        for (const key of cacheKeys) {
          if (key.includes('transformers')) {
            Logger.log('KokoroTTSCore', 'Deleting cache:', key);
            await caches.delete(key);
          }
        }
      }
      
      Logger.log('KokoroTTSCore', 'Cache cleared, model reset');
      return true;
    } catch (error) {
      Logger.error('KokoroTTSCore', 'Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Get cache size for Kokoro models
   * @returns {Promise<{usage: number, quota: number}>}
   */
  async getCacheSize() {
    try {
      let totalSize = 0;
      
      // Check IndexedDB databases
      if (typeof indexedDB !== 'undefined') {
        const databases = await indexedDB.databases();
        for (const db of databases) {
          if (db.name && db.name.includes('transformers')) {
            // We can't easily get the size of IndexedDB without opening it
            // So we'll use storage estimate as a proxy
            if (typeof navigator !== 'undefined' && 'storage' in navigator) {
              const estimate = await navigator.storage.estimate();
              totalSize = estimate.usage || 0;
              
              return {
                usage: totalSize,
                quota: estimate.quota || 0,
                databases: databases.filter(d => d.name.includes('transformers')).map(d => d.name)
              };
            }
          }
        }
      }
      
      // Fallback to storage estimate
      if (typeof navigator !== 'undefined' && 'storage' in navigator) {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
          databases: []
        };
      }
      
      return { usage: 0, quota: 0, databases: [] };
    } catch (error) {
      Logger.error('KokoroTTSCore', 'Failed to get cache size:', error);
      return { usage: 0, quota: 0, databases: [] };
    }
  }

  /**
   * Convert Float32Array audio samples to WAV format
   * @private
   * @param {Float32Array} samples - Audio samples (-1.0 to 1.0)
   * @param {number} sampleRate - Sample rate (Hz)
   * @returns {ArrayBuffer} WAV file as ArrayBuffer
   */
  float32ToWav(samples, sampleRate) {
    const numChannels = 1; // Mono
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const bufferSize = 44 + dataSize; // 44 bytes for WAV header

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // Write WAV header
    let offset = 0;

    // RIFF chunk descriptor
    this.writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, bufferSize - 8, true); offset += 4;
    this.writeString(view, offset, 'WAVE'); offset += 4;

    // fmt sub-chunk
    this.writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // Subchunk1Size (16 for PCM)
    view.setUint16(offset, 1, true); offset += 2; // AudioFormat (1 for PCM)
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, byteRate, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, bitsPerSample, true); offset += 2;

    // data sub-chunk
    this.writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, dataSize, true); offset += 4;

    // Write audio data (convert Float32 to Int16)
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let sample = samples[i];
      
      // Clamp to valid range [-1, 1]
      sample = Math.max(-1, Math.min(1, sample));
      
      // Convert to 16-bit signed integer
      // Float range [-1.0, 1.0] maps to Int16 range [-32768, 32767]
      const int16Value = sample < 0 ? Math.floor(sample * 32768) : Math.floor(sample * 32767);
      
      view.setInt16(offset, int16Value, true);
    }

    return buffer;
  }

  /**
   * Write string to DataView
   * @private
   */
  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

// Export singleton instance
export default new KokoroTTSCore();
