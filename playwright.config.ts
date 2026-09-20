import { availableParallelism } from "node:os";
import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const captureDebugArtifacts = isCI || process.env.PW_CAPTURE_ARTIFACTS === "1";
const localWorkers = Math.min(4, Math.max(1, availableParallelism() - 2));

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 50_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : localWorkers,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: captureDebugArtifacts ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
    video: captureDebugArtifacts ? "retain-on-failure" : "off",
    testIdAttribute: "data-testid",
  },
  webServer: {
    command:
      "cross-env VITE_VASSIST_TEST_MODE=1 VITE_VASSIST_DISABLE_CAMERA=1 VITE_VASSIST_DISABLE_MIC=1 VITE_VASSIST_DISABLE_TTS=1 VITE_VASSIST_DISABLE_STT=1 VITE_VASSIST_FAKE_AI=1 vite --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 50_000,
  },
  projects: [
    {
      name: "web-chromium",
      testMatch: /web\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: "extension-chromium",
      testMatch: /extension\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: "electron",
      testMatch: /electron\/.*\.spec\.ts/,
      workers: 1,
    },
  ],
});
