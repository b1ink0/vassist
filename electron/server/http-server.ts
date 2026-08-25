/**
 * Local AI HTTP Server
 * OpenAI-compatible endpoints on http://127.0.0.1:11438
 *
 * Endpoints:
 *   POST /v1/chat/completions - LLM chat (streaming supported)
 *   POST /v1/audio/transcriptions - STT (proxied to Faster Whisper Python server)
 *   POST /v1/audio/speech - TTS (proxied to GPT-SoVITS)
 */

import express from "express";
import axios from "axios";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import FormData from "form-data";
import multer from "multer";
import type { Express, NextFunction, Request, Response } from "express";
import type { Server } from "http";
import type { Multer } from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type LLMBackend = "auto" | "cpu" | "cuda" | "vulkan" | "metal" | "rocm";

type ServerConfig = {
  llm: {
    modelPath: string | null;
    defaultModelsDir: string | null;
    backend: LLMBackend;
    temperature: number;
    maxTokens: number;
    contextSize: number;
    gpuLayers: number | "auto";
  };
  stt: {
    modelPath?: string | null;
    proxyUrl: string;
    model?: string;
    language?: string;
    engine?: "python" | "whispercpp";
    variant?: string;
  };
  tts: {
    proxyUrl: string;
    enabled: boolean;
    supertonicUrl?: string;
    engine?: "gpt-sovits" | "supertonic";
  };
  server: {
    shareOnNetwork: boolean;
    host: string;
    port?: number;
  };
};

type LlamaApi = {
  getLlama: (opts: {
    gpu: "auto" | "cuda" | "vulkan" | "metal" | false;
  }) => Promise<{
    gpu?: string;
    loadModel: (opts: {
      modelPath: string;
      gpuLayers: number | "auto";
    }) => Promise<{
      gpuLayers?: number;
      createContext: (opts: { contextSize: number }) => Promise<{
        getSequence: () => unknown;
        dispose: () => Promise<void>;
      }>;
      dispose: () => Promise<void>;
    }>;
  }>;
  LlamaChat: new (opts: { contextSequence: unknown }) => {
    generateResponse: (
      history: unknown[],
      opts: {
        temperature: number;
        maxTokens: number;
        onTextChunk?: (chunk: string) => void;
      },
    ) => Promise<{ response: string }>;
  };
};

type WhisperContextLike = {
  release: () => Promise<void>;
};

type LocalAIServerDeps = {
  loadLlamaApi?: (() => Promise<unknown>) | null;
  ensureTTSBackendRunning?: (() => void | Promise<void>) | null;
  restartTTSBackend?: ((reason: string) => void | Promise<void>) | null;
  ensureSupertonicRunning?: (() => void | Promise<void>) | null;
  restartSupertonicBackend?: ((reason: string) => void | Promise<void>) | null;
  ensureWhisperCppRunning?: ((variant?: string) => Promise<void>) | null;
  restartWhisperCppBackend?: ((reason: string) => void | Promise<void>) | null;
  ensureSttBackendRunning?: (() => void | Promise<void>) | null;
  onSTTRequestStart?: (() => void) | null;
  onSTTRequestComplete?: (() => void) | null;
  onTTSRequestStart?: (() => void) | null;
  onTTSRequestComplete?: (() => void) | null;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Strip complete <think>...</think> blocks from a full response text,
 * including an unclosed trailing block (token-limit cutoff).
 */
function stripThinkBlocks(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const openIdx = out.indexOf("<think>");
  if (openIdx !== -1 && out.indexOf("</think>", openIdx) === -1) {
    out = out.slice(0, openIdx);
  }
  return out.replace(/^\s+/, "");
}

/**
 * Streaming-safe think-tag suppressor. Buffers potential partial tags
 * (e.g. "<thi") so false positives never reach the client.
 */
class ThinkTagStripper {
  private buffer = "";
  private insideThink = false;

  push(chunk: string): string {
    this.buffer += chunk;
    let out = "";
    for (;;) {
      if (this.insideThink) {
        const close = this.buffer.indexOf("</think>");
        if (close !== -1) {
          this.buffer = this.buffer.slice(close + "</think>".length);
          this.insideThink = false;
          continue;
        }
        const keep = this.partialSuffix(this.buffer, "</think>");
        out += this.buffer.slice(0, this.buffer.length - keep);
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        break;
      } else {
        const open = this.buffer.indexOf("<think>");
        if (open !== -1) {
          out += this.buffer.slice(0, open);
          this.buffer = this.buffer.slice(open + "<think>".length);
          this.insideThink = true;
          continue;
        }
        const keep = this.partialSuffix(this.buffer, "<think>");
        out += this.buffer.slice(0, this.buffer.length - keep);
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        break;
      }
    }
    return out;
  }

  finish(): string {
    const rest = this.insideThink ? "" : this.buffer;
    this.buffer = "";
    return rest;
  }

  private partialSuffix(text: string, tag: string): number {
    const max = Math.min(text.length, tag.length - 1);
    for (let len = max; len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) return len;
    }
    return 0;
  }
}

class InvalidTTSAudioResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTTSAudioResponseError";
  }
}

function isRetryableTTSBackendError(error: unknown): boolean {
  if (error instanceof InvalidTTSAudioResponseError) {
    return true;
  }

  if (!axios.isAxiosError(error)) {
    return false;
  }

  if (error.response) {
    return error.response.status >= 500;
  }

  return new Set([
    "ECONNABORTED",
    "ECONNREFUSED",
    "ECONNRESET",
    "EPIPE",
    "ERR_NETWORK",
    "ETIMEDOUT",
  ]).has(error.code || "");
}

function validateTTSAudioResponse(data: unknown) {
  const audio = Buffer.from(data as ArrayBuffer);
  const isWav =
    audio.length >= 44 &&
    audio.toString("ascii", 0, 4) === "RIFF" &&
    audio.toString("ascii", 8, 12) === "WAVE";

  if (!isWav) {
    throw new InvalidTTSAudioResponseError(
      `GPT-SoVITS returned an invalid WAV response (${audio.length} bytes)`,
    );
  }

  return audio;
}

function getTTSBackendErrorDetails(error: unknown) {
  if (!axios.isAxiosError(error) || error.response?.data == null) {
    return "";
  }

  try {
    const body = Buffer.isBuffer(error.response.data)
      ? error.response.data.toString("utf8")
      : typeof error.response.data === "string"
        ? error.response.data
        : Buffer.from(error.response.data as ArrayBuffer).toString("utf8");
    return body.trim().slice(0, 2000);
  } catch {
    return "";
  }
}

export class LocalAIServer {
  app: Express;
  server: Server | null;
  port: number;
  host: string;
  llama: {
    gpu?: string;
    loadModel: (opts: {
      modelPath: string;
      gpuLayers: number | "auto";
    }) => Promise<{
      gpuLayers?: number;
      createContext: (opts: { contextSize: number }) => Promise<{
        getSequence: () => unknown;
        dispose: () => Promise<void>;
      }>;
      dispose: () => Promise<void>;
    }>;
  } | null;
  llamaModel: {
    gpuLayers?: number;
    createContext: (opts: {
      contextSize: number;
    }) => Promise<{ getSequence: () => unknown; dispose: () => Promise<void> }>;
    dispose: () => Promise<void>;
  } | null;
  llamaContext: {
    getSequence: () => unknown;
    dispose: () => Promise<void>;
  } | null;
  whisperContext: WhisperContextLike | null;
  llamaChat: {
    generateResponse: (
      history: unknown[],
      opts: {
        temperature: number;
        maxTokens: number;
        onTextChunk?: (chunk: string) => void;
        onResponseChunk?: (chunk: {
          type?: undefined | string;
          segmentType?: undefined | string;
          text?: string;
        }) => void;
      },
    ) => Promise<{ response: string }>;
  } | null;
  currentModelPath: string | null;
  loadLlamaApi: (() => Promise<unknown>) | null;
  ensureTTSBackendRunning: (() => void | Promise<void>) | null;
  restartTTSBackend: ((reason: string) => void | Promise<void>) | null;
  ensureSupertonicRunning: (() => void | Promise<void>) | null;
  restartSupertonicBackend: ((reason: string) => void | Promise<void>) | null;
  ensureWhisperCppRunning: ((variant?: string) => Promise<void>) | null;
  restartWhisperCppBackend: ((reason: string) => void | Promise<void>) | null;
  ensureSttBackendRunning: (() => void | Promise<void>) | null;
  onSTTRequestStart: (() => void) | null;
  onSTTRequestComplete: (() => void) | null;
  onTTSRequestStart: (() => void) | null;
  onTTSRequestComplete: (() => void) | null;
  isLoadingModel: boolean;
  loadPromise: Promise<void> | null;
  lastUsed: number | null;
  idleTimer: NodeJS.Timeout | null;
  readonly IDLE_TIMEOUT: number;
  config: ServerConfig;
  upload!: Multer;

  constructor({
    loadLlamaApi,
    ensureTTSBackendRunning,
    restartTTSBackend,
    ensureSupertonicRunning,
    restartSupertonicBackend,
    ensureWhisperCppRunning,
    restartWhisperCppBackend,
    ensureSttBackendRunning,
    onSTTRequestStart,
    onSTTRequestComplete,
    onTTSRequestStart,
    onTTSRequestComplete,
  }: LocalAIServerDeps = {}) {
    this.app = express();
    this.server = null;
    this.port = 11438;
    this.host = "127.0.0.1";

    // AI instances
    this.llama = null;
    this.llamaModel = null;
    this.llamaContext = null;
    this.llamaChat = null;
    this.whisperContext = null;
    this.currentModelPath = null;
    this.loadLlamaApi = loadLlamaApi || null;
    this.ensureTTSBackendRunning =
      typeof ensureTTSBackendRunning === "function"
        ? ensureTTSBackendRunning
        : null;
    this.restartTTSBackend =
      typeof restartTTSBackend === "function" ? restartTTSBackend : null;
    this.ensureSupertonicRunning =
      typeof ensureSupertonicRunning === "function"
        ? ensureSupertonicRunning
        : null;
    this.restartSupertonicBackend =
      typeof restartSupertonicBackend === "function"
        ? restartSupertonicBackend
        : null;
    this.ensureWhisperCppRunning =
      typeof ensureWhisperCppRunning === "function"
        ? ensureWhisperCppRunning
        : null;
    this.restartWhisperCppBackend =
      typeof restartWhisperCppBackend === "function"
        ? restartWhisperCppBackend
        : null;
    this.ensureSttBackendRunning =
      typeof ensureSttBackendRunning === "function"
        ? ensureSttBackendRunning
        : null;
    this.onSTTRequestStart =
      typeof onSTTRequestStart === "function" ? onSTTRequestStart : null;
    this.onSTTRequestComplete =
      typeof onSTTRequestComplete === "function" ? onSTTRequestComplete : null;
    this.onTTSRequestStart =
      typeof onTTSRequestStart === "function" ? onTTSRequestStart : null;
    this.onTTSRequestComplete =
      typeof onTTSRequestComplete === "function" ? onTTSRequestComplete : null;

    // On-demand loading state
    this.isLoadingModel = false;
    this.loadPromise = null;
    this.lastUsed = null;
    this.idleTimer = null;
    this.IDLE_TIMEOUT = 5 * 60 * 1000;

    // Configuration
    this.config = {
      llm: {
        modelPath: null,
        defaultModelsDir: null,
        backend: "auto",
        temperature: 0.7,
        maxTokens: 2048,
        contextSize: 4096,
        gpuLayers: "auto",
      },
      stt: {
        proxyUrl: "http://127.0.0.1:9881",
      },
      tts: {
        proxyUrl: "http://127.0.0.1:9880",
        enabled: false,
      },
      server: {
        shareOnNetwork: false,
        host: "127.0.0.1",
      },
    };

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    });
    this.upload = upload;

    this.app.use(express.json({ limit: "100mb" }));
    this.app.use(express.raw({ type: "audio/*", limit: "100mb" }));

    // CORS
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "*");
      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }
      next();
    });

    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[HTTP] ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    this.app.get("/health", (_req: Request, res: Response) => {
      res.json({
        status: "ok",
        llm: this.llamaModel !== null,
        stt: "proxied",
        tts: "proxied",
      });
    });

    this.app.post(
      "/v1/chat/completions",
      async (req: Request, res: Response) => {
        try {
          await this.handleChatCompletion(req, res);
        } catch (error) {
          console.error("[LLM] Error:", error);
          res.status(500).json({ error: getErrorMessage(error) });
        }
      },
    );

    this.app.post(
      "/v1/audio/transcriptions",
      this.upload.single("file"),
      async (req: Request, res: Response) => {
        try {
          await this.handleTranscription(req, res);
        } catch (error) {
          console.error("[STT] Error:", error);
          res.status(500).json({ error: getErrorMessage(error) });
        }
      },
    );

    this.app.post("/v1/audio/speech", async (req: Request, res: Response) => {
      try {
        await this.handleTextToSpeech(req, res);
      } catch (error) {
        console.error("[TTS] Error:", error);
        res.status(500).json({ error: getErrorMessage(error) });
      }
    });

    this.app.get("/v1/models", (_req: Request, res: Response) => {
      const models = this.listAvailableLlmModels();
      res.json({
        object: "list",
        data: models.map((modelId) => ({
          id: modelId,
          object: "model",
          created: Date.now(),
          owned_by: "local",
        })),
      });
    });
  }

  listAvailableLlmModels(): string[] {
    const modelIds = new Set<string>();
    const candidateDirs = [
      this.config.llm.defaultModelsDir,
      this.config.llm.modelPath
        ? path.dirname(this.config.llm.modelPath)
        : null,
    ].filter((dirPath): dirPath is string => Boolean(dirPath));

    for (const dirPath of candidateDirs) {
      if (!fs.existsSync(dirPath)) {
        continue;
      }

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }
        if (!entry.name.toLowerCase().endsWith(".gguf")) {
          continue;
        }
        if (entry.name.toLowerCase().startsWith("mmproj-")) {
          continue;
        }
        modelIds.add(entry.name);
      }
    }

    if (this.config.llm.modelPath) {
      modelIds.add(path.basename(this.config.llm.modelPath));
    }

    return Array.from(modelIds).sort((left, right) =>
      left.localeCompare(right),
    );
  }

  getClientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      const firstForwardedIp = forwarded.split(",")[0]?.trim();
      if (firstForwardedIp) {
        return firstForwardedIp;
      }
    }
    return req.ip || req.socket?.remoteAddress || "";
  }

  isLoopbackAddress(ipAddress: string): boolean {
    if (!ipAddress || typeof ipAddress !== "string") {
      return false;
    }
    const normalized = ipAddress.trim().toLowerCase();
    return (
      normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized === "::ffff:127.0.0.1" ||
      normalized === "localhost"
    );
  }

  async handleChatCompletion(req: Request, res: Response) {
    const {
      messages,
      stream = false,
      temperature,
      max_tokens,
      model,
      customModelsPath,
      enable_thinking: enableThinkingRaw,
      chat_template_kwargs: chatTemplateKwargs,
      reasoning_effort: reasoningEffort,
    } = req.body;

    // Accept all industry conventions for toggling thinking
    const enableThinking =
      enableThinkingRaw ??
      (chatTemplateKwargs as { enable_thinking?: boolean } | undefined)
        ?.enable_thinking ??
      (() => {
        const effort = (reasoningEffort as string | undefined)?.toLowerCase();
        if (effort === null || effort === undefined) return false;
        return effort !== "none" && effort !== "off";
      })() === true;

    console.log("[LLM] Request received:");
    console.log("[LLM]   model:", model);
    console.log("[LLM]   customModelsPath:", customModelsPath);
    console.log("[LLM]   messages count:", messages?.length);

    if (model && model !== "local") {
      let modelPath = model;

      if (!path.isAbsolute(model)) {
        let modelsDir;

        if (customModelsPath && fs.existsSync(customModelsPath)) {
          modelsDir = customModelsPath;
          console.log("[LLM] Using custom models directory:", modelsDir);
        } else if (this.config.llm.defaultModelsDir) {
          modelsDir = this.config.llm.defaultModelsDir;
          console.log("[LLM] Using default models directory:", modelsDir);
        } else {
          modelsDir = this.config.llm.modelPath
            ? path.dirname(this.config.llm.modelPath)
            : null;
          console.log("[LLM] Using fallback models directory:", modelsDir);
        }

        if (modelsDir && fs.existsSync(modelsDir)) {
          const exactPath = path.join(modelsDir, model);
          if (fs.existsSync(exactPath)) {
            modelPath = exactPath;
          } else {
            const files = fs.readdirSync(modelsDir);
            const modelLower = model.toLowerCase();
            const match = files.find(
              (f) =>
                f.toLowerCase() === modelLower ||
                f.toLowerCase().includes(modelLower.split(":")[0]),
            );
            if (match) {
              modelPath = path.join(modelsDir, match);
            }
          }
        }
      }

      console.log("[LLM] Resolved modelPath:", modelPath);
      console.log(
        "[LLM] Current config.llm.modelPath:",
        this.config.llm.modelPath,
      );
      console.log(
        "[LLM] Paths match?",
        modelPath === this.config.llm.modelPath,
      );
      console.log("[LLM] Model exists?", fs.existsSync(modelPath));

      if (modelPath !== this.config.llm.modelPath && fs.existsSync(modelPath)) {
        console.log("[LLM] Request specified different model, updating config");
        console.log("[LLM]   Old:", this.config.llm.modelPath);
        console.log("[LLM]   New:", modelPath);
        this.config.llm.modelPath = modelPath;
      }
    }

    try {
      await this.ensureModelLoaded();
    } catch (error) {
      console.error("[LLM] Failed to load model:", error);
      return res
        .status(503)
        .json({ error: `Failed to load model: ${getErrorMessage(error)}` });
    }

    if (!this.llamaChat) {
      return res.status(503).json({ error: "LLM model not available" });
    }

    console.log("[LLM] Processing request with", messages.length, "messages");

    const chatHistory = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        chatHistory.push({
          type: "system",
          text: msg.content,
        });
      } else if (msg.role === "user") {
        chatHistory.push({
          type: "user",
          text: msg.content,
        });
      } else if (msg.role === "assistant") {
        chatHistory.push({
          type: "model",
          response: [msg.content],
        });
      }
    }

    chatHistory.push({
      type: "model",
      response: [],
    });

    if (stream) {
      const streamThinkStripper = new ThinkTagStripper();
      const writeDelta = (text: string, isReasoning = false) => {
        if (!text) return;
        const delta: Record<string, string> = {};
        if (isReasoning) {
          delta.reasoning_content = text;
        } else {
          delta.content = text;
        }
        const chunkData = {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: path.basename(this.config.llm.modelPath ?? "local-model.gguf"),
          choices: [
            {
              index: 0,
              delta,
              finish_reason: null,
            },
          ],
        };
        res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
      };
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      try {
        await this.llamaChat.generateResponse(chatHistory, {
          temperature: temperature ?? this.config.llm.temperature,
          maxTokens: max_tokens ?? this.config.llm.maxTokens,
          onResponseChunk: (chunk: {
            segmentType?: undefined | string;
            text?: string;
          }) => {
            const text = chunk.text ?? "";
            const isThought = chunk.segmentType === "thought";

            if (isThought) {
              if (!enableThinking) return;
              writeDelta(text, true);
              return;
            }

            const out = enableThinking ? text : streamThinkStripper.push(text);
            writeDelta(out);
          },
        });

        const tail = enableThinking ? "" : streamThinkStripper.finish();
        if (tail) {
          const tailChunk = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: path.basename(
              this.config.llm.modelPath ?? "local-model.gguf",
            ),
            choices: [
              {
                index: 0,
                delta: { content: tail },
                finish_reason: null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(tailChunk)}\n\n`);
        }

        const finalChunk = {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: path.basename(this.config.llm.modelPath ?? "local-model.gguf"),
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
        };

        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (error) {
        console.error("[LLM] Streaming error:", error);
        res.write(
          `data: ${JSON.stringify({ error: getErrorMessage(error) })}\n\n`,
        );
        res.end();
      }
    } else {
      const result = await this.llamaChat.generateResponse(chatHistory, {
        temperature: temperature ?? this.config.llm.temperature,
        maxTokens: max_tokens ?? this.config.llm.maxTokens,
      });

      const rawResponse = result.response;

      let reasoningContent: string | undefined;
      let responseText = rawResponse;
      const thinkStart = rawResponse.indexOf("<think>");
      if (thinkStart !== -1) {
        const thinkEnd = rawResponse.indexOf("</think>", thinkStart);
        if (thinkEnd !== -1) {
          reasoningContent =
            rawResponse.slice(thinkStart + 7, thinkEnd).trim() || undefined;
          responseText = (
            rawResponse.slice(0, thinkStart) + rawResponse.slice(thinkEnd + 8)
          ).trim();
        } else {
          reasoningContent = rawResponse.slice(thinkStart + 7).trim();
          responseText = rawResponse.slice(0, thinkStart).trim();
        }
      }
      if (!enableThinking) {
        reasoningContent = undefined;
        responseText = stripThinkBlocks(responseText);
      }

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: path.basename(this.config.llm.modelPath ?? "local-model.gguf"),
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: responseText,
              ...(reasoningContent
                ? { reasoning_content: reasoningContent }
                : {}),
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      });
    }
  }

  /**
   * Proxy transcription to the bundled whisper.cpp server
   * (`whisper-server` on port 9883). Accepts the same multipart form and
   * returns OpenAI-compatible JSON ({text}).
   */
  async handleWhisperCppTranscription(
    req: Request,
    res: Response,
    requestedVariant?: string,
  ) {
    const whisperCppUrl = "http://127.0.0.1:9883";
    const forwardOnce = async () => {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "No audio file provided" });
      }
      if (this.ensureWhisperCppRunning) {
        // Carry the persisted runtime selection with the request itself so
        // the manager resolves it even before any server:start sync ran.
        console.log(
          `[WhisperCpp] Request routing with variant =`,
          requestedVariant ?? this.config.stt?.variant ?? "<undefined>",
        );
        await this.ensureWhisperCppRunning(
          requestedVariant ?? this.config.stt?.variant,
        );
      }
      const formData = new FormData();
      formData.append("file", req.file.buffer, {
        filename: "audio.wav",
        contentType: req.file.mimetype || "audio/wav",
      });
      // whisper-server /inference params
      formData.append("response_format", "json");
      const language =
        typeof req.body?.language === "string" && req.body.language.trim()
          ? req.body.language.trim()
          : typeof this.config.stt?.language === "string"
            ? this.config.stt.language.trim()
            : "";

      let effectiveLanguage =
        language && language.length > 0 ? language : "auto";

      const sttModel =
        typeof req.body?.model === "string"
          ? req.body.model
          : this.config.stt?.model || "";
      if (/\.en(\.bin)?$/.test(sttModel.toLowerCase())) {
        effectiveLanguage = "en";
      }

      formData.append("language", effectiveLanguage);
      formData.append("temperature", "0.0");
      formData.append("beam_size", "-1");

      const response = await axios.post(
        `${whisperCppUrl}/inference`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 60000,
        },
      );
      return response.data;
    };

    try {
      let data;
      try {
        data = await forwardOnce();
      } catch (error) {
        if (!this.restartWhisperCppBackend) throw error;
        console.warn(
          "[STT] whisper.cpp request failed; restarting backend:",
          getErrorMessage(error),
        );
        await this.restartWhisperCppBackend("request failure");
        data = await forwardOnce();
      }

      // Normalize to OpenAI shape
      const text =
        typeof data?.text === "string"
          ? data.text
          : Array.isArray(data?.transcription)
            ? data.transcription
                .map((t: { text?: string }) => t.text ?? "")
                .join("")
                .trim()
            : "";
      res.json({ text });
    } catch (error) {
      console.error("[STT] whisper.cpp error:", getErrorMessage(error));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  }

  async handleTranscription(req: Request, res: Response) {
    // ── whisper.cpp engine (stateless: request body wins over config) ─
    const bodyEngine =
      typeof req.body?.engine === "string" ? req.body.engine : undefined;
    const bodyVariant =
      typeof req.body?.variant === "string" ? req.body.variant : undefined;
    if (
      bodyEngine === "whispercpp" ||
      (!bodyEngine && this.config.stt?.engine === "whispercpp")
    ) {
      return await this.handleWhisperCppTranscription(req, res, bodyVariant);
    }

    console.log(
      "[STT] Proxying to Faster Whisper server:",
      this.config.stt.proxyUrl,
    );

    try {
      this.onSTTRequestStart?.();

      if (this.ensureSttBackendRunning) {
        await this.ensureSttBackendRunning();
      }

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const formData = new FormData();
      formData.append("file", req.file.buffer, {
        filename: "audio.wav",
        contentType: req.file.mimetype || "audio/wav",
      });

      const requestModel =
        typeof req.body?.model === "string" ? req.body.model.trim() : "";
      const requestLanguage =
        typeof req.body?.language === "string" ? req.body.language.trim() : "";
      const defaultModel =
        typeof this.config.stt?.model === "string"
          ? this.config.stt.model.trim()
          : "";
      const defaultLanguage =
        typeof this.config.stt?.language === "string"
          ? this.config.stt.language.trim()
          : "";
      const clientIp = this.getClientIp(req);
      const isRemoteRequest = !this.isLoopbackAddress(clientIp);

      const resolvedModel = isRemoteRequest
        ? defaultModel || requestModel
        : requestModel || defaultModel;
      const resolvedLanguage = isRemoteRequest
        ? defaultLanguage || requestLanguage
        : requestLanguage || defaultLanguage;

      if (resolvedModel) {
        formData.append("model", resolvedModel);
      }
      if (resolvedLanguage) {
        formData.append("language", resolvedLanguage);
      }

      if (req.body) {
        for (const [key, value] of Object.entries(req.body)) {
          if (key === "model" || key === "language") {
            continue;
          }
          formData.append(key, value);
        }
      }

      const response = await axios.post(
        `${this.config.stt.proxyUrl}/v1/audio/transcriptions`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 60000,
        },
      );

      this.onSTTRequestComplete?.();
      res.json(response.data);
    } catch (error) {
      console.error("[STT] Proxy error:", getErrorMessage(error));
      this.onSTTRequestComplete?.();
      if (axios.isAxiosError(error) && error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      res.status(500).json({
        error: "STT proxy failed",
        details: getErrorMessage(error),
      });
    }
  }

  /**
   * Proxy TTS to the bundled Supertonic 3 server (`supertonic serve`,
   * port 9882). Fixed built-in voices (M1–M5 / F1–F5) across 31 languages,
   * CPU-fast, no reference audio required.
   */
  async handleSupertonicSpeech(
    req: Request,
    res: Response,
    params: {
      input: string;
      voice: string;
      lang: string;
      speed?: number | undefined;
    },
  ) {
    const supertonicUrl =
      this.config.tts?.supertonicUrl || "http://127.0.0.1:9882";

    const forward = async () => {
      if (this.ensureSupertonicRunning) {
        await this.ensureSupertonicRunning();
      }

      console.log("[TTS] Forwarding to Supertonic:", {
        textLength: params.input.length,
        voice: params.voice,
        lang: params.lang,
        speed: params.speed ?? 1.0,
      });

      const response = await axios.post(
        `${supertonicUrl}/v1/tts`,
        {
          text: params.input,
          voice: params.voice,
          lang: params.lang,
          speed: params.speed ?? 1.0,
          response_format: "wav",
        },
        {
          headers: { "Content-Type": "application/json" },
          responseType: "arraybuffer",
          timeout: 60000,
        },
      );
      return validateTTSAudioResponse(response.data);
    };

    let audio;
    try {
      audio = await forward();
    } catch (error) {
      if (
        !isRetryableTTSBackendError(error) ||
        !this.restartSupertonicBackend
      ) {
        throw error;
      }
      console.warn(
        "[TTS] Supertonic request failed; restarting backend and retrying once:",
        getErrorMessage(error),
      );
      await this.restartSupertonicBackend("request failure");
      audio = await forward();
    }

    res.set({
      "Content-Type": "audio/wav",
      "Content-Length": String(audio.length),
    });
    res.end(audio);

    this.onTTSRequestComplete?.();
    console.log("[TTS] Supertonic response sent:", audio.length, "bytes");
  }

  async handleTextToSpeech(req: Request, res: Response) {
    const {
      input,
      reference_audio,
      reference_text,
      reference_language = "en",
      model: ttsModel,
      voice: ttsVoice,
      lang: ttsLang,
      speed: ttsSpeed,
    } = req.body;

    if (!input) {
      return res.status(400).json({ error: "No text provided" });
    }

    if (this.config.tts?.enabled !== true) {
      return res.status(503).json({
        error: "TTS is disabled",
        details: "Desktop-local TTS is not active in settings.",
      });
    }

    try {
      this.onTTSRequestStart?.();

      const wantsSupertonic =
        ttsModel === "supertonic" || this.config.tts?.engine === "supertonic";

      if (wantsSupertonic) {
        await this.handleSupertonicSpeech(req, res, {
          input,
          voice: typeof ttsVoice === "string" ? ttsVoice : "F1",
          lang:
            typeof ttsLang === "string" && ttsLang
              ? ttsLang
              : typeof reference_language === "string"
                ? reference_language
                : "en",
          speed: typeof ttsSpeed === "number" ? ttsSpeed : undefined,
        });
        return;
      }

      if (this.ensureTTSBackendRunning) {
        await this.ensureTTSBackendRunning();
      }

      const requestBody = {
        input: input,
        reference_audio: reference_audio || null,
        reference_text: reference_text || "",
        reference_language: reference_language,
      };

      console.log("[TTS] Forwarding to GPT-SoVITS:", {
        textLength: input.length,
        hasReferenceAudio: !!reference_audio,
        referenceTextLength: reference_text?.length || 0,
        language: reference_language,
      });

      const forwardRequest = async () => {
        const response = await axios.post(
          `${this.config.tts.proxyUrl}/tts`,
          requestBody,
          {
            headers: { "Content-Type": "application/json" },
            responseType: "arraybuffer",
            timeout: 30000,
          },
        );
        const audio = validateTTSAudioResponse(response.data);
        console.log("[TTS] GPT-SoVITS response:", {
          status: response.status,
          bytes: audio.length,
          contentType: response.headers["content-type"] || "unknown",
        });
        return audio;
      };

      let audio;
      try {
        audio = await forwardRequest();
      } catch (error) {
        if (
          !isRetryableTTSBackendError(error) ||
          (!this.restartTTSBackend && !this.ensureTTSBackendRunning)
        ) {
          throw error;
        }

        console.warn(
          `[TTS] Backend request failed (${getErrorMessage(error)}); restarting and retrying once`,
        );
        if (this.restartTTSBackend) {
          await this.restartTTSBackend(getErrorMessage(error));
        } else if (this.ensureTTSBackendRunning) {
          await this.ensureTTSBackendRunning();
        }
        audio = await forwardRequest();
      }

      // Return audio
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Length", String(audio.length));
      res.send(audio);
    } catch (error) {
      const backendDetails = getTTSBackendErrorDetails(error);
      console.error("[TTS] Proxy error:", getErrorMessage(error));
      if (axios.isAxiosError(error) && error.response) {
        console.error(
          "[TTS] GPT-SoVITS error:",
          error.response.status,
          error.response.statusText,
          backendDetails || "(no response body)",
        );
      }
      const detailSuffix = backendDetails ? `: ${backendDetails}` : "";
      throw new Error(
        `TTS service unavailable: ${getErrorMessage(error)}${detailSuffix}`,
      );
    } finally {
      this.onTTSRequestComplete?.();
    }
  }

  async initialize(config: Partial<ServerConfig> = {}) {
    console.log("[Server] Initializing...");
    console.log("[Server] Received config:", JSON.stringify(config, null, 2));

    if (config.llm?.modelPath && !this.config.llm.defaultModelsDir) {
      this.config.llm.defaultModelsDir = path.dirname(config.llm.modelPath);
      console.log(
        "[Server] Default models directory set to:",
        this.config.llm.defaultModelsDir,
      );
    }

    Object.assign(this.config.llm, config.llm || {});
    Object.assign(this.config.stt, config.stt || {});
    Object.assign(this.config.tts, config.tts || {});
    Object.assign(this.config.server, config.server || {});
    const configuredPort = Number(this.config.server?.port);
    if (
      Number.isInteger(configuredPort) &&
      configuredPort >= 1 &&
      configuredPort <= 65535
    ) {
      this.port = configuredPort;
    } else {
      this.port = 11438;
    }
    this.host = this.config.server?.shareOnNetwork
      ? "0.0.0.0"
      : this.config.server?.host || "127.0.0.1";

    console.log(
      "[Server] Final this.config:",
      JSON.stringify(this.config, null, 2),
    );
    console.log("[Server] LLM will be loaded on first request");
    console.log("[Server] STT will be proxied to:", this.config.stt.proxyUrl);

    this.startIdleTimeoutChecker();

    console.log("[Server] Initialization complete");
  }

  /**
   * Ensure LLM model is loaded (lazy loading with auto-reload on model change)
   * If model is already loaded and matches config, update last used time
   * If model path changed, unload old model and load new one
   * If model is loading, wait for it to finish
   * If model is not loaded, load it now
   */
  async ensureModelLoaded() {
    console.log(
      "[LLM] ensureModelLoaded() - Current model:",
      this.currentModelPath,
    );
    console.log(
      "[LLM] ensureModelLoaded() - Config model:",
      this.config.llm.modelPath,
    );

    if (!this.config.llm.modelPath) {
      throw new Error("No LLM model configured");
    }

    if (!fs.existsSync(this.config.llm.modelPath)) {
      throw new Error("LLM model file not found");
    }

    // Check if we need to reload due to model change
    if (
      this.llamaChat &&
      this.llamaModel &&
      this.currentModelPath !== this.config.llm.modelPath
    ) {
      console.log(
        "[LLM] Model changed from",
        this.currentModelPath,
        "to",
        this.config.llm.modelPath,
      );
      console.log("[LLM] Unloading old model and loading new one...");
      await this.unloadModel();
    }

    // If already loaded with correct model, just update timestamp and reset idle timer
    if (
      this.llamaChat &&
      this.llamaModel &&
      this.currentModelPath === this.config.llm.modelPath
    ) {
      this.lastUsed = Date.now();
      this.resetIdleTimer();
      return;
    }

    // If currently loading, wait for it to finish
    if (this.isLoadingModel && this.loadPromise) {
      console.log("[LLM] Model is already loading, waiting...");
      await this.loadPromise;
      this.lastUsed = Date.now();
      this.resetIdleTimer();
      return;
    }

    if (!this.config.llm.modelPath) {
      throw new Error("No LLM model configured");
    }

    if (!fs.existsSync(this.config.llm.modelPath)) {
      throw new Error("LLM model file not found");
    }

    this.isLoadingModel = true;
    this.loadPromise = this.loadModel();

    try {
      await this.loadPromise;
      this.lastUsed = Date.now();
      this.resetIdleTimer();
    } finally {
      this.isLoadingModel = false;
      this.loadPromise = null;
    }
  }

  /**
   * Load the LLM model
   */
  async loadModel() {
    try {
      console.log("[LLM] Loading model on-demand...");
      console.log("[LLM]   Model:", this.config.llm.modelPath);
      console.log("[LLM]   Backend:", this.config.llm.backend || "auto");

      const backendToGpu: Record<
        LLMBackend,
        "auto" | "cuda" | "vulkan" | "metal" | false
      > = {
        auto: "auto",
        cpu: false,
        cuda: "cuda",
        vulkan: "vulkan",
        metal: "metal",
        rocm: false,
      };
      const selectedGpu = backendToGpu[this.config.llm.backend] ?? "auto";

      let getLlamaFn = null;
      let LlamaChatClass = null;

      if (!this.loadLlamaApi) {
        throw new Error("Runtime llama API loader is not configured");
      }

      const runtimeApi = (await this.loadLlamaApi()) as LlamaApi;
      getLlamaFn = runtimeApi.getLlama;
      LlamaChatClass = runtimeApi.LlamaChat;

      if (
        typeof getLlamaFn !== "function" ||
        typeof LlamaChatClass !== "function"
      ) {
        throw new Error("node-llama-cpp runtime API unavailable");
      }

      this.llama = await getLlamaFn({
        gpu: selectedGpu,
      });
      const gpuType = this.llama.gpu || "cpu";
      console.log("[LLM]   GPU:", gpuType);

      this.llamaModel = await this.llama.loadModel({
        modelPath: this.config.llm.modelPath ?? "",
        gpuLayers: this.config.llm.gpuLayers,
      });
      console.log("[LLM]   Layers on GPU:", this.llamaModel.gpuLayers);

      this.llamaContext = await this.llamaModel.createContext({
        contextSize: this.config.llm.contextSize,
      });

      this.llamaChat = new LlamaChatClass({
        contextSequence: this.llamaContext.getSequence(),
      });

      this.currentModelPath = this.config.llm.modelPath;

      console.log("[LLM] Model loaded successfully");
    } catch (error) {
      console.error("[LLM] Failed to load model:", error);
      this.llamaChat = null;
      this.llamaContext = null;
      this.llamaModel = null;
      this.llama = null;
      this.currentModelPath = null;
      throw error;
    }
  }

  /**
   * Unload the LLM model to free memory
   */
  async unloadModel() {
    if (!this.llamaModel) {
      return;
    }

    console.log("[LLM] Unloading model...");

    try {
      this.llamaChat = null;

      if (this.llamaContext) {
        await this.llamaContext.dispose();
        this.llamaContext = null;
      }

      if (this.llamaModel) {
        await this.llamaModel.dispose();
        this.llamaModel = null;
      }

      this.llama = null;
      this.lastUsed = null;
      this.currentModelPath = null;

      console.log("[LLM] Model unloaded successfully");
    } catch (error) {
      console.error("[LLM] Error unloading model:", error);
    }
  }

  /**
   * Start the idle timeout checker (runs every minute)
   */
  startIdleTimeoutChecker() {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
    }

    // Check every minute
    this.idleTimer = setInterval(() => {
      if (this.lastUsed && this.llamaModel) {
        const idleTime = Date.now() - this.lastUsed;
        if (idleTime > this.IDLE_TIMEOUT) {
          console.log(
            `[LLM] Model idle for ${Math.round(idleTime / 1000)}s, unloading...`,
          );
          this.unloadModel();
        }
      }
    }, 60000);
  }

  /**
   * Reset the idle timer (called when model is used)
   */
  resetIdleTimer() {
    this.lastUsed = Date.now();
  }

  async start() {
    if (this.server) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const listener = this.app.listen(this.port, this.host);

      listener.once("listening", () => {
        this.server = listener;
        const urls = this._getAccessibleUrls();
        console.log(`[Server] Started on ${urls.join(", ")}`);
        resolve();
      });

      listener.once("error", (error: Error) => {
        this.server = null;
        console.error("[Server] Failed to start:", error);
        reject(error);
      });
    });
  }

  async stop() {
    console.log("[Server] Stopping...");

    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.whisperContext) {
      await this.whisperContext.release();
      this.whisperContext = null;
    }

    if (this.llamaContext) {
      await this.llamaContext.dispose();
      this.llamaContext = null;
    }

    if (this.llamaModel) {
      await this.llamaModel.dispose();
      this.llamaModel = null;
    }

    if (this.server) {
      const activeServer = this.server;
      await new Promise<void>((resolve) => {
        activeServer.close(() => resolve());
      });
      this.server = null;
    }

    console.log("[Server] Stopped");
  }

  getStatus() {
    const gpuType = this.llama?.gpu || "cpu";
    const idleTime = this.lastUsed ? Date.now() - this.lastUsed : null;

    return {
      running: this.server !== null,
      server: {
        host: this.host,
        shareOnNetwork: this.host === "0.0.0.0",
        port: this.port,
        urls: this._getAccessibleUrls(),
      },
      llm: {
        loaded: this.llamaModel !== null,
        loading: this.isLoadingModel,
        model: this.config.llm.modelPath
          ? path.basename(this.config.llm.modelPath)
          : null,
        gpu: gpuType,
        gpuLayers: this.llamaModel?.gpuLayers || 0,
        idleSeconds: idleTime ? Math.round(idleTime / 1000) : null,
      },
      stt: {
        proxyUrl: this.config.stt.proxyUrl,
      },
      tts: {
        proxyUrl: this.config.tts.proxyUrl,
      },
    };
  }

  _getAccessibleUrls() {
    const urls = [];
    if (this.host === "0.0.0.0") {
      urls.push(`http://127.0.0.1:${this.port}`);
      const nets = os.networkInterfaces();
      for (const ifName of Object.keys(nets)) {
        for (const net of nets[ifName] || []) {
          if (net && net.family === "IPv4" && !net.internal) {
            urls.push(`http://${net.address}:${this.port}`);
          }
        }
      }
      return Array.from(new Set(urls));
    }

    if (this.host === "127.0.0.1" || this.host === "localhost") {
      return [`http://127.0.0.1:${this.port}`];
    }

    return [`http://${this.host}:${this.port}`];
  }
}
