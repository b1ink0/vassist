import {
  expect,
  type Locator,
  type Page,
  type TestType,
} from "@playwright/test";
import {
  clickTabByName,
  fillFieldByLabel,
  getFieldByLabel,
  getToggleByText,
  selectOptionByLabel,
  selectOptionByTrigger,
  setToggleState,
} from "../../helpers/interactions";

type SharedUITest = TestType<any, any>;

const openLlmSubTab = async (
  settingsPanel: Locator,
  subTab: "Provider" | "Routing" | "Profiles",
): Promise<void> => {
  await clickTabByName(settingsPanel, "LLM");
  await clickTabByName(settingsPanel, subTab);
};

const createSavedOpenAiBackend = async (
  page: Page,
  settingsPanel: Locator,
  name: string,
  apiKey: string,
): Promise<void> => {
  await selectOptionByLabel(settingsPanel, "Provider", "OpenAI");

  const backendNameInput = page.getByTestId("llm-saved-backend-name-input");
  await backendNameInput.fill(name);
  await backendNameInput.blur();

  const apiKeyField = getFieldByLabel(settingsPanel, "API Key");
  await apiKeyField.fill(apiKey);
  await apiKeyField.blur();

  await page.getByTestId("llm-saved-backend-save-button").click();

  const backendSelect = page.getByTestId("llm-saved-backend-select");
  await backendSelect.click();
  await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
};

export const registerSettings3DSuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test.describe(`${platform} 3D settings`, () => {
    test(`@${platform} exercises display and performance controls`, async ({
      page,
      seedCompletedAppState,
      openSettings,
    }) => {
      await seedCompletedAppState({
        uiConfig: {
          enableModelLoading: true,
        },
      });
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await clickTabByName(settingsPanel, "3D");
      const threeDPanel = page.getByTestId("settings-tab-3d");
      await clickTabByName(threeDPanel, "Display");

      await expect(
        getToggleByText(threeDPanel, "Enable Avatar"),
      ).toHaveAttribute("aria-checked", "true");
      await expect(
        page.getByRole("button", { name: /Reload Avatar/i }),
      ).toBeVisible();

      await setToggleState(getToggleByText(threeDPanel, "Portrait Mode"), true);
      await expect(page.getByText("Clipping Height")).toBeVisible();
      if (platform === "electron") {
        await expect(threeDPanel.getByText("Character Position")).toHaveCount(
          0,
        );
      } else {
        await selectOptionByLabel(
          threeDPanel,
          "Character Position",
          "Bottom Center",
        );
      }

      await clickTabByName(threeDPanel, "Performance");
      await setToggleState(
        getToggleByText(threeDPanel, "Physics Simulation"),
        true,
      );
      await expect(page.getByText("Physics Engine")).toBeVisible();

      await selectOptionByLabel(
        threeDPanel,
        "Frame Rate Limit",
        "30 FPS (Battery Saver)",
      );
      await selectOptionByLabel(
        threeDPanel,
        "Render Quality",
        "Custom (Advanced)",
      );
      await expect(page.getByText("Custom Quality Settings")).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Reset to Defaults/i }),
      ).toBeVisible();
    });

    test(`@${platform} exercises model animation and emote management surfaces`, async ({
      page,
      seedSettingsAppState,
      openSettings,
    }) => {
      await seedSettingsAppState();
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await clickTabByName(settingsPanel, "3D");
      const threeDPanel = page.getByTestId("settings-tab-3d");

      await clickTabByName(threeDPanel, "Models");
      await expect(page.getByText("Custom Models")).toBeVisible();
      await expect(page.getByText("Upload PMX Model (ZIP)")).toBeVisible();
      await expect(page.getByText("Custom Stages")).toBeVisible();
      await expect(page.getByText("Upload PMX Stage (ZIP)")).toBeVisible();

      await clickTabByName(threeDPanel, "Animations");
      await expect(page.getByText("Custom Animations")).toBeVisible();
      await expect(page.getByText("Upload VMD Animations")).toBeVisible();
      await expect(page.getByText("Animation Management")).toBeVisible();

      await clickTabByName(threeDPanel, "Emotes");
      await expect(page.getByText("Emote Management")).toBeVisible();
      await expect(page.getByPlaceholder("Enter emote name")).toBeVisible();
      await expect(
        page.getByPlaceholder("general, idle, talking"),
      ).toBeVisible();
      await expect(page.getByText("Import ZIP Package")).toBeVisible();
      await expect(page.getByText("Upload Audio")).toBeVisible();
      await expect(page.getByText("Upload Motion")).toBeVisible();
      await expect(page.getByText("Upload Camera (Optional)")).toBeVisible();

      await page.getByPlaceholder("Enter emote name").fill("Greeting Emote");
      await page
        .getByPlaceholder("general, idle, talking")
        .fill("general, greeting");
      await expect(
        page.getByRole("button", { name: /Upload Emote/i }),
      ).toBeVisible();
    });
  });
};

export const registerSettingsAIFeaturesSuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test.describe(`${platform} AI+ settings`, () => {
    test(`@${platform} exercises AI+ feature toggles and test controls`, async ({
      page,
      seedSettingsAppState,
      openSettings,
    }) => {
      await seedSettingsAppState();
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await clickTabByName(settingsPanel, "AI+");

      await setToggleState(page.locator("#translator-enabled"), true);
      await selectOptionByLabel(
        settingsPanel,
        "Default Translation Language",
        "Spanish",
      );
      await page.getByTestId("ai-feature-translator-test").click();
      await page.getByTestId("ai-feature-translator-clear").click();

      await setToggleState(page.locator("#language-detector-enabled"), true);
      await page.getByLabel("Test Text").fill("Bonjour tout le monde");
      await page.getByTestId("ai-feature-language-detector-test").click();
      await page.getByTestId("ai-feature-language-detector-clear").click();

      await setToggleState(page.locator("#summarizer-enabled"), true);
      await page.getByTestId("ai-feature-summarizer-test").click();
      await page.getByTestId("ai-feature-summarizer-clear").click();

      await setToggleState(page.locator("#rewriter-enabled"), true);
      await page.getByTestId("ai-feature-rewriter-test").click();
      await page.getByTestId("ai-feature-rewriter-clear").click();

      await setToggleState(page.locator("#writer-enabled"), true);
      await page.getByTestId("ai-feature-writer-test").click();
      await page.getByTestId("ai-feature-writer-clear").click();

      await expect(
        page.getByTestId("ai-feature-translator-section"),
      ).toBeVisible();
      await expect(
        page.getByTestId("ai-feature-language-detector-section"),
      ).toBeVisible();
      await expect(
        page.getByTestId("ai-feature-summarizer-section"),
      ).toBeVisible();
      await expect(
        page.getByTestId("ai-feature-rewriter-section"),
      ).toBeVisible();
      await expect(page.getByTestId("ai-feature-writer-section")).toBeVisible();
    });
  });
};

export const registerSettingsCoverageSuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test(`@${platform} key settings toggles change the visible UI and persist after reload`, async ({
    page,
    seedSettingsAppState,
    openSettings,
    flushConfigSaves,
  }) => {
    await seedSettingsAppState();
    await openSettings();

    const settingsPanel = page.getByTestId("settings-panel");

    await page.getByTestId("toggle-use-colored-icons").click();
    await expect(page.getByText("Toolbar Only")).toBeVisible();

    await page.getByRole("tab", { name: "TTS", exact: true }).click();
    await page.getByTestId("toggle-enable-tts").click();
    await expect(
      settingsPanel.getByText(
        platform === "electron"
          ? "Desktop Local TTS (GPT-SoVITS)"
          : "Kokoro TTS Configuration",
      ),
    ).toBeVisible();

    await flushConfigSaves(["ui", "tts"]);

    await page.reload();
    await openSettings();

    await expect(page.getByTestId("toggle-use-colored-icons")).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await page.getByRole("tab", { name: "TTS", exact: true }).click();
    await expect(page.getByTestId("toggle-enable-tts")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
};

export const registerSettingsLLMSuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test.describe(`${platform} LLM settings`, () => {
    test(`@${platform} exercises provider configuration surfaces across LLM backends`, async ({
      page,
      seedSettingsAppState,
      openSettings,
    }) => {
      await seedSettingsAppState();
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await openLlmSubTab(settingsPanel, "Provider");

      await selectOptionByLabel(settingsPanel, "Provider", "OpenAI");
      await expect(page.getByText("Saved Backends")).toBeVisible();
      await page
        .getByTestId("llm-saved-backend-name-input")
        .fill("OpenAI Main");
      await fillFieldByLabel(settingsPanel, "API Key", "sk-test-openai-main");
      await setToggleState(page.locator("#openai-image-support"), true);
      await setToggleState(page.locator("#openai-audio-support"), true);

      await selectOptionByLabel(
        settingsPanel,
        "Provider",
        "OpenAI-Compatible / Ollama",
      );
      await fillFieldByLabel(
        settingsPanel,
        "Endpoint URL",
        "http://127.0.0.1:11434",
      );
      await setToggleState(page.locator("#ollama-image-support"), true);
      await setToggleState(page.locator("#ollama-audio-support"), true);
    });

    test(`@${platform} manages saved OpenAI backends used by routing profiles`, async ({
      page,
      seedSettingsAppState,
      openSettings,
    }) => {
      await seedSettingsAppState();
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await openLlmSubTab(settingsPanel, "Provider");

      await createSavedOpenAiBackend(
        page,
        settingsPanel,
        "Vision Remote",
        "sk-test-vision-key",
      );

      await page.getByTestId("llm-saved-backend-new-button").click();
      await createSavedOpenAiBackend(
        page,
        settingsPanel,
        "Router Remote",
        "sk-test-router-key",
      );

      const backendSelect = page.getByTestId("llm-saved-backend-select");
      await selectOptionByTrigger(backendSelect, "Vision Remote");
      await expect(
        page.getByTestId("llm-saved-backend-name-input"),
      ).toHaveValue("Vision Remote");
      await expect(getFieldByLabel(settingsPanel, "API Key")).toHaveValue(
        "sk-test-vision-key",
      );

      await selectOptionByTrigger(backendSelect, "Router Remote");
      await expect(
        page.getByTestId("llm-saved-backend-name-input"),
      ).toHaveValue("Router Remote");
      await expect(getFieldByLabel(settingsPanel, "API Key")).toHaveValue(
        "sk-test-router-key",
      );

      await page.getByTestId("llm-saved-backend-delete-button").click();

      await backendSelect.click();
      await expect(
        page.getByRole("option", { name: "Vision Remote", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("option", { name: "Router Remote", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
    });

    test(`@${platform} persists routing task model selections across reloads`, async ({
      page,
      seedSettingsAppState,
      openSettings,
      flushConfigSaves,
    }) => {
      await seedSettingsAppState();
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await openLlmSubTab(settingsPanel, "Provider");

      await createSavedOpenAiBackend(
        page,
        settingsPanel,
        "Vision Remote",
        "sk-test-vision-key",
      );

      await page.getByTestId("llm-saved-backend-new-button").click();
      await createSavedOpenAiBackend(
        page,
        settingsPanel,
        "Router Remote",
        "sk-test-router-key",
      );

      await openLlmSubTab(settingsPanel, "Routing");
      await setToggleState(
        page.getByTestId("llm-routing-enabled-toggle"),
        true,
      );
      await setToggleState(
        page.getByTestId("llm-routing-vision-use-main-toggle"),
        false,
      );
      await setToggleState(
        page.getByTestId("llm-routing-router-use-main-toggle"),
        false,
      );

      await selectOptionByTrigger(
        page.getByTestId("llm-routing-vision-profile-select"),
        "Vision Remote",
      );
      const visionModelInput = page.getByTestId(
        "llm-routing-vision-model-input",
      );
      await visionModelInput.fill("gpt-4o-mini-vision");
      await visionModelInput.blur();
      await page.keyboard.press("Escape");

      await selectOptionByTrigger(
        page.getByTestId("llm-routing-router-profile-select"),
        "Router Remote",
      );
      const routerModelInput = page.getByTestId(
        "llm-routing-router-model-input",
      );
      await routerModelInput.fill("gpt-4.1-mini-router");
      await routerModelInput.blur();
      await page.keyboard.press("Escape");

      await flushConfigSaves(["ai"]);

      await page.reload();
      await openSettings();

      const reloadedSettingsPanel = page.getByTestId("settings-panel");
      await openLlmSubTab(reloadedSettingsPanel, "Routing");

      await expect(
        page.getByTestId("llm-routing-enabled-toggle"),
      ).toHaveAttribute("aria-checked", "true");
      await expect(
        page.getByTestId("llm-routing-vision-use-main-toggle"),
      ).toHaveAttribute("aria-checked", "false");
      await expect(
        page.getByTestId("llm-routing-router-use-main-toggle"),
      ).toHaveAttribute("aria-checked", "false");
      await expect(
        page.getByTestId("llm-routing-vision-model-input"),
      ).toHaveValue("gpt-4o-mini-vision");
      await expect(
        page.getByTestId("llm-routing-router-model-input"),
      ).toHaveValue("gpt-4.1-mini-router");

      await expect(
        page.getByTestId("llm-routing-vision-profile-select"),
      ).toBeVisible();
      await expect(
        page.getByTestId("llm-routing-router-profile-select"),
      ).toBeVisible();
    });

    test(`@${platform} creates switches and persists system prompt profiles`, async ({
      page,
      seedSettingsAppState,
      openSettings,
      flushConfigSaves,
    }) => {
      await seedSettingsAppState();
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await openLlmSubTab(settingsPanel, "Profiles");

      const profileSelect = page.getByTestId("llm-system-profile-select");
      const profileNameInput = page.getByTestId(
        "llm-system-profile-name-input",
      );
      const profilePromptInput = page.getByTestId(
        "llm-system-profile-prompt-input",
      );

      await expect(profileNameInput).toHaveValue("Default");

      await page.getByTestId("llm-system-profile-add-button").click();
      await expect(profileNameInput).toHaveValue("Custom 1");

      await profileNameInput.fill("Planner Persona");
      await profileNameInput.blur();
      await profilePromptInput.fill(
        "You are a structured planning assistant with explicit step-by-step outputs.",
      );
      await profilePromptInput.blur();

      await selectOptionByTrigger(profileSelect, "Default");
      await expect(profileNameInput).toHaveValue("Default");
      await expect(profilePromptInput).toHaveValue(
        /helpful virtual assistant/i,
      );

      await selectOptionByTrigger(profileSelect, "Planner Persona");
      await expect(profileNameInput).toHaveValue("Planner Persona");
      await expect(profilePromptInput).toHaveValue(
        "You are a structured planning assistant with explicit step-by-step outputs.",
      );

      await profilePromptInput.fill(
        "You are a planning assistant that always answers with ordered implementation steps.",
      );
      await profilePromptInput.blur();

      await selectOptionByTrigger(profileSelect, "Professional");
      await expect(profileNameInput).toHaveValue("Professional");
      await expect(profilePromptInput).toHaveValue(
        /professional virtual assistant/i,
      );

      await selectOptionByTrigger(profileSelect, "Planner Persona");
      await expect(profileNameInput).toHaveValue("Planner Persona");
      await expect(profilePromptInput).toHaveValue(
        "You are a planning assistant that always answers with ordered implementation steps.",
      );

      await flushConfigSaves(["ai"]);

      await page.reload();
      await openSettings();

      const reloadedSettingsPanel = page.getByTestId("settings-panel");
      await openLlmSubTab(reloadedSettingsPanel, "Profiles");

      await expect(
        page.getByTestId("llm-system-profile-name-input"),
      ).toHaveValue("Planner Persona");
      await expect(
        page.getByTestId("llm-system-profile-prompt-input"),
      ).toHaveValue(
        "You are a planning assistant that always answers with ordered implementation steps.",
      );
    });

    test(`@${platform} deletes custom system prompt profiles from the selector`, async ({
      page,
      seedSettingsAppState,
      openSettings,
    }) => {
      await seedSettingsAppState();
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await openLlmSubTab(settingsPanel, "Profiles");

      const profileSelect = page.getByTestId("llm-system-profile-select");

      await page.getByTestId("llm-system-profile-add-button").click();
      await page
        .getByTestId("llm-system-profile-name-input")
        .fill("Temporary Persona");
      await page.getByTestId("llm-system-profile-name-input").blur();

      await expect(
        page.getByTestId("llm-system-profile-name-input"),
      ).toHaveValue("Temporary Persona");

      await page.getByTestId("llm-system-profile-delete-button").click();

      await profileSelect.click();
      await expect(
        page.getByRole("option", { name: "Temporary Persona", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
    });
  });
};

export const registerSettingsSTTSuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test.describe(`${platform} STT settings`, () => {
    test(`@${platform} exercises STT provider configuration and testing controls`, async ({
      page,
      seedSettingsAppState,
      openSettings,
    }) => {
      await seedSettingsAppState();
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await clickTabByName(settingsPanel, "STT");
      const sttPanel = page.getByTestId("settings-tab-stt");

      await setToggleState(sttPanel.getByTestId("toggle-enable-stt"), true);

      await selectOptionByLabel(sttPanel, "Provider", "OPENAI");
      await sttPanel.getByPlaceholder("Backend name").fill("Whisper OpenAI");
      await fillFieldByLabel(sttPanel, "API Key", "sk-test-stt-openai");
      await expect(sttPanel.getByText("Saved Backends")).toBeVisible();

      await selectOptionByLabel(sttPanel, "Provider", "OPENAI_COMPATIBLE");
      await fillFieldByLabel(sttPanel, "Endpoint URL", "http://localhost:8080");
      await expect(sttPanel.getByText("Language")).toBeVisible();

      if (platform === "electron") {
        await selectOptionByLabel(sttPanel, "Provider", "DESKTOP_LOCAL");
        await expect(
          sttPanel.getByText("Desktop Local STT (Whisper)"),
        ).toBeVisible();
        await expect(sttPanel.getByText("Whisper Model")).toBeVisible();
      } else {
        await selectOptionByLabel(sttPanel, "Provider", "CHROME_AI_MULTIMODAL");
        await expect(sttPanel.getByText("Output Language")).toBeVisible();
        await expect(sttPanel.getByText("Required Chrome Flags")).toBeVisible();
      }

      await expect(
        sttPanel.getByRole("button", { name: /Test Recording \(3s\)/i }),
      ).toBeVisible();
    });
  });
};

export const registerSettingsTTSSuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test.describe(`${platform} TTS settings`, () => {
    test(`@${platform} exercises TTS provider configuration and saved backend controls`, async ({
      page,
      seedSettingsAppState,
      openSettings,
    }) => {
      await seedSettingsAppState();
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await clickTabByName(settingsPanel, "TTS");
      const ttsPanel = page.getByTestId("settings-tab-tts");

      await setToggleState(ttsPanel.getByTestId("toggle-enable-tts"), true);
      await expect(
        ttsPanel.getByRole("heading", {
          name: "TTS Configuration",
          exact: true,
        }),
      ).toBeVisible();

      await selectOptionByLabel(ttsPanel, "Provider", "OPENAI");
      await ttsPanel.getByPlaceholder("Backend name").fill("Voice OpenAI");
      await fillFieldByLabel(ttsPanel, "API Key", "sk-test-tts-openai");
      await expect(ttsPanel.getByText("Saved Backends")).toBeVisible();

      await selectOptionByLabel(ttsPanel, "Provider", "OPENAI_COMPATIBLE");
      await fillFieldByLabel(ttsPanel, "Endpoint URL", "http://localhost:8000");
      await fillFieldByLabel(ttsPanel, "Voice", "default");

      await selectOptionByLabel(ttsPanel, "Provider", "KOKORO");
      await expect(
        ttsPanel.getByText("Kokoro TTS Configuration"),
      ).toBeVisible();
      await expect(ttsPanel.getByText("Device Backend")).toBeVisible();

      await expect(ttsPanel.getByText("Test Text")).toBeVisible();
      await expect(
        ttsPanel.getByPlaceholder("Enter text to test TTS..."),
      ).toBeVisible();
      await expect(
        ttsPanel.getByRole("button", { name: /Test TTS/i }),
      ).toBeVisible();
    });
  });
};

export const registerSettingsUISuite = (
  test: SharedUITest,
  platform: "web" | "extension" | "electron",
) => {
  test.describe(`${platform} UI settings`, () => {
    test(`@${platform} exercises nested UI settings controls and conditional sections`, async ({
      page,
      seedSettingsAppState,
      openSettings,
    }) => {
      await seedSettingsAppState();
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await clickTabByName(settingsPanel, "UI");
      const uiPanel = page.getByTestId("settings-tab-ui");

      await expect(
        page.getByRole("link", { name: /View Documentation/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Start Setup Wizard Again/i }),
      ).toBeVisible();

      await setToggleState(
        uiPanel.getByTestId("toggle-use-colored-icons"),
        true,
      );
      await expect(getToggleByText(uiPanel, "Toolbar Only")).toBeVisible();

      if (platform === "electron") {
        await expect(uiPanel.getByText("Chat Window Position")).toHaveCount(0);
      } else {
        await selectOptionByLabel(
          uiPanel,
          "Chat Window Position",
          "Bottom Center",
        );
      }

      await uiPanel.getByTestId("toggle-smooth-streaming-animation").click();

      await setToggleState(
        getToggleByText(uiPanel, "Show Emote Duration Bar"),
        true,
      );
      await expect(
        getToggleByText(uiPanel, "Show Emote Time Labels"),
      ).toBeVisible();

      await selectOptionByLabel(uiPanel, "Application Theme", "Adaptive");
      await expect(page.getByText("Adaptive Mode:")).toBeVisible();
      await fillFieldByLabel(uiPanel, "Detection Accuracy", "7");

      await setToggleState(
        getToggleByText(uiPanel, "Enable AI Toolbar"),
        false,
      );
      await expect(page.getByText("Show on Input Focus")).toBeHidden();

      await setToggleState(getToggleByText(uiPanel, "Enable AI Toolbar"), true);
      await expect(page.getByText("Show on Input Focus")).toBeVisible();
      await expect(page.getByText("Show on Image Hover")).toBeVisible();
    });

    test(`@${platform} exercises UI shortcuts backup restore and developer options`, async ({
      page,
      seedSettingsAppState,
      openSettings,
    }) => {
      await seedSettingsAppState();
      await openSettings();

      const settingsPanel = page.getByTestId("settings-panel");
      await clickTabByName(settingsPanel, "UI");
      const uiPanel = page.getByTestId("settings-tab-ui");

      await setToggleState(
        getToggleByText(uiPanel, "Enable Keyboard Shortcuts"),
        true,
      );

      await page.getByTestId("shortcut-input-open-chat").click();
      await page.keyboard.press("Control+Shift+KeyC");
      await page.getByTestId("shortcut-input-toggle-avatar").click();
      await page.keyboard.press("Control+Shift+KeyA");
      await page.getByTestId("shortcut-input-toggle-visibility").click();
      await page.keyboard.press("Control+Shift+KeyB");

      await page.getByTestId("shortcut-input-toggle-avatar-clear").click();
      await expect(
        page.getByTestId("shortcut-input-toggle-avatar"),
      ).toContainText("Not set");

      await setToggleState(
        getToggleByText(uiPanel, "Selective Export/Import"),
        true,
      );

      await expect(uiPanel.getByText("Config", { exact: true })).toBeVisible();
      await expect(page.getByText("Chat History")).toBeVisible();
      await expect(page.getByText("Backgrounds")).toBeVisible();
      await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Import", exact: true }),
      ).toBeVisible();

      await setToggleState(
        getToggleByText(uiPanel, "Enable Developer Tools"),
        true,
      );
    });
  });
};
