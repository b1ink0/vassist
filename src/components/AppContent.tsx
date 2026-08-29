/**
 * @fileoverview Main application content component.
 */

import { lazy, Suspense, useEffect, useRef } from "react";
import { cn } from "../utils/cn";
import ChatController from "./chat/ChatController";
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

interface AppContentProps {
  mode?: string;
  requireSetupOnChatClick?: boolean;
  onRequireSetup?: () => void;
  forcePortraitMode?: boolean;
  embedConfig: ResolvedVAssistEmbedConfig;
}

const LazyLiveAssistantShell = lazy(
  () => import("./assistant/LiveAssistantShell"),
);

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
function AppContent({
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
  const readyEmittedRef = useRef(false);
  const liveAssistantEnabled = embedConfig.features.liveAssistant3d;
  const chatEnabled = embedConfig.features.chat;
  const enableModelLoading = isConfigLoading
    ? null
    : liveAssistantEnabled
      ? enableModelLoadingSetting
      : false;
  const chatControllerProps = onRequireSetup ? { onRequireSetup } : {};

  const shouldMountModel = useVisibilityUnmount(
    liveAssistantEnabled && enableModelLoading === true,
  );

  const shouldWaitForKokoro =
    liveAssistantEnabled &&
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
      {shouldShowBlockingLoading ? (
        <LoadingIndicator isVisible={true} />
      ) : (
        <>
          {liveAssistantEnabled && enableModelLoading && shouldMountModel ? (
            <Suspense fallback={<LoadingIndicator isVisible={true} />}>
              <LazyLiveAssistantShell
                mode={mode}
                forcePortraitMode={forcePortraitMode}
              />
            </Suspense>
          ) : null}

          <div
            className={cn(
              "transition-opacity duration-700",
              chatEnabled
                ? isChatUIReady
                  ? "opacity-100"
                  : "opacity-0"
                : "opacity-100",
            )}
          >
            <ChatController
              modelDisabled={!enableModelLoading}
              requireSetupOnChatClick={requireSetupOnChatClick}
              embedConfig={embedConfig}
              {...chatControllerProps}
            />
          </div>

          {chatEnabled && !enableModelLoading && !isChatUIReady && (
            <LoadingIndicator isVisible={true} />
          )}
        </>
      )}
    </div>
  );
}

export default AppContent;
