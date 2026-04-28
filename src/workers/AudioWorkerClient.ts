/**
 * Audio Worker Client
 * Provides unified interface for audio processing in both dev and extension modes
 * - Dev mode: Uses SharedWorker, decodes audio on main thread
 * - Android mode: Uses regular Worker (SharedWorker not supported in WebView)
 * - Extension mode: Uses offscreen document (handled by extension infrastructure)
 * Handles AudioContext operations on main thread, delegates heavy work to worker
 */

import { MessageTypes, generateRequestId } from '../../extension/shared/MessageTypes';
import Logger from '../services/LoggerService';
import { isAndroid } from '../utils/PlatformUtils';

type AudioWorkerMode = 'dev' | 'android' | 'extension';

interface SendMessageOptions {
  timeout?: number;
}

interface WorkerRequestEnvelope {
  type: string;
  requestId: string;
  data: Record<string, unknown>;
  target: 'worker';
}

interface WorkerResponseEnvelope {
  type: string;
  requestId?: string;
  data?: unknown;
  error?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface ChromeRuntimeLike {
  id?: string;
  lastError?: { message?: string };
  sendMessage(message: unknown, callback: (response: unknown) => void): void;
}

interface ChromeLike {
  runtime?: ChromeRuntimeLike;
}

interface KokoroInitConfig {
  modelId?: string;
  device?: 'auto' | 'webgpu' | 'wasm';
}

interface KokoroSpeechOptions {
  voice?: string;
  speed?: number;
}

interface KokoroGenerateResponse {
  audioBuffer?: ArrayBuffer | number[];
}

interface KokoroVoicesResponse {
  voices?: string[];
}

interface KokoroPingResponse {
  alive?: boolean;
}

interface KokoroCacheResponse {
  usage?: number;
  quota?: number;
  databases?: string[];
}

interface KokoroClearResponse {
  cleared?: boolean;
}

export class AudioWorkerClient {
  private mode: AudioWorkerMode | null;
  private worker: Worker | SharedWorker | null;
  private port: MessagePort | null;
  private connectionId: string | null;
  private pendingRequests: Map<string, PendingRequest>;
  private audioContext: AudioContext | null;
  private isReady: boolean;
  private _kokoroProgressCallback?: (progress: Record<string, unknown>) => void;

  constructor() {
    this.mode = null;
    this.worker = null;
    this.port = null;
    this.connectionId = null;
    this.pendingRequests = new Map();
    this.audioContext = null;
    this.isReady = false;
  }

  /**
   * Detect runtime mode (lazy initialization)
   */
  detectMode(): AudioWorkerMode {
    if (this.mode !== null) {
      return this.mode;
    }

    const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;

    // Check if running in Chrome extension context
    if (chromeLike?.runtime?.id) {
      this.mode = 'extension';
      return this.mode;
    }

    // Check if running in Android WebView (SharedWorker not supported)
    if (isAndroid) {
      this.mode = 'android';
      return this.mode;
    }

    // Check if SharedWorker is available (not available in Android WebView)
    if (typeof SharedWorker === 'undefined') {
      this.mode = 'android'; // Fallback to regular Worker
      return this.mode;
    }

    this.mode = 'dev';
    return this.mode;
  }

  /**
   * Initialize worker connection (SharedWorker for dev mode, Worker for Android)
   */
  async init(): Promise<void> {
    if (this.isReady) {
      Logger.log('AudioWorkerClient', 'Already initialized');
      return;
    }

    this.detectMode();
    Logger.log('AudioWorkerClient', `Initializing in ${this.mode} mode`);

    if (this.mode === 'extension') {
      // Extension mode uses offscreen document, no init needed here
      Logger.log('AudioWorkerClient', 'Extension mode detected, skipping SharedWorker init');
      this.isReady = true;
      return;
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const useRegularWorker = this.mode === 'android' || typeof SharedWorker === 'undefined';

        if (useRegularWorker) {
          Logger.log('AudioWorkerClient', 'Using regular Worker (SharedWorker not available)');

          this.worker = new Worker(
            new URL('./shared-audio-worker.js', import.meta.url),
            { type: 'module', name: 'audioWorker' }
          );

          // Regular Worker uses direct onmessage
          this.worker.onmessage = (event: MessageEvent<WorkerResponseEnvelope>) => {
            this.handleMessage(event.data);
          };

          this.worker.onerror = (error: ErrorEvent) => {
            Logger.error('AudioWorkerClient', 'Worker error:', error);
          };

          // No port needed for regular Worker
          this.port = null;
        } else {
          // Dev mode: Use SharedWorker
          this.worker = new SharedWorker(
            new URL('./shared-audio-worker.js', import.meta.url),
            { type: 'module', name: 'sharedAudioWorker' }
          );

          this.port = this.worker.port;

          // Set up message handler
          this.port.onmessage = (event: MessageEvent<WorkerResponseEnvelope>) => {
            this.handleMessage(event.data);
          };

          this.port.onmessageerror = (error: MessageEvent) => {
            Logger.error('AudioWorkerClient', 'Message error:', error);
          };

          // Start port (required for SharedWorker)
          this.port.start();
        }

        // Create AudioContext for main thread operations
        const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) {
          throw new Error('AudioContext is not available in this environment');
        }

        this.audioContext = new AudioContextCtor();
        Logger.log('AudioWorkerClient', 'AudioContext created');

        // Mark as ready
        this.isReady = true;
        Logger.log('AudioWorkerClient', `${this.mode === 'android' ? 'Worker' : 'SharedWorker'} initialized`);
        resolve();
      } catch (error: unknown) {
        Logger.error('AudioWorkerClient', 'Initialization failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Post message to worker (handles both Worker and SharedWorker)
   */
  private postToWorker(message: WorkerRequestEnvelope): void {
    if (this.mode === 'android') {
      // Regular Worker: post directly
      if (!(this.worker instanceof Worker)) {
        throw new Error('AudioWorkerClient: Worker is not initialized');
      }
      this.worker.postMessage(message);
      return;
    }

    // SharedWorker: post via port
    if (!this.port) {
      throw new Error('AudioWorkerClient: SharedWorker port is not initialized');
    }
    this.port.postMessage(message);
  }

  /**
   * Handle incoming message from worker
   */
  private handleMessage(message: WorkerResponseEnvelope): void {
    const { type, requestId, data, error } = message;

    // Skip ready message (handled in init)
    if (type === 'WORKER_READY') return;

    // Handle progress messages - route to active progress callback
    if (type === MessageTypes.KOKORO_DOWNLOAD_PROGRESS) {
      if (this._kokoroProgressCallback) {
        // Safely call the progress callback with the data
        try {
          const progressData = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {};
          this._kokoroProgressCallback(progressData);
        } catch (err: unknown) {
          Logger.warn('AudioWorkerClient', 'Progress callback error:', err);
        }
      }
      return;
    }

    if (!requestId) {
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
    clearTimeout(pending.timeoutId);

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
   */
  async sendMessage<T = unknown>(type: string, data: Record<string, unknown> = {}, options: SendMessageOptions = {}): Promise<T> {
    if (!this.isReady) {
      await this.init();
    }

    const requestId = generateRequestId();
    const timeout = options.timeout || 120000; // 2 minutes default

    // Extension mode: Use chrome.runtime.sendMessage to background (which forwards to offscreen)
    if (this.mode === 'extension') {
      return await new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
        }, timeout);

        const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;
        const runtime = chromeLike?.runtime;
        if (!runtime) {
          clearTimeout(timeoutId);
          reject(new Error('Chrome runtime is unavailable in extension mode'));
          return;
        }

        runtime.sendMessage({
          type,
          requestId,
          data,
          target: 'background' // Route to background script
        }, (response: unknown) => {
          clearTimeout(timeoutId);

          if (runtime.lastError?.message) {
            reject(new Error(runtime.lastError.message));
            return;
          }

          if (response && typeof response === 'object' && 'error' in response) {
            const errorMessage = (response as { error?: unknown }).error;
            reject(new Error(typeof errorMessage === 'string' ? errorMessage : 'Unknown extension runtime error'));
          } else {
            resolve(response as T);
          }
        });
      });
    }

    // Dev/Android mode: Use Worker or SharedWorker
    return await new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve: (value: unknown) => resolve(value as T),
        reject,
        timeoutId
      });

      // Send message using appropriate method
      this.postToWorker({
        type,
        requestId,
        data,
        target: 'worker' // For filtering
      });
    });
  }

  /**
   * Process audio with lip sync generation
   */
  async processAudioWithLipSync(audioBuffer: ArrayBuffer): Promise<Record<string, unknown>> {
    try {
      Logger.log('AudioWorkerClient', `Processing audio with lip sync (${this.mode} mode)...`);

      if (this.mode === 'dev' || this.mode === 'android') {
        if (!this.isReady) {
          await this.init();
        }

        const bufferView = new Uint8Array(audioBuffer);
        const header = String.fromCharCode(...bufferView.slice(0, 4));
        Logger.log('AudioWorkerClient', `Audio buffer: ${audioBuffer.byteLength} bytes, header: "${header}"`);

        if (!this.audioContext) {
          throw new Error('AudioWorkerClient: AudioContext is not initialized');
        }

        // Step 1: Decode audio on main thread (AudioContext required)
        let audioContextBuffer: AudioBuffer;
        try {
          audioContextBuffer = await this.audioContext.decodeAudioData(audioBuffer.slice(0));
        } catch (decodeError: unknown) {
          Logger.error('AudioWorkerClient', 'decodeAudioData failed:', decodeError);

          // On Android WebView, try manual WAV decoding as fallback
          if (this.mode === 'android' && header === 'RIFF') {
            Logger.log('AudioWorkerClient', 'Trying manual WAV decode as fallback...');
            audioContextBuffer = this.decodeWavManually(audioBuffer);
          } else {
            throw decodeError;
          }
        }

        Logger.log('AudioWorkerClient', `Audio decoded: ${audioContextBuffer.duration.toFixed(2)}s`);

        // Step 2: Extract Float32Array (raw audio data)
        const audioData = audioContextBuffer.getChannelData(0); // First channel
        const sampleRate = audioContextBuffer.sampleRate;

        // Step 3: Send to Worker for heavy processing
        const response = await this.sendMessage<Record<string, unknown>>(
          MessageTypes.TTS_PROCESS_AUDIO_WITH_LIPSYNC,
          {
            audioData: Array.from(audioData), // Convert Float32Array to Array for transfer
            sampleRate,
            originalAudioBuffer: Array.from(new Uint8Array(audioBuffer)) // Keep original for return
          },
          { timeout: 120000 }
        );

        Logger.log('AudioWorkerClient', 'Processing complete');
        return response;
      }

      if (this.mode === 'extension') {
        // Extension mode: This shouldn't be called directly in extension mode
        throw new Error('processAudioWithLipSync should not be called in extension mode. Use offscreen document.');
      }

      throw new Error(`Unknown mode: ${this.mode}`);
    } catch (error: unknown) {
      Logger.error('AudioWorkerClient', 'Processing failed:', error);
      throw error;
    }
  }

  /**
   * Generate VMD from audio buffer
   */
  async generateVMD(audioBuffer: ArrayBuffer, modelName = 'Model'): Promise<Record<string, unknown>> {
    if (this.mode !== 'dev' && this.mode !== 'android') {
      throw new Error('generateVMD is only available in dev/android mode');
    }

    try {
      if (!this.isReady) {
        await this.init();
      }

      if (!this.audioContext) {
        throw new Error('AudioWorkerClient: AudioContext is not initialized');
      }

      // Decode audio on main thread
      const audioContextBuffer = await this.audioContext.decodeAudioData(audioBuffer.slice(0));

      // Extract audio data
      const audioData = audioContextBuffer.getChannelData(0);
      const sampleRate = audioContextBuffer.sampleRate;

      // Send to worker
      const response = await this.sendMessage<Record<string, unknown>>(
        MessageTypes.OFFSCREEN_VMD_GENERATE,
        {
          audioData: Array.from(audioData),
          sampleRate,
          modelName
        },
        { timeout: 120000 }
      );

      return response;
    } catch (error: unknown) {
      Logger.error('AudioWorkerClient', 'VMD generation failed:', error);
      throw error;
    }
  }

  /**
   * Initialize Kokoro TTS model
   */
  async initKokoro(config: KokoroInitConfig, progressCallback: ((progress: Record<string, unknown>) => void) | null = null): Promise<Record<string, unknown>> {
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

      const messageData: Record<string, unknown> = {
        modelId: config.modelId || 'onnx-community/Kokoro-82M-v1.0-ONNX',
        device: config.device || (this.mode === 'dev' ? 'wasm' : 'auto')
      };

      Logger.log('AudioWorkerClient', 'Sending KOKORO_INIT message with:', JSON.stringify(messageData, null, 2));

      const response = await this.sendMessage<Record<string, unknown>>(
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
    } catch (error: unknown) {
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
   */
  async generateKokoroSpeech(text: string, options: KokoroSpeechOptions = {}): Promise<ArrayBuffer> {
    try {
      Logger.log('AudioWorkerClient', `generateKokoroSpeech called (${this.mode} mode) with text:`, typeof text, `"${text?.substring?.(0, 50)}..."`);

      if (!this.isReady) {
        await this.init();
      }

      Logger.log('AudioWorkerClient', 'Sending message to worker with text:', typeof text, text?.substring?.(0, 50));

      const response = await this.sendMessage<KokoroGenerateResponse>(
        MessageTypes.KOKORO_GENERATE,
        {
          text,
          voice: options.voice || 'af_heart',
          speed: options.speed !== undefined ? options.speed : 1.0
        },
        { timeout: 60000 }
      );

      if (response.audioBuffer instanceof ArrayBuffer) {
        return response.audioBuffer;
      }

      // Convert Array back to ArrayBuffer
      if (Array.isArray(response.audioBuffer)) {
        return new Uint8Array(response.audioBuffer).buffer;
      }

      throw new Error('Invalid Kokoro response: missing audioBuffer');
    } catch (error: unknown) {
      Logger.error('AudioWorkerClient', 'Kokoro generation failed:', error);
      throw error;
    }
  }

  /**
   * Check Kokoro TTS status
   */
  async checkKokoroStatus(): Promise<Record<string, unknown>> {
    try {
      if (!this.isReady) {
        await this.init();
      }

      return await this.sendMessage<Record<string, unknown>>(
        MessageTypes.KOKORO_CHECK_STATUS,
        {},
        { timeout: 30000 }
      );
    } catch (error: unknown) {
      Logger.error('AudioWorkerClient', 'Kokoro status check failed:', error);
      throw error;
    }
  }

  /**
   * List available Kokoro voices
   */
  async listKokoroVoices(): Promise<string[]> {
    try {
      if (!this.isReady) {
        await this.init();
      }

      const response = await this.sendMessage<KokoroVoicesResponse>(
        MessageTypes.KOKORO_LIST_VOICES,
        {},
        { timeout: 30000 }
      );

      return response.voices || [];
    } catch (error: unknown) {
      Logger.error('AudioWorkerClient', 'Kokoro list voices failed:', error);
      throw error;
    }
  }

  /**
   * Ping Kokoro to keep model loaded in memory (heartbeat)
   */
  async pingKokoro(): Promise<boolean> {
    try {
      if (!this.isReady) {
        return false;
      }

      const response = await this.sendMessage<KokoroPingResponse>(
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
   */
  async getKokoroCacheSize(): Promise<{ usage: number; quota: number; databases: string[] }> {
    try {
      if (!this.isReady) {
        await this.init();
      }

      const response = await this.sendMessage<KokoroCacheResponse>(
        MessageTypes.KOKORO_GET_CACHE_SIZE,
        {},
        { timeout: 30000 }
      );

      return {
        usage: response.usage || 0,
        quota: response.quota || 0,
        databases: response.databases || []
      };
    } catch (error: unknown) {
      Logger.error('AudioWorkerClient', 'Kokoro cache size check failed:', error);
      throw error;
    }
  }

  /**
   * Clear Kokoro cache and reset model
   */
  async clearKokoroCache(): Promise<boolean> {
    try {
      if (!this.isReady) {
        await this.init();
      }

      const response = await this.sendMessage<KokoroClearResponse>(
        MessageTypes.KOKORO_CLEAR_CACHE,
        {},
        { timeout: 30000 }
      );

      return response.cleared === true;
    } catch (error: unknown) {
      Logger.error('AudioWorkerClient', 'Kokoro cache clear failed:', error);
      throw error;
    }
  }

  /**
   * Analyze audio (compute spectrogram)
   */
  async analyzeAudio(audioBuffer: ArrayBuffer): Promise<Record<string, unknown>> {
    if (this.mode !== 'dev' && this.mode !== 'android') {
      throw new Error('analyzeAudio is only available in dev/android mode');
    }

    try {
      if (!this.isReady) {
        await this.init();
      }

      if (!this.audioContext) {
        throw new Error('AudioWorkerClient: AudioContext is not initialized');
      }

      // Decode audio on main thread
      const audioContextBuffer = await this.audioContext.decodeAudioData(audioBuffer.slice(0));

      // Extract audio data
      const audioData = audioContextBuffer.getChannelData(0);
      const sampleRate = audioContextBuffer.sampleRate;

      // Send to worker
      return await this.sendMessage<Record<string, unknown>>(
        MessageTypes.OFFSCREEN_AUDIO_PROCESS,
        {
          audioData: Array.from(audioData),
          sampleRate
        },
        { timeout: 60000 }
      );
    } catch (error: unknown) {
      Logger.error('AudioWorkerClient', 'Audio analysis failed:', error);
      throw error;
    }
  }

  /**
   * Manually decode WAV audio when decodeAudioData fails
   */
  decodeWavManually(audioBuffer: ArrayBuffer): AudioBuffer {
    const view = new DataView(audioBuffer);

    // Parse WAV header
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (riff !== 'RIFF') {
      throw new Error('Not a valid WAV file: missing RIFF header');
    }

    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    if (wave !== 'WAVE') {
      throw new Error('Not a valid WAV file: missing WAVE format');
    }

    // Find fmt chunk (starts at byte 12)
    let offset = 12;
    let sampleRate = 0;
    let numChannels = 0;
    let bitsPerSample = 0;
    let dataOffset = 0;
    let dataSize = 0;

    while (offset < audioBuffer.byteLength - 8) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      const chunkSize = view.getUint32(offset + 4, true);

      if (chunkId === 'fmt ') {
        // Audio format (should be 1 for PCM)
        const audioFormat = view.getUint16(offset + 8, true);
        if (audioFormat !== 1) {
          throw new Error(`Unsupported audio format: ${audioFormat} (only PCM supported)`);
        }

        numChannels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bitsPerSample = view.getUint16(offset + 22, true);

        Logger.log('AudioWorkerClient', `WAV format: ${sampleRate}Hz, ${numChannels}ch, ${bitsPerSample}bit`);
      } else if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }

      offset += 8 + chunkSize;
      // Pad to even boundary
      if (chunkSize % 2 !== 0) offset++;
    }

    if (dataOffset === 0 || dataSize === 0) {
      throw new Error('WAV file missing data chunk');
    }

    // Calculate number of samples
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = dataSize / (numChannels * bytesPerSample);

    if (!this.audioContext) {
      throw new Error('AudioWorkerClient: AudioContext is not initialized');
    }

    // Create AudioBuffer
    const audioContextBuffer = this.audioContext.createBuffer(numChannels, numSamples, sampleRate);

    // Decode samples
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = audioContextBuffer.getChannelData(channel);

      for (let i = 0; i < numSamples; i++) {
        const sampleOffset = dataOffset + (i * numChannels + channel) * bytesPerSample;

        let sample: number;
        if (bitsPerSample === 16) {
          sample = view.getInt16(sampleOffset, true) / 32768.0;
        } else if (bitsPerSample === 8) {
          sample = (view.getUint8(sampleOffset) - 128) / 128.0;
        } else if (bitsPerSample === 32) {
          sample = view.getFloat32(sampleOffset, true);
        } else {
          throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
        }

        channelData[i] = sample;
      }
    }

    Logger.log('AudioWorkerClient', `Manual WAV decode: ${numSamples} samples, ${(numSamples / sampleRate).toFixed(2)}s`);
    return audioContextBuffer;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
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