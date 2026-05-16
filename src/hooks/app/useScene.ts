import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const useScene = () =>
  useAppStore(
    useShallow((state) => ({
      sceneRef: state.sceneRef,
      positionManagerRef: state.positionManagerRef,
      modelOverlayPos: state.modelOverlayPos,
      showModelLoadingOverlay: state.showModelLoadingOverlay,
      savedModelPosition: state.savedModelPosition,
      sceneKey: state.sceneKey,
      setModelOverlayPos: state.setModelOverlayPos,
      setShowModelLoadingOverlay: state.setShowModelLoadingOverlay,
      setSavedModelPosition: state.setSavedModelPosition,
      reloadScene: state.reloadScene,
      forceChatOnlyMode: state.forceChatOnlyMode,
    })),
  );
