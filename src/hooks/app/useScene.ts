import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const useSceneRef = () => useAppStore((state) => state.sceneRef);

export const usePositionManagerRef = () =>
  useAppStore((state) => state.positionManagerRef);

export const useModelOverlayPos = () =>
  useAppStore((state) => state.modelOverlayPos);

export const useShowModelLoadingOverlay = () =>
  useAppStore((state) => state.showModelLoadingOverlay);

export const useSavedModelPosition = () =>
  useAppStore((state) => state.savedModelPosition);

export const useSceneKey = () => useAppStore((state) => state.sceneKey);

export const useSceneActions = () =>
  useAppStore(
    useShallow((state) => ({
      setModelOverlayPos: state.setModelOverlayPos,
      setShowModelLoadingOverlay: state.setShowModelLoadingOverlay,
      setSavedModelPosition: state.setSavedModelPosition,
      reloadScene: state.reloadScene,
      recreateScene: state.recreateScene,
      forceChatOnlyMode: state.forceChatOnlyMode,
    })),
  );
