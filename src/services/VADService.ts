/**
 * VADService - Voice Activity Detection
 * Wraps @ricky0123/vad-web for production-quality voice detection
 * Currently configured to use Silero VAD v5 model
 */

import { MicVAD } from "@ricky0123/vad-web";
import { isDesktop, isEmbed, isExtension } from "../utils/PlatformUtils";
import MicrophoneService from "./MicrophoneService";
import Logger from "./LoggerService";

const ORT_WASM_MODULE_FILENAME = "ort-wasm-simd-threaded.mjs";
const ORT_WASM_BINARY_FILENAME = "ort-wasm-simd-threaded.wasm";

type OnnxWasmPathOverrides = {
  mjs: string;
  wasm: string;
};

type VADStartOptions = {
  onSpeechStart?: (() => void) | null;
  onSpeechRealStart?: (() => void) | null;
  onSpeechEnd?: ((audio: Float32Array) => void) | null;
  onError?: ((error: unknown) => void) | null;
  stream?: MediaStream;
};

class VADService {
  private vad: any;
  private isListening: boolean;
  private mediaStream: MediaStream | null;
  private onSpeechStart: (() => void) | null;
  private onSpeechRealStart: (() => void) | null;
  private onSpeechEnd: ((audio: Float32Array) => void) | null;
  private onError: ((error: unknown) => void) | null;

  constructor() {
    this.vad = null;
    this.isListening = false;
    this.mediaStream = null;

    // Callbacks
    this.onSpeechStart = null;
    this.onSpeechRealStart = null;
    this.onSpeechEnd = null;
    this.onError = null;
  }

  private async resolveExtensionAssetBasePath(): Promise<string> {
    try {
      const { extensionBridge } = await import("../utils/ExtensionBridge");
      const assetBasePath = await extensionBridge.getResourceURL("assets/");

      return assetBasePath.endsWith("/") ? assetBasePath : `${assetBasePath}/`;
    } catch (error) {
      Logger.warn(
        "VAD",
        "Failed to resolve extension asset base path, falling back to /assets/",
        error,
      );
      return "/assets/";
    }
  }

  private resolveEmbedAssetBasePath(): string {
    return new URL("./", import.meta.url).toString();
  }

  private resolveOnnxWasmPathOverrides(
    baseAssetPath: string,
  ): OnnxWasmPathOverrides {
    // ORT accepts explicit .mjs/.wasm URLs here. Using file overrides avoids
    // malformed requests like /assets/undefined when locateFile() receives no filename.
    return {
      mjs: `${baseAssetPath}${ORT_WASM_MODULE_FILENAME}`,
      wasm: `${baseAssetPath}${ORT_WASM_BINARY_FILENAME}`,
    };
  }

  /**
   * Initialize and start VAD
   * @param {Object} options - Configuration options
   * @param {Function} options.onSpeechStart - Called when speech is detected
   * @param {Function} options.onSpeechEnd - Called when speech ends
   * @param {Function} options.onError - Called on errors
   * @param {MediaStream} options.stream - Optional MediaStream (if not provided, will request mic access)
   */
  async start(options: VADStartOptions = {}): Promise<void> {
    if (this.isListening) {
      Logger.warn("VAD", "Already listening");
      return;
    }

    this.onSpeechStart = options.onSpeechStart || null;
    this.onSpeechRealStart = options.onSpeechRealStart || null;
    this.onSpeechEnd = options.onSpeechEnd || null;
    this.onError = options.onError || null;

    try {
      // Get media stream if not provided
      if (options.stream) {
        this.mediaStream = options.stream;
      } else {
        // Get audio constraints with selected microphone
        const constraints = MicrophoneService.getAudioConstraints();
        this.mediaStream =
          await navigator.mediaDevices.getUserMedia(constraints);
      }

      Logger.log("VAD", "Initializing VAD (Silero v5)...");

      const baseAssetPath = isExtension
        ? await this.resolveExtensionAssetBasePath()
        : isDesktop
          ? "app://./assets/"
          : isEmbed
            ? this.resolveEmbedAssetBasePath()
            : "/assets/";
      const onnxWasmPathOverrides =
        this.resolveOnnxWasmPathOverrides(baseAssetPath);

      Logger.log("VAD", "Resolved asset base path:", baseAssetPath);
      Logger.log("VAD", "Resolved ONNX wasm paths:", onnxWasmPathOverrides);

      // Initialize MicVAD with Silero v5 model
      this.vad = await MicVAD.new({
        // Override getStream to use our pre-configured stream with selected microphone
        getStream: async () => {
          if (!this.mediaStream) {
            throw new Error("Media stream unavailable");
          }
          return this.mediaStream;
        },

        // Explicitly specify v5 model (required!)
        model: "v5",

        // Base path where VAD will find: silero_vad_v5.onnx, vad.worklet.bundle.min.js, etc.
        baseAssetPath: baseAssetPath,

        // WASM files path for ONNX Runtime
        onnxWASMBasePath: onnxWasmPathOverrides as unknown as string,

        // ONNX Runtime configuration
        ortConfig: (ort: any) => {
          // Force web mode - disable Node.js fs even in Electron
          ort.env.wasm.numThreads = 1;
          ort.env.wasm.simd = true;

          // Disable Node.js binding - force browser/fetch mode
          ort.env.wasm.proxy = false;
        },

        // VAD parameters
        positiveSpeechThreshold: 0.8, // Higher = less sensitive (fewer false positives)
        negativeSpeechThreshold: 0.5, // Lower = more sensitive (catches speech better)
        redemptionMs: 300,
        preSpeechPadMs: 50,
        minSpeechMs: 120,

        // Callbacks
        onSpeechStart: () => {
          Logger.log("VAD", "Speech detection started");
          if (this.onSpeechStart) {
            this.onSpeechStart();
          }
        },

        onSpeechRealStart: () => {
          Logger.log("VAD", "Real human speech detected (above threshold)");
          if (this.onSpeechRealStart) {
            this.onSpeechRealStart();
          }
        },

        onSpeechEnd: (audio: Float32Array) => {
          Logger.log("VAD", "Speech ended");
          if (this.onSpeechEnd) {
            this.onSpeechEnd(audio);
          }
        },

        onVADMisfire: () => {
          Logger.log("VAD", "VAD misfire (false positive detected)");
        },
      });

      Logger.log("VAD", "Started successfully");
      this.isListening = true;

      // Start the VAD
      this.vad.start();
    } catch (error) {
      Logger.error("VAD", "Failed to start:", error);
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  /**
   * Stop the VAD and cleanup resources
   */
  async stop() {
    if (!this.isListening) {
      return;
    }

    Logger.log("VAD", "Stopping...");

    try {
      if (this.vad) {
        this.vad.pause();
        this.vad.destroy();
        this.vad = null;
      }

      if (this.mediaStream) {
        this.mediaStream
          .getTracks()
          .forEach((track: MediaStreamTrack) => track.stop());
        this.mediaStream = null;
      }

      this.isListening = false;
      Logger.log("VAD", "Stopped successfully");
    } catch (error) {
      Logger.error("VAD", "Error during stop:", error);
      throw error;
    }
  }

  /**
   * Pause the VAD without destroying it
   */
  pause(): void {
    if (this.vad && this.isListening) {
      Logger.log("VAD", "Pausing...");
      this.vad.pause();
    }
  }

  /**
   * Resume the VAD after pausing
   */
  resume(): void {
    if (this.vad && this.isListening) {
      Logger.log("VAD", "Resuming...");
      this.vad.start();
    }
  }

  /**
   * Get the current listening state
   * @returns {boolean}
   */
  getIsListening(): boolean {
    return this.isListening;
  }
}

export default new VADService();
