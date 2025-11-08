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
import path from 'path';
import { wrapContentScriptPlugin, copyAssetsPlugin } from './tools/vite-plugins/extension-plugins.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  const shouldZip = process.env.ZIP === 'true';
  
  return {
    plugins: [
      react(),
      tailwindcss(),
      wrapContentScriptPlugin(), // Wrap content script as IIFE
      copyAssetsPlugin(shouldZip), // Copy assets and manifest to dist-extension
    ],
    
    define: {
      // Build-time constants for mode detection
      __EXTENSION_MODE__: JSON.stringify(true),
      __DEV_MODE__: JSON.stringify(!isProduction),
    },
    
    build: {
      outDir: 'dist-extension',
      emptyOutDir: true,
      
      // Minify for production using esbuild
      minify: isProduction ? 'esbuild' : false,
      
      // Disable module preload polyfill for extensions (causes issues with dynamic imports)
      modulePreload: false,
      
      rollupOptions: {
        input: {
          // Background service worker
          background: resolve(__dirname, 'extension/background/index.js'),
          
          // Content script
          content: resolve(__dirname, 'extension/content/index.js'),
          
          // Content script React app (main entry point)
          'content-app': resolve(__dirname, 'extension/content/main.jsx'),
          
          // Content script styles (for shadow DOM)
          'content-styles': resolve(__dirname, 'extension/content/styles.css'),
          
          // Offscreen document HTML (will automatically bundle the referenced offscreen.js)
          'offscreen': resolve(__dirname, 'extension/offscreen/offscreen.html'),
        },
        
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: (assetInfo) => {
            // Don't hash content-styles.css for easy loading
            if (assetInfo.name === 'content-styles.css') {
              return 'content-styles.css';
            }
            return 'assets/[name][extname]';
          },
          format: 'es',
          
          // Prevent code splitting - inline everything
          manualChunks: undefined,
        },
      },
      
      // Source maps for debugging
      sourcemap: !isProduction,
      
      // Disable code splitting
      chunkSizeWarningLimit: 50000,
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
  };
});
