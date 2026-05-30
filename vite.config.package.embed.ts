import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { vadAssetsPlugin } from "./tools/vite-plugins/vad-assets-plugin";

const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: repoRoot,
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
    vadAssetsPlugin("packages/embed/dist"),
  ],
  define: {
    __EXTENSION_MODE__: JSON.stringify(false),
    __ANDROID_MODE__: JSON.stringify(false),
    __DESKTOP_MODE__: JSON.stringify(false),
    __EMBED_MODE__: JSON.stringify(true),
    __DEV_MODE__: JSON.stringify(false),
    __PROD_MODE__: JSON.stringify(true),
  },
  assetsInclude: ["**/*.wasm"],
  build: {
    outDir: "packages/embed/dist",
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    target: "esnext",
    copyPublicDir: false,
    lib: {
      entry: {
        index: resolve(repoRoot, "packages/embed/src/index.ts"),
        full: resolve(repoRoot, "packages/embed/src/full.ts"),
        chat: resolve(repoRoot, "packages/embed/src/chat.ts"),
        "chat-toolbar": resolve(repoRoot, "packages/embed/src/chat-toolbar.ts"),
        toolbar: resolve(repoRoot, "packages/embed/src/toolbar.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
