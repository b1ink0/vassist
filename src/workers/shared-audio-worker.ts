/**
 * Shared Audio Worker
 * Handles audio processing, VMD generation, and BVMD conversion in dev mode
 * Runs in SharedWorker context (no AudioContext available)
 * Also supports regular Worker context for Android WebView (SharedWorker not supported)
 * Main thread must decode audio and send PCM data
 */

import { MessageTypes } from "../../extension/shared/MessageTypes";
import { VMDGenerationCore } from "./shared/VMDGenerationCore";
import { BVMDConversionCore } from "./shared/BVMDConversionCore";
import KokoroTTSCore from "./shared/KokoroTTSCore";
import Logger from "../services/LoggerService";
import type { Scene } from "@babylonjs/core/scene";

interface IncomingWorkerMessage {
  type: string;
  requestId: string;
  data?: Record<string, unknown>;
}

interface WorkerSuccessResponse {
  type: string;
  requestId: string;
  data: unknown;
}

interface WorkerErrorResponse {
  type: string;
  requestId?: string;
  error: string;
}

interface SharedWorkerLikeScope {
  onconnect?: ((event: MessageEvent) => void) | null;
  onmessage?: ((event: MessageEvent<IncomingWorkerMessage>) => void) | null;
  postMessage: (message: unknown) => void;
  constructor: { name?: string };
}

const workerScope = self as unknown as SharedWorkerLikeScope;

class SharedAudioWorker {
  private name: string;
  private ports: Set<MessagePort>;
  private scene: Scene | null;
  private isReady: boolean;
  private isSharedWorker: boolean;
  private initPromise: Promise<void>;

  constructor() {
    this.name = "SharedAudioWorker";
    this.ports = new Set();
    this.scene = null; // Babylon scene for BVMD conversion
    this.isReady = false;
    this.isSharedWorker =
      typeof workerScope.onconnect !== "undefined" ||
      workerScope.constructor.name === "SharedWorkerGlobalScope";

    if (this.isSharedWorker) {
      // SharedWorker context: Register connection handler
      // CRITICAL: Must be set before any async operations or connections will be missed
      workerScope.onconnect = (event: MessageEvent) => {
        const eventWithPorts = event as MessageEvent & {
          ports?: MessagePort[];
        };
        const port = eventWithPorts.ports?.[0];
        if (!port) {
          return;
        }

        this.ports.add(port);

        Logger.log(
          "SharedAudioWorker",
          "New connection, total ports:",
          this.ports.size,
        );

        port.onmessage = async (
          portEvent: MessageEvent<IncomingWorkerMessage>,
        ) => {
          try {
            // Wait for initialization to complete before processing
            if (!this.isReady) {
              Logger.log("SharedAudioWorker", "Waiting for initialization...");
              await this.initPromise;
            }

            const response = await this.handleMessage(portEvent.data);
            port.postMessage(response);
          } catch (error: unknown) {
            Logger.error("SharedAudioWorker", "Error:", error);
            const errorResponse: WorkerErrorResponse = {
              type: MessageTypes.ERROR,
              requestId: portEvent.data?.requestId,
              error: SharedAudioWorker.getErrorMessage(error),
            };
            port.postMessage(errorResponse);
          }
        };

        port.start();
      };
    } else {
      // Regular Worker context (Android WebView): Use self.onmessage
      Logger.log(
        "SharedAudioWorker",
        "Running as regular Worker (Android mode)",
      );

      workerScope.onmessage = async (
        event: MessageEvent<IncomingWorkerMessage>,
      ) => {
        try {
          // Wait for initialization to complete before processing
          if (!this.isReady) {
            Logger.log("SharedAudioWorker", "Waiting for initialization...");
            await this.initPromise;
          }

          const response = await this.handleMessage(event.data);
          workerScope.postMessage(response);
        } catch (error: unknown) {
          Logger.error("SharedAudioWorker", "Error:", error);
          const errorResponse: WorkerErrorResponse = {
            type: MessageTypes.ERROR,
            requestId: event.data?.requestId,
            error: SharedAudioWorker.getErrorMessage(error),
          };
          workerScope.postMessage(errorResponse);
        }
      };
    }

    // Start async initialization
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    Logger.log("SharedAudioWorker", "Initializing...");

    // Try to create Babylon scene for BVMD conversion
    try {
      this.scene = await BVMDConversionCore.createWorkerScene();
      if (this.scene) {
        Logger.log("SharedAudioWorker", "BVMD conversion available");
      } else {
        Logger.warn(
          "SharedAudioWorker",
          "BVMD conversion not available, will fallback to main thread",
        );
      }
    } catch (error: unknown) {
      Logger.error(
        "SharedAudioWorker",
        "Failed to initialize BVMD converter:",
        error,
      );
    }

    this.isReady = true;
    Logger.log("SharedAudioWorker", "Ready");
  }

  private async handleMessage(
    message: IncomingWorkerMessage,
  ): Promise<WorkerSuccessResponse> {
    const { type, requestId } = message;

    Logger.log("SharedAudioWorker", `Received ${type}, request ${requestId}`);

    let data: unknown;

    switch (type) {
      case MessageTypes.KOKORO_INIT:
        data = await this.handleKokoroInit(message);
        break;
      case MessageTypes.KOKORO_GENERATE:
        data = await this.handleKokoroGenerate(message);
        break;
      case MessageTypes.KOKORO_CHECK_STATUS:
        data = await this.handleKokoroCheckStatus();
        break;
      case MessageTypes.KOKORO_LIST_VOICES:
        data = await this.handleKokoroListVoices();
        break;
      case MessageTypes.KOKORO_PING:
        data = await this.handleKokoroPing();
        break;
      case MessageTypes.KOKORO_GET_CACHE_SIZE:
        data = await this.handleKokoroGetCacheSize();
        break;
      case MessageTypes.KOKORO_CLEAR_CACHE:
        data = await this.handleKoroClearCache();
        break;
      case MessageTypes.TTS_PROCESS_AUDIO_WITH_LIPSYNC:
        data = await this.handleProcessAudioWithLipSync(message);
        break;
      case MessageTypes.OFFSCREEN_VMD_GENERATE:
        data = await this.handleVMDGenerate(message);
        break;
      case MessageTypes.OFFSCREEN_AUDIO_PROCESS:
        data = await this.handleAudioProcess(message);
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    Logger.log(
      "SharedAudioWorker",
      `Handler completed, returning response for ${requestId}`,
    );

    return {
      type: MessageTypes.SUCCESS,
      requestId,
      data,
    };
  }

  /**
   * Handle audio processing with lip sync generation
   */
  private async handleProcessAudioWithLipSync(
    message: IncomingWorkerMessage,
  ): Promise<Record<string, unknown>> {
    const payload = message.data || {};
    const audioDataInput = payload.audioData;
    const sampleRate =
      typeof payload.sampleRate === "number" ? payload.sampleRate : 24000;
    const originalAudioBuffer = payload.originalAudioBuffer;

    try {
      const pcmData = SharedAudioWorker.toFloat32Array(audioDataInput);
      const originalAudioBytes =
        SharedAudioWorker.toByteArray(originalAudioBuffer);

      Logger.log(
        "SharedAudioWorker",
        `Processing audio: ${pcmData.length} samples @ ${sampleRate}Hz`,
      );

      // Step 1: Generate VMD from PCM
      const vmdData = await VMDGenerationCore.generateVMDFromPCM(
        pcmData,
        sampleRate,
      );

      // Step 2: Convert VMD to BVMD
      let bvmdArrayBuffer: ArrayBuffer;
      if (this.scene) {
        // Convert in worker
        bvmdArrayBuffer = await BVMDConversionCore.convertVMDToBVMD(
          vmdData,
          this.scene,
        );
      } else {
        // Return VMD and signal main thread to convert
        Logger.warn(
          "SharedAudioWorker",
          "BVMD conversion not available, returning VMD for main thread conversion",
        );
        return {
          audioBuffer: Array.from(originalAudioBytes),
          vmdData: Array.from(new Uint8Array(vmdData)),
          bvmdData: null, // Signal that main thread should convert
          needsBVMDConversion: true,
        };
      }

      // Step 3: Return both audio and BVMD as Arrays (survive message passing)
      return {
        audioBuffer: Array.from(originalAudioBytes),
        bvmdData: Array.from(new Uint8Array(bvmdArrayBuffer)),
      };
    } catch (error: unknown) {
      Logger.error("SharedAudioWorker", "Processing failed:", error);

      // Return audio without lip sync on error
      const originalAudioBytes =
        SharedAudioWorker.toByteArray(originalAudioBuffer);
      return {
        audioBuffer: Array.from(originalAudioBytes),
        bvmdData: null,
      };
    }
  }

  /**
   * Handle VMD generation
   */
  private async handleVMDGenerate(
    message: IncomingWorkerMessage,
  ): Promise<Record<string, unknown>> {
    const payload = message.data || {};
    const audioDataInput = payload.audioData;
    const sampleRate =
      typeof payload.sampleRate === "number" ? payload.sampleRate : 24000;
    const modelName =
      typeof payload.modelName === "string" ? payload.modelName : "Model";

    Logger.log("SharedAudioWorker", "Generating VMD from PCM...");

    try {
      const pcmData = SharedAudioWorker.toFloat32Array(audioDataInput);

      // Generate VMD using core
      const vmdData = await VMDGenerationCore.generateVMDFromPCM(
        pcmData,
        sampleRate,
        modelName,
      );

      Logger.log(
        "SharedAudioWorker",
        `VMD generated: ${vmdData.byteLength} bytes`,
      );

      return {
        vmdData,
        modelName,
      };
    } catch (error: unknown) {
      Logger.error("SharedAudioWorker", "VMD generation failed:", error);
      throw error;
    }
  }

  /**
   * Handle Kokoro TTS initialization
   */
  private async handleKokoroInit(
    message: IncomingWorkerMessage,
  ): Promise<Record<string, unknown>> {
    const payload = message.data || {};
    const modelId =
      typeof payload.modelId === "string"
        ? payload.modelId
        : "onnx-community/Kokoro-82M-v1.0-ONNX";
    const device = (
      typeof payload.device === "string" ? payload.device : "wasm"
    ) as "auto" | "webgpu" | "wasm";

    try {
      Logger.log("SharedAudioWorker", "Initializing Kokoro TTS...", {
        modelId,
        device,
      });

      // Pass config directly to KokoroTTSCore - it handles device/dtype mapping internally
      const initialized = await KokoroTTSCore.initialize(
        { modelId, device },
        (progress) => {
          // Send progress update to all connected ports
          const progressMessage = {
            type: MessageTypes.KOKORO_DOWNLOAD_PROGRESS,
            requestId: message.requestId,
            data: {
              loaded: progress.loaded,
              total: progress.total,
              percent: progress.percent,
              file: progress.file,
            },
          };

          // Broadcast progress to all listeners
          if (this.isSharedWorker) {
            // SharedWorker: broadcast to all ports
            for (const port of this.ports) {
              port.postMessage(progressMessage);
            }
          } else {
            // Regular Worker: post to main thread
            workerScope.postMessage(progressMessage);
          }
        },
      );

      return {
        initialized,
        message: initialized
          ? "Kokoro TTS initialized successfully"
          : "Initialization failed",
      };
    } catch (error: unknown) {
      Logger.error("SharedAudioWorker", "Kokoro initialization failed:", error);
      throw new Error(
        `Kokoro initialization failed: ${SharedAudioWorker.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Handle Kokoro speech generation
   */
  private async handleKokoroGenerate(
    message: IncomingWorkerMessage,
  ): Promise<Record<string, unknown>> {
    const payload = message.data || {};
    const text = typeof payload.text === "string" ? payload.text : "";
    const voice =
      typeof payload.voice === "string" ? payload.voice : "af_heart";
    const speed = typeof payload.speed === "number" ? payload.speed : 1.0;

    try {
      // Validate text parameter
      if (!text.trim()) {
        throw new Error(
          `Invalid text parameter: ${JSON.stringify(payload.text)}`,
        );
      }

      Logger.log(
        "SharedAudioWorker",
        `Generating Kokoro speech for: "${text.substring(0, 50)}..."`,
      );

      // Generate audio using KokoroTTSCore
      const audioBuffer = await KokoroTTSCore.generate(text, { voice, speed });

      // Return as Array (ArrayBuffer doesn't transfer well via postMessage)
      return {
        audioBuffer: Array.from(new Uint8Array(audioBuffer)),
        duration: audioBuffer.byteLength / (24000 * 2), // Approximate duration (24kHz, 16-bit)
        sampleRate: 24000,
      };
    } catch (error: unknown) {
      Logger.error("SharedAudioWorker", "Kokoro generation failed:", error);
      throw new Error(
        `Kokoro generation failed: ${SharedAudioWorker.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Handle Kokoro status check
   */
  private async handleKokoroCheckStatus(): Promise<Record<string, unknown>> {
    try {
      return KokoroTTSCore.getStatus() as unknown as Record<string, unknown>;
    } catch (error: unknown) {
      Logger.error("SharedAudioWorker", "Kokoro status check failed:", error);
      throw new Error(
        `Kokoro status check failed: ${SharedAudioWorker.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Handle Kokoro voice list
   */
  private async handleKokoroListVoices(): Promise<{ voices: string[] }> {
    try {
      const voices = await KokoroTTSCore.listVoices();
      return { voices };
    } catch (error: unknown) {
      Logger.error("SharedAudioWorker", "Kokoro list voices failed:", error);
      throw new Error(
        `Failed to list voices: ${SharedAudioWorker.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Handle Kokoro ping
   */
  private async handleKokoroPing(): Promise<{ alive: boolean }> {
    try {
      const alive = await KokoroTTSCore.ping();
      return { alive };
    } catch {
      // Silent failure for heartbeat
      return { alive: false };
    }
  }

  /**
   * Handle Kokoro cache size check
   */
  private async handleKokoroGetCacheSize(): Promise<Record<string, unknown>> {
    try {
      return (await KokoroTTSCore.getCacheSize()) as unknown as Record<
        string,
        unknown
      >;
    } catch (error: unknown) {
      Logger.error(
        "SharedAudioWorker",
        "Kokoro cache size check failed:",
        error,
      );
      throw new Error(
        `Failed to get cache size: ${SharedAudioWorker.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Handle Kokoro cache clear
   */
  private async handleKoroClearCache(): Promise<{ cleared: boolean }> {
    try {
      await KokoroTTSCore.clearCache();
      return { cleared: true };
    } catch (error: unknown) {
      Logger.error("SharedAudioWorker", "Kokoro cache clear failed:", error);
      throw new Error(
        `Failed to clear cache: ${SharedAudioWorker.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Handle audio processing (spectrogram, frequency analysis)
   */
  private async handleAudioProcess(
    message: IncomingWorkerMessage,
  ): Promise<Record<string, number>> {
    const payload = message.data || {};
    const sampleRate =
      typeof payload.sampleRate === "number" ? payload.sampleRate : 24000;
    const pcmData = SharedAudioWorker.toFloat32Array(payload.audioData);

    try {
      const duration = pcmData.length / sampleRate;

      // Compute spectrogram if requested
      const frameRate = 30; // VMD uses 30 fps
      const { AudioProcessingCore } =
        await import("./shared/AudioProcessingCore");
      const spectrogram = await AudioProcessingCore.computeSpectrogram(
        pcmData,
        sampleRate,
        frameRate,
      );

      return {
        sampleRate,
        duration,
        samples: pcmData.length,
        spectrogramFrames: spectrogram.data.length,
      };
    } catch (error: unknown) {
      Logger.error("SharedAudioWorker", "Audio processing failed:", error);
      throw error;
    }
  }

  private static toFloat32Array(input: unknown): Float32Array {
    if (input instanceof Float32Array) {
      return input;
    }

    if (Array.isArray(input)) {
      return new Float32Array(input as number[]);
    }

    throw new Error(
      "Invalid audio data payload; expected Float32Array or number[]",
    );
  }

  private static toByteArray(input: unknown): Uint8Array {
    if (input instanceof Uint8Array) {
      return input;
    }

    if (input instanceof ArrayBuffer) {
      return new Uint8Array(input);
    }

    if (Array.isArray(input)) {
      return new Uint8Array(input as number[]);
    }

    throw new Error(
      "Invalid byte payload; expected Uint8Array, ArrayBuffer, or number[]",
    );
  }

  private static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    return String(error);
  }
}

// Initialize worker
new SharedAudioWorker();
