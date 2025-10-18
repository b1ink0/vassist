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
  define: {
    // Build-time constants for mode detection
    __EXTENSION_MODE__: JSON.stringify(false),
    __DEV_MODE__: JSON.stringify(true),
  },
  build: {
    sourcemap: true,
  },
  worker: {
    format: 'es', // Use ES modules for workers
    plugins: () => [],
  },
})
