import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
  ],
  publicDir: 'public',
  define: {
    // Build-time constants for mode detection
    __EXTENSION_MODE__: JSON.stringify(false),
    __DEV_MODE__: JSON.stringify(true),
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: () => null,
      },
    },
    chunkSizeWarningLimit: 50000,
    copyPublicDir: true,
  },
  worker: {
    format: 'es', // Use ES modules for workers
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
})
