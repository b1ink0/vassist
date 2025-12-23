/**
 * @fileoverview Model downloader for Rust GPT-SoVITS
 * Downloads pre-converted models from HuggingFace
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
const MODELS_DIR = path.join(BASE_DIR, 'models');

const BASE_URL = 'https://huggingface.co/L-jasmine/GPT_Sovits/resolve/main';

/**
 * Models to download
 */
const MODELS = {
  'mini-bart-g2p.pt': `${BASE_URL}/mini-bart-g2p.pt`,
  'g2pw.pt': `${BASE_URL}/g2pw.pt`,
  'v2pro/t2s.pt': `${BASE_URL}/v2pro/t2s.pt`,
  'v2pro/vits.pt': `${BASE_URL}/v2pro/vits.pt`,
};

const RESOURCE_ZIP = `${BASE_URL}/resource.zip`;

class ModelsDownloader {
  constructor(progressCallback) {
    this.progressCallback = progressCallback || (() => {});
  }

  /**
   * Send progress update to callback
   */
  progress(data) {
    this.progressCallback({
      phase: 'models',
      ...data
    });
  }

  /**
   * Download single file with progress tracking and retry logic
   */
  async downloadFile(url, destPath, retryCount = 0, maxRetries = 3) {
    return new Promise((resolve, reject) => {
      // Ensure parent directory exists
      const parentDir = path.dirname(destPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const makeRequest = (downloadUrl) => {
        https.get(downloadUrl, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
            const redirectUrl = response.headers.location;
            if (!redirectUrl) {
              reject(new Error('Redirect without location header'));
              return;
            }
            makeRequest(redirectUrl);
            return;
          }

          if (response.statusCode !== 200) {
            const error = new Error(`Download failed: HTTP ${response.statusCode}`);
            
            // Retry on failure
            if (retryCount < maxRetries) {
              const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
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

          const file = fs.createWriteStream(destPath);

          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            file.write(chunk);
          });

          response.on('end', () => {
            file.end();
            resolve({ downloaded: downloadedSize, total: totalSize });
          });

          response.on('error', (err) => {
            file.close();
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            
            // Retry on error
            if (retryCount < maxRetries) {
              const delay = Math.pow(2, retryCount) * 1000;
              setTimeout(() => {
                this.downloadFile(url, destPath, retryCount + 1, maxRetries).then(resolve).catch(reject);
              }, delay);
            } else {
              reject(err);
            }
          });

          file.on('error', (err) => {
            file.close();
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            
            // Retry on error
            if (retryCount < maxRetries) {
              const delay = Math.pow(2, retryCount) * 1000;
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
            setTimeout(() => {
              this.downloadFile(url, destPath, retryCount + 1, maxRetries).then(resolve).catch(reject);
            }, delay);
          } else {
            reject(new Error(`Download request failed: ${err.message}`));
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
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractPath }))
        .on('close', resolve)
        .on('error', reject);
    });
  }

  /**
   * Main download entry point
   */
  async run() {
    try {
      // Create models directory
      if (!fs.existsSync(MODELS_DIR)) {
        fs.mkdirSync(MODELS_DIR, { recursive: true });
      }

      const totalFiles = Object.keys(MODELS).length + 1; // +1 for resource.zip
      let completedFiles = 0;

      // Download individual models
      for (const [filename, url] of Object.entries(MODELS)) {
        const destPath = path.join(MODELS_DIR, filename);
        
        if (fs.existsSync(destPath)) {
          this.progress({
            status: `${filename} already exists`,
            percent: Math.floor((++completedFiles / totalFiles) * 100)
          });
          continue;
        }

        this.progress({
          status: `Downloading ${filename}...`,
          percent: Math.floor((completedFiles / totalFiles) * 100)
        });

        const { downloaded, total } = await this.downloadFile(url, destPath);
        
        this.progress({
          status: `Downloaded ${filename}`,
          percent: Math.floor((++completedFiles / totalFiles) * 100),
          downloaded: (downloaded / 1024 / 1024).toFixed(1),
          total: (total / 1024 / 1024).toFixed(1)
        });
      }

      // Download and extract resource.zip
      const resourceZipPath = path.join(MODELS_DIR, 'resource.zip');
      const resourceDir = path.join(MODELS_DIR, 'resource');

      if (fs.existsSync(resourceDir)) {
        this.progress({
          status: 'Resource files already extracted',
          percent: 100
        });
      } else {
        this.progress({
          status: 'Downloading resource.zip (SSL + BERT models)...',
          percent: Math.floor((completedFiles / totalFiles) * 100)
        });

        const { downloaded, total } = await this.downloadFile(RESOURCE_ZIP, resourceZipPath);
        
        this.progress({
          status: 'Extracting resource.zip...',
          percent: Math.floor(((completedFiles + 0.5) / totalFiles) * 100),
          downloaded: (downloaded / 1024 / 1024).toFixed(1),
          total: (total / 1024 / 1024).toFixed(1)
        });

        await this.extractZip(resourceZipPath, MODELS_DIR);

        // Clean up zip
        if (fs.existsSync(resourceZipPath)) {
          fs.unlinkSync(resourceZipPath);
        }

        completedFiles++;
      }

      this.progress({
        status: 'All models downloaded successfully!',
        percent: 100
      });

    } catch (error) {
      this.progress({
        status: `Download failed: ${error.message}`,
        percent: 0,
        error: error.message
      });
      throw error;
    }
  }
}

export default ModelsDownloader;
