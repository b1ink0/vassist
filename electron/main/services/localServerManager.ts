import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type * as fsType from "fs";
import type * as pathType from "path";
import {
  DEFAULT_SERVICE_PORTS,
  DESKTOP_BIND_HOST,
  LOOPBACK_HOST,
  buildHttpEndpoint,
  resolveDesktopInternalPorts,
  validateDesktopServicePorts,
} from "../../../src/config/serviceEndpoints";

type ServerRuntimeConfig = {
  llmEngine?: string;
  llmBackend?: string;
  backend?: string;
  model?: string;
  customModelsPath?: string;
  temperature?: number;
  maxTokens?: number;
  contextSize?: number;
  gpuLayers?: number | "auto";
  shareOnNetwork?: boolean;
  serverPort?: number;
  internalPorts?: Partial<{
    llamaServer: number;
    gptSovits: number;
    fasterWhisper: number;
    supertonic: number;
    whisperCpp: number;
  }>;
  stt?: {
    model?: string;
    language?: string;
    engine?: string;
    variant?: string;
  };
  tts?: {
    enabled?: boolean;
    engine?: string;
    pytorchBackend?: string;
  };
};

type LocalAIServerLike = {
  config: {
    llm: {
      llmServerBackend?: string;
      modelPath: string | null;
      defaultModelsDir?: string | null;
      backend?: string;
      engine?: string;
      temperature?: number;
      maxTokens?: number;
      contextSize?: number;
      gpuLayers?: number | "auto";
      llamaServerUrl?: string;
    };
    stt: {
      modelPath?: string | null;
      proxyUrl?: string;
      whisperCppUrl?: string;
      model?: string;
      language?: string;
      engine?: "python" | "whispercpp";
      variant?: string;
    };
    tts: {
      proxyUrl?: string;
      supertonicUrl?: string;
      enabled?: boolean;
      engine?: string;
    };
    server: {
      shareOnNetwork?: boolean;
      host?: string;
      port?: number;
      llamaServerUrl?: string;
      supertonicUrl?: string;
    };
  };
  host: string;
  port: number;
  initialize: (config: Record<string, unknown>) => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getStatus: () => { running: boolean } & Record<string, unknown>;
};

type LocalServerManagerDeps = {
  LocalAIServer: new (deps: {
    loadLlamaApi?: () => Promise<unknown>;
    ensureTTSBackendRunning?: (() => void | Promise<void>) | null;
    restartTTSBackend?: ((reason: string) => void | Promise<void>) | null;
    ensureSupertonicRunning?: (() => void | Promise<void>) | null;
    restartSupertonicBackend?:
      | ((reason: string) => void | Promise<void>)
      | null;
    ensureWhisperCppRunning?: ((variant?: string) => Promise<void>) | null;
    restartWhisperCppBackend?:
      | ((reason: string) => void | Promise<void>)
      | null;
    onTTSRequestStart?: (() => void) | null;
    onTTSRequestComplete?: (() => void) | null;
  }) => LocalAIServerLike;
  path: typeof pathType;
  fs: typeof fsType;
  baseDir: string;
  getModelsDir: (customPath?: string | null) => string;
  loadLlamaApi?: () => Promise<unknown>;
  ensureTTSBackendRunning?: (() => void | Promise<void>) | null;
  restartTTSBackend?: ((reason: string) => void | Promise<void>) | null;
  onTTSRequestStart?: (() => void) | null;
  onTTSRequestComplete?: (() => void) | null;
  stopTTSBackend?: (() => void) | null;
  setTTSBackend?: ((backend: string | undefined | null) => void) | null;
  setLlamaServerPort?: ((port: number) => Promise<void>) | null;
  setPythonServicePorts?:
    | ((ports: {
        gptSovits: number;
        fasterWhisper: number;
        supertonic: number;
      }) => Promise<void>)
    | null;
  setWhisperCppPort?: ((port: number) => Promise<void>) | null;
  llamaProxy?: {
    ensureForRequest: (req: {
      modelPath: string;
      mmprojPath?: string;
      ctxSize?: number;
      backend?: string;
    }) => Promise<string>;
    markRequestComplete: () => void;
    getEndpoint?: () => string;
  } | null;
  ensureSupertonicRunning?: (() => void | Promise<void>) | null;
  restartSupertonicBackend?: ((reason: string) => void | Promise<void>) | null;
  ensureWhisperCppRunning?: (() => void | Promise<void>) | null;
  restartWhisperCppBackend?: ((reason: string) => void | Promise<void>) | null;
  ensureSttBackendRunning?: (() => void | Promise<void>) | null;
  onSTTRequestStart?: (() => void) | null;
  onSTTRequestComplete?: (() => void) | null;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function createLocalServerManager({
  LocalAIServer,
  path,
  fs,
  baseDir,
  getModelsDir,
  loadLlamaApi,
  ensureTTSBackendRunning,
  restartTTSBackend,
  onTTSRequestStart,
  onTTSRequestComplete,
  stopTTSBackend,
  setTTSBackend,
  setLlamaServerPort,
  setPythonServicePorts,
  setWhisperCppPort,
  llamaProxy,
  ensureSupertonicRunning,
  restartSupertonicBackend,
  ensureWhisperCppRunning,
  restartWhisperCppBackend,
  ensureSttBackendRunning,
  onSTTRequestStart,
  onSTTRequestComplete,
}: LocalServerManagerDeps) {
  let server: LocalAIServerLike | null = null;
  let restartPromise: Promise<void> | null = null;
  let lastServerError: string | null = null;

  function registerIPCHandlers(ipcMain: IpcMain) {
    ipcMain.handle(
      "server:start",
      async (_event: IpcMainInvokeEvent, config: ServerRuntimeConfig = {}) => {
        console.log("[Server] Starting with config:", config);

        if (!server) {
          try {
            const serverDeps: {
              loadLlamaApi?: () => Promise<unknown>;
              ensureTTSBackendRunning?: (() => void | Promise<void>) | null;
              restartTTSBackend?:
                | ((reason: string) => void | Promise<void>)
                | null;
              ensureSupertonicRunning?: (() => void | Promise<void>) | null;
              restartSupertonicBackend?:
                | ((reason: string) => void | Promise<void>)
                | null;
              ensureWhisperCppRunning?:
                | ((variant?: string) => Promise<void>)
                | null;
              restartWhisperCppBackend?:
                | ((reason: string) => void | Promise<void>)
                | null;
              ensureSttBackendRunning?: (() => void | Promise<void>) | null;
              onSTTRequestStart?: (() => void) | null;
              onSTTRequestComplete?: (() => void) | null;
              onTTSRequestStart?: (() => void) | null;
              onTTSRequestComplete?: (() => void) | null;
              llamaProxy?: {
                ensureForRequest: (req: {
                  modelPath: string;
                  mmprojPath?: string;
                  ctxSize?: number;
                  backend?: string;
                }) => Promise<string>;
                markRequestComplete: () => void;
                getEndpoint?: () => string;
              } | null;
            } = {};
            if (llamaProxy !== undefined) {
              serverDeps.llamaProxy = llamaProxy;
            }
            if (ensureSttBackendRunning !== undefined) {
              serverDeps.ensureSttBackendRunning = ensureSttBackendRunning;
            }
            if (onSTTRequestStart !== undefined) {
              serverDeps.onSTTRequestStart = onSTTRequestStart;
            }
            if (onSTTRequestComplete !== undefined) {
              serverDeps.onSTTRequestComplete = onSTTRequestComplete;
            }
            if (ensureSupertonicRunning !== undefined) {
              serverDeps.ensureSupertonicRunning = ensureSupertonicRunning;
            }
            if (restartSupertonicBackend !== undefined) {
              serverDeps.restartSupertonicBackend = restartSupertonicBackend;
            }
            if (ensureWhisperCppRunning !== undefined) {
              serverDeps.ensureWhisperCppRunning = ensureWhisperCppRunning as
                | ((variant?: string) => Promise<void>)
                | null;
            }
            if (restartWhisperCppBackend !== undefined) {
              serverDeps.restartWhisperCppBackend = restartWhisperCppBackend;
            }
            if (loadLlamaApi) {
              serverDeps.loadLlamaApi = loadLlamaApi;
            }
            if (ensureTTSBackendRunning !== undefined) {
              serverDeps.ensureTTSBackendRunning = ensureTTSBackendRunning;
            }
            if (restartTTSBackend !== undefined) {
              serverDeps.restartTTSBackend = restartTTSBackend;
            }
            if (onTTSRequestStart !== undefined) {
              serverDeps.onTTSRequestStart = onTTSRequestStart;
            }
            if (onTTSRequestComplete !== undefined) {
              serverDeps.onTTSRequestComplete = onTTSRequestComplete;
            }
            server = new LocalAIServer(serverDeps);
          } catch (error) {
            console.error("[Server] Failed to create server:", error);
            return { success: false, error: getErrorMessage(error) };
          }
        }

        const desktopTtsEnabled = Boolean(config.tts?.enabled);
        if (typeof setTTSBackend === "function") {
          setTTSBackend(config.tts?.pytorchBackend);
        }
        if (!desktopTtsEnabled && typeof stopTTSBackend === "function") {
          try {
            stopTTSBackend();
          } catch (error) {
            console.warn(
              "[Server] Failed to stop GPT-SoVITS backend while TTS is disabled:",
              error,
            );
          }
        }

        const shareOnNetwork = Boolean(config.shareOnNetwork);
        const desiredHost = shareOnNetwork ? DESKTOP_BIND_HOST : LOOPBACK_HOST;
        const desiredPort =
          config.serverPort === undefined
            ? DEFAULT_SERVICE_PORTS.server
            : Number(config.serverPort);
        const internalPorts = resolveDesktopInternalPorts(config.internalPorts);
        const portErrors = validateDesktopServicePorts(
          desiredPort,
          config.internalPorts,
        );
        if (portErrors.length > 0) {
          lastServerError = portErrors.join("; ");
          return { success: false, error: lastServerError };
        }
        try {
          await setLlamaServerPort?.(internalPorts.llamaServer);
          await setPythonServicePorts?.({
            gptSovits: internalPorts.gptSovits,
            fasterWhisper: internalPorts.fasterWhisper,
            supertonic: internalPorts.supertonic,
          });
          await setWhisperCppPort?.(internalPorts.whisperCpp);
        } catch (error) {
          lastServerError = getErrorMessage(error);
          return { success: false, error: lastServerError };
        }

        const serverConfig: {
          llm: LocalAIServerLike["config"]["llm"];
          stt: LocalAIServerLike["config"]["stt"];
          tts: LocalAIServerLike["config"]["tts"];
          server: LocalAIServerLike["config"]["server"];
        } = {
          llm: {
            modelPath: null,
            defaultModelsDir: getModelsDir(),
            backend: config.backend || "auto",
            engine:
              config.llmEngine === "llama-server"
                ? "llama-server"
                : "node-llama",
            llmServerBackend: config.llmBackend || "auto",
            temperature: config.temperature || 0.7,
            maxTokens: config.maxTokens || 2048,
            contextSize: config.contextSize || 4096,
            gpuLayers:
              config.gpuLayers === 99 ? "auto" : config.gpuLayers || "auto",
            llamaServerUrl: buildHttpEndpoint(
              LOOPBACK_HOST,
              internalPorts.llamaServer,
            ),
          },
          stt: {
            modelPath: null,
            proxyUrl: buildHttpEndpoint(
              LOOPBACK_HOST,
              internalPorts.fasterWhisper,
            ),
            whisperCppUrl: buildHttpEndpoint(
              LOOPBACK_HOST,
              internalPorts.whisperCpp,
            ),
            model: config.stt?.model || "tiny",
            language: config.stt?.language || "auto",
            engine:
              config.stt?.engine === "whispercpp" ? "whispercpp" : "python",
            ...(config.stt?.variant ? { variant: config.stt.variant } : {}),
          },
          tts: {
            proxyUrl: buildHttpEndpoint(LOOPBACK_HOST, internalPorts.gptSovits),
            supertonicUrl: buildHttpEndpoint(
              LOOPBACK_HOST,
              internalPorts.supertonic,
            ),
            enabled: desktopTtsEnabled,
            engine:
              config.tts?.engine === "supertonic" ? "supertonic" : "gpt-sovits",
          },
          server: {
            shareOnNetwork,
            host: desiredHost,
            port: desiredPort,
          },
        };

        if (config.model) {
          const modelsDir = getModelsDir(config.customModelsPath);
          const llmPath = path.join(modelsDir, config.model);
          if (fs.existsSync(llmPath)) {
            serverConfig.llm.modelPath = llmPath;
            console.log("[Server] LLM model:", config.model);
          } else {
            console.warn("[Server] Model not found:", config.model);
            const requestedBaseName =
              String(config.model).toLowerCase().split(":")[0] || "";
            const availableModels = fs
              .readdirSync(modelsDir)
              .filter(
                (entry) =>
                  entry.toLowerCase().endsWith(".gguf") &&
                  !entry.toLowerCase().startsWith("mmproj-"),
              )
              .sort((left, right) => left.localeCompare(right));
            const fallbackModel =
              availableModels.find((entry) =>
                entry.toLowerCase().includes(requestedBaseName),
              ) || availableModels[0];
            if (fallbackModel) {
              serverConfig.llm.modelPath = path.join(modelsDir, fallbackModel);
              console.log(
                "[Server] Falling back to available model:",
                fallbackModel,
              );
            }
          }
        }

        if (server.getStatus().running) {
          console.log("[Server] Already running, updating config");
          console.log(
            "[Server] Old LLM model path:",
            server.config.llm.modelPath,
          );
          console.log(
            "[Server] New LLM model path:",
            serverConfig.llm.modelPath,
          );

          Object.assign(server.config.llm, serverConfig.llm);
          Object.assign(server.config.stt, serverConfig.stt);
          Object.assign(server.config.tts, serverConfig.tts);
          Object.assign(server.config.server, serverConfig.server);
          const previousHost = server.host;
          const previousPort = server.port;
          const hostChanged = previousHost !== desiredHost;
          const portChanged = previousPort !== desiredPort;
          server.host = desiredHost;
          server.port = desiredPort;

          if (hostChanged || portChanged) {
            console.log(
              `[Server] Binding changed from ${previousHost}:${previousPort} to ${desiredHost}:${desiredPort}, restarting listener...`,
            );
            await server.stop();
            await server.start();
          }

          console.log(
            "[Server] Updated LLM model path:",
            server.config.llm.modelPath,
          );
          console.log("[Server] Config updated successfully");
          lastServerError = null;
          return { success: true, ...server.getStatus() };
        }

        try {
          const whisperModelName = "ggml-base.en.bin";
          const devSttPath = path.join(
            baseDir,
            "server",
            "models",
            "whisper",
            whisperModelName,
          );
          const prodSttPath = path.join(
            baseDir,
            "server",
            "models",
            "whisper",
            whisperModelName,
          );
          const sttPath = process.env.VITE_DEV_SERVER_URL
            ? devSttPath
            : prodSttPath;

          console.log("[Server] Checking STT model at:", sttPath);
          if (fs.existsSync(sttPath)) {
            serverConfig.stt.modelPath = sttPath;
            console.log("[Server] STT model found:", whisperModelName);
          } else {
            console.warn("[Server] STT model not found at:", sttPath);
          }

          console.log(
            "[Server] Final serverConfig:",
            JSON.stringify(serverConfig, null, 2),
          );

          await server.initialize(serverConfig);
          server.host = desiredHost;
          server.port = desiredPort;
          await server.start();

          const status = server.getStatus();
          console.log("[Server] Started:", status);
          lastServerError = null;
          return { success: true, ...status };
        } catch (error) {
          console.error("[Server] Start error:", error);
          lastServerError = getErrorMessage(error);
          return { success: false, error: getErrorMessage(error) };
        }
      },
    );

    ipcMain.handle("server:stop", async () => {
      console.log("[Server] Stopping...");

      if (!server) {
        return { success: false, error: "Not initialized" };
      }

      try {
        await server.stop();
        console.log("[Server] Stopped");
        lastServerError = null;
        return { success: true };
      } catch (error) {
        console.error("[Server] Stop error:", error);
        lastServerError = getErrorMessage(error);
        return { success: false, error: getErrorMessage(error) };
      }
    });

    ipcMain.handle("server:status", async () => {
      if (!server) {
        return { running: false, error: lastServerError };
      }

      try {
        return { ...server.getStatus(), error: lastServerError };
      } catch (error) {
        console.error("[Server] Status error:", error);
        lastServerError = getErrorMessage(error);
        return { running: false, error: getErrorMessage(error) };
      }
    });
  }

  function autoStart() {
    setTimeout(async () => {
      try {
        if (!server) {
          const serverDeps: {
            loadLlamaApi?: () => Promise<unknown>;
            ensureTTSBackendRunning?: (() => void | Promise<void>) | null;
            restartTTSBackend?:
              | ((reason: string) => void | Promise<void>)
              | null;
            onTTSRequestStart?: (() => void) | null;
            onTTSRequestComplete?: (() => void) | null;
          } = {};
          if (loadLlamaApi) {
            serverDeps.loadLlamaApi = loadLlamaApi;
          }
          if (ensureTTSBackendRunning !== undefined) {
            serverDeps.ensureTTSBackendRunning = ensureTTSBackendRunning;
          }
          if (restartTTSBackend !== undefined) {
            serverDeps.restartTTSBackend = restartTTSBackend;
          }
          if (onTTSRequestStart !== undefined) {
            serverDeps.onTTSRequestStart = onTTSRequestStart;
          }
          if (onTTSRequestComplete !== undefined) {
            serverDeps.onTTSRequestComplete = onTTSRequestComplete;
          }
          server = new LocalAIServer(serverDeps);
        }

        if (server.getStatus().running) {
          console.log("[Server] Auto-start skipped: already running");
          return;
        }

        const serverConfig = {
          llm: {
            modelPath: null,
            temperature: 0.7,
            maxTokens: 2048,
            contextSize: 4096,
            gpuLayers: "auto",
          },
          stt: {
            proxyUrl: buildHttpEndpoint(
              LOOPBACK_HOST,
              DEFAULT_SERVICE_PORTS.fasterWhisper,
            ),
          },
          tts: {
            proxyUrl: buildHttpEndpoint(
              LOOPBACK_HOST,
              DEFAULT_SERVICE_PORTS.gptSovits,
            ),
          },
        };

        console.log(
          "[Server] Initializing with config:",
          JSON.stringify(serverConfig, null, 2),
        );

        await server.initialize(serverConfig);
        await server.start();
        console.log(
          `[Server] HTTP proxy server started on port ${server.port}`,
        );
      } catch (error) {
        console.error("[Server] Failed to auto-start:", getErrorMessage(error));
      }
    }, 2000);
  }

  async function restartIfRunning() {
    if (restartPromise) {
      return restartPromise;
    }

    if (!server || !server.getStatus().running) {
      return;
    }

    console.log("[Server] Restarting HTTP server...");

    restartPromise = (async () => {
      try {
        await server.stop();

        if (server.getStatus().running) {
          console.log(
            "[Server] Restart skipped: server already running after stop",
          );
          return;
        }

        await server.start();
        console.log("[Server] Restart complete");
      } catch (err) {
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code?: string }).code === "EADDRINUSE"
        ) {
          console.warn(
            `[Server] Restart skipped: port ${server.port} already in use`,
          );
          return;
        }
        console.error("[Server] Restart error:", err);
      } finally {
        restartPromise = null;
      }
    })();

    return restartPromise;
  }

  function stopIfRunning() {
    if (!server) {
      return;
    }

    try {
      console.log("[Server] Stopping AI server...");
      server.stop();
    } catch (error) {
      console.error("[Server] Stop error:", error);
    }
  }

  return {
    registerIPCHandlers,
    autoStart,
    restartIfRunning,
    stopIfRunning,
  };
}
