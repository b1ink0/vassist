import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const useIsChatInputVisible = () =>
  useAppStore((state) => state.isChatInputVisible);

export const useIsChatContainerVisible = () =>
  useAppStore((state) => state.isChatContainerVisible);

export const useChatMessages = () => useAppStore((state) => state.chatMessages);

export const useChatDraft = () => useAppStore((state) => state.chatDraft);

export const useIsProcessing = () => useAppStore((state) => state.isProcessing);

export const useCurrentChatId = () =>
  useAppStore((state) => state.currentChatId);

export const useIsTempChat = () => useAppStore((state) => state.isTempChat);

export const usePendingDropData = () =>
  useAppStore((state) => state.pendingDropData);

export const useChatActions = () =>
  useAppStore(
    useShallow((state) => ({
      setIsChatInputVisible: state.setIsChatInputVisible,
      setIsChatContainerVisible: state.setIsChatContainerVisible,
      setChatMessages: state.setChatMessages,
      setChatDraft: state.setChatDraft,
      setIsProcessing: state.setIsProcessing,
      setCurrentChatId: state.setCurrentChatId,
      setIsTempChat: state.setIsTempChat,
      setPendingDropData: state.setPendingDropData,
      toggleChat: state.toggleChat,
      openChat: state.openChat,
      closeChat: state.closeChat,
      clearChat: state.clearChat,
      stopGeneration: state.stopGeneration,
      loadChatFromHistory: state.loadChatFromHistory,
      updateChatMessages: state.updateChatMessages,
    })),
  );
