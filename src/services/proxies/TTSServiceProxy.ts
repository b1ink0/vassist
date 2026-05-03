/**
 * TTS Service Proxy
 * Dual-mode wrapper for TTSService
 * Dev mode: Direct TTS API + local audio
 * Extension mode: Background generates audio, offscreen plays
 */

import { ServiceProxy } from "./ServiceProxy";
import TTSService from "../TTSService";
import { MessageTypes } from "../../../extension/shared/MessageTypes";
import Logger from "../LoggerService";
import StorageServiceProxy from "./StorageServiceProxy";
import { DefaultTTSConfig } from "../../config/aiConfig";

interface TTSProxyConfig {
  enabled?: boolean;
  kokoro?: {
    modelId?: string;
    device?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface TTSBridgeResponse {
  configured?: boolean;
  audioBuffer?: unknown;
  mimeType?: string;
  initialized?: boolean;
  voices?: string[];
  alive?: boolean;
  cleared?: boolean;
  [key: string]: unknown;
}

interface TTSResult {
  audio: ArrayBuffer;
  bvmdUrl: string | null;
  mimeType?: string;
}

interface TTSQueueItem {
  text: string;
  audioUrl: string;
  bvmdUrl: string | null;
  sessionId: string | null;
}

interface TTSServiceLike {
  configure(config: Record<string, unknown>): Promise<unknown> | unknown;
  isConfigured(): boolean;
  getCurrentProvider(): string | null;
  initializeBVMDConverter(scene: unknown): void;
  addEventListener(event: string, listener: (...args: unknown[]) => void): void;
  removeEventListener(
    event: string,
    listener: (...args: unknown[]) => void,
  ): void;
  markSessionComplete(sessionId: string): void;
  isSessionComplete(sessionId: string): boolean;
  setLipSyncEnabled(enabled: boolean): void;
  generateSpeech(
    text: string,
    generateLipSync?: boolean,
  ): Promise<TTSResult | null>;
  chunkText(
    text: string,
    maxChunkSize?: number,
    minChunkSize?: number,
  ): string[];
  generateChunkedSpeech(
    text: string,
    onChunkReady?:
      | ((
          text: string,
          audioUrl: string,
          bvmdUrl: string | null,
          index: number,
          total: number,
        ) => void)
      | null,
    maxChunkSize?: number,
    minChunkSize?: number,
    sessionId?: string | null,
  ): Promise<TTSQueueItem[]>;
  getQueueLength(): number;
  isAudioActive(): boolean;
  queueAudio(
    text: string,
    audioUrl: string,
    bvmdUrl?: string | null,
    sessionId?: string | null,
  ): void;
  playAudio(
    text: string,
    audioUrl: string,
    bvmdUrl?: string | null,
  ): Promise<void>;
  playAudioSequence(
    items: TTSQueueItem[],
    sessionId?: string | null,
  ): Promise<void>;
  stopPlayback(): void;
  resumePlayback(): void;
  initializeKokoro(
    progressCallback?: ((progress: unknown) => void) | null,
  ): Promise<boolean>;
  checkKokoroStatus(): Promise<unknown>;
  listKokoroVoices(): Promise<string[]>;
  pingKokoro(): Promise<boolean>;
  getKokoroCacheSize(): Promise<unknown>;
  clearKokoroCache(): Promise<boolean>;
  cleanupBlobUrls(urls?: string[] | null): void;
  isCurrentlyPlaying(): boolean;
  hasSessionStarted: boolean;
  [method: string]: unknown;
}

class TTSServiceProxy extends ServiceProxy {
  protected directService: TTSServiceLike;
  private lastConfigured: TTSProxyConfig | null;
  protected _configuring: boolean;
  private stopCallback: (() => void) | null;

  constructor() {
    super("TTSService");
    this.directService = TTSService as unknown as TTSServiceLike;
    this.lastConfigured = null;
    this._configuring = false;
    this.stopCallback = null;
  }

  /**
   * Ensure service is configured (auto-loads from storage if needed)
   * @returns {Promise<void>}
   */
  async ensureConfigured(): Promise<void> {
    if (this._configuring) return;

    const configured = await this.isConfigured();
    if (configured) return;

    this._configuring = true;
    try {
      const storedConfig = (await StorageServiceProxy.configLoad(
        "ttsConfig",
        null,
      )) as TTSProxyConfig | null;
      const ttsConfig =
        storedConfig ?? (DefaultTTSConfig as unknown as TTSProxyConfig);

      if (ttsConfig && ttsConfig.enabled) {
        Logger.log("TTSServiceProxy", "Auto-configuring from storage...");
        await this.configure(ttsConfig);
      }
    } finally {
      this._configuring = false;
    }
  }

  /**
   * Configure TTS client with provider settings
   * @param {Object} config - TTS configuration
   */
  async configure(config: Record<string, unknown>): Promise<boolean> {
    // Store the config for later use in initializeKokoro
    this.lastConfigured = config;

    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("TTSServiceProxy: Bridge not available");
      const response = (await bridge.sendMessage(MessageTypes.TTS_CONFIGURE, {
        config,
      })) as TTSBridgeResponse;
      return response.configured === true;
    } else {
      await this.directService.configure(config);
      return true;
    }
  }

  /**
   * Check if service is configured and enabled
   * @returns {Promise<boolean>} True if ready
   */
  async isConfigured(): Promise<boolean> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) return false;
      try {
        const response = (await bridge.sendMessage(
          MessageTypes.TTS_IS_CONFIGURED,
          {},
        )) as TTSBridgeResponse;
        return response.configured === true;
      } catch {
        return false;
      }
    } else {
      return this.directService.isConfigured();
    }
  }

  /**
   * Get current provider name
   * @returns {string|null} Provider name or null
   */
  getCurrentProvider(): string | null {
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
  initializeBVMDConverter(scene: unknown): void {
    if (!this.isExtension) {
      this.directService.initializeBVMDConverter(scene);
    }
    // In extension mode, BVMD conversion happens in offscreen
  }

  /**
   * Add event listener for TTS lifecycle events
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   */
  addEventListener(
    event: string,
    listener: (...args: unknown[]) => void,
  ): void {
    // Always use direct service for playback events
    this.directService.addEventListener(event, listener);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   */
  removeEventListener(
    event: string,
    listener: (...args: unknown[]) => void,
  ): void {
    // Always use direct service for playback events
    this.directService.removeEventListener(event, listener);
  }

  /**
   * Mark a TTS session as complete (all chunks generated)
   * @param {string} sessionId - Session ID to mark as complete
   */
  markSessionComplete(sessionId: string): void {
    this.directService.markSessionComplete(sessionId);
  }

  /**
   * Check if a TTS session is marked as complete
   * @param {string} sessionId - Session ID to check
   * @returns {boolean} True if session is complete
   */
  isSessionComplete(sessionId: string): boolean {
    return this.directService.isSessionComplete(sessionId);
  }

  /**
   * Enable or disable lip sync generation
   * @param {boolean} enabled - Enable lip sync generation
   */
  setLipSyncEnabled(enabled: boolean): void {
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
  async generateSpeech(
    text: string,
    generateLipSync = true,
  ): Promise<TTSResult | null> {
    try {
      await this.ensureConfigured();

      if (this.isExtension) {
        // Extension mode flow:
        // 1. Background generates TTS audio (returns ArrayBuffer)
        const bridge = await this.waitForBridge();
        if (!bridge) throw new Error("TTSServiceProxy: Bridge not available");

        const response = (await bridge.sendMessage(
          MessageTypes.TTS_GENERATE_SPEECH,
          { text, generateLipSync: false }, // Don't generate in background
          { timeout: 60000 },
        )) as TTSBridgeResponse;

        // Check if audio generation was cancelled or failed
        if (!response || !response.audioBuffer) {
          Logger.log("TTSServiceProxy", "TTS generation cancelled or failed");
          return null;
        }

        // Convert plain Array back to ArrayBuffer
        let audioBuffer: ArrayBuffer;
        if (Array.isArray(response.audioBuffer)) {
          // Check if array is empty (stopped during generation)
          if (response.audioBuffer.length === 0) {
            Logger.log(
              "TTSServiceProxy",
              "TTS generation returned empty audio (likely stopped)",
            );
            return null;
          }
          const uint8Array = new Uint8Array(response.audioBuffer);
          audioBuffer = uint8Array.buffer;
        } else if (response.audioBuffer instanceof ArrayBuffer) {
          audioBuffer = response.audioBuffer;
        } else if (ArrayBuffer.isView(response.audioBuffer)) {
          const view = response.audioBuffer;
          const bytes = new Uint8Array(
            view.buffer,
            view.byteOffset,
            view.byteLength,
          );
          audioBuffer = new Uint8Array(bytes).buffer;
        } else {
          Logger.error(
            "TTSServiceProxy",
            "Unexpected audioBuffer type from bridge",
          );
          return null;
        }

        // Validate audio buffer is not empty
        if (audioBuffer.byteLength === 0) {
          Logger.log("TTSServiceProxy", "Audio buffer is empty, skipping");
          return null;
        }

        // 2. If lip sync needed, process through offscreen (includes VMD→BVMD conversion)
        if (generateLipSync) {
          try {
            // IMPORTANT: Convert ArrayBuffer to Array before sending
            // Chrome's structured clone transfers ArrayBuffers but copies Arrays
            const audioArray = Array.from(new Uint8Array(audioBuffer));

            // Offscreen will: Generate VMD → Convert to BVMD → Return both as Arrays
            const lipSyncResponse = (await bridge.sendMessage(
              MessageTypes.TTS_PROCESS_AUDIO_WITH_LIPSYNC,
              {
                audioBuffer: audioArray,
                mimeType: response.mimeType, // Pass through MIME type from TTS service
              },
              { timeout: 120000 }, // 2 minutes for heavy processing
            )) as { bvmdData?: unknown };

            // Convert bvmdData from Array to BVMD blob URL
            let bvmdUrl = null;
            if (
              lipSyncResponse.bvmdData &&
              Array.isArray(lipSyncResponse.bvmdData) &&
              lipSyncResponse.bvmdData.length > 0
            ) {
              const bvmdUint8 = new Uint8Array(lipSyncResponse.bvmdData);
              const bvmdBlob = new Blob([bvmdUint8], {
                type: "application/octet-stream",
              });
              bvmdUrl = URL.createObjectURL(bvmdBlob);
            }

            return {
              audio: audioBuffer,
              bvmdUrl,
              ...(response.mimeType ? { mimeType: response.mimeType } : {}),
            };
          } catch (error: unknown) {
            Logger.error(
              "TTSServiceProxy",
              "Lip sync processing failed:",
              error,
            );
            // Return audio without lip sync
            return {
              audio: audioBuffer,
              bvmdUrl: null,
              ...(response.mimeType ? { mimeType: response.mimeType } : {}),
            };
          }
        }

        // No lip sync needed, just return audio
        return {
          audio: audioBuffer,
          bvmdUrl: null,
          ...(response.mimeType ? { mimeType: response.mimeType } : {}),
        };
      } else {
        // Dev mode: Direct service handles everything
        const result = await this.directService.generateSpeech(
          text,
          generateLipSync,
        );
        Logger.log(
          "TTSServiceProxy",
          "directService.generateSpeech returned:",
          result ? "success" : "null",
        );
        return result;
      }
    } catch (error: unknown) {
      Logger.error("TTSServiceProxy", "generateSpeech failed:", error);
      throw error;
    }
  }

  /**
   * Split text into natural chunks for TTS
   * @param {string} text - Text to chunk
   * @param {number} maxChunkSize - Maximum chunk size
   * @param {number} minChunkSize - Minimum chunk size
   * @returns {string[]} Array of text chunks
   */
  chunkText(text: string, maxChunkSize = 500, minChunkSize = 100): string[] {
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
  async generateChunkedSpeech(
    text: string,
    onChunkReady:
      | ((
          text: string,
          audioUrl: string,
          bvmdUrl: string | null,
          index: number,
          total: number,
        ) => void)
      | null = null,
    maxChunkSize = 500,
    minChunkSize = 100,
    sessionId: string | null = null,
  ): Promise<TTSQueueItem[]> {
    if (this.isExtension) {
      // In extension mode, chunking might be handled differently
      // For now, use simple approach
      const chunks = this.chunkText(text, maxChunkSize, minChunkSize);
      const results: TTSQueueItem[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) {
          continue;
        }
        const result = await this.generateSpeech(chunk, true);

        // Skip if generation was cancelled (null result or empty audio)
        if (!result || !result.audio) {
          Logger.log(
            "TTSServiceProxy",
            `Chunk ${i + 1} generation cancelled or failed`,
          );
          continue;
        }

        // Validate audio data is not empty
        const audioSize = result.audio.byteLength;

        if (audioSize === 0) {
          Logger.log(
            "TTSServiceProxy",
            `Chunk ${i + 1} has empty audio data, skipping`,
          );
          continue;
        }

        // Convert ArrayBuffer to blob URL for playback
        const audioBlob = new Blob([result.audio], {
          type: result.mimeType || "audio/mpeg",
        });
        const audioUrl = URL.createObjectURL(audioBlob);

        Logger.log(
          "TTSServiceProxy",
          "Created audio blob URL:",
          audioUrl,
          "MIME:",
          result.mimeType,
        );

        // Push item in format expected by playAudioSequence
        results.push({
          text: chunk,
          audioUrl: audioUrl,
          bvmdUrl: result.bvmdUrl,
          sessionId: sessionId, // Attach session ID to each chunk
        });

        if (onChunkReady) {
          onChunkReady(chunk, audioUrl, result.bvmdUrl, i, chunks.length);
        }
      }

      return results;
    } else {
      return await this.directService.generateChunkedSpeech(
        text,
        onChunkReady,
        maxChunkSize,
        minChunkSize,
        sessionId,
      );
    }
  }

  /**
   * Get current audio queue length
   * Always use direct service in main world
   * @returns {number} Number of audio items in queue
   */
  getQueueLength(): number {
    return this.directService.getQueueLength();
  }

  /**
   * Check if audio is currently playing or queued
   * Always use direct service in main world
   * @returns {boolean} True if audio is active
   */
  isAudioActive(): boolean {
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
  queueAudio(
    text: string,
    audioUrl: string,
    bvmdUrl: string | null = null,
    sessionId: string | null = null,
  ): void {
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
  async playAudio(
    text: string,
    audioUrl: string,
    bvmdUrl: string | null = null,
  ): Promise<void> {
    return await this.directService.playAudio(text, audioUrl, bvmdUrl);
  }

  /**
   * Play audio chunks sequentially
   * Always use direct service in main world
   * @param {Array} items - Array of audio items
   * @param {string} sessionId - Session ID for this playback sequence
   * @returns {Promise<void>} Resolves when all audio finishes
   */
  async playAudioSequence(
    items: TTSQueueItem[],
    sessionId: string | null = null,
  ): Promise<void> {
    return await this.directService.playAudioSequence(items, sessionId);
  }

  /**
   * Stop current playback and clear queue
   * Extension mode: Notify background, also stop local queue
   * Dev mode: Just stop local service
   */
  async stopPlayback(): Promise<void> {
    // Always stop local direct service (handles queue in main world)
    this.directService.stopPlayback();

    if (this.isExtension) {
      // Also notify background to stop TTS generation
      const bridge = await this.waitForBridge();
      if (bridge) {
        bridge
          .sendMessage(MessageTypes.TTS_STOP_PLAYBACK, {})
          .catch((error: unknown) => {
            Logger.error("TTSServiceProxy", "Stop playback failed:", error);
          });
      }
    }

    // Trigger local callback
    if (this.stopCallback) {
      this.stopCallback();
    }
  }

  /**
   * Reset session flags to prepare for new TTS session
   * Ensures audioStart event will fire for the next session
   */
  resetSessionFlags(): void {
    this.directService.hasSessionStarted = false;
  }

  /**
   * Resume playback (clear stopped flag)
   * Extension mode: Notify background, also resume local queue
   * Dev mode: Just resume local service
   */
  async resumePlayback(): Promise<void> {
    // Always resume local direct service
    this.directService.resumePlayback();

    if (this.isExtension) {
      // Also notify background to resume TTS generation
      const bridge = await this.waitForBridge();
      if (bridge) {
        bridge
          .sendMessage(MessageTypes.TTS_RESUME_PLAYBACK, {})
          .catch((error: unknown) => {
            Logger.error("TTSServiceProxy", "Resume playback failed:", error);
          });
      }
    }
  }

  /**
   * Initialize Kokoro TTS model
   * @param {Function} progressCallback - Progress callback (progress) => {}
   * @returns {Promise<boolean>} Success status
   */
  async initializeKokoro(
    progressCallback: ((progress: unknown) => void) | null = null,
  ): Promise<boolean> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("TTSServiceProxy: Bridge not available");

      // Determine config source: use lastConfigured if available, otherwise load from storage
      let kokoroConfig: TTSProxyConfig["kokoro"] = {};
      if (this.lastConfigured && this.lastConfigured.kokoro) {
        Logger.log(
          "TTSServiceProxy",
          "Using lastConfigured for initialization:",
          this.lastConfigured.kokoro,
        );
        kokoroConfig = this.lastConfigured.kokoro;
      } else {
        Logger.log(
          "TTSServiceProxy",
          "Loading config from storage for initialization",
        );
        const { default: StorageServiceProxy } =
          await import("./StorageServiceProxy");
        const { DefaultTTSConfig } = await import("../../config/aiConfig");
        const config = (await StorageServiceProxy.configLoad(
          "ttsConfig",
          null,
        )) as TTSProxyConfig | null;
        kokoroConfig = config?.kokoro || {};
      }

      // Set up message listener for progress updates via bridge
      let progressListener: ((message: unknown) => void) | null = null;
      if (progressCallback) {
        progressListener = (message: unknown) => {
          const msg = message as { type?: string; data?: unknown };
          if (msg.type === MessageTypes.KOKORO_DOWNLOAD_PROGRESS && msg.data) {
            progressCallback(msg.data);
          }
        };
        bridge.addMessageListener?.(progressListener);
      }

      try {
        const response = (await bridge.sendMessage(
          MessageTypes.KOKORO_INIT,
          {
            modelId:
              kokoroConfig.modelId || "onnx-community/Kokoro-82M-v1.0-ONNX",
            device: kokoroConfig.device || "auto",
          },
          { timeout: 300000 }, // 5 minutes for model download
        )) as TTSBridgeResponse;
        return response.initialized === true;
      } finally {
        if (progressListener) {
          bridge.removeMessageListener?.(progressListener);
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
  async checkKokoroStatus(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("TTSServiceProxy: Bridge not available");

      const response = (await bridge.sendMessage(
        MessageTypes.KOKORO_CHECK_STATUS,
        {},
      )) as TTSBridgeResponse;
      return response;
    } else {
      return await this.directService.checkKokoroStatus();
    }
  }

  /**
   * List Kokoro voices
   * @returns {Promise<string[]>} Array of voice IDs
   */
  async listKokoroVoices(): Promise<string[]> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("TTSServiceProxy: Bridge not available");

      const response = (await bridge.sendMessage(
        MessageTypes.KOKORO_LIST_VOICES,
        {},
      )) as TTSBridgeResponse;
      return response.voices || [];
    } else {
      return await this.directService.listKokoroVoices();
    }
  }

  /**
   * Ping Kokoro to keep model loaded in memory (heartbeat)
   * Generates small audio without side effects
   * @returns {Promise<boolean>} True if model is alive
   */
  async pingKokoro(): Promise<boolean> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) return false;

      try {
        const response = (await bridge.sendMessage(
          MessageTypes.KOKORO_PING,
          {},
        )) as TTSBridgeResponse;
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
  async getKokoroCacheSize(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("TTSServiceProxy: Bridge not available");

      const response = (await bridge.sendMessage(
        MessageTypes.KOKORO_GET_CACHE_SIZE,
        {},
      )) as TTSBridgeResponse;
      return response;
    } else {
      return await this.directService.getKokoroCacheSize();
    }
  }

  /**
   * Clear Kokoro cache and reset model
   * @returns {Promise<boolean>} Success status
   */
  async clearKokoroCache(): Promise<boolean> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("TTSServiceProxy: Bridge not available");

      const response = (await bridge.sendMessage(
        MessageTypes.KOKORO_CLEAR_CACHE,
        {},
      )) as TTSBridgeResponse;
      return response.cleared === true;
    } else {
      return await this.directService.clearKokoroCache();
    }
  }

  /**
   * Clean up blob URLs
   * Always use direct service in main world
   * @param {string[]} urls - URLs to revoke
   */
  cleanupBlobUrls(urls: string[] | null = null): void {
    this.directService.cleanupBlobUrls(urls);
  }

  /**
   * Check if TTS is currently playing audio
   * Always use direct service in main world
   * @returns {boolean} True if audio is playing
   */
  isCurrentlyPlaying(): boolean {
    return this.directService.isCurrentlyPlaying();
  }

  /**
   * Test TTS with sample text
   * @param {string} testText - Text to test with
   * @returns {Promise<boolean>} True if successful
   */
  async testConnection(testText = "Hello, this is a test."): Promise<boolean> {
    try {
      const audioItems = await this.generateChunkedSpeech(testText);

      if (!audioItems || audioItems.length === 0) {
        throw new Error("No audio generated");
      }

      await this.playAudioSequence(audioItems, "test_connection");

      // Cleanup blob URLs
      const urls = audioItems.map((item) => item.audioUrl).filter(Boolean);
      this.cleanupBlobUrls(urls);

      return true;
    } catch (error: unknown) {
      Logger.error("TTSServiceProxy", "Test connection failed:", error);
      throw error;
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method: string, ...args: unknown[]): Promise<unknown> {
    const methodMap: Record<
      | "configure"
      | "generateSpeech"
      | "stopPlayback"
      | "resumePlayback"
      | "testConnection"
      | "initializeKokoro"
      | "checkKokoroStatus"
      | "listKokoroVoices",
      string
    > = {
      configure: MessageTypes.TTS_CONFIGURE,
      generateSpeech: MessageTypes.TTS_GENERATE_SPEECH,
      stopPlayback: MessageTypes.TTS_STOP_PLAYBACK,
      resumePlayback: MessageTypes.TTS_RESUME_PLAYBACK,
      testConnection: MessageTypes.TTS_TEST_CONNECTION,
      initializeKokoro: MessageTypes.KOKORO_INIT,
      checkKokoroStatus: MessageTypes.KOKORO_CHECK_STATUS,
      listKokoroVoices: MessageTypes.KOKORO_LIST_VOICES,
    };

    const messageType = methodMap[method as keyof typeof methodMap];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error("TTSServiceProxy: Bridge not available");
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method: string, ...args: unknown[]): Promise<unknown> {
    const candidateMethod = this.directService[method];
    if (typeof candidateMethod !== "function") {
      throw new Error(`Method ${method} not found on TTSService`);
    }

    return await (candidateMethod as (...params: unknown[]) => unknown)(
      ...args,
    );
  }
}

// Export singleton instance
const ttsServiceProxy = new TTSServiceProxy();
export default ttsServiceProxy;
