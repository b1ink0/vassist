import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const [packageDir, ...entryNames] = process.argv.slice(2);

if (!packageDir || entryNames.length === 0) {
  throw new Error(
    "Usage: bun tools/write-package-type-entries.ts <package-dir> <entry...>",
  );
}

const normalizedPackageDir = packageDir.replace(/\\/g, "/");
const distDir = path.resolve(repoRoot, packageDir, "dist");
const typesBaseImportPath = `./types/${normalizedPackageDir}/src`;

await mkdir(distDir, { recursive: true });

await Promise.all(
  entryNames.map(async (entryName) => {
    const entryImportPath = `${typesBaseImportPath}/${entryName}`;
    const filePath = path.join(distDir, `${entryName}.d.ts`);
    await writeFile(filePath, `export * from \"${entryImportPath}\";\n`);
  }),
);
