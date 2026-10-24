import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function excludeStageAssetsPlugin(outDir: string): Plugin {
  return {
    name: "exclude-native-stage-assets",
    apply: "build",
    closeBundle() {
      const output = path.resolve(projectRoot, outDir);
      if (!output.startsWith(`${projectRoot}${path.sep}`)) return;
      for (const directory of ["stages", "stage-previews"]) {
        const target = path.join(output, "res/assets", directory);
        if (fs.existsSync(target))
          fs.rmSync(target, { recursive: true, force: true });
      }
    },
  };
}
