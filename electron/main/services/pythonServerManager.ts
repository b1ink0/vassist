import type {
  ChildProcessWithoutNullStreams,
  SpawnOptionsWithoutStdio,
} from "child_process";
import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import type * as fsType from "fs";
import type * as pathType from "path";
import GPTSoVITSSetupRunner from "../../server/gpt-sovits/setup-runner";
import WhisperSetupRunnerClass from "../../server/whisper-stt/setup-runner";
import SupertonicSetupRunnerClass from "../../server/supertonic/setup-runner";

type SetupLog = Record<string, unknown>;

type SetupRunnerLike = {
  run: (
    onLog: (log: SetupLog) => void,
    options?: Record<string, unknown>,
  ) => Promise<void>;
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
  spawn: (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio,
  ) => ChildProcessWithoutNullStreams;
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
  let supertonicProcess: ChildProcessWithoutNullStreams | null = null;
  let supertonicAdoptedPid: number | null = null;
  let supertonicStartupPromise: Promise<void> | null = null;
  let whisperProcess: ChildProcessWithoutNullStreams | null = null;
  let setupRunner: SetupRunnerLike | null = null;
  let whisperSetupRunner: SetupRunnerLike | null = null;
  let supertonicSetupRunner: SetupRunnerLike | null = null;
  let gptsovitsStartupPromise: Promise<void> | null = null;
  let gptsovitsRecyclePromise: Promise<void> | null = null;
  let gptsovitsRestartPromise: Promise<void> | null = null;
  let gptsovitsAdoptedPid: number | null = null;
  let gptsovitsIdleTimer: NodeJS.Timeout | null = null;
  let gptsovitsActiveRequests = 0;
  let gptsovitsHandledRequests = 0;
  let gptsovitsLastUsedAt: number | null = null;
  let currentGPTSoVITSTorchBackend = String(
    processEnv.GPTSOVITS_TORCH_BACKEND ?? "auto",
  )
    .trim()
    .toLowerCase();
  const gptsovitsIdleTimeoutMs = Math.max(
    1000,
    Number(processEnv.GPTSOVITS_IDLE_TIMEOUT_MS ?? 120000) || 120000,
  );
  const gptsovitsRecycleAfterRequests = Math.max(
    1,
    Number(processEnv.GPTSOVITS_RECYCLE_AFTER_REQUESTS ?? 4) || 4,
  );
  const gptsovitsPostBurstIdleMs = Math.max(
    1000,
    Number(processEnv.GPTSOVITS_POST_BURST_IDLE_MS ?? 15000) || 15000,
  );
  const gptsovitsKeepWarm =
    String(processEnv.GPTSOVITS_KEEP_WARM ?? "1")
      .trim()
      .toLowerCase() !== "0";

  function delay(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function clearGPTSoVITSIdleTimer() {
    if (gptsovitsIdleTimer) {
      clearTimeout(gptsovitsIdleTimer);
      gptsovitsIdleTimer = null;
    }
  }

  function resetGPTSoVITSWorkerUsageState() {
    clearGPTSoVITSIdleTimer();
    gptsovitsHandledRequests = 0;
    gptsovitsLastUsedAt = null;
  }

  async function recycleGPTSoVITSWorker(reason: string) {
    if (gptsovitsRecyclePromise) {
      await gptsovitsRecyclePromise;
      return;
    }

    gptsovitsRecyclePromise = (async () => {
      if (gptsovitsActiveRequests > 0) {
        return;
      }

      console.log(`[GPT-SoVITS] Recycling worker: ${reason}`);
      await stopGPTSoVITSServer("recycle");

      if (!gptsovitsKeepWarm) {
        return;
      }

      console.log("[GPT-SoVITS] Prewarming fresh worker after recycle...");
      await startGPTSoVITSServer(true);
    })()
      .catch((error) => {
        console.error("[GPT-SoVITS] Recycle error:", error);
      })
      .finally(() => {
        gptsovitsRecyclePromise = null;
      });

    await gptsovitsRecyclePromise;
  }

  function scheduleGPTSoVITSIdleAction() {
    clearGPTSoVITSIdleTimer();

    if (
      (!gptsovitsProcess && !gptsovitsAdoptedPid) ||
      gptsovitsActiveRequests > 0 ||
      gptsovitsRecyclePromise
    ) {
      return;
    }

    const shouldRecycle =
      gptsovitsHandledRequests >= gptsovitsRecycleAfterRequests;

    if (!shouldRecycle && gptsovitsKeepWarm) {
      return;
    }

    const idleDelayMs = shouldRecycle
      ? gptsovitsPostBurstIdleMs
      : gptsovitsIdleTimeoutMs;

    gptsovitsIdleTimer = setTimeout(() => {
      gptsovitsIdleTimer = null;

      if (
        (!gptsovitsProcess && !gptsovitsAdoptedPid) ||
        gptsovitsActiveRequests > 0 ||
        gptsovitsRecyclePromise
      ) {
        return;
      }

      const idleForMs = gptsovitsLastUsedAt
        ? Date.now() - gptsovitsLastUsedAt
        : idleDelayMs;
      if (idleForMs < idleDelayMs) {
        scheduleGPTSoVITSIdleAction();
        return;
      }

      if (shouldRecycle) {
        void recycleGPTSoVITSWorker(
          `post-burst recycle after ${gptsovitsHandledRequests} request(s)`,
        );
        return;
      }

      const reason = `idle timeout after ${Math.round(idleForMs / 1000)}s`;
      console.log(`[GPT-SoVITS] Releasing worker: ${reason}`);
      stopGPTSoVITSServer();
    }, idleDelayMs);
  }

  function markGPTSoVITSTTSRequestStart() {
    gptsovitsActiveRequests += 1;
    gptsovitsLastUsedAt = Date.now();
    clearGPTSoVITSIdleTimer();
  }

  function markGPTSoVITSTTSRequestComplete() {
    gptsovitsActiveRequests = Math.max(0, gptsovitsActiveRequests - 1);
    gptsovitsHandledRequests += 1;
    gptsovitsLastUsedAt = Date.now();
    scheduleGPTSoVITSIdleAction();
  }

  async function getGPTSoVITSHealth(timeoutMs = 2500) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("http://127.0.0.1:9880/health", {
        signal: controller.signal,
      });
      if (!response.ok) {
        return { healthy: false, pid: null };
      }

      const data = (await response.json().catch(() => null)) as {
        status?: string;
        models_loaded?: boolean;
        pid?: number;
      } | null;
      return {
        healthy: data?.status === "healthy" && data.models_loaded === true,
        pid:
          typeof data?.pid === "number" && Number.isInteger(data.pid)
            ? data.pid
            : null,
      };
    } catch {
      return { healthy: false, pid: null };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function isGPTSoVITSHealthy(timeoutMs = 2500) {
    return (await getGPTSoVITSHealth(timeoutMs)).healthy;
  }

  function isProcessAlive(pid: number) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async function waitForProcessExit(
    childProcess: ChildProcessWithoutNullStreams | null,
    pid: number | null,
    timeoutMs: number,
  ) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const isAlive = childProcess
        ? childProcess.exitCode === null && childProcess.signalCode === null
        : Boolean(pid && isProcessAlive(pid));
      if (!isAlive) {
        return true;
      }
      await delay(100);
    }
    return false;
  }

  async function waitForGPTSoVITSReady(
    expectedProcess: ChildProcessWithoutNullStreams,
    timeoutMs = 180000,
  ) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (
        gptsovitsProcess !== expectedProcess ||
        expectedProcess.exitCode !== null ||
        expectedProcess.signalCode !== null
      ) {
        throw new Error("GPT-SoVITS process exited before becoming ready");
      }

      if (await isGPTSoVITSHealthy()) {
        if (gptsovitsProcess !== expectedProcess) {
          throw new Error("GPT-SoVITS process changed during startup");
        }
        return;
      }

      await delay(500);
    }

    throw new Error("Timed out waiting for GPT-SoVITS to become ready");
  }

  function resolveEmbeddedPythonExecutable(gptsovitsDataDir: string): string {
    const candidates =
      process.platform === "win32"
        ? [
            path.join(gptsovitsDataDir, "python312", "python.exe"),
            path.join(gptsovitsDataDir, "python", "python.exe"),
          ]
        : [
            path.join(gptsovitsDataDir, "python", "bin", "python3"),
            path.join(gptsovitsDataDir, "python", "bin", "python"),
          ];

    return (
      candidates.find((candidate) => fs.existsSync(candidate)) ||
      path.join(
        gptsovitsDataDir,
        process.platform === "win32" ? "python.exe" : "python3",
      )
    );
  }

  async function startGPTSoVITSAttempt() {
    if (gptsovitsProcess) {
      if (await isGPTSoVITSHealthy()) {
        console.log("[GPT-SoVITS] Managed server is healthy");
        return;
      }

      console.warn(
        "[GPT-SoVITS] Managed process is running but unhealthy; replacing it",
      );
      await stopGPTSoVITSServer("unhealthy process", true);
    }

    const existingHealth = await getGPTSoVITSHealth();
    if (existingHealth.healthy) {
      gptsovitsAdoptedPid = existingHealth.pid;
      console.log(
        existingHealth.pid
          ? `[GPT-SoVITS] Adopted healthy existing server (pid=${existingHealth.pid})`
          : "[GPT-SoVITS] Server already healthy (pid unavailable)",
      );
      return;
    }

    try {
      ensureRuntimeServerScripts();

      const gptsovitsDataDir = getGPTSoVITSDataDir();
      fs.mkdirSync(gptsovitsDataDir, { recursive: true });

      const pythonExe = resolveEmbeddedPythonExecutable(gptsovitsDataDir);
      const apiScript = path.join(gptsovitsDataDir, "api.py");

      if (!fs.existsSync(pythonExe)) {
        const expectedPaths =
          process.platform === "win32"
            ? [path.join(gptsovitsDataDir, "python", "python.exe")]
            : [
                path.join(gptsovitsDataDir, "python", "bin", "python3"),
                path.join(gptsovitsDataDir, "python", "bin", "python"),
              ];
        throw new Error(
          `Embedded Python not found. Expected one of: ${expectedPaths.join(", ")}`,
        );
      }

      if (!fs.existsSync(apiScript)) {
        throw new Error(`GPT-SoVITS API script not found at ${apiScript}`);
      }

      console.log("[GPT-SoVITS] Starting TTS server...");
      console.log("[GPT-SoVITS] Python:", pythonExe);
      console.log("[GPT-SoVITS] Script:", apiScript);
      console.log(
        "[GPT-SoVITS] Configured PyTorch backend:",
        currentGPTSoVITSTorchBackend,
      );
      const rocmMixedPrecision =
        processEnv.GPTSOVITS_ROCM_MIXED_PRECISION ??
        (currentGPTSoVITSTorchBackend === "rocm" ? "1" : "0");
      const rocmWeightDtype =
        processEnv.GPTSOVITS_ROCM_WEIGHT_DTYPE ??
        (currentGPTSoVITSTorchBackend === "rocm" ? "float16" : "float32");
      const rocmAutocastDtype =
        processEnv.GPTSOVITS_ROCM_AUTOCAST_DTYPE ??
        (currentGPTSoVITSTorchBackend === "rocm" ? "float16" : "float32");
      const rocmWeightPolicy =
        processEnv.GPTSOVITS_ROCM_WEIGHT_POLICY ??
        (currentGPTSoVITSTorchBackend === "rocm" ? "aggressive" : "balanced");
      const rocmWorkerEnv =
        currentGPTSoVITSTorchBackend === "rocm"
          ? {
              HSA_SCRATCH_SINGLE_LIMIT:
                processEnv.HSA_SCRATCH_SINGLE_LIMIT ?? "0",
              HSA_ENABLE_SCRATCH_ASYNC_RECLAIM:
                processEnv.HSA_ENABLE_SCRATCH_ASYNC_RECLAIM ?? "1",
              HIPBLAS_WORKSPACE_CONFIG:
                processEnv.HIPBLAS_WORKSPACE_CONFIG ?? ":4096:2",
              MIOPEN_FIND_MODE: processEnv.MIOPEN_FIND_MODE ?? "3",
              PYTORCH_HIP_ALLOC_CONF:
                processEnv.PYTORCH_HIP_ALLOC_CONF ?? "expandable_segments:True",
            }
          : {};

      console.log(
        "[GPT-SoVITS] ROCm mixed precision:",
        rocmMixedPrecision,
        "weight_dtype:",
        rocmWeightDtype,
        "autocast_dtype:",
        rocmAutocastDtype,
        "weight_policy:",
        rocmWeightPolicy,
      );
      if (currentGPTSoVITSTorchBackend === "rocm") {
        console.log("[GPT-SoVITS] ROCm worker env:", rocmWorkerEnv);
      }

      const spawnedProcess = spawn(pythonExe, [apiScript], {
        cwd: gptsovitsDataDir,
        env: {
          ...processEnv,
          GPTSOVITS_PORT: "9880",
          PYTHONUNBUFFERED: "1",
          GPTSOVITS_DATA_DIR: gptsovitsDataDir,
          GPTSOVITS_TORCH_BACKEND: currentGPTSoVITSTorchBackend,
          WHISPER_MODEL_DIR: path.join(
            getRuntimeServerBasePath(),
            "models",
            "whisper",
          ),
          GPTSOVITS_ROCM_MIXED_PRECISION: rocmMixedPrecision,
          GPTSOVITS_ROCM_WEIGHT_DTYPE: rocmWeightDtype,
          GPTSOVITS_ROCM_AUTOCAST_DTYPE: rocmAutocastDtype,
          GPTSOVITS_ROCM_WEIGHT_POLICY: rocmWeightPolicy,
          ...rocmWorkerEnv,
          // ROCm ships libiomp5md.dll; faster-whisper ships libomp140. Allow both to coexist.
          KMP_DUPLICATE_LIB_OK: "TRUE",
        },
      });
      gptsovitsProcess = spawnedProcess;
      gptsovitsAdoptedPid = null;

      spawnedProcess.stdout.on("data", (data: Buffer) => {
        console.log(`[GPT-SoVITS] ${data.toString().trim()}`);
      });

      spawnedProcess.stderr.on("data", (data: Buffer) => {
        console.error(`[GPT-SoVITS] ${data.toString().trim()}`);
      });

      spawnedProcess.on("error", (error: Error) => {
        console.error("[GPT-SoVITS] Failed to start:", error);
        if (gptsovitsProcess === spawnedProcess) {
          resetGPTSoVITSWorkerUsageState();
          gptsovitsProcess = null;
        }
      });
      resetGPTSoVITSWorkerUsageState();

      spawnedProcess.on(
        "exit",
        (code: number | null, signal: NodeJS.Signals | null) => {
          console.log(
            `[GPT-SoVITS] Process exited with code ${code}, signal ${signal}`,
          );
          // A deliberately stopped older process may exit after its replacement
          // has already started. Never clear the replacement's process handle.
          if (gptsovitsProcess === spawnedProcess) {
            resetGPTSoVITSWorkerUsageState();
            gptsovitsProcess = null;
          }
          if (gptsovitsAdoptedPid === spawnedProcess.pid) {
            gptsovitsAdoptedPid = null;
          }
        },
      );

      await waitForGPTSoVITSReady(spawnedProcess);
      console.log("[GPT-SoVITS] Server ready on http://127.0.0.1:9880");
    } catch (error) {
      console.error("[GPT-SoVITS] Start error:", error);
      throw error;
    }
  }

  async function startGPTSoVITSServer(skipRecycleWait = false) {
    if (!skipRecycleWait && gptsovitsRestartPromise) {
      await gptsovitsRestartPromise;
      return;
    }

    if (!skipRecycleWait && gptsovitsRecyclePromise) {
      await gptsovitsRecyclePromise;
      if (await isGPTSoVITSHealthy()) {
        return;
      }
    }

    if (gptsovitsStartupPromise) {
      await gptsovitsStartupPromise;
      return;
    }

    // Assign the promise before the first asynchronous health check completes,
    // so simultaneous requests cannot spawn competing workers.
    const startupAttempt = startGPTSoVITSAttempt();
    gptsovitsStartupPromise = startupAttempt;
    try {
      await startupAttempt;
    } finally {
      if (gptsovitsStartupPromise === startupAttempt) {
        gptsovitsStartupPromise = null;
      }
    }
  }

  async function stopGPTSoVITSServer(
    reason = "requested stop",
    preserveStartupPromise = false,
  ) {
    if (!preserveStartupPromise) {
      gptsovitsStartupPromise = null;
    }
    clearGPTSoVITSIdleTimer();
    const processToStop = gptsovitsProcess;
    let adoptedPid = gptsovitsAdoptedPid;

    if (!processToStop && !adoptedPid) {
      const existingHealth = await getGPTSoVITSHealth();
      adoptedPid = existingHealth.healthy ? existingHealth.pid : null;
    }

    if (!processToStop && !adoptedPid) {
      return;
    }

    console.log(`[GPT-SoVITS] Stopping server (${reason})...`);
    if (gptsovitsProcess === processToStop) {
      gptsovitsProcess = null;
    }
    gptsovitsAdoptedPid = null;
    resetGPTSoVITSWorkerUsageState();

    try {
      if (processToStop) {
        processToStop.kill("SIGTERM");
      } else if (adoptedPid) {
        process.kill(adoptedPid, "SIGTERM");
      }
    } catch (error) {
      console.warn("[GPT-SoVITS] Graceful stop failed:", error);
    }

    const exitedGracefully = await waitForProcessExit(
      processToStop,
      adoptedPid,
      5000,
    );
    if (!exitedGracefully) {
      console.warn("[GPT-SoVITS] Worker did not exit; forcing termination");
      try {
        if (processToStop) {
          processToStop.kill("SIGKILL");
        } else if (adoptedPid) {
          process.kill(adoptedPid, "SIGKILL");
        }
      } catch (error) {
        console.warn("[GPT-SoVITS] Forced stop failed:", error);
      }
      await waitForProcessExit(processToStop, adoptedPid, 2000);
    }
  }

  async function restartGPTSoVITSServer(reason = "request recovery") {
    if (gptsovitsRestartPromise) {
      await gptsovitsRestartPromise;
      return;
    }

    gptsovitsRestartPromise = (async () => {
      console.warn(`[GPT-SoVITS] Restarting worker: ${reason}`);
      await stopGPTSoVITSServer(reason);
      await startGPTSoVITSServer(true);
    })().finally(() => {
      gptsovitsRestartPromise = null;
    });

    await gptsovitsRestartPromise;
  }

  const SUPERTONIC_PORT = 9882;

  async function getSupertonicHealth(timeoutMs = 2500) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      for (const path of ["/health", "/docs"]) {
        try {
          const response = await fetch(
            `http://127.0.0.1:${SUPERTONIC_PORT}${path}`,
            { signal: controller.signal },
          );
          if (response.ok) {
            return {
              healthy: true,
              pid: supertonicProcess?.pid ?? supertonicAdoptedPid,
            };
          }
        } catch {
          // try next probe path
        }
      }
      return { healthy: false, pid: null };
    } catch {
      return { healthy: false, pid: null };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function waitForSupertonicReady(
    expectedProcess: ChildProcessWithoutNullStreams,
    timeoutMs = 120000,
  ) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (
        supertonicProcess !== expectedProcess ||
        expectedProcess.exitCode !== null ||
        expectedProcess.signalCode !== null
      ) {
        throw new Error("Supertonic process exited before becoming ready");
      }
      if ((await getSupertonicHealth()).healthy) {
        return;
      }
      await delay(500);
    }
    throw new Error("Timed out waiting for Supertonic to become ready");
  }

  async function startSupertonicAttempt() {
    if (supertonicProcess) {
      if ((await getSupertonicHealth()).healthy) {
        console.log("[Supertonic] Managed server is healthy");
        return;
      }
      console.warn("[Supertonic] Managed process unhealthy; replacing it");
      await stopSupertonicServer("unhealthy process");
    }

    const existingHealth = await getSupertonicHealth();
    if (existingHealth.healthy) {
      supertonicAdoptedPid = existingHealth.pid;
      console.log(
        "[Supertonic] Adopted healthy existing server",
        existingHealth.pid ? `(pid=${existingHealth.pid})` : "",
      );
      return;
    }

    ensureRuntimeServerScripts();

    const gptsovitsDataDir = getGPTSoVITSDataDir();
    const pythonExe = resolveEmbeddedPythonExecutable(gptsovitsDataDir);
    if (!fs.existsSync(pythonExe)) {
      throw new Error(
        "Embedded Python not found. Install the GPT-SoVITS/Whisper backend first.",
      );
    }

    const scriptExe =
      process.platform === "win32"
        ? path.join(gptsovitsDataDir, "python312", "Scripts", "supertonic.exe")
        : path.join(gptsovitsDataDir, "python", "bin", "supertonic");
    const useScriptExe = fs.existsSync(scriptExe);

    console.log("[Supertonic] Starting TTS server on port", SUPERTONIC_PORT);
    console.log(
      "[Supertonic] Launcher:",
      useScriptExe ? scriptExe : `${pythonExe} -m supertonic`,
    );

    const serveArgs = [
      "serve",
      "--host",
      "127.0.0.1",
      "--port",
      String(SUPERTONIC_PORT),
    ];
    const spawnedProcess = useScriptExe
      ? spawn(scriptExe, serveArgs, {})
      : spawn(pythonExe, ["-m", "supertonic", ...serveArgs], {});

    spawnedProcess.stdout.on("data", (data: Buffer) => {
      console.log(`[Supertonic] ${data.toString().trim()}`);
    });
    spawnedProcess.stderr.on("data", (data: Buffer) => {
      console.error(`[Supertonic] ${data.toString().trim()}`);
    });
    spawnedProcess.on("error", (error: Error) => {
      console.error("[Supertonic] Failed to start:", error);
      if (supertonicProcess === spawnedProcess) {
        supertonicProcess = null;
      }
    });
    spawnedProcess.on("exit", (code, signal) => {
      console.log(`[Supertonic] Process exited code=${code} signal=${signal}`);
      if (supertonicProcess === spawnedProcess) {
        supertonicProcess = null;
      }
      if (supertonicAdoptedPid === spawnedProcess.pid) {
        supertonicAdoptedPid = null;
      }
    });

    supertonicProcess = spawnedProcess;
    supertonicAdoptedPid = null;

    await waitForSupertonicReady(spawnedProcess);
    console.log(
      `[Supertonic] Server ready on http://127.0.0.1:${SUPERTONIC_PORT}`,
    );
  }

  async function startSupertonicServer() {
    if (supertonicStartupPromise) {
      await supertonicStartupPromise;
      return;
    }
    const startupAttempt = startSupertonicAttempt();
    supertonicStartupPromise = startupAttempt;
    try {
      await startupAttempt;
    } finally {
      if (supertonicStartupPromise === startupAttempt) {
        supertonicStartupPromise = null;
      }
    }
  }

  async function stopSupertonicServer(reason = "requested stop") {
    supertonicStartupPromise = null;
    const processToStop = supertonicProcess;
    const adoptedPid = supertonicAdoptedPid;

    if (!processToStop && !adoptedPid) {
      return;
    }

    console.log(`[Supertonic] Stopping server (${reason})...`);
    supertonicProcess = null;
    supertonicAdoptedPid = null;

    try {
      if (processToStop) {
        processToStop.kill("SIGTERM");
      } else if (adoptedPid) {
        process.kill(adoptedPid, "SIGTERM");
      }
    } catch (error) {
      console.warn("[Supertonic] Graceful stop failed:", error);
    }

    const exitedGracefully = await waitForProcessExit(
      processToStop,
      adoptedPid,
      5000,
    );
    if (!exitedGracefully) {
      try {
        if (processToStop) {
          processToStop.kill("SIGKILL");
        } else if (adoptedPid) {
          process.kill(adoptedPid, "SIGKILL");
        }
      } catch {
        // best effort
      }
      await waitForProcessExit(processToStop, adoptedPid, 2000);
    }
  }

  async function restartSupertonicServer(reason = "request recovery") {
    await stopSupertonicServer(reason);
    await startSupertonicServer();
  }

  function startWhisperServer() {
    if (whisperProcess) {
      console.log("[Whisper] Server already running");
      return;
    }
    try {
      ensureRuntimeServerScripts();

      const gptsovitsDataDir = getGPTSoVITSDataDir();
      const whisperModelsDir = path.join(
        getRuntimeServerBasePath(),
        "models",
        "whisper",
      );
      fs.mkdirSync(gptsovitsDataDir, { recursive: true });
      fs.mkdirSync(whisperModelsDir, { recursive: true });

      const whisperDir = path.join(getRuntimeServerBasePath(), "whisper-stt");
      const pythonExe = resolveEmbeddedPythonExecutable(gptsovitsDataDir);
      const serverScript = path.join(whisperDir, "server.py");

      if (!fs.existsSync(pythonExe)) {
        console.error(
          "[Whisper] Embedded Python not found. Run setup.py first.",
        );
        return;
      }

      if (!fs.existsSync(serverScript)) {
        console.error("[Whisper] Server script not found:", serverScript);
        return;
      }

      console.log("[Whisper] Starting STT server...");
      console.log("[Whisper] Python:", pythonExe);
      console.log("[Whisper] Script:", serverScript);

      whisperProcess = spawn(pythonExe, [serverScript], {
        cwd: whisperDir,
        env: {
          ...processEnv,
          PYTHONUNBUFFERED: "1",
          PYTHONIOENCODING: "utf-8",
          WHISPER_MODEL_DIR: whisperModelsDir,
          // ROCm ships libiomp5md.dll; faster-whisper ships libomp140. Allow both to coexist.
          KMP_DUPLICATE_LIB_OK: "TRUE",
        },
      });

      whisperProcess.stdout.on("data", (data: Buffer) => {
        console.log(`[Whisper] ${data.toString().trim()}`);
      });

      whisperProcess.stderr.on("data", (data: Buffer) => {
        console.error(`[Whisper] ${data.toString().trim()}`);
      });

      whisperProcess.on("error", (error: Error) => {
        console.error("[Whisper] Failed to start:", error);
        whisperProcess = null;
      });

      whisperProcess.on(
        "exit",
        (code: number | null, signal: NodeJS.Signals | null) => {
          console.log(
            `[Whisper] Process exited with code ${code}, signal ${signal}`,
          );
          whisperProcess = null;
        },
      );

      console.log("[Whisper] Server started on http://127.0.0.1:9881");
    } catch (error) {
      console.error("[Whisper] Start error:", error);
    }
  }

  function stopWhisperServer() {
    if (whisperProcess) {
      console.log("[Whisper] Stopping server...");
      whisperProcess.kill("SIGTERM");
      whisperProcess = null;
    }
  }

  // ── On-demand lifecycle for the Python STT server (TTS-style) ──
  let whisperStartupPromise: Promise<void> | null = null;
  let whisperActiveRequests = 0;
  let whisperLastUsedAt = 0;
  let whisperIdleTimer: NodeJS.Timeout | null = null;
  const WHISPER_IDLE_STOP_MS = 5 * 60 * 1000;

  async function getWhisperHealth(timeoutMs = 2500): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("http://127.0.0.1:9881/health", {
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as {
        status?: string;
      } | null;
      return data?.status === "ok";
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  function clearWhisperIdleTimer() {
    if (whisperIdleTimer) {
      clearTimeout(whisperIdleTimer);
      whisperIdleTimer = null;
    }
  }

  function scheduleWhisperIdleStop() {
    clearWhisperIdleTimer();
    if (whisperActiveRequests > 0) return;
    whisperIdleTimer = setTimeout(async () => {
      if (
        whisperActiveRequests === 0 &&
        Date.now() - whisperLastUsedAt >= WHISPER_IDLE_STOP_MS - 1000
      ) {
        console.log("[Whisper] Idle timeout — stopping server");
        stopWhisperServer();
      }
    }, WHISPER_IDLE_STOP_MS);
  }

  function markWhisperRequestStart() {
    whisperActiveRequests += 1;
    whisperLastUsedAt = Date.now();
    clearWhisperIdleTimer();
  }

  function markWhisperRequestComplete() {
    whisperActiveRequests = Math.max(0, whisperActiveRequests - 1);
    whisperLastUsedAt = Date.now();
    scheduleWhisperIdleStop();
  }

  async function ensureWhisperServerRunning(): Promise<void> {
    whisperLastUsedAt = Date.now();
    if (await getWhisperHealth()) {
      return;
    }
    if (whisperStartupPromise) {
      await whisperStartupPromise;
      return;
    }
    whisperStartupPromise = (async () => {
      startWhisperServer();
      const startedAt = Date.now();
      while (Date.now() - startedAt < 120000) {
        if (!whisperProcess && !(await getWhisperHealth())) {
          throw new Error("Python STT server exited during startup");
        }
        if (await getWhisperHealth()) {
          console.log("[Whisper] Server ready on http://127.0.0.1:9881");
          return;
        }
        await delay(500);
      }
      throw new Error("Timed out waiting for Python STT server");
    })().finally(() => {
      whisperStartupPromise = null;
    });
    await whisperStartupPromise;
  }

  function setGPTSoVITSTorchBackend(backend: string | undefined | null) {
    currentGPTSoVITSTorchBackend = String(backend ?? "auto")
      .trim()
      .toLowerCase();
    process.env.GPTSOVITS_TORCH_BACKEND = currentGPTSoVITSTorchBackend;
  }

  function registerSetupIPCHandlers(
    ipcMain: IpcMain,
    localServerManager: LocalServerManagerLike,
  ) {
    ipcMain.handle(
      "gptsovits:setup:start",
      async (
        event: IpcMainInvokeEvent,
        options: Record<string, unknown> = {},
      ) => {
        ensureRuntimeServerScripts();

        const gptSovitsDataDir = getGPTSoVITSDataDir();
        fs.mkdirSync(gptSovitsDataDir, { recursive: true });
        const whisperSetupDir = path.join(
          getRuntimeServerBasePath(),
          "whisper-stt",
        );
        fs.mkdirSync(whisperSetupDir, { recursive: true });
        process.env.GPTSOVITS_DATA_DIR = gptSovitsDataDir;
        process.env.WHISPER_SETUP_DIR = whisperSetupDir;

        if (setupRunner) {
          throw new Error("Setup already running");
        }

        const selectedBackend = String(options.torchBackend ?? "auto")
          .trim()
          .toLowerCase();
        currentGPTSoVITSTorchBackend = selectedBackend;
        process.env.GPTSOVITS_TORCH_BACKEND = selectedBackend;

        console.log("[GPT-SoVITS] Starting setup...");
        console.log("[GPT-SoVITS] Selected PyTorch backend:", selectedBackend);
        setupRunner = new GPTSoVITSSetupRunner();

        setupRunner
          .run(
            (log: SetupLog) => {
              event.sender.send("gptsovits:setup:log", log);
            },
            { torchBackend: selectedBackend },
          )
          .then(async () => {
            console.log("[GPT-SoVITS] Setup complete");
            event.sender.send("gptsovits:setup:complete", { success: true });
            setupRunner = null;

            console.log("[GPT-SoVITS] Restarting servers...");
            stopGPTSoVITSServer();
            stopWhisperServer();

            setTimeout(async () => {
              startWhisperServer();
              await localServerManager.restartIfRunning();
            }, 2000);
          })
          .catch((error: unknown) => {
            console.error("[GPT-SoVITS] Setup failed:", error);
            event.sender.send("gptsovits:setup:complete", {
              success: false,
              error: getErrorMessage(error),
            });
            setupRunner = null;
          });

        return { started: true };
      },
    );

    ipcMain.handle("gptsovits:setup:cancel", async () => {
      if (setupRunner) {
        console.log("[GPT-SoVITS] Cancelling setup...");
        setupRunner.cancel();
        setupRunner = null;
        return { cancelled: true };
      }
      return { cancelled: false, message: "No setup running" };
    });

    ipcMain.handle("gptsovits:setup:status", async () => {
      ensureRuntimeServerScripts();

      const gptSovitsDataDir = getGPTSoVITSDataDir();
      fs.mkdirSync(gptSovitsDataDir, { recursive: true });
      const whisperSetupDir = path.join(
        getRuntimeServerBasePath(),
        "whisper-stt",
      );
      fs.mkdirSync(whisperSetupDir, { recursive: true });
      process.env.GPTSOVITS_DATA_DIR = gptSovitsDataDir;
      process.env.WHISPER_SETUP_DIR = whisperSetupDir;
      const runner = new GPTSoVITSSetupRunner();

      try {
        const status = runner.getStatus();
        console.log("[GPT-SoVITS] Setup status:", status);
        return status;
      } catch (error) {
        console.error("[GPT-SoVITS] Status check error:", error);
        return {
          isSetup: false,
          pythonExists: false,
          modelsExist: false,
          gptsovitsExists: false,
          error: getErrorMessage(error),
        };
      }
    });

    ipcMain.handle(
      "whisper:setup:start",
      async (
        event: IpcMainInvokeEvent,
        options: Record<string, unknown> = {},
      ) => {
        ensureRuntimeServerScripts();

        const gptSovitsDataDir = getGPTSoVITSDataDir();
        const whisperSetupDir = path.join(
          getRuntimeServerBasePath(),
          "whisper-stt",
        );
        fs.mkdirSync(gptSovitsDataDir, { recursive: true });
        fs.mkdirSync(whisperSetupDir, { recursive: true });
        process.env.GPTSOVITS_DATA_DIR = gptSovitsDataDir;
        process.env.WHISPER_SETUP_DIR = whisperSetupDir;

        if (whisperSetupRunner) {
          throw new Error("Whisper setup already running");
        }

        if (setupRunner) {
          throw new Error(
            "GPT-SoVITS setup is running. Please wait for it to finish first.",
          );
        }

        console.log("[Whisper] Starting setup...");
        whisperSetupRunner = new WhisperSetupRunnerClass();

        whisperSetupRunner
          .run((log: SetupLog) => {
            event.sender.send("whisper:setup:log", log);
          }, options)
          .then(async () => {
            console.log("[Whisper] Setup complete");
            event.sender.send("whisper:setup:complete", { success: true });
            whisperSetupRunner = null;

            console.log("[Whisper] Restarting STT server...");
            stopWhisperServer();

            setTimeout(async () => {
              startWhisperServer();
              await localServerManager.restartIfRunning();
            }, 1500);
          })
          .catch((error: unknown) => {
            console.error("[Whisper] Setup failed:", error);
            event.sender.send("whisper:setup:complete", {
              success: false,
              error: getErrorMessage(error),
            });
            whisperSetupRunner = null;
          });

        return { started: true };
      },
    );

    ipcMain.handle(
      "supertonic:setup:start",
      async (
        event: IpcMainInvokeEvent,
        _options: Record<string, unknown> = {},
      ) => {
        ensureRuntimeServerScripts();

        const gptSovitsDataDir = getGPTSoVITSDataDir();
        const supertonicSetupDir = path.join(
          getRuntimeServerBasePath(),
          "supertonic",
        );
        fs.mkdirSync(gptSovitsDataDir, { recursive: true });
        fs.mkdirSync(supertonicSetupDir, { recursive: true });
        process.env.GPTSOVITS_DATA_DIR = gptSovitsDataDir;
        process.env.SUPERTONIC_SETUP_DIR = supertonicSetupDir;

        if (supertonicSetupRunner) {
          throw new Error("Supertonic setup already running");
        }
        if (setupRunner) {
          throw new Error(
            "GPT-SoVITS setup is running. Please wait for it to finish first.",
          );
        }

        console.log("[Supertonic] Starting setup...");
        supertonicSetupRunner = new SupertonicSetupRunnerClass();

        supertonicSetupRunner
          .run((log: SetupLog) => {
            event.sender.send("supertonic:setup:log", log);
          })
          .then(async () => {
            console.log("[Supertonic] Setup complete");
            event.sender.send("supertonic:setup:complete", { success: true });
            supertonicSetupRunner = null;

            console.log("[Supertonic] Restarting TTS server...");
            stopSupertonicServer();
            setTimeout(async () => {
              await startSupertonicServer();
              await localServerManager.restartIfRunning();
            }, 1500);
          })
          .catch((error: unknown) => {
            console.error("[Supertonic] Setup failed:", error);
            event.sender.send("supertonic:setup:complete", {
              success: false,
              error: getErrorMessage(error),
            });
            supertonicSetupRunner = null;
          });

        return { started: true };
      },
    );

    ipcMain.handle("supertonic:setup:status", async () => {
      // Check embedded python for the supertonic module + model cache
      const gptSovitsDataDir = getGPTSoVITSDataDir();
      const candidates =
        process.platform === "win32"
          ? [
              path.join(gptSovitsDataDir, "python312"),
              path.join(gptSovitsDataDir, "python"),
            ]
          : [path.join(gptSovitsDataDir, "python")];

      let dependenciesInstalled = false;
      for (const pythonDir of candidates) {
        const siteRel =
          process.platform === "win32" ? ["Lib", "site-packages"] : ["lib"];
        if (process.platform !== "win32") {
          // unix: lib/python3.X/site-packages
          try {
            const libDir = path.join(pythonDir, "lib");
            const versions = fs.readdirSync(libDir, { withFileTypes: true });
            for (const version of versions) {
              if (
                version.isDirectory() &&
                version.name.startsWith("python") &&
                fs.existsSync(
                  path.join(
                    libDir,
                    version.name,
                    "site-packages",
                    "supertonic",
                  ),
                )
              ) {
                dependenciesInstalled = true;
                break;
              }
            }
          } catch {
            // ignore
          }
        } else if (
          fs.existsSync(path.join(pythonDir, ...siteRel, "supertonic"))
        ) {
          dependenciesInstalled = true;
        }
        if (dependenciesInstalled) break;
      }

      const home = process.env.USERPROFILE || process.env.HOME || "";
      const cacheDir = path.join(home, ".cache", "supertonic3");
      const modelExists =
        fs.existsSync(path.join(cacheDir, "onnx")) ||
        fs.existsSync(path.join(cacheDir, "voice_styles"));

      return {
        isSetup: dependenciesInstalled && modelExists,
        dependenciesInstalled,
        modelExists,
      };
    });

    ipcMain.handle("supertonic:setup:cancel", async () => {
      if (supertonicSetupRunner) {
        console.log("[Supertonic] Cancelling setup...");
        supertonicSetupRunner.cancel();
        supertonicSetupRunner = null;
        return { cancelled: true };
      }
      return { cancelled: false, message: "No setup running" };
    });

    ipcMain.handle("whisper:setup:cancel", async () => {
      if (whisperSetupRunner) {
        console.log("[Whisper] Cancelling setup...");
        whisperSetupRunner.cancel();
        whisperSetupRunner = null;
        return { cancelled: true };
      }
      return { cancelled: false, message: "No setup running" };
    });

    ipcMain.handle("whisper:setup:status", async () => {
      ensureRuntimeServerScripts();

      const gptSovitsDataDir = getGPTSoVITSDataDir();
      const whisperSetupDir = path.join(
        getRuntimeServerBasePath(),
        "whisper-stt",
      );
      fs.mkdirSync(gptSovitsDataDir, { recursive: true });
      fs.mkdirSync(whisperSetupDir, { recursive: true });
      process.env.GPTSOVITS_DATA_DIR = gptSovitsDataDir;
      process.env.WHISPER_SETUP_DIR = whisperSetupDir;
      const runner = new WhisperSetupRunnerClass();

      try {
        const status = runner.getStatus();
        console.log("[Whisper] Setup status:", status);
        return status;
      } catch (error) {
        console.error("[Whisper] Status check error:", error);
        return {
          isSetup: false,
          pythonExists: false,
          dependenciesInstalled: false,
          modelExists: false,
          error: getErrorMessage(error),
        };
      }
    });
  }

  function cleanupBeforeQuit(localServerManager: LocalServerManagerLike) {
    if (setupRunner) {
      console.log("[GPT-SoVITS] Cancelling setup on app quit...");
      try {
        setupRunner.cancel();
      } catch (error) {
        console.error("[GPT-SoVITS] Setup cancel error:", error);
      }
      setupRunner = null;
    }

    if (whisperSetupRunner) {
      console.log("[Whisper] Cancelling setup on app quit...");
      try {
        whisperSetupRunner.cancel();
      } catch (error) {
        console.error("[Whisper] Setup cancel error:", error);
      }
      whisperSetupRunner = null;
    }

    if (supertonicSetupRunner) {
      console.log("[Supertonic] Cancelling setup on app quit...");
      try {
        supertonicSetupRunner.cancel();
      } catch (error) {
        console.error("[Supertonic] Setup cancel error:", error);
      }
      supertonicSetupRunner = null;
    }

    stopGPTSoVITSServer();
    stopSupertonicServer();
    stopWhisperServer();
    localServerManager.stopIfRunning();
  }

  return {
    startGPTSoVITSServer,
    ensureWhisperServerRunning,
    markWhisperRequestStart,
    markWhisperRequestComplete,
    startSupertonicServer,
    restartSupertonicServer,
    stopSupertonicServer,
    restartGPTSoVITSServer,
    stopGPTSoVITSServer,
    setGPTSoVITSTorchBackend,
    startWhisperServer,
    markGPTSoVITSTTSRequestStart,
    markGPTSoVITSTTSRequestComplete,
    stopWhisperServer,
    registerSetupIPCHandlers,
    cleanupBeforeQuit,
  };
}
