import { excludeStageAssetsPlugin } from "../../tools/vite-plugins/stage-assets-scope-plugin";
import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { packageRuntimeAssetsPlugin } from "../../tools/vite-plugins/package-runtime-assets-plugin";
import { vadAssetsPlugin } from "../../tools/vite-plugins/vad-assets-plugin";
import { excludeBackgroundAssetsPlugin } from "../../tools/vite-plugins/background-assets-scope-plugin";
import {
  createReactPlugin,
  thirdPartyLicensesPlugin,
  createViteDefines,
} from "../../tools/vite/shared-config";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  root: repoRoot,
  plugins: [
    createReactPlugin(true),
    thirdPartyLicensesPlugin(),
    tailwindcss(),
    vadAssetsPlugin("packages/embed/dist"),
    packageRuntimeAssetsPlugin("packages/embed/dist"),
    excludeBackgroundAssetsPlugin("packages/embed/dist"),
    excludeStageAssetsPlugin("packages/embed/dist"),
  ],
  define: createViteDefines(true, "embed"),
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
