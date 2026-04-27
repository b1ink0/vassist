/**
 * @fileoverview Setup Runner - Orchestrates Whisper-only STT installation
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import PythonBootstrap from '../gpt-sovits/bootstrap';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPT_DIR = __dirname;
const BASE_DIR = process.env.GPTSOVITS_DATA_DIR || SCRIPT_DIR;
const IS_WINDOWS = process.platform === 'win32';

function resolvePythonDir() {
  const python312 = path.join(BASE_DIR, 'python312');
  const python = path.join(BASE_DIR, 'python');
  if (IS_WINDOWS && fs.existsSync(python312)) {
    return python312;
  }
  return python;
}

function resolveSitePackagesDirs(pythonDir) {
  const sitePackages = [];

  if (IS_WINDOWS) {
    const winSitePackages = path.join(pythonDir, 'Lib', 'site-packages');
    if (fs.existsSync(winSitePackages)) {
      sitePackages.push(winSitePackages);
    }
    return sitePackages;
  }

  const libDir = path.join(pythonDir, 'lib');
  if (!fs.existsSync(libDir)) {
    return sitePackages;
  }

  let pythonVersions = [];
  try {
    pythonVersions = fs.readdirSync(libDir, { withFileTypes: true });
  } catch {
    return sitePackages;
  }

  for (const entry of pythonVersions) {
    if (!entry.isDirectory() || !entry.name.startsWith('python')) {
      continue;
    }
    const candidate = path.join(libDir, entry.name, 'site-packages');
    if (fs.existsSync(candidate)) {
      sitePackages.push(candidate);
    }
  }

  return sitePackages;
}

function moduleExists(sitePackagesDir, moduleName) {
  const candidates = [
    path.join(sitePackagesDir, moduleName),
    path.join(sitePackagesDir, `${moduleName}.py`),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

class WhisperSetupRunner {
  constructor() {
    this.process = null;
    this.logCallback = null;
    this.cancelled = false;
    this.model = 'tiny';
  }

  getPythonExe() {
    const pythonDir = resolvePythonDir();
    if (IS_WINDOWS) {
      return path.join(pythonDir, 'python.exe');
    }
    const py3Path = path.join(pythonDir, 'bin', 'python3');
    const pyPath = path.join(pythonDir, 'bin', 'python');
    return fs.existsSync(py3Path) ? py3Path : pyPath;
  }

  getWhisperModelDir() {
    return path.join(path.dirname(BASE_DIR), 'models', 'whisper');
  }

  getWhisperSetupDir() {
    const envDir = process.env.WHISPER_SETUP_DIR;
    const fallbackRuntimeDir = path.join(path.dirname(BASE_DIR), 'whisper-stt');
    const candidateDirs = [envDir, fallbackRuntimeDir, SCRIPT_DIR].filter(Boolean);

    for (const candidate of candidateDirs) {
      try {
        if (candidate.includes('.asar')) {
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

  hasWhisperModelArtifacts() {
    const modelDir = this.getWhisperModelDir();
    if (!fs.existsSync(modelDir)) {
      return false;
    }

    // Keep status checks lightweight: inspect a small, predictable subset of paths.
    let rootEntries = [];
    try {
      rootEntries = fs.readdirSync(modelDir, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of rootEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      // Direct named model folders (some deployments use this layout).
      if (['tiny', 'tiny.en', 'base', 'base.en'].includes(entry.name)) {
        return true;
      }

      // Hugging Face cache layout: models--<org>--<repo>/snapshots/<hash>/model.bin
      if (!entry.name.startsWith('models--')) {
        continue;
      }

      const hfModelRoot = path.join(modelDir, entry.name);
      const snapshotsDir = path.join(hfModelRoot, 'snapshots');
      const refsDir = path.join(hfModelRoot, 'refs');

      if (fs.existsSync(refsDir)) {
        return true;
      }

      if (!fs.existsSync(snapshotsDir)) {
        continue;
      }

      let snapshots = [];
      try {
        snapshots = fs.readdirSync(snapshotsDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const snapshot of snapshots) {
        if (!snapshot.isDirectory()) {
          continue;
        }

        const snapshotDir = path.join(snapshotsDir, snapshot.name);
        const hasCoreArtifact =
          fs.existsSync(path.join(snapshotDir, 'model.bin')) ||
          fs.existsSync(path.join(snapshotDir, 'config.json')) ||
          fs.existsSync(path.join(snapshotDir, 'tokenizer.json'));

        if (hasCoreArtifact) {
          return true;
        }
      }
    }

    return false;
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

    const requiredModules = ['fastapi', 'uvicorn', 'faster_whisper', 'ctranslate2', 'av', 'soundfile'];

    // Any valid site-packages layout that contains all required modules is accepted.
    return sitePackagesDirs.some((sitePackagesDir) =>
      requiredModules.every((moduleName) => moduleExists(sitePackagesDir, moduleName))
    );
  }

  getStatus() {
    const pythonDir = resolvePythonDir();
    const pythonExists = fs.existsSync(pythonDir) && fs.existsSync(this.getPythonExe());
    const dependenciesInstalled = this.checkDependenciesInstalledFilesystem();
    const modelExists = this.hasWhisperModelArtifacts();

    return {
      isSetup: pythonExists && dependenciesInstalled && modelExists,
      pythonExists,
      dependenciesInstalled,
      modelExists,
    };
  }

  async bootstrap() {
    this.log({ type: 'info', message: '\n=== PHASE 1: PYTHON BOOTSTRAP ===\n' });

    const bootstrap = new PythonBootstrap((message) => {
      this.log({ type: 'stdout', message: `${message}\n` });
    });

    await bootstrap.run();
  }

  async runSetup() {
    this.log({ type: 'info', message: '\n=== PHASE 2: WHISPER DEPENDENCIES & MODEL ===\n' });

    const pythonExe = this.getPythonExe();
    const whisperSetupDir = this.getWhisperSetupDir();
    const setupScript = path.join(whisperSetupDir, 'setup.py');

    if (!fs.existsSync(pythonExe)) {
      throw new Error('Python executable not found. Bootstrap may have failed.');
    }

    if (!fs.existsSync(setupScript)) {
      throw new Error(`Whisper setup.py not found at ${setupScript}`);
    }

    return new Promise((resolve, reject) => {
      this.process = spawn(pythonExe, [setupScript], {
        cwd: whisperSetupDir,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          GPTSOVITS_DATA_DIR: BASE_DIR,
          WHISPER_SETUP_DIR: whisperSetupDir,
          WHISPER_SETUP_MODEL: this.model,
          // Work around mixed OpenMP runtimes on Windows (libiomp + libomp) during faster-whisper import.
          KMP_DUPLICATE_LIB_OK: 'TRUE',
          // Keep setup logs clean from known non-fatal Windows cache/symlink and Xet warnings.
          HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
          HF_HUB_DISABLE_XET: '1',
        },
      });

      this.process.stdout.on('data', (data) => {
        if (this.cancelled) return;
        this.log({ type: 'stdout', message: data.toString() });
      });

      this.process.stderr.on('data', (data) => {
        if (this.cancelled) return;
        this.log({ type: 'stderr', message: data.toString() });
      });

      this.process.on('close', (code) => {
        this.process = null;

        if (this.cancelled) {
          reject(new Error('Setup cancelled by user'));
        } else if (code === 0) {
          this.log({ type: 'info', message: '\n✓ Whisper setup completed successfully!\n' });
          resolve();
        } else {
          reject(new Error(`Whisper setup failed with exit code ${code}`));
        }
      });

      this.process.on('error', (err) => {
        this.process = null;
        reject(err);
      });
    });
  }

  async run(logCallback, options = {}) {
    this.logCallback = logCallback;
    this.cancelled = false;
    this.model = (options?.model || 'tiny').toString().trim() || 'tiny';

    try {
      this.log({ type: 'info', message: '='.repeat(60) + '\n' });
      this.log({ type: 'info', message: 'Whisper STT Installation Starting\n' });
      this.log({ type: 'info', message: '='.repeat(60) + '\n' });
      this.log({ type: 'info', message: `This installs embedded Python, Whisper dependencies, and ${this.model} model\n` });
      this.log({ type: 'info', message: '='.repeat(60) + '\n\n' });

      if (!fs.existsSync(resolvePythonDir())) {
        await this.bootstrap();
      } else {
        this.log({ type: 'info', message: '[BOOTSTRAP] Python already installed, skipping\n' });
      }

      if (this.cancelled) {
        throw new Error('Setup cancelled during bootstrap');
      }

      await this.runSetup();
    } catch (error) {
      this.log({ type: 'error', message: `\n✗ Setup failed: ${error.message}\n` });
      throw error;
    }
  }

  cancel() {
    this.cancelled = true;

    if (this.process) {
      this.log({ type: 'info', message: '\n⚠ Cancelling setup...\n' });
      this.process.kill();
      this.process = null;
    }
  }

  log(logData) {
    if (this.logCallback) {
      this.logCallback(logData);
    }
  }
}

export default WhisperSetupRunner;
