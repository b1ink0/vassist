import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

export function thirdPartyLicensesPlugin(): Plugin {
  const noticePath = fileURLToPath(
    new URL("../../licenses/livekit-aura.txt", import.meta.url),
  );
  return {
    name: "vassist-third-party-licenses",
    apply: "build",
    async generateBundle(_options, bundle) {
      const includesAura = Object.values(bundle).some(
        (output) =>
          output.type === "chunk" &&
          Object.entries(output.modules).some(
            ([id, module]) =>
              id
                .replaceAll("\\", "/")
                .endsWith("/chat/voice/AuraRenderer.ts") &&
              module.renderedLength > 0,
          ),
      );
      if (!includesAura) return;
      this.emitFile({
        type: "asset",
        fileName: "THIRD-PARTY-LICENSES.txt",
        source: await readFile(noticePath, "utf8"),
      });
    },
  };
}

export type ViteAppTarget =
  | "web"
  | "extension"
  | "android"
  | "desktop"
  | "xr"
  | "embed";

export function createReactPlugin(withCompiler = false) {
  return withCompiler
    ? react({ babel: { plugins: [["babel-plugin-react-compiler"]] } })
    : react();
}

export function createViteDefines(
  isProduction: boolean,
  target: ViteAppTarget,
) {
  return {
    __EXTENSION_MODE__: JSON.stringify(target === "extension"),
    __ANDROID_MODE__: JSON.stringify(target === "android"),
    __DESKTOP_MODE__: JSON.stringify(target === "desktop"),
    __EMBED_MODE__: JSON.stringify(target === "embed"),
    __XR_MODE__: JSON.stringify(target === "xr"),
    __DEV_MODE__: JSON.stringify(!isProduction),
    __PROD_MODE__: JSON.stringify(isProduction),
  };
}

export function createAppAliases(
  repoRoot: string,
  extraAliases: Record<string, string> = {},
) {
  return {
    "@": resolve(repoRoot, "src"),
    "@services": resolve(repoRoot, "src/services"),
    "@components": resolve(repoRoot, "src/components"),
    "@utils": resolve(repoRoot, "src/utils"),
    ...extraAliases,
  };
}
