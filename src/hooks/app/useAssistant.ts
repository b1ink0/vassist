import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const useIsAssistantReady = () =>
  useAppStore((state) => state.isAssistantReady);

export const useIsChatUIReady = () =>
  useAppStore((state) => state.isChatUIReady);

export const useAssistantRef = () => useAppStore((state) => state.assistantRef);

export const useHandleAssistantReady = () =>
  useAppStore((state) => state.handleAssistantReady);

export const useAssistantActions = () =>
  useAppStore(
    useShallow((state) => ({
      setIsAssistantReady: state.setIsAssistantReady,
      setIsChatUIReady: state.setIsChatUIReady,
    })),
  );
