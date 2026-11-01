import { useMemo, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { ScrollArea } from "@base-ui/react/scroll-area";
import type {
  ResolvedVAssistEmbedConfig,
  VAssistOpenSettingsOptions,
} from "../embed/config";
import { getBrandedLabel } from "../embed/branding";
import {
  getAIProviderSection,
  TTSProviders,
  STTProviders,
} from "../config/aiConfig";
import { BackgroundThemeModes } from "../config/uiConfig";
import { PromptConfig } from "../config/promptConfig";
import { useAIConfig, useConfigAIActions } from "../hooks/config/useConfigAI";
import {
  useConfigTTSActions,
  useTTSConfig,
} from "../hooks/config/useConfigTTS";
import {
  useConfigSTTActions,
  useSTTConfig,
} from "../hooks/config/useConfigSTT";
import { useUIConfig, useConfigUIActions } from "../hooks/config/useConfigUI";
import { useChatActions, useIsTempChat } from "../hooks/app/useChat";
import { useDesktopApi } from "../hooks/useDesktopStore";
import { isAndroid, isDesktop } from "../utils/PlatformUtils";
import { cn } from "../utils/cn";
import Toggle from "./common/Toggle";
import { Icon } from "./icons";
import { Button, Select } from "./ui";
import DesktopModeSettings from "./settings/DesktopModeSettings";
import { XrSettings } from "./settings/XrSettings";

interface QuickAccessPanelProps {
  onClose: () => void;
  isLightBackground: boolean;
  embedConfig: ResolvedVAssistEmbedConfig;
  onOpenSettings?: (options?: VAssistOpenSettingsOptions) => void;
  animationClass?: string;
}

const TTS_PROVIDER_LABELS: Record<string, string> = {
  [TTSProviders.ANDROID_LOCAL]: "Android Local",
  [TTSProviders.DESKTOP_LOCAL]: "Desktop Local",
  [TTSProviders.KOKORO]: "Kokoro (Local)",
  [TTSProviders.OPENAI]: "OpenAI",
  [TTSProviders.OPENAI_COMPATIBLE]: "OpenAI-Compatible",
  [TTSProviders.GPTSOVITS_REMOTE]: "GPT-SoVITS (Remote)",
};

const STT_PROVIDER_LABELS: Record<string, string> = {
  [STTProviders.ANDROID_LOCAL]: "Android Local",
  [STTProviders.DESKTOP_LOCAL]: "Desktop Local",
  [STTProviders.CHROME_AI_MULTIMODAL]: "Chrome Built-in AI",
  [STTProviders.OPENAI]: "OpenAI",
  [STTProviders.OPENAI_COMPATIBLE]: "OpenAI-Compatible",
};

const QuickAccessPanel = ({
  onClose,
  isLightBackground,
  embedConfig,
  onOpenSettings,
  animationClass = "",
}: QuickAccessPanelProps) => {
  const [activeTab, setActiveTab] = useState("conversation");
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const aiConfig = useAIConfig();
  const { updateAIConfig } = useConfigAIActions();
  const ttsConfig = useTTSConfig();
  const { updateTTSConfig } = useConfigTTSActions();
  const sttConfig = useSTTConfig();
  const { updateSTTConfig } = useConfigSTTActions();
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const desktopAPI = useDesktopApi();
  const isTempChat = useIsTempChat();
  const { setIsTempChat } = useChatActions();

  const settingsTitle = getBrandedLabel(
    embedConfig,
    "settings.title",
    "Quick Access",
  );

  const availableTTSProviders = useMemo(() => {
    if (isAndroid) {
      const { DESKTOP_LOCAL, KOKORO, ...androidProviders } = TTSProviders;
      return androidProviders;
    }

    if (isDesktop) {
      const { ANDROID_LOCAL, ...desktopProviders } = TTSProviders;
      return desktopProviders;
    }

    const { ANDROID_LOCAL, DESKTOP_LOCAL, ...webProviders } = TTSProviders;
    return webProviders;
  }, []);

  const availableSTTProviders = useMemo(() => {
    if (isAndroid) {
      const { DESKTOP_LOCAL, CHROME_AI_MULTIMODAL, ...androidProviders } =
        STTProviders;
      return androidProviders;
    }

    if (isDesktop) {
      const { ANDROID_LOCAL, CHROME_AI_MULTIMODAL, ...desktopProviders } =
        STTProviders;
      return desktopProviders;
    }

    const { ANDROID_LOCAL, DESKTOP_LOCAL, ...webProviders } = STTProviders;
    return webProviders;
  }, []);

  const providerConfigKey = getAIProviderSection(aiConfig.provider);
  const providerConfig = aiConfig[providerConfigKey];

  // System prompt options: built-in presets + user's custom profiles
  const systemPromptOptions = useMemo(() => {
    const builtIns = Object.entries(PromptConfig.systemPrompts).map(
      ([id, val]) => ({
        value: id,
        label:
          providerConfig?.systemPromptProfiles?.find((p) => p.id === id)
            ?.name || val.name,
      }),
    );
    const customProfiles = Array.isArray(providerConfig?.systemPromptProfiles)
      ? providerConfig.systemPromptProfiles
          .filter((p) => p && !(p.id in PromptConfig.systemPrompts))
          .map((p) => ({ value: p.id, label: p.name || "Unnamed" }))
      : [];
    return [...builtIns, ...customProfiles];
  }, [providerConfig?.systemPromptProfiles]);

  const selectedPromptId =
    typeof providerConfig?.selectedSystemPromptProfileId === "string"
      ? providerConfig.selectedSystemPromptProfileId
      : "default";

  const setSystemPrompt = (profileId: string) => {
    const builtIn =
      PromptConfig.systemPrompts[
        profileId as keyof typeof PromptConfig.systemPrompts
      ];
    if (builtIn) {
      updateAIConfig(`${providerConfigKey}.systemPromptType`, profileId);
      const saved = providerConfig?.systemPromptProfiles?.find(
        (p) => p.id === profileId,
      );
      updateAIConfig(
        `${providerConfigKey}.systemPrompt`,
        saved?.prompt ?? builtIn.prompt,
      );
      updateAIConfig(
        `${providerConfigKey}.selectedSystemPromptProfileId`,
        profileId,
      );
      return;
    }
    const customProfiles = Array.isArray(providerConfig?.systemPromptProfiles)
      ? providerConfig.systemPromptProfiles
      : [];
    const custom = customProfiles.find((p) => p.id === profileId);
    if (custom) {
      updateAIConfig(`${providerConfigKey}.systemPromptType`, "custom");
      updateAIConfig(`${providerConfigKey}.systemPrompt`, custom.prompt || "");
      updateAIConfig(
        `${providerConfigKey}.selectedSystemPromptProfileId`,
        profileId,
      );
    }
  };

  const selectVariant = isLightBackground ? "ghost-dark" : "ghost";
  const selectClass = "max-w-[11rem] text-right";

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(value) => {
        if (typeof value !== "string" || value === activeTab) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
          setActiveTab(value);
        else setPendingTab(value);
      }}
      role="dialog"
      aria-label="Quick access panel"
      data-testid="quick-access-panel"
      className={cn(
        "quick-access-panel flex h-full flex-col overflow-hidden rounded-2xl border shadow-xl",
        isLightBackground
          ? "vassist-popup-surface-inverse vassist-inverse-text-primary"
          : "vassist-popup-surface vassist-text-primary",
        animationClass,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-current/10 px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{settingsTitle}</h2>
          <p className="text-xs opacity-50">Conversation preferences</p>
        </div>
        <Button
          variant="unstyled"
          size="icon"
          onClick={onClose}
          aria-label="Close quick access"
          className="rounded-full hover:bg-current/10"
        >
          <Icon name="close" size={17} />
        </Button>
      </header>
      <Tabs.List
        className="flex shrink-0 flex-col border-b border-current/15"
        aria-label="Quick Access categories"
      >
        <div className="flex w-full">
          {[
            { id: "conversation", label: "Chat" },
            { id: "voice", label: "Voice" },
            { id: "appearance", label: "Appearance" },
            ...(isDesktop &&
            (desktopAPI?.window?.setDesktopMode || desktopAPI?.xr)
              ? [{ id: "desktop", label: "Desktop" }]
              : []),
          ].map((tab) => (
            <Tabs.Tab
              key={tab.id}
              value={tab.id}
              className="flex min-w-0 flex-1 items-center justify-center px-3 py-2.5 text-xs font-medium opacity-55 transition-colors hover:bg-current/5 data-[active]:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-current"
            >
              {tab.label}
            </Tabs.Tab>
          ))}
        </div>
        <Tabs.Indicator className="quick-access-indicator" />
      </Tabs.List>
      <ScrollArea.Root className="flex min-h-0 flex-1 flex-col">
        <ScrollArea.Viewport className="min-h-0 flex-1 outline-none">
          <ScrollArea.Content
            className="quick-access-content flex min-w-0 flex-col gap-4 p-4"
            data-switching={pendingTab !== null}
            onTransitionEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.propertyName === "opacity" &&
                pendingTab
              ) {
                setActiveTab(pendingTab);
                setPendingTab(null);
              }
            }}
          >
            <Tabs.Panel value="conversation" className="flex flex-col gap-3">
              <h3 id="quick-conversation" className="quick-access-heading">
                <Icon name="chat" size={14} />
                Conversation
              </h3>
              <div className="quick-access-group">
                <div className="quick-access-row">
                  <div>
                    <span className="text-sm font-medium">Personality</span>
                    <p className="text-xs opacity-50">
                      How your assistant responds
                    </p>
                  </div>
                  <Select
                    aria-label="System prompt"
                    value={selectedPromptId}
                    onChange={(event) => setSystemPrompt(event.target.value)}
                    variant={selectVariant}
                    className={selectClass}
                    options={systemPromptOptions}
                  />
                </div>
                {embedConfig.features.history && (
                  <div className="quick-access-row">
                    <div>
                      <span className="text-sm font-medium">
                        Temporary chat
                      </span>
                      <p className="text-xs opacity-50">
                        Keep this chat out of history
                      </p>
                    </div>
                    <Toggle
                      aria-label="Temporary chat"
                      checked={isTempChat}
                      onChange={setIsTempChat}
                    />
                  </div>
                )}
                <div className="quick-access-row">
                  <span className="text-sm">Expand thinking</span>
                  <Toggle
                    aria-label="Auto-expand thinking"
                    data-testid="quick-thinking-autexpand-toggle"
                    checked={uiConfig.thinkingPanelAutoExpand === true}
                    onChange={(checked) =>
                      updateUIConfig("thinkingPanelAutoExpand", checked)
                    }
                  />
                </div>
              </div>
            </Tabs.Panel>
            <Tabs.Panel value="voice" className="flex flex-col gap-3">
              <h3 id="quick-voice" className="quick-access-heading">
                <Icon name="microphone" size={14} />
                Voice
              </h3>
              <div className="quick-access-group">
                <div className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">
                      Read replies aloud
                    </span>
                    <Toggle
                      aria-label="Enable voice output"
                      checked={ttsConfig.enabled}
                      onChange={(checked) =>
                        updateTTSConfig("enabled", checked)
                      }
                    />
                  </div>
                  <Select
                    aria-label="Voice output provider"
                    value={ttsConfig.provider}
                    disabled={!ttsConfig.enabled}
                    onChange={(event) =>
                      updateTTSConfig("provider", event.target.value)
                    }
                    variant={selectVariant}
                    options={Object.entries(availableTTSProviders).map(
                      ([key, value]) => ({
                        value,
                        label: TTS_PROVIDER_LABELS[value] || key,
                      }),
                    )}
                  />
                </div>
                <div className="px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Voice input</span>
                    <Toggle
                      aria-label="Enable voice input"
                      checked={sttConfig.enabled}
                      onChange={(checked) =>
                        updateSTTConfig("enabled", checked)
                      }
                    />
                  </div>
                  <Select
                    aria-label="Voice input provider"
                    value={sttConfig.provider}
                    disabled={!sttConfig.enabled}
                    onChange={(event) =>
                      updateSTTConfig("provider", event.target.value)
                    }
                    variant={selectVariant}
                    options={Object.entries(availableSTTProviders).map(
                      ([key, value]) => ({
                        value,
                        label: STT_PROVIDER_LABELS[value] || key,
                      }),
                    )}
                  />
                </div>
              </div>
            </Tabs.Panel>
            <Tabs.Panel value="appearance" className="flex flex-col gap-3">
              <h3 id="quick-appearance" className="quick-access-heading">
                <Icon name="settings" size={14} />
                Appearance
              </h3>
              <div className="quick-access-group">
                <div className="quick-access-row">
                  <span className="text-sm">Theme</span>
                  <Select
                    aria-label="Theme"
                    value={
                      uiConfig.backgroundDetection?.mode ||
                      BackgroundThemeModes.ADAPTIVE
                    }
                    onChange={(event) =>
                      updateUIConfig(
                        "backgroundDetection.mode",
                        event.target.value,
                      )
                    }
                    variant={selectVariant}
                    className={selectClass}
                    options={[
                      {
                        value: BackgroundThemeModes.ADAPTIVE,
                        label: "Adaptive",
                      },
                      { value: "light", label: "Dark" },
                      { value: "dark", label: "Light" },
                    ]}
                  />
                </div>
                {embedConfig.features.liveAssistant3d && (
                  <div className="quick-access-row">
                    <span className="text-sm">Show avatar</span>
                    <Toggle
                      aria-label="Enable Avatar"
                      data-testid="quick-enable-avatar-toggle"
                      checked={uiConfig.enableModelLoading}
                      onChange={(enabled) =>
                        updateUIConfig("enableModelLoading", enabled)
                      }
                    />
                  </div>
                )}
                <div className="quick-access-row">
                  <span className="text-sm">Selection toolbar</span>
                  <Toggle
                    aria-label="AI toolbar"
                    checked={uiConfig.enableAIToolbar !== false}
                    onChange={(checked) =>
                      updateUIConfig("enableAIToolbar", checked)
                    }
                  />
                </div>
              </div>
            </Tabs.Panel>
            {isDesktop &&
              (desktopAPI?.window?.setDesktopMode || desktopAPI?.xr) && (
                <Tabs.Panel value="desktop" className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4">
                    {desktopAPI?.window && (
                      <DesktopModeSettings
                        isLightBackground={isLightBackground}
                        compact
                      />
                    )}
                    {desktopAPI?.xr && (
                      <XrSettings
                        isLightBackground={isLightBackground}
                        compact
                      />
                    )}
                  </div>
                </Tabs.Panel>
              )}
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          orientation="vertical"
          className="flex w-1.5 rounded-full p-px opacity-0 transition-opacity duration-200 data-[hovering]:opacity-100 data-[scrolling]:opacity-100 motion-reduce:transition-none"
        >
          <ScrollArea.Thumb className="w-full rounded-full bg-current/30" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
      {onOpenSettings && embedConfig.features.settings && (
        <footer className="shrink-0 border-t border-current/10 p-3">
          <Button
            variant="unstyled"
            onClick={() => onOpenSettings()}
            className="flex min-h-10 w-full justify-between rounded-xl px-3 text-sm hover:bg-current/10"
          >
            <span className="flex items-center gap-2">
              <Icon name="settings" size={16} />
              All settings
            </span>
            <Icon name="chevron-right" size={15} />
          </Button>
        </footer>
      )}
    </Tabs.Root>
  );
};

export default QuickAccessPanel;
