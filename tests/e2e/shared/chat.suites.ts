import { expect, type TestType } from "@playwright/test";
import { selectOptionByTrigger } from "../../helpers/interactions";
import {
  enableFakeLanguageModel,
  readCurrentChatMessages,
  readPersistedChatMessages,
  readPersistedChats,
  waitForAssistantTurn,
} from "../../helpers/testApi";

type SharedUITest = TestType<any, any>;

const buildExpectedFakeAssistantResponse = (prompt: string): string =>
  `Fake assistant response: ${prompt.replace(/\s+/g, " ").trim()}`;

const getChatPages = (
  platform: "web" | "extension" | "electron",
  page: any,
  inputWindow?: any,
) => {
  if (platform === "electron") {
    if (!inputWindow) {
      throw new Error("Electron chat tests require an input window page");
    }

    return {
      shellPage: page,
      composerPage: inputWindow,
    };
  }

  return {
    shellPage: page,
    composerPage: page,
  };
};

const focusComposerPage = async (
  platform: "web" | "extension" | "electron",
  composerPage: any,
): Promise<void> => {
  if (platform !== "electron") {
    return;
  }

  await composerPage.waitForLoadState("domcontentloaded");
  await composerPage.bringToFront();
};

const isElectronInputWindowOpen = async (page: any): Promise<boolean> =>
  await page.evaluate(async () => {
    const browserGlobal = globalThis as typeof globalThis & {
      window?: {
        electron?: {
          inputWindow?: {
            isOpen?: () => Promise<boolean>;
          };
        };
      };
    };

    return (
      (await browserGlobal.window?.electron?.inputWindow?.isOpen?.()) ?? false
    );
  });

const sendPromptAndWaitForAssistant = async (
  composerPage: any,
  prompt: string,
  statePage: any = composerPage,
) => {
  await composerPage.getByTestId("chat-input-textarea").fill(prompt);
  await composerPage.getByTestId("chat-send-button").click();
  await waitForAssistantTurn(
    statePage,
    prompt,
    buildExpectedFakeAssistantResponse(prompt),
  );
  return await readCurrentChatMessages(statePage);
};

const seededChats = [
  {
    chatId: "chat_voice_plan",
    title: "Voice workflow planning",
    messages: [
      { role: "user", content: "Plan a voice-first setup flow." },
      { role: "assistant", content: "Here is a staged voice setup plan." },
    ],
    metadata: {
      sourceUrl: "https://example.com/voice",
    },
  },
  {
    chatId: "chat_translation_notes",
    title: "Translation experiment",
    messages: [
      { role: "user", content: "Translate this release note into Spanish." },
      { role: "assistant", content: "Aqui tienes la traduccion." },
    ],
    metadata: {
      sourceUrl: "https://example.com/translation",
    },
  },
  {
    chatId: "chat_router_debug",
    title: "Router prompt debugging",
    messages: [
      { role: "user", content: "Compare router and main model behavior." },
      {
        role: "assistant",
        content: "The router should stay concise and task-oriented.",
      },
    ],
    metadata: {
      sourceUrl: "https://example.com/routing",
    },
  },
];

export const registerChatInteractionsSuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test.describe(`${platform} chat interactions`, () => {
    test(`@${platform} exercises the chat input shell and send readiness`, async ({
      page,
      inputWindow,
      seedCompletedAppState,
      openChat,
    }) => {
      await seedCompletedAppState();
      await openChat();

      const { composerPage } = getChatPages(platform, page, inputWindow);
      await focusComposerPage(platform, composerPage);

      const textarea = composerPage.getByTestId("chat-input-textarea");
      const sendButton = composerPage.getByTestId("chat-send-button");

      await expect(textarea).toBeVisible();
      await expect(
        composerPage.getByTestId("chat-attach-image-button"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("chat-attach-audio-button"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("chat-voice-input-button"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("chat-voice-mode-button"),
      ).toBeVisible();
      await expect(composerPage.getByTestId("chat-close-button")).toBeVisible();
      await expect(sendButton).toBeDisabled();

      await textarea.fill("Summarize the current page in two bullets.");
      await expect(sendButton).toBeEnabled();
    });

    test(`@${platform} closes the chat panel from the composer controls`, async ({
      page,
      inputWindow,
      seedCompletedAppState,
      openChat,
    }) => {
      await seedCompletedAppState();
      await openChat();

      const { shellPage, composerPage } = getChatPages(
        platform,
        page,
        inputWindow,
      );
      await focusComposerPage(platform, composerPage);

      await composerPage.getByTestId("chat-close-button").click();

      if (platform === "electron") {
        await expect
          .poll(async () => await isElectronInputWindowOpen(shellPage))
          .toBe(false);
      } else {
        await expect(
          composerPage.getByTestId("chat-input-textarea"),
        ).toBeHidden();
      }
    });

    test(`@${platform} sends a full chat turn, autosaves it, and restores it after reload`, async ({
      page,
      inputWindow,
      seedCompletedAppState,
      openChat,
      openHistory,
    }) => {
      const prompt = "Plan the release checklist for build 42.";

      const { shellPage, composerPage } = getChatPages(
        platform,
        page,
        inputWindow,
      );

      await enableFakeLanguageModel(shellPage);
      if (platform === "electron") {
        await enableFakeLanguageModel(composerPage);
      }
      await seedCompletedAppState();
      await openChat();
      await focusComposerPage(platform, composerPage);

      const currentMessages = await sendPromptAndWaitForAssistant(
        composerPage,
        prompt,
        shellPage,
      );
      expect(
        currentMessages.map(({ role, content }) => ({ role, content })),
      ).toEqual([
        { role: "user", content: prompt },
        {
          role: "assistant",
          content: buildExpectedFakeAssistantResponse(prompt),
        },
      ]);

      await expect
        .poll(async () => (await readPersistedChats(shellPage)).length)
        .toBe(1);

      const persistedChats = await readPersistedChats(shellPage);
      expect(persistedChats[0]?.messageCount).toBe(2);

      const persistedMessages = await readPersistedChatMessages(
        shellPage,
        persistedChats[0]!.chatId,
      );
      expect(
        persistedMessages.map(({ role, content }) => ({ role, content })),
      ).toEqual([
        { role: "user", content: prompt },
        {
          role: "assistant",
          content: buildExpectedFakeAssistantResponse(prompt),
        },
      ]);

      await shellPage.reload();
      await openHistory();

      const historyItems = shellPage.locator(
        '[data-testid^="chat-history-item-"]',
      );
      await expect(historyItems).toHaveCount(1);
      await historyItems.first().click();

      const restoredStatePage =
        platform === "electron" ? shellPage : composerPage;

      await expect
        .poll(
          async () => (await readCurrentChatMessages(restoredStatePage)).length,
        )
        .toBe(2);

      const restoredMessages = await readCurrentChatMessages(restoredStatePage);
      expect(
        restoredMessages.map(({ role, content }) => ({ role, content })),
      ).toEqual([
        { role: "user", content: prompt },
        {
          role: "assistant",
          content: buildExpectedFakeAssistantResponse(prompt),
        },
      ]);
    });

    test(`@${platform} completes a temp chat without saving it to history`, async ({
      page,
      inputWindow,
      seedCompletedAppState,
      openChat,
      openHistory,
    }) => {
      const { shellPage, composerPage } = getChatPages(
        platform,
        page,
        inputWindow,
      );

      await enableFakeLanguageModel(shellPage);
      if (platform === "electron") {
        await enableFakeLanguageModel(composerPage);
      }
      await seedCompletedAppState();
      await openChat();
      await focusComposerPage(platform, composerPage);

      await shellPage
        .getByTitle("Enable temp mode - chat won't be saved")
        .click();
      await expect(
        shellPage.getByTitle("Disable temp mode - chat will be saved"),
      ).toBeVisible();

      await sendPromptAndWaitForAssistant(
        composerPage,
        "Draft a short note for the temporary support chat.",
        shellPage,
      );

      await expect
        .poll(async () => (await readPersistedChats(shellPage)).length)
        .toBe(0);

      await openHistory();
      await expect(shellPage.getByTestId("chat-history-panel")).toBeVisible();
      await expect(shellPage.getByText("No chat history yet")).toBeVisible();
    });

    test(`@${platform} edits the last user message into a new branch and keeps the active branch persisted`, async ({
      page,
      inputWindow,
      seedCompletedAppState,
      openChat,
      openHistory,
    }) => {
      const originalPrompt = "Draft a short launch note for version 1.";
      const editedPrompt =
        "Draft a short launch note for version 2 with rollback notes.";

      const { shellPage, composerPage } = getChatPages(
        platform,
        page,
        inputWindow,
      );

      await enableFakeLanguageModel(shellPage);
      if (platform === "electron") {
        await enableFakeLanguageModel(composerPage);
      }
      await seedCompletedAppState();
      await openChat();
      await focusComposerPage(platform, composerPage);
      await sendPromptAndWaitForAssistant(
        composerPage,
        originalPrompt,
        shellPage,
      );

      await shellPage
        .locator('[data-testid^="chat-message-edit-button-"]')
        .last()
        .click();
      await shellPage
        .locator('[data-testid^="chat-message-edit-textarea-"]')
        .first()
        .fill(editedPrompt);
      await shellPage
        .locator('[data-testid^="chat-message-edit-save-"]')
        .first()
        .click();

      await waitForAssistantTurn(
        shellPage,
        editedPrompt,
        buildExpectedFakeAssistantResponse(editedPrompt),
      );

      const editedMessages = await readCurrentChatMessages(shellPage);
      expect(editedMessages[0]?.content).toBe(editedPrompt);
      expect(editedMessages[0]?.branchInfo?.totalBranches).toBe(2);
      expect(editedMessages[0]?.branchInfo?.currentIndex).toBe(2);
      expect(editedMessages[1]?.content).toBe(
        buildExpectedFakeAssistantResponse(editedPrompt),
      );

      await shellPage
        .locator('[data-testid^="chat-message-user-previous-branch-"]')
        .first()
        .click();

      await expect
        .poll(
          async () => (await readCurrentChatMessages(shellPage))[0]?.content,
        )
        .toBe(originalPrompt);

      let activeMessages = await readCurrentChatMessages(shellPage);
      expect(activeMessages[0]?.branchInfo?.currentIndex).toBe(1);

      await shellPage
        .locator('[data-testid^="chat-message-user-next-branch-"]')
        .first()
        .click();

      await expect
        .poll(
          async () => (await readCurrentChatMessages(shellPage))[0]?.content,
        )
        .toBe(editedPrompt);

      activeMessages = await readCurrentChatMessages(shellPage);
      expect(activeMessages[0]?.branchInfo?.currentIndex).toBe(2);

      await expect
        .poll(async () => (await readPersistedChats(shellPage)).length)
        .toBe(1);

      await shellPage.reload();
      await openHistory();
      await shellPage
        .locator('[data-testid^="chat-history-item-"]')
        .first()
        .click();

      await expect
        .poll(
          async () => (await readCurrentChatMessages(shellPage))[0]?.content,
        )
        .toBe(editedPrompt);

      const restoredMessages = await readCurrentChatMessages(shellPage);
      expect(restoredMessages[0]?.branchInfo?.totalBranches).toBe(2);
      expect(restoredMessages[0]?.branchInfo?.currentIndex).toBe(2);
    });

    test(`@${platform} regenerates the assistant reply into a new branch and keeps both branches available after reload`, async ({
      page,
      inputWindow,
      seedCompletedAppState,
      openChat,
      openHistory,
    }) => {
      const prompt = "Summarize the packaging changes for the desktop release.";

      const { shellPage, composerPage } = getChatPages(
        platform,
        page,
        inputWindow,
      );

      await enableFakeLanguageModel(shellPage);
      if (platform === "electron") {
        await enableFakeLanguageModel(composerPage);
      }
      await seedCompletedAppState();
      await openChat();
      await focusComposerPage(platform, composerPage);
      await sendPromptAndWaitForAssistant(composerPage, prompt, shellPage);

      await shellPage
        .locator('[data-testid^="chat-message-regenerate-button-"]')
        .last()
        .click();

      await waitForAssistantTurn(
        shellPage,
        prompt,
        buildExpectedFakeAssistantResponse(prompt),
      );

      let currentMessages = await readCurrentChatMessages(shellPage);
      expect(currentMessages[1]?.branchInfo?.totalBranches).toBe(2);
      expect(currentMessages[1]?.branchInfo?.currentIndex).toBe(2);

      await shellPage
        .locator('[data-testid^="chat-message-assistant-previous-branch-"]')
        .first()
        .click();

      await expect
        .poll(
          async () =>
            (await readCurrentChatMessages(shellPage))[1]?.branchInfo
              ?.currentIndex,
        )
        .toBe(1);

      await shellPage
        .locator('[data-testid^="chat-message-assistant-next-branch-"]')
        .first()
        .click();

      await expect
        .poll(
          async () =>
            (await readCurrentChatMessages(shellPage))[1]?.branchInfo
              ?.currentIndex,
        )
        .toBe(2);

      await expect
        .poll(async () => (await readPersistedChats(shellPage)).length)
        .toBe(1);

      await shellPage.reload();
      await openHistory();
      await shellPage
        .locator('[data-testid^="chat-history-item-"]')
        .first()
        .click();

      currentMessages = await readCurrentChatMessages(shellPage);
      expect(currentMessages[1]?.branchInfo?.totalBranches).toBe(2);

      const reloadedBranchIndex = currentMessages[1]?.branchInfo?.currentIndex;
      expect([1, 2]).toContain(reloadedBranchIndex);

      if (reloadedBranchIndex === 1) {
        await shellPage
          .locator('[data-testid^="chat-message-assistant-next-branch-"]')
          .first()
          .click();

        await expect
          .poll(
            async () =>
              (await readCurrentChatMessages(shellPage))[1]?.branchInfo
                ?.currentIndex,
          )
          .toBe(2);
      } else {
        await shellPage
          .locator('[data-testid^="chat-message-assistant-previous-branch-"]')
          .first()
          .click();

        await expect
          .poll(
            async () =>
              (await readCurrentChatMessages(shellPage))[1]?.branchInfo
                ?.currentIndex,
          )
          .toBe(1);
      }
    });
  });
};

export const registerChatHistorySuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test.describe(`${platform} chat history`, () => {
    test(`@${platform} shows the empty chat history state`, async ({
      page,
      seedCompletedAppState,
      openHistory,
    }) => {
      await seedCompletedAppState();
      await openHistory();

      await expect(page.getByTestId("chat-history-panel")).toBeVisible();
      await expect(page.getByText("No chat history yet")).toBeVisible();
    });

    test(`@${platform} filters history results, shows no-match state, and clears search via the clear button`, async ({
      page,
      seedCompletedAppState,
      seedChatHistoryEntries,
      openHistory,
    }) => {
      await seedCompletedAppState();
      await seedChatHistoryEntries([...seededChats]);
      await openHistory();

      await expect(
        page.getByTestId("chat-history-item-chat_voice_plan"),
      ).toBeVisible();
      await expect(
        page.getByTestId("chat-history-item-chat_translation_notes"),
      ).toBeVisible();
      await expect(page.getByText("example.com/translation")).toBeVisible();

      await page.getByTestId("chat-history-search-input").fill("translation");
      await expect(
        page.getByTestId("chat-history-item-chat_translation_notes"),
      ).toBeVisible();
      await expect(
        page.getByTestId("chat-history-item-chat_voice_plan"),
      ).toBeHidden();

      await page.getByTestId("chat-history-search-input").fill("missing entry");
      await expect(page.getByText("No chats match your search")).toBeVisible();

      await page.getByTestId("chat-history-search-clear").click();
      await expect(page.getByTestId("chat-history-search-input")).toHaveValue(
        "",
      );
      await expect(
        page.getByTestId("chat-history-item-chat_voice_plan"),
      ).toBeVisible();
      await expect(
        page.getByTestId("chat-history-item-chat_translation_notes"),
      ).toBeVisible();
    });

    test(`@${platform} edits a chat title and keeps the new title after reload`, async ({
      page,
      seedCompletedAppState,
      seedChatHistoryEntries,
      openHistory,
    }) => {
      await seedCompletedAppState();
      await seedChatHistoryEntries([...seededChats]);
      await openHistory();

      await page.getByTestId("chat-history-edit-chat_voice_plan").click();
      await page
        .getByPlaceholder("Enter new title...")
        .fill("Voice setup execution");
      await page.getByRole("button", { name: /^Save$/ }).click();

      await expect(page.getByText("Voice setup execution")).toBeVisible();
      await expect(page.getByText("Voice workflow planning")).toBeHidden();

      await page.reload();
      await openHistory();

      await expect(page.getByText("Voice setup execution")).toBeVisible();
      await expect(page.getByText("Voice workflow planning")).toBeHidden();
    });

    test(`@${platform} deletes a chat and keeps it removed after reload`, async ({
      page,
      seedCompletedAppState,
      seedChatHistoryEntries,
      openHistory,
    }) => {
      await seedCompletedAppState();
      await seedChatHistoryEntries([...seededChats]);
      await openHistory();

      await page
        .getByTestId("chat-history-delete-chat_translation_notes")
        .click();
      await expect(page.getByText("Delete Chat?")).toBeVisible();
      await page.getByRole("button", { name: /^Delete$/ }).click();

      await expect(
        page.getByTestId("chat-history-item-chat_translation_notes"),
      ).toBeHidden();
      await expect(
        page.getByTestId("chat-history-item-chat_voice_plan"),
      ).toBeVisible();

      await page.reload();
      await openHistory();

      await expect(
        page.getByTestId("chat-history-item-chat_translation_notes"),
      ).toBeHidden();
      await expect(
        page.getByTestId("chat-history-item-chat_voice_plan"),
      ).toBeVisible();
    });

    test(`@${platform} loads a selected history item back into the chat view`, async ({
      page,
      seedCompletedAppState,
      seedChatHistoryEntries,
      openHistory,
    }) => {
      await seedCompletedAppState();
      await seedChatHistoryEntries([...seededChats]);
      await openHistory();

      await page.getByTestId("chat-history-item-chat_router_debug").click();

      await expect(page.getByTestId("chat-history-panel")).toBeHidden();
      await expect(
        page.getByText("Compare router and main model behavior."),
      ).toBeVisible();
      await expect(
        page.getByText("The router should stay concise and task-oriented."),
      ).toBeVisible();
    });
  });
};

export const registerChatVoiceModeSuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test.describe(`${platform} chat voice mode`, () => {
    test(`@${platform} exercises voice mode media controls and selector popups`, async ({
      page,
      inputWindow,
      seedCompletedAppState,
      openChat,
    }) => {
      await seedCompletedAppState();
      await openChat();

      const { composerPage } = getChatPages(platform, page, inputWindow);
      await focusComposerPage(platform, composerPage);

      await composerPage.getByTestId("chat-voice-mode-button").click();

      await expect(
        composerPage.getByTestId("chat-voice-mic-select"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("chat-voice-attach-image-button"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("chat-voice-camera-toggle-button"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("chat-voice-camera-select"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("chat-voice-screen-share-button"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("chat-voice-close-button"),
      ).toBeVisible();

      await selectOptionByTrigger(
        composerPage.getByTestId("chat-voice-mic-select"),
        "External Microphone",
      );
      await selectOptionByTrigger(
        composerPage.getByTestId("chat-voice-camera-select"),
        "Rear Camera",
      );

      const cameraToggle = composerPage.getByTestId(
        "chat-voice-camera-toggle-button",
      );
      await cameraToggle.click();
      await expect(cameraToggle).toHaveAttribute("title", "Stop Camera");
      await cameraToggle.click();
      await expect(cameraToggle).toHaveAttribute("title", "Start Camera");

      const screenShareToggle = composerPage.getByTestId(
        "chat-voice-screen-share-button",
      );
      await screenShareToggle.click();
      await expect(screenShareToggle).toHaveAttribute(
        "title",
        "Stop Screen Share",
      );
      await screenShareToggle.click();
      await expect(screenShareToggle).toHaveAttribute(
        "title",
        "Start Screen Share",
      );

      await composerPage.getByTestId("chat-voice-close-button").click();
      await expect(
        composerPage.getByTestId("chat-input-textarea"),
      ).toBeVisible();
      await expect(
        composerPage.getByTestId("chat-voice-close-button"),
      ).toBeHidden();
    });
  });
};
