import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export type ViteAppTarget =
  | "web"
  | "extension"
  | "android"
  | "desktop"
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
