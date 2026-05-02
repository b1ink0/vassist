import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'child_process';
import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import type * as fsType from 'fs';
import type * as pathType from 'path';
import GPTSoVITSSetupRunner from '../../server/gpt-sovits/setup-runner';
import WhisperSetupRunnerClass from '../../server/whisper-stt/setup-runner';

type SetupLog = Record<string, unknown>;

type SetupRunnerLike = {
  run: (onLog: (log: SetupLog) => void, options?: Record<string, unknown>) => Promise<void>;
  cancel: () => void;
  getStatus: () => Record<string, unknown>;
};

type LocalServerManagerLike = {
  restartIfRunning: () => Promise<void>;
  stopIfRunning: () => void;
};

type PythonServerManagerDeps = {
  fs: typeof fsType;
  path: typeof pathType;
  spawn: (command: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
  processEnv: NodeJS.ProcessEnv;
  ensureRuntimeServerScripts: () => void;
  getRuntimeServerBasePath: () => string;
  getGPTSoVITSDataDir: () => string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function createPythonServerManager({
  fs,
  path,
  spawn,
  processEnv,
  ensureRuntimeServerScripts,
  getRuntimeServerBasePath,
  getGPTSoVITSDataDir,
}: PythonServerManagerDeps) {
  let gptsovitsProcess: ChildProcessWithoutNullStreams | null = null;
  let whisperProcess: ChildProcessWithoutNullStreams | null = null;
  let setupRunner: SetupRunnerLike | null = null;
  let whisperSetupRunner: SetupRunnerLike | null = null;

  function resolveEmbeddedPythonExecutable(gptsovitsDataDir: string): string {
    const candidates = process.platform === 'win32'
      ? [
          path.join(gptsovitsDataDir, 'python312', 'python.exe'),
          path.join(gptsovitsDataDir, 'python', 'python.exe'),
        ]
      : [
          path.join(gptsovitsDataDir, 'python', 'bin', 'python3'),
          path.join(gptsovitsDataDir, 'python', 'bin', 'python'),
        ];

    return candidates.find((candidate) => fs.existsSync(candidate)) || path.join(gptsovitsDataDir, process.platform === 'win32' ? 'python.exe' : 'python3');
  }

  function startGPTSoVITSServer() {
    if (gptsovitsProcess) {
      console.log('[GPT-SoVITS] Server already running');
      return;
    }

    try {
      ensureRuntimeServerScripts();

      const gptsovitsDataDir = getGPTSoVITSDataDir();
      fs.mkdirSync(gptsovitsDataDir, { recursive: true });

      const pythonExe = resolveEmbeddedPythonExecutable(gptsovitsDataDir);
      const apiScript = path.join(gptsovitsDataDir, 'api.py');

      if (!fs.existsSync(pythonExe)) {
        console.error('[GPT-SoVITS] Embedded Python not found. Run setup.py first.');
        console.log('[GPT-SoVITS] Expected one of:');
        if (process.platform === 'win32') {
          console.log(`[GPT-SoVITS]   ${path.join(gptsovitsDataDir, 'python', 'python.exe')}`);
        } else {
          console.log(`[GPT-SoVITS]   ${path.join(gptsovitsDataDir, 'python', 'bin', 'python3')}`);
          console.log(`[GPT-SoVITS]   ${path.join(gptsovitsDataDir, 'python', 'bin', 'python')}`);
        }
        return;
      }

      console.log('[GPT-SoVITS] Starting TTS server...');
      console.log('[GPT-SoVITS] Python:', pythonExe);
      console.log('[GPT-SoVITS] Script:', apiScript);

      gptsovitsProcess = spawn(pythonExe, [apiScript], {
        cwd: gptsovitsDataDir,
        env: {
          ...processEnv,
          GPTSOVITS_PORT: '9880',
          PYTHONUNBUFFERED: '1',
          GPTSOVITS_DATA_DIR: gptsovitsDataDir,
          WHISPER_MODEL_DIR: path.join(getRuntimeServerBasePath(), 'models', 'whisper'),
          // ROCm ships libiomp5md.dll; faster-whisper ships libomp140. Allow both to coexist.
          KMP_DUPLICATE_LIB_OK: 'TRUE',
        }
      });

      gptsovitsProcess.stdout.on('data', (data: Buffer) => {
        console.log(`[GPT-SoVITS] ${data.toString().trim()}`);
      });

      gptsovitsProcess.stderr.on('data', (data: Buffer) => {
        console.error(`[GPT-SoVITS] ${data.toString().trim()}`);
      });

      gptsovitsProcess.on('error', (error: Error) => {
        console.error('[GPT-SoVITS] Failed to start:', error);
        gptsovitsProcess = null;
      });

      gptsovitsProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        console.log(`[GPT-SoVITS] Process exited with code ${code}, signal ${signal}`);
        gptsovitsProcess = null;
      });

      console.log('[GPT-SoVITS] Server started on http://127.0.0.1:9880');
    } catch (error) {
      console.error('[GPT-SoVITS] Start error:', error);
    }
  }

  function stopGPTSoVITSServer() {
    if (gptsovitsProcess) {
      console.log('[GPT-SoVITS] Stopping server...');
      gptsovitsProcess.kill('SIGTERM');
      gptsovitsProcess = null;
    }
  }

  function startWhisperServer() {
    if (whisperProcess) {
      console.log('[Whisper] Server already running');
      return;
    }

    try {
      ensureRuntimeServerScripts();

      const gptsovitsDataDir = getGPTSoVITSDataDir();
      const whisperModelsDir = path.join(getRuntimeServerBasePath(), 'models', 'whisper');
      fs.mkdirSync(gptsovitsDataDir, { recursive: true });
      fs.mkdirSync(whisperModelsDir, { recursive: true });

      const whisperDir = path.join(getRuntimeServerBasePath(), 'whisper-stt');
      const pythonExe = resolveEmbeddedPythonExecutable(gptsovitsDataDir);
      const serverScript = path.join(whisperDir, 'server.py');

      if (!fs.existsSync(pythonExe)) {
        console.error('[Whisper] Embedded Python not found. Run setup.py first.');
        return;
      }

      if (!fs.existsSync(serverScript)) {
        console.error('[Whisper] Server script not found:', serverScript);
        return;
      }

      console.log('[Whisper] Starting STT server...');
      console.log('[Whisper] Python:', pythonExe);
      console.log('[Whisper] Script:', serverScript);

      whisperProcess = spawn(pythonExe, [serverScript], {
        cwd: whisperDir,
        env: {
          ...processEnv,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          WHISPER_MODEL_DIR: whisperModelsDir,
          // ROCm ships libiomp5md.dll; faster-whisper ships libomp140. Allow both to coexist.
          KMP_DUPLICATE_LIB_OK: 'TRUE',
        }
      });

      whisperProcess.stdout.on('data', (data: Buffer) => {
        console.log(`[Whisper] ${data.toString().trim()}`);
      });

      whisperProcess.stderr.on('data', (data: Buffer) => {
        console.error(`[Whisper] ${data.toString().trim()}`);
      });

      whisperProcess.on('error', (error: Error) => {
        console.error('[Whisper] Failed to start:', error);
        whisperProcess = null;
      });

      whisperProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        console.log(`[Whisper] Process exited with code ${code}, signal ${signal}`);
        whisperProcess = null;
      });

      console.log('[Whisper] Server started on http://127.0.0.1:9881');
    } catch (error) {
      console.error('[Whisper] Start error:', error);
    }
  }

  function stopWhisperServer() {
    if (whisperProcess) {
      console.log('[Whisper] Stopping server...');
      whisperProcess.kill('SIGTERM');
      whisperProcess = null;
    }
  }

  function registerSetupIPCHandlers(ipcMain: IpcMain, localServerManager: LocalServerManagerLike) {
    ipcMain.handle('gptsovits:setup:start', async (event: IpcMainInvokeEvent, options: Record<string, unknown> = {}) => {
      ensureRuntimeServerScripts();

      const gptSovitsDataDir = getGPTSoVITSDataDir();
      fs.mkdirSync(gptSovitsDataDir, { recursive: true });
      const whisperSetupDir = path.join(getRuntimeServerBasePath(), 'whisper-stt');
      fs.mkdirSync(whisperSetupDir, { recursive: true });
      process.env.GPTSOVITS_DATA_DIR = gptSovitsDataDir;
      process.env.WHISPER_SETUP_DIR = whisperSetupDir;

      if (setupRunner) {
        throw new Error('Setup already running');
      }

      const selectedBackend = String(options.torchBackend ?? 'auto').trim().toLowerCase();

      console.log('[GPT-SoVITS] Starting setup...');
      console.log('[GPT-SoVITS] Selected PyTorch backend:', selectedBackend);
      setupRunner = new GPTSoVITSSetupRunner();

      setupRunner.run((log: SetupLog) => {
        event.sender.send('gptsovits:setup:log', log);
      }, { torchBackend: selectedBackend }).then(async () => {
        console.log('[GPT-SoVITS] Setup complete');
        event.sender.send('gptsovits:setup:complete', { success: true });
        setupRunner = null;

        console.log('[GPT-SoVITS] Restarting servers...');
        stopGPTSoVITSServer();
        stopWhisperServer();

        setTimeout(async () => {
          startWhisperServer();
          await localServerManager.restartIfRunning();
        }, 2000);
      }).catch((error: unknown) => {
        console.error('[GPT-SoVITS] Setup failed:', error);
        event.sender.send('gptsovits:setup:complete', {
          success: false,
          error: getErrorMessage(error)
        });
        setupRunner = null;
      });

      return { started: true };
    });

    ipcMain.handle('gptsovits:setup:cancel', async () => {
      if (setupRunner) {
        console.log('[GPT-SoVITS] Cancelling setup...');
        setupRunner.cancel();
        setupRunner = null;
        return { cancelled: true };
      }
      return { cancelled: false, message: 'No setup running' };
    });

    ipcMain.handle('gptsovits:setup:status', async () => {
      ensureRuntimeServerScripts();

      const gptSovitsDataDir = getGPTSoVITSDataDir();
      fs.mkdirSync(gptSovitsDataDir, { recursive: true });
      const whisperSetupDir = path.join(getRuntimeServerBasePath(), 'whisper-stt');
      fs.mkdirSync(whisperSetupDir, { recursive: true });
      process.env.GPTSOVITS_DATA_DIR = gptSovitsDataDir;
      process.env.WHISPER_SETUP_DIR = whisperSetupDir;
      const runner = new GPTSoVITSSetupRunner();

      try {
        const status = runner.getStatus();
        console.log('[GPT-SoVITS] Setup status:', status);
        return status;
      } catch (error) {
        console.error('[GPT-SoVITS] Status check error:', error);
        return {
          isSetup: false,
          pythonExists: false,
          modelsExist: false,
          gptsovitsExists: false,
          error: getErrorMessage(error)
        };
      }
    });

    ipcMain.handle('whisper:setup:start', async (event: IpcMainInvokeEvent, options: Record<string, unknown> = {}) => {
      ensureRuntimeServerScripts();

      const gptSovitsDataDir = getGPTSoVITSDataDir();
      const whisperSetupDir = path.join(getRuntimeServerBasePath(), 'whisper-stt');
      fs.mkdirSync(gptSovitsDataDir, { recursive: true });
      fs.mkdirSync(whisperSetupDir, { recursive: true });
      process.env.GPTSOVITS_DATA_DIR = gptSovitsDataDir;
      process.env.WHISPER_SETUP_DIR = whisperSetupDir;

      if (whisperSetupRunner) {
        throw new Error('Whisper setup already running');
      }

      if (setupRunner) {
        throw new Error('GPT-SoVITS setup is running. Please wait for it to finish first.');
      }

      console.log('[Whisper] Starting setup...');
  whisperSetupRunner = new WhisperSetupRunnerClass();

      whisperSetupRunner.run((log: SetupLog) => {
        event.sender.send('whisper:setup:log', log);
      }, options).then(async () => {
        console.log('[Whisper] Setup complete');
        event.sender.send('whisper:setup:complete', { success: true });
        whisperSetupRunner = null;

        console.log('[Whisper] Restarting STT server...');
        stopWhisperServer();

        setTimeout(async () => {
          startWhisperServer();
          await localServerManager.restartIfRunning();
        }, 1500);
      }).catch((error: unknown) => {
        console.error('[Whisper] Setup failed:', error);
        event.sender.send('whisper:setup:complete', {
          success: false,
          error: getErrorMessage(error)
        });
        whisperSetupRunner = null;
      });

      return { started: true };
    });

    ipcMain.handle('whisper:setup:cancel', async () => {
      if (whisperSetupRunner) {
        console.log('[Whisper] Cancelling setup...');
        whisperSetupRunner.cancel();
        whisperSetupRunner = null;
        return { cancelled: true };
      }
      return { cancelled: false, message: 'No setup running' };
    });

    ipcMain.handle('whisper:setup:status', async () => {
      ensureRuntimeServerScripts();

      const gptSovitsDataDir = getGPTSoVITSDataDir();
      const whisperSetupDir = path.join(getRuntimeServerBasePath(), 'whisper-stt');
      fs.mkdirSync(gptSovitsDataDir, { recursive: true });
      fs.mkdirSync(whisperSetupDir, { recursive: true });
      process.env.GPTSOVITS_DATA_DIR = gptSovitsDataDir;
      process.env.WHISPER_SETUP_DIR = whisperSetupDir;
      const runner = new WhisperSetupRunnerClass();

      try {
        const status = runner.getStatus();
        console.log('[Whisper] Setup status:', status);
        return status;
      } catch (error) {
        console.error('[Whisper] Status check error:', error);
        return {
          isSetup: false,
          pythonExists: false,
          dependenciesInstalled: false,
          modelExists: false,
          error: getErrorMessage(error)
        };
      }
    });
  }

  function cleanupBeforeQuit(localServerManager: LocalServerManagerLike) {
    if (setupRunner) {
      console.log('[GPT-SoVITS] Cancelling setup on app quit...');
      try {
        setupRunner.cancel();
      } catch (error) {
        console.error('[GPT-SoVITS] Setup cancel error:', error);
      }
      setupRunner = null;
    }

    if (whisperSetupRunner) {
      console.log('[Whisper] Cancelling setup on app quit...');
      try {
        whisperSetupRunner.cancel();
      } catch (error) {
        console.error('[Whisper] Setup cancel error:', error);
      }
      whisperSetupRunner = null;
    }

    stopGPTSoVITSServer();
    stopWhisperServer();
    localServerManager.stopIfRunning();
  }

  return {
    startGPTSoVITSServer,
    stopGPTSoVITSServer,
    startWhisperServer,
    stopWhisperServer,
    registerSetupIPCHandlers,
    cleanupBeforeQuit,
  };
}
