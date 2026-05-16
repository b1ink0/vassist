import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const useAssistant = () =>
  useAppStore(
    useShallow((state) => ({
      isAssistantReady: state.isAssistantReady,
      isChatUIReady: state.isChatUIReady,
      assistantRef: state.assistantRef,
      sceneRef: state.sceneRef,
      positionManagerRef: state.positionManagerRef,
      handleAssistantReady: state.handleAssistantReady,
      setIsAssistantReady: state.setIsAssistantReady,
      setIsChatUIReady: state.setIsChatUIReady,
    })),
  );
