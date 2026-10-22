import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { packageRuntimeAssetsPlugin } from "../../tools/vite-plugins/package-runtime-assets-plugin";
import { vadAssetsPlugin } from "../../tools/vite-plugins/vad-assets-plugin";
import { excludeBackgroundAssetsPlugin } from "../../tools/vite-plugins/background-assets-scope-plugin";
import {
  createReactPlugin,
  createViteDefines,
} from "../../tools/vite/shared-config";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  root: repoRoot,
  plugins: [
    createReactPlugin(true),
    tailwindcss(),
    vadAssetsPlugin("packages/react/dist"),
    packageRuntimeAssetsPlugin("packages/react/dist"),
    excludeBackgroundAssetsPlugin("packages/react/dist"),
  ],
  define: createViteDefines(true, "embed"),
  assetsInclude: ["**/*.wasm"],
  build: {
    outDir: "packages/react/dist",
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    target: "esnext",
    copyPublicDir: false,
    lib: {
      entry: {
        index: resolve(repoRoot, "packages/react/src/index.tsx"),
        full: resolve(repoRoot, "packages/react/src/full.tsx"),
        chat: resolve(repoRoot, "packages/react/src/chat.tsx"),
        "chat-toolbar": resolve(
          repoRoot,
          "packages/react/src/chat-toolbar.tsx",
        ),
        toolbar: resolve(repoRoot, "packages/react/src/toolbar.tsx"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
