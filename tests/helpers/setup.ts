import { expect, type Page } from "@playwright/test";

export const expectSetupStep = async (
  page: Page,
  stepNumber: number,
  title: string,
): Promise<void> => {
  await expect(page.getByTestId(`setup-step-${stepNumber}`)).toBeVisible();
  await expect(page.getByTestId("setup-step-title")).toContainText(title);
};

export const goToNextSetupStep = async (page: Page): Promise<void> => {
  await page.getByTestId("setup-next-button").click();
};

export const goToPreviousSetupStep = async (page: Page): Promise<void> => {
  await page.getByTestId("setup-previous-button").click();
};

export const selectSetupProvider = async (
  page: Page,
  providerId: string,
): Promise<void> => {
  const providerCard = page.getByTestId(`provider-option-${providerId}`);
  await expect(providerCard).toBeVisible();
  await providerCard.click();
  await expect(providerCard).toHaveAttribute("data-selected", "true");
};

export const recordShortcut = async (
  page: Page,
  shortcutInputTestId: string,
  combo: string,
): Promise<void> => {
  await page.getByTestId(shortcutInputTestId).click();
  await page.keyboard.press(combo);
};
