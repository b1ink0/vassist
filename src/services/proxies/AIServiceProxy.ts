/**
 * AI Service Proxy
 * Dual-mode wrapper for AIService
 * Dev mode: Direct OpenAI/Ollama API calls
 * Extension mode: Message bridge to background worker
 */

import { ServiceProxy } from "./ServiceProxy";
import AIService from "../AIService";
import { MessageTypes } from "../../../extension/shared/MessageTypes";
import Logger from "../LoggerService";
import StorageServiceProxy from "./StorageServiceProxy";
import { DefaultAIConfig } from "../../config/aiConfig";

interface AIServiceLike {
  configure(config: unknown): Promise<unknown> | unknown;
  isConfigured(): boolean;
  getCurrentProvider(): string | null;
  sendMessage(
    messages: AIMessage[],
    onStream?: ((chunk: string) => void) | null,
    signal?: AbortSignal | null,
    options?: Record<string, unknown>,
  ): Promise<AIServiceResponse>;
  sendMessageSync(messages: AIMessage[]): Promise<string>;
  abortRequest(): boolean;
  isGenerating(): boolean;
  testConnection(): Promise<boolean>;
  listRemoteModels(config: {
    provider: "openai" | "ollama" | "android-local" | "desktop-local";
    endpoint?: string;
    apiKey?: string;
  }): Promise<{ models: string[]; error?: string }>;
  [method: string]: unknown;
}

interface AIProxyConfig {
  provider?: string;
  [key: string]: unknown;
}

interface AIMessage {
  role: string;
  content: unknown;
  [key: string]: unknown;
}

interface AIServiceResponse {
  success: boolean;
  response: string | null;
  cancelled: boolean;
  error: unknown;
  thinking?: string;
}

interface BridgeAIResponse {
  thinking?: string;
  success?: boolean;
  response?: string;
  text?: string;
  message?: string;
  supported?: boolean;
  models?: string[];
  error?: string;
}

class AIServiceProxy extends ServiceProxy {
  protected directService: AIServiceLike;
  protected _configuring: boolean;

  constructor() {
    super("AIService");
    this.directService = AIService as unknown as AIServiceLike;
    this._configuring = false;
  }

  /**
   * Ensure service is configured (auto-loads from storage if needed)
   * @returns {Promise<void>}
   */
  async ensureConfigured() {
    if (this._configuring) return;

    if (this.getHostTransportBridge()?.ai) {
      return;
    }

    const configured = await this.isConfigured();
    if (configured) return;

    this._configuring = true;
    try {
      const aiConfig =
        ((await StorageServiceProxy.configLoad(
          "aiConfig",
        )) as AIProxyConfig | null) ?? (DefaultAIConfig as AIProxyConfig);

      if (aiConfig && aiConfig.provider) {
        Logger.log("AIServiceProxy", "Auto-configuring from storage...");
        await this.configure(aiConfig);
      }
    } finally {
      this._configuring = false;
    }
  }

  /**
   * Configure AI client with provider settings
   * @param {Object} config - AI configuration
   */
  async configure(config: Record<string, unknown>): Promise<unknown> {
    const hostBridge = this.getHostTransportBridge()?.ai;
    if (hostBridge) {
      return await hostBridge.configure?.(config);
    }

    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("AIServiceProxy: Bridge not available");
      return await bridge.sendMessage(MessageTypes.AI_CONFIGURE, { config });
    } else {
      return this.directService.configure(config);
    }
  }

  /**
   * Check if service is configured and ready
   * @returns {Promise<boolean>} True if ready
   */
  async isConfigured(): Promise<boolean> {
    const hostBridge = this.getHostTransportBridge()?.ai;
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
          MessageTypes.AI_IS_CONFIGURED,
          {},
        )) as { configured?: boolean };
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
  getCurrentProvider() {
    const hostBridge = this.getHostTransportBridge()?.ai;
    if (hostBridge?.getCurrentProvider) {
      const provider = hostBridge.getCurrentProvider();
      return typeof provider === "string" || provider === null
        ? provider
        : null;
    }

    if (this.isExtension) {
      // Could add message to get provider, but not critical
      return null;
    } else {
      return this.directService.getCurrentProvider();
    }
  }

  /**
   * Send message with streaming support
   * @param {Array} messages - Array of message objects (OpenAI format)
   * @param {Function} onStream - Callback for streaming tokens
   * @param {Object} options - Additional options { useUtilitySession: boolean }
   * @returns {Promise<string>} Full response text
   */
  async sendMessage(
    messages: AIMessage[],
    onStream: ((chunk: string) => void) | null = null,
    options: Record<string, unknown> = {},
  ): Promise<AIServiceResponse> {
    await this.ensureConfigured();

    const hostBridge = this.getHostTransportBridge()?.ai;
    if (hostBridge) {
      try {
        const response = await hostBridge.sendMessage({
          messages,
          options,
          signal: null,
          onStream,
        });

        return {
          success: response.success !== false,
          response: response.response ?? null,
          cancelled: response.cancelled === true,
          error: response.error ?? null,
        };
      } catch (error: unknown) {
        return {
          success: false,
          response: null,
          cancelled: false,
          error,
        };
      }
    }

    if (this.isExtension) {
      // Extension mode: streaming via message bridge
      return await this.sendMessageViabridge(messages, onStream, options);
    } else {
      // Dev mode: direct service call
      return await this.directService.sendMessage(
        messages,
        onStream,
        null,
        options,
      );
    }
  }

  /**
   * Send message via bridge (extension mode) with streaming
   * @param {Array} messages - Message array
   * @param {Function} onStream - Stream callback
   * @param {Object} options - Additional options { useUtilitySession: boolean }
   * @returns {Promise<{success: boolean, response: string, cancelled: boolean, error: Error|null}>} Result object
   */
  async sendMessageViabridge(
    messages: AIMessage[],
    onStream: ((chunk: string) => void) | null,
    options: Record<string, unknown> = {},
  ): Promise<AIServiceResponse> {
    const bridge = await this.waitForBridge();
    if (!bridge) {
      throw new Error("AIServiceProxy: Bridge not available");
    }

    try {
      if (onStream) {
        // Streaming mode - use AI_SEND_MESSAGE (background handler supports streaming)
        let fullResponse = "";
        if (!bridge.sendStreamingMessage) {
          throw new Error("AIServiceProxy: Streaming bridge is not available");
        }

        // Flag for the background to rebuild an onReasoning callback
        // (functions cannot cross the bridge)
        const wantsThinking = typeof options.onReasoning === "function";
        let fullThinking = "";
        await bridge.sendStreamingMessage(
          MessageTypes.AI_SEND_MESSAGE,
          {
            messages,
            options: {
              ...options,
              streaming: true,
              ...(wantsThinking ? { thinkingStream: true } : {}),
            },
          }, // Mark as streaming request
          (chunk: string, channel?: string) => {
            if (channel === "reasoning") {
              fullThinking += chunk;
              (options.onReasoning as ((c: string) => void) | undefined)?.(
                chunk,
              );
              return;
            }
            fullResponse += chunk;
            onStream(chunk);
          },
          { timeout: 120000 }, // 2 minutes for AI streaming
        );

        // Return in same format as AIService.sendMessage()
        return {
          success: true,
          response: fullResponse,
          cancelled: false,
          error: null,
          ...(fullThinking ? { thinking: fullThinking } : {}),
        };
      } else {
        // Non-streaming mode - explicitly mark as non-streaming
        const response = (await bridge.sendMessage(
          MessageTypes.AI_SEND_MESSAGE,
          { messages, options: { ...options, streaming: false } }, // Mark as non-streaming request
          { timeout: 60000 }, // 1 minute timeout
        )) as BridgeAIResponse;

        // Return in same format as AIService.sendMessage()
        if (response?.success === false) {
          return {
            success: false,
            response: response.response ?? null,
            cancelled: false,
            error: response.message ? new Error(response.message) : null,
          };
        }

        return {
          success: true,
          response: response?.response || "",
          cancelled: false,
          error: null,
          ...(response?.thinking ? { thinking: response.thinking } : {}),
        };
      }
    } catch (error: unknown) {
      // Return error in same format as AIService
      return { success: false, response: null, cancelled: false, error };
    }
  }

  /**
   * Send message without streaming (simpler interface)
   * @param {Array} messages - Array of message objects
   * @returns {Promise<string>} Full response text
   */
  async sendMessageSync(messages: AIMessage[]): Promise<string> {
    await this.ensureConfigured();

    const hostBridge = this.getHostTransportBridge()?.ai;
    if (hostBridge) {
      const response = await hostBridge.sendMessage({
        messages,
        signal: null,
        onStream: null,
      });
      return response.response ?? "";
    }

    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("AIServiceProxy: Bridge not available");
      const response = (await bridge.sendMessage(
        MessageTypes.AI_SEND_MESSAGE,
        { messages },
        { timeout: 60000 },
      )) as BridgeAIResponse;
      return response.text || "";
    } else {
      return await this.directService.sendMessageSync(messages);
    }
  }

  /**
   * Abort the current ongoing request
   */
  async abortRequest(): Promise<boolean> {
    const hostBridge = this.getHostTransportBridge()?.ai;
    if (hostBridge) {
      if (!hostBridge.abortRequest) {
        return true;
      }

      return (await hostBridge.abortRequest()) === true;
    }

    if (this.isExtension) {
      // Send abort message to background
      const bridge = await this.waitForBridge();
      if (bridge) {
        bridge
          .sendMessage(MessageTypes.AI_ABORT, {})
          .catch((error: unknown) => {
            Logger.warn("AIServiceProxy", "Abort failed:", error);
          });
      }
      return true;
    } else {
      return this.directService.abortRequest();
    }
  }

  /**
   * Check if there's an ongoing request
   * @returns {boolean} True if request is in progress
   */
  isGenerating() {
    if (this.isExtension) {
      // In extension mode, background tracks this
      // For simplicity, return false (could add message to check)
      return false;
    } else {
      return this.directService.isGenerating();
    }
  }

  /**
   * Test connection to configured provider
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection(): Promise<boolean> {
    await this.ensureConfigured();

    const hostBridge = this.getHostTransportBridge()?.ai;
    if (hostBridge) {
      if (!hostBridge.testConnection) {
        return true;
      }

      return (await hostBridge.testConnection()) === true;
    }

    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("AIServiceProxy: Bridge not available");
      const response = (await bridge.sendMessage(
        MessageTypes.AI_TEST_CONNECTION,
        {},
        { timeout: 30000 },
      )) as BridgeAIResponse;
      return response.success === true;
    } else {
      return await this.directService.testConnection();
    }
  }

  async listRemoteModels(config: {
    provider: "openai" | "ollama" | "android-local" | "desktop-local";
    endpoint?: string;
    apiKey?: string;
  }): Promise<{ models: string[]; error?: string }> {
    const hostBridge = this.getHostTransportBridge()?.ai;
    if (hostBridge) {
      if (!hostBridge.listModels) {
        return {
          models: [],
          error: "Host bridge does not support remote model listing.",
        };
      }

      return await hostBridge.listModels(config);
    }

    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) {
        throw new Error("AIServiceProxy: Bridge not available");
      }

      const response = (await bridge.sendMessage(
        MessageTypes.AI_LIST_REMOTE_MODELS,
        { config },
        { timeout: 30000 },
      )) as BridgeAIResponse;

      return {
        models: Array.isArray(response.models) ? response.models : [],
        ...(response.error ? { error: response.error } : {}),
      };
    }

    return await this.directService.listRemoteModels(config);
  }

  /**
   * Check Chrome AI availability
   * @returns {Promise<Object>} Availability result object
   */
  async checkChromeAIAvailability(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("AIServiceProxy: Bridge not available");
      const response = await bridge.sendMessage(
        MessageTypes.CHROME_AI_CHECK_AVAILABILITY,
        {},
        { timeout: 10000 },
      );
      return response;
    } else {
      // Direct access to ChromeAIValidator through AIService
      const ChromeAIValidator = (await import("../ChromeAIValidator")).default;
      return await ChromeAIValidator.checkAvailability();
    }
  }

  /**
   * Check if Chrome AI is supported
   * @returns {Promise<boolean>} True if supported
   */
  async isChromeAISupported(): Promise<boolean> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("AIServiceProxy: Bridge not available");
      const response = (await bridge.sendMessage(
        MessageTypes.CHROME_AI_IS_SUPPORTED,
        {},
        { timeout: 5000 },
      )) as BridgeAIResponse;
      return response.supported === true;
    } else {
      const ChromeAIValidator = (await import("../ChromeAIValidator")).default;
      return ChromeAIValidator.isSupported();
    }
  }

  /**
   * Start Chrome AI model download
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Download result
   */
  async startChromeAIDownload(
    onProgress?: (progress: unknown) => void,
  ): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("AIServiceProxy: Bridge not available");

      // Set up message listener for progress updates via bridge
      let progressListener = null;
      if (onProgress) {
        progressListener = (message: unknown) => {
          const typedMessage = message as { type?: string; data?: unknown };
          if (
            typedMessage.type === MessageTypes.CHROME_AI_DOWNLOAD_PROGRESS &&
            typedMessage.data
          ) {
            onProgress(typedMessage.data);
          }
        };
        bridge.addMessageListener?.(progressListener);
      }

      try {
        // Trigger download in background
        const response = (await bridge.sendMessage(
          MessageTypes.CHROME_AI_START_DOWNLOAD,
          {},
          { timeout: 300000 }, // 5 minutes for download
        )) as BridgeAIResponse;

        if (!response.success) {
          throw new Error(response.message || "Failed to start download");
        }
        return response;
      } finally {
        if (progressListener) {
          bridge.removeMessageListener?.(progressListener);
        }
      }
    } else {
      const ChromeAIValidator = (await import("../ChromeAIValidator")).default;
      return await ChromeAIValidator.monitorDownload(onProgress);
    }
  }

  /**
   * Download Chrome AI model (alias for startChromeAIDownload)
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Download result
   */
  async downloadChromeAIModel(
    onProgress?: (progress: unknown) => void,
  ): Promise<unknown> {
    return await this.startChromeAIDownload(onProgress);
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method: string, ...args: unknown[]): Promise<unknown> {
    // Map method names to message types
    const methodMap: Record<
      | "configure"
      | "sendMessage"
      | "sendMessageSync"
      | "abortRequest"
      | "testConnection",
      string
    > = {
      configure: MessageTypes.AI_CONFIGURE,
      sendMessage: MessageTypes.AI_SEND_MESSAGE,
      sendMessageSync: MessageTypes.AI_SEND_MESSAGE,
      abortRequest: MessageTypes.AI_ABORT,
      testConnection: MessageTypes.AI_TEST_CONNECTION,
    };

    const messageType = methodMap[method as keyof typeof methodMap];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error("AIServiceProxy: Bridge not available");
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method: string, ...args: unknown[]): Promise<unknown> {
    const candidateMethod = this.directService[method];
    if (typeof candidateMethod !== "function") {
      throw new Error(`Method ${method} not found on AIService`);
    }

    return await (candidateMethod as (...params: unknown[]) => unknown)(
      ...args,
    );
  }
}

// Export singleton instance
const aiServiceProxy = new AIServiceProxy();
export default aiServiceProxy;
