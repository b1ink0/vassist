import { test as base, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { _electron as electron } from "playwright";
import path from "node:path";
import {
  flushConfigSaves,
  openChatPanel,
  openHistoryPanel,
  openSettingsPanel,
  seedChatHistory,
  seedCompletedReadyStateInPlace,
  seedSetupWizardStateInPlace,
  type SeedCompletedAppStateOptions,
  type SeedSetupWizardStateOptions,
} from "../helpers/testApi";
import type { SharedUIFixtures } from "./shared";

type ElectronFixtures = SharedUIFixtures & {
  electronApp: ElectronApplication;
  inputWindow: Page;
};

const DESKTOP_TEST_WIDTH = 1440;
const DESKTOP_TEST_HEIGHT = 960;

const desktopMainPath = path.resolve(
  process.cwd(),
  process.env.PW_DESKTOP_MAIN || "dist-desktop/app.js",
);

const electronEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "development",
  VITE_VASSIST_TEST_MODE: "1",
  VITE_VASSIST_DISABLE_CAMERA: "1",
  VITE_VASSIST_DISABLE_MIC: "1",
  VITE_VASSIST_DISABLE_TTS: "1",
  VITE_VASSIST_DISABLE_STT: "1",
  VITE_VASSIST_DISABLE_HEAVY_MODEL_LOADING: "1",
  VITE_VASSIST_FAKE_AI: "1",
};

const waitForMainWindow = async (
  electronApp: ElectronApplication,
): Promise<Page> => {
  const existingMainWindow = electronApp
    .windows()
    .find((windowPage) => !windowPage.url().includes("?window=input"));

  if (existingMainWindow) {
    await existingMainWindow.waitForLoadState("domcontentloaded");
    return existingMainWindow;
  }

  const firstWindow = await electronApp.firstWindow();
  await firstWindow.waitForLoadState("domcontentloaded");

  if (!firstWindow.url().includes("?window=input")) {
    return firstWindow;
  }

  const nextWindow = await electronApp.waitForEvent("window");
  await nextWindow.waitForLoadState("domcontentloaded");
  return nextWindow;
};

const waitForInputWindow = async (
  electronApp: ElectronApplication,
): Promise<Page> => {
  const existingInputWindow = electronApp
    .windows()
    .find((windowPage) => windowPage.url().includes("?window=input"));

  if (existingInputWindow) {
    await existingInputWindow.waitForLoadState("domcontentloaded");
    return existingInputWindow;
  }

  const inputWindow = await electronApp.waitForEvent("window");
  await inputWindow.waitForLoadState("domcontentloaded");
  return inputWindow;
};

const withElectronDefaults = (
  options: SeedCompletedAppStateOptions = {},
): SeedCompletedAppStateOptions => ({
  ...options,
  uiConfig: {
    enableModelLoading: false,
    ...(options.uiConfig ?? {}),
  },
});

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const electronApp = await electron.launch({
      args: [desktopMainPath],
      env: electronEnv,
    });

    try {
      await use(electronApp);
    } finally {
      const electronProcess = electronApp.process();

      try {
        await electronApp.evaluate(({ app }) => {
          (app as { isQuitting?: boolean }).isQuitting = true;
          app.quit();
        });
      } catch {
        // Fall through to the normal Playwright shutdown path.
      }

      try {
        await electronApp.close();
      } finally {
        if (electronProcess && !electronProcess.killed) {
          electronProcess.kill();
        }
      }
    }
  },

  page: async ({ electronApp }, use) => {
    const mainWindow = await waitForMainWindow(electronApp);

    const browserWindow = await electronApp.browserWindow(mainWindow);
    await browserWindow.evaluate(
      (window, bounds) => {
        window.setBounds(bounds);
        window.show();
      },
      {
        x: 0,
        y: 0,
        width: DESKTOP_TEST_WIDTH,
        height: DESKTOP_TEST_HEIGHT,
      },
    );
    await mainWindow.waitForFunction(
      ({ width, height }) =>
        window.innerWidth >= width - 80 && window.innerHeight >= height - 120,
      {
        width: DESKTOP_TEST_WIDTH,
        height: DESKTOP_TEST_HEIGHT,
      },
    );

    await use(mainWindow);
  },

  inputWindow: async ({ electronApp, page }, use) => {
    await expect(page).toBeTruthy();
    const inputWindow = await waitForInputWindow(electronApp);
    await use(inputWindow);
  },

  seedCompletedAppState: async ({ page }, use) => {
    await use(async (options = {}) => {
      await seedCompletedReadyStateInPlace(page, withElectronDefaults(options));
    });
  },

  seedSetupWizardAppState: async ({ page }, use) => {
    await use(async (options = {}) => {
      await seedSetupWizardStateInPlace(page, withElectronDefaults(options));
    });
  },

  seedChatHistoryEntries: async ({ page }, use) => {
    await use(async (entries) => {
      await seedChatHistory(page, entries);
    });
  },

  seedSettingsAppState: async ({ page }, use) => {
    await use(async (options = {}) => {
      await seedCompletedReadyStateInPlace(page, withElectronDefaults(options));
    });
  },

  flushConfigSaves: async ({ page }, use) => {
    await use(async (kinds) => {
      await flushConfigSaves(page, kinds);
    });
  },

  openChat: async ({ page }, use) => {
    await use(async () => {
      await openChatPanel(page);
    });
  },

  openHistory: async ({ page }, use) => {
    await use(async () => {
      await openHistoryPanel(page);
    });
  },

  openSettings: async ({ page }, use) => {
    await use(async () => {
      await openSettingsPanel(page);
    });
  },
});

export { expect };
