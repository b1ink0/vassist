import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures/electron";

const TOOLBAR_CHAT_ID = "chat_toolbar_desktop_surface";
const TOOLBAR_SELECTION_TEXT =
  "The desktop release now bundles the app, preload bridge, and local runtime for QA verification.";

const seedDesktopToolbarChat = async (
  seedCompletedAppState: (options?: Record<string, unknown>) => Promise<void>,
  seedChatHistoryEntries: (
    entries: Array<{
      chatId?: string;
      title?: string;
      messages: Array<{ role: string; content: string }>;
      metadata?: Record<string, unknown>;
    }>,
  ) => Promise<void>,
): Promise<void> => {
  await seedCompletedAppState();
  await seedChatHistoryEntries([
    {
      chatId: TOOLBAR_CHAT_ID,
      title: "Desktop toolbar coverage",
      messages: [
        {
          role: "user",
          content: "Summarize the desktop packaging workflow for QA.",
        },
        {
          role: "assistant",
          content: TOOLBAR_SELECTION_TEXT,
        },
      ],
      metadata: {
        sourceUrl: "https://example.com/desktop-toolbar",
      },
    },
  ]);
};

const openSeededToolbarChat = async (
  page: Page,
  openHistory: () => Promise<void>,
): Promise<void> => {
  await openHistory();
  await page.getByTestId(`chat-history-item-${TOOLBAR_CHAT_ID}`).click();
  await expect(
    page.getByText(TOOLBAR_SELECTION_TEXT, { exact: true }),
  ).toBeVisible();
  await page.bringToFront();
};

const selectMainWindowText = async (
  page: Page,
  text: string,
): Promise<void> => {
  await page.evaluate((selectionText: string) => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let matchedNode: Text | null = null;

    while (walker.nextNode()) {
      const currentNode = walker.currentNode;
      if (
        currentNode instanceof Text &&
        typeof currentNode.textContent === "string" &&
        currentNode.textContent.includes(selectionText)
      ) {
        matchedNode = currentNode;
        break;
      }
    }

    if (!matchedNode || typeof matchedNode.textContent !== "string") {
      throw new Error(
        `Unable to locate selectable toolbar text: ${selectionText}`,
      );
    }

    const startOffset = matchedNode.textContent.indexOf(selectionText);
    const selection = window.getSelection();
    if (!selection) {
      throw new Error("Window selection is unavailable");
    }

    const range = document.createRange();
    range.setStart(matchedNode, startOffset);
    range.setEnd(matchedNode, startOffset + selectionText.length);

    selection.removeAllRanges();
    selection.addRange(range);

    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    matchedNode.parentElement?.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
  }, text);
};

test.describe("electron AI toolbar interactions", () => {
  test("@electron shows the desktop toolbar actions for selected main-window chat text", async ({
    page,
    seedCompletedAppState,
    seedChatHistoryEntries,
    openHistory,
  }) => {
    await seedDesktopToolbarChat(seedCompletedAppState, seedChatHistoryEntries);
    await openSeededToolbarChat(page, openHistory);

    await selectMainWindowText(page, TOOLBAR_SELECTION_TEXT);

    await expect(page.getByTestId("ai-toolbar")).toBeVisible();
    await expect(
      page.getByTestId("ai-toolbar-button-summarize-tldr"),
    ).toBeVisible();
    await expect(page.getByTestId("ai-toolbar-button-translate")).toBeVisible();
    await expect(page.getByTestId("ai-toolbar-button-chat")).toBeVisible();
    await expect(page.getByTestId("ai-toolbar-button-write")).toHaveCount(0);
    await expect(
      page.getByTestId("ai-toolbar-button-rewrite-grammar"),
    ).toHaveCount(0);
  });

  test("@electron summarizes and translates selected chat text from the desktop toolbar", async ({
    page,
    seedCompletedAppState,
    seedChatHistoryEntries,
    openHistory,
  }) => {
    await seedDesktopToolbarChat(seedCompletedAppState, seedChatHistoryEntries);
    await openSeededToolbarChat(page, openHistory);

    await selectMainWindowText(page, TOOLBAR_SELECTION_TEXT);

    const resultPanel = page.getByTestId("ai-toolbar-result-panel");

    await page.getByTestId("ai-toolbar-button-summarize-tldr").click();
    await expect(resultPanel).toContainText("Fake tldr summary");
    await page.getByTestId("ai-toolbar-result-close").click();
    await expect(resultPanel).toBeHidden();

    await selectMainWindowText(page, TOOLBAR_SELECTION_TEXT);
    await page.getByTestId("ai-toolbar-button-translate").click();
    await expect(resultPanel).toContainText("Translation");
    await page
      .getByTestId("ai-toolbar-translate-target-select")
      .selectOption("es");
    await expect(resultPanel).toContainText("[ES]");
  });
});
