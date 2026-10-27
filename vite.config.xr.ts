import { defineConfig } from "vite";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import {
  createReactPlugin,
  thirdPartyLicensesPlugin,
  createViteDefines,
} from "./tools/vite/shared-config";

/** The shared application with XR enabled, also deployable as a standalone site. */
export default defineConfig(({ mode }) => ({
  publicDir: "public",
  plugins: [createReactPlugin(), thirdPartyLicensesPlugin(), tailwindcss()],
  define: createViteDefines(mode === "production", "xr"),
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    outDir: "dist-xr",
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(import.meta.dirname, "index.html") },
    },
    chunkSizeWarningLimit: 50000,
  },
  worker: { format: "es" },
  assetsInclude: ["**/*.wasm"],
}));
