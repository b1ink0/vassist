import { expect, type Page } from "@playwright/test";
import { EXTENSION_TEST_HOST_ROUTE } from "../extensionTestHost";
import type {
  SeedCompletedAppStateOptions,
  SeedSetupWizardStateOptions,
} from "./testApi";
export type {
  SeedCompletedAppStateOptions,
  SeedSetupWizardStateOptions,
} from "./testApi";

const APP_BOOT_TIMEOUT_MS = 120_000;
const BOOTSTRAP_PAYLOAD_SESSION_KEY = "__vassist:test-bootstrap-payload";
const BOOTSTRAP_ARMED_SESSION_KEY = "__vassist:test-bootstrap-armed";
const EXTENSION_HOST_URL = `http://127.0.0.1:4173${EXTENSION_TEST_HOST_ROUTE}`;

type BootstrapKind = "ready-state" | "setup-wizard-state";

type BrowserTestGlobal = typeof globalThis & {
  __VASSIST_TEST_API__?: {
    clearAndSeedReadyState: (
      options?: SeedCompletedAppStateOptions,
    ) => Promise<unknown>;
    clearAndSeedSetupWizardState: (
      options?: SeedSetupWizardStateOptions,
    ) => Promise<unknown>;
  };
  sessionStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
  document?: {
    getElementById: (id: string) => unknown;
  };
};

export const waitForExtensionTestApi = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () => Boolean((globalThis as BrowserTestGlobal).__VASSIST_TEST_API__),
    { timeout: 15_000 },
  );
};

export const waitForExtensionRoot = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () =>
      Boolean(
        (globalThis as BrowserTestGlobal).document?.getElementById(
          "virtual-assistant-extension-root",
        ),
      ),
    { timeout: APP_BOOT_TIMEOUT_MS },
  );
};

export const waitForExtensionChatButton = async (
  page: Page,
  timeout = APP_BOOT_TIMEOUT_MS,
): Promise<void> => {
  await waitForExtensionRoot(page);
  await expect(page.getByTestId("chat-button")).toBeVisible({ timeout });
};

export const waitForExtensionSetupWizard = async (
  page: Page,
  timeout = APP_BOOT_TIMEOUT_MS,
): Promise<void> => {
  await waitForExtensionRoot(page);
  await expect(page.getByTestId("setup-wizard")).toBeVisible({ timeout });
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

export const seedExtensionReadyState = async (
  page: Page,
  options: SeedCompletedAppStateOptions = {},
): Promise<void> => {
  await armBootstrap(page, "ready-state", options);
  await page.goto(EXTENSION_HOST_URL, { waitUntil: "domcontentloaded" });
  await waitForExtensionTestApi(page);
  await waitForExtensionChatButton(page);
};

export const seedExtensionSetupWizardState = async (
  page: Page,
  options: SeedSetupWizardStateOptions = {},
): Promise<void> => {
  await armBootstrap(page, "setup-wizard-state", options);
  await page.goto(EXTENSION_HOST_URL, { waitUntil: "domcontentloaded" });
  await waitForExtensionTestApi(page);
  await waitForExtensionSetupWizard(page);
};

export const openExtensionHost = async (page: Page): Promise<void> => {
  await page.goto(EXTENSION_HOST_URL, { waitUntil: "domcontentloaded" });
  await waitForExtensionRoot(page);
};
