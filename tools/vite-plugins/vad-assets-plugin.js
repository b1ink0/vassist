/* eslint-env node */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..', '..');

/**
 * Plugin to copy @ricky0123/vad-web assets to build output
 * Copies worklet, ONNX models, and ONNX Runtime WASM files to assets/ folder
 * @param {string} outDir - Output directory (e.g., 'dist', 'dist-desktop', 'dist-android', 'dist-extension')
 */
export function vadAssetsPlugin(outDir) {
  return {
    name: 'vad-assets',
    closeBundle() {
      const vadDistPath = path.join(rootDir, 'node_modules', '@ricky0123', 'vad-web', 'dist');
      const onnxDistPath = path.join(rootDir, 'node_modules', 'onnxruntime-web', 'dist');
      
      const distDir = path.join(rootDir, outDir, 'assets');
      
      // Ensure assets directory exists
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }
      
      console.log(`[vad-assets] Copying VAD assets to ${outDir}/assets/...`);
      
      // Copy VAD worklet
      if (fs.existsSync(vadDistPath)) {
        const workletFile = 'vad.worklet.bundle.min.js';
        const workletSrc = path.join(vadDistPath, workletFile);
        const workletDest = path.join(distDir, workletFile);
        
        if (fs.existsSync(workletSrc)) {
          fs.copyFileSync(workletSrc, workletDest);
          console.log(`[vad-assets] ✓ Copied ${workletFile}`);
        }
        
        // Copy ONNX models
        const onnxFiles = fs.readdirSync(vadDistPath).filter(file => file.endsWith('.onnx'));
        onnxFiles.forEach(file => {
          const srcFile = path.join(vadDistPath, file);
          const destFile = path.join(distDir, file);
          fs.copyFileSync(srcFile, destFile);
          console.log(`[vad-assets] ✓ Copied ${file}`);
        });
      }
      
      // Copy ONNX Runtime WASM and MJS files
      if (fs.existsSync(onnxDistPath)) {
        const onnxRuntimeFiles = fs.readdirSync(onnxDistPath).filter(file => 
          file.endsWith('.wasm') || file.endsWith('.mjs')
        );
        
        onnxRuntimeFiles.forEach(file => {
          const srcFile = path.join(onnxDistPath, file);
          const destFile = path.join(distDir, file);
          fs.copyFileSync(srcFile, destFile);
          console.log(`[vad-assets] ✓ Copied ${file}`);
        });
      }
      
      console.log('[vad-assets] VAD assets copied successfully');
    }
  };
}
