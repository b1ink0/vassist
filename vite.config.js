import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';

  return {
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
      __DESKTOP_MODE__: JSON.stringify(false),
      __DEV_MODE__: JSON.stringify(!isProduction),
    },
    build: {
      sourcemap: !isProduction,
      minify: isProduction ? 'esbuild' : false,
      rollupOptions: {
        output: {
          manualChunks: () => null,
        },
      },
      chunkSizeWarningLimit: 50000,
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
  };
});
