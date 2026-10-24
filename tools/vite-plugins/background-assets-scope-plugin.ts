import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(pluginDir, "..", "..");

/** Removes app-only bundled backgrounds from builds that do not render them. */
export function excludeBackgroundAssetsPlugin(outDir: string): Plugin {
  return {
    name: "exclude-app-background-assets",
    apply: "build",
    closeBundle() {
      const outputDir = path.resolve(rootDir, outDir);
      const rootPrefix = `${path.resolve(rootDir)}${path.sep}`;
      if (!outputDir.startsWith(rootPrefix)) return;

      const backgroundDir = path.join(outputDir, "res", "assets", "backgrounds");
      if (fs.existsSync(backgroundDir)) {
        fs.rmSync(backgroundDir, { recursive: true, force: true });
      }
    },
  };
}
