/* eslint-env node */

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..', '..');

/**
 * Recursively copy directory
 * Returns true if any files were copied (used to skip empty directories)
 */
function copyDir(src, dest, excludePrivateTests = false) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  let hasFiles = false;
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip private_test folder only when creating ZIP
    if (excludePrivateTests && entry.isDirectory() && entry.name === 'private_test') {
      console.log(`[zip-extension] Skipping ${srcPath} (private_test excluded from ZIP)`);
      continue;
    }
    
    if (entry.isDirectory()) {
      // Recursively copy directory
      const dirHasFiles = copyDir(srcPath, destPath, excludePrivateTests);
      if (dirHasFiles) {
        hasFiles = true;
      }
    } else {
      // Ensure destination directory exists before copying file
      if (!hasFiles) {
        fs.mkdirSync(dest, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
      hasFiles = true;
    }
  }
  
  return hasFiles;
}

/**
 * Plugin to wrap content script as IIFE
 */
export function wrapContentScriptPlugin() {
  return {
    name: 'wrap-content-script',
    writeBundle() {
      const distDir = path.join(rootDir, 'dist-extension');
      const contentFile = path.join(distDir, 'content.js');
      
      if (!fs.existsSync(contentFile)) {
        console.warn('[wrap-content] Warning: content.js not found');
        return;
      }
      
      console.log('[wrap-content] Wrapping content.js as IIFE...');
      const content = fs.readFileSync(contentFile, 'utf-8');
      
      const wrapped = `/**
 * Content Script Entry Point (IIFE)
 * Loads the ES module content script
 */
(function() {
  'use strict';
  
  console.log('[Content Script IIFE] Initializing...');
  
  // Import the ES module content script
  import(chrome.runtime.getURL('content-module.js'))
    .then(() => {
      console.log('[Content Script IIFE] Module loaded successfully');
    })
    .catch((error) => {
      console.error('[Content Script IIFE] Failed to load module:', error);
    });
})();
`;
      
      fs.writeFileSync(path.join(distDir, 'content-module.js'), content);
      fs.writeFileSync(contentFile, wrapped);
      console.log('[wrap-content] Content script wrapped successfully');
    }
  };
}

/**
 * Plugin to copy assets to extension build
 */
export function copyAssetsPlugin(shouldZip) {
  return {
    name: 'copy-assets',
    closeBundle() {
      const publicDir = path.join(rootDir, 'public');
      const resDir = path.join(publicDir, 'res');
      const iconsDir = path.join(rootDir, 'extension', 'icons');
      const manifestFile = path.join(rootDir, 'extension', 'manifest.json');
      const distDir = path.join(rootDir, 'dist-extension');
      const distResDir = path.join(distDir, 'res');
      const distIconsDir = path.join(distDir, 'icons');
      const distManifestFile = path.join(distDir, 'manifest.json');
      
      console.log('[copy-assets] Copying assets to dist-extension...');
      
      if (fs.existsSync(resDir)) {
        console.log(`[copy-assets] Copying ${resDir} to ${distResDir}`);
        copyDir(resDir, distResDir, false); // Don't exclude during normal build
      }
      
      if (fs.existsSync(iconsDir)) {
        console.log(`[copy-assets] Copying ${iconsDir} to ${distIconsDir}`);
        copyDir(iconsDir, distIconsDir);
      }
      
      if (fs.existsSync(manifestFile)) {
        console.log(`[copy-assets] Copying ${manifestFile} to ${distManifestFile}`);
        fs.copyFileSync(manifestFile, distManifestFile);
      }
      
      // Copy ONNX Runtime WASM files from @huggingface/transformers to assets
      const transformersPath = path.join(rootDir, 'node_modules', '@huggingface', 'transformers', 'dist');
      const wasmDestDir = path.join(distDir, 'assets');
      
      if (fs.existsSync(transformersPath)) {
        console.log('[copy-assets] Copying ONNX Runtime WASM files to assets...');
        fs.mkdirSync(wasmDestDir, { recursive: true });
        
        // Only copy the 2 files we actually need
        const wasmFiles = [
          'ort-wasm-simd-threaded.jsep.wasm',
          'ort-wasm-simd-threaded.jsep.mjs',
        ];
        
        wasmFiles.forEach(file => {
          const srcFile = path.join(transformersPath, file);
          const destFile = path.join(wasmDestDir, file);
          if (fs.existsSync(srcFile)) {
            fs.copyFileSync(srcFile, destFile);
            console.log(`[copy-assets] Copied ${file} to assets/`);
          }
        });
      }
      
      // Move offscreen.html from extension/offscreen/ to root
      const nestedOffscreenHtml = path.join(distDir, 'extension', 'offscreen', 'offscreen.html');
      const rootOffscreenHtml = path.join(distDir, 'offscreen.html');
      
      if (fs.existsSync(nestedOffscreenHtml)) {
        console.log('[copy-assets] Moving offscreen.html to root...');
        fs.copyFileSync(nestedOffscreenHtml, rootOffscreenHtml);
        // Remove the nested directory structure
        fs.rmSync(path.join(distDir, 'extension'), { recursive: true, force: true });
        console.log('[copy-assets] offscreen.html moved to root');
      }
      
      console.log('[copy-assets] Asset copying complete!');
      
      // Create zip if ZIP env var is set
      if (shouldZip) {
        console.log('[zip-extension] Creating extension zip file...');
        createExtensionZip(distDir);
      }
    }
  };
}

/**
 * Create zip file of the extension
 * Excludes private_test folder from the ZIP
 */
function createExtensionZip(distDir) {
  const buildDir = path.join(rootDir, 'build');
  const tempZipDir = path.join(buildDir, 'temp-zip');
  
  // Clean temp directory
  if (fs.existsSync(tempZipDir)) {
    fs.rmSync(tempZipDir, { recursive: true, force: true });
  }
  
  // Copy dist-extension to temp, excluding private_test
  console.log('[zip-extension] Preparing files for ZIP...');
  copyDir(distDir, tempZipDir, true); // true = exclude private_test
  
  fs.mkdirSync(buildDir, { recursive: true });
  const outputFile = path.join(buildDir, 'vassist-extension.zip');
  const output = fs.createWriteStream(outputFile);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });

  output.on('close', () => {
    const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log('[zip-extension] Extension packaged successfully!');
    console.log(`[zip-extension] File: ${outputFile}`);
    console.log(`[zip-extension] Size: ${sizeInMB} MB (${archive.pointer()} bytes)`);
    
    // Clean up temp directory
    fs.rmSync(tempZipDir, { recursive: true, force: true });
  });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('[zip-extension] Warning:', err);
    } else {
      throw err;
    }
  });

  archive.on('error', (err) => {
    console.error('[zip-extension] Error:', err);
    throw err;
  });

  archive.pipe(output);
  archive.directory(tempZipDir, false);
  archive.finalize();
}
