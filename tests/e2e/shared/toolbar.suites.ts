import { expect, type Locator, type TestType } from "@playwright/test";

type SharedUITest = TestType<any, any>;

const selectComposerText = async (textarea: Locator): Promise<void> => {
  await textarea.click();
  await textarea.press("Control+A");
};

export const registerToolbarInteractionsSuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test.describe(`${platform} AI toolbar interactions`, () => {
    test(`@${platform} exercises write rewrite summarize and translate flows from the composer`, async ({
      page,
      inputWindow,
      seedCompletedAppState,
      openChat,
    }) => {
      await seedCompletedAppState();
      await openChat();

      const composerPage = platform === "electron" ? inputWindow : page;
      if (platform === "electron") {
        await composerPage.waitForLoadState("domcontentloaded");
        await composerPage.bringToFront();
      }

      const textarea = composerPage.getByTestId("chat-input-textarea");
      const toolbar = composerPage.getByTestId("ai-toolbar");
      const resultPanel = composerPage.getByTestId("ai-toolbar-result-panel");

      await textarea.fill(
        "Please rewrite this release note for clarity before translating it.",
      );
      await selectComposerText(textarea);
      await expect(toolbar).toBeVisible();

      await expect(
        composerPage.getByTestId("ai-toolbar-button-write"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("ai-toolbar-button-rewrite-grammar"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("ai-toolbar-button-summarize-tldr"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("ai-toolbar-button-translate"),
      ).toBeVisible();

      await composerPage.getByTestId("ai-toolbar-button-write").click();
      await expect(
        composerPage.getByTestId("ai-toolbar-writer-panel"),
      ).toBeVisible();
      await composerPage
        .getByTestId("ai-toolbar-writer-input")
        .fill("Turn this into a concise product update");
      await composerPage.getByTestId("ai-toolbar-writer-submit").click();
      await expect(resultPanel).toContainText("Fake write result");
      await composerPage.getByTestId("ai-toolbar-result-close").click();
      await expect(resultPanel).toBeHidden();

      await selectComposerText(textarea);
      await composerPage
        .getByTestId("ai-toolbar-button-rewrite-grammar")
        .hover();
      await expect(
        composerPage.getByTestId("ai-toolbar-button-rewrite-custom"),
      ).toBeVisible();
      await composerPage
        .getByTestId("ai-toolbar-button-rewrite-custom")
        .click();
      await composerPage
        .getByTestId("ai-toolbar-writer-input")
        .fill("Make it more direct and executive");
      await composerPage.getByTestId("ai-toolbar-writer-submit").click();
      await expect(resultPanel).toContainText("Fake rewrite");
      await composerPage.getByTestId("ai-toolbar-result-close").click();
      await expect(resultPanel).toBeHidden();

      await selectComposerText(textarea);
      await composerPage
        .getByTestId("ai-toolbar-button-summarize-tldr")
        .click();
      await expect(resultPanel).toContainText("Fake tldr summary");
      await composerPage.getByTestId("ai-toolbar-result-close").click();
      await expect(resultPanel).toBeHidden();

      await selectComposerText(textarea);
      await composerPage.getByTestId("ai-toolbar-button-translate").click();
      await expect(resultPanel).toContainText("Translation");
      await composerPage
        .getByTestId("ai-toolbar-translate-target-select")
        .selectOption("es");
      await expect(resultPanel).toContainText("[ES]");
    });
  });
};
