/**
 * @fileoverview Whisper.cpp runtime manager for VAssist Desktop.
 *
 * Downloads official whisper.cpp release packs on demand (never bundled),
 * manages GGML model files (download/delete/list like Android), and runs
 * `whisper-server` on 127.0.0.1:9883 as an alternative STT engine alongside
 * the Python faster-whisper server (:9881). The user explicitly selects the
 * runtime variant and engine — nothing is auto-selected.
 *
 * Pinned upstream: ggml-org/whisper.cpp nightly tag b4938 (verified assets).
 */

import { spawn } from "child_process";
import * as tar from "tar";
import unzipper from "unzipper";
import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import type * as fsType from "fs";
import type * as pathType from "path";
const WHISPERCPP_VERSION = "b4938";
const WHISPERCPP_PORT = 9883;

type RuntimeVariant = "cpu" | "cuda" | "vulkan" | "metal";

interface RuntimePack {
  id: string;
  label: string;
  platforms: Array<"win32" | "linux" | "darwin">;
  url: string;
  sizeHint: string;
  /** Archive layout: where executables live inside the archive */
  layout: "release-dir" | "flat" | "xcframework";
}

const RELEASE_BASE = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPERCPP_VERSION}`;

// Community Vulkan builds (no official Windows Vulkan asset upstream).
const VULKAN_URL =
  "https://github.com/jerryshell/whisper.cpp-windows-vulkan-bin/releases/latest/download/whisper.cpp-windows-vulkan.zip";

const RUNTIME_PACKS: RuntimePack[] = [
  {
    id: "win-cpu",
    label: "Windows · CPU (~8 MB)",
    platforms: ["win32"],
    url: `${RELEASE_BASE}/whisper-bin-x64.zip`,
    sizeHint: "~8 MB",
    layout: "release-dir",
  },
  {
    id: "win-vulkan",
    label: "Windows · Vulkan (AMD/Intel/any GPU) (community build)",
    platforms: ["win32"],
    url: VULKAN_URL,
    sizeHint: "~20-40 MB",
    layout: "flat",
  },
  {
    id: "win-cuda",
    label: "Windows · NVIDIA CUDA 12.4 (~671 MB, bundles CUDA runtime)",
    platforms: ["win32"],
    url: `${RELEASE_BASE}/whisper-cublas-12.4.0-bin-x64.zip`,
    sizeHint: "~671 MB",
    layout: "release-dir",
  },
  {
    id: "linux-cpu",
    label: "Linux x64 · CPU (~10 MB)",
    platforms: ["linux"],
    url: `${RELEASE_BASE}/whisper-bin-ubuntu-x64.tar.gz`,
    sizeHint: "~10 MB",
    layout: "flat",
  },
];

/** GGML models hosted on the official whisper.cpp HuggingFace repo. */
interface GgmlModel {
  id: string;
  label: string;
  file: string;
  sizeHint: string;
}

const GGML_MODELS: GgmlModel[] = [
  {
    id: "tiny",
    label: "tiny (multilingual, ~75 MB, fastest)",
    file: "ggml-tiny.bin",
    sizeHint: "~75 MB",
  },
  {
    id: "tiny.en",
    label: "tiny.en (English-only, ~75 MB)",
    file: "ggml-tiny.en.bin",
    sizeHint: "~75 MB",
  },
  {
    id: "base",
    label: "base (multilingual, ~142 MB, better accuracy)",
    file: "ggml-base.bin",
    sizeHint: "~142 MB",
  },
  {
    id: "base.en",
    label: "base.en (English-only, ~142 MB)",
    file: "ggml-base.en.bin",
    sizeHint: "~142 MB",
  },
];

const HF_MODEL_BASE =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

export function createWhisperCppManager({
  ipcMain,
  fs,
  path,
  processEnv,
  getRuntimeServerBasePath,
}: {
  ipcMain: IpcMain;
  fs: typeof fsType;
  path: typeof pathType;
  processEnv: NodeJS.ProcessEnv;
  getRuntimeServerBasePath: () => string;
}) {
  type ChildProcessLike = {
    pid?: number | undefined;
    exitCode?: number | null;
    signalCode?: string | null;
    stdout: { on: (ev: string, cb: (d: Buffer) => void) => void };
    stderr: { on: (ev: string, cb: (d: Buffer) => void) => void };
    on: (
      ev: string,
      cb:
        | ((err: Error) => void)
        | ((code: number | null, sig: string | null) => void),
    ) => void;
    kill: (signal?: string) => void;
  };

  let currentProcess: ChildProcessLike | null = null;
  let currentModelPath: string | null = null;
  let startupPromise: Promise<void> | null = null;
  let setupActive = false;
  /** Which engine serves STT: python (default) or whispercpp */
  let activeEngine: "python" | "whispercpp" = "python";
  /** Selected runtime variant id */
  /** Which variant's server is currently spawned (runtime fact, not config) */
  let runningVariant: string | null = null;

  /**
   * Stateless resolution: the caller passes the variant requested by this
   * transcription (from the persisted STT config carried on the request).
   * Falls back to the only/first installed pack when unspecified.
   */
  function resolveRequestedVariant(requested?: string): string {
    const isInstalled = (id: string) => Boolean(id && getServerExePath(id));

    if (requested && isInstalled(requested)) {
      return requested;
    }

    for (const pack of getPacksForPlatform()) {
      if (isInstalled(pack.id)) {
        if (requested) {
          console.warn(
            `[WhisperCpp] Requested variant "${requested}" not installed; using ${pack.id}`,
          );
        }
        return pack.id;
      }
    }

    throw new Error(
      "No whisper.cpp runtime installed. Install one from STT settings.",
    );
  }

  function getRuntimeDir() {
    return path.join(getRuntimeServerBasePath(), "whisper-cpp");
  }

  function getVariantDir(variantId: string) {
    return path.join(getRuntimeDir(), variantId);
  }

  function getModelsDir() {
    return path.join(getRuntimeServerBasePath(), "models", "whisper-cpp");
  }

  function getPacksForPlatform(): RuntimePack[] {
    const platform = process.platform as "win32" | "linux" | "darwin";
    return RUNTIME_PACKS.filter((pack) => pack.platforms.includes(platform));
  }

  function getServerExePath(variantId: string): string | null {
    const dir = getVariantDir(variantId);
    const isWin = process.platform === "win32";
    // Official packs nest under Release/; community/extracted may be flat.
    const candidates = isWin
      ? [
          path.join(dir, "Release", "whisper-server.exe"),
          path.join(dir, "whisper-server.exe"),
        ]
      : [
          path.join(dir, "whisper-server"),
          path.join(dir, "build", "bin", "whisper-server"),
        ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  async function fetchWithProgress(
    url: string,
    destPath: string,
    onProgress: (info: { percent: number; status: string }) => void,
  ): Promise<void> {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
    }
    const total = Number(response.headers.get("content-length") || 0);
    let received = 0;
    const chunks: Buffer[] = [];
    let lastReported = 0;

    for await (const chunk of response.body as unknown as AsyncIterable<Buffer>) {
      const buf = chunk as Buffer;
      chunks.push(buf);
      received += buf.length;
      const now = Date.now();
      if (now - lastReported > 300) {
        lastReported = now;
        const percent = total ? Math.round((received / total) * 100) : 0;
        onProgress({
          percent,
          status: `Downloading ${(received / 1024 / 1024).toFixed(1)}${
            total ? ` / ${(total / 1024 / 1024).toFixed(1)} MB` : " MB"
          }`,
        });
      }
    }

    fs.writeFileSync(destPath, Buffer.concat(chunks));
    onProgress({ percent: 100, status: "Extracting..." });
  }

  async function extractArchive(
    archivePath: string,
    destDir: string,
  ): Promise<void> {
    fs.mkdirSync(destDir, { recursive: true });

    if (archivePath.endsWith(".tar.gz")) {
      // Node tar package — same pattern as llmBackendManager runtime packs
      await tar.x({ file: archivePath, cwd: destDir });
      return;
    }

    if (archivePath.endsWith(".zip")) {
      // Streamed unzipper extraction — same pattern as the GPT-SoVITS bootstrap
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(archivePath)
          .pipe(unzipper.Extract({ path: destDir }))
          .on("close", () => resolve())
          .on("error", reject);
      });
      return;
    }

    throw new Error(`Unsupported archive format: ${archivePath}`);
  }

  async function installVariant(
    variantId: string,
    sender: WebContents | null,
  ): Promise<void> {
    const pack = RUNTIME_PACKS.find((p) => p.id === variantId);
    if (!pack) throw new Error(`Unknown runtime variant: ${variantId}`);

    const sendLog = (message: unknown, type = "stdout") =>
      sender?.send("whispercpp:setup:log", { type, message });

    setupActive = true;
    try {
      const destDir = getVariantDir(variantId);
      const archivePath = path.join(
        getRuntimeDir(),
        `_dl_${variantId}${pack.url.endsWith(".tar.gz") ? ".tar.gz" : ".zip"}`,
      );
      fs.mkdirSync(getRuntimeDir(), { recursive: true });

      sendLog(`[WhisperCpp] Downloading ${pack.label}...`);
      await fetchWithProgress(pack.url, archivePath, (info) => {
        sendLog(`[WhisperCpp] ${info.status} (${info.percent}%)`);
        sender?.send("whispercpp:setup:progress", info);
      });

      sendLog("[WhisperCpp] Extracting...");
      sender?.send("whispercpp:setup:progress", {
        percent: 100,
        status: "Extracting...",
      });
      // Extract into a temp dir then move contents up so layout is uniform.
      const tmpExtract = `${destDir}_tmp`;
      fs.rmSync(tmpExtract, { recursive: true, force: true });
      await extractArchive(archivePath, tmpExtract);
      sendLog("[WhisperCpp] Finalizing install...");
      fs.rmSync(destDir, { recursive: true, force: true });
      try {
        fs.renameSync(tmpExtract, destDir);
      } catch {
        // Windows can hold handles on freshly extracted files (AV/indexer);
        // copy+delete is slower but immune to rename locks.
        fs.cpSync(tmpExtract, destDir, { recursive: true });
        fs.rmSync(tmpExtract, { recursive: true, force: true });
      }
      fs.rmSync(archivePath, { force: true });

      const exe = getServerExePath(variantId);
      if (!exe) {
        throw new Error(
          "whisper-server binary not found after extraction. The pack layout may have changed.",
        );
      }
      if (process.platform !== "win32") {
        try {
          fs.chmodSync(exe, 0o755);
        } catch {
          // best effort
        }
      }

      sendLog("[WhisperCpp] Install complete.");
      sender?.send("whispercpp:setup:complete", { success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendLog(`[WhisperCpp] Setup failed: ${message}`, "stderr");
      sender?.send("whispercpp:setup:complete", {
        success: false,
        error: message,
      });
      throw error;
    } finally {
      setupActive = false;
    }
  }

  function listInstalledVariants() {
    return getPacksForPlatform().map((pack) => ({
      id: pack.id,
      label: pack.label,
      sizeHint: pack.sizeHint,
      installed:
        fs.existsSync(getVariantDir(pack.id)) &&
        Boolean(getServerExePath(pack.id)),
      selected: false,
    }));
  }

  function listModels() {
    const modelsDir = getModelsDir();
    fs.mkdirSync(modelsDir, { recursive: true });
    return GGML_MODELS.map((model) => {
      const filePath = path.join(modelsDir, model.file);
      let sizeBytes = 0;
      try {
        sizeBytes = fs.statSync(filePath).size;
      } catch {
        // not downloaded
      }
      return {
        id: model.id,
        label: model.label,
        file: model.file,
        sizeHint: model.sizeHint,
        downloaded: sizeBytes > 0,
        sizeBytes,
        active: currentModelPath === filePath,
      };
    });
  }

  async function downloadModel(
    modelId: string,
    sender: WebContents | null,
  ): Promise<void> {
    const model = GGML_MODELS.find((m) => m.id === modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    const destPath = path.join(getModelsDir(), model.file);

    await fetchWithProgress(
      `${HF_MODEL_BASE}/${model.file}?download=true`,
      destPath,
      (info) => {
        sender?.send("whispercpp:model:progress", { id: modelId, ...info });
      },
    );
    sender?.send("whispercpp:model:complete", { id: modelId, success: true });
  }

  function deleteModel(modelId: string): { deleted: boolean } {
    const model = GGML_MODELS.find((m) => m.id === modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    const filePath = path.join(getModelsDir(), model.file);
    let deleted = false;
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
      deleted = true;
      if (currentModelPath === filePath) {
        currentModelPath = null;
      }
    }
    return { deleted };
  }

  async function isHealthy(timeoutMs = 2000): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // whisper-server responds on its HTTP port; any response counts.
      const response = await fetch(`http://127.0.0.1:${WHISPERCPP_PORT}/`, {
        signal: controller.signal,
      });
      void response;
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function stopServer(reason = "requested") {
    startupPromise = null;
    if (!currentProcess) return;
    console.log(`[WhisperCpp] Stopping server (${reason})`);
    const proc = currentProcess;
    currentProcess = null;
    runningVariant = null;
    try {
      proc.kill("SIGTERM");
    } catch {
      // best effort
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (proc.exitCode === null && proc.signalCode === null) {
      try {
        proc.kill("SIGKILL");
      } catch {
        // best effort
      }
    }
  }

  async function startServerAttempt(variantHint?: string): Promise<void> {
    const variant = resolveRequestedVariant(variantHint);
    const exe = getServerExePath(variant);
    if (!exe) {
      throw new Error("Selected whisper.cpp variant is not installed.");
    }
    if (!currentModelPath) {
      // Pick the best downloaded model: base > base.en > tiny > tiny.en
      const models = listModels()
        .filter((m) => m.downloaded)
        .sort((a, b) => b.sizeBytes - a.sizeBytes);
      if (models.length === 0) {
        throw new Error(
          "No whisper.cpp GGML models downloaded. Download a model first.",
        );
      }
      const bestModel = models[0];
      if (!bestModel) {
        throw new Error("No downloaded GGML model found.");
      }
      currentModelPath = path.join(getModelsDir(), bestModel.file);
    }

    if (await isHealthy()) {
      return; // already running (possibly adopted)
    }

    const spawnArgs = [
      "-m",
      currentModelPath,
      "--host",
      "127.0.0.1",
      "--port",
      String(WHISPERCPP_PORT),
      // convert audio to 16kHz mono internally
      "--convert",
    ];

    runningVariant = variant;
    console.log("[WhisperCpp] Spawning:", exe, spawnArgs.join(" "));
    // CRITICAL: cwd must be the exe's own directory so dynamic ggml backend
    // DLLs (ggml-vulkan.dll etc.) resolve. Without this, GPU backends fail
    // to load and the server silently falls back to CPU.
    const child = spawn(exe, spawnArgs, {
      cwd: path.dirname(exe),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }) as unknown as ChildProcessLike;
    currentProcess = child;

    child.stdout.on("data", (data: Buffer) => {
      console.log(`[WhisperCpp] ${data.toString().trim()}`);
    });
    child.stderr.on("data", (data: Buffer) => {
      console.error(`[WhisperCpp] ${data.toString().trim()}`);
    });
    child.on("error", (err: Error) => {
      console.error("[WhisperCpp] Failed to start:", err);
      if (currentProcess === child) currentProcess = null;
    });
    child.on("exit", (code: number | null, signal: string | null) => {
      console.log(`[WhisperCpp] Exited code=${code} signal=${signal}`);
      if (currentProcess === child) currentProcess = null;
    });

    // Wait for readiness
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30000) {
      if (currentProcess !== child) {
        throw new Error("whisper-server exited during startup");
      }
      if (await isHealthy()) {
        console.log(
          `[WhisperCpp] Server ready on :${WHISPERCPP_PORT} (model: ${currentModelPath})`,
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw new Error("Timed out waiting for whisper-server to become ready");
  }

  async function ensureRunning(variantHint?: string): Promise<void> {
    // If a different runtime than the running one is requested, recycle
    if (
      runningVariant &&
      variantHint &&
      runningVariant !== variantHint &&
      currentProcess
    ) {
      await stopServer("different runtime requested");
    }
    if (startupPromise) {
      await startupPromise;
      return;
    }
    startupPromise = startServerAttempt(variantHint).finally(() => {
      startupPromise = null;
    });
    await startupPromise;
  }

  function getStatus() {
    const packs = listInstalledVariants();
    return {
      engine: activeEngine,
      port: WHISPERCPP_PORT,
      variants: packs,
      models: listModels(),
      running: Boolean(currentProcess),
    };
  }

  function setEngine(engine: "python" | "whispercpp") {
    activeEngine = engine;
    if (engine !== "whispercpp") {
      // Free the cpp server when unused
      void stopServer("engine switched to python");
    }
  }

  function registerIPCHandlers() {
    ipcMain.handle(
      "whispercpp:setup:start",
      async (event: IpcMainInvokeEvent, options: { variantId: string }) => {
        if (setupActive) throw new Error("Setup already running");
        const promise = installVariant(options.variantId, event.sender).finally(
          () => {
            // refresh state
          },
        );
        // Don't block renderer: it listens for completion events.
        promise.catch(() => {});
        return { started: true };
      },
    );

    ipcMain.handle("whispercpp:getStatus", async () => getStatus());

    ipcMain.handle(
      "whispercpp:setEngine",
      (_event: IpcMainInvokeEvent, engine: "python" | "whispercpp") => {
        setEngine(engine);
        return { ok: true, engine: activeEngine };
      },
    );

    ipcMain.handle(
      "whispercpp:model:download",
      (event: IpcMainInvokeEvent, options: { modelId: string }) => {
        // Fire-and-forget with progress events (like backend installs)
        downloadModel(options.modelId, event.sender).catch((error) => {
          event.sender.send("whispercpp:model:complete", {
            id: options.modelId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return { started: true };
      },
    );

    ipcMain.handle(
      "whispercpp:model:delete",
      (_event: IpcMainInvokeEvent, options: { modelId: string }) =>
        deleteModel(options.modelId),
    );
  }

  function cleanupBeforeQuit() {
    void stopServer("app quit");
  }

  void processEnv; // reserved for future env overrides

  return {
    registerIPCHandlers,
    ensureRunning: (variantHint?: string) => ensureRunning(variantHint),
    restart: async () => {
      await stopServer("restart");
      await ensureRunning();
    },
    setEngine,
    isEngineActive: () => activeEngine === "whispercpp",
    getStatus,
    cleanupBeforeQuit,
  };
}
