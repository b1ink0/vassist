/**
 * STT Service Proxy
 * Dual-mode wrapper for STTService
 * Dev mode: Direct recording + transcription
 * Extension mode: Content captures audio, offscreen processes, background transcribes
 */

import { ServiceProxy } from "./ServiceProxy";
import STTService from "../STTService";
import { MessageTypes } from "../../../extension/shared/MessageTypes";
import Logger from "../LoggerService";
import StorageServiceProxy from "./StorageServiceProxy";
import { DefaultSTTConfig } from "../../config/aiConfig";
import MicrophoneService from "../MicrophoneService";

interface STTProxyConfig {
  enabled?: boolean;
  [key: string]: unknown;
}

interface STTBridgeResponse {
  configured?: boolean;
  text?: string;
  [key: string]: unknown;
}

interface STTServiceLike {
  configure(config: Record<string, unknown>): Promise<unknown> | unknown;
  isConfigured(): boolean;
  isCurrentlyRecording(): boolean;
  startRecording(deviceId?: string | null): Promise<boolean>;
  stopRecording(): void;
  transcribeAudio(audioBlob: Blob): Promise<string>;
  testRecording(duration?: number, deviceId?: string | null): Promise<string>;
  setTranscriptionCallback(callback: (text: string) => void): void;
  setErrorCallback(callback: (error: unknown) => void): void;
  setRecordingStartCallback(callback: () => void): void;
  setRecordingStopCallback(callback: () => void): void;
  [method: string]: unknown;
}

class STTServiceProxy extends ServiceProxy {
  protected directService: STTServiceLike;
  protected _configuring: boolean;
  private audioStream: MediaStream | null;
  private mediaRecorder: MediaRecorder | null;
  private audioChunks: Blob[];
  private _isRecording: boolean;
  private onTranscription: ((text: string) => void) | null;
  private onError: ((error: unknown) => void) | null;
  private onRecordingStart: (() => void) | null;
  private onRecordingStop: (() => void) | null;

  constructor() {
    super("STTService");
    this.directService = STTService as unknown as STTServiceLike;
    this._configuring = false;
    this.audioStream = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this._isRecording = false;
    this.onTranscription = null;
    this.onError = null;
    this.onRecordingStart = null;
    this.onRecordingStop = null;
  }

  private isUsingBridgeTranscription(): boolean {
    return this.isExtension || !!this.getHostTransportBridge()?.stt;
  }

  private async transcribeCapturedAudio(
    audioData: number[],
    mimeType: string,
  ): Promise<string> {
    const hostBridge = this.getHostTransportBridge()?.stt;
    if (hostBridge) {
      return await hostBridge.transcribeAudio({
        audio: audioData,
        mimeType,
      });
    }

    const bridge = await this.waitForBridge();
    if (!bridge) {
      throw new Error("STTServiceProxy: Bridge not available");
    }

    const response = (await bridge.sendMessage(
      MessageTypes.STT_TRANSCRIBE_AUDIO,
      { audioBuffer: audioData, mimeType },
      { timeout: 60000 },
    )) as STTBridgeResponse;

    return response.text || "";
  }

  /**
   * Ensure service is configured (auto-loads from storage if needed)
   * @returns {Promise<void>}
   */
  async ensureConfigured(): Promise<void> {
    if (this._configuring) return;

    if (this.getHostTransportBridge()?.stt) {
      return;
    }

    const configured = await this.isConfigured();
    if (configured) return;

    this._configuring = true;
    try {
      const storedConfig = (await StorageServiceProxy.configLoad(
        "sttConfig",
        null,
      )) as STTProxyConfig | null;
      const sttConfig =
        storedConfig ?? (DefaultSTTConfig as unknown as STTProxyConfig);

      if (sttConfig && sttConfig.enabled) {
        Logger.log("STTServiceProxy", "Auto-configuring from storage...");
        await this.configure(sttConfig);
      }
    } finally {
      this._configuring = false;
    }
  }

  /**
   * Configure STT client with provider settings
   * @param {Object} config - STT configuration
   */
  async configure(config: Record<string, unknown>): Promise<boolean> {
    const hostBridge = this.getHostTransportBridge()?.stt;
    if (hostBridge) {
      await hostBridge.configure?.(config);
      return true;
    }

    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("STTServiceProxy: Bridge not available");
      const response = (await bridge.sendMessage(MessageTypes.STT_CONFIGURE, {
        config,
      })) as STTBridgeResponse;
      return response.configured === true;
    } else {
      await this.directService.configure(config);
      return true;
    }
  }

  /**
   * Check if service is configured and ready
   * @returns {Promise<boolean>} True if ready
   */
  async isConfigured(): Promise<boolean> {
    const hostBridge = this.getHostTransportBridge()?.stt;
    if (hostBridge) {
      if (!hostBridge.isConfigured) {
        return true;
      }

      return (await hostBridge.isConfigured()) === true;
    }

    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) return false;
      try {
        const response = (await bridge.sendMessage(
          MessageTypes.STT_IS_CONFIGURED,
          {},
        )) as STTBridgeResponse;
        return response.configured === true;
      } catch {
        return false;
      }
    } else {
      return this.directService.isConfigured();
    }
  }

  /**
   * Check if currently recording
   * @returns {boolean} True if recording
   */
  isCurrentlyRecording(): boolean {
    if (this.isUsingBridgeTranscription()) {
      // In extension mode, we track locally
      return this._isRecording || false;
    } else {
      return this.directService.isCurrentlyRecording();
    }
  }

  /**
   * Start recording audio from microphone
   * @param {string|null} deviceId - Optional microphone device ID
   * @returns {Promise<boolean>} Success status
   */
  async startRecording(deviceId: string | null = null): Promise<boolean> {
    await this.ensureConfigured();

    if (this.isUsingBridgeTranscription()) {
      // In extension mode, recording happens in content script
      // We use MediaRecorder directly here
      if (this._isRecording) {
        Logger.warn("STTServiceProxy", "Already recording");
        return false;
      }

      try {
        // Get audio constraints with selected microphone (or use provided deviceId)
        const constraints: MediaStreamConstraints = deviceId
          ? {
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                deviceId: { exact: deviceId },
              },
            }
          : MicrophoneService.getAudioConstraints();

        this.audioStream =
          await navigator.mediaDevices.getUserMedia(constraints);

        // Create MediaRecorder
        const mimeType = this.getSupportedMimeType();
        this.mediaRecorder = new MediaRecorder(this.audioStream, { mimeType });
        this.audioChunks = [];

        // Setup event handlers
        this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = async () => {
          try {
            // Create audio blob
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });

            // Convert blob to ArrayBuffer, then to plain Array (like TTS does)
            // This is necessary because Chrome's postMessage/sendMessage cannot handle Blobs
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioData = Array.from(new Uint8Array(arrayBuffer));

            Logger.log(
              "STTServiceProxy",
              `Converted audio to Array: ${audioData.length} bytes`,
            );

            // Cleanup local resources
            this.cleanup();

            const text = await this.transcribeCapturedAudio(
              audioData,
              mimeType,
            );

            // Call transcription callback
            if (this.onTranscription) {
              this.onTranscription(text);
            }

            // Call stop callback
            if (this.onRecordingStop) {
              this.onRecordingStop();
            }
          } catch (error: unknown) {
            Logger.error("STTServiceProxy", "Transcription failed:", error);
            if (this.onError) {
              this.onError(error);
            }
            if (this.onRecordingStop) {
              this.onRecordingStop();
            }
          }
        };

        this.mediaRecorder.onerror = (error: Event) => {
          Logger.error("STTServiceProxy", "MediaRecorder error:", error);
          if (this.onError) {
            this.onError(error);
          }
          this.cleanup();
        };

        // Start recording
        this.mediaRecorder.start();
        this._isRecording = true;

        if (this.onRecordingStart) {
          this.onRecordingStart();
        }

        return true;
      } catch (error: unknown) {
        Logger.error("STTServiceProxy", "Failed to start recording:", error);
        this.cleanup();
        throw error;
      }
    } else {
      return await this.directService.startRecording(deviceId);
    }
  }

  /**
   * Stop recording audio
   */
  stopRecording(): void {
    if (this.isUsingBridgeTranscription()) {
      if (!this._isRecording || !this.mediaRecorder) {
        Logger.warn("STTServiceProxy", "Not recording");
        return;
      }

      this.mediaRecorder.stop();
      this._isRecording = false;
    } else {
      this.directService.stopRecording();
    }
  }

  /**
   * Transcribe audio blob to text
   * @param {Blob} audioBlob - Audio data to transcribe
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudio(audioBlob: Blob): Promise<string> {
    await this.ensureConfigured();

    const hostBridge = this.getHostTransportBridge()?.stt;
    if (hostBridge) {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = Array.from(new Uint8Array(arrayBuffer));
      const mimeType = audioBlob.type || "audio/webm";
      return await hostBridge.transcribeAudio({
        audio: audioData,
        mimeType,
      });
    }

    if (this.isExtension) {
      // Convert blob to ArrayBuffer, then to plain Array (like TTS does)
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = Array.from(new Uint8Array(arrayBuffer));
      const mimeType = audioBlob.type || "audio/webm";

      Logger.log(
        "STTServiceProxy",
        `Transcribing audio: ${audioData.length} bytes, type: ${mimeType}`,
      );

      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("STTServiceProxy: Bridge not available");

      const response = (await bridge.sendMessage(
        MessageTypes.STT_TRANSCRIBE_AUDIO,
        { audioBuffer: audioData, mimeType },
        { timeout: 60000 },
      )) as STTBridgeResponse;
      return response.text || "";
    } else {
      return await this.directService.transcribeAudio(audioBlob);
    }
  }

  /**
   * Test STT with a sample recording
   * @param {number} duration - Recording duration in seconds
   * @param {string|null} deviceId - Optional microphone device ID
   * @returns {Promise<string>} Transcribed text
   */
  async testRecording(
    duration = 3,
    deviceId: string | null = null,
  ): Promise<string> {
    if (this.isUsingBridgeTranscription()) {
      return new Promise<string>((resolve, reject) => {
        const originalTranscription = this.onTranscription;
        const originalError = this.onError;

        this.onTranscription = (text: string) => {
          this.onTranscription = originalTranscription;
          this.onError = originalError;
          resolve(text);
        };

        this.onError = (error: unknown) => {
          this.onTranscription = originalTranscription;
          this.onError = originalError;
          reject(error);
        };

        this.startRecording(deviceId)
          .then(() => {
            setTimeout(() => {
              this.stopRecording();
            }, duration * 1000);
          })
          .catch(reject);
      });
    } else {
      return await this.directService.testRecording(duration, deviceId);
    }
  }

  /**
   * Get supported MIME type for MediaRecorder
   * @returns {string} Supported MIME type
   */
  getSupportedMimeType(): string {
    const types = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return "";
  }

  /**
   * Cleanup recording resources
   */
  cleanup(): void {
    if (this.audioStream) {
      this.audioStream
        .getTracks()
        .forEach((track: MediaStreamTrack) => track.stop());
      this.audioStream = null;
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
    this._isRecording = false;
  }

  /**
   * Set transcription callback
   * @param {Function} callback - Callback function (text: string) => void
   */
  setTranscriptionCallback(callback: (text: string) => void): void {
    this.onTranscription = callback;
    if (!this.isExtension) {
      this.directService.setTranscriptionCallback(callback);
    }
  }

  /**
   * Set error callback
   * @param {Function} callback - Callback function (error: Error) => void
   */
  setErrorCallback(callback: (error: unknown) => void): void {
    this.onError = callback;
    if (!this.isExtension) {
      this.directService.setErrorCallback(callback);
    }
  }

  /**
   * Set recording start callback
   * @param {Function} callback - Callback function () => void
   */
  setRecordingStartCallback(callback: () => void): void {
    this.onRecordingStart = callback;
    if (!this.isExtension) {
      this.directService.setRecordingStartCallback(callback);
    }
  }

  /**
   * Set recording stop callback
   * @param {Function} callback - Callback function () => void
   */
  setRecordingStopCallback(callback: () => void): void {
    this.onRecordingStop = callback;
    if (!this.isExtension) {
      this.directService.setRecordingStopCallback(callback);
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method: string, ...args: unknown[]): Promise<unknown> {
    const methodMap: Record<
      | "configure"
      | "transcribeAudio"
      | "startRecording"
      | "stopRecording"
      | "testRecording",
      string
    > = {
      configure: MessageTypes.STT_CONFIGURE,
      transcribeAudio: MessageTypes.STT_TRANSCRIBE_AUDIO,
      startRecording: MessageTypes.STT_START_RECORDING,
      stopRecording: MessageTypes.STT_STOP_RECORDING,
      testRecording: MessageTypes.STT_TEST_RECORDING,
    };

    const messageType = methodMap[method as keyof typeof methodMap];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error("STTServiceProxy: Bridge not available");
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method: string, ...args: unknown[]): Promise<unknown> {
    const candidateMethod = this.directService[method];
    if (typeof candidateMethod !== "function") {
      throw new Error(`Method ${method} not found on STTService`);
    }

    return await (candidateMethod as (...params: unknown[]) => unknown)(
      ...args,
    );
  }
}

// Export singleton instance
const sttServiceProxy = new STTServiceProxy();
export default sttServiceProxy;
