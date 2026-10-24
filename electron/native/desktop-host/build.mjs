import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, "../../..");
const electronVersion = require("electron/package.json").version;
const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js");

const result = spawnSync(
  process.execPath,
  [
    nodeGyp,
    "rebuild",
    "--directory",
    directory,
    "--runtime=electron",
    `--target=${electronVersion}`,
    "--dist-url=https://electronjs.org/headers",
    "--",
    "-Dclang=0",
  ],
  {
    cwd: repositoryRoot,
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
