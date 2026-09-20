import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/extension";

const selectElementText = async (
  page: Page,
  selector: string,
): Promise<void> => {
  await page.evaluate((cssSelector: string) => {
    const element = document.querySelector<HTMLElement>(cssSelector);
    if (!element) {
      throw new Error(`Missing element for selection: ${cssSelector}`);
    }

    const selection = window.getSelection();
    if (!selection) {
      throw new Error("Selection API unavailable");
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);

    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, selector);
};

test.describe("extension page context", () => {
  test("@extension exposes non-editable toolbar actions for normal page text selection", async ({
    page,
    seedCompletedAppState,
  }) => {
    await seedCompletedAppState();
    await selectElementText(page, "#host-selectable-text");

    const toolbar = page.getByTestId("ai-toolbar");
    const resultPanel = page.getByTestId("ai-toolbar-result-panel");

    await expect(toolbar).toBeVisible();
    await expect(
      page.getByTestId("ai-toolbar-button-summarize-tldr"),
    ).toBeVisible();
    await expect(page.getByTestId("ai-toolbar-button-translate")).toBeVisible();
    await expect(page.getByTestId("ai-toolbar-button-chat")).toBeVisible();
    await expect(page.getByTestId("ai-toolbar-button-write")).toHaveCount(0);
    await expect(
      page.getByTestId("ai-toolbar-button-rewrite-grammar"),
    ).toHaveCount(0);

    await page.getByTestId("ai-toolbar-button-summarize-tldr").click();
    await expect(resultPanel).toContainText("Fake tldr summary");
  });

  test("@extension adds selected host page text into the injected chat input", async ({
    page,
    seedCompletedAppState,
  }) => {
    await seedCompletedAppState();
    await selectElementText(page, "#host-selectable-text");

    await page.getByTestId("ai-toolbar-button-chat").click();

    const chatInput = page.getByTestId("chat-input-textarea");
    await expect(chatInput).toBeVisible();
    await expect(chatInput).toHaveValue(
      /Selecting this host page paragraph should trigger extension-only toolbar/,
    );
  });

  test("@extension rewrites and inserts text into a normal host page textarea", async ({
    page,
    seedCompletedAppState,
  }) => {
    await seedCompletedAppState();

    const hostTextarea = page.locator("#host-editable-textarea");
    await hostTextarea.click();
    await hostTextarea.press("Control+A");

    await expect(page.getByTestId("ai-toolbar")).toBeVisible();
    await expect(page.getByTestId("ai-toolbar-button-write")).toBeVisible();
    await expect(
      page.getByTestId("ai-toolbar-button-rewrite-grammar"),
    ).toBeVisible();

    await page.getByTestId("ai-toolbar-button-rewrite-grammar").click();
    await expect(page.getByTestId("ai-toolbar-result-panel")).toContainText(
      "Fake rewrite",
    );

    await page.getByTestId("ai-toolbar-button-insert").click();
    await expect(hostTextarea).toHaveValue(
      /Fake rewrite \(.+\): Please rewrite this page-level draft for clarity before I send it to the team\./,
    );
  });

  test("@extension shows image analysis toolbar actions when hovering host page images", async ({
    page,
    seedCompletedAppState,
  }) => {
    await seedCompletedAppState();

    await page.locator("#host-toolbar-image").hover();

    await expect(page.getByTestId("ai-toolbar")).toBeVisible();
    await expect(
      page.getByTestId("ai-toolbar-button-image-describe"),
    ).toBeVisible();
    await expect(
      page.getByTestId("ai-toolbar-button-image-extract-text"),
    ).toBeVisible();
    await expect(
      page.getByTestId("ai-toolbar-button-image-identify-objects"),
    ).toBeVisible();
    await expect(page.getByTestId("ai-toolbar-button-chat")).toBeVisible();
  });
});
