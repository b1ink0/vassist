/**
 * @fileoverview Setup Runner for Rust GPT-SoVITS
 * Downloads LibTorch and models (exe is pre-shipped with app)
 */

import path from 'path';
import fs from 'fs';
import LibTorchBootstrap from './bootstrap-rust.js';
import ModelsDownloader from './download-models.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IS_WINDOWS = process.platform === 'win32';

/**
 * Get base path based on dev/production mode
 */
function getBasePath() {
  // Check if running in development mode
  if (process.env.VITE_DEV_SERVER_URL) {
    // Development: use cwd
    return path.join(process.cwd(), 'electron', 'server', 'gpt-sovits-rs');
  } else {
    // Production: use __dirname
    return __dirname;
  }
}

class SetupRunnerRust {
  constructor() {
    this.progressCallback = null;
    this.cancelled = false;
    this.basePath = getBasePath();
  }

  /**
   * Get Rust server executable path (pre-shipped with app)
   */
  getServerExePath() {
    const exeName = IS_WINDOWS ? 'gpt-sovits-server.exe' : 'gpt-sovits-server';
    // Exe is in the base directory (shipped with app), not in target/release
    return path.join(this.basePath, exeName);
  }

  /**
   * Get LibTorch directory path
   */
  getLibTorchPath() {
    return path.join(this.basePath, 'libtorch');
  }

  /**
   * Get models directory path
   */
  getModelsPath() {
    return path.join(this.basePath, 'models');
  }

  /**
   * Check setup status (exe is pre-shipped, only check LibTorch and models)
   */
  getStatus() {
    const libtorchPath = this.getLibTorchPath();
    const modelsPath = this.getModelsPath();

    // Check LibTorch exists (look for lib directory)
    const libDir = path.join(libtorchPath, 'lib');
    const libtorchExists = fs.existsSync(libDir);

    // Check models exist
    const requiredModels = [
      path.join(modelsPath, 'resource', 'ssl_model.pt'),
      path.join(modelsPath, 'resource', 'bert_model.pt'),
      path.join(modelsPath, 'v2pro', 't2s.pt'),
      path.join(modelsPath, 'v2pro', 'vits.pt'),
    ];
    const modelsExist = requiredModels.every(p => fs.existsSync(p));

    const isSetup = libtorchExists && modelsExist;

    return {
      isSetup,
      libtorchExists,
      modelsExist,
    };
  }

  /**
   * Download LibTorch
   */
  async downloadLibTorch() {
    if (this.cancelled) throw new Error('Setup cancelled');

    const bootstrap = new LibTorchBootstrap((progress) => {
      if (this.cancelled) return;
      this.progress(progress);
    });

    await bootstrap.run();
  }

  /**
   * Download models
   */
  async downloadModels() {
    if (this.cancelled) throw new Error('Setup cancelled');

    const downloader = new ModelsDownloader((progress) => {
      if (this.cancelled) return;
      this.progress(progress);
    });

    await downloader.run();
  }

  /**
   * Run setup process (download LibTorch and models only)
   */
  async run(progressCallback) {
    this.progressCallback = progressCallback;
    this.cancelled = false;

    try {
      this.progress({
        phase: 'starting',
        status: 'Starting Rust TTS setup...',
        percent: 0
      });

      // Phase 1: Download LibTorch (if needed)
      await this.downloadLibTorch();

      if (this.cancelled) throw new Error('Setup cancelled');

      // Phase 2: Download models (if needed)
      await this.downloadModels();

      this.progress({
        phase: 'complete',
        status: 'Setup complete! Rust TTS is ready.',
        percent: 100
      });

    } catch (error) {
      this.progress({
        phase: 'error',
        status: `Setup failed: ${error.message}`,
        percent: 0,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cancel running setup
   */
  cancel() {
    this.cancelled = true;
    
    this.progress({
      phase: 'cancelled',
      status: 'Setup cancelled',
      percent: 0
    });
  }

  /**
   * Send progress to callback
   */
  progress(data) {
    if (this.progressCallback) {
      this.progressCallback(data);
    }
  }
}

export default SetupRunnerRust;
