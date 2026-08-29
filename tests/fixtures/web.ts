import { test as base, expect } from "@playwright/test";
import {
  flushConfigSaves,
  openChatPanel,
  openHistoryPanel,
  openSettingsPanel,
  seedCompletedReadyState,
  seedChatHistory,
  seedSetupWizardState,
  type SeedChatHistoryEntry,
  type SeedCompletedAppStateOptions,
  type SeedSetupWizardStateOptions,
} from "../helpers/testApi";
import type { SharedUIFixtures } from "./shared";

type WebFixtures = SharedUIFixtures;

export const test = base.extend<WebFixtures>({
  inputWindow: async ({}, use) => {
    await use(undefined);
  },
  seedCompletedAppState: async ({ page }, use) => {
    await use(async (options = {}) => {
      await seedCompletedReadyState(page, options);
    });
  },
  seedSetupWizardAppState: async ({ page }, use) => {
    await use(async (options = {}) => {
      await seedSetupWizardState(page, options);
    });
  },
  seedChatHistoryEntries: async ({ page }, use) => {
    await use(async (entries) => {
      await seedChatHistory(page, entries);
    });
  },
  seedSettingsAppState: async ({ page }, use) => {
    await use(async (options = {}) => {
      await seedCompletedReadyState(page, {
        ...options,
        uiConfig: {
          ...(options.uiConfig ?? {}),
          enableModelLoading: false,
        },
      });
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
