import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  openExtensionHost,
  seedExtensionReadyState,
  seedExtensionSetupWizardState,
} from "../helpers/extensionTestApi";
import {
  flushConfigSaves,
  openChatPanel,
  openHistoryPanel,
  openSettingsPanel,
  seedChatHistory,
  type SeedCompletedAppStateOptions,
  type SeedSetupWizardStateOptions,
} from "../helpers/testApi";
import type { SharedUIFixtures } from "./shared";

type ExtensionFixtures = SharedUIFixtures & {
  context: BrowserContext;
  page: Page;
  serviceWorker: Worker;
  extensionId: string;
  openExtensionHost: () => Promise<void>;
};

const extensionPath = path.resolve(
  process.cwd(),
  process.env.PW_EXTENSION_DIST || "dist-extension-test",
);

const withExtensionDefaults = (
  options: SeedCompletedAppStateOptions = {},
): SeedCompletedAppStateOptions => ({
  ...options,
  uiConfig: {
    enableModelLoading: false,
    autoLoadOnAllPages: true,
    ...(options.uiConfig ?? {}),
  },
});

export const test = base.extend<ExtensionFixtures>({
  inputWindow: async ({}, use) => {
    await use(undefined);
  },
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), "vassist-ext-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      viewport: { width: 1440, height: 960 },
    });

    try {
      await use(context);
    } finally {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  },

  serviceWorker: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker");
    }
    await use(serviceWorker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    const extensionId = new URL(serviceWorker.url()).host;
    await use(extensionId);
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] || (await context.newPage());
    await use(page);
  },

  seedCompletedAppState: async ({ page, serviceWorker }, use) => {
    await use(async (options = {}) => {
      await expect(serviceWorker).toBeTruthy();
      await seedExtensionReadyState(page, withExtensionDefaults(options));
    });
  },

  seedSetupWizardAppState: async ({ page, serviceWorker }, use) => {
    await use(async (options = {}) => {
      await expect(serviceWorker).toBeTruthy();
      await seedExtensionSetupWizardState(page, withExtensionDefaults(options));
    });
  },

  seedChatHistoryEntries: async ({ page, serviceWorker }, use) => {
    await use(async (entries) => {
      await expect(serviceWorker).toBeTruthy();
      await seedChatHistory(page, entries);
    });
  },

  seedSettingsAppState: async ({ page, serviceWorker }, use) => {
    await use(async (options = {}) => {
      await expect(serviceWorker).toBeTruthy();
      await seedExtensionReadyState(page, withExtensionDefaults(options));
    });
  },

  flushConfigSaves: async ({ page, serviceWorker }, use) => {
    await use(async (kinds) => {
      await expect(serviceWorker).toBeTruthy();
      await flushConfigSaves(page, kinds);
    });
  },

  openExtensionHost: async ({ page, serviceWorker }, use) => {
    await use(async () => {
      await expect(serviceWorker).toBeTruthy();
      await openExtensionHost(page);
    });
  },

  openChat: async ({ page, serviceWorker }, use) => {
    await use(async () => {
      await expect(serviceWorker).toBeTruthy();
      await openChatPanel(page);
    });
  },

  openHistory: async ({ page, serviceWorker }, use) => {
    await use(async () => {
      await expect(serviceWorker).toBeTruthy();
      await openHistoryPanel(page);
    });
  },

  openSettings: async ({ page, serviceWorker }, use) => {
    await use(async () => {
      await expect(serviceWorker).toBeTruthy();
      await openSettingsPanel(page);
    });
  },
});

export { expect };
