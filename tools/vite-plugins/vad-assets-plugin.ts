import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { IncomingMessage, ServerResponse } from "http";
import type { Plugin, ViteDevServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..", "..");

/**
 * Plugin to copy @ricky0123/vad-web assets to build output
 * Copies worklet, ONNX models, and ONNX Runtime WASM files to assets/ folder
 * Also serves them during dev mode
 * @param {string} outDir - Output directory (e.g., 'dist', 'dist-desktop', 'dist-android', 'dist-extension')
 */
export function vadAssetsPlugin(outDir: string): Plugin {
  return {
    name: "vad-assets",

    // Serve VAD assets during dev mode
    configureServer(server: ViteDevServer) {
      const vadDistPath = path.join(
        rootDir,
        "node_modules",
        "@ricky0123",
        "vad-web",
        "dist",
      );
      const onnxDistPath = path.join(
        rootDir,
        "node_modules",
        "onnxruntime-web",
        "dist",
      );

      // Middleware to serve VAD assets from node_modules
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          // Match /assets/*.onnx, /assets/*.wasm, /assets/*.mjs, /assets/vad.worklet.bundle.min.js
          const requestUrl = req.url ?? "";
          const match = requestUrl.match(
            /^\/assets\/(.*\.(onnx|wasm|mjs)|vad\.worklet\.bundle\.min\.js)$/,
          );

          if (match) {
            const filename = match[1];
            if (!filename) {
              next();
              return;
            }
            let filePath;

            // Check VAD dist first
            filePath = path.join(vadDistPath, filename);
            if (!fs.existsSync(filePath)) {
              // Check ONNX Runtime dist
              filePath = path.join(onnxDistPath, filename);
            }

            if (fs.existsSync(filePath)) {
              // Set appropriate content type
              const ext = path.extname(filename);
              const contentTypes: Record<string, string> = {
                ".onnx": "application/octet-stream",
                ".wasm": "application/wasm",
                ".mjs": "application/javascript",
                ".js": "application/javascript",
              };

              res.setHeader(
                "Content-Type",
                contentTypes[ext] || "application/octet-stream",
              );
              res.setHeader("Cache-Control", "public, max-age=31536000");

              const fileStream = fs.createReadStream(filePath);
              fileStream.pipe(res);
              return;
            }
          }

          next();
        },
      );

      console.log(
        "[vad-assets] Dev server configured to serve VAD assets from node_modules",
      );
    },

    closeBundle() {
      const vadDistPath = path.join(
        rootDir,
        "node_modules",
        "@ricky0123",
        "vad-web",
        "dist",
      );
      const onnxDistPath = path.join(
        rootDir,
        "node_modules",
        "onnxruntime-web",
        "dist",
      );

      const distDir = path.join(rootDir, outDir, "assets");

      // Ensure assets directory exists
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      console.log(`[vad-assets] Copying VAD assets to ${outDir}/assets/...`);

      // Copy VAD worklet
      if (fs.existsSync(vadDistPath)) {
        const workletFile = "vad.worklet.bundle.min.js";
        const workletSrc = path.join(vadDistPath, workletFile);
        const workletDest = path.join(distDir, workletFile);

        if (fs.existsSync(workletSrc)) {
          fs.copyFileSync(workletSrc, workletDest);
          console.log(`[vad-assets] ✓ Copied ${workletFile}`);
        }

        // Copy ONNX models
        const onnxFiles = fs
          .readdirSync(vadDistPath)
          .filter((file) => file.endsWith(".onnx"));
        onnxFiles.forEach((file) => {
          const srcFile = path.join(vadDistPath, file);
          const destFile = path.join(distDir, file);
          fs.copyFileSync(srcFile, destFile);
          console.log(`[vad-assets] ✓ Copied ${file}`);
        });
      }

      // Copy ONNX Runtime WASM and MJS files
      if (fs.existsSync(onnxDistPath)) {
        const onnxRuntimeFiles = fs
          .readdirSync(onnxDistPath)
          .filter((file) => file.endsWith(".wasm") || file.endsWith(".mjs"));

        onnxRuntimeFiles.forEach((file) => {
          const srcFile = path.join(onnxDistPath, file);
          const destFile = path.join(distDir, file);
          fs.copyFileSync(srcFile, destFile);
          console.log(`[vad-assets] ✓ Copied ${file}`);
        });
      }

      console.log("[vad-assets] VAD assets copied successfully");
    },
  };
}
