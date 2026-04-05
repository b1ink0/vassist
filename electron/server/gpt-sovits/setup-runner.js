/**
 * @fileoverview Setup Runner - Orchestrates full GPT-SoVITS installation
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import PythonBootstrap from './bootstrap.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPT_DIR = __dirname;
const BASE_DIR = process.env.GPTSOVITS_DATA_DIR || SCRIPT_DIR;
const PYTHON_DIR = path.join(BASE_DIR, 'python');
const IS_WINDOWS = process.platform === 'win32';

class SetupRunner {
  constructor() {
    this.process = null;
    this.logCallback = null;
    this.cancelled = false;
  }

  /**
   * Get embedded Python executable path
   */
  getPythonExe() {
    if (IS_WINDOWS) {
      return path.join(PYTHON_DIR, 'python.exe');
    } else {
      return path.join(PYTHON_DIR, 'bin', 'python3');
    }
  }

  /**
   * Check if setup is already complete
   */
  getStatus() {
    const pythonExists = fs.existsSync(PYTHON_DIR);
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
    
    const bootstrap = new PythonBootstrap((message) => {
      this.log({ type: 'stdout', message: message + '\n' });
    });
    
    await bootstrap.run();
  }

  /**
   * Run setup.py with embedded Python
   */
  async runSetup(options = {}) {
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

    return new Promise((resolve, reject) => {
      this.process = spawn(pythonExe, [setupScript], {
        cwd: BASE_DIR,
        env: { 
          ...process.env, 
          PYTHONUNBUFFERED: '1',  // Disable Python output buffering
          PYTHONIOENCODING: 'utf-8',  // Force UTF-8 encoding
          GPTSOVITS_TORCH_BACKEND: selectedBackend,
          GPTSOVITS_DATA_DIR: BASE_DIR
        }
      });
      
      this.process.stdout.on('data', (data) => {
        if (this.cancelled) return;
        const message = data.toString();
        this.log({ type: 'stdout', message });
      });
      
      this.process.stderr.on('data', (data) => {
        if (this.cancelled) return;
        const message = data.toString();
        this.log({ type: 'stderr', message });
      });
      
      this.process.on('close', (code) => {
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
      
      this.process.on('error', (err) => {
        this.process = null;
        reject(err);
      });
    });
  }

  /**
   * Run full setup process
   * @param {Function} logCallback - Called with { type, message } for each log line
   */
  async run(logCallback, options = {}) {
    this.logCallback = logCallback;
    this.cancelled = false;
    
    try {
      this.log({ type: 'info', message: '='.repeat(60) + '\n' });
      this.log({ type: 'info', message: 'GPT-SoVITS Installation Starting\n' });
      this.log({ type: 'info', message: '='.repeat(60) + '\n' });
      this.log({ type: 'info', message: 'This will download ~5GB of data (Python, PyTorch, models)\n' });
      this.log({ type: 'info', message: 'Estimated time: 10-30 minutes depending on internet speed\n' });
      this.log({ type: 'info', message: `Selected PyTorch backend: ${(options?.torchBackend || 'auto').toString().trim().toLowerCase()}\n` });
      this.log({ type: 'info', message: '='.repeat(60) + '\n\n' });
      
      // Phase 1: Bootstrap Python (if needed)
      if (!fs.existsSync(PYTHON_DIR)) {
        await this.bootstrap();
      } else {
        this.log({ type: 'info', message: '[BOOTSTRAP] Python already installed, skipping\n' });
      }
      
      if (this.cancelled) {
        throw new Error('Setup cancelled during bootstrap');
      }
      
      // Phase 2: Run setup.py to install everything else
      await this.runSetup(options);
      
    } catch (error) {
      this.log({ type: 'error', message: `\n✗ Setup failed: ${error.message}\n` });
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
  log(logData) {
    if (this.logCallback) {
      this.logCallback(logData);
    }
  }
}

export default SetupRunner;
