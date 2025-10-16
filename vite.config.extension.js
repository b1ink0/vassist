/**
 * Vite Configuration for Chrome Extension Build
 * Creates separate bundles for background, content, and offscreen scripts
 */

/* eslint-env node */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.argv.includes('--mode=production');

/**
 * Recursively copy directory
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Plugin to wrap content script as IIFE
 */
function wrapContentScriptPlugin() {
  return {
    name: 'wrap-content-script',
    writeBundle() {
      const distDir = path.join(__dirname, 'dist-extension');
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
function copyAssetsPlugin() {
  return {
    name: 'copy-assets',
    closeBundle() {
      const rootDir = __dirname;
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
        copyDir(resDir, distResDir);
      }
      
      if (fs.existsSync(iconsDir)) {
        console.log(`[copy-assets] Copying ${iconsDir} to ${distIconsDir}`);
        copyDir(iconsDir, distIconsDir);
      }
      
      if (fs.existsSync(manifestFile)) {
        console.log(`[copy-assets] Copying ${manifestFile} to ${distManifestFile}`);
        fs.copyFileSync(manifestFile, distManifestFile);
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
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    wrapContentScriptPlugin(), // Wrap content script as IIFE
    copyAssetsPlugin(), // Copy assets and manifest to dist-extension
  ],
  
  build: {
    outDir: 'dist-extension',
    emptyOutDir: true,
    
    rollupOptions: {
      input: {
        // Background service worker
        background: resolve(__dirname, 'extension/background/index.js'),
        
        // Content script
        content: resolve(__dirname, 'extension/content/index.js'),
        
        // Content script React app
        'content-app': resolve(__dirname, 'extension/content/app.jsx'),
        
        // Content script styles (for shadow DOM)
        'content-styles': resolve(__dirname, 'extension/content/styles.css'),
        
        // Offscreen document HTML (will automatically bundle the referenced offscreen.js)
        'offscreen': resolve(__dirname, 'extension/offscreen/offscreen.html'),
      },
      
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Don't hash content-styles.css for easy loading
          if (assetInfo.name === 'content-styles.css') {
            return 'content-styles.css';
          }
          return 'assets/[name]-[hash][extname]';
        },
        format: 'es', // ES modules for tree-shaking and modern browsers
        
        // Separate chunks for better caching - function format for Vite 7
        manualChunks(id) {
          // React and React DOM in one chunk
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          // Babylon.js and babylon-mmd in one chunk
          if (id.includes('node_modules/@babylonjs') || id.includes('node_modules/babylon-mmd')) {
            return 'babylon-vendor';
          }
          // Services in one chunk
          if (id.includes('src/services/AIService') || 
              id.includes('src/services/TTSService') || 
              id.includes('src/services/STTService')) {
            return 'services';
          }
        },
      },
    },
    
    // Source maps for debugging
    sourcemap: !isProduction,
    
    // Minify for production
    minify: isProduction ? 'terser' : false,
    
    terserOptions: {
      compress: {
        drop_console: isProduction,
      },
    },
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@services': resolve(__dirname, './src/services'),
      '@components': resolve(__dirname, './src/components'),
      '@utils': resolve(__dirname, './src/utils'),
      '@extension': resolve(__dirname, './extension'),
    },
  },
  
  // Server config for dev mode (not used in extension build)
  server: {
    port: 3000,
    open: true,
  },
});
