/* eslint-env node */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import * as tar from 'tar';
import unbzip2Stream from 'unbzip2-stream';
import type { Plugin } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..', '..');

/**
 * Model configurations
 */
const MODELS = {
  whisper: {
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2',
    size: '113 MB',
    files: [
      'tiny.en-encoder.int8.onnx',
      'tiny.en-decoder.int8.onnx',
      'tiny.en-tokens.txt'
    ],
    extractDir: 'sherpa-onnx-whisper-tiny.en',
    targetDir: 'android/app/src/main/assets/models/whisper'
  },
  vits: {
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-vctk.tar.bz2',
    size: '145 MB',
    files: [
      { src: 'vits-vctk.onnx', dest: 'vits-vctk.onnx' },
      { src: 'tokens.txt', dest: 'tokens-vctk.txt' },
      { src: 'lexicon.txt', dest: 'lexicon-vctk.txt' }
    ],
    extractDir: 'vits-vctk',
    targetDir: 'android/app/src/main/assets/models/vits'
  }
};

const CACHE_DIR = path.join(rootDir, 'node_modules/.cache/android-models');
const CACHE_MARKER = path.join(CACHE_DIR, '.models-downloaded');

type ModelFileSpec = string | { src: string; dest: string };

interface ModelConfig {
  url: string;
  size: string;
  files: ModelFileSpec[];
  extractDir: string;
  targetDir: string;
}

const getErrorMessage = (error: object | string | null | undefined): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? 'Unknown error');
};

/**
 * Check if models are already cached
 */
function areModelsCached(): boolean {
  if (!fs.existsSync(CACHE_MARKER)) {
    return false;
  }
  
  for (const [name, config] of Object.entries(MODELS as Record<string, ModelConfig>)) {
    const cacheModelDir = path.join(CACHE_DIR, name);
    const files = config.files.map(f => typeof f === 'string' ? f : f.dest);
    
    for (const fileName of files) {
      const filePath = path.join(cacheModelDir, fileName);
      if (!fs.existsSync(filePath)) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Download file with progress
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  const fileName = path.basename(destPath);
  
  return new Promise<void>((resolve, reject) => {
    console.log(`[android-models] Downloading ${fileName}...`);
    
    https.get(url, { headers: { 'User-Agent': 'vassist-build' } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectLocation = response.headers.location;
        if (!redirectLocation) {
          reject(new Error('Redirect response missing location header'));
          return;
        }
        downloadFile(redirectLocation, destPath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const contentLengthHeader = response.headers['content-length'];
      const totalSize = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
      let downloaded = 0;
      let lastPercent = 0;
      
      response.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        const percent = totalSize > 0 ? Math.floor((downloaded / totalSize) * 100) : 0;
        if (percent !== lastPercent && percent % 20 === 0) {
          console.log(`[android-models] Progress: ${percent}%`);
          lastPercent = percent;
        }
      });
      
      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`[android-models] ✓ Downloaded ${fileName}`);
        resolve();
      });
      
      fileStream.on('error', (err) => {
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        reject(err);
      });
    }).on('error', reject);
  });
}

/**
 * Extract tar.bz2 archive using tar package with bzip2 decompression
 */
async function extractTarBz2(archivePath: string, files: ModelFileSpec[], destDir: string, extractDir: string): Promise<void> {
  console.log(`[android-models] Extracting to ${destDir}...`);
  
  const tempExtractDir = path.join(CACHE_DIR, 'temp-extract');
  fs.mkdirSync(tempExtractDir, { recursive: true });
  
  try {
    // Extract tar.bz2 with decompression
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(archivePath)
        .pipe(unbzip2Stream())
        .pipe(tar.x({
          cwd: tempExtractDir,
          filter: (entryPath) => {
            const fileName = entryPath.split('/').pop();
            return files.some(f => {
              const name = typeof f === 'string' ? f : f.src;
              return fileName === name;
            });
          }
        }))
        .on('finish', resolve)
        .on('error', reject);
    });
    
    // Move specific files to destination
    const fileMap = new Map();
    for (const file of files) {
      if (typeof file === 'string') {
        fileMap.set(file, file);
      } else {
        fileMap.set(file.src, file.dest);
      }
    }
    
    fs.mkdirSync(destDir, { recursive: true });
    
    const extractedDir = path.join(tempExtractDir, extractDir);
    let extractedCount = 0;
    
    for (const [srcName, destName] of fileMap.entries()) {
      const srcPath = path.join(extractedDir, srcName);
      const destPath = path.join(destDir, destName);
      
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        extractedCount++;
      }
    }
    
    console.log(`[android-models] ✓ Extracted ${extractedCount} files`);
    
    // Clean up temp directory
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
    
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(tempExtractDir)) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    }
    throw error;
  }
}

/**
 * Download and cache models
 */
async function downloadModels(): Promise<void> {
  console.log('[android-models] Downloading STT/TTS models...\n');
  
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  
  for (const [name, config] of Object.entries(MODELS as Record<string, ModelConfig>)) {
    console.log(`[android-models] Processing ${name.toUpperCase()} (${config.size})`);
    
    const cacheModelDir = path.join(CACHE_DIR, name);
    fs.mkdirSync(cacheModelDir, { recursive: true });
    
    const archivePath = path.join(CACHE_DIR, `${name}.tar.bz2`);
    
    if (!fs.existsSync(archivePath)) {
      await downloadFile(config.url, archivePath);
    } else {
      console.log(`[android-models] ✓ Archive already downloaded`);
    }
    
    const files = config.files.map(f => typeof f === 'string' ? { src: f, dest: f } : f);
    const allExtracted = files.every(f => fs.existsSync(path.join(cacheModelDir, f.dest)));
    
    if (!allExtracted) {
      try {
        await extractTarBz2(archivePath, config.files, cacheModelDir, config.extractDir);
        // Only delete archive after successful extraction
        if (fs.existsSync(archivePath)) {
          fs.unlinkSync(archivePath);
        }
      } catch (error) {
        console.error(`[android-models] ❌ Extraction failed: ${getErrorMessage(error instanceof Error ? error : String(error))}`);
        // Delete corrupted archive so it gets re-downloaded next time
        if (fs.existsSync(archivePath)) {
          fs.unlinkSync(archivePath);
        }
        throw error;
      }
    } else {
      console.log(`[android-models] ✓ All files already extracted`);
      // Clean up archive if extraction was already done
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
    }
  }
  
  fs.writeFileSync(CACHE_MARKER, new Date().toISOString());
  console.log('[android-models] ✅ All models cached\n');
}

/**
 * Copy cached models to Android assets
 */
function copyModelsToAssets(): void {
  console.log('[android-models] Copying models to Android assets...');
  
  for (const [name, config] of Object.entries(MODELS as Record<string, ModelConfig>)) {
    const cacheModelDir = path.join(CACHE_DIR, name);
    const targetDir = path.join(rootDir, config.targetDir);
    
    fs.mkdirSync(targetDir, { recursive: true });
    
    const files = config.files.map(f => typeof f === 'string' ? { src: f, dest: f } : f);
    
    for (const file of files) {
      const srcPath = path.join(cacheModelDir, file.dest);
      const destPath = path.join(targetDir, file.dest);
      
      if (!fs.existsSync(srcPath)) {
        console.error(`[android-models] ❌ Source file not found: ${srcPath}`);
        continue;
      }
      
      fs.copyFileSync(srcPath, destPath);
      const sizeMB = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
      console.log(`[android-models] ✓ ${file.dest} (${sizeMB} MB)`);
    }
  }
  
  console.log('[android-models] ✅ Models ready for packaging\n');
}

/**
 * Vite plugin to package STT/TTS models with Android build
 * @param {boolean} packageModels - Whether to package models
 * @returns {import('vite').Plugin}
 */
export function androidModelsPlugin(packageModels = false): Plugin {
  return {
    name: 'android-models',
    
    async buildStart() {
      if (!packageModels) {
        console.log('[android-models] Skipping model packaging');
        return;
      }
      
      try {
        if (areModelsCached()) {
          console.log('[android-models] ✓ Models already cached, skipping download');
        } else {
          await downloadModels();
        }
        
        copyModelsToAssets();
      } catch (error) {
        console.error('[android-models] ❌ Error:', getErrorMessage(error instanceof Error ? error : String(error)));
        throw error;
      }
    }
  };
}
