/**
 * @fileoverview Setup Runner - Orchestrates full GPT-SoVITS installation
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import PythonBootstrap from './bootstrap';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { ChildProcessWithoutNullStreams } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPT_DIR = __dirname;
const BASE_DIR = process.env.GPTSOVITS_DATA_DIR || SCRIPT_DIR;
const IS_WINDOWS = process.platform === 'win32';

type SetupLog = {
  type: 'info' | 'stdout' | 'stderr' | 'error';
  message: string;
};

type SetupOptions = {
  torchBackend?: string;
  force?: boolean;
};

type SetupStatus = {
  isSetup: boolean;
  pythonExists: boolean;
  modelsExist: boolean;
  gptsovitsExists: boolean;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function resolvePythonDir(torchBackend: string | undefined | null): string {
  const backend = (torchBackend || 'auto').toString().trim().toLowerCase();
  if (IS_WINDOWS && backend === 'rocm') {
    return path.join(BASE_DIR, 'python312');
  }
  return path.join(BASE_DIR, 'python');
}

class SetupRunner {
  process: ChildProcessWithoutNullStreams | null;
  logCallback: ((logData: SetupLog) => void) | null;
  cancelled: boolean;
  torchBackend: string;
  forceReinstall: boolean;

  constructor() {
    this.process = null;
    this.logCallback = null;
    this.cancelled = false;
    this.torchBackend = 'auto';
    this.forceReinstall = false;
  }

  /**
   * Get the Python runtime directory for the currently selected backend
   */
  getPythonDir(): string {
    return resolvePythonDir(this.torchBackend);
  }

  /**
   * Get embedded Python executable path
   */
  getPythonExe(): string {
    if (IS_WINDOWS) {
      return path.join(this.getPythonDir(), 'python.exe');
    } else {
      return path.join(this.getPythonDir(), 'bin', 'python3');
    }
  }

  /**
   * Check if setup is already complete
   */
  getStatus(): SetupStatus {
    // Check both possible python dirs (standard 3.10 and ROCm 3.12)
    const pythonDirDefault = path.join(BASE_DIR, 'python');
    const pythonDir312 = path.join(BASE_DIR, 'python312');
    const pythonExists = fs.existsSync(pythonDirDefault) || fs.existsSync(pythonDir312);
    const modelsDir = path.join(BASE_DIR, 'models');
    const modelsExist = fs.existsSync(modelsDir);
    const gptsovitsDir = path.join(BASE_DIR, 'GPT-SoVITS');
    const gptsovitsExists = fs.existsSync(gptsovitsDir);
    
    return {
      isSetup: pythonExists && modelsExist && gptsovitsExists,
      pythonExists,
      modelsExist,
      gptsovitsExists,
    };
  }

  /**
   * Run bootstrap to get Python
   */
  async bootstrap() {
    this.log({ type: 'info', message: '\n=== PHASE 1: PYTHON BOOTSTRAP ===\n' });
    
    const bootstrap = new PythonBootstrap((message: string) => {
      this.log({ type: 'stdout', message: message + '\n' });
    }, { backend: this.torchBackend });
    
    await bootstrap.run();
  }

  /**
   * Run setup.py with embedded Python
   */
  async runSetup(options: SetupOptions = {}) {
    this.log({ type: 'info', message: '\n=== PHASE 2: DEPENDENCIES & MODELS ===\n' });
    
    const pythonExe = this.getPythonExe();
    const setupScript = path.join(BASE_DIR, 'setup.py');
    
    if (!fs.existsSync(pythonExe)) {
      throw new Error('Python executable not found. Bootstrap may have failed.');
    }
    
    if (!fs.existsSync(setupScript)) {
      throw new Error('setup.py not found');
    }
    
    const selectedBackend = (options?.torchBackend || 'auto').toString().trim().toLowerCase();
    const forceReinstall = options?.force ? '1' : '0';

    return new Promise<void>((resolve, reject) => {
      this.process = spawn(pythonExe, [setupScript], {
        cwd: BASE_DIR,
        env: { 
          ...process.env, 
          PYTHONUNBUFFERED: '1',  // Disable Python output buffering
          PYTHONIOENCODING: 'utf-8',  // Force UTF-8 encoding
          GPTSOVITS_TORCH_BACKEND: selectedBackend,
          GPTSOVITS_DATA_DIR: BASE_DIR,
          GPTSOVITS_FORCE_REINSTALL: forceReinstall,
        }
      });
      
      this.process.stdout.on('data', (data: Buffer) => {
        if (this.cancelled) return;
        const message = data.toString();
        this.log({ type: 'stdout', message });
      });
      
      this.process.stderr.on('data', (data: Buffer) => {
        if (this.cancelled) return;
        const message = data.toString();
        this.log({ type: 'stderr', message });
      });
      
      this.process.on('close', (code: number | null) => {
        this.process = null;
        
        if (this.cancelled) {
          reject(new Error('Setup cancelled by user'));
        } else if (code === 0) {
          this.log({ type: 'info', message: '\n✓ Setup completed successfully!\n' });
          resolve();
        } else {
          reject(new Error(`Setup failed with exit code ${code}`));
        }
      });
      
      this.process.on('error', (err: Error) => {
        this.process = null;
        reject(err);
      });
    });
  }

  /**
   * Run full setup process
   * @param {Function} logCallback - Called with { type, message } for each log line
   */
  async run(logCallback: (logData: SetupLog) => void, options: SetupOptions = {}) {
    this.logCallback = logCallback;
    this.cancelled = false;
    this.torchBackend = (options?.torchBackend || 'auto').toString().trim().toLowerCase();
    this.forceReinstall = !!options?.force;
    
    try {
      this.log({ type: 'info', message: '='.repeat(60) + '\n' });
      this.log({ type: 'info', message: 'GPT-SoVITS Installation Starting\n' });
      this.log({ type: 'info', message: '='.repeat(60) + '\n' });
      this.log({ type: 'info', message: 'This will download ~5GB of data (Python, PyTorch, models)\n' });
      this.log({ type: 'info', message: 'Estimated time: 10-30 minutes depending on internet speed\n' });
      this.log({ type: 'info', message: `Selected PyTorch backend: ${this.torchBackend}\n` });
      this.log({ type: 'info', message: '='.repeat(60) + '\n\n' });
      
      // Phase 1: Bootstrap Python (if needed)
      if (!fs.existsSync(this.getPythonDir())) {
        await this.bootstrap();
      } else {
        this.log({ type: 'info', message: '[BOOTSTRAP] Python already installed, skipping\n' });
      }
      
      if (this.cancelled) {
        throw new Error('Setup cancelled during bootstrap');
      }
      
      // Phase 2: Run setup.py to install everything else
      await this.runSetup({ ...options, force: this.forceReinstall });
      
    } catch (error) {
      this.log({ type: 'error', message: `\n✗ Setup failed: ${getErrorMessage(error)}\n` });
      throw error;
    }
  }

  /**
   * Cancel running setup
   */
  cancel() {
    this.cancelled = true;
    
    if (this.process) {
      this.log({ type: 'info', message: '\n⚠ Cancelling setup...\n' });
      this.process.kill();
      this.process = null;
    }
  }

  /**
   * Send log to callback
   */
  log(logData: SetupLog) {
    if (this.logCallback) {
      this.logCallback(logData);
    }
  }
}

export default SetupRunner;
