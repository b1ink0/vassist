/**
 * Writer Service Proxy
 * Dual-mode wrapper for WriterService
 * Dev mode: Direct API calls
 * Extension mode: Background handles writing
 */

import { ServiceProxy } from "./ServiceProxy";
import WriterService from "../WriterService";
import { MessageTypes } from "../../../extension/shared/MessageTypes";
import Logger from "../LoggerService";
import StorageServiceProxy from "./StorageServiceProxy";
import { DefaultAIConfig } from "../../config/aiConfig";

interface WriterServiceLike {
  configure(config: Record<string, unknown>): Promise<unknown> | unknown;
  isConfigured(): boolean;
  checkAvailability(): Promise<string> | string;
  write(prompt: string, options?: Record<string, unknown>): Promise<string>;
  writeStreaming(
    prompt: string,
    options?: Record<string, unknown>,
  ): AsyncIterable<string>;
  abort(): void;
  destroy(): Promise<void> | void;
  [method: string]: unknown;
}

interface WriterProxyConfig {
  aiFeatures?: {
    writer?: {
      enabled?: boolean;
    };
  };
  [key: string]: unknown;
}

class WriterServiceProxy extends ServiceProxy {
  protected directService: WriterServiceLike;
  protected _configuring: boolean;

  constructor() {
    super("WriterService");
    this.directService = WriterService as unknown as WriterServiceLike;
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
      )) as WriterProxyConfig | null;
      const aiConfig =
        storedConfig ?? (DefaultAIConfig as unknown as WriterProxyConfig);

      if (aiConfig && aiConfig.aiFeatures?.writer?.enabled !== false) {
        Logger.log("WriterServiceProxy", "Auto-configuring from storage...");
        await this.configure(aiConfig);
      }
    } finally {
      this._configuring = false;
    }
  }

  /**
   * Configure Writer with provider settings
   * @param {Object} config - Configuration
   * @param {string} config.provider - 'chrome-ai', 'openai', or 'ollama'
   */
  async configure(config: Record<string, unknown>): Promise<boolean> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("WriterServiceProxy: Bridge not available");
      const response = (await bridge.sendMessage(
        MessageTypes.WRITER_CONFIGURE,
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
          MessageTypes.WRITER_IS_CONFIGURED,
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
   * Check availability
   * @returns {Promise<string>} 'readily', 'downloading', 'downloadable', or 'unavailable'
   */
  async checkAvailability(): Promise<string> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("WriterServiceProxy: Bridge not available");
      const response = (await bridge.sendMessage(
        MessageTypes.WRITER_CHECK_AVAILABILITY,
        {},
      )) as { availability?: string };
      return response.availability || "unavailable";
    } else {
      return this.directService.checkAvailability();
    }
  }

  /**
   * Write content (batch)
   * @param {string} prompt - Writing prompt/instruction
   * @param {Object} options - Write options
   * @returns {Promise<string>} Written content
   */
  async write(
    prompt: string,
    options: Record<string, unknown> = {},
  ): Promise<string> {
    await this.ensureConfigured();

    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("WriterServiceProxy: Bridge not available");
      const response = (await bridge.sendMessage(
        MessageTypes.WRITER_WRITE,
        { prompt, options },
        { timeout: 60000 },
      )) as { writtenContent?: string };
      return response.writtenContent || "";
    } else {
      return this.directService.write(prompt, options);
    }
  }

  /**
   * Write content (streaming)
   * @param {string} prompt - Writing prompt/instruction
   * @param {Object} options - Write options
   * @returns {AsyncIterable<string>} Streaming write chunks
   */
  async *writeStreaming(
    prompt: string,
    options: Record<string, unknown> = {},
  ): AsyncGenerator<string, void, void> {
    await this.ensureConfigured();

    if (this.isExtension) {
      // Extension mode: Use streaming message bridge with queue-based async iteration
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("WriterServiceProxy: Bridge not available");

      // Create a queue to hold chunks as they arrive
      const chunkQueue: string[] = [];
      let streamComplete = false;
      let streamError: unknown = null;

      const sendStreamingMessage = bridge.sendStreamingMessage;
      if (!sendStreamingMessage) {
        throw new Error(
          "WriterServiceProxy: Streaming bridge is not available",
        );
      }

      // Start streaming in background (don't await - we yield chunks as they arrive)
      sendStreamingMessage(
        MessageTypes.WRITER_WRITE_STREAMING,
        { prompt, options },
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
        Logger.error("WriterServiceProxy", "Streaming failed:", streamError);
        throw streamError instanceof Error
          ? streamError
          : new Error(String(streamError));
      }
    } else {
      // Dev mode: Use direct service streaming
      yield* this.directService.writeStreaming(prompt, options);
    }
  }

  /**
   * Abort ongoing write request
   */
  async abort(): Promise<void> {
    if (this.isExtension) {
      // Extension mode: Send abort message to background
      const bridge = await this.waitForBridge();
      if (!bridge) {
        Logger.warn("WriterServiceProxy", "Bridge not available for abort");
        return;
      }
      try {
        await bridge.sendMessage(MessageTypes.WRITER_ABORT, {});
      } catch (error: unknown) {
        Logger.error("WriterServiceProxy", "Abort failed:", error);
      }
    } else {
      // Dev mode: Call the service's abort method directly
      this.directService.abort();
    }
  }

  /**
   * Destroy all writer sessions
   */
  async destroy(): Promise<void> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error("WriterServiceProxy: Bridge not available");
      await bridge.sendMessage(MessageTypes.WRITER_DESTROY, {});
    } else {
      await this.directService.destroy();
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method: string, ...args: unknown[]): Promise<unknown> {
    const methodMap: Record<
      "configure" | "write" | "checkAvailability" | "destroy",
      string
    > = {
      configure: MessageTypes.WRITER_CONFIGURE,
      write: MessageTypes.WRITER_WRITE,
      checkAvailability: MessageTypes.WRITER_CHECK_AVAILABILITY,
      destroy: MessageTypes.WRITER_DESTROY,
    };

    const messageType = methodMap[method as keyof typeof methodMap];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error("WriterServiceProxy: Bridge not available");
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method: string, ...args: unknown[]): Promise<unknown> {
    const candidateMethod = this.directService[method];
    if (typeof candidateMethod !== "function") {
      throw new Error(`Method ${method} not found on WriterService`);
    }

    return await (candidateMethod as (...params: unknown[]) => unknown)(
      ...args,
    );
  }
}

// Export singleton instance
const writerServiceProxy = new WriterServiceProxy();
export default writerServiceProxy;
