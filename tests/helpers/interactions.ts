import { expect, type Locator, type Page } from "@playwright/test";

type Scope = Page | Locator;

const normalizeText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

const labelContainer = (scope: Scope, label: string) =>
  scope
    .locator(
      `[data-settings-row][data-settings-label="${label}"], [data-settings-row][data-settings-label="${label} *"]`,
    )
    .first();

export const getSelectTriggerByLabel = (scope: Scope, label: string): Locator =>
  labelContainer(scope, label)
    .locator(
      '[data-settings-control] [role="combobox"], [data-settings-control] button[aria-haspopup="listbox"], [data-settings-control] button',
    )
    .first();

const isPage = (scope: Scope): scope is Page => "context" in scope;

const pageForScope = (scope: Scope): Page =>
  isPage(scope) ? scope : scope.page();

const selectPopupOption = async (
  page: Page,
  optionLabel: string,
): Promise<void> => {
  const option = page
    .getByRole("option", { name: optionLabel, exact: true })
    .last();
  await expect(option).toBeVisible();
  await option.click();
};

export const fillFieldByLabel = async (
  scope: Scope,
  label: string,
  value: string,
): Promise<void> => {
  const field = getFieldByLabel(scope, label);
  await expect(field).toBeVisible();
  await field.fill(value);
};

export const getFieldByLabel = (scope: Scope, label: string): Locator =>
  labelContainer(scope, label)
    .locator(
      "[data-settings-control] input:visible, [data-settings-control] textarea:visible",
    )
    .first();

export const selectOptionByLabel = async (
  scope: Scope,
  label: string,
  optionLabel: string,
): Promise<void> => {
  const container = labelContainer(scope, label);
  const nativeSelect = container
    .locator("[data-settings-control] select")
    .first();

  if ((await nativeSelect.count()) > 0) {
    await expect(nativeSelect).toBeVisible();
    await nativeSelect.selectOption({ label: optionLabel });
    return;
  }

  const trigger = getSelectTriggerByLabel(scope, label);
  await expect(trigger).toBeVisible();

  if (normalizeText(await trigger.textContent()) === optionLabel) {
    return;
  }

  await trigger.scrollIntoViewIfNeeded();
  await trigger.click({ force: true });
  await selectPopupOption(pageForScope(scope), optionLabel);
};

export const selectOptionByTrigger = async (
  trigger: Locator,
  optionLabel: string,
): Promise<void> => {
  await expect(trigger).toBeVisible();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click({ force: true });
  await selectPopupOption(trigger.page(), optionLabel);
};

export const getToggleByText = (scope: Scope, label: string): Locator =>
  scope
    .getByText(label, { exact: true })
    .locator(
      'xpath=ancestor::*[(self::div or self::section or self::article or self::label) and .//*[@role="switch"]][1]',
    )
    .locator('[role="switch"]')
    .first();

export const expectToggleState = async (
  toggle: Locator,
  checked: boolean,
): Promise<void> => {
  await expect(toggle).toHaveAttribute(
    "aria-checked",
    checked ? "true" : "false",
  );
};

export const setToggleState = async (
  toggle: Locator,
  checked: boolean,
): Promise<void> => {
  const currentState = await toggle.getAttribute("aria-checked");
  if (currentState !== (checked ? "true" : "false")) {
    await toggle.click();
  }
  await expectToggleState(toggle, checked);
};

export const clickTabByName = async (
  scope: Scope,
  tabName: string,
): Promise<void> => {
  const tab = scope.getByRole("tab", { name: tabName, exact: true });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
};
