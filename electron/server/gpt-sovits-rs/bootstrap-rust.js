/**
 * @fileoverview Bootstrap script to download LibTorch runtime for Rust GPT-SoVITS
 * Downloads platform-specific LibTorch binaries from PyTorch CDN
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_DIR = __dirname;
const LIBTORCH_DIR = path.join(BASE_DIR, 'libtorch');

const IS_WINDOWS = process.platform === 'win32';
const IS_MACOS = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

/**
 * Detect CUDA version installed on the system
 */
function detectCudaVersion() {
  const { execSync } = require('child_process');
  
  try {
    if (IS_WINDOWS) {
      // Try nvcc --version (most reliable)
      const output = execSync('nvcc --version', { encoding: 'utf8', stdio: 'pipe' });
      const match = output.match(/release (\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1]);
        const minor = parseInt(match[2]);
        return `${major}.${minor}`;
      }
    } else {
      // Linux/Mac: try nvidia-smi
      const output = execSync('nvidia-smi', { encoding: 'utf8', stdio: 'pipe' });
      const match = output.match(/CUDA Version: (\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1]);
        const minor = parseInt(match[2]);
        return `${major}.${minor}`;
      }
    }
  } catch (error) {
    // CUDA not found
    return null;
  }
  
  return null;
}

/**
 * Map CUDA version to closest supported LibTorch version
 */
function getCudaVariant(cudaVersion) {
  if (!cudaVersion) return 'cpu';
  
  const [major, minor] = cudaVersion.split('.').map(Number);
  const version = major * 10 + (minor || 0);
  
  // Map to available PyTorch CUDA builds (2.4.0)
  // CUDA 12.x → cu121
  if (version >= 120) return 'cu121';
  // CUDA 11.8+ → cu118
  if (version >= 118) return 'cu118';
  // Older CUDA → CPU fallback
  return 'cpu';
}

/**
 * Get LibTorch download URL based on platform and CUDA version
 */
function getLibTorchUrl() {
  const platform = process.platform;
  const cudaVersion = detectCudaVersion();
  const cudaVariant = getCudaVariant(cudaVersion);
  
  console.log(`[LibTorch] Platform: ${platform}, CUDA: ${cudaVersion || 'not detected'}, Using: ${cudaVariant}`);
  
  if (platform === 'darwin') {
    // macOS always uses CPU
    return process.arch === 'arm64'
      ? 'https://download.pytorch.org/libtorch/cpu/libtorch-macos-arm64-2.4.0.zip'
      : 'https://download.pytorch.org/libtorch/cpu/libtorch-macos-x86_64-2.4.0.zip';
  }
  
  if (platform === 'win32') {
    if (cudaVariant === 'cu121') {
      return 'https://download.pytorch.org/libtorch/cu121/libtorch-win-shared-with-deps-2.4.0%2Bcu121.zip';
    } else if (cudaVariant === 'cu118') {
      return 'https://download.pytorch.org/libtorch/cu118/libtorch-win-shared-with-deps-2.4.0%2Bcu118.zip';
    } else {
      // CPU fallback
      return 'https://download.pytorch.org/libtorch/cpu/libtorch-win-shared-with-deps-2.4.0%2Bcpu.zip';
    }
  }
  
  if (platform === 'linux') {
    if (cudaVariant === 'cu121') {
      return 'https://download.pytorch.org/libtorch/cu121/libtorch-cxx11-abi-shared-with-deps-2.4.0%2Bcu121.zip';
    } else if (cudaVariant === 'cu118') {
      return 'https://download.pytorch.org/libtorch/cu118/libtorch-cxx11-abi-shared-with-deps-2.4.0%2Bcu118.zip';
    } else {
      // CPU fallback
      return 'https://download.pytorch.org/libtorch/cpu/libtorch-cxx11-abi-shared-with-deps-2.4.0%2Bcpu.zip';
    }
  }
  
  throw new Error(`Unsupported platform: ${platform}`);
}

class LibTorchBootstrap {
  constructor(progressCallback) {
    this.progressCallback = progressCallback || (() => {});
  }

  /**
   * Send progress update to callback
   */
  progress(data) {
    this.progressCallback({
      phase: 'libtorch',
      ...data
    });
  }

  /**
   * Download file with progress tracking, redirect handling, and retry logic
   */
  async downloadFile(url, destPath, retryCount = 0, maxRetries = 3) {
    return new Promise((resolve, reject) => {
      this.progress({ status: `Starting download...`, percent: 0 });
      
      const makeRequest = (downloadUrl) => {
        https.get(downloadUrl, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
            const redirectUrl = response.headers.location;
            if (!redirectUrl) {
              reject(new Error('Redirect without location header'));
              return;
            }
            this.progress({ status: 'Following redirect...', percent: 0 });
            makeRequest(redirectUrl);
            return;
          }
          
          if (response.statusCode !== 200) {
            const error = new Error(`Download failed: HTTP ${response.statusCode}`);
            
            // Retry on failure
            if (retryCount < maxRetries) {
              const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
              this.progress({ 
                status: `Download failed, retrying in ${delay/1000}s... (${retryCount + 1}/${maxRetries})`,
                percent: 0 
              });
              setTimeout(() => {
                this.downloadFile(url, destPath, retryCount + 1, maxRetries).then(resolve).catch(reject);
              }, delay);
            } else {
              reject(error);
            }
            return;
          }

          const totalSize = parseInt(response.headers['content-length'], 10);
          let downloadedSize = 0;
          let lastPercent = 0;

          const file = fs.createWriteStream(destPath);

          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            file.write(chunk);
            
            const percent = totalSize > 0 ? Math.floor((downloadedSize / totalSize) * 100) : 0;
            
            // Report every 5%
            if (percent >= lastPercent + 5 || percent === 100) {
              this.progress({
                status: `Downloading LibTorch...`,
                percent: Math.floor(percent * 0.8), // 0-80% for download
                downloaded: (downloadedSize / 1024 / 1024).toFixed(1),
                total: (totalSize / 1024 / 1024).toFixed(1)
              });
              lastPercent = percent;
            }
          });

          response.on('end', () => {
            file.end();
            this.progress({ status: 'Download complete', percent: 80 });
            resolve();
          });

          response.on('error', (err) => {
            file.end();
            
            // Retry on error
            if (retryCount < maxRetries) {
              const delay = Math.pow(2, retryCount) * 1000;
              this.progress({ 
                status: `Download error, retrying in ${delay/1000}s... (${retryCount + 1}/${maxRetries})`,
                percent: 0 
              });
              setTimeout(() => {
                this.downloadFile(url, destPath, retryCount + 1, maxRetries).then(resolve).catch(reject);
              }, delay);
            } else {
              reject(err);
            }
          });

        }).on('error', (err) => {
          // Retry on connection error
          if (retryCount < maxRetries) {
            const delay = Math.pow(2, retryCount) * 1000;
            this.progress({ 
              status: `Connection error, retrying in ${delay/1000}s... (${retryCount + 1}/${maxRetries})`,
              percent: 0 
            });
            setTimeout(() => {
              this.downloadFile(url, destPath, retryCount + 1, maxRetries).then(resolve).catch(reject);
            }, delay);
          } else {
            reject(err);
          }
        });
      };

      makeRequest(url);
    });
  }

  /**
   * Extract ZIP file
   */
  async extractZip(zipPath, extractPath) {
    return new Promise((resolve, reject) => {
      this.progress({ status: 'Extracting LibTorch...', percent: 85 });
      
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractPath }))
        .on('close', () => {
          this.progress({ status: 'Extraction complete', percent: 95 });
          resolve();
        })
        .on('error', reject);
    });
  }

  /**
   * Main bootstrap entry point
   */
  async run() {
    try {
      // Check if already set up
      if (fs.existsSync(LIBTORCH_DIR)) {
        this.progress({ status: 'LibTorch already exists', percent: 100 });
        return;
      }

      // Create temp directory
      if (!fs.existsSync(BASE_DIR)) {
        fs.mkdirSync(BASE_DIR, { recursive: true });
      }

      // Get platform-specific URL with CUDA detection
      const downloadUrl = getLibTorchUrl();

      this.progress({ 
        status: `Downloading LibTorch...`, 
        percent: 0 
      });

      // Download
      const zipPath = path.join(BASE_DIR, 'libtorch.zip');
      await this.downloadFile(downloadUrl, zipPath);

      // Extract
      const tempExtractDir = path.join(BASE_DIR, 'libtorch_temp');
      if (!fs.existsSync(tempExtractDir)) {
        fs.mkdirSync(tempExtractDir, { recursive: true });
      }
      
      await this.extractZip(zipPath, tempExtractDir);

      // Move libtorch folder from temp to final location
      // The ZIP contains a 'libtorch' folder at the root
      const extractedLibtorch = path.join(tempExtractDir, 'libtorch');
      if (fs.existsSync(extractedLibtorch)) {
        fs.renameSync(extractedLibtorch, LIBTORCH_DIR);
      } else {
        // If structure is different, move entire temp dir
        fs.renameSync(tempExtractDir, LIBTORCH_DIR);
      }

      // Clean up
      this.progress({ status: 'Cleaning up...', percent: 97 });
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }

      this.progress({ status: 'LibTorch setup complete!', percent: 100 });

    } catch (error) {
      this.progress({ 
        status: `Bootstrap failed: ${error.message}`, 
        percent: 0,
        error: error.message 
      });
      throw error;
    }
  }
}

export default LibTorchBootstrap;
