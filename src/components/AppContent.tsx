/**
 * @fileoverview Main application content component.
 */

import { useState, useCallback, useMemo } from "react";
import { cn } from "../utils/cn";
import VirtualAssistant from "./assistant/VirtualAssistant";
import ControlPanel from "./debug/ControlPanel";
import ChatController from "./chat/ChatController";
import LoadingIndicator from "./common/LoadingIndicator";
import ModelLoadingOverlay from "./ModelLoadingOverlay";
import {
  useAssistantRef,
  useHandleAssistantReady,
  useIsAssistantReady,
  useIsChatUIReady,
} from "../hooks/app/useAssistant";
import {
  usePositionManagerRef,
  useSceneKey,
  useSceneRef,
} from "../hooks/app/useScene";
import { useIsKokoroPreInitializing } from "../hooks/config/useConfigStatus";
import { useTTSConfig } from "../hooks/config/useConfigTTS";
import {
  useEnableModelLoading,
  useIsConfigLoading,
} from "../hooks/config/useConfigUI";
import { useVisibilityUnmount } from "../hooks/useVisibilityUnmount";
import Logger from "../services/LoggerService";
import type { PositionManagerLike, SceneWithMetadata } from "../babylon/types";

interface AppContentProps {
  mode?: string;
  requireSetupOnChatClick?: boolean;
  onRequireSetup?: () => void;
  forcePortraitMode?: boolean;
}

interface AssistantReadyPayload {
  animationManager: { getCurrentState: () => string };
  positionManager:
    | (PositionManagerLike & {
        applyPreset: (
          preset: string,
          options?: { modelSizePx?: { width: number; height: number } },
        ) => void;
      })
    | null;
  scene: SceneWithMetadata;
}

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
}: AppContentProps) {
  const [currentState, setCurrentState] = useState("IDLE");

  const isAssistantReady = useIsAssistantReady();
  const isChatUIReady = useIsChatUIReady();
  const assistantRef = useAssistantRef();
  const sceneRef = useSceneRef();
  const positionManagerRef = usePositionManagerRef();
  const contextHandleAssistantReady = useHandleAssistantReady();
  const sceneKey = useSceneKey();
  const isConfigLoading = useIsConfigLoading();
  const enableModelLoadingSetting = useEnableModelLoading();
  const isKokoroPreInitializing = useIsKokoroPreInitializing();
  const ttsConfig = useTTSConfig();
  const enableModelLoading = isConfigLoading ? null : enableModelLoadingSetting;
  const chatControllerProps = onRequireSetup ? { onRequireSetup } : {};

  const shouldMountModel = useVisibilityUnmount(enableModelLoading === true);

  const shouldWaitForKokoro =
    ttsConfig.enabled &&
    ttsConfig.provider === "kokoro" &&
    ttsConfig.kokoro?.keepModelLoaded !== false &&
    isKokoroPreInitializing;

  /**
   * Handles VirtualAssistant ready event.
   *
   * @param {Object} params
   * @param {Object} params.animationManager - Animation manager instance
   * @param {Object} params.positionManager - Position manager instance
   * @param {Object} params.scene - Babylon.js scene instance
   */
  const handleAssistantReady = useCallback(
    ({ animationManager, positionManager, scene }: AssistantReadyPayload) => {
      Logger.log("AppContent ${mode}", "VirtualAssistant ready!");
      setCurrentState(animationManager.getCurrentState());

      contextHandleAssistantReady({ animationManager, positionManager, scene });

      Logger.log(
        "AppContent ${mode}",
        "Position manager ref set, ready for position tracking",
      );
    },
    [contextHandleAssistantReady],
  );

  const virtualAssistantComponent = useMemo(() => {
    if (enableModelLoading === null) {
      return null;
    }
    if (!enableModelLoading) {
      return null;
    }
    if (shouldWaitForKokoro) {
      Logger.log(
        "AppContent",
        "Waiting for Kokoro pre-initialization before loading model...",
      );
      return null;
    }
    if (!shouldMountModel) {
      Logger.log(
        "AppContent",
        "Model unmounted due to prolonged tab inactivity",
      );
      return null;
    }
    return (
      <VirtualAssistant
        key={sceneKey}
        ref={assistantRef}
        onReady={handleAssistantReady}
        mode={mode}
        forcePortraitMode={forcePortraitMode}
      />
    );
  }, [
    enableModelLoading,
    shouldMountModel,
    shouldWaitForKokoro,
    handleAssistantReady,
    mode,
    forcePortraitMode,
    assistantRef,
    sceneKey,
  ]);

  return (
    <div className="relative">
      {enableModelLoading === null || shouldWaitForKokoro ? (
        <LoadingIndicator isVisible={true} />
      ) : (
        <>
          {virtualAssistantComponent}

          <ControlPanel
            isAssistantReady={isAssistantReady}
            currentState={currentState}
            assistantRef={assistantRef}
            sceneRef={sceneRef}
            positionManagerRef={positionManagerRef}
            onStateChange={setCurrentState}
          />

          <div
            className={cn(
              "transition-opacity duration-700",
              isChatUIReady ? "opacity-100" : "opacity-0",
            )}
          >
            <ChatController
              modelDisabled={!enableModelLoading}
              requireSetupOnChatClick={requireSetupOnChatClick}
              {...chatControllerProps}
            />
          </div>

          {!enableModelLoading && !isChatUIReady && (
            <LoadingIndicator isVisible={true} />
          )}

          <ModelLoadingOverlay />
        </>
      )}
    </div>
  );
}

export default AppContent;
