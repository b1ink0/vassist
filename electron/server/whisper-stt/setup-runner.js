/**
 * @fileoverview Setup Runner - Orchestrates Whisper-only STT installation
 */

import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import PythonBootstrap from '../gpt-sovits/bootstrap.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPT_DIR = __dirname;
const BASE_DIR = process.env.GPTSOVITS_DATA_DIR || SCRIPT_DIR;
const PYTHON_DIR = path.join(BASE_DIR, 'python');
const IS_WINDOWS = process.platform === 'win32';

class WhisperSetupRunner {
  constructor() {
    this.process = null;
    this.logCallback = null;
    this.cancelled = false;
  }

  getPythonExe() {
    if (IS_WINDOWS) {
      return path.join(PYTHON_DIR, 'python.exe');
    }
    const py3Path = path.join(PYTHON_DIR, 'bin', 'python3');
    const pyPath = path.join(PYTHON_DIR, 'bin', 'python');
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

    const queue = [modelDir];
    const maxDepth = 5;

    while (queue.length > 0) {
      const currentPath = queue.shift();
      const depth = currentPath
        .replace(modelDir, '')
        .split(path.sep)
        .filter(Boolean)
        .length;

      let entries = [];
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isFile()) {
          // Common faster-whisper artifacts.
          if (
            entry.name === 'model.bin' ||
            entry.name === 'config.json' ||
            entry.name === 'tokenizer.json' ||
            entry.name.endsWith('.bin')
          ) {
            return true;
          }
          continue;
        }

        if (!entry.isDirectory()) {
          continue;
        }

        if (entry.name === 'tiny.en' || entry.name === 'tiny' || entry.name.startsWith('models--')) {
          return true;
        }

        if (depth < maxDepth) {
          queue.push(fullPath);
        }
      }
    }

    return false;
  }

  checkDependenciesInstalled() {
    const pythonExe = this.getPythonExe();
    if (!fs.existsSync(pythonExe)) {
      return false;
    }

    try {
      const result = spawnSyncSafe(pythonExe, [
        '-c',
        'import fastapi, uvicorn, faster_whisper, ctranslate2, av, soundfile; print("ok")'
      ]);
      return result.success;
    } catch {
      return false;
    }
  }

  getStatus() {
    const pythonExists = fs.existsSync(PYTHON_DIR) && fs.existsSync(this.getPythonExe());
    const dependenciesInstalled = this.checkDependenciesInstalled();
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

  async run(logCallback) {
    this.logCallback = logCallback;
    this.cancelled = false;

    try {
      this.log({ type: 'info', message: '='.repeat(60) + '\n' });
      this.log({ type: 'info', message: 'Whisper STT Installation Starting\n' });
      this.log({ type: 'info', message: '='.repeat(60) + '\n' });
      this.log({ type: 'info', message: 'This installs embedded Python, Whisper dependencies, and tiny.en model\n' });
      this.log({ type: 'info', message: '='.repeat(60) + '\n\n' });

      if (!fs.existsSync(PYTHON_DIR)) {
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

function spawnSyncSafe(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });

  return {
    success: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export default WhisperSetupRunner;
