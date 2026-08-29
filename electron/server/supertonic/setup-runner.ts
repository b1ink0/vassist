/**
 * @fileoverview Setup Runner - Orchestrates Supertonic 3 TTS installation.
 * Mirrors the whisper-stt setup-runner: embedded Python bootstrap + pip
 * install of the official supertonic package + one-time model download.
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import PythonBootstrap from "../gpt-sovits/bootstrap";
import type { ChildProcessWithoutNullStreams } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPT_DIR = __dirname;
const IS_WINDOWS = process.platform === "win32";

function getBaseDir(): string {
  return process.env.GPTSOVITS_DATA_DIR || SCRIPT_DIR;
}

function resolvePythonDir() {
  const baseDir = getBaseDir();
  const python312 = path.join(baseDir, "python312");
  const python = path.join(baseDir, "python");
  if (IS_WINDOWS && fs.existsSync(python312)) {
    return python312;
  }
  return python;
}

function resolveSitePackagesDirs(pythonDir: string): string[] {
  const sitePackages: string[] = [];

  if (IS_WINDOWS) {
    const winSitePackages = path.join(pythonDir, "Lib", "site-packages");
    if (fs.existsSync(winSitePackages)) {
      sitePackages.push(winSitePackages);
    }
    return sitePackages;
  }

  const libDir = path.join(pythonDir, "lib");
  if (!fs.existsSync(libDir)) {
    return sitePackages;
  }

  let pythonVersions: fs.Dirent[] = [];
  try {
    pythonVersions = fs.readdirSync(libDir, { withFileTypes: true });
  } catch {
    return sitePackages;
  }

  for (const entry of pythonVersions) {
    if (!entry.isDirectory() || !entry.name.startsWith("python")) {
      continue;
    }
    const candidate = path.join(libDir, entry.name, "site-packages");
    if (fs.existsSync(candidate)) {
      sitePackages.push(candidate);
    }
  }

  return sitePackages;
}

function moduleExists(sitePackagesDir: string, moduleName: string): boolean {
  const candidates = [
    path.join(sitePackagesDir, moduleName),
    path.join(sitePackagesDir, `${moduleName}.py`),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

class SupertonicSetupRunner {
  process: ChildProcessWithoutNullStreams | null;
  logCallback: ((logData: Record<string, unknown>) => void) | null;
  cancelled: boolean;

  constructor() {
    this.process = null;
    this.logCallback = null;
    this.cancelled = false;
  }

  getPythonExe() {
    const pythonDir = resolvePythonDir();
    if (IS_WINDOWS) {
      return path.join(pythonDir, "python.exe");
    }
    const py3Path = path.join(pythonDir, "bin", "python3");
    const pyPath = path.join(pythonDir, "bin", "python");
    return fs.existsSync(py3Path) ? py3Path : pyPath;
  }

  getSupertonicSetupDir() {
    const envDir = process.env.SUPERTONIC_SETUP_DIR;
    const fallbackRuntimeDir = path.join(
      path.dirname(getBaseDir()),
      "supertonic",
    );
    const candidateDirs = [envDir, fallbackRuntimeDir, SCRIPT_DIR].filter(
      (candidate): candidate is string => Boolean(candidate),
    );

    for (const candidate of candidateDirs) {
      try {
        if (candidate.includes(".asar")) {
          continue;
        }
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          return candidate;
        }
      } catch {
        // Ignore invalid candidate and continue fallback chain.
      }
    }

    // Ensure a writable runtime fallback exists.
    fs.mkdirSync(fallbackRuntimeDir, { recursive: true });
    return fallbackRuntimeDir;
  }

  hasModelArtifacts() {
    // The supertonic package caches model assets under ~/.cache/supertonic3
    // (or %USERPROFILE%\.cache\supertonic3 on Windows).
    const home = process.env.USERPROFILE || process.env.HOME;
    if (!home) return false;
    const cacheDir = path.join(home, ".cache", "supertonic3");
    if (!fs.existsSync(cacheDir)) return false;

    // Any ONNX asset or voice style present counts as downloaded.
    const markers = ["onnx", "voice_styles"];
    return markers.some((marker) => fs.existsSync(path.join(cacheDir, marker)));
  }

  checkDependenciesInstalledFilesystem() {
    const pythonDir = resolvePythonDir();
    if (!fs.existsSync(pythonDir)) {
      return false;
    }

    const sitePackagesDirs = resolveSitePackagesDirs(pythonDir);
    if (sitePackagesDirs.length === 0) {
      return false;
    }

    const requiredModules = ["supertonic", "onnxruntime", "soundfile"];

    return sitePackagesDirs.some((sitePackagesDir) =>
      requiredModules.every((moduleName) =>
        moduleExists(sitePackagesDir, moduleName),
      ),
    );
  }

  getStatus() {
    const pythonDir = resolvePythonDir();
    const pythonExists =
      fs.existsSync(pythonDir) && fs.existsSync(this.getPythonExe());
    const dependenciesInstalled = this.checkDependenciesInstalledFilesystem();
    const modelExists = this.hasModelArtifacts();

    return {
      isSetup: pythonExists && dependenciesInstalled && modelExists,
      pythonExists,
      dependenciesInstalled,
      modelExists,
    };
  }

  async bootstrap() {
    this.log({
      type: "info",
      message: "\n=== PHASE 1: PYTHON BOOTSTRAP ===\n",
    });

    const bootstrap = new PythonBootstrap((message: string) => {
      this.log({ type: "stdout", message: `${message}\n` });
    });

    await bootstrap.run();
  }

  async runSetup() {
    this.log({
      type: "info",
      message: "\n=== PHASE 2: SUPERTONIC PACKAGE & MODEL ===\n",
    });

    const pythonExe = this.getPythonExe();
    const setupDir = this.getSupertonicSetupDir();
    const setupScript = path.join(setupDir, "setup.py");

    if (!fs.existsSync(pythonExe)) {
      throw new Error(
        "Python executable not found. Bootstrap may have failed.",
      );
    }

    if (!fs.existsSync(setupScript)) {
      throw new Error(`Supertonic setup.py not found at ${setupScript}`);
    }

    return new Promise<void>((resolve, reject) => {
      this.process = spawn(pythonExe, [setupScript], {
        cwd: setupDir,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          PYTHONIOENCODING: "utf-8",
          GPTSOVITS_DATA_DIR: getBaseDir(),
          SUPERTONIC_SETUP_DIR: setupDir,
          HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
          HF_HUB_DISABLE_XET: "1",
        },
      });

      this.process.stdout.on("data", (data: Buffer) => {
        if (this.cancelled) return;
        this.log({ type: "stdout", message: data.toString() });
      });

      this.process.stderr.on("data", (data: Buffer) => {
        if (this.cancelled) return;
        this.log({ type: "stderr", message: data.toString() });
      });

      this.process.on("close", (code: number | null) => {
        this.process = null;

        if (this.cancelled) {
          reject(new Error("Setup cancelled by user"));
        } else if (code === 0) {
          this.log({
            type: "info",
            message: "\nSupertonic setup completed successfully!\n",
          });
          resolve();
        } else {
          reject(new Error(`Supertonic setup failed with exit code ${code}`));
        }
      });

      this.process.on("error", (err: Error) => {
        this.process = null;
        reject(err);
      });
    });
  }

  async run(
    logCallback: (logData: Record<string, unknown>) => void,
    _options: { model?: string } = {},
  ) {
    this.logCallback = logCallback;
    this.cancelled = false;

    try {
      this.log({ type: "info", message: "=".repeat(60) + "\n" });
      this.log({
        type: "info",
        message: "Supertonic TTS Installation Starting\n",
      });
      this.log({
        type: "info",
        message:
          "This installs the Supertonic-3 engine and downloads its ~400MB model\n",
      });
      this.log({ type: "info", message: "=".repeat(60) + "\n\n" });

      if (!fs.existsSync(resolvePythonDir())) {
        await this.bootstrap();
      } else {
        this.log({
          type: "info",
          message: "[BOOTSTRAP] Python already installed, skipping\n",
        });
      }

      if (this.cancelled) {
        throw new Error("Setup cancelled during bootstrap");
      }

      await this.runSetup();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log({ type: "error", message: `\nSetup failed: ${message}\n` });
      throw error;
    }
  }

  cancel() {
    this.cancelled = true;

    if (this.process) {
      this.log({ type: "info", message: "\nCancelling setup...\n" });
      this.process.kill();
      this.process = null;
    }
  }

  log(logData: Record<string, unknown>) {
    if (this.logCallback) {
      this.logCallback(logData);
    }
  }
}

export default SupertonicSetupRunner;
