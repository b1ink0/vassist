/**
 * TTSService - Multi-provider Text-to-Speech service
 *
 * Unified interface for OpenAI TTS and Ollama TTS (via OpenAI-compatible API).
 * Supports streaming TTS generation with intelligent chunking and audio queue management.
 */

import OpenAI from "openai";
import { TTSProviders } from "../config/aiConfig";
import { audioWorkerClient } from "../workers/AudioWorkerClient";
import Logger from "./LoggerService";
import voiceStorageService from "./VoiceStorageService";
import { isExtension } from "../utils/PlatformUtils";
import liveLipSyncService from "./audio/LiveLipSyncService";

type TTSState = {
  client: any;
  provider: string | null;
  config: any;
  enabled: boolean;
  isGenerating: boolean;
  isStopped: boolean;
  lipSyncEnabled: boolean;
  activeRequests: number;
  maxConcurrentRequests: number;
  blobUrls: Map<string, string>;
};

type QueueItem = {
  text: string;
  audioUrl: string;
  bvmdUrl: string | null;
  sessionId: string;
};

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

class TTSService {
  private readonly isExtensionMode: boolean;
  private eventTarget: EventTarget;
  private hasSessionStarted: boolean;
  private completedSessions: Set<string>;
  private lipSyncEnabled: boolean;
  private audioQueue: Array<QueueItem | string>;
  private isPlaying: boolean;
  private isStopped: boolean;
  private currentAudio: HTMLAudioElement | null;
  private currentPlaybackSession: string | null;
  private stoppedSessionIds: Set<string>;
  private blobUrls: Set<string>;
  private tabStates: Map<number, TTSState>;
  private client: OpenAI | string | null;
  private provider: string | null;
  private config: Record<string, unknown> | null;
  private enabled: boolean;
  private activeRequests: number;
  private maxConcurrentRequests: number;
  private kokoroHeartbeatInterval: ReturnType<typeof setInterval> | null;
  private kokoroHeartbeatEnabled: boolean;

  constructor() {
    this.isExtensionMode = isExtension;

    // Shared state needed in both extension and dev modes.
    this.eventTarget = new EventTarget();
    this.hasSessionStarted = false;
    this.completedSessions = new Set();
    this.lipSyncEnabled = true;

    // Initialize playback state for BOTH modes
    // In dev mode: used directly by this service
    // In extension mode: used by main world instance (content script)
    this.audioQueue = [];
    this.isPlaying = false;
    this.isStopped = false;
    this.currentAudio = null;
    this.currentPlaybackSession = null;
    this.stoppedSessionIds = new Set(); // Track stopped sessions to reject late-arriving chunks
    this.blobUrls = new Set();
    this.tabStates = new Map();
    this.client = null;
    this.provider = null;
    this.config = null;
    this.enabled = false;
    this.activeRequests = 0;
    this.maxConcurrentRequests = 3;
    this.kokoroHeartbeatInterval = null;
    this.kokoroHeartbeatEnabled = false;

    if (this.isExtensionMode) {
      return;
    } else {
      // Worker handles VMD/BVMD in dev mode, no need for these services
    }
  }

  initTab(tabId: number): void {
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        client: null,
        provider: null,
        config: null,
        enabled: false,
        isGenerating: false,
        isStopped: false,
        lipSyncEnabled: true,
        activeRequests: 0,
        maxConcurrentRequests: 3,
        blobUrls: new Map(),
      });
      Logger.log("TTSService", `Tab ${tabId} initialized`);
    }
  }

  cleanupTab(tabId: number): void {
    if (this.tabStates.has(tabId)) {
      this.tabStates.delete(tabId);
      Logger.log("TTSService", `Tab ${tabId} cleaned up`);
    }
  }

  _getState(tabId: number | null = null): TTSState {
    if (this.isExtensionMode) {
      if (tabId === null) {
        throw new Error("tabId is required in extension mode");
      }
      this.initTab(tabId);
      return this.tabStates.get(tabId) as TTSState;
    }
    return this as unknown as TTSState; // dev mode uses instance fields
  }

  /**
   * Configure TTS client with provider settings
   * @param {Object} config - TTS configuration from aiConfig
   * @param {number|null} tabId - Tab ID (extension mode only)
   */
  configure(config: Record<string, any>, tabId: number | null = null): boolean {
    const state = this._getState(tabId);
    const { provider, enabled } = config;
    const logPrefix = this.isExtensionMode
      ? `[TTSService] Tab ${tabId}`
      : "[TTSService]";

    state.enabled = enabled;
    if (!this.isExtensionMode) {
      liveLipSyncService.setAccurateLipSyncEnabled(
        config.accurateLipSync !== false,
      );
      liveLipSyncService.setLegacyLipSyncEnabled(config.legacyLipSync === true);
    }

    if (!enabled) {
      Logger.log("other", `${logPrefix} - TTS is disabled`);
      return true;
    }

    Logger.log("other", `${logPrefix} - Configuring provider: ${provider}`);

    try {
      if (provider === TTSProviders.KOKORO) {
        // Kokoro uses worker-based generation (no client object)
        // Merge with defaults if kokoro config is missing
        const kokoroConfig = config.kokoro || {};

        Logger.log(
          "other",
          `${logPrefix} - Kokoro config received:`,
          kokoroConfig,
        );

        state.config = {
          modelId:
            kokoroConfig.modelId || "onnx-community/Kokoro-82M-v1.0-ONNX",
          voice: kokoroConfig.voice || "af_heart",
          speed: kokoroConfig.speed !== undefined ? kokoroConfig.speed : 1.0,
          device: kokoroConfig.device || "auto",
          // NOTE: dtype is determined automatically by KokoroTTSCore based on device
          // webgpu -> fp32, wasm -> q8
        };
        state.provider = provider;
        state.client = "kokoro"; // Marker to indicate Kokoro is configured

        Logger.log(
          "other",
          `${logPrefix} - Kokoro TTS configured:`,
          state.config,
        );
      } else if (provider === TTSProviders.OPENAI) {
        state.client = new OpenAI({
          apiKey: config.openai.apiKey,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });

        state.config = {
          model: config.openai.model,
          voice: config.openai.voice,
          speed: config.openai.speed,
        };
        state.provider = provider;

        Logger.log(
          "other",
          `${logPrefix} - OpenAI TTS configured:`,
          state.config,
        );
      } else if (provider === TTSProviders.OPENAI_COMPATIBLE) {
        // Normalize endpoint URL - ensure it ends with /v1 (SDK appends /audio/speech)
        let endpoint = config["openai-compatible"].endpoint;
        if (!endpoint.endsWith("/v1")) {
          // Remove trailing slash if present, then add /v1
          endpoint = endpoint.replace(/\/$/, "") + "/v1";
        }

        state.client = new OpenAI({
          apiKey: config["openai-compatible"].apiKey || "default",
          baseURL: endpoint,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });

        state.config = {
          model: config["openai-compatible"].model,
          voice: config["openai-compatible"].voice,
          speed: config["openai-compatible"].speed,
        };
        state.provider = provider;

        Logger.log("other", `${logPrefix} - Generic TTS configured:`, {
          baseURL: endpoint,
        });
      } else if (provider === TTSProviders.ANDROID_LOCAL) {
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

        const speakerId = androidConfig.speakerId ?? 0;

        state.config = {
          model: androidConfig.model || "vits-vctk",
          voice: `speaker_${speakerId}`,
          speed: androidConfig.speed || 1.0,
        };
        state.provider = provider;

        Logger.log("other", `${logPrefix} - Android local TTS configured:`, {
          baseURL: endpoint,
          speakerId,
        });
      } else if (provider === TTSProviders.DESKTOP_LOCAL) {
        const desktopConfig = config["desktop-local"] || {};
        let endpoint = desktopConfig.endpoint || "http://127.0.0.1:11438";

        if (!endpoint.endsWith("/v1")) {
          endpoint = endpoint.replace(/\/$/, "") + "/v1";
        }

        state.client = endpoint;

        state.config = {
          model: desktopConfig.model || "gpt-sovits",
          voice: desktopConfig.voice || "default",
          speed: desktopConfig.speed || 1.0,
          referenceVoiceId: desktopConfig.referenceVoiceId || null,
          referenceText: desktopConfig.referenceText || "",
          referenceLanguage: desktopConfig.referenceLanguage || "en",
        };
        state.provider = provider;

        Logger.log("other", `${logPrefix} - Desktop local TTS configured:`, {
          baseURL: endpoint,
          hasVoiceId: !!state.config.referenceVoiceId,
        });
      } else if (provider === TTSProviders.GPTSOVITS_REMOTE) {
        const remoteConfig = config["gptsovits-remote"] || {};
        let endpoint = remoteConfig.endpoint || "http://localhost:11438";

        if (!endpoint.endsWith("/v1")) {
          endpoint = endpoint.replace(/\/$/, "") + "/v1";
        }

        state.client = endpoint;

        state.config = {
          model: remoteConfig.model || "gpt-sovits",
          speed: remoteConfig.speed || 1.0,
          referenceVoiceId: remoteConfig.referenceVoiceId || null,
          referenceText: remoteConfig.referenceText || "",
          referenceLanguage: remoteConfig.referenceLanguage || "en",
          topK: remoteConfig.topK || 15,
          topP: remoteConfig.topP || 0.7,
          temperature: remoteConfig.temperature || 0.7,
        };
        state.provider = provider;

        Logger.log("other", `${logPrefix} - GPTSoVITS Remote TTS configured:`, {
          baseURL: endpoint,
          hasVoiceId: !!state.config.referenceVoiceId,
        });
      } else {
        throw new Error(`Unknown TTS provider: ${provider}`);
      }

      return true;
    } catch (error) {
      Logger.error("other", `${logPrefix} - Configuration failed:`, error);
      state.client = null;
      state.config = null;
      state.provider = null;
      throw error;
    }
  }

  isConfigured(tabId: number | null = null): boolean {
    const state = this._getState(tabId);
    return (
      state && state.enabled && state.client !== null && state.config !== null
    );
  }

  getCurrentProvider(tabId: number | null = null): string | null {
    const state = this._getState(tabId);
    return state?.provider || null;
  }

  /**
   * Initialize BVMD converter with scene
   * Dev mode: Worker handles BVMD conversion
   * This method is kept for compatibility
   */
  initializeBVMDConverter() {
    // In dev mode, worker handles BVMD conversion
    // This method is kept for compatibility but does nothing
    Logger.log("TTSService", "BVMD conversion handled by SharedWorker");
  }

  /**
   * Add event listener for TTS lifecycle events
   * Events: 'speak', 'audioStart', 'audioEnd', 'audioFinished', 'stop'
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   */
  addEventListener(
    event: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    this.eventTarget.addEventListener(event, listener);
    Logger.log("TTSService", `Event listener added for: ${event}`);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   */
  removeEventListener(
    event: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    this.eventTarget.removeEventListener(event, listener);
    Logger.log("TTSService", `Event listener removed for: ${event}`);
  }

  /**
   * Dispatch TTS event
   * @param {string} eventName - Event name
   * @param {Object} detail - Event detail data
   */
  _dispatchEvent(
    eventName: string,
    detail: Record<string, unknown> = {},
  ): void {
    const event = new CustomEvent(eventName, { detail });
    this.eventTarget.dispatchEvent(event);
  }

  /**
   * Mark a session as complete (all chunks generated)
   * @param {string} sessionId - Session ID
   */
  markSessionComplete(sessionId: string | null): void {
    if (!sessionId) return;
    this.completedSessions.add(sessionId);
    Logger.log("TTSService", `Session marked complete: ${sessionId}`);
  }

  /**
   * Check if a session is complete
   * @param {string} sessionId - Session ID
   * @returns {boolean}
   */
  isSessionComplete(sessionId: string): boolean {
    return this.completedSessions.has(sessionId);
  }

  /**
   * Enable or disable lip sync generation
   * @param {boolean} enabled - Enable lip sync generation
   */
  setLipSyncEnabled(enabled: boolean): void {
    this.lipSyncEnabled = enabled;
    Logger.log(
      "TTSService",
      `Lip sync generation ${enabled ? "enabled" : "disabled"}`,
    );
  }

  /**
   * Generate speech from text with optional lip sync (VMD -> BVMD)
   * @param {string} text - Text to convert to speech
   * @param {boolean} generateLipSync - Generate lip sync data
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<{audio: Blob, bvmdUrl: string|null}>} Audio blob and optional BVMD URL
   */
  async generateSpeech(
    text: string,
    generateLipSync = true,
    tabId: number | null = null,
  ): Promise<any> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[TTSService] Tab ${tabId}`
      : "[TTSService]";

    Logger.log(
      "other",
      `${logPrefix} - generateSpeech called with text:`,
      typeof text,
      `"${text?.substring?.(0, 50)}..."`,
    );

    if (!this.isConfigured(tabId)) {
      throw new Error("TTSService not configured or disabled");
    }

    // Validate text parameter
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      Logger.error(
        "other",
        `${logPrefix} - Invalid text for speech generation:`,
        text,
      );
      throw new Error(
        `Invalid text parameter for TTS: ${JSON.stringify(text)}`,
      );
    }

    if (state.isStopped) return null;

    const accurateLipSyncRequested =
      generateLipSync &&
      state.lipSyncEnabled &&
      !this.isExtensionMode &&
      liveLipSyncService.isAccurateLipSyncEnabled();
    const legacyLipSyncRequested =
      accurateLipSyncRequested && liveLipSyncService.isLegacyLipSyncEnabled();
    const liveLipSyncReady =
      accurateLipSyncRequested &&
      !legacyLipSyncRequested &&
      (await liveLipSyncService.prepare());
    const generateRecordedLipSync =
      legacyLipSyncRequested || (accurateLipSyncRequested && !liveLipSyncReady);

    // Handle Kokoro TTS generation
    if (state.provider === TTSProviders.KOKORO) {
      // Auto-initialize Kokoro if not initialized
      await audioWorkerClient.init();

      const status = await audioWorkerClient.checkKokoroStatus();
      if (!status.initialized && !status.initializing) {
        Logger.log("other", `${logPrefix} - Auto-initializing Kokoro...`);
        await this.initializeKokoro(null, tabId);
      }

      return await this.generateKokoroSpeech(
        text,
        generateRecordedLipSync,
        tabId,
      );
    }

    // Handle OpenAI, OpenAI-compatible, and Android Local TTS generation
    if (this.isExtensionMode) {
      state.isGenerating = true;

      try {
        Logger.log(
          "other",
          `${logPrefix} - Generating speech (${text.length} chars)`,
        );

        if (
          state.provider === TTSProviders.DESKTOP_LOCAL ||
          state.provider === TTSProviders.GPTSOVITS_REMOTE
        ) {
          let referenceAudioBase64 = null;
          let refText = state.config.referenceText;
          let refLang = state.config.referenceLanguage;

          if (state.config.referenceVoiceId) {
            try {
              Logger.log(
                "other",
                `${logPrefix} - Loading voice ${state.config.referenceVoiceId} from IndexedDB...`,
              );
              const voiceData = await voiceStorageService.getVoice(
                state.config.referenceVoiceId,
              );
              if (!voiceData) {
                throw new Error(
                  `Voice ${state.config.referenceVoiceId} not found in IndexedDB`,
                );
              }
              const voice = voiceData as {
                audioData?: Blob;
                referenceText?: string;
                language?: string;
              };
              if (!voice.audioData) {
                throw new Error("Voice data missing audioData blob");
              }
              Logger.log(
                "other",
                `${logPrefix} - Converting blob to base64 (${voice.audioData.size} bytes)...`,
              );
              const audioArrayBuffer = await voice.audioData.arrayBuffer();
              const audioBytes = new Uint8Array(audioArrayBuffer);
              const binaryString = Array.from(audioBytes)
                .map((b) => String.fromCharCode(b))
                .join("");
              referenceAudioBase64 = btoa(binaryString);
              refText = voice.referenceText;
              refLang = voice.language;
              Logger.log(
                "other",
                `${logPrefix} - Reference audio loaded and encoded (base64 length: ${referenceAudioBase64.length})`,
              );
            } catch (error) {
              Logger.error(
                "other",
                `${logPrefix} - Failed to load reference audio from IndexedDB:`,
                error,
              );
              throw new Error(
                `Failed to load reference voice: ${asError(error).message}`,
              );
            }
          }

          if (!referenceAudioBase64 || !refText) {
            throw new Error(
              "GPT-SoVITS requires a reference voice. Please upload and select a voice in TTS settings.",
            );
          }

          Logger.log(
            "other",
            `${logPrefix} - Sending TTS request to ${state.client}/audio/speech (text: ${text.substring(0, 50)}..., ref lang: ${refLang})`,
          );

          const response = await fetch(`${state.client}/audio/speech`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: text,
              reference_audio: referenceAudioBase64,
              reference_text: refText,
              reference_language: refLang,
            }),
          });

          Logger.log(
            "other",
            `${logPrefix} - TTS response received: ${response.status} ${response.statusText}`,
          );

          if (!response.ok) {
            const errorText = await response
              .text()
              .catch(() => "Unable to read error");
            Logger.error(
              "other",
              `${logPrefix} - TTS request failed:`,
              errorText,
            );
            throw new Error(
              `TTS request failed: ${response.status} ${response.statusText}`,
            );
          }

          if (state.isStopped) {
            state.isGenerating = false;
            return null;
          }

          const arrayBuffer = await response.arrayBuffer();
          const contentType =
            response.headers.get("content-type") || "audio/mpeg";

          state.isGenerating = false;
          Logger.log(
            "other",
            `${logPrefix} - Speech generated (${arrayBuffer.byteLength} bytes, ${contentType})`,
          );
          return { audioBuffer: arrayBuffer, mimeType: contentType };
        }

        // For other providers, use OpenAI client
        const response = await state.client.audio.speech.create({
          model: state.config.model,
          voice: state.config.voice,
          input: text,
          speed: state.config.speed,
        });

        if (state.isStopped) {
          state.isGenerating = false;
          return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const contentType =
          response.headers?.get("content-type") ||
          response.type ||
          "audio/mpeg";

        state.isGenerating = false;
        Logger.log(
          "other",
          `${logPrefix} - Speech generated (${arrayBuffer.byteLength} bytes, ${contentType})`,
        );
        return { audioBuffer: arrayBuffer, mimeType: contentType };
      } catch (error) {
        state.isGenerating = false;
        Logger.error(
          "other",
          `${logPrefix} - Speech generation failed:`,
          error,
        );
        throw asError(error);
      }
    }

    while (state.activeRequests >= state.maxConcurrentRequests) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (state.isStopped) return null;
    }

    state.activeRequests++;
    try {
      Logger.log(
        "other",
        `${logPrefix} - Generating speech (${text.length} chars)${generateRecordedLipSync && state.lipSyncEnabled ? " with generated lip sync" : liveLipSyncReady ? " with live lip sync" : ""}`,
      );

      let arrayBuffer;
      let contentType = "audio/mpeg";

      if (
        state.provider === TTSProviders.DESKTOP_LOCAL ||
        state.provider === TTSProviders.GPTSOVITS_REMOTE
      ) {
        let referenceAudioBase64 = null;
        let refText = state.config.referenceText;
        let refLang = state.config.referenceLanguage;

        if (state.config.referenceVoiceId) {
          try {
            Logger.log(
              "other",
              `${logPrefix} - Loading voice ${state.config.referenceVoiceId} from IndexedDB...`,
            );
            const voiceData = await voiceStorageService.getVoice(
              state.config.referenceVoiceId,
            );
            if (!voiceData) {
              throw new Error(
                `Voice ${state.config.referenceVoiceId} not found in IndexedDB`,
              );
            }
            const voice = voiceData as {
              audioData?: Blob;
              referenceText?: string;
              language?: string;
            };
            if (!voice.audioData) {
              throw new Error("Voice data missing audioData blob");
            }
            Logger.log(
              "other",
              `${logPrefix} - Converting blob to base64 (${voice.audioData.size} bytes)...`,
            );
            const audioArrayBuffer = await voice.audioData.arrayBuffer();
            const audioBytes = new Uint8Array(audioArrayBuffer);
            const binaryString = Array.from(audioBytes)
              .map((b) => String.fromCharCode(b))
              .join("");
            referenceAudioBase64 = btoa(binaryString);
            refText = voice.referenceText;
            refLang = voice.language;
            Logger.log(
              "other",
              `${logPrefix} - Reference audio loaded and encoded (base64 length: ${referenceAudioBase64.length})`,
            );
          } catch (error) {
            Logger.error(
              "other",
              `${logPrefix} - Failed to load reference audio from IndexedDB:`,
              error,
            );
            throw new Error(
              `Failed to load reference voice: ${asError(error).message}`,
            );
          }
        }

        if (!referenceAudioBase64 || !refText) {
          throw new Error(
            "GPT-SoVITS requires a reference voice. Please upload and select a voice in TTS settings.",
          );
        }

        Logger.log(
          "other",
          `${logPrefix} - Sending TTS request to ${state.client}/audio/speech (text: ${text.substring(0, 50)}..., ref lang: ${refLang})`,
        );

        const response = await fetch(`${state.client}/audio/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: text,
            reference_audio: referenceAudioBase64,
            reference_text: refText,
            reference_language: refLang,
          }),
        });

        Logger.log(
          "other",
          `${logPrefix} - TTS response received: ${response.status} ${response.statusText}`,
        );

        if (!response.ok) {
          const errorText = await response
            .text()
            .catch(() => "Unable to read error response");
          throw new Error(
            `TTS request failed: ${response.status} ${response.statusText}: ${errorText}`,
          );
        }

        arrayBuffer = await response.arrayBuffer();
        contentType = response.headers.get("content-type") || "audio/mpeg";

        if (arrayBuffer.byteLength === 0) {
          throw new Error("GPT-SoVITS returned an empty audio response");
        }

        if (state.isStopped) {
          Logger.warn(
            "other",
            `${logPrefix} - Discarding ${arrayBuffer.byteLength} generated audio bytes because playback was stopped while the request was running`,
          );
          return null;
        }

        Logger.log(
          "other",
          `${logPrefix} - Speech generated (${arrayBuffer.byteLength} bytes, ${contentType})`,
        );
      } else {
        // For other providers, use OpenAI client
        const response = await state.client.audio.speech.create({
          model: state.config.model,
          voice: state.config.voice,
          input: text,
          speed: state.config.speed,
        });

        if (state.isStopped) return null;

        arrayBuffer = await response.arrayBuffer();
      }

      const blob = new Blob([arrayBuffer], { type: contentType });

      let bvmdUrl = null;
      if (generateRecordedLipSync && state.lipSyncEnabled) {
        try {
          if (state.isStopped) return null;

          // Use Worker for audio processing (SharedWorker in dev, regular Worker in Android)
          Logger.log(
            "other",
            `${logPrefix} - Processing audio with lip sync via Worker...`,
          );

          // Initialize worker client if needed
          await audioWorkerClient.init();

          // Process audio in worker (AudioContext on main thread, heavy work in worker)
          const result =
            await audioWorkerClient.processAudioWithLipSync(arrayBuffer);

          // Convert bvmdData array to blob URL
          if (
            result.bvmdData &&
            Array.isArray(result.bvmdData) &&
            result.bvmdData.length > 0
          ) {
            const bvmdUint8 = new Uint8Array(result.bvmdData);
            const bvmdBlob = new Blob([bvmdUint8], {
              type: "application/octet-stream",
            });
            bvmdUrl = URL.createObjectURL(bvmdBlob);
            Logger.log(
              "other",
              `${logPrefix} - BVMD generated via SharedWorker:`,
              bvmdUrl,
            );
          }
        } catch (e) {
          Logger.error(
            "other",
            `${logPrefix} - Lip sync generation failed:`,
            e,
          );
        }
      }

      return { audio: blob, bvmdUrl };
    } catch (error) {
      Logger.error("other", `${logPrefix} - Speech generation failed:`, error);
      throw asError(error);
    } finally {
      state.activeRequests--;
    }
  }

  /**
   * Split text into natural chunks for TTS
   * Tries to break at sentence boundaries for natural speech
   * @param {string} text - Text to chunk
   * @param {number} maxChunkSize - Maximum chunk size in characters
   * @param {number} minChunkSize - Minimum chunk size before forced split
   * @returns {string[]} Array of text chunks
   */
  chunkText(text: string, maxChunkSize = 500, minChunkSize = 100): string[] {
    const chunks: string[] = [];
    let currentChunk = "";

    // First, normalize the text - replace multiple newlines with double newlines
    // and ensure proper spacing
    const normalizedText = text
      .replace(/\r\n/g, "\n") // Normalize line endings
      .replace(/\n{3,}/g, "\n\n") // Max 2 consecutive newlines
      .trim();

    // Split by both sentence boundaries AND newlines
    // This regex captures sentences ending with .!? OR text followed by newline
    const sentences = normalizedText.match(
      /[^.!?\n]+[.!?]+[\s]*|[^.!?\n]+\n+|[^.!?\n]+$/g,
    ) || [normalizedText];

    for (const sentence of sentences) {
      const trimmed = sentence.trim();

      if (!trimmed) continue;

      // If adding this sentence would exceed max size
      if (currentChunk.length + trimmed.length > maxChunkSize) {
        // If we have a chunk that's at least minimum size, save it
        if (currentChunk.length >= minChunkSize) {
          chunks.push(currentChunk.trim());
          currentChunk = trimmed;
        } else {
          // Current chunk is too small, add sentence anyway
          currentChunk += (currentChunk ? " " : "") + trimmed;
        }
      } else {
        // Add sentence to current chunk with proper spacing
        currentChunk += (currentChunk ? " " : "") + trimmed;
      }
    }

    // Add remaining chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    Logger.log(
      "TTSService",
      "Text chunked into ${chunks.length} parts:",
      chunks.map((c) => c.substring(0, 50) + "..."),
    );

    return chunks;
  }

  /**
   * Generate and queue audio chunks from text with lip sync (VMD -> BVMD)
   * @param {string} text - Full text to convert
   * @param {Function} onChunkReady - Callback when chunk is ready: (text: string, audioUrl: string, bvmdUrl: string|null, index: number, total: number) => void
   * @param {number} maxChunkSize - Maximum chunk size
   * @param {number} minChunkSize - Minimum chunk size
   * @param {string} sessionId - Optional session ID for this generation request
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<Array<{text: string, audioUrl: string, bvmdUrl: string|null, sessionId: string|null}>>} Array of text, audio URLs and BVMD URLs
   */
  async generateChunkedSpeech(
    text: string,
    onChunkReady: ((...args: any[]) => void | Promise<void>) | null = null,
    maxChunkSize = 500,
    minChunkSize = 100,
    sessionId: string | null = null,
    tabId: number | null = null,
  ): Promise<any> {
    // In extension mode, generateChunkedSpeech will not create Blob URLs; background will return arrays
    if (this.isExtensionMode) {
      const chunks = this.chunkText(text, maxChunkSize, minChunkSize);
      let generatedCount = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        try {
          const result = await this.generateSpeech(chunk, false, tabId);
          if (!result) continue;
          if (onChunkReady) await onChunkReady(result.audioBuffer, i);
          generatedCount++;
        } catch (error) {
          Logger.error(
            "TTSService",
            "Tab ${tabId} - Failed to generate chunk ${i + 1}:",
            error,
          );
        }
      }
      return generatedCount;
    }

    // Dev mode: existing behavior
    if (!this.isConfigured()) {
      Logger.warn(
        "TTSService",
        "TTS not configured, skipping speech generation",
      );
      return [];
    }

    const chunks = this.chunkText(text, maxChunkSize, minChunkSize);
    const results = [];
    const failures: Error[] = [];
    let cancelledChunks = 0;

    Logger.log(
      "TTSService",
      `Generating ${chunks.length} audio chunks${this.lipSyncEnabled ? " with lip sync" : ""} [Session: ${sessionId}]`,
    );

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      try {
        const result = await this.generateSpeech(chunk, this.lipSyncEnabled);
        if (!result) {
          cancelledChunks += 1;
          continue;
        }
        const { audio, bvmdUrl } = result;
        const audioUrl = URL.createObjectURL(audio);
        this.blobUrls.add(audioUrl);
        const chunkResult = { text: chunk, audioUrl, bvmdUrl, sessionId };
        results.push(chunkResult);
        if (onChunkReady)
          onChunkReady(chunk, audioUrl, bvmdUrl, i, chunks.length);
      } catch (error) {
        const failure = asError(error);
        failures.push(failure);
        Logger.error(
          "TTSService",
          `Failed to generate chunk ${i + 1}/${chunks.length}:`,
          failure,
        );
      }
    }

    if (results.length === 0 && failures.length > 0) {
      throw failures[0];
    }

    if (results.length === 0 && cancelledChunks > 0) {
      Logger.warn(
        "TTSService",
        `All ${cancelledChunks} generated chunk(s) were discarded because TTS playback was stopped`,
      );
    }

    return results;
  }

  /**
   * Get current audio queue length (for just-in-time generation)
   * @returns {number} Number of audio items in queue
   */
  getQueueLength(): number {
    return this.audioQueue.length;
  }

  /**
   * Check if audio is currently playing or queued
   * @returns {boolean} True if audio is playing or in queue
   */
  isAudioActive(): boolean {
    return this.isPlaying || this.audioQueue.length > 0;
  }

  /**
   * Add audio to playback queue with optional BVMD and text
   * @param {string} text - Text being spoken
   * @param {string} audioUrl - Audio blob URL
   * @param {string|null} bvmdUrl - Optional BVMD blob URL for lip sync
   * @param {string} sessionId - Unique session ID for this playback request
   */
  queueAudio(
    text: string,
    audioUrl: string,
    bvmdUrl: string | null = null,
    sessionId: string | null = null,
  ): void {
    // Generate session ID if not provided (for new playback requests)
    const effectiveSessionId =
      sessionId ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // If this is a NEW session (different from current), stop the current one
    if (
      sessionId &&
      this.currentPlaybackSession &&
      sessionId !== this.currentPlaybackSession
    ) {
      Logger.log(
        "TTSService",
        `New session ${sessionId} requested, stopping current session ${this.currentPlaybackSession}`,
      );
      this.stopPlayback();
    }

    // Don't queue if globally stopped (covers case where session was cleared)
    if (this.isStopped) {
      Logger.log(
        "TTSService",
        `Audio not queued - playback stopped globally (session: ${effectiveSessionId})`,
      );
      return;
    }

    // If starting a new session, check if it was previously stopped
    if (sessionId) {
      // Reject late-arriving chunks from stopped sessions (important for extension mode with WASM delays)
      if (this.stoppedSessionIds.has(sessionId)) {
        Logger.log(
          "TTSService",
          `Rejecting audio from stopped session ${sessionId} (late-arriving chunk)`,
        );
        return;
      }

      this.isStopped = false;
      this.currentPlaybackSession = sessionId;
    }

    this.audioQueue.push({
      text,
      audioUrl,
      bvmdUrl,
      sessionId: effectiveSessionId,
    });
    Logger.log(
      "TTSService",
      `Audio queued (${this.audioQueue.length} in queue)${bvmdUrl ? " with lip sync" : ""} [Session: ${effectiveSessionId}]`,
    );

    // Start playing if not already playing
    if (!this.isPlaying) {
      this.playNextInQueue();
    }
  }

  /**
   * Play next audio in queue
   */
  async playNextInQueue(): Promise<void> {
    // Check if stopped
    if (this.isStopped) {
      this.isPlaying = false;
      Logger.log("TTSService", "Playback stopped by flag");
      return;
    }

    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      Logger.log("TTSService", "Queue empty, playback stopped");
      return;
    }

    this.isPlaying = true;
    const item = this.audioQueue.shift();
    if (!item) {
      this.isPlaying = false;
      return;
    }

    // Handle both old format (string) and new format (object)
    const text = typeof item === "object" ? item.text : "";
    const audioUrl = typeof item === "string" ? item : item.audioUrl;
    const bvmdUrl = typeof item === "object" ? item.bvmdUrl : null;
    const sessionId = typeof item === "object" ? item.sessionId : null;

    try {
      await this.playAudio(text, audioUrl, bvmdUrl, sessionId);
    } catch (error) {
      Logger.error("TTSService", "Playback error:", error);
    }

    // Dispatch audioFinished event when this audio finishes
    // This is for sliding window TTS generation
    this._dispatchEvent("audioFinished");

    // DON'T recursively call playNextInQueue here!
    // The audio.onended handler will call playNextInQueue when the current audio finishes
    // Calling it here causes simultaneous playback of multiple audio chunks
  }

  /**
   * Play a single audio blob URL with optional BVMD lip sync
   * Triggers speak callback for animation synchronization
   * @param {string} text - Text being spoken
   * @param {string} audioUrl - Audio blob URL
   * @param {string|null} bvmdUrl - Optional BVMD blob URL for lip sync
   * @param {string|null} sessionId - Session ID for this audio
   * @returns {Promise<void>} Resolves when audio finishes
   */
  playAudio(
    text: string,
    audioUrl: string,
    bvmdUrl: string | null = null,
    sessionId: string | null = null,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if this audio belongs to the current session
      if (
        sessionId &&
        this.currentPlaybackSession &&
        sessionId !== this.currentPlaybackSession
      ) {
        Logger.log(
          "TTSService",
          `Skipping audio from old session ${sessionId} (current: ${this.currentPlaybackSession})`,
        );
        resolve(); // Don't reject, just skip
        return;
      }

      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      let usingLiveLipSync = false;
      let usingGenericLipSync = false;

      // Trigger events when audio starts playing
      audio.addEventListener(
        "play",
        () => {
          Logger.log("TTSService", "Audio playback started");

          // Dispatch speak event for animation synchronization
          if (bvmdUrl) {
            this._dispatchEvent("speak", { text, bvmdUrl, sessionId });
          }

          // Dispatch audioStart event ONLY for first audio in current session
          if (this.currentPlaybackSession && !this.hasSessionStarted) {
            this.hasSessionStarted = true;
            Logger.log(
              "TTSService",
              `Dispatching audioStart event for session: ${this.currentPlaybackSession}`,
            );
            this._dispatchEvent("audioStart", {
              sessionId: this.currentPlaybackSession,
            });
          }
        },
        { once: true },
      );

      audio.onended = () => {
        Logger.log("TTSService", "Audio playback finished");
        liveLipSyncService.detach(audio);
        this.currentAudio = null;

        // Check if there's more in queue FIRST
        const hasMore = this.audioQueue.length > 0;

        // Play next or signal end
        if (hasMore) {
          this.playNextInQueue();
        } else {
          // No more audio in queue
          this.isPlaying = false;
          const finalSessionId = this.currentPlaybackSession;

          // Only dispatch audioEnd if session is COMPLETE (all chunks generated)
          // This prevents firing the event while more chunks are still being generated
          const sessionComplete =
            finalSessionId && this.isSessionComplete(finalSessionId);

          if (sessionComplete) {
            // All chunks generated AND queue empty - truly done
            this.currentPlaybackSession = null;
            this.hasSessionStarted = false;
            // DON'T delete from completedSessions yet - late-arriving chunks might still reference it
            // It will be cleaned up when a new session starts or when resumePlayback() is called
            Logger.log(
              "TTSService",
              `Queue empty and session complete, dispatching audioEnd for: ${finalSessionId}`,
            );
            this._dispatchEvent("audioEnd", { sessionId: finalSessionId });
          } else {
            // Queue empty but more chunks might be coming - don't dispatch audioEnd yet
            Logger.log(
              "TTSService",
              `Queue empty but session not complete yet (${finalSessionId}), waiting for more chunks...`,
            );
          }
        }

        resolve();
      };

      audio.onerror = (error: Event | string) => {
        Logger.error("TTSService", "Audio playback error:", error);
        liveLipSyncService.detach(audio);
        this.currentAudio = null;

        reject(error);
      };

      const startPlayback = async () => {
        // A generated BVMD means live initialization failed earlier, so keep
        // the original animation path. Otherwise analyze the actual media
        // element in real time and delay only the audible output slightly.
        if (!bvmdUrl) {
          usingLiveLipSync = await liveLipSyncService.attach(audio);
          usingGenericLipSync = !usingLiveLipSync;
        }
        await audio.play();
        Logger.log(
          "TTSService",
          `Audio playback started${usingLiveLipSync ? " with accurate live lip sync" : usingGenericLipSync ? " with generic lip sync" : bvmdUrl ? " with generated lip sync" : ""}`,
        );
      };

      void startPlayback().catch((error) => {
        liveLipSyncService.detach(audio);
        reject(error);
      });
    });
  }

  /**
   * Play audio chunks sequentially with BVMD lip sync
   * @param {Array<{text: string, audioUrl: string, bvmdUrl: string|null, sessionId: string|null}>} items - Array of text, audio URLs and BVMD URLs
   * @param {string} sessionId - Session ID for this playback sequence
   * @returns {Promise<void>} Resolves when all audio finishes
   */
  async playAudioSequence(
    items: Array<QueueItem | string>,
    sessionId: string | null = null,
  ): Promise<void> {
    Logger.log(
      "TTSService",
      `Playing ${items.length} audio chunks sequentially [Session: ${sessionId}]`,
    );

    // Set current session if provided
    if (sessionId) {
      // If there's a different session playing, stop it first
      if (
        this.currentPlaybackSession &&
        sessionId !== this.currentPlaybackSession
      ) {
        Logger.log(
          "TTSService",
          `Stopping current session ${this.currentPlaybackSession} for new session ${sessionId}`,
        );
        this.stopPlayback();
      }
      this.currentPlaybackSession = sessionId;
      this.isStopped = false; // Clear stopped flag for new session

      // Mark session as complete RIGHT NOW before playing
      // This way when the last audio finishes, audio.onended will see it as complete
      this.markSessionComplete(sessionId);
      Logger.log(
        "TTSService",
        `Session ${sessionId} marked complete BEFORE playback starts`,
      );
    }

    for (const item of items) {
      try {
        // Handle both old format (string) and new format (object)
        const text = typeof item === "object" ? item.text : "";
        const audioUrl = typeof item === "string" ? item : item.audioUrl;
        const bvmdUrl = typeof item === "object" ? item.bvmdUrl : null;
        const itemSessionId =
          typeof item === "object" ? item.sessionId : sessionId;

        await this.playAudio(text, audioUrl, bvmdUrl, itemSessionId);
      } catch (error) {
        Logger.error("TTSService", "Error playing audio chunk:", error);
        // Continue with next chunk
      }
    }

    Logger.log("TTSService", "Sequence playback complete");
    // Session was already marked complete at the start
  }

  /**
   * Stop current playback and clear queue
   * Returns a Promise that resolves when stop is complete
   */
  stopPlayback(): void {
    Logger.log("TTSService", "Stopping playback...");

    // Save current session ID before clearing
    const stoppedSessionId = this.currentPlaybackSession;

    // Track this session as stopped to reject late-arriving chunks
    if (stoppedSessionId) {
      this.stoppedSessionIds.add(stoppedSessionId);
      Logger.log(
        "TTSService",
        `Added session ${stoppedSessionId} to stopped sessions list`,
      );
    }

    // Set stopped flag to prevent new audio from starting
    this.isStopped = true;

    // Stop current audio and clean up
    if (this.currentAudio) {
      liveLipSyncService.detach(this.currentAudio);
      this.currentAudio.pause();
      // Force the audio to end to resolve any pending Promise
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    // Clear queue completely
    this.audioQueue = [];
    this.isPlaying = false;

    // Clear current session AND reset session started flag
    this.currentPlaybackSession = null;
    this.hasSessionStarted = false; // CRITICAL: Reset so next session can fire audioStart

    Logger.log("TTSService", "Playback stopped and queue cleared");

    // Dispatch stop event to notify animation manager
    this._dispatchEvent("stop");
  }

  /**
   * Resume playback (clear stopped flag)
   * Call this before starting new TTS generation
   */
  resumePlayback(): void {
    Logger.log(
      "TTSService",
      "Resuming playback (clearing stopped flag and stopped sessions)",
    );
    this.isStopped = false;
    this.stoppedSessionIds.clear();
  }

  // Extension-only controls (stop/resume generation)
  stopGeneration(tabId: number | null = null): void {
    if (this.isExtensionMode) {
      const state = this._getState(tabId);
      state.isStopped = true;
      return;
    }
    this.isStopped = true;
  }

  resumeGeneration(tabId: number | null = null): void {
    if (this.isExtensionMode) {
      const state = this._getState(tabId);
      state.isStopped = false;
      return;
    }
    this.isStopped = false;
  }

  /**
   * Generate speech using Kokoro TTS
   * @param {string} text - Text to synthesize
   * @param {boolean} generateLipSync - Generate lip sync data
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<{audio: Blob, bvmdUrl: string|null}>} Audio blob and optional BVMD URL
   */
  async generateKokoroSpeech(
    text: string,
    generateLipSync = true,
    tabId: number | null = null,
  ): Promise<any> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[TTSService] Tab ${tabId}`
      : "[TTSService]";

    try {
      Logger.log(
        "other",
        `${logPrefix} - Generating Kokoro speech (${text.length} chars)${generateLipSync && state.lipSyncEnabled ? " with lip sync" : ""}`,
      );

      if (state.isStopped) return null;

      // Generate audio using Kokoro TTS via worker
      const audioBuffer = await audioWorkerClient.generateKokoroSpeech(text, {
        voice: state.config.voice,
        speed: state.config.speed,
      });

      if (state.isStopped) return null;

      // Convert ArrayBuffer to Blob
      const blob = new Blob([audioBuffer], { type: "audio/wav" }); // Kokoro outputs WAV

      let bvmdUrl = null;
      if (generateLipSync && state.lipSyncEnabled) {
        try {
          if (state.isStopped) return null;

          Logger.log(
            "other",
            `${logPrefix} - Processing Kokoro audio with lip sync...`,
          );

          // Process audio in worker for lip sync
          const result =
            await audioWorkerClient.processAudioWithLipSync(audioBuffer);

          // Convert bvmdData array to blob URL
          if (
            result.bvmdData &&
            Array.isArray(result.bvmdData) &&
            result.bvmdData.length > 0
          ) {
            const bvmdUint8 = new Uint8Array(result.bvmdData);
            const bvmdBlob = new Blob([bvmdUint8], {
              type: "application/octet-stream",
            });
            bvmdUrl = URL.createObjectURL(bvmdBlob);

            if (!this.isExtensionMode) {
              this.blobUrls.add(bvmdUrl);
            }

            Logger.log("other", `${logPrefix} - BVMD generated:`, bvmdUrl);
          }
        } catch (lipSyncError) {
          Logger.error(
            "other",
            `${logPrefix} - Lip sync generation failed (continuing without it):`,
            lipSyncError,
          );
        }
      }

      Logger.log(
        "other",
        `${logPrefix} - Kokoro speech generated successfully`,
      );
      return { audio: blob, bvmdUrl };
    } catch (error) {
      Logger.error(
        "other",
        `${logPrefix} - Kokoro speech generation failed:`,
        error,
      );
      throw asError(error);
    }
  }

  /**
   * Initialize Kokoro TTS model
   * @param {Function} progressCallback - Progress callback (progress) => {}
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<boolean>} Success status
   */
  async initializeKokoro(
    progressCallback: ((progress: unknown) => void) | null = null,
    tabId: number | null = null,
  ): Promise<boolean> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[TTSService] Tab ${tabId}`
      : "[TTSService]";

    if (!state.enabled) {
      throw new Error("TTS is not enabled");
    }

    if (state.provider !== TTSProviders.KOKORO) {
      throw new Error("Kokoro TTS not configured as provider");
    }

    try {
      Logger.log("other", `${logPrefix} - Initializing Kokoro TTS...`);

      // Dev mode: Initialize worker client for SharedWorker
      // Extension mode: This method is NOT called - TTSServiceProxy handles it directly
      await audioWorkerClient.init();

      // Initialize Kokoro model via SharedWorker (dev mode only)
      const result = await audioWorkerClient.initKokoro(
        {
          modelId: state.config.modelId,
          device: state.config.device,
          // NOTE: dtype is auto-determined in KokoroTTSCore based on device
        },
        progressCallback,
      );

      Logger.log(
        "other",
        `${logPrefix} - Kokoro TTS initialized:`,
        result.message,
      );

      // Generate a test audio to fully warm up the model (ensures it's truly ready)
      Logger.log(
        "other",
        `${logPrefix} - Warming up model with test generation...`,
      );
      try {
        await audioWorkerClient.generateKokoroSpeech("ready", {
          voice: state.config.voice,
          speed: state.config.speed,
        });
        Logger.log(
          "other",
          `${logPrefix} - Model warmup complete, fully initialized`,
        );
      } catch (warmupError) {
        Logger.warn(
          "other",
          `${logPrefix} - Model warmup failed (continuing anyway):`,
          warmupError,
        );
      }

      // Start heartbeat if keepModelLoaded is enabled
      if (state.config.keepModelLoaded !== false) {
        Logger.log(
          "other",
          `${logPrefix} - Starting Kokoro heartbeat (keepModelLoaded: true)`,
        );
        this.startKokoroHeartbeat(10000); // 10 seconds
      }

      return (result as { initialized?: boolean }).initialized === true;
    } catch (error) {
      Logger.error(
        "other",
        `${logPrefix} - Kokoro initialization failed:`,
        error,
      );
      throw asError(error);
    }
  }

  /**
   * Check Kokoro TTS status
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<Object>} Status object
   */
  async checkKokoroStatus(tabId: number | null = null): Promise<unknown> {
    const logPrefix = this.isExtensionMode
      ? `[TTSService] Tab ${tabId}`
      : "[TTSService]";

    try {
      // Initialize worker client if needed
      await audioWorkerClient.init();

      const status = await audioWorkerClient.checkKokoroStatus();
      Logger.log("other", `${logPrefix} - Kokoro status:`, status);
      return status;
    } catch (error) {
      Logger.error(
        "other",
        `${logPrefix} - Kokoro status check failed:`,
        error,
      );
      throw asError(error);
    }
  }

  /**
   * List available Kokoro voices
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<string[]>} Array of voice IDs
   */
  async listKokoroVoices(tabId: number | null = null): Promise<string[]> {
    const logPrefix = this.isExtensionMode
      ? `[TTSService] Tab ${tabId}`
      : "[TTSService]";

    try {
      // Initialize worker client if needed
      await audioWorkerClient.init();

      const voices = await audioWorkerClient.listKokoroVoices();
      Logger.log("other", `${logPrefix} - Kokoro voices:`, voices.length);
      return voices;
    } catch (error) {
      Logger.error("other", `${logPrefix} - Kokoro list voices failed:`, error);
      throw asError(error);
    }
  }

  /**
   * Get Kokoro cache size
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<Object>} Cache size information
   */
  async getKokoroCacheSize(tabId: number | null = null): Promise<unknown> {
    const logPrefix = this.isExtensionMode
      ? `[TTSService] Tab ${tabId}`
      : "[TTSService]";

    try {
      // Initialize worker client if needed
      await audioWorkerClient.init();

      const sizeInfo = await audioWorkerClient.getKokoroCacheSize();
      Logger.log("other", `${logPrefix} - Kokoro cache size:`, sizeInfo);
      return sizeInfo;
    } catch (error) {
      Logger.error(
        "other",
        `${logPrefix} - Kokoro cache size check failed:`,
        error,
      );
      throw asError(error);
    }
  }

  /**
   * Ping Kokoro to keep model loaded in memory (heartbeat)
   * Only for dev mode - extension mode uses TTSServiceProxy
   * @returns {Promise<boolean>} True if model is alive
   */
  async pingKokoro(): Promise<boolean> {
    try {
      const state = this._getState(null);

      // Initialize worker if needed
      await audioWorkerClient.init();

      // Check if initialized first
      const status = await audioWorkerClient.checkKokoroStatus();
      if (!status.initialized) {
        return false;
      }

      // Generate one word to keep model alive (use configured voice)
      await audioWorkerClient.generateKokoroSpeech("hi", {
        voice: state.config.voice,
        speed: state.config.speed,
      });

      return true;
    } catch {
      // Silent failure for heartbeat
      return false;
    }
  }

  /**
   * Clear Kokoro cache and reset model
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<boolean>} Success status
   */
  async clearKokoroCache(tabId: number | null = null): Promise<boolean> {
    const logPrefix = this.isExtensionMode
      ? `[TTSService] Tab ${tabId}`
      : "[TTSService]";

    try {
      // Stop heartbeat before clearing cache
      this.stopKokoroHeartbeat();

      // Initialize worker client if needed
      await audioWorkerClient.init();

      const cleared = await audioWorkerClient.clearKokoroCache();
      Logger.log("other", `${logPrefix} - Kokoro cache cleared:`, cleared);
      return cleared;
    } catch (error) {
      Logger.error("other", `${logPrefix} - Kokoro cache clear failed:`, error);
      throw asError(error);
    }
  }

  /**
   * Start Kokoro heartbeat to keep model loaded in memory
   * Generates small audio periodically to prevent model unload
   * Works in both dev mode and extension mode via TTSServiceProxy
   * @param {number} intervalMs - Heartbeat interval in milliseconds (default: 10000 = 10 seconds)
   */
  startKokoroHeartbeat(intervalMs = 10000): void {
    if (this.kokoroHeartbeatInterval) {
      Logger.log("TTSService", "Kokoro heartbeat already running");
      return;
    }

    Logger.log(
      "TTSService",
      `Starting Kokoro heartbeat (interval: ${intervalMs}ms)`,
    );
    this.kokoroHeartbeatEnabled = true;

    this.kokoroHeartbeatInterval = setInterval(async () => {
      if (!this.kokoroHeartbeatEnabled) {
        return;
      }

      try {
        // Use the same method for both dev and extension mode
        await this.pingKokoro();
      } catch {
        // Silent error - heartbeat will retry next interval
      }
    }, intervalMs);
  }

  /**
   * Stop Kokoro heartbeat
   */
  stopKokoroHeartbeat(): void {
    if (this.kokoroHeartbeatInterval) {
      Logger.log("TTSService", "Stopping Kokoro heartbeat");
      clearInterval(this.kokoroHeartbeatInterval);
      this.kokoroHeartbeatInterval = null;
      this.kokoroHeartbeatEnabled = false;
    }
  }

  /**
   * Clean up blob URLs (audio and BVMD)
   * @param {string[]} urls - Optional specific URLs to revoke, or all if not provided
   */
  cleanupBlobUrls(urls: string[] | null = null): void {
    if (this.isExtensionMode) {
      // In extension mode, just revoke the provided URLs
      // Blob URLs are created in main world (TTSServiceProxy), not tracked here
      if (urls) {
        urls.forEach((url) => {
          URL.revokeObjectURL(url);
        });
        Logger.log("TTSService", `Revoked ${urls.length} blob URLs`);
      }
    } else {
      // Dev mode: track and manage blob URLs
      if (urls) {
        urls.forEach((url) => {
          URL.revokeObjectURL(url);
          this.blobUrls.delete(url);
        });
        Logger.log("TTSService", `Cleaned up ${urls.length} blob URLs`);
      } else {
        this.blobUrls.forEach((url) => URL.revokeObjectURL(url));
        Logger.log(
          "TTSService",
          `Cleaned up all ${this.blobUrls.size} blob URLs`,
        );
        this.blobUrls.clear();
      }
    }
    // Worker handles its own cleanup in dev mode
  }

  /**
   * Check if TTS is currently playing audio
   * @returns {boolean} True if audio is playing
   */
  isCurrentlyPlaying(tabId: number | null = null): boolean {
    if (this.isExtensionMode) {
      if (tabId === null) return false;
      const state = this.tabStates.get(tabId);
      return state?.isGenerating === true;
    }
    // Check if there's an actual audio element currently playing
    return this.currentAudio !== null;
  }

  /**
   * Test TTS with sample text
   * @param {string} testText - Text to test with
   * @returns {Promise<boolean>} True if successful
   */
  async testConnection(
    testText = "Hello, this is a test of the text to speech system.",
    tabId: number | null = null,
  ): Promise<boolean> {
    if (this.isExtensionMode) {
      if (!this.isConfigured(tabId))
        throw new Error("TTSService not configured for this tab");
      const result = await this.generateSpeech(testText, false, tabId);
      return result && result.audioBuffer && result.audioBuffer.byteLength > 0;
    }

    if (!this.isConfigured())
      throw new Error("TTSService not configured or disabled");
    Logger.log("TTSService", "Testing TTS connection...");
    try {
      const { audio, bvmdUrl } = await this.generateSpeech(
        testText,
        this.lipSyncEnabled,
      );
      const audioUrl = URL.createObjectURL(audio);
      await this.playAudio(testText, audioUrl, bvmdUrl);
      URL.revokeObjectURL(audioUrl);
      if (bvmdUrl) URL.revokeObjectURL(bvmdUrl); // Clean up BVMD URL
      Logger.log(
        "TTSService",
        "TTS test successful" + (bvmdUrl ? " with lip sync" : ""),
      );
      return true;
    } catch (error) {
      Logger.error("TTSService", "TTS test failed:", error);
      throw asError(error);
    }
  }
}

// Export singleton instance
export default new TTSService();
