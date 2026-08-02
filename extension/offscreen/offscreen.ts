/**
 * Offscreen Document Worker
 * Handles heavy audio processing and VMD generation
 * Runs in separate context with AudioContext access
 */

/* global chrome */

import { MessageTypes } from "../shared/MessageTypes";
import { VMDGenerationCore } from "../../src/workers/shared/VMDGenerationCore";
import { BVMDConversionCore } from "../../src/workers/shared/BVMDConversionCore";
import { Scene } from "@babylonjs/core/scene";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// Configure the transformers runtime bundled inside kokoro-js. Configuring a
// separately imported @huggingface/transformers instance does not affect
// Kokoro's runtime and leaves it trying to load ONNX Runtime from a CDN.
import { env as kokoroEnv } from "kokoro-js";
kokoroEnv.wasmPaths = chrome.runtime.getURL("assets/");
Logger.log(
  "Offscreen",
  "Configured Kokoro to use packaged WASM files from:",
  chrome.runtime.getURL("assets/"),
);

import KokoroTTSCore from "../../src/workers/shared/KokoroTTSCore";
import Logger from "../../src/services/LoggerService";

type MessageValue = string | number | boolean | null | undefined | object;
type WorkerData = Record<string, MessageValue>;

interface WorkerMessage {
  type: string;
  requestId?: string;
  target?: string;
  data: WorkerData;
}

type WorkerHandler = (
  message: WorkerMessage,
  sender: chrome.runtime.MessageSender,
) => Promise<WorkerData | object>;

const errorMessage = (error: object | string | null | undefined): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "Unknown error");
};

const asString = (value: MessageValue, fallback = ""): string => {
  return typeof value === "string" ? value : fallback;
};

class OffscreenWorker {
  name: string;
  audioContext: AudioContext | null;
  messageHandlers: Map<string, WorkerHandler>;
  scene: Scene | null;

  constructor() {
    this.name = "OffscreenWorker";
    this.audioContext = null;
    this.messageHandlers = new Map();

    // Babylon scene for BVMD conversion (using shared core)
    this.scene = null;

    this.init();
  }

  private requireAudioContext(): AudioContext {
    if (!this.audioContext) {
      throw new Error("AudioContext not initialized");
    }
    return this.audioContext;
  }

  private requireScene(): Scene {
    if (!this.scene) {
      throw new Error("BVMD scene not initialized");
    }
    return this.scene;
  }

  async init(): Promise<void> {
    Logger.log("OffscreenWorker", "Initializing...");

    // Initialize AudioContext (offscreen has access to AudioContext for best performance)
    this.audioContext = new AudioContext();
    Logger.log("OffscreenWorker", "AudioContext initialized");

    // Initialize minimal Babylon scene for BVMD conversion
    try {
      Logger.log(
        "OffscreenWorker",
        "Creating NullEngine for BVMD conversion...",
      );
      const engine = new NullEngine();
      this.scene = new Scene(engine);
      Logger.log("OffscreenWorker", "BVMD converter initialized");
    } catch (error) {
      Logger.error(
        "OffscreenWorker",
        "Failed to initialize BVMD converter:",
        error,
      );
    }

    // Set up message handlers
    this.registerHandlers();

    // Listen for messages
    chrome.runtime.onMessage.addListener(
      (
        message: WorkerMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse,
      ) => {
        // CRITICAL: ONLY handle messages explicitly targeted to offscreen
        // Reject ALL messages without target or with different target
        if (!message.target || message.target !== "offscreen") {
          // Not for us, ignore silently (no response)
          return false;
        }

        this.handleMessage(message, sender)
          .then(sendResponse)
          .catch((error) => {
            Logger.error("OffscreenWorker", "Error:", error);
            sendResponse({
              type: MessageTypes.ERROR,
              requestId: message.requestId,
              error: errorMessage(error),
            });
          });
        return true;
      },
    );

    Logger.log(
      "OffscreenWorker",
      "Ready with AudioContext:",
      this.audioContext.state,
    );
  }

  /**
   * Register message handlers
   */
  registerHandlers(): void {
    this.messageHandlers.set(
      MessageTypes.KOKORO_INIT,
      this.handleKokoroInit.bind(this),
    );
    this.messageHandlers.set(
      MessageTypes.KOKORO_GENERATE,
      this.handleKokoroGenerate.bind(this),
    );
    this.messageHandlers.set(
      MessageTypes.KOKORO_CHECK_STATUS,
      this.handleKokoroCheckStatus.bind(this),
    );
    this.messageHandlers.set(
      MessageTypes.KOKORO_LIST_VOICES,
      this.handleKokoroListVoices.bind(this),
    );
    this.messageHandlers.set(
      MessageTypes.KOKORO_PING,
      this.handleKokoroPing.bind(this),
    );
    this.messageHandlers.set(
      MessageTypes.KOKORO_GET_CACHE_SIZE,
      this.handleKokoroGetCacheSize.bind(this),
    );
    this.messageHandlers.set(
      MessageTypes.KOKORO_CLEAR_CACHE,
      this.handleKokoroClearCache.bind(this),
    );
    this.messageHandlers.set(
      MessageTypes.OFFSCREEN_AUDIO_PROCESS,
      this.handleAudioProcess.bind(this),
    );
    this.messageHandlers.set(
      MessageTypes.OFFSCREEN_VMD_GENERATE,
      this.handleVMDGenerate.bind(this),
    );
    this.messageHandlers.set(
      MessageTypes.TTS_PROCESS_AUDIO_WITH_LIPSYNC,
      this.handleProcessAudioWithLipSync.bind(this),
    );
  }

  /**
   * Handle incoming message
   */
  async handleMessage(
    message: WorkerMessage,
    sender: chrome.runtime.MessageSender,
  ): Promise<{ type: string; requestId?: string; data: WorkerData } | void> {
    const { type, requestId } = message;

    Logger.log("OffscreenWorker", `Received ${type}, request ${requestId}`);

    // Only handle messages intended for offscreen
    // Ignore messages for background/content scripts
    const handler = this.messageHandlers.get(type);
    if (!handler) {
      // Not an error - just not for us
      Logger.log(
        "OffscreenWorker",
        `Ignoring message type: ${type} (not for offscreen)`,
      );
      return; // Return undefined (no response needed)
    }

    const data = await handler(message, sender);

    Logger.log(
      "OffscreenWorker",
      `Handler completed for ${requestId}, data:`,
      JSON.stringify(data),
    );

    const response = {
      type: MessageTypes.SUCCESS,
      ...(requestId ? { requestId } : {}),
      data: data as WorkerData,
    };

    return response;
  }

  /**
   * Handle audio processing with lip sync generation
   * This is the main handler for TTS audio processing in extension mode
   * Input: { audioBuffer: Array }
   * Output: { audioBuffer: Array, bvmdData: Array }
   *
   * Uses shared cores for processing while keeping AudioContext decoding in offscreen for best performance
   */
  async handleProcessAudioWithLipSync(
    message: WorkerMessage,
  ): Promise<WorkerData> {
    const { audioBuffer } = message.data;

    try {
      // Convert Array to ArrayBuffer
      // Background sends us an Array (survives structured clone)
      let actualArrayBuffer;
      if (Array.isArray(audioBuffer)) {
        const uint8Array = new Uint8Array(audioBuffer);
        actualArrayBuffer = uint8Array.buffer;
      } else if (audioBuffer instanceof ArrayBuffer) {
        actualArrayBuffer = audioBuffer;
      } else {
        throw new Error("Invalid audioBuffer type: " + typeof audioBuffer);
      }

      // CRITICAL: Clone ArrayBuffer before decoding
      // decodeAudioData may detach the ArrayBuffer in some browsers
      // We need to keep the original for returning, so we clone it first
      const audioBufferClone = actualArrayBuffer.slice(0);

      // Step 1: Decode audio using AudioContext (offscreen has access to AudioContext)
      const decodedAudio =
        await this.requireAudioContext().decodeAudioData(audioBufferClone);
      const audioData = decodedAudio.getChannelData(0); // Use first channel (mono)
      const sampleRate = decodedAudio.sampleRate;

      Logger.log(
        "OffscreenWorker",
        `Audio decoded: ${decodedAudio.duration.toFixed(2)}s @ ${sampleRate}Hz`,
      );

      // Step 2: Generate VMD from PCM using shared core
      const vmdData = await VMDGenerationCore.generateVMDFromPCM(
        audioData,
        sampleRate,
      );

      // Step 3: Convert VMD to BVMD using shared core
      const bvmdArrayBuffer = await BVMDConversionCore.convertVMDToBVMD(
        vmdData,
        this.requireScene(),
      );

      // Step 4: Return both audio and BVMD as Arrays (survive message passing)
      return {
        audioBuffer: Array.from(new Uint8Array(actualArrayBuffer)),
        bvmdData: Array.from(new Uint8Array(bvmdArrayBuffer)),
      };
    } catch (error) {
      Logger.error("OffscreenWorker", "Processing failed:", error);
      Logger.error(
        "OffscreenWorker",
        "Error details:",
        errorMessage(error instanceof Error ? error : String(error)),
      );
      // Return audio without lip sync on error
      let errorArray = audioBuffer;
      if (!Array.isArray(audioBuffer)) {
        errorArray = Array.from(new Uint8Array(audioBuffer as ArrayBuffer));
      }
      return {
        audioBuffer: errorArray,
        bvmdData: null,
      };
    }
  }

  /**
   * Handle Kokoro TTS initialization
   */
  async handleKokoroInit(message: WorkerMessage): Promise<WorkerData> {
    Logger.log(
      "OffscreenWorker",
      "handleKokoroInit received message:",
      JSON.stringify(message, null, 2),
    );

    const { modelId, device } = message.data || {};

    try {
      Logger.log("OffscreenWorker", "Initializing Kokoro TTS...", {
        modelId,
        device,
      });

      // Pass config directly to KokoroTTSCore - it handles device/dtype mapping internally
      const initialized = await KokoroTTSCore.initialize(
        {
          modelId:
            typeof modelId === "string"
              ? modelId
              : "onnx-community/Kokoro-82M-v1.0-ONNX",
          device: (typeof device === "string" ? device : "auto") as
            | "wasm"
            | "webgpu"
            | "auto",
        },
        (progress) => {
          // Send progress update to background
          chrome.runtime.sendMessage({
            type: MessageTypes.KOKORO_DOWNLOAD_PROGRESS,
            requestId: message.requestId,
            data: {
              loaded: progress.loaded,
              total: progress.total,
              percent: progress.percent,
              file: progress.file,
            },
          });
        },
      );

      return {
        initialized,
        message: initialized
          ? "Kokoro TTS initialized successfully"
          : "Initialization failed",
      };
    } catch (error) {
      Logger.error("OffscreenWorker", "Kokoro initialization failed:", error);
      throw new Error(
        `Kokoro initialization failed: ${errorMessage(error instanceof Error ? error : String(error))}`,
      );
    }
  }

  /**
   * Handle Kokoro speech generation
   */
  async handleKokoroGenerate(message: WorkerMessage): Promise<WorkerData> {
    const { text, voice, speed } = message.data;

    try {
      const safeText = typeof text === "string" ? text : "";
      Logger.log(
        "OffscreenWorker",
        `Generating Kokoro speech for: "${safeText.substring(0, 50)}..."`,
      );

      // Generate audio using KokoroTTSCore
      const audioBuffer = await KokoroTTSCore.generate(safeText, {
        voice: typeof voice === "string" ? voice : "af_bella",
        speed: typeof speed === "number" ? speed : 1.0,
      });

      Logger.log(
        "OffscreenWorker",
        "Generated audio buffer: ${audioBuffer.byteLength} bytes",
      );

      // Convert to Array for transfer
      const audioArray = Array.from(new Uint8Array(audioBuffer));

      // Return as Array (ArrayBuffer doesn't transfer well via postMessage in Chrome extensions)
      return {
        audioBuffer: audioArray,
        duration: audioBuffer.byteLength / (24000 * 2), // Approximate duration (24kHz, 16-bit)
        sampleRate: 24000,
      };
    } catch (error) {
      Logger.error("OffscreenWorker", "Kokoro generation failed:", error);
      throw new Error(
        `Kokoro generation failed: ${errorMessage(error instanceof Error ? error : String(error))}`,
      );
    }
  }

  /**
   * Handle Kokoro status check
   */
  async handleKokoroCheckStatus(): Promise<object> {
    try {
      const status = KokoroTTSCore.getStatus();
      Logger.log("OffscreenWorker", "Kokoro status:", JSON.stringify(status));
      return status;
    } catch (error) {
      Logger.error("OffscreenWorker", "Kokoro status check failed:", error);
      throw new Error(
        `Kokoro status check failed: ${errorMessage(error instanceof Error ? error : String(error))}`,
      );
    }
  }

  /**
   * Handle Kokoro voice list
   */
  async handleKokoroListVoices(): Promise<object> {
    try {
      const voices = await KokoroTTSCore.listVoices();
      return { voices };
    } catch (error) {
      Logger.error("OffscreenWorker", "Kokoro list voices failed:", error);
      throw new Error(
        `Failed to list voices: ${errorMessage(error instanceof Error ? error : String(error))}`,
      );
    }
  }

  /**
   * Handle Kokoro ping (heartbeat)
   * Generates small audio to keep model in memory
   */
  async handleKokoroPing(message: WorkerMessage): Promise<object> {
    try {
      // Check if initialized first
      const status = KokoroTTSCore.getStatus();
      if (!status.initialized) {
        return { alive: false };
      }

      // Get voice and speed from message data (passed from background)
      const { voiceId = "af_heart", speed = 1.0 } = message.data || {};
      const safeVoiceId = typeof voiceId === "string" ? voiceId : "af_heart";
      const safeSpeed = typeof speed === "number" ? speed : 1.0;

      // Generate one word to keep model alive (use configured voice)
      await KokoroTTSCore.generate("hi", {
        voice: safeVoiceId,
        speed: safeSpeed,
      });

      return { alive: true };
    } catch {
      // Silent failure for heartbeat
      return { alive: false };
    }
  }

  /**
   * Handle Kokoro cache size check
   */
  async handleKokoroGetCacheSize(): Promise<object> {
    try {
      const sizeInfo = await KokoroTTSCore.getCacheSize();
      Logger.log("OffscreenWorker", "Kokoro cache size:", sizeInfo);
      return sizeInfo;
    } catch (error) {
      Logger.error("OffscreenWorker", "Kokoro get cache size failed:", error);
      throw new Error(
        `Failed to get cache size: ${errorMessage(error instanceof Error ? error : String(error))}`,
      );
    }
  }

  /**
   * Handle Kokoro cache clear
   */
  async handleKokoroClearCache(): Promise<object> {
    try {
      await KokoroTTSCore.clearCache();
      return { cleared: true };
    } catch (error) {
      Logger.error("OffscreenWorker", "Kokoro clear cache failed:", error);
      throw new Error(
        `Failed to clear cache: ${errorMessage(error instanceof Error ? error : String(error))}`,
      );
    }
  }

  /**
   * Handle audio processing (spectrogram, frequency analysis)
   */
  async handleAudioProcess(message: WorkerMessage): Promise<object> {
    const { audioBlob } = message.data;

    try {
      // Decode audio using AudioContext
      const arrayBuffer = await (audioBlob as Blob).arrayBuffer();
      const decodedAudio =
        await this.requireAudioContext().decodeAudioData(arrayBuffer);

      // Extract audio data
      const audioData = decodedAudio.getChannelData(0);
      const sampleRate = decodedAudio.sampleRate;
      const duration = decodedAudio.duration;

      // Compute spectrogram using shared core
      const frameRate = 30; // VMD uses 30 fps
      const { AudioProcessingCore } =
        await import("../../src/workers/shared/AudioProcessingCore");
      const spectrogram = await AudioProcessingCore.computeSpectrogram(
        audioData,
        sampleRate,
        frameRate,
      );

      return {
        sampleRate,
        duration,
        samples: audioData.length,
        spectrogramFrames: spectrogram.data.length,
      };
    } catch (error) {
      Logger.error("OffscreenWorker", "Audio processing failed:", error);
      throw error;
    }
  }

  /**
   * Handle VMD generation
   */
  async handleVMDGenerate(message: WorkerMessage): Promise<object> {
    const { audioBuffer, modelName } = message.data;

    Logger.log("OffscreenWorker", "Generating VMD from audio...");

    try {
      // Decode audio using AudioContext
      const decodedAudio = await this.requireAudioContext().decodeAudioData(
        audioBuffer as ArrayBuffer,
      );
      const audioData = decodedAudio.getChannelData(0);
      const sampleRate = decodedAudio.sampleRate;

      // Generate VMD using shared core
      const vmdData = await VMDGenerationCore.generateVMDFromPCM(
        audioData,
        sampleRate,
        asString(modelName),
      );

      Logger.log(
        "OffscreenWorker",
        "VMD generated: ${vmdData.byteLength} bytes",
      );

      return {
        vmdData,
        modelName: modelName || "Model",
      };
    } catch (error) {
      Logger.error("OffscreenWorker", "VMD generation failed:", error);
      throw error;
    }
  }
}

// Initialize worker
new OffscreenWorker();
