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
            const filesToCopy = [
              { src: 'http-server.js', dest: 'http-server.js' },
              { src: 'whisper-stt', dest: 'whisper-stt', isDir: true },
            ];
            
            // Create dest directory
            if (!fs.existsSync(serverDest)) {
              fs.mkdirSync(serverDest, { recursive: true });
            }
            
            filesToCopy.forEach(({ src, dest, isDir }) => {
              const srcPath = path.join(serverSrc, src);
              const destPath = path.join(serverDest, dest);
              
              if (fs.existsSync(srcPath)) {
                if (isDir) {
                  fs.cpSync(srcPath, destPath, { recursive: true });
                } else {
                  fs.copyFileSync(srcPath, destPath);
                }
              }
            });
            
            // Copy gpt-sovits folder but exclude python/, GPT-SoVITS/, models/, temp/
            const gptsovitsSrc = path.join(serverSrc, 'gpt-sovits');
            const gptsovitsDest = path.join(serverDest, 'gpt-sovits');
            
            if (fs.existsSync(gptsovitsSrc)) {
              fs.cpSync(gptsovitsSrc, gptsovitsDest, {
                recursive: true,
                filter: (src) => {
                  const basename = path.basename(src);
                  const relativePath = path.relative(gptsovitsSrc, src);
                  
                  // Exclude large/runtime folders
                  if (relativePath.startsWith('python') || 
                      relativePath.startsWith('GPT-SoVITS') || 
                      relativePath.startsWith('models') || 
                      relativePath.startsWith('temp')) {
                    return false;
                  }
                  
                  // Exclude common temp/cache files
                  if (basename.match(/^(\.git|node_modules|__pycache__|\.pytest_cache)$/)) {
                    return false;
                  }
                  
                  return true;
                }
              });
            }
            
            // Create models directory for LLM models
            const modelsDir = path.join(serverDest, 'models');
            if (!fs.existsSync(modelsDir)) {
              fs.mkdirSync(modelsDir, { recursive: true });
            }
            
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
                  'stream',
                  'unzipper'
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
                  'stream',
                  'unzipper'
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
      watch: {
        ignored: [
          '**/electron/server/gpt-sovits/python/**',
          '**/electron/server/gpt-sovits/GPT-SoVITS/**',
          '**/electron/server/gpt-sovits/models/**',
          '**/electron/server/gpt-sovits/temp/**',
          '**/electron/server/models/**',
          '**/node_modules/**',
          '**/.git/**',
        ],
      },
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
