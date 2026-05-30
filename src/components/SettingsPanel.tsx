/**
 * @fileoverview Settings panel component with tabbed interface for UI, LLM, TTS, STT, and AI features configuration.
 */

import { useState, useEffect, useMemo, useRef } from "react";
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
import { cn } from "../utils/cn";
import TabBar from "./ui/TabBar";
import ChromeAIValidator from "../services/ChromeAIValidator";
import UISettings from "./settings/UISettings";
import ThreeDSettings from "./settings/ThreeDSettings";
import LLMSettings from "./settings/LLMSettings";
import TTSSettings from "./settings/TTSSettings";
import STTSettings from "./settings/STTSettings";
import AIFeaturesSettings from "./settings/AIFeaturesSettings";
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
import { useUIConfigSaved } from "../hooks/config/useConfigUI";
import Logger from "../services/LoggerService";

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
  onRequestResetSetupDialog,
  onRequestSettingsErrorDialog,
  refreshTrigger,
}: SettingsPanelProps) => {
  const { hostId } = useEmbedHost();
  const reactCustomizations = useVAssistReactCustomizations(hostId);
  const [activeTab, setActiveTab] = useState<SettingsTabId>("ui");
  const [activeNestedTarget, setActiveNestedTarget] =
    useState<VAssistSettingsTargetId | null>(null);
  const [hasChromeAI, setHasChromeAI] = useState(false);
  const [tabIndicatorStyle, setTabIndicatorStyle] = useState({
    left: 0,
    width: 0,
  });
  const tabsRef = useRef<Record<SettingsTabId, HTMLButtonElement | null>>({
    ui: null,
    "3d": null,
    llm: null,
    tts: null,
    stt: null,
    "ai-plus": null,
  });

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

  useEffect(() => {
    const activeTabElement = tabsRef.current[activeTab];
    if (activeTabElement) {
      const { offsetLeft, offsetWidth } = activeTabElement;
      setTabIndicatorStyle({ left: offsetLeft, width: offsetWidth });
    }
  }, [activeTab]);

  const visibleTabs = useMemo(
    () =>
      [
        {
          id: "ui" as const,
          label: "UI",
          className:
            "flex-shrink-0 w-full overflow-y-auto scrollbar-glass px-4 md:px-6 py-2 md:py-4",
          content: (
            <UISettings
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
          content: (
            <ThreeDSettings
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
          content: (
            <LLMSettings
              isLightBackground={isLightBackground}
              hasChromeAI={hasChromeAI}
              onRequestDeleteLLMModel={onRequestDeleteLLMModel}
              refreshTrigger={refreshTrigger}
              requestedSubTab={
                activeTab === "llm" ? (requestedView?.subTab ?? null) : null
              }
              onActiveTargetChange={
                activeTab === "llm" ? setActiveNestedTarget : undefined
              }
            />
          ),
        },
        {
          id: "tts" as const,
          label: "TTS",
          className:
            "flex-shrink-0 w-full overflow-y-auto scrollbar-glass px-4 md:px-6 py-2 md:py-4 relative",
          content: (
            <TTSSettings
              isLightBackground={isLightBackground}
              onRequestDeleteVoiceDialog={onRequestDeleteVoiceDialog}
              refreshTrigger={refreshTrigger}
            />
          ),
        },
        {
          id: "stt" as const,
          label: "STT",
          className:
            "flex-shrink-0 w-full overflow-y-auto scrollbar-glass px-4 md:px-6 py-2 md:py-4 relative",
          content: (
            <STTSettings
              isLightBackground={isLightBackground}
              hasChromeAI={hasChromeAI}
            />
          ),
        },
        {
          id: "ai-plus" as const,
          label: "AI+",
          className:
            "flex-shrink-0 w-full overflow-y-auto scrollbar-glass px-4 md:px-6 py-2 md:py-4 relative",
          content: <AIFeaturesSettings isLightBackground={isLightBackground} />,
        },
      ].filter((tab) => !embedConfig.settings.hiddenTabs.includes(tab.id)),
    [
      activeTab,
      embedConfig.settings.hiddenTabs,
      hasChromeAI,
      isLightBackground,
      onRequestDeleteEmoteDialog,
      onRequestDeleteLLMModel,
      onRequestDeleteModelDialog,
      onRequestDeleteMotionDialog,
      onRequestDeleteStageDialog,
      onRequestDeleteVoiceDialog,
      onRequestResetSetupDialog,
      onRequestSettingsErrorDialog,
      requestedView?.subTab,
      refreshTrigger,
    ],
  );

  useEffect(() => {
    if (visibleTabs.length === 0) {
      return;
    }

    if (visibleTabs.some((tab) => tab.id === activeTab)) {
      return;
    }

    setActiveTab(visibleTabs[0]?.id ?? "ui");
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    const requestedTab =
      requestedView?.tab ?? getSettingsTabFromTarget(requestedView?.target);

    if (!requestedTab) {
      return;
    }

    if (!visibleTabs.some((tab) => tab.id === requestedTab)) {
      return;
    }

    setActiveTab(requestedTab);
  }, [requestedView, visibleTabs]);

  useEffect(() => {
    if (activeTab !== "llm") {
      setActiveNestedTarget(null);
    }
  }, [activeTab]);

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
    if (activeTab === "ui") {
      if (uiConfigSaved)
        return {
          type: "success",
          message: "Auto-saved successfully",
          dismissible: false,
        };
    } else if (activeTab === "llm") {
      if (aiTesting)
        return {
          type: "testing",
          message: "Testing connection...",
          dismissible: false,
        };
      if (aiConfigSaved)
        return {
          type: "success",
          message: "Auto-saved successfully",
          dismissible: false,
        };
      if (aiConfigError) {
        const parsed = parseStatusMessage(aiConfigError);
        return { type: parsed.type, message: parsed.text, dismissible: true };
      }
    } else if (activeTab === "tts") {
      if (ttsTesting)
        return {
          type: "testing",
          message: "Testing TTS...",
          dismissible: false,
        };
      if (ttsConfigSaved)
        return {
          type: "success",
          message: "Auto-saved successfully",
          dismissible: false,
        };
      if (ttsConfigError) {
        const parsed = parseStatusMessage(ttsConfigError);
        return { type: parsed.type, message: parsed.text, dismissible: true };
      }
    } else if (activeTab === "stt") {
      if (sttTesting)
        return {
          type: "testing",
          message: "Testing STT...",
          dismissible: false,
        };
      if (sttConfigSaved)
        return {
          type: "success",
          message: "Auto-saved successfully",
          dismissible: false,
        };
      if (sttConfigError) {
        const parsed = parseStatusMessage(sttConfigError);
        return { type: parsed.type, message: parsed.text, dismissible: true };
      }
    }
    return null;
  };

  /**
   * Parses status message with prefix (success:, error:, warning:, etc.).
   *
   * @param {string} msg - Status message to parse
   * @returns {Object} Parsed status with type and text
   */
  const parseStatusMessage = (msg: string) => {
    const prefixMatch = msg.match(
      /^(success|warning|error|hourglass|error-status):\s*(.+)$/i,
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
  const activeTabIndex = Math.max(
    visibleTabs.findIndex((tab) => tab.id === activeTab),
    0,
  );

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

  return (
    <div
      role="dialog"
      aria-label="Settings panel"
      data-testid="settings-panel"
      className={cn(
        "absolute inset-0 flex flex-col glass-container rounded-2xl overflow-hidden",
        isLightBackground && "glass-container-dark",
        animationClass,
      )}
    >
      <div className="flex justify-between items-center px-4 md:px-6 py-2 md:py-4 border-b border-white/20">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-white shrink-0">
            {settingsTitle}
          </h2>

          {activeStatus && (
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg animate-in fade-in max-w-md min-w-0",
                activeStatus.type === "success"
                  ? "bg-emerald-500/10"
                  : activeStatus.type === "testing"
                    ? "bg-blue-500/10"
                    : activeStatus.type === "warning"
                      ? "bg-amber-500/10"
                      : "bg-red-500/10",
              )}
              title={activeStatus.message}
            >
              <span className="text-xs text-white truncate break-all overflow-hidden min-w-0 flex-1">
                {activeStatus.message}
              </span>
              {activeStatus.dismissible && (
                <button
                  onClick={handleDismissStatus}
                  className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-white/20 text-white/60 hover:text-white transition-colors text-xs"
                  aria-label="Dismiss"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors shrink-0"
          aria-label="Close settings"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="relative">
        <div
          className="absolute bottom-0 h-0.5 bg-white transition-all duration-300 ease-out"
          style={{
            left: `${tabIndicatorStyle.left}px`,
            width: `${tabIndicatorStyle.width}px`,
          }}
        />
        <TabBar
          tabs={visibleTabs.map(({ id, label }) => ({ id, label }))}
          activeTab={activeTab}
          onTabChange={(tabId) => setActiveTab(tabId as SettingsTabId)}
          tabsRef={tabsRef}
          ariaLabel="Settings sections"
        />
      </div>

      <div className="flex-1 overflow-hidden relative">
        {visibleTabs.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-white/70">
            {managedByHostLabel}
          </div>
        ) : (
          <div
            className="absolute inset-0 flex transition-transform duration-300 ease-out"
            style={{
              transform: `translateX(-${activeTabIndex * 100}%)`,
            }}
          >
            {visibleTabs.map((tab) => {
              const tabIsReadOnly = embedConfig.settings.readOnlyTabs.includes(
                tab.id,
              );

              return (
                <div key={tab.id} className={cn(tab.className, "relative")}>
                  {tab.content}
                  {tabIsReadOnly ? (
                    <div className="absolute inset-0 z-10 flex items-start justify-end bg-slate-950/35 backdrop-blur-[1px] pointer-events-auto">
                      <div className="m-4 rounded-lg border border-white/15 bg-slate-950/80 px-3 py-2 text-xs text-white/80 shadow-lg">
                        Managed by host
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {settingsExtension ? (
        <div className="border-t border-white/10 px-4 py-3">
          {settingsExtension}
        </div>
      ) : null}
    </div>
  );
};

export default SettingsPanel;
