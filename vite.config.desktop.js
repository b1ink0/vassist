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
import fs from 'fs';

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
      isProduction && {
        name: 'copy-server-files-production',
        closeBundle() {
          const serverSrc = resolve(__dirname, 'electron/server');
          const serverDest = resolve(__dirname, 'dist-desktop/server');
          
          if (fs.existsSync(serverSrc)) {
            fs.cpSync(serverSrc, serverDest, { 
              recursive: true,
              filter: (src) => {
                const basename = path.basename(src);
                return !basename.match(/^(\.git|node_modules|__pycache__|\.pytest_cache)$/);
              }
            });
            console.log('✓ Copied server files to dist-desktop/server');
          }
        },
      },
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
                external: [
                  'electron',
                  'node-llama-cpp',
                  'express',
                  'axios',
                  'form-data',
                  'multer',
                  'util',
                  'stream'
                ],
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
                external: [
                  'electron',
                  'node-llama-cpp',
                  'express',
                  'axios',
                  'form-data',
                  'multer',
                  'util',
                  'stream'
                ],
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
    ].filter(Boolean),
    
    define: {
      // Build-time constants for mode detection
      __EXTENSION_MODE__: JSON.stringify(false),
      __DESKTOP_MODE__: JSON.stringify(true),
      __DEV_MODE__: JSON.stringify(!isProduction),
      __PROD_MODE__: JSON.stringify(isProduction),
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
      modulePreload: {
        polyfill: false,
      },
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
      include: [
        'react',
        'react-dom',
      ],
      force: false,
      esbuildOptions: {
        target: 'esnext',
      },
      holdUntilCrawlEnd: true,
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
      strictPort: true,
      fs: {
        // Allow serving files from the public directory
        allow: ['..'],
      },
      hmr: {
        overlay: true,
        host: 'localhost',
        protocol: 'ws',
        port: 3001,
      },
      warmup: {
        clientFiles: [
          './src/App.jsx',
          './src/main.jsx',
          './src/components/**/*.jsx',
        ],
      },
      middlewareMode: false,
      preTransformRequests: false,
    },
    
    cacheDir: 'node_modules/.vite',
  };
});
