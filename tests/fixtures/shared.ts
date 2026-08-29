import type { Page } from "@playwright/test";
import type {
  SeedChatHistoryEntry,
  SeedCompletedAppStateOptions,
  SeedSetupWizardStateOptions,
} from "../helpers/testApi";

export type SharedUIFixtures = {
  inputWindow?: Page;
  seedCompletedAppState: (
    options?: SeedCompletedAppStateOptions,
  ) => Promise<void>;
  seedSetupWizardAppState: (
    options?: SeedSetupWizardStateOptions,
  ) => Promise<void>;
  seedChatHistoryEntries: (entries: SeedChatHistoryEntry[]) => Promise<void>;
  seedSettingsAppState: (
    options?: SeedCompletedAppStateOptions,
  ) => Promise<void>;
  flushConfigSaves: (
    kinds?: Array<"ui" | "ai" | "tts" | "stt">,
  ) => Promise<void>;
  openChat: () => Promise<void>;
  openHistory: () => Promise<void>;
  openSettings: () => Promise<void>;
};
