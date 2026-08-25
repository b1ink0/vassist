import { useEffect, useMemo, useState } from "react";
import type {
  ResolvedVAssistEmbedConfig,
  VAssistOpenSettingsOptions,
} from "../embed/config";
import { getBrandedLabel } from "../embed/branding";
import {
  AIProviders,
  TTSProviders,
  STTProviders,
  type AIRemoteProviderProfile,
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
import { isAndroid, isDesktop } from "../utils/PlatformUtils";
import { cn } from "../utils/cn";
import Toggle from "./common/Toggle";
import { Icon } from "./icons";
import { Select, SettingsRow } from "./ui";
import RemoteModelPicker from "./settings/shared/RemoteModelPicker";

type ProviderValue =
  | "openai"
  | "ollama"
  | "android-local"
  | "desktop-local"
  | "chrome-ai";

interface QuickAccessPanelProps {
  onClose: () => void;
  isLightBackground: boolean;
  embedConfig: ResolvedVAssistEmbedConfig;
  onOpenSettings?: (options?: VAssistOpenSettingsOptions) => void;
  animationClass?: string;
}

const LLM_PROVIDER_LABELS: Record<string, string> = {
  [AIProviders.OPENAI]: "OpenAI",
  [AIProviders.OLLAMA]: "OpenAI-Compatible / Ollama",
  [AIProviders.DESKTOP_LOCAL]: "Desktop Local",
  [AIProviders.ANDROID_LOCAL]: "Android Local",
  [AIProviders.CHROME_AI]: "Chrome Built-in AI",
};

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

const SectionHeader = ({
  label,
  toggle,
  onMore,
}: {
  label: string;
  toggle?: React.ReactNode;
  onMore?: () => void;
}) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-sm font-medium text-white leading-none">{label}</span>
    <div className="flex items-center gap-2 shrink-0">
      {toggle}
      {onMore && (
        <button
          type="button"
          onClick={onMore}
          className="flex items-center gap-0.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          style={{ lineHeight: 1 }}
        >
          <span style={{ lineHeight: 1 }}>More</span>
        </button>
      )}
    </div>
  </div>
);

const QuickAccessPanel = ({
  onClose,
  isLightBackground,
  embedConfig,
  onOpenSettings,
  animationClass = "",
}: QuickAccessPanelProps) => {
  const aiConfig = useAIConfig();
  const { updateAIConfig } = useConfigAIActions();
  const ttsConfig = useTTSConfig();
  const { updateTTSConfig } = useConfigTTSActions();
  const sttConfig = useSTTConfig();
  const { updateSTTConfig } = useConfigSTTActions();
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const isTempChat = useIsTempChat();
  const { setIsTempChat } = useChatActions();

  const settingsTitle = getBrandedLabel(
    embedConfig,
    "settings.title",
    "Quick Access",
  );

  const availableProviders = useMemo(() => {
    if (isAndroid) {
      const { DESKTOP_LOCAL, CHROME_AI, ...androidProviders } = AIProviders;
      return androidProviders;
    }

    if (isDesktop) {
      const { ANDROID_LOCAL, CHROME_AI, ...desktopProviders } = AIProviders;
      return desktopProviders;
    }

    const { ANDROID_LOCAL, DESKTOP_LOCAL, CHROME_AI, ...webProviders } =
      AIProviders;
    return webProviders;
  }, []);

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

  const provider = aiConfig.provider as ProviderValue;
  const modelProvider =
    provider === AIProviders.CHROME_AI
      ? null
      : (provider as Exclude<ProviderValue, "chrome-ai">);

  const selectedModel = useMemo(() => {
    if (provider === AIProviders.OPENAI) {
      return aiConfig.openai.model || "";
    }
    if (provider === AIProviders.OLLAMA) {
      return aiConfig.ollama.model || "";
    }
    if (provider === AIProviders.ANDROID_LOCAL) {
      return aiConfig["android-local"].model || "";
    }
    if (provider === AIProviders.DESKTOP_LOCAL) {
      return aiConfig["desktop-local"].model || "";
    }
    return "";
  }, [aiConfig, provider]);

  const modelEndpoint = useMemo(() => {
    if (provider === AIProviders.OPENAI) {
      return undefined;
    }
    if (provider === AIProviders.OLLAMA) {
      return aiConfig.ollama.endpoint;
    }
    if (provider === AIProviders.ANDROID_LOCAL) {
      return aiConfig["android-local"].endpoint;
    }
    if (provider === AIProviders.DESKTOP_LOCAL) {
      return aiConfig["desktop-local"].endpoint;
    }
    return undefined;
  }, [aiConfig, provider]);

  const modelApiKey = useMemo(() => {
    if (provider === AIProviders.OPENAI) {
      return aiConfig.openai.apiKey;
    }
    if (provider === AIProviders.OLLAMA) {
      return (aiConfig.ollama as { apiKey?: string }).apiKey;
    }
    return undefined;
  }, [aiConfig, provider]);

  const setModelForProvider = (value: string) => {
    if (provider === AIProviders.OPENAI) {
      updateAIConfig("openai.model", value);
      return;
    }
    if (provider === AIProviders.OLLAMA) {
      updateAIConfig("ollama.model", value);
      return;
    }
    if (provider === AIProviders.ANDROID_LOCAL) {
      updateAIConfig("android-local.model", value);
      return;
    }
    if (provider === AIProviders.DESKTOP_LOCAL) {
      updateAIConfig("desktop-local.model", value);
    }
  };

  // Per-provider config key (chrome-ai uses "chromeAi" as the config key)
  const providerConfigKey =
    provider === AIProviders.CHROME_AI ? "chromeAi" : provider;

  const thinkingEnabled =
    (aiConfig as Record<string, any>)[providerConfigKey]?.thinkingEnabled ===
    true;

  const thinkingEffort = (aiConfig as Record<string, any>)[providerConfigKey]
    ?.thinkingEffort;

  const providerConfig = useMemo(
    () =>
      (aiConfig as Record<string, unknown>)[providerConfigKey] as {
        temperature?: number;
        systemPromptType?: string;
        systemPrompt?: string;
        selectedSystemPromptProfileId?: string;
        systemPromptProfiles?: Array<{
          id: string;
          name: string;
          prompt?: string;
          isBuiltIn?: boolean;
        }>;
      },
    [aiConfig, providerConfigKey],
  );

  // Saved remote profiles for the current provider
  const profilesForProvider = useMemo<AIRemoteProviderProfile[]>(() => {
    if (provider === AIProviders.CHROME_AI) return [];
    if (!Array.isArray(aiConfig.remoteProfiles)) return [];
    return (aiConfig.remoteProfiles as AIRemoteProviderProfile[]).filter(
      (p) => p.provider === provider,
    );
  }, [aiConfig.remoteProfiles, provider]);

  const [selectedRemoteProfileId, setSelectedRemoteProfileId] = useState("");

  // Reset selected backend when provider changes
  useEffect(() => {
    setSelectedRemoteProfileId("");
  }, [provider]);

  const applyRemoteProfile = (profileId: string) => {
    // Empty selection = go back to defaults, show model picker again
    if (!profileId) {
      setSelectedRemoteProfileId("");
      return;
    }
    const profile = profilesForProvider.find((p) => p.id === profileId);
    if (!profile) return;
    const base = (aiConfig as Record<string, unknown>)[
      profile.provider
    ] as Record<string, unknown>;
    updateAIConfig(profile.provider, {
      ...base,
      ...(profile.endpoint !== undefined && { endpoint: profile.endpoint }),
      ...(profile.apiKey !== undefined && { apiKey: profile.apiKey }),
      model: profile.model,
      ...(profile.temperature !== undefined && {
        temperature: profile.temperature,
      }),
      ...(profile.maxTokens !== undefined && { maxTokens: profile.maxTokens }),
    });
    setSelectedRemoteProfileId(profileId);
  };

  // System prompt options: built-in presets + user's custom profiles
  const systemPromptOptions = useMemo(() => {
    const builtIns = Object.entries(PromptConfig.systemPrompts).map(
      ([id, val]) => ({ value: id, label: val.name }),
    );
    const customProfiles = Array.isArray(providerConfig?.systemPromptProfiles)
      ? providerConfig.systemPromptProfiles
          .filter((p) => p && !p.isBuiltIn)
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
      updateAIConfig(`${providerConfigKey}.systemPrompt`, builtIn.prompt);
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

  return (
    <div
      role="dialog"
      aria-label="Quick access panel"
      data-testid="quick-access-panel"
      className={cn(
        "absolute inset-0 flex flex-col glass-container rounded-2xl overflow-hidden",
        isLightBackground && "glass-container-dark",
        animationClass,
      )}
    >
      <div className="flex items-center justify-between px-4 md:px-6 py-2 md:py-4 border-b border-white/20">
        <h2 className="text-lg font-semibold text-white">{settingsTitle}</h2>

        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          aria-label="Close quick access"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-glass px-4 md:px-6 py-3 md:py-4 space-y-4">
        {/* LLM Provider */}
        <div className="flex flex-col gap-4">
          <SectionHeader
            label="LLM Provider"
            onMore={() =>
              onOpenSettings?.({ tab: "llm", target: "llm.provider" })
            }
          />
          <Select
            data-testid="quick-provider-select"
            value={provider}
            onChange={(event) => updateAIConfig("provider", event.target.value)}
            variant={isLightBackground ? "dark" : "default"}
            options={Object.entries(availableProviders).map(([key, value]) => ({
              value,
              label: LLM_PROVIDER_LABELS[value] || key,
            }))}
          />
          {profilesForProvider.length > 0 && (
            <Select
              value={selectedRemoteProfileId}
              onChange={(event) => applyRemoteProfile(event.target.value)}
              variant={isLightBackground ? "dark" : "default"}
              options={[
                { value: "", label: "Select saved backend" },
                ...profilesForProvider.map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              ]}
            />
          )}
          {modelProvider && !selectedRemoteProfileId && (
            <RemoteModelPicker
              inputTestId="quick-model-picker"
              value={selectedModel}
              onChange={setModelForProvider}
              provider={modelProvider}
              endpoint={modelEndpoint}
              apiKey={modelApiKey}
              placeholder="Search or type a model name"
              isLightBackground={isLightBackground}
            />
          )}
          <SettingsRow label="System Prompt" layout="stacked">
            <Select
              value={selectedPromptId}
              onChange={(event) => setSystemPrompt(event.target.value)}
              variant={isLightBackground ? "dark" : "default"}
              options={systemPromptOptions}
            />
          </SettingsRow>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white leading-none flex items-center gap-1.5">
              <Icon name="bulb" size={16} className="text-white/70" />
              Thinking
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {thinkingEnabled && (
                <Select
                  data-testid="quick-thinking-effort-select"
                  value={thinkingEffort ?? ""}
                  onChange={(event) =>
                    updateAIConfig(
                      `${providerConfigKey}.thinkingEffort`,
                      event.target.value || undefined,
                    )
                  }
                  variant={isLightBackground ? "dark" : "default"}
                  options={[
                    { value: "", label: "Auto" },
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                    { value: "xhigh", label: "Max" },
                  ]}
                />
              )}
              <Toggle
                data-testid="quick-thinking-toggle"
                checked={thinkingEnabled}
                onChange={(checked) =>
                  updateAIConfig(
                    `${providerConfigKey}.thinkingEnabled`,
                    checked,
                  )
                }
              />
            </div>
          </div>
        </div>

        {/* Text-to-Speech */}
        <div className="space-y-4">
          <SectionHeader
            label="Text-to-Speech"
            toggle={
              <Toggle
                checked={ttsConfig.enabled}
                onChange={(checked) => updateTTSConfig("enabled", checked)}
              />
            }
            onMore={() =>
              onOpenSettings?.({ tab: "tts", target: "tts.provider.select" })
            }
          />
          {ttsConfig.enabled && (
            <Select
              value={ttsConfig.provider}
              onChange={(event) =>
                updateTTSConfig("provider", event.target.value)
              }
              variant={isLightBackground ? "dark" : "default"}
              options={Object.entries(availableTTSProviders).map(
                ([key, value]) => ({
                  value,
                  label: TTS_PROVIDER_LABELS[value] || key,
                }),
              )}
            />
          )}
        </div>

        {/* Speech-to-Text */}
        <div className="space-y-4">
          <SectionHeader
            label="Speech-to-Text"
            toggle={
              <Toggle
                checked={sttConfig.enabled}
                onChange={(checked) => updateSTTConfig("enabled", checked)}
              />
            }
            onMore={() =>
              onOpenSettings?.({ tab: "stt", target: "stt.provider.select" })
            }
          />
          {sttConfig.enabled && (
            <Select
              value={sttConfig.provider}
              onChange={(event) =>
                updateSTTConfig("provider", event.target.value)
              }
              variant={isLightBackground ? "dark" : "default"}
              options={Object.entries(availableSTTProviders).map(
                ([key, value]) => ({
                  value,
                  label: STT_PROVIDER_LABELS[value] || key,
                }),
              )}
            />
          )}
        </div>

        {/* Interface */}
        {embedConfig.features.history ? (
          <div className="space-y-4">
            <SectionHeader
              label="Interface"
              onMore={() =>
                onOpenSettings?.({ tab: "ui", target: "ui.appearance" })
              }
            />
            <SettingsRow label="Theme" layout="stacked">
              <Select
                value={
                  uiConfig.backgroundDetection?.mode ||
                  BackgroundThemeModes.ADAPTIVE
                }
                onChange={(e) =>
                  updateUIConfig("backgroundDetection.mode", e.target.value)
                }
                variant={isLightBackground ? "dark" : "default"}
                options={[
                  { value: BackgroundThemeModes.ADAPTIVE, label: "Adaptive" },
                  { value: "light", label: "Dark" },
                  { value: "dark", label: "Light" },
                ]}
              />
            </SettingsRow>
            <SettingsRow label="AI Toolbar">
              <Toggle
                checked={uiConfig.enableAIToolbar !== false}
                onChange={(checked) =>
                  updateUIConfig("enableAIToolbar", checked)
                }
              />
            </SettingsRow>
            <SettingsRow
              label="Auto-expand Thinking"
              description="Keep the thought panel open while reasoning streams"
            >
              <Toggle
                data-testid="quick-thinking-autexpand-toggle"
                checked={uiConfig.thinkingPanelAutoExpand === true}
                onChange={(checked) =>
                  updateUIConfig("thinkingPanelAutoExpand", checked)
                }
              />
            </SettingsRow>
            <SettingsRow
              label="Temporary Chat"
              description={
                isTempChat
                  ? "Messages are not persisted"
                  : "Messages are saved in history"
              }
            >
              <Toggle
                checked={isTempChat}
                onChange={(checked) => setIsTempChat(checked)}
              />
            </SettingsRow>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default QuickAccessPanel;
