/**
 * @fileoverview Settings panel with searchable navigation and scoped configuration pages.
 */

import { lazy, Suspense, useState, useEffect, useMemo, useRef } from "react";
import SettingsLoading from "./settings/shared/SettingsLoading";
import type {
  VAssistOpenSettingsOptions,
  ResolvedVAssistEmbedConfig,
  VAssistSettingsTabId,
  VAssistSettingsTargetId,
} from "../embed/config";
import { getBrandedLabel } from "../embed/branding";
import { useEmbedHost } from "../embed/EmbedHostContext";
import { useVAssistReactCustomizations } from "../embed/reactHostCustomizations";
import { Icon } from "./icons";
import { useAppStore } from "../stores/useAppStore";
import { isSettingsTargetHidden } from "../embed/settingsPolicy";
import SettingsLayout from "./settings/SettingsLayout";
import {
  settingsPages,
  getSettingsPage,
  defaultSettingsPage,
  type SettingsPage,
  type SettingsPageId,
} from "../config/settingsNavigation";
import { isDesktop, isAndroid } from "../utils/PlatformUtils";
import { useAIConfig } from "../hooks/config/useConfigAI";
import { AIProviders } from "../config/aiConfig";
import ChromeAIValidator from "../services/ai/ChromeAIValidator";
import {
  useAIConfigError,
  useAIConfigSaved,
  useAITesting,
  useConfigAIActions,
} from "../hooks/config/useConfigAI";
import {
  useConfigSTTActions,
  useSTTConfigError,
  useSTTConfigSaved,
  useSTTTesting,
} from "../hooks/config/useConfigSTT";
import {
  useConfigTTSActions,
  useTTSConfigError,
  useTTSConfigSaved,
  useTTSTesting,
} from "../hooks/config/useConfigTTS";
import { useXrRuntime } from "../contexts/XrRuntimeContext";
import { canConfigureStages } from "../babylon/stages/stageAvailability";
import { useUIConfig, useUIConfigSaved } from "../hooks/config/useConfigUI";
import Logger from "../services/common/LoggerService";

const UISettings = lazy(() => import("./settings/UISettings"));
const ThreeDSettings = lazy(() => import("./settings/ThreeDSettings"));
const LLMSettings = lazy(() => import("./settings/LLMSettings"));
const TTSSettings = lazy(() => import("./settings/TTSSettings"));
const STTSettings = lazy(() => import("./settings/STTSettings"));
const AIFeaturesSettings = lazy(() => import("./settings/AIFeaturesSettings"));

type SettingsTabId = VAssistSettingsTabId;

interface SettingsPanelProps {
  onClose: () => void;
  isLightBackground: boolean;
  embedConfig: ResolvedVAssistEmbedConfig;
  requestedView?: VAssistOpenSettingsOptions | null;
  onActiveTargetChange?: (target: VAssistSettingsTargetId | null) => void;
  animationClass?: string;
  onRequestDeleteModelDialog?: (modelId: string) => void;
  onRequestDeleteMotionDialog?: (motionId: string) => void;
  onRequestDeleteStageDialog?: (stageId: string) => void;
  onRequestDeleteEmoteDialog?: (payload: {
    emoteId?: string;
    category?: string;
  }) => void;
  onRequestDeleteVoiceDialog?: (voiceId: string) => void;
  onRequestDeleteLLMModel?: (modelName: string) => void;
  onRequestDeleteSttModel?: (variantId: string) => void;
  onRequestDeleteTtsPack?: (packId: string) => void;
  sttExternalDeleteTick?: number | undefined;
  ttsExternalDeleteTick?: number | undefined;
  onRequestResetSetupDialog?: (onConfirm: () => Promise<void> | void) => void;
  onRequestSettingsErrorDialog?: (message: string) => void;
  refreshTrigger: number;
}

const getSettingsTabFromTarget = (
  target?: VAssistSettingsTargetId | null,
): VAssistSettingsTabId | null => {
  if (!target) {
    return null;
  }

  if (
    target === "ui" ||
    target === "3d" ||
    target === "llm" ||
    target === "tts" ||
    target === "stt" ||
    target === "ai-plus"
  ) {
    return target;
  }

  if (target.startsWith("ui.")) {
    return "ui";
  }
  if (target.startsWith("llm.")) {
    return "llm";
  }
  if (target.startsWith("tts.")) {
    return "tts";
  }
  if (target.startsWith("stt.")) {
    return "stt";
  }
  if (target.startsWith("ai-plus.")) {
    return "ai-plus";
  }
  if (target.startsWith("3d.")) {
    return "3d";
  }

  return null;
};

/**
 * Settings panel with configuration options for UI, LLM, TTS, STT, and AI features.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Function} props.onClose - Callback when panel is closed
 * @param {boolean} props.isLightBackground - Whether chat has light background
 * @param {string} props.animationClass - CSS animation class
 * @param {Function} props.onRequestDeleteModelDialog - Callback to show delete model dialog
 * @param {Function} props.onRequestDeleteMotionDialog - Callback to show delete motion dialog
 * @param {Function} props.onRequestDeleteVoiceDialog - Callback to show delete voice dialog
 * @param {Function} props.onRequestDeleteLLMModel - Callback to show delete LLM model dialog
 * @param {Function} props.onRequestDeleteSttModel - Callback to show delete STT model dialog
 * @param {Function} props.onRequestDeleteTtsPack - Callback to show delete TTS voice pack dialog
 * @param {number} props.sttExternalDeleteTick - Incremented after external STT delete to refresh status
 * @param {number} props.ttsExternalDeleteTick - Incremented after external TTS delete to refresh status
 * @param {number} props.refreshTrigger - Trigger to refresh lists after delete
 * @returns {JSX.Element} Settings panel component
 */
const SettingsPanel = ({
  onClose,
  isLightBackground,
  embedConfig,
  requestedView = null,
  onActiveTargetChange,
  animationClass = "",
  onRequestDeleteModelDialog,
  onRequestDeleteMotionDialog,
  onRequestDeleteStageDialog,
  onRequestDeleteEmoteDialog,
  onRequestDeleteVoiceDialog,
  onRequestDeleteLLMModel,
  onRequestDeleteSttModel,
  onRequestDeleteTtsPack,
  sttExternalDeleteTick,
  ttsExternalDeleteTick,
  onRequestResetSetupDialog,
  onRequestSettingsErrorDialog,
  refreshTrigger,
}: SettingsPanelProps) => {
  const { hostId } = useEmbedHost();
  const reactCustomizations = useVAssistReactCustomizations(hostId);
  const appliedRequest = useRef<VAssistOpenSettingsOptions | null>(null);
  const [hasChromeAI, setHasChromeAI] = useState(false);
  const activePage = useAppStore((state) => state.settingsPage);
  const setActivePage = useAppStore((state) => state.setSettingsPage);
  const [keptPages, setKeptPages] = useState<SettingsPageId[]>([]);
  const [searchTarget, setSearchTarget] = useState<VAssistSettingsTargetId>();
  const [targetRevision, setTargetRevision] = useState(0);
  const aiConfig = useAIConfig();
  const uiConfig = useUIConfig();
  const xr = useXrRuntime();
  const pageDefinition = settingsPages.find((page) => page.id === activePage)!;
  const activeTab = pageDefinition.tab;
  const activeNestedTarget =
    activeTab === "llm"
      ? (("llm." +
          (["routing", "decision", "profiles"].includes(pageDefinition.view)
            ? pageDefinition.view
            : "provider")) as VAssistSettingsTargetId)
      : null;
  useEffect(() => {
    if (
      ["runtime", "models", "voice-output", "voice-input", "data"].includes(
        activePage,
      )
    )
      setKeptPages((pages) =>
        pages.includes(activePage) ? pages : [...pages, activePage],
      );
  }, [activePage]);

  const uiConfigSaved = useUIConfigSaved();
  const aiConfigSaved = useAIConfigSaved();
  const aiConfigError = useAIConfigError();
  const aiTesting = useAITesting();
  const { clearAIConfigError } = useConfigAIActions();
  const ttsConfigSaved = useTTSConfigSaved();
  const ttsConfigError = useTTSConfigError();
  const ttsTesting = useTTSTesting();
  const { clearTTSConfigError } = useConfigTTSActions();
  const sttConfigSaved = useSTTConfigSaved();
  const sttConfigError = useSTTConfigError();
  const sttTesting = useSTTTesting();
  const { clearSTTConfigError } = useConfigSTTActions();

  useEffect(() => {
    const validator = ChromeAIValidator;
    const hasMinVersion = validator.hasMinimumChromeVersion();
    setHasChromeAI(hasMinVersion);

    if (!hasMinVersion) {
      const version = validator.getChromeVersion();
      Logger.log(
        "SettingsPanel",
        `Chrome ${version} detected - Chrome AI requires Chrome 138+`,
      );
    }
  }, []);

  const visibleTabs = useMemo(
    () =>
      [
        {
          id: "ui" as const,
          label: "UI",
          className:
            "flex-shrink-0 w-full h-full overflow-hidden scrollbar-glass",
          render: (pageDefinition: SettingsPage) => (
            <UISettings
              page={
                pageDefinition.tab === "ui" ? pageDefinition.view : undefined
              }
              isLightBackground={isLightBackground}
              {...(onRequestResetSetupDialog
                ? { onRequestResetSetupDialog }
                : {})}
              {...(onRequestSettingsErrorDialog
                ? { onRequestSettingsErrorDialog }
                : {})}
            />
          ),
        },
        {
          id: "3d" as const,
          label: "3D",
          className:
            "flex-shrink-0 w-full overflow-y-auto scrollbar-glass relative",
          render: (pageDefinition: SettingsPage) => (
            <ThreeDSettings
              page={
                pageDefinition.tab === "3d" ? pageDefinition.view : undefined
              }
              isLightBackground={isLightBackground}
              {...(onRequestDeleteModelDialog
                ? { onRequestDeleteModelDialog }
                : {})}
              {...(onRequestDeleteMotionDialog
                ? { onRequestDeleteMotionDialog }
                : {})}
              {...(onRequestDeleteStageDialog
                ? { onRequestDeleteStageDialog }
                : {})}
              {...(onRequestDeleteEmoteDialog
                ? { onRequestDeleteEmoteDialog }
                : {})}
              {...(onRequestSettingsErrorDialog
                ? { onRequestSettingsErrorDialog }
                : {})}
              refreshTrigger={refreshTrigger}
            />
          ),
        },
        {
          id: "llm" as const,
          label: "LLM",
          className:
            "flex-shrink-0 w-full overflow-y-auto scrollbar-glass relative",
          render: (pageDefinition: SettingsPage) => (
            <LLMSettings
              page={
                pageDefinition.tab === "llm" ? pageDefinition.view : undefined
              }
              isLightBackground={isLightBackground}
              hasChromeAI={hasChromeAI}
              onRequestDeleteLLMModel={onRequestDeleteLLMModel}
              refreshTrigger={refreshTrigger}
            />
          ),
        },
        {
          id: "tts" as const,
          label: "TTS",
          className:
            "flex-shrink-0 w-full overflow-y-auto scrollbar-glass px-4 md:px-6 py-2 md:py-4 relative",
          render: (_pageDefinition: SettingsPage) => (
            <TTSSettings
              isLightBackground={isLightBackground}
              onRequestDeleteVoiceDialog={onRequestDeleteVoiceDialog}
              {...(onRequestDeleteTtsPack ? { onRequestDeleteTtsPack } : {})}
              externalDeleteTick={ttsExternalDeleteTick}
              refreshTrigger={refreshTrigger}
            />
          ),
        },
        {
          id: "stt" as const,
          label: "STT",
          className:
            "flex-shrink-0 w-full overflow-y-auto scrollbar-glass px-4 md:px-6 py-2 md:py-4 relative",
          render: (_pageDefinition: SettingsPage) => (
            <STTSettings
              isLightBackground={isLightBackground}
              hasChromeAI={hasChromeAI}
              {...(onRequestDeleteSttModel ? { onRequestDeleteSttModel } : {})}
              externalDeleteTick={sttExternalDeleteTick}
            />
          ),
        },
        {
          id: "ai-plus" as const,
          label: "AI+",
          className:
            "flex-shrink-0 w-full overflow-y-auto scrollbar-glass px-4 md:px-6 py-2 md:py-4 relative",
          render: (_pageDefinition: SettingsPage) => (
            <AIFeaturesSettings isLightBackground={isLightBackground} />
          ),
        },
      ].filter((tab) => !embedConfig.settings.hiddenTabs.includes(tab.id)),
    [
      embedConfig.settings.hiddenTabs,
      hasChromeAI,
      isLightBackground,
      onRequestDeleteEmoteDialog,
      onRequestDeleteLLMModel,
      onRequestDeleteModelDialog,
      onRequestDeleteMotionDialog,
      onRequestDeleteStageDialog,
      onRequestDeleteVoiceDialog,
      onRequestDeleteSttModel,
      onRequestDeleteTtsPack,
      onRequestResetSetupDialog,
      onRequestSettingsErrorDialog,
      refreshTrigger,
      sttExternalDeleteTick,
      ttsExternalDeleteTick,
    ],
  );

  useEffect(() => {
    if (visibleTabs.length === 0) {
      return;
    }

    if (visibleTabs.some((tab) => tab.id === activeTab)) {
      return;
    }

    setActivePage(defaultSettingsPage(visibleTabs[0]?.id ?? "ui"));
  }, [activeTab, visibleTabs, setActivePage]);

  useEffect(() => {
    const requestedTab =
      requestedView?.tab ??
      getSettingsTabFromTarget(requestedView?.target ?? requestedView?.subTab);

    if (!requestedTab) {
      appliedRequest.current = null;
      return;
    }

    if (!visibleTabs.some((tab) => tab.id === requestedTab)) {
      return;
    }

    if (appliedRequest.current === requestedView) return;
    appliedRequest.current = requestedView;
    setActivePage(getSettingsPage(requestedView ?? {}));
    setSearchTarget(requestedView?.target);
    setTargetRevision((revision) => revision + 1);
  }, [requestedView, visibleTabs, setActivePage]);

  useEffect(() => {
    onActiveTargetChange?.(activeNestedTarget ?? activeTab);
  }, [activeNestedTarget, activeTab, onActiveTargetChange]);

  const settingsTitle = getBrandedLabel(
    embedConfig,
    "settings.title",
    "Settings",
  );
  const managedByHostLabel = getBrandedLabel(
    embedConfig,
    "settings.managedByHost",
    "Settings are managed by the host application.",
  );
  const settingsExtension = reactCustomizations.renderSettingsExtension?.({
    hostId,
    activeTab,
    activeTarget: activeNestedTarget ?? activeTab,
  });

  const getActiveStatus = () => {
    const service =
      activeTab === "llm"
        ? { testing: aiTesting, error: aiConfigError, saved: aiConfigSaved }
        : activeTab === "tts"
          ? {
              testing: ttsTesting,
              error: ttsConfigError,
              saved: ttsConfigSaved,
            }
          : activeTab === "stt"
            ? {
                testing: sttTesting,
                error: sttConfigError,
                saved: sttConfigSaved,
              }
            : null;
    if (service?.testing)
      return {
        type: "testing",
        message: "Testing connection…",
        dismissible: false,
      };
    if (service?.error) {
      const parsed = parseStatusMessage(service.error);
      return { type: parsed.type, message: parsed.text, dismissible: true };
    }
    if (service?.saved || (activeTab === "ui" && uiConfigSaved))
      return { type: "saved", message: "Saved", dismissible: false };
    return null;
  };

  /**
   * Parses status message with prefix (success:, error:, warning:, etc.).
   *
   * @param {string} msg - Status message to parse
   * @returns {Object} Parsed status with type and text
   */
  const parseStatusMessage = (msg: string) => {
    msg = msg.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "");
    const prefixMatch = msg.match(
      /^(success|warning|error|hourglass|error-status):\s*([\s\S]+)$/i,
    );
    if (!prefixMatch) {
      return { type: "info", text: msg };
    }
    const [, prefix, text] = prefixMatch;
    const lowerPrefix = (prefix || "").toLowerCase();

    if (lowerPrefix === "success") return { type: "success", text };
    if (lowerPrefix === "warning") return { type: "warning", text };
    if (lowerPrefix === "error" || lowerPrefix === "error-status")
      return { type: "error", text };
    if (lowerPrefix === "hourglass") return { type: "testing", text };

    return { type: "info", text };
  };

  const activeStatus = getActiveStatus();

  /**
   * Handles dismissal of status messages for LLM, TTS, or STT tabs.
   */
  const handleDismissStatus = () => {
    if (activeTab === "llm" && aiConfigError) {
      clearAIConfigError();
    } else if (activeTab === "tts" && ttsConfigError) {
      clearTTSConfigError();
    } else if (activeTab === "stt" && sttConfigError) {
      clearSTTConfigError();
    }
  };

  const availablePages = settingsPages.filter(
    (page) =>
      !isSettingsTargetHidden(
        embedConfig,
        page.tab === "llm"
          ? (("llm." +
              (["routing", "decision", "profiles"].includes(page.view)
                ? page.view
                : "provider")) as VAssistSettingsTargetId)
          : page.tab,
      ) &&
      visibleTabs.some((tab) => tab.id === page.tab) &&
      (page.id !== "desktop" || isDesktop) &&
      (page.id !== "scenes" ||
        xr.enabled ||
        canConfigureStages(uiConfig.desktopMode.mode)) &&
      (!["models", "runtime"].includes(page.id) ||
        (isDesktop && aiConfig.provider === AIProviders.DESKTOP_LOCAL) ||
        (isAndroid && aiConfig.provider === AIProviders.ANDROID_LOCAL)),
  );
  useEffect(() => {
    if (
      availablePages.length &&
      !availablePages.some((page) => page.id === activePage)
    ) {
      setActivePage(
        availablePages.find((page) => page.tab === activeTab)?.id ??
          availablePages[0]!.id,
      );
      setSearchTarget(undefined);
    }
  }, [activePage, activeTab, availablePages, setActivePage]);
  return (
    <SettingsLayout
      title={settingsTitle}
      pages={availablePages}
      activePage={activePage}
      target={searchTarget}
      targetRevision={targetRevision}
      onNavigate={(id, target) => {
        setActivePage(id);
        setSearchTarget(target);
        setTargetRevision((revision) => revision + 1);
      }}
      onClose={onClose}
      isLightBackground={isLightBackground}
      animationClass={animationClass}
      status={activeStatus}
      onDismissStatus={handleDismissStatus}
    >
      {visibleTabs.length === 0 ? (
        <p>{managedByHostLabel}</p>
      ) : (
        settingsPages
          .filter(
            (page) => page.id === activePage || keptPages.includes(page.id),
          )
          .filter((page) =>
            availablePages.some((available) => available.id === page.id),
          )
          .map((page) => {
            const owner = visibleTabs.find((tab) => tab.id === page.tab);
            return (
              owner && (
                <div
                  key={page.id}
                  hidden={page.id !== activePage}
                  data-testid={"settings-tab-" + page.tab}
                  inert={embedConfig.settings.readOnlyTabs.includes(page.tab)}
                  className="min-w-0"
                >
                  <Suspense fallback={<SettingsLoading />}>
                    {owner.render(page)}
                  </Suspense>
                </div>
              )
            );
          })
      )}
      {embedConfig.settings.readOnlyTabs.includes(activeTab) && (
        <p className="text-xs opacity-60">Managed by host</p>
      )}
      {settingsExtension}
    </SettingsLayout>
  );
};
export default SettingsPanel;
