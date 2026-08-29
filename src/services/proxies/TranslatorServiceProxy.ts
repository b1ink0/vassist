/**
 * Translator Service Proxy
 * Dual-mode wrapper for TranslatorService
 * Dev mode: Direct API calls
 * Extension mode: Background handles translation
 */

import { ServiceProxy } from "./ServiceProxy";
import TranslatorService from "../TranslatorService";
import { MessageTypes } from "../../../extension/shared/MessageTypes";
import Logger from "../LoggerService";
import StorageServiceProxy from "./StorageServiceProxy";
import { DefaultAIConfig } from "../../config/aiConfig";

interface TranslatorServiceLike {
  configure(config: Record<string, unknown>): Promise<unknown> | unknown;
  isConfigured(): boolean;
  checkAvailability(
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string> | string;
  translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string>;
  translateStreaming(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): AsyncIterable<string>;
  abort(): void;
  destroy(): Promise<void> | void;
  [method: string]: unknown;
}

interface TranslatorProxyConfig {
  aiFeatures?: {
    translator?: {
      enabled?: boolean;
    };
  };
  [key: string]: unknown;
}

class TranslatorServiceProxy extends ServiceProxy {
  protected directService: TranslatorServiceLike;
  protected _configuring: boolean;

  constructor() {
    super("TranslatorService");
    this.directService = TranslatorService as unknown as TranslatorServiceLike;
    this._configuring = false;
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
        "aiConfig",
        null,
      )) as TranslatorProxyConfig | null;
      const aiConfig =
        storedConfig ?? (DefaultAIConfig as unknown as TranslatorProxyConfig);

      if (aiConfig && aiConfig.aiFeatures?.translator?.enabled !== false) {
        Logger.log(
          "TranslatorServiceProxy",
          "Auto-configuring from storage...",
        );
        await this.configure(aiConfig);
      }
    } finally {
      this._configuring = false;
    }
  }

  /**
   * Configure Translator with provider settings
   * @param {Object} config - Configuration
   * @param {string} config.provider - 'chrome-ai', 'openai', or 'ollama'
   */
  async configure(config: Record<string, unknown>): Promise<boolean> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge)
        throw new Error("TranslatorServiceProxy: Bridge not available");
      const response = (await bridge.sendMessage(
        MessageTypes.TRANSLATOR_CONFIGURE,
        { config },
      )) as { configured?: boolean };
      return response.configured === true;
    } else {
      await this.directService.configure(config);
      return true;
    }
  }

  /**
   * Check if service is configured
   * @returns {Promise<boolean>} True if ready
   */
  async isConfigured(): Promise<boolean> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) return false;
      try {
        const response = (await bridge.sendMessage(
          MessageTypes.TRANSLATOR_IS_CONFIGURED,
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
   * Check availability for language pair
   * @param {string} sourceLanguage - Source language code
   * @param {string} targetLanguage - Target language code
   * @returns {Promise<string>} 'readily', 'downloading', 'downloadable', or 'unavailable'
   */
  async checkAvailability(
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge)
        throw new Error("TranslatorServiceProxy: Bridge not available");
      const response = (await bridge.sendMessage(
        MessageTypes.TRANSLATOR_CHECK_AVAILABILITY,
        { sourceLanguage, targetLanguage },
      )) as { availability?: string };
      return response.availability || "unavailable";
    } else {
      return this.directService.checkAvailability(
        sourceLanguage,
        targetLanguage,
      );
    }
  }

  /**
   * Translate text (batch)
   * @param {string} text - Text to translate
   * @param {string} sourceLanguage - Source language code
   * @param {string} targetLanguage - Target language code
   * @returns {Promise<string>} Translated text
   */
  async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string> {
    await this.ensureConfigured();

    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge)
        throw new Error("TranslatorServiceProxy: Bridge not available");
      const response = (await bridge.sendMessage(
        MessageTypes.TRANSLATOR_TRANSLATE,
        { text, sourceLanguage, targetLanguage },
        { timeout: 30000 },
      )) as { translatedText?: string };
      return response.translatedText || "";
    } else {
      return this.directService.translate(text, sourceLanguage, targetLanguage);
    }
  }

  /**
   * Translate text (streaming)
   * @param {string} text - Text to translate
   * @param {string} sourceLanguage - Source language code
   * @param {string} targetLanguage - Target language code
   * @returns {AsyncIterable<string>} Streaming translation chunks
   */
  async *translateStreaming(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): AsyncGenerator<string, void, void> {
    await this.ensureConfigured();

    if (this.isExtension) {
      // Extension mode: Use streaming message bridge with queue-based async iteration
      const bridge = await this.waitForBridge();
      if (!bridge)
        throw new Error("TranslatorServiceProxy: Bridge not available");

      // Create a queue to hold chunks as they arrive
      const chunkQueue: string[] = [];
      let streamComplete = false;
      let streamError: unknown = null;

      const sendStreamingMessage = bridge.sendStreamingMessage;
      if (!sendStreamingMessage) {
        throw new Error(
          "TranslatorServiceProxy: Streaming bridge is not available",
        );
      }

      // Start streaming in background (don't await - we yield chunks as they arrive)
      sendStreamingMessage(
        MessageTypes.TRANSLATOR_TRANSLATE_STREAMING,
        { text, sourceLanguage, targetLanguage },
        (chunk: string) => {
          chunkQueue.push(chunk);
        },
        { timeout: 120000 }, // 2 minutes for streaming
      )
        .then(() => {
          streamComplete = true;
        })
        .catch((error: unknown) => {
          streamError = error;
          streamComplete = true;
        });

      // Yield chunks as they become available
      while (!streamComplete || chunkQueue.length > 0) {
        if (chunkQueue.length > 0) {
          const nextChunk = chunkQueue.shift();
          if (nextChunk !== undefined) {
            yield nextChunk;
          }
        } else {
          // Wait a bit before checking again
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // If there was an error, throw it now
      if (streamError) {
        Logger.error(
          "TranslatorServiceProxy",
          "Streaming failed:",
          streamError,
        );
        throw streamError instanceof Error
          ? streamError
          : new Error(String(streamError));
      }
    } else {
      // Dev mode: Use direct service streaming
      yield* this.directService.translateStreaming(
        text,
        sourceLanguage,
        targetLanguage,
      );
    }
  }

  /**
   * Abort ongoing translation request
   */
  async abort(): Promise<void> {
    if (this.isExtension) {
      // Extension mode: Send abort message to background
      const bridge = await this.waitForBridge();
      if (!bridge) {
        Logger.warn("TranslatorServiceProxy", "Bridge not available for abort");
        return;
      }
      try {
        await bridge.sendMessage(MessageTypes.TRANSLATOR_ABORT, {});
      } catch (error: unknown) {
        Logger.error("TranslatorServiceProxy", "Abort failed:", error);
      }
    } else {
      // Dev mode: Call the service's abort method directly
      this.directService.abort();
    }
  }

  /**
   * Destroy all translator sessions
   */
  async destroy(): Promise<void> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge)
        throw new Error("TranslatorServiceProxy: Bridge not available");
      await bridge.sendMessage(MessageTypes.TRANSLATOR_DESTROY, {});
    } else {
      await this.directService.destroy();
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method: string, ...args: unknown[]): Promise<unknown> {
    const methodMap: Record<
      "configure" | "translate" | "checkAvailability" | "destroy",
      string
    > = {
      configure: MessageTypes.TRANSLATOR_CONFIGURE,
      translate: MessageTypes.TRANSLATOR_TRANSLATE,
      checkAvailability: MessageTypes.TRANSLATOR_CHECK_AVAILABILITY,
      destroy: MessageTypes.TRANSLATOR_DESTROY,
    };

    const messageType = methodMap[method as keyof typeof methodMap];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge)
      throw new Error("TranslatorServiceProxy: Bridge not available");
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method: string, ...args: unknown[]): Promise<unknown> {
    const candidateMethod = this.directService[method];
    if (typeof candidateMethod !== "function") {
      throw new Error(`Method ${method} not found on TranslatorService`);
    }

    return await (candidateMethod as (...params: unknown[]) => unknown)(
      ...args,
    );
  }
}

// Export singleton instance
const translatorServiceProxy = new TranslatorServiceProxy();
export default translatorServiceProxy;
