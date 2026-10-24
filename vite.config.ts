import { excludeStageAssetsPlugin } from "./tools/vite-plugins/stage-assets-scope-plugin";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { extensionTestHostPlugin } from "./tools/vite-plugins/extension-test-host-plugin.js";
import { vadAssetsPlugin } from "./tools/vite-plugins/vad-assets-plugin";
import { excludeBackgroundAssetsPlugin } from "./tools/vite-plugins/background-assets-scope-plugin";
import {
  createReactPlugin,
  createViteDefines,
} from "./tools/vite/shared-config";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";

  return {
    plugins: [
      createReactPlugin(true),
      tailwindcss(),
      vadAssetsPlugin("dist"),
      excludeBackgroundAssetsPlugin("dist"),
      excludeStageAssetsPlugin("dist"),
      extensionTestHostPlugin(),
    ],
    publicDir: "public",
    define: createViteDefines(isProduction, "web"),
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
