import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { extensionTestHostPlugin } from "./tools/vite-plugins/extension-test-host-plugin.js";
import { vadAssetsPlugin } from "./tools/vite-plugins/vad-assets-plugin";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";

  return {
    plugins: [
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler"]],
        },
      }),
      tailwindcss(),
      vadAssetsPlugin("dist"),
      extensionTestHostPlugin(),
    ],
    publicDir: "public",
    define: {
      // Build-time constants for mode detection
      __EXTENSION_MODE__: JSON.stringify(false),
      __ANDROID_MODE__: JSON.stringify(false),
      __DESKTOP_MODE__: JSON.stringify(false),
      __EMBED_MODE__: JSON.stringify(false),
      __DEV_MODE__: JSON.stringify(!isProduction),
      __PROD_MODE__: JSON.stringify(isProduction),
    },
    server: {
      headers: {
        // Required for SharedArrayBuffer support in babylon-mmd bullet physics
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
      watch: {
        ignored: [
          "**/electron/server/**",
          "**/android/**",
          "**/dist-android/**",
          "**/dist-desktop/**",
          "**/dist-extension/**",
          "**/release/**",
        ],
      },
      warmup: {
        clientFiles: [
          "./src/main.tsx",
          "./src/App.jsx",
          "./src/components/**/*.jsx",
          "./src/services/**/*.js",
          "./src/hooks/**/*.js",
        ],
      },
      fs: {
        deny: [
          "**/electron/server/**",
          "**/.git/**",
          "**/node_modules/**/.git/**",
        ],
      },
    },
    preview: {
      headers: {
        // Required for SharedArrayBuffer support in babylon-mmd bullet physics
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
    build: {
      sourcemap: !isProduction,
      minify: isProduction ? "esbuild" : false,
      rollupOptions: {
        output: {
          manualChunks: () => null,
        },
      },
      chunkSizeWarningLimit: 50000,
    },
    worker: {
      format: "es", // Use ES modules for workers
      plugins: () => [],
    },
    assetsInclude: ["**/*.wasm"],
    optimizeDeps: {
      entries: ["index.html"],
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "@ricky0123/vad-web",
        "onnxruntime-web",
        "onnxruntime-web/wasm",
      ],
      exclude: ["@babylonjs/havok", "@huggingface/transformers", "kokoro-js"],
    },
  };
});
