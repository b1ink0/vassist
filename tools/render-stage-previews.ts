import { build } from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILT_IN_STAGES,
  type BuiltInStageId,
} from "../src/config/stageConfig.ts";
import type {} from "./stage-previews/browser";
import { syncDocumentationPreviews } from "./sync-doc-preview-assets";

// Run with bun tools/render-stage-previews.ts [stage-id ...]. Requires installed Edge.
const root = fileURLToPath(new URL("../", import.meta.url));
const requested = process.argv.slice(2);
const ids = requested.length
  ? [...new Set(requested)]
  : BUILT_IN_STAGES.map(({ id }) => id);
for (const id of ids) {
  if (!BUILT_IN_STAGES.some((stage) => stage.id === id))
    throw new Error("Unknown built-in stage: " + id);
}
const publicRoot = path.join(root, "public");
const bundle = await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, "tools/stage-previews/browser.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
});
const javascript = bundle.outputFiles[0]?.contents;
if (!javascript) throw new Error("Stage preview bundle was empty");
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<style>body{margin:0}canvas{display:block;width:480px;height:300px}</style><canvas width="480" height="300"></canvas><script type="module" src="/preview.js"></script>',
      );
    } else if (url.pathname === "/preview.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(javascript);
    } else {
      if (!url.pathname.startsWith("/res/assets/stages/"))
        throw new Error("Not a stage asset");
      const file = path.resolve(
        publicRoot,
        "." + decodeURIComponent(url.pathname),
      );
      if (!file.startsWith(publicRoot + path.sep))
        throw new Error("Invalid asset path");
      const mime: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".glb": "model/gltf-binary",
        ".hdr": "application/octet-stream",
      };
      res.setHeader(
        "Content-Type",
        mime[path.extname(file)] ?? "application/octet-stream",
      );
      res.end(await readFile(file));
    }
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("No preview server address");
let browser;
try {
  browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("requestfailed", (request) =>
    failures.push(request.url() + ": " + request.failure()?.errorText),
  );
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      response.url().includes("/res/assets/stages/")
    )
      failures.push(response.status() + ": " + response.url());
  });
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.waitForFunction(() => typeof window.renderStage === "function");
  const output = path.join(publicRoot, "res/assets/stage-previews");
  await mkdir(output, { recursive: true });
  const rendered = new Map<string, Buffer>();
  for (const id of ids) {
    await page.evaluate(async (stageId) => {
      await window.renderStage(stageId);
    }, id as BuiltInStageId);
    if (failures.length)
      throw new Error("Stage " + id + " failed:\n" + failures.join("\n"));
    const png = await page.locator("canvas").screenshot();
    const preview = sharp(png);
    // Lift the near-black studio for small thumbnails without changing the stage.
    if (id === "ink") preview.linear(3.5, 10);
    const image = await preview.webp({ quality: 80 }).toBuffer();
    rendered.set(id, image);
    console.log(`${id}: ${image.length} bytes`);
  }
  // Publish only after every requested render succeeded. Keep the encoded bytes.
  for (const [id, image] of rendered)
    await writeFile(path.join(output, id + ".webp"), image);
  await syncDocumentationPreviews();
} finally {
  try {
    await browser?.close();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
