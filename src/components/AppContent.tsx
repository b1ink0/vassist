/**
 * @fileoverview Main application content component.
 */

import { lazy, Suspense, useEffect, useRef } from "react";
import { cn } from "../utils/cn";
import LoadingIndicator from "./common/LoadingIndicator";
import {
  useIsAssistantReady,
  useIsChatUIReady,
} from "../hooks/app/useAssistant";
import { useIsKokoroPreInitializing } from "../hooks/config/useConfigStatus";
import { useTTSConfig } from "../hooks/config/useConfigTTS";
import {
  useEnableModelLoading,
  useIsConfigLoading,
} from "../hooks/config/useConfigUI";
import type { ResolvedVAssistEmbedConfig } from "../embed/config";
import { emitEmbedHostEvent } from "../embed/runtimeStore";
import { useVisibilityUnmount } from "../hooks/useVisibilityUnmount";
import { useWideDesktopHistory } from "../hooks/useWideDesktopHistory";
import {
  ANDROID_SYSTEM_INSET_TOP,
  HISTORY_SIDEBAR_WIDTH,
} from "./chat/historyLayout";
import { useAssistantControlTheme } from "./chat/assistant-controls/hooks/useAssistantControlTheme";
import { useUIConfig } from "../hooks/config/useConfigUI";
import AppModeSplitter from "./desktop/AppModeSplitter";
import {
  isAndroid,
  isAppModeWindow,
  isDesktopAttachedModeWindow,
  isXR,
  isDetachedAvatarWindow,
  isDetachedChatWindow,
} from "../utils/PlatformUtils";
import { useChatActions } from "../hooks/app/useChat";
import {
  useIsHistoryPanelOpen,
  useToolingActions,
} from "../hooks/app/useTooling";
import { useXrRuntime } from "../contexts/XrRuntimeContext";
import { Button } from "./ui";
import { Icon } from "./icons";

interface AppContentProps {
  mode?: string;
  requireSetupOnChatClick?: boolean;
  onRequireSetup?: () => void;
  forcePortraitMode?: boolean;
  embedConfig: ResolvedVAssistEmbedConfig;
}

const LiveAssistantShell = lazy(() => import("./assistant/LiveAssistantShell"));
const ChatController = lazy(() => import("./chat/ChatController"));
const XrRuntimeProvider = lazy(async () => ({
  default: (await import("./xr/XrRuntimeProvider")).XrRuntimeProvider,
}));

/**
 * Main application content component shared between development and extension modes.
 *
 * @param {Object} props
 * @param {string} props.mode - Application mode ('development'|'extension')
 * @param {boolean} props.requireSetupOnChatClick - Redirect chat button to setup flow
 * @param {Function} props.onRequireSetup - Callback to start setup flow
 * @param {boolean} props.forcePortraitMode - Force portrait mode for runtime preview
 * @returns {JSX.Element}
 */
function AppContentInner({
  mode = "development",
  requireSetupOnChatClick = false,
  onRequireSetup,
  forcePortraitMode = false,
  embedConfig,
}: AppContentProps) {
  const isAssistantReady = useIsAssistantReady();
  const isChatUIReady = useIsChatUIReady();
  const isConfigLoading = useIsConfigLoading();
  const enableModelLoadingSetting = useEnableModelLoading();
  const isKokoroPreInitializing = useIsKokoroPreInitializing();
  const ttsConfig = useTTSConfig();
  const xr = useXrRuntime();
  const isWideDesktopHistory = useWideDesktopHistory();
  const isHistoryPanelOpen = useIsHistoryPanelOpen();
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const uiConfig = useUIConfig();
  const { setIsHistoryPanelOpen, setIsQuickPanelOpen, setIsSettingsPanelOpen } =
    useToolingActions();
  const { setIsChatContainerVisible, setIsChatInputVisible } = useChatActions();
  const readyEmittedRef = useRef(false);
  const liveAssistantEnabled = embedConfig.features.liveAssistant3d;
  const chatEnabled = embedConfig.features.chat;
  const enableModelLoading = isConfigLoading
    ? null
    : liveAssistantEnabled && !isDetachedChatWindow
      ? enableModelLoadingSetting
      : false;
  const chatControllerProps = onRequireSetup ? { onRequireSetup } : {};
  const modelDisabled = !enableModelLoading || isDetachedChatWindow;
  const attachedHistoryLayout =
    (isAndroid || isDesktopAttachedModeWindow) && !xr.active;
  const showAttachedHistoryButton =
    attachedHistoryLayout && chatEnabled && embedConfig.features.history;
  const isHistoryButtonLight = useAssistantControlTheme({
    buttonRef: historyButtonRef,
    shouldRender: showAttachedHistoryButton,
    isDragging: false,
    mode: uiConfig.backgroundDetection?.mode,
  });
  const shiftForHistory =
    showAttachedHistoryButton && isWideDesktopHistory && isHistoryPanelOpen;

  const toggleAttachedHistory = () => {
    const nextOpen = !isHistoryPanelOpen;
    setIsQuickPanelOpen(false);
    setIsSettingsPanelOpen(false);
    if (nextOpen) {
      setIsChatContainerVisible(true);
      setIsChatInputVisible(true);
    }
    setIsHistoryPanelOpen(nextOpen);
  };

  const shouldMountModel = useVisibilityUnmount(
    liveAssistantEnabled &&
      enableModelLoading === true &&
      !isDetachedChatWindow,
  );

  const shouldWaitForKokoro =
    liveAssistantEnabled &&
    !isDetachedChatWindow &&
    ttsConfig.enabled &&
    ttsConfig.provider === "kokoro" &&
    ttsConfig.kokoro?.keepModelLoaded !== false &&
    isKokoroPreInitializing;

  useEffect(() => {
    if (readyEmittedRef.current || isConfigLoading) {
      return;
    }

    const hostReady = liveAssistantEnabled
      ? isAssistantReady
      : chatEnabled
        ? isChatUIReady
        : true;

    if (!hostReady) {
      return;
    }

    readyEmittedRef.current = true;
    emitEmbedHostEvent("ready", undefined, embedConfig.mount.hostId);
  }, [
    chatEnabled,
    embedConfig.mount.hostId,
    isAssistantReady,
    isChatUIReady,
    isConfigLoading,
    liveAssistantEnabled,
  ]);

  const shouldShowBlockingLoading =
    (isConfigLoading && (chatEnabled || liveAssistantEnabled)) ||
    ((chatEnabled || liveAssistantEnabled) && enableModelLoading === null) ||
    (liveAssistantEnabled && shouldWaitForKokoro);

  return (
    <div className="relative">
      {showAttachedHistoryButton && (
        <Button
          ref={historyButtonRef}
          onClick={toggleAttachedHistory}
          disabled={!isChatUIReady}
          size="icon"
          variant={isHistoryButtonLight ? "dark" : "default"}
          className="fixed left-3 top-3 z-[10010] h-12 w-12 rounded-full hover:scale-110 active:scale-95 transition-transform"
          style={{
            top: isAppModeWindow
              ? 44
              : isAndroid
                ? `calc(12px + ${ANDROID_SYSTEM_INSET_TOP})`
                : undefined,
          }}
          title="Chat history"
          aria-label="Chat history"
          aria-expanded={isHistoryPanelOpen}
          data-testid="chat-history-toggle-button"
          data-electron-interactive="true"
        >
          <Icon
            name={isHistoryPanelOpen ? "sidebar-close" : "sidebar-open"}
            size={18}
          />
        </Button>
      )}
      <div
        data-testid={
          attachedHistoryLayout ? "attached-assistant-layout" : undefined
        }
        className={cn(
          attachedHistoryLayout &&
            "transition-[margin-left,width] duration-300 ease-out motion-reduce:transition-none",
        )}
        style={{
          marginLeft: shiftForHistory ? HISTORY_SIDEBAR_WIDTH : 0,
          width: shiftForHistory
            ? `calc(100% - ${HISTORY_SIDEBAR_WIDTH}px)`
            : "100%",
          height: attachedHistoryLayout ? "100vh" : undefined,
          transform: attachedHistoryLayout ? "translateZ(0)" : undefined,
          position: attachedHistoryLayout ? "relative" : undefined,
          zIndex: attachedHistoryLayout ? 200 : undefined,
          pointerEvents: attachedHistoryLayout ? "none" : undefined,
        }}
      >
        {enableModelLoading && <AppModeSplitter />}
        {shouldShowBlockingLoading ? (
          <LoadingIndicator isVisible={true} />
        ) : (
          <>
            {liveAssistantEnabled && enableModelLoading && shouldMountModel ? (
              <Suspense fallback={<LoadingIndicator isVisible={true} />}>
                <div className="pointer-events-auto">
                  <LiveAssistantShell
                    mode={mode}
                    forcePortraitMode={forcePortraitMode}
                  />
                </div>
              </Suspense>
            ) : null}

            <div
              className={cn(
                "pointer-events-auto transition-opacity duration-700",
                chatEnabled
                  ? isChatUIReady
                    ? "opacity-100"
                    : "opacity-0"
                  : "opacity-100",
              )}
            >
              <Suspense fallback={null}>
                <ChatController
                  modelDisabled={modelDisabled}
                  avatarOnly={isDetachedAvatarWindow}
                  requireSetupOnChatClick={requireSetupOnChatClick}
                  embedConfig={embedConfig}
                  {...chatControllerProps}
                />
              </Suspense>
            </div>

            {chatEnabled && !enableModelLoading && !isChatUIReady && (
              <LoadingIndicator isVisible={true} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AppContent(props: AppContentProps) {
  if (!isXR && !props.embedConfig.features.xr)
    return <AppContentInner {...props} />;
  return (
    <Suspense fallback={<LoadingIndicator isVisible />}>
      <XrRuntimeProvider enabled>
        <AppContentInner {...props} />
      </XrRuntimeProvider>
    </Suspense>
  );
}
