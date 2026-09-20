import { expect, type Page } from "@playwright/test";

const APP_BOOT_TIMEOUT_MS = 50_000;
const PANEL_OPEN_TIMEOUT_MS = 20_000;
const BOOTSTRAP_PAYLOAD_SESSION_KEY = "__vassist:test-bootstrap-payload";
const BOOTSTRAP_ARMED_SESSION_KEY = "__vassist:test-bootstrap-armed";
const FAKE_LANGUAGE_MODEL_SESSION_KEY = "__vassist:test-fake-language-model";

export interface SeedCompletedAppStateOptions {
  uiConfig?: Record<string, unknown>;
  aiConfig?: Record<string, unknown>;
  ttsConfig?: Record<string, unknown>;
  sttConfig?: Record<string, unknown>;
  setupState?: Record<string, unknown>;
  clearFirst?: boolean;
}

export interface SeedSetupWizardStateOptions {
  uiConfig?: Record<string, unknown>;
  aiConfig?: Record<string, unknown>;
  ttsConfig?: Record<string, unknown>;
  sttConfig?: Record<string, unknown>;
  setupState?: Record<string, unknown>;
  clearFirst?: boolean;
}

export interface SeedChatHistoryEntry {
  chatId?: string;
  title?: string;
  messages: Array<{
    id?: string;
    role: string;
    content: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface TestChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  branchInfo: {
    currentIndex: number;
    totalBranches: number;
    parentId: string;
    canGoBack: boolean;
    canGoForward: boolean;
  } | null;
}

export interface PersistedChatSummary {
  chatId: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

type BootstrapKind = "ready-state" | "setup-wizard-state";

type BrowserTestGlobal = typeof globalThis & {
  __VASSIST_TEST_API__?: {
    clearAndSeedReadyState: (
      options?: SeedCompletedAppStateOptions,
    ) => Promise<unknown>;
    clearAndSeedSetupWizardState: (
      options?: SeedSetupWizardStateOptions,
    ) => Promise<unknown>;
    seedChatHistory: (entries: SeedChatHistoryEntry[]) => Promise<unknown>;
    getCurrentChatMessages: () => TestChatMessage[];
    getPersistedChats: () => Promise<PersistedChatSummary[]>;
    getPersistedChatMessages: (chatId: string) => Promise<TestChatMessage[]>;
    hydrateConfigStore: () => Promise<unknown>;
    flushConfigSaves: (
      kinds?: Array<"ui" | "ai" | "tts" | "stt">,
    ) => Promise<unknown>;
  };
  sessionStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
};

export const waitForTestApi = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () => Boolean((globalThis as BrowserTestGlobal).__VASSIST_TEST_API__),
    {
      timeout: 15_000,
    },
  );
};

export const waitForChatButton = async (
  page: Page,
  timeout = APP_BOOT_TIMEOUT_MS,
): Promise<void> => {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("chat-button")).toBeVisible({ timeout });
};

export const waitForSetupWizard = async (
  page: Page,
  timeout = APP_BOOT_TIMEOUT_MS,
): Promise<void> => {
  await page.waitForLoadState("domcontentloaded");
  const setupWizard = page.getByTestId("setup-wizard");

  try {
    await expect(setupWizard).toBeVisible({ timeout: 1_500 });
    return;
  } catch {
    const chatButton = page.getByTestId("chat-button");
    if (await chatButton.isVisible().catch(() => false)) {
      await chatButton.click();
    } else {
      const launchButton = page.getByRole("button", {
        name: "Open Chat",
        exact: true,
      });
      if (
        await launchButton
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await launchButton.first().click();
      }
    }
  }

  await expect(setupWizard).toBeVisible({ timeout });
};

const armBootstrap = async <TOptions>(
  page: Page,
  kind: BootstrapKind,
  options: TOptions,
): Promise<void> => {
  await page.addInitScript(
    ({ armedKey, payloadKey, bootstrapKind, bootstrapOptions }) => {
      const testGlobal = globalThis as BrowserTestGlobal;

      if (testGlobal.sessionStorage.getItem(armedKey)) {
        return;
      }

      testGlobal.sessionStorage.setItem(armedKey, "1");
      testGlobal.sessionStorage.setItem(
        payloadKey,
        JSON.stringify({ kind: bootstrapKind, options: bootstrapOptions }),
      );
    },
    {
      armedKey: BOOTSTRAP_ARMED_SESSION_KEY,
      payloadKey: BOOTSTRAP_PAYLOAD_SESSION_KEY,
      bootstrapKind: kind,
      bootstrapOptions: options,
    },
  );
};

export const seedCompletedReadyState = async (
  page: Page,
  options: SeedCompletedAppStateOptions = {},
): Promise<void> => {
  await armBootstrap(page, "ready-state", options);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForTestApi(page);
  await waitForChatButton(page);
};

export const seedCompletedReadyStateInPlace = async (
  page: Page,
  options: SeedCompletedAppStateOptions = {},
): Promise<void> => {
  await armBootstrap(page, "ready-state", options);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForTestApi(page);
  await page.evaluate(async () => {
    await (
      globalThis as BrowserTestGlobal
    ).__VASSIST_TEST_API__?.hydrateConfigStore?.();
  });
  await waitForChatButton(page);
};

export const enableFakeLanguageModel = async (page: Page): Promise<void> => {
  await page.addInitScript((sessionKey) => {
    globalThis.sessionStorage.setItem(sessionKey, "1");
  }, FAKE_LANGUAGE_MODEL_SESSION_KEY);

  try {
    await page.evaluate((sessionKey) => {
      globalThis.sessionStorage.setItem(sessionKey, "1");
    }, FAKE_LANGUAGE_MODEL_SESSION_KEY);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.includes("sessionStorage") &&
      !message.includes("SecurityError") &&
      !message.includes("Access is denied")
    ) {
      throw error;
    }
  }
};

export const seedSetupWizardState = async (
  page: Page,
  options: SeedSetupWizardStateOptions = {},
): Promise<void> => {
  await armBootstrap(page, "setup-wizard-state", options);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForTestApi(page);
  await waitForSetupWizard(page);
};

export const seedSetupWizardStateInPlace = async (
  page: Page,
  options: SeedSetupWizardStateOptions = {},
): Promise<void> => {
  await armBootstrap(page, "setup-wizard-state", options);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForTestApi(page);
  await page.evaluate(async () => {
    await (
      globalThis as BrowserTestGlobal
    ).__VASSIST_TEST_API__?.hydrateConfigStore?.();
  });
  await waitForSetupWizard(page);
};

export const openChatPanel = async (page: Page): Promise<void> => {
  const settingsToggleButton = page.getByTestId("settings-toggle-button");
  if (await settingsToggleButton.isVisible()) {
    return;
  }

  await waitForChatButton(page);
  await page.getByTestId("chat-button").click();
  await expect(settingsToggleButton).toBeVisible({
    timeout: PANEL_OPEN_TIMEOUT_MS,
  });
};

export const openHistoryPanel = async (page: Page): Promise<void> => {
  await openChatPanel(page);
  await page.getByRole("button", { name: "Chat history" }).click();
  await expect(page.getByRole("heading", { name: "Chat History" })).toBeVisible(
    { timeout: PANEL_OPEN_TIMEOUT_MS },
  );
};

export const openSettingsPanel = async (page: Page): Promise<void> => {
  await openChatPanel(page);
  await page.getByTestId("settings-toggle-button").click();
  await expect(page.getByTestId("settings-panel")).toBeVisible({
    timeout: PANEL_OPEN_TIMEOUT_MS,
  });
};

export const flushConfigSaves = async (
  page: Page,
  kinds?: Array<"ui" | "ai" | "tts" | "stt">,
): Promise<void> => {
  await waitForTestApi(page);
  await page.evaluate(async (saveKinds) => {
    await (
      globalThis as BrowserTestGlobal
    ).__VASSIST_TEST_API__?.flushConfigSaves(saveKinds);
  }, kinds);
};

export const seedChatHistory = async (
  page: Page,
  entries: SeedChatHistoryEntry[],
): Promise<void> => {
  await waitForTestApi(page);
  await page.evaluate(async (seedEntries) => {
    await (
      globalThis as BrowserTestGlobal
    ).__VASSIST_TEST_API__?.seedChatHistory(seedEntries);
  }, entries);
};

export const readCurrentChatMessages = async (
  page: Page,
): Promise<TestChatMessage[]> => {
  await waitForTestApi(page);
  return await page.evaluate(() => {
    return (
      (
        globalThis as BrowserTestGlobal
      ).__VASSIST_TEST_API__?.getCurrentChatMessages?.() ?? []
    );
  });
};

export const readPersistedChats = async (
  page: Page,
): Promise<PersistedChatSummary[]> => {
  await waitForTestApi(page);
  return await page.evaluate(async () => {
    return (
      (await (
        globalThis as BrowserTestGlobal
      ).__VASSIST_TEST_API__?.getPersistedChats?.()) ?? []
    );
  });
};

export const readPersistedChatMessages = async (
  page: Page,
  chatId: string,
): Promise<TestChatMessage[]> => {
  await waitForTestApi(page);
  return await page.evaluate(async (persistedChatId) => {
    return (
      (await (
        globalThis as BrowserTestGlobal
      ).__VASSIST_TEST_API__?.getPersistedChatMessages?.(persistedChatId)) ?? []
    );
  }, chatId);
};

export const waitForAssistantTurn = async (
  page: Page,
  expectedUserMessage: string,
  expectedAssistantMessage?: string,
  timeout = APP_BOOT_TIMEOUT_MS,
): Promise<void> => {
  await waitForTestApi(page);
  await page.waitForFunction(
    ({ userMessage, assistantMessage }) => {
      const messages =
        (
          globalThis as BrowserTestGlobal
        ).__VASSIST_TEST_API__?.getCurrentChatMessages?.() ?? [];
      const lastMessage = messages[messages.length - 1];

      if (
        messages.length < 2 ||
        lastMessage?.role !== "assistant" ||
        typeof lastMessage.content !== "string" ||
        lastMessage.content.trim().length === 0
      ) {
        return false;
      }

      const hasUserMessage = messages.some(
        (message) =>
          message.role === "user" &&
          typeof message.content === "string" &&
          message.content.includes(userMessage),
      );

      if (!hasUserMessage) {
        return false;
      }

      if (
        typeof assistantMessage === "string" &&
        lastMessage.content !== assistantMessage
      ) {
        return false;
      }

      return true;
    },
    {
      userMessage: expectedUserMessage,
      assistantMessage: expectedAssistantMessage,
    },
    { timeout },
  );
};
