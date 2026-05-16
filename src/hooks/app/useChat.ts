import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const useChat = () =>
  useAppStore(
    useShallow((state) => ({
      isChatInputVisible: state.isChatInputVisible,
      isChatContainerVisible: state.isChatContainerVisible,
      chatMessages: state.chatMessages,
      isProcessing: state.isProcessing,
      currentChatId: state.currentChatId,
      isTempChat: state.isTempChat,
      pendingDropData: state.pendingDropData,
      setIsChatInputVisible: state.setIsChatInputVisible,
      setIsChatContainerVisible: state.setIsChatContainerVisible,
      setChatMessages: state.setChatMessages,
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
