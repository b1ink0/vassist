/**
 * Vite Configuration for Android Build (Capacitor)
 * Creates a build for Android live wallpaper app
 */

/* eslint-env node */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Plugin to move index.html from android-src/ subdirectory to root and fix paths
function moveIndexHtmlPlugin() {
  return {
    name: 'move-index-html',
    closeBundle() {
      const srcPath = resolve(__dirname, 'dist-android/android-src/index.html');
      const destPath = resolve(__dirname, 'dist-android/index.html');
      
      if (fs.existsSync(srcPath)) {
        // Read and update the HTML content to fix asset paths
        let content = fs.readFileSync(srcPath, 'utf-8');
        // Fix all relative paths that go up one directory
        content = content.replace(/src="\.\.\/assets\//g, 'src="./assets/');
        content = content.replace(/href="\.\.\/assets\//g, 'href="./assets/');
        content = content.replace(/src="\/android-src\//g, 'src="./');
        fs.writeFileSync(destPath, content);
        fs.unlinkSync(srcPath);
        // Remove empty android-src directory
        const androidSrcDir = resolve(__dirname, 'dist-android/android-src');
        if (fs.existsSync(androidSrcDir) && fs.readdirSync(androidSrcDir).length === 0) {
          fs.rmdirSync(androidSrcDir);
        }
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  
  return {
    // Base path for WebViewAssetLoader: https://vassist.app/
    // Assets will be at /assets/public/assets/*, so we use relative path
    base: './',
    publicDir: 'public',
    
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),
      tailwindcss(),
      moveIndexHtmlPlugin(),
    ],
    
    define: {
      // Build-time constants for mode detection
      __EXTENSION_MODE__: JSON.stringify(false),
      __DESKTOP_MODE__: JSON.stringify(false),
      __ANDROID_MODE__: JSON.stringify(true),
      __DEV_MODE__: JSON.stringify(!isProduction),
    },
    
    build: {
      outDir: 'dist-android',
      emptyOutDir: true,
      sourcemap: !isProduction,
      minify: isProduction ? 'esbuild' : false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'android-src/index.html'),
        },
        output: {
          // Ensure index.html is at root of dist-android
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          manualChunks: () => null,
        },
      },
      // Copy index.html to root
      copyPublicDir: true,
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
      port: 3002,
      fs: {
        allow: ['..'],
      },
    },
  };
});
