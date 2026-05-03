import fs from "fs";
import path from "path";
import * as tar from "tar";

const rootDir = process.cwd();
const nodeModulesDir = path.join(rootDir, "node_modules");
const outputDir = path.join(rootDir, "electron", "assets", "runtime");
const outputArchivePath = path.join(outputDir, "node-llama-core.tgz");
const stagingRoot = path.join(rootDir, ".tmp", "node-llama-core-staging");
const stagingNodeModulesDir = path.join(stagingRoot, "node_modules");

const copied = new Set<string>();

function packagePath(packageName: string, baseDir: string): string {
  return path.join(baseDir, ...packageName.split("/"));
}

function readJson(jsonPath: string): {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
} {
  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

function copyPackageRecursive(packageName: string, optional = false): void {
  if (!packageName || copied.has(packageName)) {
    return;
  }

  if (packageName.startsWith("@node-llama-cpp/")) {
    return;
  }

  const sourceDir = packagePath(packageName, nodeModulesDir);
  if (!fs.existsSync(sourceDir)) {
    if (optional) {
      return;
    }
    throw new Error(
      `Missing required dependency in node_modules: ${packageName}`,
    );
  }

  copied.add(packageName);

  const destDir = packagePath(packageName, stagingNodeModulesDir);
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.cpSync(sourceDir, destDir, { recursive: true });

  const pkgJsonPath = path.join(sourceDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    return;
  }

  const pkg = readJson(pkgJsonPath);
  const deps = pkg.dependencies || {};
  const optionalDeps = pkg.optionalDependencies || {};

  for (const depName of Object.keys(deps)) {
    copyPackageRecursive(depName, false);
  }

  for (const depName of Object.keys(optionalDeps)) {
    copyPackageRecursive(depName, true);
  }
}

function ensureCleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function main(): Promise<void> {
  const coreSource = path.join(nodeModulesDir, "node-llama-cpp");
  if (!fs.existsSync(coreSource)) {
    throw new Error(
      "node_modules/node-llama-cpp is missing. Install dependencies before building runtime core bundle.",
    );
  }

  ensureCleanDir(stagingRoot);
  fs.mkdirSync(stagingNodeModulesDir, { recursive: true });

  copyPackageRecursive("node-llama-cpp", false);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(outputArchivePath, { force: true });

  await tar.c(
    {
      gzip: true,
      file: outputArchivePath,
      cwd: stagingRoot,
      portable: true,
      noMtime: true,
    },
    ["node_modules"],
  );

  const bytes = fs.statSync(outputArchivePath).size;
  console.log(
    `[runtime-core] Created ${outputArchivePath} (${(bytes / 1024 / 1024).toFixed(2)} MB)`,
  );

  fs.rmSync(stagingRoot, { recursive: true, force: true });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[runtime-core] Failed:", message);
  process.exitCode = 1;
});
