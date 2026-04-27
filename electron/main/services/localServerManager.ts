export function createLocalServerManager({
  LocalAIServer,
  path,
  fs,
  baseDir,
  getModelsDir,
  loadLlamaApi,
  ensureTTSBackendRunning,
  stopTTSBackend,
}) {
  let server = null;
  let restartPromise = null;
  let lastServerError = null;

  function registerIPCHandlers(ipcMain) {
    ipcMain.handle('server:start', async (event, config = {}) => {
      console.log('[Server] Starting with config:', config);

      if (!server) {
        try {
          server = new LocalAIServer({ loadLlamaApi, ensureTTSBackendRunning });
        } catch (error) {
          console.error('[Server] Failed to create server:', error);
          return { success: false, error: error.message };
        }
      }

      const desktopTtsEnabled = Boolean(config.tts?.enabled);
      if (!desktopTtsEnabled && typeof stopTTSBackend === 'function') {
        try {
          stopTTSBackend();
        } catch (error) {
          console.warn('[Server] Failed to stop GPT-SoVITS backend while TTS is disabled:', error);
        }
      }

      const shareOnNetwork = Boolean(config.shareOnNetwork);
      const desiredHost = shareOnNetwork ? '0.0.0.0' : '127.0.0.1';
      const parsedPort = Number(config.serverPort);
      const desiredPort = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 11438;

      const serverConfig = {
        llm: {
          modelPath: null,
          defaultModelsDir: getModelsDir(),
          backend: config.backend || 'auto',
          temperature: config.temperature || 0.7,
          maxTokens: config.maxTokens || 2048,
          contextSize: config.contextSize || 4096,
          gpuLayers: config.gpuLayers === 99 ? 'auto' : config.gpuLayers || 'auto'
        },
        stt: {
          modelPath: null,
          proxyUrl: 'http://127.0.0.1:9881',
          model: config.stt?.model || 'tiny',
          language: config.stt?.language || 'auto',
        },
        tts: {
          proxyUrl: 'http://127.0.0.1:9880',
          enabled: desktopTtsEnabled,
        },
        server: {
          shareOnNetwork,
          host: desiredHost,
          port: desiredPort,
        }
      };

      if (config.model) {
        const llmPath = path.join(getModelsDir(config.customModelsPath), config.model);
        if (fs.existsSync(llmPath)) {
          serverConfig.llm.modelPath = llmPath;
          console.log('[Server] LLM model:', config.model);
        } else {
          console.warn('[Server] Model not found:', config.model);
        }
      }

      if (server.getStatus().running) {
        console.log('[Server] Already running, updating config');
        console.log('[Server] Old LLM model path:', server.config.llm.modelPath);
        console.log('[Server] New LLM model path:', serverConfig.llm.modelPath);

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
          console.log(`[Server] Binding changed from ${previousHost}:${previousPort} to ${desiredHost}:${desiredPort}, restarting listener...`);
          await server.stop();
          await server.start();
        }

        console.log('[Server] Updated LLM model path:', server.config.llm.modelPath);
        console.log('[Server] Config updated successfully');
        lastServerError = null;
        return { success: true, ...server.getStatus() };
      }

      try {
        const whisperModelName = 'ggml-base.en.bin';
        const devSttPath = path.join(baseDir, 'server', 'models', 'whisper', whisperModelName);
        const prodSttPath = path.join(baseDir, 'server', 'models', 'whisper', whisperModelName);
        const sttPath = process.env.VITE_DEV_SERVER_URL ? devSttPath : prodSttPath;

        console.log('[Server] Checking STT model at:', sttPath);
        if (fs.existsSync(sttPath)) {
          serverConfig.stt.modelPath = sttPath;
          console.log('[Server] STT model found:', whisperModelName);
        } else {
          console.warn('[Server] STT model not found at:', sttPath);
        }

        console.log('[Server] Final serverConfig:', JSON.stringify(serverConfig, null, 2));

        await server.initialize(serverConfig);
        server.host = desiredHost;
        server.port = desiredPort;
        await server.start();

        const status = server.getStatus();
        console.log('[Server] Started:', status);
        lastServerError = null;
        return { success: true, ...status };
      } catch (error) {
        console.error('[Server] Start error:', error);
        lastServerError = error.message;
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('server:stop', async () => {
      console.log('[Server] Stopping...');

      if (!server) {
        return { success: false, error: 'Not initialized' };
      }

      try {
        await server.stop();
        console.log('[Server] Stopped');
        lastServerError = null;
        return { success: true };
      } catch (error) {
        console.error('[Server] Stop error:', error);
        lastServerError = error.message;
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('server:status', async () => {
      if (!server) {
        return { running: false, error: lastServerError };
      }

      try {
        return { ...server.getStatus(), error: lastServerError };
      } catch (error) {
        console.error('[Server] Status error:', error);
        lastServerError = error.message;
        return { running: false, error: error.message };
      }
    });
  }

  function autoStart() {
    setTimeout(async () => {
      try {
        if (!server) {
          server = new LocalAIServer({ loadLlamaApi, ensureTTSBackendRunning });
        }

        if (server.getStatus().running) {
          console.log('[Server] Auto-start skipped: already running');
          return;
        }

        const serverConfig = {
          llm: {
            modelPath: null,
            temperature: 0.7,
            maxTokens: 2048,
            contextSize: 4096,
            gpuLayers: 'auto'
          },
          stt: {
            proxyUrl: 'http://127.0.0.1:9881'
          },
          tts: {
            proxyUrl: 'http://127.0.0.1:9880'
          }
        };

        console.log('[Server] Initializing with config:', JSON.stringify(serverConfig, null, 2));

        await server.initialize(serverConfig);
        await server.start();
        console.log('[Server] HTTP proxy server started on port 11438');
      } catch (error) {
        console.error('[Server] Failed to auto-start:', error.message);
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

    console.log('[Server] Restarting HTTP server...');

    restartPromise = (async () => {
      try {
        await server.stop();

        if (server.getStatus().running) {
          console.log('[Server] Restart skipped: server already running after stop');
          return;
        }

        await server.start();
        console.log('[Server] Restart complete');
      } catch (err) {
        if (err?.code === 'EADDRINUSE') {
          console.warn('[Server] Restart skipped: port 11438 already in use');
          return;
        }
        console.error('[Server] Restart error:', err);
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
      console.log('[Server] Stopping AI server...');
      server.stop();
    } catch (error) {
      console.error('[Server] Stop error:', error);
    }
  }

  return {
    registerIPCHandlers,
    autoStart,
    restartIfRunning,
    stopIfRunning,
  };
}
