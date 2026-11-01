import { useChatActions, useChatMessages } from "../../hooks/app/useChat";
import { readContextUsage } from "../../types/contextUsage";
import { ContextUsageIndicator } from "./ContextUsageIndicator";
import {
  getAIProviderSection,
  getThinkingSelection,
  getAvailableAIProviders,
  isRemoteAIProvider,
  getProviderDisplayName,
} from "../../config/aiConfig";
import {
  useAIConfig,
  useConfigAIActions,
  useApplyAIProfile,
} from "../../hooks/config/useConfigAI";
import { useDesktopComposerModel } from "../../hooks/useDesktopComposerModel";
import { isAndroid, isDesktop, isInputWindow } from "../../utils/PlatformUtils";
import { ComposerMenu } from "./ComposerMenu";
import { Select } from "../ui";
import ThinkingControl from "../ui/ThinkingControl";

import { useEmbedHost } from "../../embed/EmbedHostContext";
import {
  isSettingsTargetHidden,
  isSettingsTargetReadOnly,
  getAIContextSettingsTarget,
} from "../../embed/settingsPolicy";
import RemoteModelPicker from "../settings/shared/RemoteModelPicker";
import { Icon } from "../icons";
import { dispatchOpenSettingsCommand } from "../../embed/hostCommands";

const providers = getAvailableAIProviders({ isAndroid, isDesktop });

export function ComposerModelPicker({
  isLightBackground,
  onOpenChange,
}: {
  isLightBackground: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const config = useAIConfig();
  const chatMessages = useChatMessages();
  const { setIsChatContainerVisible } = useChatActions();
  const desktopModel = useDesktopComposerModel(config.provider);
  const { embedConfig, hostId } = useEmbedHost();
  const { updateAIConfig } = useConfigAIActions();
  const applyAIProfile = useApplyAIProfile();
  const provider = desktopModel.state?.provider ?? config.provider;
  const section = getAIProviderSection(provider);
  const connection = config[section];
  const current = desktopModel.state?.sections[section] ?? connection;
  const currentModel = "model" in current ? current.model : "";
  const contextLimit =
    "contextSize" in current &&
    typeof current.contextSize === "number" &&
    Number.isSafeInteger(current.contextSize) &&
    current.contextSize > 0
      ? current.contextSize
      : undefined;
  const selectedBackend =
    "selectedBackendProfileId" in current
      ? current.selectedBackendProfileId
      : "";
  const lastUsage = isInputWindow
    ? desktopModel.state?.contextUsage
    : readContextUsage(
        chatMessages.findLast((message) => message.role === "assistant")
          ?.contextUsage,
      );
  const contextUsage =
    lastUsage?.provider === provider &&
    lastUsage.model === currentModel &&
    (lastUsage.backendId || "") === selectedBackend
      ? lastUsage
      : undefined;
  const profiles = (
    desktopModel.state?.profiles ?? config.remoteProfiles
  ).filter((item) => item.provider === provider);
  const update = (path: string, value: string | boolean | undefined) => {
    if (isInputWindow) desktopModel.select(path, value);
    else if (path === "thinking" && typeof value === "string") {
      const selection = getThinkingSelection(value);
      if (selection) updateAIConfig(section, { ...connection, ...selection });
    } else if (path === "backend") {
      const profile = config.remoteProfiles.find(
        (item) => item.id === value && item.provider === provider,
      );
      if (profile) {
        applyAIProfile(profile);
      }
    } else updateAIConfig(path, value);
  };
  const variant = isLightBackground ? "ghost-dark" : "ghost";
  const selectedEffort = !current.thinkingEnabled
    ? "off"
    : current.thinkingEffort || "auto";
  if (isSettingsTargetHidden(embedConfig, "llm.provider.select")) return null;
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <ContextUsageIndicator
        usage={contextUsage}
        contextLimit={contextLimit}
        isLightBackground={isLightBackground}
        onOpenSettings={
          embedConfig.features.settings
            ? () => {
                if (isInputWindow) desktopModel.openContextSettings();
                else {
                  setIsChatContainerVisible(true);
                  dispatchOpenSettingsCommand(hostId, {
                    tab: "llm",
                    target: getAIContextSettingsTarget(
                      provider,
                      "apiFormat" in connection
                        ? connection.apiFormat
                        : undefined,
                    ),
                  });
                }
              }
            : undefined
        }
      />
      <ComposerMenu
        items={[]}
        popupClassName="w-64"
        isLightBackground={isLightBackground}
        onOpenChange={(open) => onOpenChange?.(open)}
        triggerLabel="Model and thinking"
        triggerTestId="chat-model-picker"
        disabled={isSettingsTargetReadOnly(embedConfig, "llm.provider.select")}
        triggerClassName="flex max-w-[9rem] items-center gap-1 rounded-lg px-2 py-2 text-xs text-current transition-colors hover:bg-current/10"
        triggerContent={
          <>
            <span className="truncate">
              {currentModel || getProviderDisplayName(provider) || "Model"}
            </span>
            <Icon name="chevron-down" size={13} />
          </>
        }
        align="end"
      >
        <div className="flex flex-col gap-2 p-1 text-sm">
          <Select
            aria-label="AI provider"
            value={provider}
            variant={variant}
            options={[...new Set([provider, ...providers])].map((p) => ({
              value: p,
              label: getProviderDisplayName(p),
            }))}
            onChange={(event) => {
              update("provider", event.target.value);
            }}
          />
          {profiles.length > 0 && (
            <Select
              aria-label="Saved backend"
              value={
                "selectedBackendProfileId" in current
                  ? current.selectedBackendProfileId
                  : ""
              }
              variant={variant}
              options={[
                { value: "", label: "Current connection" },
                ...profiles.map((p) => ({ value: p.id, label: p.name })),
              ]}
              onChange={(event) => {
                if (event.target.value) update("backend", event.target.value);
              }}
            />
          )}
          {isRemoteAIProvider(provider) && (
            <RemoteModelPicker
              variant="ghost"
              provider={provider}
              customModelsPath={
                "customModelsPath" in connection
                  ? connection.customModelsPath
                  : undefined
              }
              value={currentModel || ""}
              onChange={(value) => update(`${section}.model`, value)}
              loadModels={isInputWindow ? desktopModel.loadModels : undefined}
              endpoint={
                "endpoint" in connection ? connection.endpoint : undefined
              }
              apiKey={"apiKey" in connection ? connection.apiKey : undefined}
              isLightBackground={isLightBackground}
            />
          )}

          <ThinkingControl
            value={selectedEffort}
            onChange={(value) => update("thinking", value)}
          />
        </div>
      </ComposerMenu>
    </div>
  );
}
