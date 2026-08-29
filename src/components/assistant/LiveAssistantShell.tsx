import { useCallback, useState } from "react";
import VirtualAssistant from "./VirtualAssistant";
import ControlPanel from "../debug/ControlPanel";
import ModelLoadingOverlay from "../ModelLoadingOverlay";
import {
  useAssistantRef,
  useHandleAssistantReady,
  useIsAssistantReady,
} from "../../hooks/app/useAssistant";
import {
  usePositionManagerRef,
  useSceneKey,
  useSceneRef,
} from "../../hooks/app/useScene";
import Logger from "../../services/LoggerService";
import type {
  PositionManagerLike,
  SceneWithMetadata,
} from "../../babylon/types";

interface LiveAssistantShellProps {
  mode?: string;
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

function LiveAssistantShell({
  mode = "development",
  forcePortraitMode = false,
}: LiveAssistantShellProps) {
  const [currentState, setCurrentState] = useState("IDLE");
  const isAssistantReady = useIsAssistantReady();
  const assistantRef = useAssistantRef();
  const sceneRef = useSceneRef();
  const positionManagerRef = usePositionManagerRef();
  const contextHandleAssistantReady = useHandleAssistantReady();
  const sceneKey = useSceneKey();

  const handleAssistantReady = useCallback(
    ({ animationManager, positionManager, scene }: AssistantReadyPayload) => {
      Logger.log(`AppContent ${mode}`, "VirtualAssistant ready!");
      setCurrentState(animationManager.getCurrentState());

      contextHandleAssistantReady({ animationManager, positionManager, scene });

      Logger.log(
        `AppContent ${mode}`,
        "Position manager ref set, ready for position tracking",
      );
    },
    [contextHandleAssistantReady, mode],
  );

  return (
    <>
      <VirtualAssistant
        key={sceneKey}
        ref={assistantRef}
        onReady={handleAssistantReady}
        mode={mode}
        forcePortraitMode={forcePortraitMode}
      />

      <ControlPanel
        isAssistantReady={isAssistantReady}
        currentState={currentState}
        assistantRef={assistantRef}
        sceneRef={sceneRef}
        positionManagerRef={positionManagerRef}
        onStateChange={setCurrentState}
      />

      <ModelLoadingOverlay />
    </>
  );
}

export default LiveAssistantShell;
