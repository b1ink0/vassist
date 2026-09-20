import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

const ABSOLUTE_ASSET_REFERENCE_PATTERN = /(["'])\/assets\/([^"'?#]+)\1/g;
const ABSOLUTE_ASSET_BASE_PATH = 'return "/assets/";';
const RUNTIME_ASSET_MODULE_NAME = "runtime-assets.js";

type FileRewrite = {
  filePath: string;
  assetNames: string[];
  replaceAssetBasePath: boolean;
};

const toPosixPath = (value: string): string => value.replaceAll("\\", "/");

const toIdentifier = (assetName: string): string =>
  `assetUrl_${assetName.replace(/[^A-Za-z0-9_$]/g, "_")}`;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getImportPath = (fromFilePath: string, toFilePath: string): string => {
  const relativePath = toPosixPath(relative(dirname(fromFilePath), toFilePath));
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
};

const getJavaScriptFiles = async (directoryPath: string): Promise<string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return getJavaScriptFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
    }),
  );
  return files.flat();
};

const getMatchedAssetNames = (source: string): string[] =>
  Array.from(
    new Set(
      Array.from(
        source.matchAll(ABSOLUTE_ASSET_REFERENCE_PATTERN),
        (match) => match[2],
      ).filter((assetName): assetName is string => assetName !== undefined),
    ),
  );

const addImport = (
  source: string,
  importPath: string,
  importedNames: string[],
): string => {
  const importStatement = `import { ${importedNames.join(", ")} } from ${JSON.stringify(importPath)};\n`;
  const leadingImports = source.match(/^(?:import[^\n]*;\n)+/);

  if (leadingImports) {
    const insertionIndex = leadingImports[0].length;
    return `${source.slice(0, insertionIndex)}${importStatement}${source.slice(insertionIndex)}`;
  }

  return `${importStatement}${source}`;
};

export function packageRuntimeAssetsPlugin(outputDirectory: string): Plugin {
  let resolvedConfig: ResolvedConfig | null = null;

  return {
    name: "package-runtime-assets-plugin",
    apply: "build",
    configResolved(config) {
      resolvedConfig = config;
    },
    async closeBundle() {
      if (!resolvedConfig) {
        return;
      }

      const outputPath = resolve(resolvedConfig.root, outputDirectory);
      const assetsPath = join(outputPath, "assets");

      if (!existsSync(outputPath) || !existsSync(assetsPath)) {
        return;
      }

      const jsFiles = await getJavaScriptFiles(outputPath);
      const rewrites: FileRewrite[] = [];
      const referencedAssets = new Set<string>();

      for (const filePath of jsFiles) {
        if (filePath.endsWith(RUNTIME_ASSET_MODULE_NAME)) {
          continue;
        }

        const source = await readFile(filePath, "utf8");
        const assetNames = getMatchedAssetNames(source);
        const replaceAssetBasePath = source.includes(ABSOLUTE_ASSET_BASE_PATH);

        if (!assetNames.length && !replaceAssetBasePath) {
          continue;
        }

        for (const assetName of assetNames) {
          referencedAssets.add(assetName);
        }

        rewrites.push({
          filePath,
          assetNames,
          replaceAssetBasePath,
        });
      }

      if (!rewrites.length) {
        return;
      }

      const missingAssets = Array.from(referencedAssets)
        .sort()
        .filter((assetName) => !existsSync(join(assetsPath, assetName)));

      if (missingAssets.length > 0) {
        throw new Error(
          `package-runtime-assets-plugin could not find emitted assets: ${missingAssets.join(", ")}`,
        );
      }

      const runtimeAssetModulePath = join(
        outputPath,
        RUNTIME_ASSET_MODULE_NAME,
      );
      const runtimeAssetModule = [
        'export const embedAssetBaseUrl = new URL("./assets/", import.meta.url).href;',
        ...Array.from(referencedAssets)
          .sort()
          .map((assetName) => {
            const exportName = toIdentifier(assetName);
            return `export const ${exportName} = new URL(${JSON.stringify(`./assets/${assetName}`)}, import.meta.url).href;`;
          }),
        "",
      ].join("\n");

      await mkdir(dirname(runtimeAssetModulePath), { recursive: true });
      await writeFile(runtimeAssetModulePath, runtimeAssetModule, "utf8");

      for (const rewrite of rewrites) {
        let source = await readFile(rewrite.filePath, "utf8");
        const importNames = [
          ...rewrite.assetNames.map(toIdentifier),
          ...(rewrite.replaceAssetBasePath ? ["embedAssetBaseUrl"] : []),
        ].sort();

        source = addImport(
          source,
          getImportPath(rewrite.filePath, runtimeAssetModulePath),
          importNames,
        );

        for (const assetName of rewrite.assetNames) {
          const exportName = toIdentifier(assetName);
          const assetPattern = new RegExp(
            `(["'])/assets/${escapeRegExp(assetName)}\\1`,
            "g",
          );
          source = source.replace(assetPattern, exportName);
        }

        if (rewrite.replaceAssetBasePath) {
          source = source.replace(
            ABSOLUTE_ASSET_BASE_PATH,
            "return embedAssetBaseUrl;",
          );
        }

        await writeFile(rewrite.filePath, source, "utf8");
      }
    },
  };
}
