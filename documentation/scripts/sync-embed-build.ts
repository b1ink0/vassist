import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const repositoryRoot = path.resolve(scriptDir, "..", "..");
const embedSourceDir = path.join(repositoryRoot, "dist-embed");
const docsEmbedDir = path.join(
  repositoryRoot,
  "documentation",
  "site",
  "public",
  "embed",
);

try {
  await stat(embedSourceDir);
} catch {
  throw new Error(
    `Embed build output not found at ${embedSourceDir}. Run the embed build first.`,
  );
}

await rm(docsEmbedDir, { force: true, recursive: true });
await mkdir(docsEmbedDir, { recursive: true });
await cp(embedSourceDir, docsEmbedDir, { recursive: true });

console.log(
  `Synced embed build to ${path.relative(repositoryRoot, docsEmbedDir)}`,
);
