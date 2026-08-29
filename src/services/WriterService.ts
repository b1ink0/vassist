/**
 * WriterService - Multi-provider Content Writing service
 *
 * Supports Chrome AI Writer API (on-device) and polyfills for OpenAI/Ollama.
 * Works in both extension mode (multi-tab) and dev mode (single instance).
 */

import { createLocalOpenAiClient } from "./LocalLlmClientFactory";
import OpenAI from "openai";
import Logger from "./LoggerService";
import { isExtension } from "../utils/PlatformUtils";

type WriterProvider = "chrome-ai" | "openai" | "ollama";
type WriterAvailability =
  | "readily"
  | "downloading"
  | "downloadable"
  | "unavailable";

interface WriterSession {
  write(prompt: string, options?: { context?: string }): Promise<string>;
  writeStreaming(
    prompt: string,
    options?: { context?: string },
  ): AsyncIterable<string>;
  destroy?(): void;
}

interface WriterState {
  writerSessions: Map<string, WriterSession>;
  config: {
    provider: WriterProvider;
    model?: string;
    temperature?: number;
  } | null;
  provider: WriterProvider | null;
  llmClient: OpenAI | null;
  abortController: AbortController | null;
}

const getWriterApi = (): any =>
  (self as typeof globalThis & { Writer?: any }).Writer ?? null;
const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

class WriterService {
  private readonly isExtensionMode: boolean;
  private readonly tabStates: Map<number, WriterState>;
  private readonly devState: WriterState;

  constructor() {
    this.isExtensionMode = isExtension;
    this.tabStates = new Map();
    this.devState = {
      writerSessions: new Map(),
      config: null,
      provider: null,
      llmClient: null,
      abortController: null,
    };

    if (this.isExtensionMode) {
      return;
    }
  }

  /**
   * Initialize state for a tab (extension mode only)
   * @param {number} tabId - Tab ID
   */
  initTab(tabId: number): void {
    if (!this.isExtensionMode) return;

    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        writerSessions: new Map(),
        config: null,
        provider: null,
        llmClient: null,
        abortController: null,
      });
      Logger.log("WriterService", `Tab ${tabId} initialized`);
    }
  }

  /**
   * Cleanup tab state (extension mode only)
   * @param {number} tabId - Tab ID
   */
  cleanupTab(tabId: number): void {
    if (!this.isExtensionMode) return;

    const state = this.tabStates.get(tabId);
    if (state) {
      // Abort ongoing request
      if (state.abortController) {
        state.abortController.abort();
      }

      // Destroy all writer sessions
      for (const session of state.writerSessions.values()) {
        try {
          if (session && typeof session.destroy === "function") {
            session.destroy();
          }
        } catch (error) {
          Logger.warn("WriterService", "Error destroying session:", error);
        }
      }
      this.tabStates.delete(tabId);
      Logger.log("WriterService", `Tab ${tabId} cleaned up`);
    }
  }

  /**
   * Get state object for current context
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Object} State object
   */
  _getState(tabId: number | null = null): WriterState {
    if (this.isExtensionMode) {
      if (tabId === null) {
        throw new Error("tabId is required in extension mode");
      }
      this.initTab(tabId);
      return this.tabStates.get(tabId) as WriterState;
    }
    return this.devState;
  }

  /**
   * Configure writer with provider settings
   * @param {Object} config - Configuration
   * @param {string} config.provider - 'chrome-ai', 'openai', or 'ollama'
   * @param {Object} config.openai - OpenAI config (if provider is 'openai')
   * @param {Object} config.ollama - Ollama config (if provider is 'ollama')
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<boolean>} Success status
   */
  async configure(config: any, tabId: number | null = null): Promise<boolean> {
    const state = this._getState(tabId);
    const { provider } = config;
    const logPrefix = this.isExtensionMode
      ? `[WriterService] Tab ${tabId}`
      : "[WriterService]";

    Logger.log("other", `${logPrefix} Configuring provider: ${provider}`);

    try {
      if (provider === "chrome-ai") {
        // Check Chrome AI Writer availability
        if (!getWriterApi()) {
          throw new Error(
            "Chrome AI Writer not available. Chrome 139+ required with origin trial token.",
          );
        }

        state.config = { provider: "chrome-ai" };
        state.provider = "chrome-ai";
        Logger.log("other", `${logPrefix} Chrome AI Writer configured`);
      } else if (provider === "openai") {
        const openaiConfig = config.openai;
        state.llmClient = new OpenAI({
          apiKey: openaiConfig.apiKey,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });

        state.config = {
          provider: "openai",
          model: openaiConfig.model || "gpt-4o-mini",
          temperature: openaiConfig.temperature || 0.7,
        };
        state.provider = "openai";
        Logger.log("other", `${logPrefix} OpenAI configured for writing`);
      } else if (provider === "ollama") {
        const ollamaConfig = config.ollama;
        state.llmClient = new OpenAI({
          apiKey: "ollama",
          baseURL: ollamaConfig.endpoint + "/v1",
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });

        state.config = {
          provider: "ollama",
          model: ollamaConfig.model,
          temperature: ollamaConfig.temperature || 0.7,
        };
        state.provider = "ollama";
        Logger.log("other", `${logPrefix} Ollama configured for writing`);
      } else {
        const local = createLocalOpenAiClient(provider, config);
        if (!local) throw new Error(`Unknown provider: ${provider}`);
        state.llmClient = local.client;
        state.config = {
          provider: "openai",
          model: local.model,
          temperature: 0.5,
        };
        state.provider = "openai";
        Logger.log("other", `${logPrefix} ${provider} configured for writing`);
      }

      return true;
    } catch (error) {
      Logger.error("other", `${logPrefix} Configuration failed:`, error);
      state.config = null;
      state.provider = null;
      state.llmClient = null;
      throw asError(error);
    }
  }

  /**
   * Check if service is configured
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {boolean} True if configured
   */
  isConfigured(tabId: number | null = null): boolean {
    const state = this._getState(tabId);
    return Boolean(state.config && state.provider);
  }

  /**
   * Abort ongoing write request
   * @param {number} tabId - Tab ID (extension mode only)
   */
  abort(tabId: number | null = null): void {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[WriterService] Tab ${tabId}`
      : "[WriterService]";

    if (state.abortController) {
      Logger.log("other", `${logPrefix} Aborting write request`);
      state.abortController.abort();
      state.abortController = null;
    }
  }

  /**
   * Check availability of writer
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} 'readily', 'downloading', 'downloadable', or 'unavailable'
   */
  async checkAvailability(
    tabId: number | null = null,
  ): Promise<WriterAvailability> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[WriterService] Tab ${tabId}`
      : "[WriterService]";

    if (!state.provider) {
      return "unavailable";
    }

    if (state.provider === "chrome-ai") {
      const writerApi = getWriterApi();
      if (!writerApi) {
        return "unavailable";
      }

      try {
        const availability = await writerApi.availability();
        Logger.log("other", `${logPrefix} Writer availability:`, availability);
        return availability;
      } catch (error) {
        Logger.error(
          "other",
          `${logPrefix} Failed to check availability:`,
          error,
        );
        return "unavailable";
      }
    } else {
      // For OpenAI/Ollama, always ready (cloud-based)
      return "readily";
    }
  }

  /**
   * Get or create writer session
   * @param {string} tone - Tone: 'formal', 'neutral', 'casual'
   * @param {string} format - Output format: 'plain-text', 'markdown'
   * @param {string} length - Write length: 'short', 'medium', 'long'
   * @param {string} sharedContext - Optional context for the writer
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<Object>} Writer session
   */
  async _getOrCreateSession(
    tone = "neutral",
    format = "plain-text",
    length = "medium",
    sharedContext = "",
    tabId: number | null = null,
  ): Promise<WriterSession | null> {
    const state = this._getState(tabId);
    const sessionKey = `${tone}-${format}-${length}-${sharedContext}`;
    const logPrefix = this.isExtensionMode
      ? `[WriterService] Tab ${tabId}`
      : "[WriterService]";

    if (state.provider !== "chrome-ai") {
      // No sessions for OpenAI/Ollama
      return null;
    }

    if (state.writerSessions.has(sessionKey)) {
      return state.writerSessions.get(sessionKey) ?? null;
    }

    // Create new Chrome AI Writer session
    try {
      Logger.log(
        "other",
        `${logPrefix} Creating writer session: ${sessionKey}`,
      );
      const writerApi = getWriterApi();
      if (!writerApi) {
        throw new Error("Writer API unavailable");
      }

      const session = await writerApi.create({
        tone,
        format,
        length,
        sharedContext,
        monitor(m: any) {
          m.addEventListener("downloadprogress", (e: { loaded: number }) => {
            Logger.log(
              "other",
              `${logPrefix} Writer model download: ${(e.loaded * 100).toFixed(1)}%`,
            );
          });
        },
      });

      state.writerSessions.set(sessionKey, session);
      Logger.log("other", `${logPrefix} Writer session created: ${sessionKey}`);
      return session;
    } catch (error) {
      Logger.error(
        "other",
        `${logPrefix} Failed to create writer session:`,
        error,
      );
      throw asError(error);
    }
  }

  /**
   * Write content (batch, non-streaming)
   * @param {string} prompt - Writing prompt/instruction
   * @param {Object} options - Write options
   * @param {string} options.tone - Tone: 'formal', 'neutral', 'casual'
   * @param {string} options.format - Output format: 'plain-text', 'markdown'
   * @param {string} options.length - Write length: 'short', 'medium', 'long'
   * @param {string} options.context - Optional additional context
   * @param {string} options.sharedContext - Optional shared context for the session
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} Written content
   */
  async write(
    prompt: string,
    options: any = {},
    tabId: number | null = null,
  ): Promise<string> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[WriterService] Tab ${tabId}`
      : "[WriterService]";

    if (!state.provider) {
      throw new Error("WriterService not configured");
    }

    const {
      tone = "neutral",
      format = "plain-text",
      length = "medium",
      context = "",
      sharedContext = "",
    } = options;

    Logger.log(
      "other",
      `${logPrefix} Writing (${tone}, ${format}, ${length}):`,
      prompt.substring(0, 50),
    );

    if (state.provider === "chrome-ai") {
      const session = await this._getOrCreateSession(
        tone,
        format,
        length,
        sharedContext,
        tabId,
      );
      if (!session) {
        throw new Error("Writer session unavailable");
      }
      const written = await session.write(prompt, { context });
      Logger.log(
        "other",
        `${logPrefix} Write complete:`,
        written.substring(0, 50),
      );
      return written;
    } else if (state.provider === "openai" || state.provider === "ollama") {
      return await this._writeWithOpenAICompatible(
        prompt,
        tone,
        format,
        length,
        context,
        tabId,
      );
    }

    throw new Error(`Unknown provider: ${state.provider}`);
  }

  /**
   * Write content (streaming)
   * @param {string} prompt - Writing prompt/instruction
   * @param {Object} options - Write options (same as write())
   * @param {number} tabId - Tab ID (extension mode only)
   * @returns {AsyncIterable<string>} Streaming write chunks
   */
  async *writeStreaming(
    prompt: string,
    options: any = {},
    tabId: number | null = null,
  ): AsyncIterable<string> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[WriterService] Tab ${tabId}`
      : "[WriterService]";

    if (!state.provider) {
      throw new Error("WriterService not configured");
    }

    const {
      tone = "neutral",
      format = "plain-text",
      length = "medium",
      context = "",
      sharedContext = "",
    } = options;

    Logger.log(
      "other",
      `${logPrefix} Writing (streaming, ${tone}, ${format}, ${length}):`,
      prompt.substring(0, 50),
    );

    if (state.provider === "chrome-ai") {
      const session = await this._getOrCreateSession(
        tone,
        format,
        length,
        sharedContext,
        tabId,
      );
      if (!session) {
        throw new Error("Writer session unavailable");
      }
      const stream = session.writeStreaming(prompt, { context });

      for await (const chunk of stream) {
        yield chunk;
      }
    } else if (state.provider === "openai" || state.provider === "ollama") {
      yield* this._writeStreamingWithOpenAICompatible(
        prompt,
        tone,
        format,
        length,
        context,
        tabId,
      );
    } else {
      throw new Error(`Unknown provider: ${state.provider}`);
    }
  }

  /**
   * Write using OpenAI-compatible API (polyfill for OpenAI/Ollama)
   * @private
   */
  async _writeWithOpenAICompatible(
    prompt: string,
    tone: string,
    format: string,
    length: string,
    context: string,
    tabId: number | null = null,
  ): Promise<string> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[WriterService] Tab ${tabId}`
      : "[WriterService]";

    const fullPrompt = this._buildWritePrompt(
      prompt,
      tone,
      format,
      length,
      context,
    );

    // Create abort controller for this request
    state.abortController = new AbortController();
    if (!state.llmClient || !state.config?.model) {
      throw new Error("Writer LLM client not configured");
    }

    try {
      const response = await state.llmClient.chat.completions.create(
        {
          model: state.config.model,
          messages: [{ role: "user", content: fullPrompt }],
          temperature: state.config.temperature ?? null,
        },
        {
          signal: state.abortController.signal,
        },
      );

      state.abortController = null;
      const written = response.choices[0]?.message?.content?.trim() ?? "";
      Logger.log("other", `${logPrefix} ${state.provider} write complete`);
      return written;
    } catch (error) {
      state.abortController = null;

      // Check if error is from abort
      const normalized = asError(error);
      const isAbort =
        normalized.name === "AbortError" ||
        normalized.message.toLowerCase().includes("abort") ||
        normalized.message.toLowerCase().includes("cancel");

      if (isAbort) {
        Logger.log("other", `${logPrefix} Write aborted by user`);
        throw new Error("Write cancelled");
      }

      Logger.error(
        "other",
        `${logPrefix} ${state.provider} write failed:`,
        error,
      );
      throw normalized;
    }
  }

  /**
   * Write using OpenAI-compatible API (streaming polyfill for OpenAI/Ollama)
   * @private
   */
  async *_writeStreamingWithOpenAICompatible(
    prompt: string,
    tone: string,
    format: string,
    length: string,
    context: string,
    tabId: number | null = null,
  ): AsyncIterable<string> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[WriterService] Tab ${tabId}`
      : "[WriterService]";

    const fullPrompt = this._buildWritePrompt(
      prompt,
      tone,
      format,
      length,
      context,
    );

    // Create abort controller for this request
    state.abortController = new AbortController();
    if (!state.llmClient || !state.config?.model) {
      throw new Error("Writer LLM client not configured");
    }

    try {
      const stream = await state.llmClient.chat.completions.create(
        {
          model: state.config.model,
          messages: [{ role: "user", content: fullPrompt }],
          temperature: state.config.temperature ?? null,
          stream: true,
        },
        {
          signal: state.abortController.signal,
        },
      );

      for await (const chunk of stream) {
        // Check if aborted
        if (!state.abortController) {
          Logger.log("other", `${logPrefix} Streaming aborted by user`);
          return;
        }

        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          yield content;
        }
      }

      state.abortController = null;
    } catch (error) {
      state.abortController = null;

      // Check if error is from abort
      const normalized = asError(error);
      const isAbort =
        normalized.name === "AbortError" ||
        normalized.message.toLowerCase().includes("abort") ||
        normalized.message.toLowerCase().includes("cancel");

      if (isAbort) {
        Logger.log("other", `${logPrefix} Streaming write aborted by user`);
        return;
      }

      Logger.error(
        "other",
        `${logPrefix} ${state.provider} streaming write failed:`,
        error,
      );
      throw normalized;
    }
  }

  /**
   * Build write prompt for LLM polyfills
   * @private
   */
  _buildWritePrompt(
    prompt: string,
    tone: string,
    format: string,
    length: string,
    context: string,
  ): string {
    const instructions: string[] = [];

    // Tone-specific instructions
    if (tone === "formal") {
      instructions.push("Write in a formal, professional tone.");
    } else if (tone === "casual") {
      instructions.push("Write in a casual, conversational tone.");
    } else {
      instructions.push("Write in a neutral, balanced tone.");
    }

    // Length-specific instructions
    if (length === "short") {
      instructions.push(
        "Keep the response brief and concise (1-2 paragraphs).",
      );
    } else if (length === "long") {
      instructions.push(
        "Provide a detailed, comprehensive response (4+ paragraphs).",
      );
    } else {
      instructions.push("Provide a moderate length response (2-3 paragraphs).");
    }

    // Format instruction
    if (format === "markdown") {
      instructions.push("Use markdown formatting in the output.");
    } else {
      instructions.push("Use plain text only, no markdown.");
    }

    let fullPrompt = instructions.join(" ") + "\n\n";

    if (context) {
      fullPrompt += `Context: ${context}\n\n`;
    }

    fullPrompt += `Task: ${prompt}`;

    return fullPrompt;
  }

  /**
   * Destroy all writer sessions
   * @param {number} tabId - Tab ID (extension mode only)
   */
  async destroy(tabId: number | null = null): Promise<void> {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode
      ? `[WriterService] Tab ${tabId}`
      : "[WriterService]";

    Logger.log("other", `${logPrefix} Destroying all writer sessions`);

    for (const [key, session] of state.writerSessions.entries()) {
      try {
        if (session && typeof session.destroy === "function") {
          session.destroy();
        }
      } catch (error) {
        Logger.warn(
          "other",
          `${logPrefix} Error destroying session ${key}:`,
          error,
        );
      }
    }

    state.writerSessions.clear();
    Logger.log("other", `${logPrefix} All sessions destroyed`);
  }
}

// Export singleton instance
const writerService = new WriterService();
export default writerService;
