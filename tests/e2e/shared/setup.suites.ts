import { expect, type Page, type TestType } from "@playwright/test";
import { getToggleByText } from "../../helpers/interactions";
import {
  expectSetupStep,
  goToNextSetupStep,
  goToPreviousSetupStep,
  recordShortcut,
  selectSetupProvider,
} from "../../helpers/setup";

type SharedUITest = TestType<any, any>;

const goToSetupStep = async (page: Page, stepNumber: number): Promise<void> => {
  for (let currentStep = 1; currentStep < stepNumber; currentStep += 1) {
    await goToNextSetupStep(page);
  }
};

export const registerSetupWizardSuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test.describe(`${platform} setup wizard`, () => {
    test(`@${platform} completes the setup wizard through the real step flow`, async ({
      page,
      seedSetupWizardAppState,
    }) => {
      await seedSetupWizardAppState();

      await expectSetupStep(page, 1, "Welcome");
      await expect(
        page.getByRole("button", { name: /Get Started/i }),
      ).toBeVisible();

      await page.getByRole("button", { name: /Get Started/i }).click();
      await expectSetupStep(page, 2, "Virtual Companion");

      await goToPreviousSetupStep(page);
      await expectSetupStep(page, 1, "Welcome");

      await goToNextSetupStep(page);
      await expectSetupStep(page, 2, "Virtual Companion");

      await page.getByTestId("setup-display-mode-portrait").click();
      if (platform === "electron") {
        await expect(
          page.getByTestId("setup-position-bottom-center"),
        ).toHaveCount(0);
      } else {
        await page.getByTestId("setup-position-bottom-center").click();
      }
      await page.getByTestId("setup-toggle-enable-avatar").click();
      await expect(
        page.getByTestId("setup-toggle-enable-avatar"),
      ).toHaveAttribute("aria-checked", "false");

      await goToNextSetupStep(page);
      await expectSetupStep(page, 3, "AI Configuration");
      await selectSetupProvider(
        page,
        platform === "electron" ? "desktop-local" : "chrome-ai",
      );
      await expect(
        page.getByText(
          platform === "electron" ? "Desktop Local AI" : "Chrome Built-in AI",
        ),
      ).toBeVisible();

      await goToNextSetupStep(page);
      await expectSetupStep(page, 4, "Voice");
      await page
        .locator('[data-testid="provider-option-disabled"]')
        .first()
        .click();
      await expect(page.getByText("Text-to-Speech Disabled")).toBeVisible();
      await page
        .locator('[data-testid="provider-option-disabled"]')
        .last()
        .click();
      await expect(page.getByText("Speech-to-Text Disabled")).toBeVisible();

      await goToNextSetupStep(page);
      await expectSetupStep(page, 5, "AI+ Features");
      await page.getByTestId("setup-next-button").click();

      await expect(page.getByTestId("setup-wizard")).toBeHidden();
      await expect(page.getByTestId("chat-button")).toBeVisible();
    });

    test(`@${platform} exercises the AI provider choices in setup`, async ({
      page,
      seedSetupWizardAppState,
    }) => {
      await seedSetupWizardAppState();
      await goToSetupStep(page, 3);

      await expectSetupStep(page, 3, "AI Configuration");

      await selectSetupProvider(page, "openai");
      await expect(page.getByText("OpenAI Config")).toBeVisible();
      await page
        .locator('input[placeholder="sk-..."]:visible')
        .fill("sk-test-openai-key");

      await selectSetupProvider(page, "ollama");
      await expect(page.getByText("Ollama Config")).toBeVisible();
      await page
        .locator('input[placeholder="http://localhost:11434"]:visible')
        .fill("http://127.0.0.1:11434");

      if (platform === "electron") {
        await selectSetupProvider(page, "desktop-local");
        await expect(page.getByText("Desktop Local AI")).toBeVisible();
        await expect(page.getByText("Runtime Backend")).toBeVisible();
      } else {
        await selectSetupProvider(page, "chrome-ai");
        await expect(page.getByText("Required Chrome Flags")).toBeVisible();
        await expect(
          page.getByRole("button", { name: /Refresh Status/i }),
        ).toBeVisible();
      }
    });

    test(`@${platform} exercises the voice setup providers for TTS and STT`, async ({
      page,
      seedSetupWizardAppState,
    }) => {
      await seedSetupWizardAppState();
      await goToSetupStep(page, 4);

      await expectSetupStep(page, 4, "Voice");

      if (platform === "electron") {
        await page
          .locator('[data-testid="provider-option-desktop-local"]')
          .first()
          .click();
        await expect(page.getByText("Reference Text")).toBeVisible();
        await expect(
          page.getByText("Upload Audio File (MP3/WAV/M4A)"),
        ).toBeVisible();
      }

      await page
        .locator('[data-testid="provider-option-openai"]')
        .first()
        .click();
      await expect(page.getByText("OpenAI TTS Config")).toBeVisible();
      await page
        .locator('input[placeholder="sk-..."]:visible')
        .fill("sk-test-tts-key");

      await page
        .locator('[data-testid="provider-option-openai-compatible"]')
        .first()
        .click();
      await expect(page.getByText("OpenAI-Compatible Config")).toBeVisible();
      await page
        .locator('input[placeholder="http://localhost:8000"]:visible')
        .fill("http://localhost:8000");

      await page
        .locator('[data-testid="provider-option-disabled"]')
        .first()
        .click();
      await expect(page.getByText("Text-to-Speech Disabled")).toBeVisible();

      await page
        .locator('[data-testid="provider-option-openai"]')
        .last()
        .click();
      await expect(page.getByText("Speech-to-Text")).toBeVisible();
      await page
        .locator('input[placeholder="sk-..."]:visible')
        .fill("sk-test-stt-key");

      await page
        .locator('[data-testid="provider-option-openai-compatible"]')
        .last()
        .click();
      await page
        .locator('input[placeholder="http://localhost:8000"]:visible')
        .fill("http://localhost:8080");
      await expect(page.getByText("Language")).toBeVisible();

      if (platform === "electron") {
        await page
          .locator('[data-testid="provider-option-desktop-local"]')
          .last()
          .click();
        await expect(page.getByText("Desktop Local STT")).toBeVisible();
        await expect(page.getByText("Whisper Model")).toBeVisible();
      } else {
        await page
          .locator('[data-testid="provider-option-chrome-ai-multimodal"]')
          .click();
        await expect(
          page.getByText("Requires multimodal audio support"),
        ).toBeVisible();
        await expect(
          page.locator('[data-testid="provider-option-chrome-ai-multimodal"]'),
        ).toContainText(/Recommended\s*Unavailable/);
      }
    });

    test(`@${platform} configures AI feature and shortcut choices in the final setup step`, async ({
      page,
      seedSetupWizardAppState,
    }) => {
      await seedSetupWizardAppState();
      await goToSetupStep(page, 5);

      await expectSetupStep(page, 5, "AI+ Features");

      await getToggleByText(page, "Translation").click();
      await getToggleByText(page, "Language Detection").click();
      await getToggleByText(page, "Writer").click();

      await getToggleByText(page, "Enable Keyboard Shortcuts").click();
      await recordShortcut(
        page,
        "shortcut-input-open-chat",
        "Control+Shift+KeyK",
      );
      await recordShortcut(
        page,
        "shortcut-input-toggle-avatar",
        "Control+Shift+KeyM",
      );
      await recordShortcut(
        page,
        "shortcut-input-toggle-visibility",
        "Control+Shift+KeyV",
      );

      await page.getByTestId("shortcut-input-toggle-visibility-clear").click();
      await expect(
        page.getByTestId("shortcut-input-toggle-visibility"),
      ).toContainText("Not set");
    });
  });
};
