/**
 * Vite Configuration for Electron Desktop Build
 * Creates a transparent window app without demo site background
 */

/* eslint-env node */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron/simple';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  
  return {
    publicDir: 'public',
    
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),
      tailwindcss(),
      electron({
        main: {
          // Main process entry point
          entry: 'electron/main.js',
          onstart(args) {
            if (args.startup) {
              args.startup(['--inspect=5858', '.']);
            } else {
              args.reload();
            }
          },
          vite: {
            build: {
              outDir: 'dist-desktop',
              minify: isProduction ? 'esbuild' : false,
              sourcemap: !isProduction,
              rollupOptions: {
                external: ['electron'],
              },
            },
          },
        },
        preload: {
          // Preload script for secure IPC
          entry: 'electron/preload.js',
          vite: {
            build: {
              outDir: 'dist-desktop',
              minify: isProduction ? 'esbuild' : false,
              sourcemap: !isProduction,
              rollupOptions: {
                external: ['electron'],
              },
            },
          },
        },
        // Use Node.js API in the renderer process
        renderer: {
          resolve: {
            // Tell renderer to use electron/index.html
            '@electron-renderer': {
              find: '@electron-renderer',
              replacement: resolve(__dirname, './electron'),
            },
          },
        },
      }),
    ],
    
    define: {
      // Build-time constants for mode detection
      __EXTENSION_MODE__: JSON.stringify(false),
      __DESKTOP_MODE__: JSON.stringify(true),
      __DEV_MODE__: JSON.stringify(!isProduction),
    },
    
    build: {
      outDir: 'dist-desktop',
      emptyOutDir: false,
      sourcemap: !isProduction,
      minify: isProduction ? 'esbuild' : false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/index.html'),
        },
        output: {
          manualChunks: () => null,
        },
      },
      chunkSizeWarningLimit: 50000,
    },
    
    worker: {
      format: 'es',
      plugins: () => [],
    },
    
    assetsInclude: ['**/*.wasm'],
    
    optimizeDeps: {
      exclude: [
        '@babylonjs/havok',
        '@huggingface/transformers',
        'kokoro-js',
        'onnxruntime-web',
      ],
    },
    
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        '@services': resolve(__dirname, './src/services'),
        '@components': resolve(__dirname, './src/components'),
        '@utils': resolve(__dirname, './src/utils'),
      },
    },
    
    server: {
      port: 3001,
      fs: {
        // Allow serving files from the public directory
        allow: ['..'],
      },
    },
  };
});
