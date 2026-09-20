import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import {
  EXTENSION_TEST_HOST_FILE,
  EXTENSION_TEST_HOST_ROUTE,
} from "../../tests/extensionTestHost";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..", "..");

export function extensionTestHostPlugin(): Plugin {
  const extensionHostFilePath = path.join(rootDir, EXTENSION_TEST_HOST_FILE);

  return {
    name: "vassist-extension-test-host",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      if (process.env.VITE_VASSIST_TEST_MODE !== "1") {
        return;
      }

      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const requestUrl = req.url
            ? new URL(req.url, "http://127.0.0.1")
            : null;

          if (requestUrl?.pathname !== EXTENSION_TEST_HOST_ROUTE) {
            next();
            return;
          }

          const html = fs.readFileSync(extensionHostFilePath, "utf8");
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        },
      );
    },
  };
}
