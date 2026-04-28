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

type KokoroDevice = 'auto' | 'webgpu' | 'wasm';
type KokoroRuntimeDevice = 'webgpu' | 'wasm';

interface KokoroConfig {
  modelId: string;
  device?: KokoroDevice;
}

interface KokoroRuntimeConfig extends KokoroConfig {
  device: KokoroRuntimeDevice;
}

interface KokoroProgressUpdate {
  loaded: number;
  total: number;
  percent: number;
  file: string;
}

type KokoroProgressCallback = (progress: KokoroProgressUpdate) => void;

interface KokoroGenerateOptions {
  voice?: string;
  speed?: number;
}

interface KokoroRawAudio {
  audio: Float32Array;
  sampling_rate?: number;
}

interface KokoroTTSInstance {
  generate(text: string, options: { voice: string; speed: number }): Promise<KokoroRawAudio | Float32Array>;
  list_voices(): Promise<string[]>;
}

interface KokoroTTSFactory {
  from_pretrained(
    modelId: string,
    options: {
      dtype: 'fp32' | 'q8';
      device: KokoroRuntimeDevice;
      progress_callback?: (progress: unknown) => void;
    }
  ): Promise<KokoroTTSInstance>;
}

interface KokoroModule {
  KokoroTTS: KokoroTTSFactory;
}

interface CacheSizeInfo {
  usage: number;
  quota: number;
  databases: string[];
}

interface KokoroStatus {
  initialized: boolean;
  initializing: boolean;
  modelId: string | null;
  config: KokoroRuntimeConfig | null;
}

export class KokoroTTSCore {
  private tts: KokoroTTSInstance | null;
  private isInitialized: boolean;
  private isInitializing: boolean;
  private modelId: string | null;
  private config: KokoroRuntimeConfig | null;
  private initPromise: Promise<boolean> | null;

  constructor() {
    this.tts = null;
    this.isInitialized = false;
    this.isInitializing = false;
    this.modelId = null;
    this.config = null;
    this.initPromise = null;
  }

  /**
   * Initialize Kokoro TTS model
   * NOTE: dtype (quantization) is automatically determined based on device:
   * - webgpu -> fp32 (required for WebGPU backend)
   * - wasm -> q8 (recommended for WASM backend, best balance)
   */
  async initialize(config: KokoroConfig, progressCallback: KokoroProgressCallback | null = null): Promise<boolean> {
    const requestedDevice = config.device ?? 'auto';

    // If already initialized with same config AND same device, return success
    if (this.isInitialized && this.modelId === config.modelId && this.config?.device === requestedDevice) {
      Logger.log('KokoroTTSCore', 'Already initialized with model:', this.modelId, 'device:', this.config?.device);
      return true;
    }

    // If device changed, we need to re-initialize with new backend
    if (this.isInitialized && this.config?.device !== requestedDevice) {
      Logger.log('KokoroTTSCore', 'Device changed from', this.config?.device, 'to', requestedDevice, '- destroying old model');
      await this.destroy();
    }

    // If currently initializing, wait for it
    if (this.isInitializing && this.initPromise) {
      Logger.log('KokoroTTSCore', 'Initialization in progress, waiting...');
      return await this.initPromise;
    }

    this.isInitializing = true;

    this.initPromise = (async (): Promise<boolean> => {
      try {
        Logger.log('KokoroTTSCore', 'Initializing Kokoro TTS...', config);

        // Dynamic import of kokoro-js
        const module = (await import('kokoro-js')) as unknown as KokoroModule;
        const { KokoroTTS } = module;

        Logger.log('KokoroTTSCore', 'Loaded kokoro-js');

        // Determine device backend
        let device: KokoroDevice = requestedDevice;

        // Auto-detect if requested (workers now support WebGPU via navigator.gpu)
        if (device === 'auto' && typeof navigator !== 'undefined') {
          try {
            const gpuCapableNavigator = navigator as Navigator & {
              gpu?: { requestAdapter: () => Promise<unknown> };
            };

            if (gpuCapableNavigator.gpu) {
              const adapter = await gpuCapableNavigator.gpu.requestAdapter();
              device = adapter ? 'webgpu' : 'wasm';
            } else {
              device = 'wasm';
            }
          } catch (error: unknown) {
            Logger.warn('KokoroTTSCore', 'WebGPU detection failed, using WASM:', error);
            device = 'wasm';
          }
        }

        const runtimeDevice: KokoroRuntimeDevice = device === 'webgpu' ? 'webgpu' : 'wasm';

        // CRITICAL: Map device to correct dtype
        // WebGPU REQUIRES fp32, WASM works best with q8
        const dtype: 'fp32' | 'q8' = runtimeDevice === 'webgpu' ? 'fp32' : 'q8';

        Logger.log('KokoroTTSCore', `Loading model with device=${runtimeDevice}, dtype=${dtype} (auto-mapped)`);

        // Load model with progress tracking and retry logic
        try {
          this.tts = await KokoroTTS.from_pretrained(config.modelId, {
            dtype,
            device: runtimeDevice,
            progress_callback: (progress: unknown) => {
              const parsedProgress = KokoroTTSCore.parseProgress(progress);
              if (!parsedProgress) {
                Logger.warn('KokoroTTSCore', 'Invalid progress object:', progress);
                return;
              }

              const loaded = parsedProgress.loaded;
              const total = parsedProgress.total;
              const percent = total > 0 ? (loaded / total) * 100 : 0;

              Logger.log('KokoroTTSCore', `Download progress: ${percent.toFixed(1)}%`);

              if (progressCallback) {
                progressCallback({
                  loaded,
                  total,
                  percent,
                  file: parsedProgress.file
                });
              }
            }
          });
        } catch (deviceError: unknown) {
          Logger.error('KokoroTTSCore', `Failed with ${runtimeDevice} backend:`, deviceError);

          // Fallback: If WebGPU failed, try WASM with q8
          if (runtimeDevice === 'webgpu') {
            Logger.log('KokoroTTSCore', 'Falling back to WASM backend...');

            this.tts = await KokoroTTS.from_pretrained(config.modelId, {
              dtype: 'q8', // WASM always uses q8
              device: 'wasm',
              progress_callback: (progress: unknown) => {
                const parsedProgress = KokoroTTSCore.parseProgress(progress);
                if (!parsedProgress) {
                  return;
                }

                const loaded = parsedProgress.loaded;
                const total = parsedProgress.total;
                const percent = total > 0 ? (loaded / total) * 100 : 0;

                if (progressCallback) {
                  progressCallback({
                    loaded,
                    total,
                    percent,
                    file: parsedProgress.file || 'model files (WASM fallback)'
                  });
                }
              }
            });

            Logger.log('KokoroTTSCore', 'WASM fallback successful');
            this.config = { ...config, device: 'wasm' };
          } else {
            throw deviceError;
          }
        }

        this.modelId = config.modelId;
        this.config = this.config ?? { ...config, device: runtimeDevice }; // Store actual device used
        this.isInitialized = true;
        this.isInitializing = false;

        Logger.log('KokoroTTSCore', 'Model loaded successfully with', this.config.device, 'backend');

        // Log available voices for debugging
        try {
          const voices = await this.tts.list_voices();
          Logger.log('KokoroTTSCore', 'Available voices:', voices);
        } catch (voiceError: unknown) {
          Logger.warn('KokoroTTSCore', 'Could not list voices:', voiceError);
        }

        return true;
      } catch (error: unknown) {
        Logger.error('KokoroTTSCore', 'Initialization failed:', error);
        this.isInitializing = false;
        this.isInitialized = false;
        this.tts = null;

        // Provide user-friendly error messages
        const errorMsg = KokoroTTSCore.getErrorMessage(error);
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
   */
  async generate(text: string, options: KokoroGenerateOptions = {}): Promise<ArrayBuffer> {
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
      let audioSamples: Float32Array;
      let sampleRate = 24000; // Default Kokoro sample rate

      if (result instanceof Float32Array) {
        // Direct Float32Array (older API)
        audioSamples = result;
      } else if (KokoroTTSCore.isRawAudio(result)) {
        // RawAudio object
        audioSamples = result.audio;
        sampleRate = result.sampling_rate || 24000;

        // Find min/max without spreading (avoids stack overflow)
        if (audioSamples.length > 0) {
          const firstSample = audioSamples[0];
          let min = firstSample ?? 0;
          let max = firstSample ?? 0;
          for (let i = 1; i < audioSamples.length; i++) {
            const sampleValue = audioSamples[i] ?? 0;
            if (sampleValue < min) min = sampleValue;
            if (sampleValue > max) max = sampleValue;
          }
          Logger.log('KokoroTTSCore', `Sample range: min=${min}, max=${max}`);
        }
      } else {
        Logger.error('KokoroTTSCore', 'Invalid audio format:', result);
        throw new Error(`Invalid audio format returned from kokoro-js. Expected RawAudio object or Float32Array, got ${typeof result}`);
      }

      // Convert to WAV format for playback (16-bit PCM)
      const wavBuffer = this.float32ToWav(audioSamples, sampleRate);

      Logger.log('KokoroTTSCore', `Generated ${wavBuffer.byteLength} bytes of audio (${audioSamples.length} samples at ${sampleRate}Hz)`);

      return wavBuffer;
    } catch (error: unknown) {
      Logger.error('KokoroTTSCore', 'Generation failed:', error);
      throw new Error(`Kokoro speech generation failed: ${KokoroTTSCore.getErrorMessage(error)}`);
    }
  }

  /**
   * List available voices
   */
  async listVoices(): Promise<string[]> {
    if (!this.isInitialized || !this.tts) {
      throw new Error('Kokoro TTS not initialized. Call initialize() first.');
    }

    try {
      return await this.tts.list_voices();
    } catch (error: unknown) {
      Logger.error('KokoroTTSCore', 'Failed to list voices:', error);
      throw new Error(`Failed to list voices: ${KokoroTTSCore.getErrorMessage(error)}`);
    }
  }

  /**
   * Get initialization status
   */
  getStatus(): KokoroStatus {
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
  async destroy(): Promise<void> {
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
   */
  async ping(): Promise<boolean> {
    if (!this.isInitialized || !this.tts) {
      return false;
    }

    try {
      return this.tts !== null && this.isInitialized;
    } catch (error: unknown) {
      Logger.warn('KokoroTTSCore', 'Ping failed:', error);
      return false;
    }
  }

  /**
   * Clear cache and reset model
   */
  async clearCache(): Promise<boolean> {
    Logger.log('KokoroTTSCore', 'Clearing cache and resetting model...');

    try {
      // First destroy the model instance
      await this.destroy();

      // Then clear transformers.js cache from IndexedDB
      if (typeof indexedDB !== 'undefined') {
        const idbFactory = indexedDB as IDBFactory & {
          databases?: () => Promise<Array<{ name?: string }>>;
        };

        if (typeof idbFactory.databases === 'function') {
          const databases = await idbFactory.databases();
          for (const db of databases) {
            const dbName = db.name;
            if (dbName && dbName.includes('transformers')) {
              Logger.log('KokoroTTSCore', 'Deleting database:', dbName);
              await new Promise<void>((resolve, reject) => {
                const request = indexedDB.deleteDatabase(dbName);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error || new Error('Failed to delete IndexedDB database'));
              });
            }
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
    } catch (error: unknown) {
      Logger.error('KokoroTTSCore', 'Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Get cache size for Kokoro models
   */
  async getCacheSize(): Promise<CacheSizeInfo> {
    try {
      let totalSize = 0;

      // Check IndexedDB databases
      if (typeof indexedDB !== 'undefined') {
        const idbFactory = indexedDB as IDBFactory & {
          databases?: () => Promise<Array<{ name?: string }>>;
        };

        if (typeof idbFactory.databases === 'function') {
          const databases = await idbFactory.databases();
          const transformerDatabases = databases
            .map((d) => d.name)
            .filter((name): name is string => typeof name === 'string' && name.includes('transformers'));

          if (transformerDatabases.length > 0 && typeof navigator !== 'undefined' && 'storage' in navigator) {
            const estimate = await navigator.storage.estimate();
            totalSize = estimate.usage || 0;

            return {
              usage: totalSize,
              quota: estimate.quota || 0,
              databases: transformerDatabases
            };
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
    } catch (error: unknown) {
      Logger.error('KokoroTTSCore', 'Failed to get cache size:', error);
      return { usage: 0, quota: 0, databases: [] };
    }
  }

  /**
   * Convert Float32Array audio samples to WAV format
   * @private
   */
  private float32ToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
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
    this.writeString(view, offset, 'RIFF');
    offset += 4;
    view.setUint32(offset, bufferSize - 8, true);
    offset += 4;
    this.writeString(view, offset, 'WAVE');
    offset += 4;

    // fmt sub-chunk
    this.writeString(view, offset, 'fmt ');
    offset += 4;
    view.setUint32(offset, 16, true);
    offset += 4; // Subchunk1Size (16 for PCM)
    view.setUint16(offset, 1, true);
    offset += 2; // AudioFormat (1 for PCM)
    view.setUint16(offset, numChannels, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, byteRate, true);
    offset += 4;
    view.setUint16(offset, blockAlign, true);
    offset += 2;
    view.setUint16(offset, bitsPerSample, true);
    offset += 2;

    // data sub-chunk
    this.writeString(view, offset, 'data');
    offset += 4;
    view.setUint32(offset, dataSize, true);
    offset += 4;

    // Write audio data (convert Float32 to Int16)
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let sample = samples[i] ?? 0;

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
  private writeString(view: DataView, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  private static isRawAudio(value: unknown): value is KokoroRawAudio {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<KokoroRawAudio>;
    return candidate.audio instanceof Float32Array;
  }

  private static parseProgress(progress: unknown): { loaded: number; total: number; file: string } | null {
    if (!progress || typeof progress !== 'object') {
      return null;
    }

    const record = progress as Record<string, unknown>;
    const loaded = typeof record.loaded === 'number' ? record.loaded : 0;
    const total = typeof record.total === 'number' ? record.total : 0;
    const file = typeof record.file === 'string' ? record.file : 'model files';

    return { loaded, total, file };
  }

  private static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return String(error);
  }
}

// Export singleton instance
export default new KokoroTTSCore();