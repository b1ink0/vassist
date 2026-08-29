/**
 * @fileoverview llama-server runtime + process manager for VAssist Desktop.
 *
 * Stateless request-scoped design (same pattern as STT/TTS):
 * - The gateway (:11438) carries model/backend/context per request.
 * - Runtime packs download on demand from a PINNED qualified build
 *   (never "latest"), SHA-256 verified when the manifest provides digests.
 * - One llama-server process serves the currently requested model on a
 *   private port (11439); switching models recycles the process.
 * - llama-server's native idle sleep unloads the model and KV cache after
 *   five minutes without requests while keeping the lightweight server alive.
 *
 * node-llama-cpp remains fully functional and untouched; selection between
 * engines is data-driven (desktop-local.llmEngine).
 */

import { spawn } from "child_process";
import * as crypto from "crypto";
import { once } from "events";
import type * as fs from "fs";
import type * as path from "path";
import * as tar from "tar";
import unzipper from "unzipper";

/**
 * Qualified llama.cpp runtime pin. To upgrade: pick a new upstream tag,
 * refresh filenames/digests from the GitHub release API, re-qualify
 * text+SSE+images per backend. {b} expands to the build id.
 */
const RUNTIME_MANIFEST = {
  version: 1,
  build: "b10622",
  targets: {
    "win-x64": {
      cpu: ["llama-{b}-bin-win-cpu-x64.zip"],
      vulkan: ["llama-{b}-bin-win-vulkan-x64.zip"],
      cuda: [
        "llama-{b}-bin-win-cuda-12.4-x64.zip",
        "cudart-llama-bin-win-cuda-12.4-x64.zip",
      ],
      rocm: ["llama-{b}-bin-win-rocm-7.14-x64.zip"],
    },
    "linux-x64": {
      cpu: ["llama-{b}-bin-ubuntu-x64.tar.gz"],
      vulkan: ["llama-{b}-bin-ubuntu-vulkan-x64.tar.gz"],
      rocm: ["llama-{b}-bin-ubuntu-rocm-7.14-x64.tar.gz"],
    },
    "mac-arm64": { metal: ["llama-{b}-bin-macos-arm64.tar.gz"] },
  },
  sha256: {
    "llama-b10622-bin-win-cpu-x64.zip":
      "0f016b001d00a0cc25b955a5ae5eb3ce57a0b16adaa9142f8a3c3269e83fce0a",
    "llama-b10622-bin-win-vulkan-x64.zip":
      "e64d310d188fb21c077a76bc94875c619fe938c775226cdf8a51c65d47bd0f14",
    "llama-b10622-bin-win-cuda-12.4-x64.zip":
      "3fc1ed135d57516489173c7256fce40edfdd2900a3a3715a1c9bffc980a705ff",
    "cudart-llama-bin-win-cuda-12.4-x64.zip":
      "8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6",
    "llama-b10622-bin-win-rocm-7.14-x64.zip":
      "c8fe3711eab57a195bdb7c9a54e41f6eda9b3676030638b521f267caba2f4425",
    "llama-b10622-bin-ubuntu-x64.tar.gz":
      "6cc895c67bfa868faccda8aca06ec136e489609fc20f068550214f149d94fb4c",
    "llama-b10622-bin-ubuntu-vulkan-x64.tar.gz":
      "2e9a07037f1aa89f9ccd85acc6a376c503a369e3feb916b42d8e9a1542c8828e",
    "llama-b10622-bin-ubuntu-rocm-7.14-x64.tar.gz":
      "9413059a188a32a3eac0068f78418a2427ddcdff6248efef0e604c0a65571d14",
    "llama-b10622-bin-macos-arm64.tar.gz":
      "c0116ec9957477a9c77e68d3cf31e79f9aede1a9210861c7c09d74acc3e9c3cf",
  } as Record<string, string>,
};

const LLAMA_PORT = 11439;
const ACTIVE_MODEL_ID = "vassist-active";
const IDLE_SLEEP_SECONDS = 5 * 60;
const PROCESS_EXIT_TIMEOUT_MS = 10_000;
const REQUEST_DRAIN_TIMEOUT_MS = 5 * 60 * 1000;

type LlamaBackend = "cpu" | "metal" | "vulkan" | "cuda" | "rocm";
const LLAMA_BACKENDS: readonly LlamaBackend[] = [
  "cpu",
  "metal",
  "vulkan",
  "cuda",
  "rocm",
];

interface ManifestTarget {
  [backend: string]: string[]; // archive filename templates
}

interface LlamaRuntimeManifest {
  version: number;
  build: string;
  targets: Record<string, ManifestTarget>;
  sha256?: Record<string, string>;
}

interface LaunchRequest {
  modelPath: string;
  mmprojPath?: string;
  ctxSize?: number;
  backend?: LlamaBackend | "auto";
}

export function createLlamaServerManager({
  fs: fsMod,
  path: pathMod,
  app,
}: {
  fs: typeof fs;
  path: typeof path;
  app: { getPath: (name: string) => string };
}) {
  const fs = fsMod;
  const path = pathMod;

  let currentProcess: ChildLike | null = null;
  let runningSignature: string | null = null;
  let currentModelId: string | null = null;
  let activeRequests = 0;
  let installing = false;
  let lifecycleQueue: Promise<void> = Promise.resolve();
  const requestDrainWaiters = new Set<() => void>();

  type ChildLike = {
    pid?: number;
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

  function getPlatformKey(): "win-x64" | "linux-x64" | "mac-arm64" {
    if (process.platform === "win32" && process.arch === "x64") {
      return "win-x64";
    }
    if (process.platform === "linux" && process.arch === "x64") {
      return "linux-x64";
    }
    if (process.platform === "darwin" && process.arch === "arm64") {
      return "mac-arm64";
    }
    throw new Error(
      `llama-server runtime packs do not support ${process.platform}-${process.arch}`,
    );
  }

  function getRuntimesRoot() {
    return path.join(app.getPath("userData"), "llama-runtimes");
  }

  function getBuildDir() {
    return path.join(getRuntimesRoot(), RUNTIME_MANIFEST.build);
  }

  function getActivePresetPath() {
    return path.join(getBuildDir(), "active-model.ini");
  }

  function getBackendDir(backend: LlamaBackend) {
    const platformKey = getPlatformKey();
    return path.join(getBuildDir(), `${platformKey}-${backend}`);
  }

  function assertBackend(value: string): asserts value is LlamaBackend {
    if (!LLAMA_BACKENDS.includes(value as LlamaBackend)) {
      throw new Error(`Unsupported llama.cpp backend: ${value}`);
    }
  }

  function findServerExe(dir: string): string | null {
    const candidates =
      process.platform === "win32"
        ? [
            path.join(dir, "llama-server.exe"),
            path.join(dir, "build", "bin", "llama-server.exe"),
          ]
        : [
            path.join(dir, "llama-server"),
            path.join(dir, "build", "bin", "llama-server"),
          ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return null;
  }

  async function downloadFile(
    url: string,
    destination: string,
    expectedSha256: string | undefined,
    onBytes?: (received: number, total: number) => void,
  ): Promise<void> {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
    }
    const total = Number(response.headers.get("content-length") || 0);
    const writer = fs.createWriteStream(destination);
    const writerFailed = new Promise<never>((_resolve, reject) => {
      writer.once("error", reject);
    });
    const hash = crypto.createHash("sha256");
    let received = 0;
    let lastEmit = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        const buf = Buffer.from(chunk);
        hash.update(buf);
        received += buf.length;
        if (!writer.write(buf)) {
          await Promise.race([once(writer, "drain"), writerFailed]);
        }
        const now = Date.now();
        if (onBytes && now - lastEmit > 250) {
          lastEmit = now;
          onBytes(received, total);
        }
      }
      const finished = once(writer, "finish");
      writer.end();
      await Promise.race([finished, writerFailed]);
    } catch (error) {
      writer.destroy();
      fs.rmSync(destination, { force: true });
      throw error;
    }
    if (onBytes) onBytes(received, total || received);
    const actual = hash.digest("hex");
    if (expectedSha256 && actual !== expectedSha256.toLowerCase()) {
      fs.rmSync(destination, { force: true });
      throw new Error(
        `SHA-256 mismatch: expected ${expectedSha256}, got ${actual}. Aborting install.`,
      );
    }
  }

  async function extractArchive(
    archivePath: string,
    destDir: string,
  ): Promise<void> {
    fs.mkdirSync(destDir, { recursive: true });
    if (archivePath.endsWith(".tar.gz")) {
      await (tar as any).x({ file: archivePath, cwd: destDir });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(archivePath)
        .pipe(unzipper.Extract({ path: destDir }))
        .on("close", () => resolve())
        .on("error", reject);
    });
  }

  /** Resolve the llama-server executable for an INSTALLED backend. */
  async function ensureRuntime(backend: LlamaBackend): Promise<string> {
    const exe = findServerExe(getBackendDir(backend));
    if (!exe) {
      throw new Error(
        `llama.cpp ${RUNTIME_MANIFEST.build}/${backend} runtime not installed`,
      );
    }
    return exe;
  }

  /**
   * Download + verify + extract all archives for a backend. Called via IPC
   * (renderer-driven install with progress), never implicitly per-request.
   */
  async function installBackend(
    backend: string,
    sender?: {
      send: (channel: string, payload: unknown) => void;
    } | null,
  ): Promise<void> {
    assertBackend(backend);
    if (installing) {
      throw new Error(
        "A llama.cpp runtime installation is already in progress",
      );
    }
    const platformKey = getPlatformKey();
    const target = (
      RUNTIME_MANIFEST.targets as Record<string, Record<string, string[]>>
    )[platformKey]?.[backend];
    if (!target) {
      throw new Error(
        `No ${backend} runtime pack for ${platformKey} in manifest build ${RUNTIME_MANIFEST.build}`,
      );
    }

    installing = true;
    const sendLog = (message: unknown, type = "stdout") =>
      sender?.send("llamaServer:installLog", { type, message });
    const destDir = getBackendDir(backend);
    const installDir = `${destDir}.installing-${process.pid}-${Date.now()}`;
    const backupDir = `${destDir}.previous`;

    try {
      const buildDir = getBuildDir();
      fs.mkdirSync(buildDir, { recursive: true });
      fs.rmSync(installDir, { recursive: true, force: true });
      const b = RUNTIME_MANIFEST.build;

      // Weight each archive equally so percent spans the whole install
      const perArchive = 100 / target.length;

      for (let i = 0; i < target.length; i++) {
        const template: string | undefined = target[i];
        if (!template) continue;
        const filename = template.replace(/\{b\}/g, b);
        const url = `https://github.com/ggml-org/llama.cpp/releases/download/${b}/${filename}`;
        sendLog(`[LlamaServer] Downloading ${filename}...`);

        const archivePath = path.join(
          buildDir,
          `.download-${process.pid}-${filename}`,
        );
        const expected = RUNTIME_MANIFEST.sha256[filename];
        const basePercent = i * perArchive;
        await downloadFile(url, archivePath, expected, (received, total) => {
          const frac = total ? received / total : 0;
          sender?.send("llamaServer:installProgress", {
            percent: Math.round(basePercent + frac * perArchive),
            status: `Downloading ${filename} (${(received / 1024 / 1024).toFixed(1)}${
              total ? ` / ${(total / 1024 / 1024).toFixed(1)} MB` : " MB"
            })`,
          });
        });

        if (expected) {
          sendLog(`[LlamaServer] SHA-256 verified: ${filename}`);
        } else {
          sendLog(
            `[LlamaServer] WARNING: no sha256 pinned for ${filename}; skipping verification`,
          );
        }

        onProgressSafe(sender, {
          percent: Math.round((i + 1) * perArchive),
          status: `Extracting ${filename}...`,
        });

        try {
          await extractArchive(archivePath, installDir);
        } finally {
          fs.rmSync(archivePath, { force: true });
        }
      }

      const pendingExe = findServerExe(installDir);
      if (!pendingExe) {
        throw new Error(
          "llama-server binary not found after extraction — pack layout changed?",
        );
      }
      fs.rmSync(backupDir, { recursive: true, force: true });
      if (fs.existsSync(destDir)) fs.renameSync(destDir, backupDir);
      try {
        fs.renameSync(installDir, destDir);
      } catch (error) {
        if (fs.existsSync(backupDir) && !fs.existsSync(destDir)) {
          fs.renameSync(backupDir, destDir);
        }
        throw error;
      }
      fs.rmSync(backupDir, { recursive: true, force: true });
      const exe = findServerExe(destDir);
      if (!exe) {
        throw new Error(
          "llama-server binary not found after extraction — pack layout changed?",
        );
      }
      if (process.platform !== "win32") {
        try {
          fs.chmodSync(exe, 0o755);
        } catch {
          // best effort
        }
      }
      sendLog("[LlamaServer] Install complete.");
      sender?.send("llamaServer:installComplete", { success: true, backend });
    } catch (error) {
      fs.rmSync(installDir, { recursive: true, force: true });
      if (fs.existsSync(backupDir) && !fs.existsSync(destDir)) {
        fs.renameSync(backupDir, destDir);
      }
      const message = error instanceof Error ? error.message : String(error);
      sendLog(`[LlamaServer] Install failed: ${message}`, "stderr");
      sender?.send("llamaServer:installComplete", {
        success: false,
        error: message,
      });
      throw error;
    } finally {
      installing = false;
    }
  }

  function onProgressSafe(
    sender: { send: (c: string, p: unknown) => void } | null | undefined,
    info: { percent: number; status: string },
  ) {
    sender?.send("llamaServer:installProgress", info);
  }

  // ── Process lifecycle ────────────────────────────────────────────────

  async function isHealthy(timeoutMs = 2000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`http://127.0.0.1:${LLAMA_PORT}/health`, {
        signal: controller.signal,
      });
      return res.status === 200;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function serverJson(
    route: string,
    init?: RequestInit,
    timeoutMs = 10_000,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`http://127.0.0.1:${LLAMA_PORT}${route}`, {
        ...init,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `llama-server ${route} failed (${response.status})${text ? `: ${text}` : ""}`,
        );
      }
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadModel(modelId: string): Promise<void> {
    await serverJson("/models/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId }),
    });

    const startedAt = Date.now();
    while (Date.now() - startedAt < 300_000) {
      const payload = (await serverJson("/models")) as {
        data?: Array<{
          id?: string;
          status?: { value?: string; failed?: boolean; exit_code?: number };
        }>;
      };
      const model = payload.data?.find((entry) => entry.id === modelId);
      const state = model?.status?.value;
      if (state === "loaded" || state === "sleeping") return;
      if (model?.status?.failed) {
        throw new Error(
          `llama-server failed to load ${modelId} (exit code ${model.status.exit_code ?? "unknown"})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for llama-server to load ${modelId}`);
  }

  async function unloadCurrentModel(): Promise<void> {
    const modelId = currentModelId;
    if (!modelId || !(await isHealthy())) return;
    try {
      await serverJson(
        "/models/unload",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelId }),
        },
        45_000,
      );
      console.log(
        `[LlamaServer] Unloaded model through router API: ${modelId}`,
      );
    } catch (error) {
      console.warn("[LlamaServer] Model unload failed before shutdown:", error);
    } finally {
      currentModelId = null;
    }
  }

  function hasExited(proc: ChildLike): boolean {
    return proc.exitCode !== null || proc.signalCode !== null;
  }

  async function waitForExit(
    proc: ChildLike,
    timeoutMs: number,
  ): Promise<boolean> {
    if (hasExited(proc)) return true;
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (exited: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(exited);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      proc.on("exit", () => finish(true));
    });
  }

  async function waitForRequestsToDrain(): Promise<void> {
    if (activeRequests === 0) return;
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        requestDrainWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(() => {
        requestDrainWaiters.delete(done);
        reject(
          new Error(
            `Timed out waiting for ${activeRequests} llama-server request(s) to finish`,
          ),
        );
      }, REQUEST_DRAIN_TIMEOUT_MS);
      requestDrainWaiters.add(done);
    });
  }

  async function stopLocked(reason = "requested", drain = true) {
    if (drain) await waitForRequestsToDrain();
    const proc = currentProcess;
    if (!proc) {
      runningSignature = null;
      currentModelId = null;
      return;
    }

    console.log(`[LlamaServer] Stopping (${reason})`);
    await unloadCurrentModel();
    if (process.platform !== "win32") {
      try {
        proc.kill("SIGTERM");
      } catch {
        // The exit event below remains the source of truth.
      }
      if (await waitForExit(proc, PROCESS_EXIT_TIMEOUT_MS)) return;
      console.warn("[LlamaServer] Graceful shutdown timed out; forcing exit");
    }

    // Node cannot send a console Ctrl+C to a Windows child. SIGINT and
    // SIGTERM are abrupt there, so forced termination is reserved for an
    // explicit model/runtime/app transition. Native idle sleep never uses it.
    try {
      proc.kill("SIGKILL");
    } catch {
      // best effort
    }
    await waitForExit(proc, PROCESS_EXIT_TIMEOUT_MS);
    if (currentProcess === proc) {
      currentProcess = null;
      runningSignature = null;
      currentModelId = null;
    }
  }

  function enqueueLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const result = lifecycleQueue.then(operation, operation);
    lifecycleQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function stop(reason = "requested") {
    return enqueueLifecycle(() => stopLocked(reason));
  }

  function markRequestComplete() {
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests === 0) {
      for (const resolve of requestDrainWaiters) resolve();
      requestDrainWaiters.clear();
    }
  }

  /** Find an mmproj gguf next to the model file (VLM support). */
  function findMmproj(modelPath: string): string | undefined {
    const dir = path.dirname(modelPath);
    const base = path.basename(modelPath).toLowerCase();
    try {
      const entries = fs.readdirSync(dir);
      // Prefer a projector whose name shares the model prefix
      const prefix = base.split("-").slice(0, 2).join("-");
      const isMmprojName = (e: string) => e.toLowerCase().startsWith("mmproj");
      const match = entries.find(
        (e: string) =>
          isMmprojName(e) &&
          e.toLowerCase().includes(String(prefix.split("-")[0] ?? "")),
      );
      const anyMmproj =
        match || entries.find((e: string) => /^mmproj/i.test(e));
      return anyMmproj ? path.join(dir, anyMmproj) : undefined;
    } catch {
      return undefined;
    }
  }

  function writeActiveModelPreset(req: LaunchRequest): string {
    const presetPath = getActivePresetPath();
    const mmproj = req.mmprojPath ?? findMmproj(req.modelPath);
    const iniPath = (value: string) => value.replace(/\\/g, "/");
    const lines = [
      "version = 1",
      "",
      `[${ACTIVE_MODEL_ID}]`,
      `model = ${iniPath(req.modelPath)}`,
      "load-on-startup = false",
      "stop-timeout = 30",
    ];
    if (mmproj) {
      lines.push(`mmproj = ${iniPath(mmproj)}`);
      console.log("[LlamaServer] Vision projector:", mmproj);
    }
    fs.mkdirSync(path.dirname(presetPath), { recursive: true });
    fs.writeFileSync(presetPath, `${lines.join("\n")}\n`, "utf8");
    return presetPath;
  }

  function getEnvironmentValue(
    env: NodeJS.ProcessEnv,
    name: string,
  ): string | undefined {
    const key = Object.keys(env).find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase(),
    );
    return key ? env[key] : undefined;
  }

  function setEnvironmentValue(
    env: NodeJS.ProcessEnv,
    name: string,
    value: string,
  ) {
    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === name.toLowerCase()) delete env[key];
    }
    env[name] = value;
  }

  function findWindowsRocmRoot(runtimeDir: string): string | null {
    const envRoots = [
      getEnvironmentValue(process.env, "HIP_PATH"),
      getEnvironmentValue(process.env, "ROCM_PATH"),
    ].filter((value): value is string => Boolean(value));
    const conventionalRoots = [
      path.join("C:\\", "TheRock", "build"),
      path.join("C:\\", "hip"),
    ];
    const programFiles = getEnvironmentValue(process.env, "ProgramFiles");
    if (programFiles) {
      const legacyRoot = path.join(programFiles, "AMD", "ROCm");
      try {
        const versions = fs
          .readdirSync(legacyRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        conventionalRoots.push(
          ...versions.map((version) => path.join(legacyRoot, version)),
        );
      } catch {
        // Legacy HIP SDK is optional.
      }
    }

    const pathRoots = (getEnvironmentValue(process.env, "PATH") ?? "")
      .split(path.delimiter)
      .filter(Boolean)
      .map((entry) =>
        path.basename(entry).toLowerCase() === "bin"
          ? path.dirname(entry)
          : entry,
      );
    const candidates = [
      runtimeDir,
      ...envRoots,
      ...pathRoots,
      ...conventionalRoots,
    ];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const normalized = path.resolve(candidate);
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (
        [
          path.join(normalized, "hipblas.dll"),
          path.join(normalized, "bin", "hipblas.dll"),
        ].some((file) => fs.existsSync(file))
      ) {
        return normalized;
      }
    }
    return null;
  }

  function createChildEnvironment(
    backend: LlamaBackend,
    runtimeDir: string,
  ): NodeJS.ProcessEnv {
    const childEnv = { ...process.env };
    if (backend !== "rocm" || process.platform !== "win32") return childEnv;

    const rocmRoot = findWindowsRocmRoot(runtimeDir);
    if (!rocmRoot) {
      throw new Error(
        "ROCm dependency hipblas.dll was not found. Install AMD ROCm 7.14, set HIP_PATH to its extracted root, and restart VAssist.",
      );
    }

    const searchPaths = [
      runtimeDir,
      rocmRoot,
      path.join(rocmRoot, "bin"),
      path.join(rocmRoot, "lib", "llvm", "bin"),
    ].filter((entry) => fs.existsSync(entry));
    const existingPath = (getEnvironmentValue(childEnv, "PATH") ?? "")
      .split(path.delimiter)
      .filter(Boolean);
    setEnvironmentValue(
      childEnv,
      "PATH",
      [...new Set([...searchPaths, ...existingPath])].join(path.delimiter),
    );
    setEnvironmentValue(childEnv, "HIP_PATH", rocmRoot);
    setEnvironmentValue(childEnv, "HIP_PLATFORM", "amd");
    const deviceLibPath = path.join(
      rocmRoot,
      "lib",
      "llvm",
      "amdgcn",
      "bitcode",
    );
    if (fs.existsSync(deviceLibPath)) {
      setEnvironmentValue(childEnv, "HIP_DEVICE_LIB_PATH", deviceLibPath);
    }
    console.log(`[LlamaServer] Using ROCm runtime: ${rocmRoot}`);
    return childEnv;
  }

  /**
   * Stateless ensure: given the launch request, recycle the server only when
   * the signature (model+mmproj+ctx+runtime) differs from what's running.
   */
  async function ensureForRequestLocked(req: LaunchRequest): Promise<string> {
    const wanted = req.backend ?? "auto";
    if (wanted !== "auto") assertBackend(wanted);
    const candidates: LlamaBackend[] =
      wanted === "auto"
        ? process.platform === "darwin"
          ? ["metal", "cpu"]
          : process.platform === "win32"
            ? ["cuda", "rocm", "vulkan", "cpu"]
            : ["rocm", "vulkan", "cpu"]
        : [wanted];

    let resolved: {
      exe: string;
      backend: LlamaBackend;
      env: NodeJS.ProcessEnv;
    } | null = null;
    const resolutionErrors: Error[] = [];
    for (const candidate of candidates) {
      try {
        const exe = await ensureRuntime(candidate);
        // Validate external dependencies (notably the Windows ROCm/HIP SDK)
        // before selecting a backend. Auto mode can then fall back to Vulkan
        // or CPU instead of failing after an unusable runtime was selected.
        const env = createChildEnvironment(candidate, path.dirname(exe));
        resolved = { exe, backend: candidate, env };
        break;
      } catch (error) {
        resolutionErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
        // not installed — try next candidate
      }
    }
    if (!resolved) {
      if (wanted !== "auto" && resolutionErrors.length > 0) {
        throw resolutionErrors[resolutionErrors.length - 1];
      }
      throw new Error(
        "No llama.cpp runtime installed for the requested backend. Install one from settings.",
      );
    }
    const { exe, backend, env: childEnv } = resolved;

    const signature = JSON.stringify([
      req.modelPath,
      req.mmprojPath ?? null,
      req.ctxSize ?? null,
      RUNTIME_MANIFEST.build,
      backend,
    ]);
    if (
      currentProcess &&
      runningSignature === signature &&
      (await isHealthy())
    ) {
      activeRequests += 1;
      return ACTIVE_MODEL_ID;
    }

    await stopLocked("model or runtime changed");

    const presetPath = writeActiveModelPreset(req);
    const args = [
      "--host",
      "127.0.0.1",
      "--port",
      String(LLAMA_PORT),
      "--ctx-size",
      String(req.ctxSize ?? 4096),
      "--sleep-idle-seconds",
      String(IDLE_SLEEP_SECONDS),
      "--models-preset",
      presetPath,
      "--no-webui",
    ];

    console.log("[LlamaServer] Spawning:", exe, args.join(" "));
    const child = spawn(exe, args, {
      cwd: path.dirname(exe),
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }) as unknown as ChildLike;
    currentProcess = child;
    runningSignature = signature;

    child.stdout.on("data", (d: Buffer) =>
      console.log(`[LlamaServer] ${d.toString().trim()}`),
    );
    child.stderr.on("data", (d: Buffer) =>
      console.error(`[LlamaServer] ${d.toString().trim()}`),
    );
    child.on("error", (err: Error) => {
      console.error("[LlamaServer] start failed:", err);
      if (currentProcess === child) {
        currentProcess = null;
        runningSignature = null;
        currentModelId = null;
      }
    });
    child.on("exit", (code, signal) => {
      console.log(`[LlamaServer] exited code=${code} signal=${signal}`);
      if (currentProcess === child) {
        currentProcess = null;
        runningSignature = null;
        currentModelId = null;
      }
    });

    // Router health becomes ready before its model child is loaded.
    const startedAt = Date.now();
    while (Date.now() - startedAt < 300000) {
      if (currentProcess !== child) {
        throw new Error("llama-server exited during model load");
      }
      if (await isHealthy()) {
        currentModelId = ACTIVE_MODEL_ID;
        try {
          await loadModel(ACTIVE_MODEL_ID);
        } catch (error) {
          await stopLocked("model load failed", false);
          throw error;
        }
        console.log(
          `[LlamaServer] Ready on :${LLAMA_PORT} backend=${backend} model=${req.modelPath}`,
        );
        activeRequests += 1;
        return ACTIVE_MODEL_ID;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    await stopLocked("model load timed out", false);
    throw new Error("Timed out waiting for llama-server to load the model");
  }

  function ensureForRequest(req: LaunchRequest): Promise<string> {
    return enqueueLifecycle(() => ensureForRequestLocked(req));
  }

  function deleteBackend(backend: string): Promise<void> {
    assertBackend(backend);
    return enqueueLifecycle(async () => {
      await stopLocked("backend deleted");
      const dir = getBackendDir(backend);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[LlamaServer] Deleted runtime: ${dir}`);
      }
    });
  }

  function getStatus() {
    return {
      build: RUNTIME_MANIFEST.build,
      platformKey: getPlatformKey(),
      installedBackends: Object.entries(RUNTIME_MANIFEST.targets)
        .flatMap(([platformKey, targetEntry]) =>
          Object.keys(targetEntry ?? {})
            .map((backend) => {
              const platformMatch =
                (process.platform === "win32" && platformKey === "win-x64") ||
                (process.platform === "linux" && platformKey === "linux-x64") ||
                (process.platform === "darwin" && platformKey === "mac-arm64");
              return platformMatch ? backend : null;
            })
            .filter(Boolean),
        )
        .filter((backend) =>
          Boolean(findServerExe(getBackendDir(backend as LlamaBackend))),
        ),
      running: Boolean(currentProcess),
      runningModel: runningSignature,
      port: LLAMA_PORT,
      installing,
    };
  }

  return {
    ensureForRequest,
    installBackend,
    deleteBackend,
    stop,
    restart: async () => {
      await stop("restart");
    },
    markRequestComplete,
    getStatus,
    isHealthy,
  };
}
