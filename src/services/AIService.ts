/**
 * AIService - Multi-provider AI service
 *
 * Unified interface for Chrome AI, OpenAI, and Ollama.
 */

import OpenAI from "openai";
import { AIProviders } from "../config/aiConfig";
import { PromptConfig } from "../config/promptConfig";
import ChromeAIValidator from "./ChromeAIValidator";
import Logger from "./LoggerService";
import FrameCaptureService from "./FrameCaptureService";
import { isExtension } from "../utils/PlatformUtils";
import { ThinkStreamSplitter } from "../utils/thinking";

type AIMessage = Record<string, any>;
type SendResult = {
  success: boolean;
  response: string | null;
  cancelled: boolean;
  error: Error | null;
  thinking?: string;
};
type RemoteModelListConfig = {
  provider: "openai" | "ollama" | "android-local" | "desktop-local";
  endpoint?: string;
  apiKey?: string;
};
type RemoteModelListResult = { models: string[]; error?: string };
type AIState = {
  client: any;
  config: any;
  fullConfig: any;
  provider: string | null;
  abortController: AbortController | null;
  chromeAISession: any;
  chromeAIUtilitySession: any;
};
const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

class AIService {
  private isExtensionMode: boolean;
  private tabStates: Map<number, AIState> = new Map();
  private client: any;
  private provider: string | null = null;
  private config: any;
  private abortController: AbortController | null = null;
  private chromeAISession: any;
  private chromeAIUtilitySession: any;

  constructor() {
    this.isExtensionMode = isExtension;

    if (this.isExtensionMode) {
      this.tabStates = new Map();
    } else {
      this.client = null;
      this.provider = null;
      this.config = null;
      this.abortController = null;
      this.chromeAISession = null;
      this.chromeAIUtilitySession = null; // Separate session for utility calls (analyzer, etc.)
    }
  }

  /**
   * Initialize state for a tab (extension mode only)
   * @param {number} tabId - Tab ID
   */
  initTab(tabId: number | null) {
    if (!this.isExtensionMode) return;
    if (tabId === null) return;

    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        client: null,
        config: null,
        fullConfig: null,
        provider: null,
        abortController: null,
        chromeAISession: null,
        chromeAIUtilitySession: null, // Separate session for utility calls (analyzer, etc.)
      });
      Logger.log("AIService", `Tab ${tabId} initialized`);
    }
  }

  _normalizeEndpoint(endpoint: string | undefined, fallback: string): string {
    let resolved = (endpoint || fallback).trim() || fallback;
    if (!resolved.endsWith("/v1")) {
      resolved = resolved.replace(/\/$/, "") + "/v1";
    }
    return resolved;
  }

  _resolveRemoteModelListUrl(config: RemoteModelListConfig): string {
    if (config.provider === "openai") {
      return "https://api.openai.com/v1/models";
    }

    if (config.provider === "android-local") {
      return `${this._normalizeEndpoint(config.endpoint, "http://127.0.0.1:8765")}/models`;
    }

    if (config.provider === "desktop-local") {
      return `${this._normalizeEndpoint(config.endpoint, "http://127.0.0.1:11438")}/models`;
    }

    return `${this._normalizeEndpoint(config.endpoint, "http://localhost:11434")}/models`;
  }

  _buildProviderRuntime(provider: string, providerConfig: any) {
    if (provider === AIProviders.OPENAI || provider === "openai") {
      return {
        client: new OpenAI({
          apiKey: providerConfig.apiKey,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        }),
        config: {
          model: providerConfig.model,
          temperature: providerConfig.temperature,
          maxTokens: providerConfig.maxTokens,
          enableImageSupport: providerConfig.enableImageSupport !== false,
          enableAudioSupport: providerConfig.enableAudioSupport !== false,
          thinkingEnabled: providerConfig.thinkingEnabled === true,
          thinkingEffort: providerConfig.thinkingEffort,
          routing: providerConfig.routing || { enabled: false },
        },
      };
    }

    if (provider === AIProviders.OLLAMA || provider === "ollama") {
      const endpoint = this._normalizeEndpoint(
        providerConfig.endpoint,
        "http://localhost:11434",
      );
      return {
        client: new OpenAI({
          apiKey: providerConfig.apiKey || "ollama",
          baseURL: endpoint,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        }),
        config: {
          model: providerConfig.model,
          temperature: providerConfig.temperature,
          maxTokens: providerConfig.maxTokens,
          enableImageSupport: providerConfig.enableImageSupport !== false,
          enableAudioSupport: providerConfig.enableAudioSupport !== false,
          thinkingEnabled: providerConfig.thinkingEnabled === true,
          thinkingEffort: providerConfig.thinkingEffort,
          routing: providerConfig.routing || { enabled: false },
        },
      };
    }

    if (
      provider === AIProviders.ANDROID_LOCAL ||
      provider === "android-local"
    ) {
      const endpoint = this._normalizeEndpoint(
        providerConfig.endpoint,
        "http://127.0.0.1:8765",
      );
      return {
        client: new OpenAI({
          apiKey: "android-local",
          baseURL: endpoint,
          dangerouslyAllowBrowser: true,
        }),
        config: {
          model: providerConfig.model || "qwen3-local",
          temperature: providerConfig.temperature || 0.7,
          maxTokens: providerConfig.maxTokens || 2048,
          thinkingEnabled: providerConfig.thinkingEnabled === true,
          thinkingEffort: providerConfig.thinkingEffort,
          enableImageSupport: false,
          routing: providerConfig.routing || { enabled: false },
          enableAudioSupport: false,
        },
      };
    }

    if (
      provider === AIProviders.DESKTOP_LOCAL ||
      provider === "desktop-local"
    ) {
      const endpoint = this._normalizeEndpoint(
        providerConfig.endpoint,
        "http://127.0.0.1:11438",
      );
      return {
        client: new OpenAI({
          apiKey: "desktop-local",
          baseURL: endpoint,
          dangerouslyAllowBrowser: true,
        }),
        config: {
          model: providerConfig.model || "qwen3:0.6b",
          temperature: providerConfig.temperature || 0.7,
          maxTokens: providerConfig.maxTokens || 2048,
          customModelsPath: providerConfig.customModelsPath || null,
          thinkingEnabled: providerConfig.thinkingEnabled === true,
          thinkingEffort: providerConfig.thinkingEffort,
          enableImageSupport: false,
          routing: providerConfig.routing || { enabled: false },
          enableAudioSupport: false,
        },
      };
    }

    throw new Error(`Unknown provider: ${provider}`);
  }

  _resolveRoutingTarget(
    modelConfig: any,
    fullConfig: any,
    provider: string | null,
  ) {
    if (!modelConfig || modelConfig.useSameAsMain) {
      return {
        modelOverride: null,
        providerOverride: null,
        configOverride: null,
        clientOverride: null,
      };
    }

    const currentProviderModelOverride =
      provider === "openai" || provider === "ollama"
        ? modelConfig.modelName || null
        : provider === "android-local" || provider === "desktop-local"
          ? modelConfig.selectedModel || null
          : null;

    const profileId =
      typeof modelConfig.profileId === "string"
        ? modelConfig.profileId.trim()
        : "";
    if (!profileId) {
      return {
        modelOverride: currentProviderModelOverride,
        providerOverride: null,
        configOverride: null,
        clientOverride: null,
      };
    }

    const profiles = Array.isArray(fullConfig?.remoteProfiles)
      ? fullConfig.remoteProfiles
      : [];
    const profile = profiles.find(
      (entry: any) => entry && entry.id === profileId,
    );

    if (!profile) {
      Logger.warn("AIService", `Routing profile not found: ${profileId}`);
      return {
        modelOverride: currentProviderModelOverride,
        providerOverride: null,
        configOverride: null,
        clientOverride: null,
      };
    }

    const runtime = this._buildProviderRuntime(profile.provider, profile);
    return {
      modelOverride: modelConfig.modelName || runtime.config.model || null,
      providerOverride: profile.provider,
      configOverride: { ...runtime.config, routing: { enabled: false } },
      clientOverride: runtime.client,
    };
  }

  /**
   * Cleanup tab state (extension mode only)
   * @param {number} tabId - Tab ID
   */
  cleanupTab(tabId: number | null) {
    if (!this.isExtensionMode) return;
    if (tabId === null) return;

    const state = this.tabStates.get(tabId);
    if (state) {
      if (state.abortController) {
        state.abortController.abort();
      }
      this.tabStates.delete(tabId);
      Logger.log("AIService", `Tab ${tabId} cleaned up`);
    }
  }

  /**
   * Get state object for current context
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Object} State object
   */
  _getState(tabId: number | null = null): any {
    if (this.isExtensionMode) {
      this.initTab(tabId);
      return this.tabStates.get(tabId as number) as AIState;
    }
    return this; // In dev mode, state is on the instance itself
  }

  /**
   * Configure AI client with provider settings
   * Dev mode: configure(config)
   * Extension mode: configure(config, tabId)
   * @param {Object} config - Config object
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<boolean>} Success status
   */
  configure(config: any, tabId: number | null = null) {
    const state = this._getState(tabId);
    const { provider } = config;
    const logPrefix = this.isExtensionMode
      ? `[AIService] Tab ${tabId}`
      : "[AIService]";
    Logger.log("other", `${logPrefix} - Configuring provider: ${provider}`);

    try {
      if (provider === AIProviders.CHROME_AI || provider === "chrome-ai") {
        if (!ChromeAIValidator.isSupported()) {
          throw new Error("Chrome AI not supported. Chrome 138+ required.");
        }

        const chromeAiConfig = config.chromeAi || config;
        const newImageSupport = chromeAiConfig.enableImageSupport !== false;
        const newAudioSupport = chromeAiConfig.enableAudioSupport !== false;

        // Check if image or audio support settings changed
        const imageSupportChanged =
          state.config && state.config.enableImageSupport !== newImageSupport;
        const audioSupportChanged =
          state.config && state.config.enableAudioSupport !== newAudioSupport;

        // If image or audio support changed, destroy existing session to force recreation
        if (
          (imageSupportChanged || audioSupportChanged) &&
          state.chromeAISession
        ) {
          Logger.log(
            "other",
            `${logPrefix} - Multi-modal support changed, destroying existing session`,
          );
          try {
            state.chromeAISession.destroy();
          } catch (error) {
            Logger.warn(
              "other",
              `${logPrefix} - Error destroying main session:`,
              error,
            );
          }
          state.chromeAISession = null;
        }

        // Also destroy utility session if multi-modal support changed
        if (
          (imageSupportChanged || audioSupportChanged) &&
          state.chromeAIUtilitySession
        ) {
          Logger.log(
            "other",
            `${logPrefix} - Multi-modal support changed, destroying utility session`,
          );
          try {
            state.chromeAIUtilitySession.destroy();
          } catch (error) {
            Logger.warn(
              "other",
              `${logPrefix} - Error destroying utility session:`,
              error,
            );
          }
          state.chromeAIUtilitySession = null;
        }

        state.config = {
          temperature: chromeAiConfig.temperature,
          topK: chromeAiConfig.topK,
          enableImageSupport: newImageSupport,
          enableAudioSupport: newAudioSupport,
        };

        Logger.log(
          "other",
          `${logPrefix} - Chrome AI configured:`,
          state.config,
        );
      } else if (provider === AIProviders.OPENAI || provider === "openai") {
        const openaiConfig = config.openai || config;
        const runtime = this._buildProviderRuntime(provider, openaiConfig);
        state.client = runtime.client;
        state.config = runtime.config;

        Logger.log("other", `${logPrefix} - OpenAI configured:`, {
          model: state.config.model,
          temperature: state.config.temperature,
          maxTokens: state.config.maxTokens,
        });
      } else if (provider === AIProviders.OLLAMA || provider === "ollama") {
        const ollamaConfig = config.ollama || config;
        const runtime = this._buildProviderRuntime(provider, ollamaConfig);
        state.client = runtime.client;
        state.config = runtime.config;

        Logger.log("other", `${logPrefix} - Ollama configured:`, {
          endpoint: ollamaConfig.endpoint,
          model: state.config.model,
        });
      } else if (
        provider === AIProviders.ANDROID_LOCAL ||
        provider === "android-local"
      ) {
        const androidConfig = config["android-local"] || {};
        const runtime = this._buildProviderRuntime(provider, androidConfig);
        state.client = runtime.client;
        state.config = runtime.config;

        Logger.log("other", `${logPrefix} - Android local LLM configured:`, {
          endpoint: this._normalizeEndpoint(
            androidConfig.endpoint,
            "http://127.0.0.1:8765",
          ),
          model: state.config.model,
        });
      } else if (
        provider === AIProviders.DESKTOP_LOCAL ||
        provider === "desktop-local"
      ) {
        const desktopConfig = config["desktop-local"] || {};
        const runtime = this._buildProviderRuntime(provider, desktopConfig);
        state.client = runtime.client;
        state.config = runtime.config;

        Logger.log("other", `${logPrefix} - Desktop local LLM configured:`, {
          endpoint: this._normalizeEndpoint(
            desktopConfig.endpoint,
            "http://127.0.0.1:11438",
          ),
          model: state.config.model,
        });
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }

      state.provider = provider;
      state.fullConfig = config;
      return true;
    } catch (error) {
      Logger.error("other", `${logPrefix} - Configuration failed:`, error);
      state.client = null;
      state.config = null;
      state.fullConfig = null;
      state.provider = null;
      throw error;
    }
  }

  /**
   * Check if service is configured and ready
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {boolean} True if ready
   */
  isConfigured(tabId: number | null = null): boolean {
    const state = this._getState(tabId);

    if (!state || !state.config || !state.provider) {
      return false;
    }
    if (
      state.provider === "chrome-ai" ||
      state.provider === AIProviders.CHROME_AI
    ) {
      return true;
    }
    return state.client !== null;
  }

  /**
   * Get current provider name
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {string|null} Provider name or null
   */
  getCurrentProvider(tabId: number | null = null): string | null {
    const state = this._getState(tabId);
    return state?.provider || null;
  }

  /**
   * Convert data URL to Blob
   * @param {string} dataUrl - Data URL (e.g., data:image/jpeg;base64,...)
   * @returns {Blob} Image blob
   */
  _dataUrlToBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(",");
    const mimeMatch = arr[0]?.match(/:(.*?);/);
    const mime = mimeMatch?.[1] || "application/octet-stream";
    const bstr = atob(arr[1] || "");
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  /**
   * Convert data URL to ArrayBuffer
   * @param {string} dataUrl - Data URL (e.g., data:audio/wav;base64,...)
   * @returns {ArrayBuffer} Audio array buffer
   */
  _dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
    const arr = dataUrl.split(",");
    const bstr = atob(arr[1] || "");
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return u8arr.buffer;
  }

  _isDataUrl(value: unknown): boolean {
    return typeof value === "string" && value.startsWith("data:");
  }

  _extractAttachmentString(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    if (value && typeof value === "object") {
      const candidate = value as {
        dataUrl?: unknown;
        url?: unknown;
        src?: unknown;
      };
      if (typeof candidate.dataUrl === "string") return candidate.dataUrl;
      if (typeof candidate.url === "string") return candidate.url;
      if (typeof candidate.src === "string") return candidate.src;
    }
    return "";
  }

  async _toDataUrlIfPossible(value: unknown): Promise<string | null> {
    const src = this._extractAttachmentString(value);
    if (!src) {
      return null;
    }

    if (this._isDataUrl(src)) {
      return src;
    }

    if (/^https?:\/\//i.test(src) || /^blob:/i.test(src)) {
      try {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const dataUrl = await new Promise<string | ArrayBuffer | null>(
          (resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
        );

        return typeof dataUrl === "string" && this._isDataUrl(dataUrl)
          ? dataUrl
          : null;
      } catch (error) {
        const err = asError(error);
        Logger.warn("AIService", "Failed to convert image URL to data URL:", {
          src,
          error: err.message || err,
        });
        return null;
      }
    }

    return null;
  }

  /**
   * Format messages for multi-modal support
   * Converts ChatManager format to provider-specific format
   * @param {Array} messages - Messages from ChatManager
   * @param {string} provider - Provider name
   * @returns {Promise<Array>} Formatted messages
   */
  async _formatMultiModalMessages(
    messages: AIMessage[],
    provider: string | null,
  ): Promise<AIMessage[]> {
    const formatted = [];

    for (const msg of messages) {
      // Check if multi-modal (has images or audios)
      const hasImages = msg.images && msg.images.length > 0;
      const hasAudios = msg.audios && msg.audios.length > 0;

      // If no attachments, return as-is
      if (!hasImages && !hasAudios) {
        formatted.push({ role: msg.role, content: msg.content });
        continue;
      }

      // Multi-modal message with images and/or audios
      if (provider === AIProviders.CHROME_AI || provider === "chrome-ai") {
        // Chrome AI format: content is array of {type, value}
        const content: Array<Record<string, any>> = [
          { type: "text", value: msg.content },
        ];

        // Add images
        if (hasImages) {
          for (const imageValue of msg.images) {
            const imageDataUrl = await this._toDataUrlIfPossible(imageValue);
            if (!imageDataUrl) {
              continue;
            }
            content.push({
              type: "image",
              value: this._dataUrlToBlob(imageDataUrl),
            });
          }
        }

        // Add audios
        if (hasAudios) {
          for (const audioValue of msg.audios) {
            const audioDataUrl = this._extractAttachmentString(audioValue);
            if (!this._isDataUrl(audioDataUrl)) {
              continue;
            }
            content.push({
              type: "audio",
              value: this._dataUrlToArrayBuffer(audioDataUrl),
            });
          }
        }

        formatted.push({ role: msg.role, content });
      } else {
        // OpenAI/Ollama format: content is array of {type, text/image_url/input_audio}
        const content: Array<Record<string, any>> = [
          { type: "text", text: msg.content || "" },
        ];
        const unresolvedImageUrls = [];

        // Add images
        if (hasImages) {
          for (const imageValue of msg.images) {
            const imageDataUrl = await this._toDataUrlIfPossible(imageValue);
            if (!imageDataUrl) {
              const unresolved = this._extractAttachmentString(imageValue);
              if (/^https?:\/\//i.test(unresolved)) {
                unresolvedImageUrls.push(unresolved);
              }
              continue;
            }
            content.push({
              type: "image_url",
              image_url: { url: imageDataUrl },
            });
          }
        }

        if (unresolvedImageUrls.length > 0) {
          if (content[0]) {
            content[0].text = `${content[0].text}\n\n[Some image URLs could not be fetched/converted in-browser and were omitted from vision payload:]\n${unresolvedImageUrls.join("\n")}`;
          }
        }

        // Add audios (OpenAI format for audio input)
        if (hasAudios) {
          for (const audioValue of msg.audios) {
            const audioDataUrl = this._extractAttachmentString(audioValue);
            if (!this._isDataUrl(audioDataUrl)) {
              continue;
            }
            // Extract base64 data from data URL
            const base64Data = audioDataUrl.split(",")[1];
            content.push({
              type: "input_audio",
              input_audio: {
                data: base64Data,
                format: "wav", // Default to wav, can be made dynamic
              },
            });
          }
        }

        formatted.push({ role: msg.role, content });
      }
    }

    return formatted;
  }

  /**
   * Prepare request body for API call based on provider
   * @param {Object} state - State object
   * @param {Array} formattedMessages - Formatted messages
   * @returns {Object} Request body for API call
   */
  _prepareRequestBody(state: AIState, formattedMessages: AIMessage[]) {
    const body: any = {
      model: state.config.model,
      messages: formattedMessages,
      temperature: state.config.temperature,
      max_tokens: state.config.maxTokens,
      stream: true,
    };

    const cfg = state.config as any;
    const thinkingOn = cfg.thinkingEnabled === true;
    if (state.provider !== AIProviders.OPENAI && state.provider !== "openai") {
      body.enable_thinking = thinkingOn;
      // vLLM/llama.cpp Jinja kwarg convention (harmless no-op elsewhere)
      body.chat_template_kwargs = { enable_thinking: thinkingOn };
      // Effort levels for endpoints that support reasoning_effort
      if (thinkingOn && cfg.thinkingEffort) {
        body.reasoning_effort = cfg.thinkingEffort;
      }
    } else {
      // Official OpenAI: reasoning_effort is the native knob
      body.reasoning_effort = thinkingOn
        ? cfg.thinkingEffort || "medium"
        : "none";
    }

    if (
      (state.provider === AIProviders.DESKTOP_LOCAL ||
        state.provider === "desktop-local") &&
      state.config.customModelsPath
    ) {
      body.customModelsPath = state.config.customModelsPath;
    }

    return body;
  }

  /**
   * Check if routing should be applied
   * @param {Object} config - Provider config
   * @returns {boolean} True if routing should be applied
   */
  _shouldApplyRouting(config: any): boolean {
    // Check if routing is enabled
    if (!config.routing || !config.routing.enabled) {
      return false;
    }

    return true;
  }

  /**
   * Strip images from messages array
   * @param {Array} messages - Messages array
   * @returns {Array} Messages without images
   */
  _stripImagesFromMessages(messages: AIMessage[]): AIMessage[] {
    return messages.map((msg: AIMessage) => {
      if (msg.images) {
        const { images: _images, ...rest } = msg;
        return rest;
      }
      return msg;
    });
  }

  /**
   * Parse JSON response, handling potential markdown code blocks
   * @param {string} response - Raw response text
   * @returns {Object|null} Parsed JSON or null
   */
  _parseJSONResponse(response: string): any {
    try {
      // Try direct parse first
      return JSON.parse(response);
    } catch (e) {
      // Try to extract JSON from markdown code block
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch?.[1]) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch (e2) {
          Logger.error(
            "AIService",
            "Failed to parse JSON from markdown block:",
            e2,
          );
        }
      }

      // Try to find JSON object in response
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch (e3) {
          Logger.error("AIService", "Failed to parse extracted JSON:", e3);
        }
      }

      Logger.error("AIService", "Failed to parse JSON response:", e);
      return null;
    }
  }

  /**
   * Apply multi-model routing when enabled
   * @param {Array} messages - Original messages
   * @param {Function} onStream - Streaming callback
   * @param {number} tabId - Tab ID
   * @param {Object} config - Provider config
   * @returns {Promise<Object>} Result object
   */
  async _applyRouting(
    messages: AIMessage[],
    onStream: ((chunk: string) => void) | null,
    tabId: number | null,
    config: any,
  ): Promise<SendResult> {
    const logPrefix = this.isExtensionMode
      ? `[AIService Routing] Tab ${tabId}`
      : "[AIService Routing]";
    Logger.log("other", `${logPrefix} - Starting multi-model routing`);

    const state = this._getState(tabId);
    let captureContext = "";
    const userMessage = messages[messages.length - 1] || {};
    const userText =
      typeof userMessage.content === "string"
        ? userMessage.content
        : Array.isArray(userMessage.content)
          ? userMessage.content.find((c: any) => c.type === "text")?.text ||
            userMessage.content.find((c: any) => c.type === "text")?.value ||
            ""
          : "";

    const manualImages =
      userMessage.images && userMessage.images.length > 0
        ? userMessage.images
        : null;

    try {
      Logger.log(
        "other",
        `${logPrefix} - Step 1: Router deciding if vision needed`,
      );

      const routerMessages = [
        {
          role: "system",
          content: PromptConfig.routing.routerSystemPrompt,
        },
        {
          role: "user",
          content: PromptConfig.routing.generateVisionPrompt(userText),
        },
      ];

      const routerTarget = this._resolveRoutingTarget(
        config.routing.routerModel,
        state.fullConfig,
        state.provider,
      );

      const routerResult = await this.sendMessage(routerMessages, null, tabId, {
        modelOverride: routerTarget.modelOverride,
        providerOverride: routerTarget.providerOverride,
        configOverride: routerTarget.configOverride,
        clientOverride: routerTarget.clientOverride,
        useUtilitySession: true,
        disableRouting: true,
      });

      if (!routerResult.success) {
        Logger.error(
          "other",
          `${logPrefix} - Router failed, falling back to main LLM`,
        );

        const errorContext = `[Note: Routing system encountered an error: ${routerResult.error?.message || "Router failed"}. Proceeding with best effort.]`;
        const fallbackMessages = [
          ...messages.slice(0, -1),
          {
            role: "user",
            content: `${userText}\n\n${errorContext}`,
            images: manualImages,
          },
        ];

        const tempConfig = {
          ...config,
          routing: { ...config.routing, enabled: false },
        };
        state.config = tempConfig;

        const result: SendResult = await this.sendMessage(
          fallbackMessages,
          onStream,
          tabId,
        );

        state.config = config;
        return result;
      }

      const routerDecision = this._parseJSONResponse(
        routerResult.response || "",
      );

      // Router returned invalid JSON - fallback to main LLM
      if (!routerDecision) {
        Logger.error(
          "other",
          `${logPrefix} - Invalid router response, falling back to main LLM`,
        );

        const errorContext = `[Note: Routing system returned invalid response. Proceeding with best effort.]`;
        const fallbackMessages = [
          ...messages.slice(0, -1),
          {
            role: "user",
            content: `${userText}\n\n${errorContext}`,
            images: manualImages,
          },
        ];

        const tempConfig = {
          ...config,
          routing: { ...config.routing, enabled: false },
        };
        state.config = tempConfig;

        const result: SendResult = await this.sendMessage(
          fallbackMessages,
          onStream,
          tabId,
        );

        state.config = config;
        return result;
      }

      Logger.log("other", `${logPrefix} - Router decision:`, routerDecision);

      const needsVision = routerDecision.needsVision !== false; // Default to true for backwards compat

      if (!needsVision && !manualImages) {
        Logger.log(
          "other",
          `${logPrefix} - Router decided vision not needed, proceeding text-only`,
        );

        const tempConfig = {
          ...config,
          routing: { ...config.routing, enabled: false },
        };
        state.config = tempConfig;

        const result: SendResult = await this.sendMessage(
          messages,
          onStream,
          tabId,
        );

        state.config = config;
        return result;
      }

      // Vision is needed - get images (manual or captured)
      let imageToUse = manualImages;

      if (!imageToUse && FrameCaptureService.isEnabled()) {
        Logger.log(
          "other",
          `${logPrefix} - No manual image, attempting frame capture...`,
        );

        const captureResult = await FrameCaptureService.getLatestFrame();

        if (captureResult.success && captureResult.frame) {
          imageToUse = [captureResult.frame];
          captureContext = "[Frame captured from active source]";
          Logger.log("other", `${logPrefix} - Frame capture successful`);
        } else {
          captureContext = `[Frame capture attempted but failed: ${captureResult.error}. Proceeding without visual context.]`;
          Logger.warn(
            "other",
            `${logPrefix} - Frame capture failed: ${captureResult.error}`,
          );
        }
      } else if (manualImages) {
        captureContext = "[Vision analysis from attached image]";
      }

      // If no images available, fall back to text-only
      if (!imageToUse) {
        Logger.log(
          "other",
          `${logPrefix} - Vision needed but no images available, falling back to text-only`,
        );

        const errorContext = `[Note: Vision analysis was needed but no visual input available. ${captureContext || "Frame capture not enabled."}]`;
        const fallbackMessages = [
          ...messages.slice(0, -1),
          {
            role: "user",
            content: `${userText}\n\n${errorContext}`,
          },
        ];

        const tempConfig = {
          ...config,
          routing: { ...config.routing, enabled: false },
        };
        state.config = tempConfig;

        const result: SendResult = await this.sendMessage(
          fallbackMessages,
          onStream,
          tabId,
        );

        state.config = config;
        return result;
      }

      // Router missing visionPrompt - use generic fallback
      let visionPromptToUse = routerDecision.visionPrompt;
      if (!visionPromptToUse) {
        Logger.warn(
          "other",
          `${logPrefix} - Router missing visionPrompt, using generic`,
        );
        visionPromptToUse = "Describe what you see in this image in detail.";
      }

      const skipVLM =
        config.routing.visionModel && config.routing.visionModel.useSameAsMain;

      let visionAnalysis = "";
      let visionStatus = "";

      if (skipVLM) {
        // Main LLM supports vision - skip VLM step
        Logger.log(
          "other",
          `${logPrefix} - Step 2: Skipping VLM (vision = main model)`,
        );

        visionAnalysis = visionPromptToUse;
        visionStatus = `${captureContext}\n[Main LLM will analyze image directly with guidance: ${routerDecision.focus || "general_description"}]`;
      } else {
        // Run separate VLM
        Logger.log(
          "other",
          `${logPrefix} - Step 2: Vision model analyzing image`,
        );

        const visionPrompt =
          PromptConfig.routing.visionAnalysisPrompt(visionPromptToUse);
        const visionMessages = [
          {
            role: "user",
            content: visionPrompt,
            images: imageToUse,
          },
        ];

        // Get vision model config
        const visionTarget = this._resolveRoutingTarget(
          config.routing.visionModel,
          state.fullConfig,
          state.provider,
        );

        let visionResult = null;
        const maxRetries = 2;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          Logger.log(
            "other",
            `${logPrefix} - Vision analysis attempt ${attempt}/${maxRetries}`,
          );

          visionResult = await this.sendMessage(visionMessages, null, tabId, {
            modelOverride: visionTarget.modelOverride,
            providerOverride: visionTarget.providerOverride,
            configOverride: visionTarget.configOverride,
            clientOverride: visionTarget.clientOverride,
            useUtilitySession: true,
            disableRouting: true,
          });

          if (visionResult.success) {
            break;
          }

          if (attempt < maxRetries) {
            Logger.warn(
              "other",
              `${logPrefix} - Vision attempt ${attempt} failed, retrying...`,
            );
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s before retry
          }
        }

        if (visionResult && visionResult.success) {
          visionAnalysis = visionResult.response || "";
          visionStatus = captureContext;
          Logger.log(
            "other",
            `${logPrefix} - Vision analysis complete (${visionAnalysis.length} chars):`,
          );
          Logger.log("other", `${logPrefix} - VLM Response: ${visionAnalysis}`);
        } else {
          visionAnalysis = `Unable to analyze visual content due to: ${visionResult?.error?.message || "Unknown error"}`;
          visionStatus = `${captureContext}\n[Vision analysis failed after ${maxRetries} attempts]`;
          Logger.error(
            "other",
            `${logPrefix} - Vision analysis failed after ${maxRetries} attempts`,
          );
        }
      }

      Logger.log(
        "other",
        `${logPrefix} - Step 3: Sending to main LLM with vision context`,
      );

      let finalMessages: AIMessage[];

      if (skipVLM) {
        // Main LLM supports vision - send image + router's guidance
        const enhancedPrompt = `${userText}\n\n${visionStatus}\n${visionAnalysis}`;

        // Remove images from previous messages, only keep latest
        const previousMessages = this._stripImagesFromMessages(
          messages.slice(0, -1),
        );

        finalMessages = [
          ...previousMessages,
          {
            role: "user",
            content: enhancedPrompt,
            images: imageToUse,
          },
        ];

        Logger.log(
          "other",
          `${logPrefix} - Main LLM will analyze image directly`,
        );
      } else {
        const enhancedPrompt = `${userText}\n\n${visionStatus}\n[Vision Analysis]\n${visionAnalysis}`;
        const messagesWithoutImages = this._stripImagesFromMessages(messages);

        finalMessages = [
          ...messagesWithoutImages.slice(0, -1),
          {
            role: "user",
            content: enhancedPrompt,
          },
        ];

        Logger.log(
          "other",
          `${logPrefix} - Enhanced prompt with VLM context (${enhancedPrompt.length} chars):`,
        );
        Logger.log("other", `${logPrefix} - ${enhancedPrompt}`);
      }

      const tempConfig = {
        ...config,
        routing: { ...config.routing, enabled: false },
      };
      state.config = tempConfig;

      const result: SendResult = await this.sendMessage(
        finalMessages,
        onStream,
        tabId,
      );

      state.config = config;

      Logger.log("other", `${logPrefix} - Routing complete`);
      return result;
    } catch (error) {
      Logger.error("other", `${logPrefix} - Routing failed:`, error);
      const normalizedError = asError(error);

      // Fallback: Send error as context to main LLM
      const errorContext = `[Note: Multi-model routing encountered an error: ${normalizedError.message}. ${captureContext || "No visual context available."}]`;

      const fallbackMessages = [
        ...messages.slice(0, -1),
        {
          role: "user",
          content: `${userText}\n\n${errorContext}`,
        },
      ];

      const tempConfig = {
        ...config,
        routing: { ...config.routing, enabled: false },
      };
      state.config = tempConfig;

      const result: SendResult = await this.sendMessage(
        fallbackMessages,
        onStream,
        tabId,
      );

      state.config = config;

      return result;
    }
  }

  /**
   * Get model override from config
   * @param {Object} modelConfig - Model config object
   * @param {string} provider - Provider name
   * @returns {string|null} Model name or null
   */
  /**
   * Send message with streaming support
   *
   * @param {Array} messages - Array of message objects
   * @param {Function|null} onStream - Callback for streaming tokens
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @param {Object} options - Additional options { useUtilitySession: boolean, modelOverride: string, disableRouting: boolean }
   * @returns {Promise<{success: boolean, response: string|null, cancelled: boolean, error: Error|null}>}
   */
  async sendMessage(
    messages: AIMessage[],
    onStream: ((chunk: string) => void) | null = null,
    tabId: number | null = null,
    options: any = {},
  ): Promise<SendResult> {
    options = options || {};
    const state = this._getState(tabId);

    if (!this.isConfigured(tabId)) {
      return {
        success: false,
        response: null,
        cancelled: false,
        error: new Error("AIService not configured. Call configure() first."),
      };
    }

    const logPrefix = this.isExtensionMode
      ? `[AIService] Tab ${tabId}`
      : "[AIService]";
    const requestProvider = options.providerOverride || state.provider;
    const requestConfig = options.configOverride || state.config;
    const requestClient = options.clientOverride || state.client;
    const requestState = {
      ...state,
      provider: requestProvider,
      config: requestConfig,
      client: requestClient,
    };

    // Check if routing should be applied (only if not already in a routing sub-call and not explicitly disabled)
    if (
      !options.modelOverride &&
      !options.useUtilitySession &&
      !options.disableRouting &&
      this._shouldApplyRouting(requestConfig)
    ) {
      return await this._applyRouting(messages, onStream, tabId, requestConfig);
    }

    // Check if any message contains images or audios
    const hasImages = messages.some(
      (m: AIMessage) => m.images && m.images.length > 0,
    );
    const hasAudios = messages.some(
      (m: AIMessage) => m.audios && m.audios.length > 0,
    );
    const hasAttachments = hasImages || hasAudios;

    Logger.log(
      "other",
      `${logPrefix} - Sending message to ${state.provider}:`,
      {
        messageCount: messages.length,
        provider: requestProvider,
        model: options.modelOverride || requestConfig.model || "chrome-ai",
        hasImages,
        hasAudios,
        useUtilitySession: options.useUtilitySession || false,
        modelOverride: options.modelOverride || null,
      },
    );

    // Format messages for multi-modal if needed
    const formattedMessages = hasAttachments
      ? await this._formatMultiModalMessages(messages, requestProvider)
      : messages;

    // Chrome AI implementation
    if (
      requestProvider === AIProviders.CHROME_AI ||
      requestProvider === "chrome-ai"
    ) {
      return await this._sendMessageChromeAI(
        requestState,
        formattedMessages,
        onStream,
        logPrefix,
        options.useUtilitySession,
      );
    }

    // Create new abort controller for this request
    state.abortController = new AbortController();

    try {
      // Prepare request body
      const requestBody = this._prepareRequestBody(
        requestState,
        formattedMessages,
      );

      if (options.modelOverride) {
        requestBody.model = options.modelOverride;
      }

      // Create streaming request with abort signal
      const stream = await requestClient.chat.completions.create(requestBody, {
        signal: state.abortController.signal,
      });

      let fullResponse = "";
      let fullThinking = "";
      const thinkingEnabled = (requestConfig as any).thinkingEnabled === true;
      const onReasoning: ((chunk: string) => void) | undefined =
        options.onReasoning;
      const splitter = new ThinkStreamSplitter();

      // Process streaming chunks
      for await (const chunk of stream) {
        // Check if request was aborted - return cancelled, don't throw
        if (!state.abortController) {
          Logger.log("other", `${logPrefix} - Streaming aborted by user`);
          state.abortController = null;
          return {
            success: false,
            response: fullResponse,
            cancelled: true,
            error: null,
            thinking: fullThinking,
          };
        }

        const delta = chunk.choices[0]?.delta || {};
        let reasoning: string =
          delta.reasoning_content || delta.reasoning || "";
        let content: string = delta.content || "";

        if (content) {
          const d = splitter.push(content);
          reasoning += d.thinking;
          content = d.content;
        }

        if (reasoning) {
          fullThinking += reasoning;
          if (thinkingEnabled && onReasoning) {
            onReasoning(reasoning);
          }
        }
        if (content) {
          fullResponse += content;

          // Call streaming callback if provided
          if (onStream) {
            onStream(content);
          }
        }
      }

      const tail = splitter.finish();
      if (tail.thinking) {
        fullThinking += tail.thinking;
        if (thinkingEnabled && onReasoning) {
          onReasoning(tail.thinking);
        }
      }
      if (tail.content) {
        fullResponse += tail.content;
        if (onStream) {
          onStream(tail.content);
        }
      }

      Logger.log(
        "other",
        `${logPrefix} - Response received (${fullResponse.length} chars${
          fullThinking ? `, ${fullThinking.length} thinking` : ""
        })`,
      );
      state.abortController = null;

      return {
        success: true,
        response: fullResponse,
        cancelled: false,
        error: null,
        thinking: fullThinking,
      };
    } catch (error) {
      state.abortController = null;
      const normalizedError = asError(error);

      // Check if error is from abort - check name AND message
      const errorMsg = normalizedError.message?.toLowerCase() || "";
      const isAbort =
        normalizedError.name === "AbortError" ||
        errorMsg.includes("abort") ||
        errorMsg.includes("cancel");

      if (isAbort) {
        Logger.log("other", `${logPrefix} - Request aborted by user`);
        return { success: false, response: null, cancelled: true, error: null };
      }

      Logger.error("other", `${logPrefix} - Request failed:`, error);

      // Return error result with enhanced message
      let errorMessage = normalizedError.message;
      if (normalizedError.message?.includes("401")) {
        errorMessage = "Invalid API key. Please check your configuration.";
      } else if (normalizedError.message?.includes("429")) {
        errorMessage = "Rate limit exceeded. Please try again later.";
      } else if (normalizedError.message?.includes("fetch")) {
        errorMessage =
          "Network error. Please check your connection and endpoint URL.";
      }

      return {
        success: false,
        response: null,
        cancelled: false,
        error: new Error(errorMessage),
      };
    }
  }

  /**
   * Send message using Chrome AI LanguageModel (internal method)
   * @param {Object} state - State object
   * @param {Array} messages - Message array {role, content}
   * @param {Function} onStream - Streaming callback
   * @param {string} logPrefix - Log prefix
   * @param {boolean} useUtilitySession - Use utility session instead of main session
   * @returns {Promise<{success: boolean, response: string|null, cancelled: boolean, error: Error|null}>}
   */
  async _sendMessageChromeAI(
    state: AIState,
    messages: AIMessage[],
    onStream: ((chunk: string) => void) | null,
    logPrefix: string,
    useUtilitySession = false,
  ): Promise<SendResult> {
    const sessionKey = useUtilitySession
      ? "chromeAIUtilitySession"
      : "chromeAISession";

    try {
      const systemPrompts = messages.filter(
        (m: AIMessage) => m.role === "system",
      );
      const conversationMsgs = messages.filter(
        (m: AIMessage) => m.role !== "system",
      );

      let sessionToUse = state[sessionKey];

      if (!sessionToUse) {
        Logger.log(
          "other",
          `${logPrefix} - Creating Chrome AI ${useUtilitySession ? "utility" : "main"} session...`,
        );

        if (!(self as any).LanguageModel) {
          throw new Error("Chrome AI LanguageModel not available");
        }

        // Session config
        const sessionConfig: any = {
          temperature: state.config.temperature,
          topK: state.config.topK,
          language: state.config.outputLanguage || "en",
          initialPrompts: systemPrompts.length > 0 ? systemPrompts : undefined,
        };

        // Add multi-modal support if enabled in config (default: true)
        const imageSupport = state.config.enableImageSupport !== false;
        const audioSupport = state.config.enableAudioSupport !== false;

        if (imageSupport || audioSupport) {
          sessionConfig.expectedInputs = [{ type: "text" }];

          if (imageSupport) {
            sessionConfig.expectedInputs.push({ type: "image" });
          }

          if (audioSupport) {
            sessionConfig.expectedInputs.push({ type: "audio" });
          }
        }

        sessionToUse = await (self as any).LanguageModel.create(sessionConfig);
        state[sessionKey] = sessionToUse;

        Logger.log(
          "other",
          `${logPrefix} - Chrome AI ${useUtilitySession ? "utility" : "main"} session created`,
        );

        messages = conversationMsgs;
      }

      const lastMessage = messages[messages.length - 1] || { content: "" };
      Logger.log(
        "other",
        `${logPrefix} - Chrome AI prompting with ${messages.length} message(s)`,
      );

      // For multi-modal messages (content is array), pass as message object with role
      // For text-only messages (content is string), pass just the string
      const isMultiModal = Array.isArray(lastMessage.content);
      const promptInput = isMultiModal ? [lastMessage] : lastMessage.content;

      let fullResponse = "";

      if (onStream) {
        const stream = sessionToUse.promptStreaming(promptInput);

        for await (const chunk of stream) {
          // Check if session was destroyed (aborted) - return cancelled
          if (!state[sessionKey]) {
            Logger.log(
              "other",
              `${logPrefix} - Chrome AI streaming aborted by user`,
            );
            return {
              success: false,
              response: fullResponse,
              cancelled: true,
              error: null,
            };
          }

          fullResponse += chunk;
          if (chunk && onStream) {
            onStream(chunk);
          }
        }
      } else {
        fullResponse = await sessionToUse.prompt(promptInput);
      }

      Logger.log(
        "other",
        `${logPrefix} - Chrome AI response (${fullResponse.length} chars)`,
      );

      // Clean up excessive whitespace and newlines
      fullResponse = fullResponse.trim().replace(/\n\s*\n\s*\n/g, "\n\n");

      return {
        success: true,
        response: fullResponse,
        cancelled: false,
        error: null,
      };
    } catch (error) {
      Logger.error("other", `${logPrefix} - Chrome AI error:`, error);
      const normalizedError = asError(error);

      if (state[sessionKey]) {
        try {
          state[sessionKey].destroy();
        } catch (destroyError) {
          Logger.warn(
            "other",
            `Failed to destroy ${useUtilitySession ? "utility" : "main"} session:`,
            destroyError,
          );
        }
        state[sessionKey] = null;
      }

      let errorMessage = normalizedError.message;
      if (normalizedError.name === "NotSupportedError") {
        errorMessage =
          "Chrome AI not available. Enable required flags at chrome://flags";
      } else if (normalizedError.name === "QuotaExceededError") {
        errorMessage =
          "Chrome AI context limit exceeded (1028 tokens). Start a new conversation.";
      }

      return {
        success: false,
        response: null,
        cancelled: false,
        error: new Error(errorMessage),
      };
    }
  }

  /**
   * Abort the current ongoing request
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {boolean} True if aborted
   */
  abortRequest(tabId: number | null = null): boolean {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[AIService] Tab ${tabId}`
      : "[AIService]";

    let aborted = false;

    // Abort both main and utility Chrome AI sessions
    if (
      state &&
      (state.provider === "chrome-ai" ||
        state.provider === AIProviders.CHROME_AI)
    ) {
      if (state.chromeAISession) {
        Logger.log("other", `${logPrefix} - Destroying Chrome AI main session`);
        try {
          state.chromeAISession.destroy();
        } catch (destroyError) {
          Logger.warn("other", "Failed to destroy main session:", destroyError);
        }
        state.chromeAISession = null;
        aborted = true;
      }

      if (state.chromeAIUtilitySession) {
        Logger.log(
          "other",
          `${logPrefix} - Destroying Chrome AI utility session`,
        );
        try {
          state.chromeAIUtilitySession.destroy();
        } catch (destroyError) {
          Logger.warn(
            "other",
            "Failed to destroy utility session:",
            destroyError,
          );
        }
        state.chromeAIUtilitySession = null;
        aborted = true;
      }

      if (aborted) return true;
    }

    if (state && state.abortController) {
      Logger.log("other", `${logPrefix} - Aborting current request`);
      state.abortController.abort();
      state.abortController = null;
      return true;
    }
    return false;
  }

  isGenerating(tabId: number | null = null): boolean {
    const state = this._getState(tabId);
    return state && state.abortController !== null;
  }

  /**
   * Send message without streaming (simpler interface)
   * @param {Array|number} messagesOrTabId - Messages (dev) or tabId (extension)
   * @param {Array} messages - Messages (extension mode only)
   * @returns {Promise<string>} Full response text
   */
  async sendMessageSync(
    messagesOrTabId: AIMessage[] | number,
    messages: AIMessage[] | null = null,
  ): Promise<SendResult> {
    if (this.isExtensionMode) {
      return await this.sendMessage(
        messages || [],
        null,
        messagesOrTabId as number,
      );
    } else {
      return await this.sendMessage(
        Array.isArray(messagesOrTabId) ? messagesOrTabId : [],
        null,
        null,
      );
    }
  }

  async testConnection(tabId: number | null = null): Promise<boolean> {
    if (!this.isConfigured(tabId)) {
      throw new Error("AIService not configured");
    }

    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[AIService] Tab ${tabId}`
      : "[AIService]";
    Logger.log(
      "other",
      `${logPrefix} - Testing connection to ${state.provider}...`,
    );

    if (
      (state.provider === AIProviders.CHROME_AI ||
        state.provider === "chrome-ai") &&
      !this.isExtensionMode
    ) {
      const result = await ChromeAIValidator.testConnection();
      if (!result.success) {
        throw new Error(
          typeof result.message === "string"
            ? result.message
            : "Connection test failed",
        );
      }
      return true;
    }

    try {
      const testMessages = [
        { role: "user", content: 'Say "OK" if you can hear me.' },
      ];

      const result = await this.sendMessage(testMessages, null, tabId);

      if (!result.success) {
        throw result.error || new Error("Connection test failed");
      }

      Logger.log(
        "other",
        `${logPrefix} - Connection test successful:`,
        result.response,
      );
      return true;
    } catch (error) {
      Logger.error("other", `${logPrefix} - Connection test failed:`, error);
      throw error;
    }
  }

  async listRemoteModels(
    config: RemoteModelListConfig,
  ): Promise<RemoteModelListResult> {
    const url = this._resolveRemoteModelListUrl(config);

    if (config.provider === "openai" && !config.apiKey?.trim()) {
      return { models: [], error: "Add an API key to list OpenAI models." };
    }

    try {
      const response = await fetch(url, {
        headers: {
          ...(config.apiKey?.trim()
            ? { Authorization: `Bearer ${config.apiKey.trim()}` }
            : {}),
        },
      });

      if (!response.ok) {
        return {
          models: [],
          error: `Model listing failed (${response.status})`,
        };
      }

      const payload = (await response.json()) as {
        data?: Array<{ id?: string | null }>;
      };
      const models = Array.isArray(payload.data)
        ? payload.data
            .map((entry) =>
              typeof entry?.id === "string" ? entry.id.trim() : "",
            )
            .filter((entry) => entry.length > 0)
            .sort((left, right) => left.localeCompare(right))
        : [];

      return { models };
    } catch (error) {
      return {
        models: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Export singleton instance
export default new AIService();
