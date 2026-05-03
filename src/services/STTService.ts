/**
 * STTService - Multi-provider Speech-to-Text service
 *
 * Unified interface for Chrome AI Multimodal, OpenAI Whisper, and generic STT APIs.
 * Supports both one-shot transcription and continuous streaming for conversation mode.
 */

import OpenAI from "openai";
import { STTProviders, DefaultSTTConfig } from "../config/aiConfig";
import storageManager from "../storage";
import ChromeAIValidator from "./ChromeAIValidator";
import Logger from "./LoggerService";
import MicrophoneService from "./MicrophoneService";
import { isExtension } from "../utils/PlatformUtils";

type STTState = {
  client: OpenAI | null;
  provider: string | null;
  config: any;
  enabled: boolean;
  chromeAISession: any;
};

type STTCallbacks = {
  onTranscription: ((text: string) => void) | null;
  onError: ((error: unknown) => void) | null;
  onRecordingStart: (() => void) | null;
  onRecordingStop: (() => void) | null;
};

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));
const getLanguageModelApi = (): any =>
  (self as typeof globalThis & { LanguageModel?: any }).LanguageModel ?? null;
const getWebkitAudioContextCtor = (): (new () => AudioContext) | null => {
  const maybeWindow = window as Window & {
    webkitAudioContext?: new () => AudioContext;
  };
  return maybeWindow.webkitAudioContext ?? null;
};

class STTService {
  private readonly isExtensionMode: boolean;
  private tabStates: Map<number, STTState>;
  private client: OpenAI | null;
  private provider: string | null;
  private config: any;
  private enabled: boolean;
  private chromeAISession: any;
  private mediaRecorder: MediaRecorder | null;
  private audioStream: MediaStream | null;
  private audioChunks: Blob[];
  private isRecording: boolean;
  private onTranscription: ((text: string) => void) | null;
  private onError: ((error: unknown) => void) | null;
  private onRecordingStart: (() => void) | null;
  private onRecordingStop: (() => void) | null;

  constructor() {
    this.isExtensionMode = isExtension;
    this.tabStates = new Map();
    this.client = null;
    this.provider = null;
    this.config = null;
    this.enabled = false;
    this.chromeAISession = null;
    this.mediaRecorder = null;
    this.audioStream = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.onTranscription = null;
    this.onError = null;
    this.onRecordingStart = null;
    this.onRecordingStop = null;

    if (this.isExtensionMode) {
      return;
    }
  }

  initTab(tabId: number): void {
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        client: null,
        config: null,
        provider: null,
        enabled: false,
        chromeAISession: null,
      });
      Logger.log("STTService", `Tab ${tabId} initialized`);
    }
  }

  cleanupTab(tabId: number): void {
    if (this.tabStates.has(tabId)) {
      this.tabStates.delete(tabId);
      Logger.log("STTService", `Tab ${tabId} cleaned up`);
    }
  }

  _getState(tabId: number | null = null): STTState {
    if (this.isExtensionMode) {
      if (tabId === null) {
        throw new Error("tabId is required in extension mode");
      }
      this.initTab(tabId);
      return this.tabStates.get(tabId) as STTState;
    }
    return this as unknown as STTState; // dev uses instance
  }

  /**
   * Configure STT client with provider settings
   * @param {Object} config - STT configuration from aiConfig
   * @param {number|null} tabId - Tab ID (extension mode only)
   */
  configure(config: any, tabId: number | null = null): boolean {
    const state = this._getState(tabId);
    const { provider, enabled } = config;
    const logPrefix = this.isExtensionMode
      ? `[STTService] Tab ${tabId}`
      : "[STTService]";

    state.enabled = enabled;

    if (!enabled) {
      Logger.log("other", `${logPrefix} - STT is disabled`);
      return true;
    }

    Logger.log("other", `${logPrefix} - Configuring provider: ${provider}`);

    try {
      if (provider === STTProviders.CHROME_AI_MULTIMODAL) {
        if (!ChromeAIValidator.isSupported()) {
          throw new Error("Chrome AI not supported. Chrome 138+ required.");
        }

        state.config = {
          temperature: config["chrome-ai-multimodal"].temperature,
          topK: config["chrome-ai-multimodal"].topK,
        };
        state.provider = provider;

        Logger.log(
          "other",
          `${logPrefix} - Chrome AI Multimodal configured:`,
          state.config,
        );
      } else if (provider === STTProviders.OPENAI) {
        state.client = new OpenAI({
          apiKey: config.openai.apiKey,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });

        state.config = {
          model: config.openai.model,
          language: config.openai.language,
          temperature: config.openai.temperature,
        };
        state.provider = provider;

        Logger.log(
          "other",
          `${logPrefix} - OpenAI Whisper configured:`,
          state.config,
        );
      } else if (provider === STTProviders.OPENAI_COMPATIBLE) {
        // Normalize endpoint to ensure /v1 is present (OpenAI SDK appends /audio/transcriptions to baseURL)
        let endpoint = config["openai-compatible"].endpoint;
        if (!endpoint.endsWith("/v1")) {
          endpoint = endpoint.replace(/\/$/, "") + "/v1";
        }

        state.client = new OpenAI({
          apiKey: config["openai-compatible"].apiKey || "default",
          baseURL: endpoint,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });

        state.config = {
          model: config["openai-compatible"].model,
          language: config["openai-compatible"].language,
          temperature: config["openai-compatible"].temperature,
        };
        state.provider = provider;

        Logger.log("other", `${logPrefix} - Generic STT configured:`, {
          baseURL: endpoint,
        });
      } else if (provider === STTProviders.ANDROID_LOCAL) {
        const androidConfig = config["android-local"] || {};
        let endpoint = androidConfig.endpoint || "http://127.0.0.1:8765";

        if (!endpoint.endsWith("/v1")) {
          endpoint = endpoint.replace(/\/$/, "") + "/v1";
        }

        state.client = new OpenAI({
          apiKey: "android-local",
          baseURL: endpoint,
          dangerouslyAllowBrowser: true,
        });

        state.config = {
          model: androidConfig.model || "whisper-local",
          language: androidConfig.language || "en",
        };
        state.provider = provider;

        Logger.log("other", `${logPrefix} - Android local STT configured:`, {
          baseURL: endpoint,
        });
      } else if (provider === STTProviders.DESKTOP_LOCAL) {
        const desktopConfig = config["desktop-local"] || {};
        let endpoint = desktopConfig.endpoint || "http://127.0.0.1:11438";

        if (!endpoint.endsWith("/v1")) {
          endpoint = endpoint.replace(/\/$/, "") + "/v1";
        }

        state.client = new OpenAI({
          apiKey: "desktop-local",
          baseURL: endpoint,
          dangerouslyAllowBrowser: true,
        });

        state.config = {
          model: desktopConfig.model || "tiny",
          language: desktopConfig.language || "auto",
        };
        state.provider = provider;

        Logger.log("other", `${logPrefix} - Desktop local STT configured:`, {
          baseURL: endpoint,
        });
      } else {
        throw new Error(`Unknown STT provider: ${provider}`);
      }

      return true;
    } catch (error) {
      Logger.error("other", `${logPrefix} - Configuration failed:`, error);
      state.client = null;
      state.config = null;
      state.provider = null;
      throw asError(error);
    }
  }

  /**
   * Check if service is configured and ready
   * @returns {boolean} True if ready
   */
  isConfigured(tabId: number | null = null): boolean {
    const state = this._getState(tabId);
    if (!state || !state.enabled || !state.config) return false;
    if (state.provider === "chrome-ai-multimodal") return true;
    return state.client !== null;
  }

  /**
   * Check if currently recording
   * @returns {boolean} True if recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Start recording audio from microphone
   * @param {string|null} deviceId - Optional microphone device ID
   * @returns {Promise<boolean>} Success status
   */
  async startRecording(deviceId: string | null = null): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error(
        "STTService not configured. Enable STT and configure settings first.",
      );
    }
    if (this.isRecording) {
      Logger.warn("STTService", "Already recording");
      return false;
    }

    try {
      Logger.log("STTService", "Requesting microphone access...");

      // Get audio constraints with selected microphone (or use provided deviceId)
      const constraints = deviceId
        ? {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              deviceId: { exact: deviceId },
            },
          }
        : MicrophoneService.getAudioConstraints();

      this.audioStream = await navigator.mediaDevices.getUserMedia(constraints);

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
        Logger.log("STTService", "Recording stopped, processing...");

        try {
          // Create audio blob
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          Logger.log(
            "STTService",
            `Audio blob created: ${audioBlob.size} bytes`,
          );

          // Cleanup audio resources immediately
          this.cleanup();

          // Windows headset fix: Wait for audio device to switch from input to output
          // This delay allows the hardware to properly release the microphone before
          // TTS tries to use the speakers. Configurable in STT settings.
          let switchDelay = 300; // Default
          try {
            const sttConfig = (await storageManager.config.load(
              "sttConfig",
              DefaultSTTConfig,
            )) as any;
            switchDelay = sttConfig.audioDeviceSwitchDelay || 300;
          } catch (error) {
            Logger.error("STTService", "Failed to load STT config:", error);
          }

          Logger.log(
            "STTService",
            `Waiting ${switchDelay}ms for audio device switch...`,
          );
          await new Promise((resolve) => setTimeout(resolve, switchDelay));

          // Transcribe - this is the slow part
          const transcription = await this.transcribeAudio(audioBlob);

          // Now that transcription is complete, call callbacks
          if (this.onTranscription) {
            this.onTranscription(transcription);
          }

          // Call stop callback AFTER transcription completes
          if (this.onRecordingStop) {
            this.onRecordingStop();
          }
        } catch (error) {
          Logger.error("STTService", "Transcription failed:", error);
          this.cleanup();
          if (this.onError) {
            this.onError(error);
          }
          // Still call stop callback even on error
          if (this.onRecordingStop) {
            this.onRecordingStop();
          }
        }
      };

      this.mediaRecorder.onerror = (error: Event) => {
        Logger.error("STTService", "MediaRecorder error:", error);
        if (this.onError) {
          this.onError(error);
        }
        this.cleanup();
      };

      // Start recording
      this.mediaRecorder.start();
      this.isRecording = true;

      Logger.log("STTService", "Recording started");

      if (this.onRecordingStart) {
        this.onRecordingStart();
      }

      return true;
    } catch (error) {
      Logger.error("STTService", "Failed to start recording:", error);
      this.cleanup();
      throw asError(error);
    }
  }

  /**
   * Stop recording audio
   */
  stopRecording(): void {
    if (!this.isRecording || !this.mediaRecorder) {
      Logger.warn("STTService", "Not recording");
      return;
    }

    Logger.log("STTService", "Stopping recording...");
    this.mediaRecorder.stop();
    this.isRecording = false;
  }

  /**
   * Transcribe audio blob to text
   * @param {Blob|ArrayBuffer} input - Audio data to transcribe (Blob in dev, ArrayBuffer in extension)
   * @param {string|number|null} maybeMimeOrTabId - MIME type (dev) or Tab ID (extension)
   * @param {number|null} maybeTabId - Tab ID (extension mode only)
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudio(
    input: Blob | ArrayBuffer,
    maybeMimeOrTabId: string | number | null = null,
    maybeTabId: number | null = null,
  ): Promise<string> {
    const tabId = this.isExtensionMode ? maybeTabId : null;
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[STTService] Tab ${tabId}`
      : "[STTService]";

    if (!this.isConfigured(tabId)) {
      throw new Error("STTService not configured");
    }

    let audioBlob;
    if (this.isExtensionMode) {
      const arrayBuffer = input as ArrayBuffer;
      const mimeType =
        typeof maybeMimeOrTabId === "string" ? maybeMimeOrTabId : "audio/webm";
      audioBlob = new Blob([arrayBuffer], { type: mimeType });
      Logger.log(
        "other",
        `${logPrefix} - Transcribing audio (${arrayBuffer.byteLength} bytes) with ${state.provider}...`,
      );
    } else {
      audioBlob = input as Blob;
      Logger.log(
        "other",
        `${logPrefix} - Transcribing audio (${audioBlob.size} bytes) with ${state.provider}...`,
      );
    }

    if (
      state.provider === STTProviders.CHROME_AI_MULTIMODAL ||
      state.provider === "chrome-ai-multimodal"
    ) {
      return await this.transcribeAudioChromeAI(
        this.isExtensionMode ? input : audioBlob,
        tabId,
      );
    }

    try {
      let fileBlob = audioBlob;
      let fileName = "recording.webm";

      if (
        state.provider === STTProviders.ANDROID_LOCAL ||
        state.provider === "android-local" ||
        state.provider === STTProviders.DESKTOP_LOCAL ||
        state.provider === "desktop-local"
      ) {
        Logger.log(
          "other",
          `${logPrefix} - Converting audio to WAV for local STT...`,
        );
        fileBlob = await this.convertToWav(audioBlob);
        fileName = "recording.wav";
        Logger.log(
          "other",
          `${logPrefix} - Converted to WAV: ${fileBlob.size} bytes`,
        );
      }

      const audioFile = new File([fileBlob], fileName, { type: fileBlob.type });
      const params: any = {
        file: audioFile,
        model: state.config.model,
      };

      if (state.config.language) {
        params.language = state.config.language;
      }
      if (state.config.temperature !== undefined) {
        params.temperature = state.config.temperature;
      }

      if (!state.client) {
        throw new Error("STT client is not configured");
      }
      const transcription =
        await state.client.audio.transcriptions.create(params);
      const text = transcription.text.trim();

      Logger.log("other", `${logPrefix} - Transcription complete: "${text}"`);
      return text;
    } catch (error) {
      Logger.error("other", `${logPrefix} - Transcription API error:`, error);

      const normalized = asError(error);
      if (normalized.message?.includes("401")) {
        throw new Error(
          "Invalid STT API key. Please check your configuration.",
        );
      }
      if (normalized.message?.includes("429")) {
        throw new Error("STT rate limit exceeded. Please try again later.");
      }
      if (normalized.message?.includes("fetch")) {
        throw new Error(
          "STT network error. Please check your connection and endpoint URL.",
        );
      }
      throw normalized;
    }
  }

  /**
   * Transcribe audio using Chrome AI Multimodal
   * @param {Blob} audioBlob - Audio data to transcribe
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudioChromeAI(
    input: Blob | ArrayBuffer,
    tabId: number | null = null,
  ): Promise<string> {
    try {
      let arrayBuffer;
      if (this.isExtensionMode) {
        // input is ArrayBuffer
        arrayBuffer = input as ArrayBuffer;
      } else {
        const audioBlob = input as Blob;
        arrayBuffer = await audioBlob.arrayBuffer();
        Logger.log(
          "STTService",
          `Audio converted to ArrayBuffer (${arrayBuffer.byteLength} bytes)`,
        );
        Logger.log("STTService", `Audio blob type: ${audioBlob.type}`);
      }

      const languageModelApi = getLanguageModelApi();
      if (!languageModelApi) {
        throw new Error("Chrome AI multimodal not available");
      }

      const params = await languageModelApi.params();

      const state = this._getState(tabId);
      if (!state.chromeAISession) {
        Logger.log("STTService", "Creating Chrome AI multimodal session...");
        state.chromeAISession = await languageModelApi.create({
          expectedInputs: [{ type: "audio" }],
          temperature: 0.1,
          topK: params.defaultTopK,
        });
        Logger.log("STTService", "Chrome AI multimodal session created");
      }

      Logger.log("STTService", "Sending prompt to Chrome AI...");
      const stream = state.chromeAISession.promptStreaming([
        {
          role: "user",
          content: [
            { type: "text", value: "transcribe this audio" },
            { type: "audio", value: arrayBuffer },
          ],
        },
      ]);

      let fullResponse = "";
      for await (const chunk of stream) {
        fullResponse += chunk;
      }

      const text = fullResponse.trim();
      Logger.log("STTService", `Chrome AI transcription complete: "${text}"`);
      return text;
    } catch (error) {
      Logger.error("STTService", "Chrome AI transcription error:", error);
      const state = this._getState(tabId);
      if (state.chromeAISession) {
        try {
          state.chromeAISession.destroy();
        } catch {
          // ignore destroy errors
        }
        state.chromeAISession = null;
      }
      const normalized = asError(error);
      if (normalized.name === "NotSupportedError") {
        throw new Error(
          "Chrome AI multimodal not available. Enable multimodal-input flag at chrome://flags",
        );
      } else if (normalized.name === "QuotaExceededError") {
        throw new Error(
          "Chrome AI context limit exceeded. Start a new conversation.",
        );
      } else {
        throw normalized;
      }
    }
  }

  /**
   * Test STT with a sample recording
   * @param {number} duration - Recording duration in seconds (default: 3)
   * @param {string|null} deviceId - Optional microphone device ID
   * @returns {Promise<string>} Transcribed text
   */
  async testRecording(
    duration = 3,
    deviceId: string | null = null,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Setup temporary callbacks
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

      // Start recording with deviceId
      this.startRecording(deviceId)
        .then(() => {
          // Auto-stop after duration
          setTimeout(() => {
            this.stopRecording();
          }, duration * 1000);
        })
        .catch(reject);
    });
  }

  /**
   * Get supported MIME type for MediaRecorder
   * @returns {string} Supported MIME type
   */
  getSupportedMimeType(): string {
    const types = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        Logger.log("STTService", `Using MIME type: ${type}`);
        return type;
      }
    }

    Logger.warn(
      "STTService",
      "No preferred MIME type supported, using default",
    );
    return "";
  }

  /**
   * Cleanup recording resources
   */
  cleanup(): void {
    Logger.log("STTService", "Cleaning up recording resources...");

    if (this.audioStream) {
      // Stop all tracks to release microphone
      this.audioStream.getTracks().forEach((track) => {
        track.stop();
        Logger.log("STTService", `Stopped audio track: ${track.kind}`);
      });
      this.audioStream = null;
    }

    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;

    Logger.log("STTService", "Cleanup complete");
  }

  /**
   * Set transcription callback
   * @param {Function} callback - Callback function (text: string) => void
   */
  setTranscriptionCallback(callback: ((text: string) => void) | null): void {
    this.onTranscription = callback;
  }

  /**
   * Set error callback
   * @param {Function} callback - Callback function (error: Error) => void
   */
  setErrorCallback(callback: ((error: unknown) => void) | null): void {
    this.onError = callback;
  }

  /**
   * Set recording start callback
   * @param {Function} callback - Callback function () => void
   */
  setRecordingStartCallback(callback: (() => void) | null): void {
    this.onRecordingStart = callback;
  }

  /**
   * Set recording stop callback
   * @param {Function} callback - Callback function () => void
   */
  setRecordingStopCallback(callback: (() => void) | null): void {
    this.onRecordingStop = callback;
  }

  /**
   * Convert an audio blob to WAV format at 16kHz mono (required for sherpa-onnx Whisper)
   * @param {Blob} audioBlob - Input audio blob (webm, mp4, etc.)
   * @returns {Promise<Blob>} WAV formatted audio blob
   */
  async convertToWav(audioBlob: Blob): Promise<Blob> {
    const AudioContextCtor = window.AudioContext || getWebkitAudioContextCtor();
    if (!AudioContextCtor) {
      throw new Error("AudioContext is not available");
    }
    const audioContext = new AudioContextCtor();

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Target: 16kHz mono
      const targetSampleRate = 16000;
      const numChannels = 1;
      const duration = audioBuffer.duration;
      const numSamples = Math.floor(duration * targetSampleRate);

      // Get mono audio data (mix channels if stereo)
      let channelData;
      if (audioBuffer.numberOfChannels === 1) {
        channelData = audioBuffer.getChannelData(0);
      } else {
        // Mix stereo to mono
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        channelData = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
          const leftSample = left[i] ?? 0;
          const rightSample = right[i] ?? 0;
          channelData[i] = (leftSample + rightSample) / 2;
        }
      }

      // Resample if necessary
      let samples;
      if (audioBuffer.sampleRate !== targetSampleRate) {
        const ratio = audioBuffer.sampleRate / targetSampleRate;
        samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          const srcIndex = i * ratio;
          const srcIndexFloor = Math.floor(srcIndex);
          const srcIndexCeil = Math.min(
            srcIndexFloor + 1,
            channelData.length - 1,
          );
          const t = srcIndex - srcIndexFloor;
          const floorValue = channelData[srcIndexFloor] ?? 0;
          const ceilValue = channelData[srcIndexCeil] ?? 0;
          samples[i] = floorValue * (1 - t) + ceilValue * t;
        }
      } else {
        samples = channelData;
      }

      const wavBuffer = this.createWavBuffer(
        samples,
        targetSampleRate,
        numChannels,
      );

      audioContext.close();
      return new Blob([wavBuffer], { type: "audio/wav" });
    } catch (error) {
      audioContext.close();
      throw asError(error);
    }
  }

  /**
   * Create a WAV file buffer from float samples
   */
  createWavBuffer(
    samples: Float32Array,
    sampleRate: number,
    numChannels: number,
  ): ArrayBuffer {
    const bytesPerSample = 2; // 16-bit
    const dataLength = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAV header
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    this.writeString(view, 8, "WAVE");
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
    view.setUint16(32, numChannels * bytesPerSample, true); // block align
    view.setUint16(34, bytesPerSample * 8, true); // bits per sample
    this.writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);

    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }

    return buffer;
  }

  writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

// Export singleton instance
export default new STTService();
