export function createLocalServerManager({ LocalAIServer, path, fs, baseDir, getModelsDir }) {
  let server = null;

  function registerIPCHandlers(ipcMain) {
    ipcMain.handle('server:start', async (event, config = {}) => {
      console.log('[Server] Starting with config:', config);

      if (!server) {
        try {
          server = new LocalAIServer();
        } catch (error) {
          console.error('[Server] Failed to create server:', error);
          return { success: false, error: error.message };
        }
      }

      const serverConfig = {
        llm: {
          modelPath: null,
          defaultModelsDir: getModelsDir(),
          temperature: config.temperature || 0.7,
          maxTokens: config.maxTokens || 2048,
          contextSize: config.contextSize || 4096,
          gpuLayers: config.gpuLayers === 99 ? 'auto' : config.gpuLayers || 'auto'
        },
        stt: {
          modelPath: null,
          language: 'en'
        },
        tts: {
          proxyUrl: 'http://127.0.0.1:9880'
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

        console.log('[Server] Updated LLM model path:', server.config.llm.modelPath);
        console.log('[Server] Config updated successfully');
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
        await server.start();

        const status = server.getStatus();
        console.log('[Server] Started:', status);
        return { success: true, ...status };
      } catch (error) {
        console.error('[Server] Start error:', error);
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
        return { success: true };
      } catch (error) {
        console.error('[Server] Stop error:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('server:status', async () => {
      if (!server) {
        return { running: false };
      }

      try {
        return server.getStatus();
      } catch (error) {
        console.error('[Server] Status error:', error);
        return { running: false, error: error.message };
      }
    });
  }

  function autoStart() {
    setTimeout(async () => {
      try {
        if (!server) {
          server = new LocalAIServer();
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
    if (!server || !server.getStatus().running) {
      return;
    }

    console.log('[Server] Restarting HTTP server...');
    try {
      await server.stop();
      setTimeout(() => {
        server.start().catch((error) => console.error('[Server] Restart error:', error));
      }, 1000);
    } catch (err) {
      console.error('[Server] Restart error:', err);
    }
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
