import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { vadAssetsPlugin } from "./tools/vite-plugins/vad-assets-plugin";

export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";
  const nodeEnv = isProduction ? "production" : "development";

  return {
    plugins: [
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler"]],
        },
      }),
      tailwindcss(),
      vadAssetsPlugin("dist-embed"),
    ],
    publicDir: "public",
    define: {
      __EXTENSION_MODE__: JSON.stringify(false),
      __ANDROID_MODE__: JSON.stringify(false),
      __DESKTOP_MODE__: JSON.stringify(false),
      __EMBED_MODE__: JSON.stringify(true),
      __DEV_MODE__: JSON.stringify(true),
      __PROD_MODE__: JSON.stringify(false),
      "process.env.NODE_ENV": JSON.stringify(nodeEnv),
      "process.env": JSON.stringify({ NODE_ENV: nodeEnv }),
    },
    build: {
      outDir: "dist-embed",
      emptyOutDir: true,
      sourcemap: !isProduction,
      minify: isProduction ? "esbuild" : false,
      lib: {
        entry: "embed/main.tsx",
        formats: ["es"],
        fileName: () => "vassist-embed.js",
      },
      rollupOptions: {
        output: {
          assetFileNames: isProduction
            ? "assets/[name]-[hash][extname]"
            : "assets/[name][extname]",
          chunkFileNames: isProduction
            ? "assets/[name]-[hash].js"
            : "assets/[name].js",
          entryFileNames: () => "vassist-embed.js",
        },
      },
      chunkSizeWarningLimit: 50000,
    },
    worker: {
      format: "es",
    },
  };
});
