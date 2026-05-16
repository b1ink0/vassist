/**
 * AppContext compatibility layer backed by Zustand.
 */

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useInitializeAppStore } from "../hooks/bootstrap/useInitializeAppStore";
import { useAppStore, type AppStoreState } from "../stores/useAppStore";
import { useConfigStore } from "../stores/useConfigStore";

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  useInitializeAppStore();
  return <>{children}</>;
}

export function useAppStoreSelector<T>(selector: (state: AppStoreState) => T): T {
  return useAppStore(selector);
}

export const useApp = () => {
  const appState = useAppStore(
    useShallow((state) => ({
      isAssistantReady: state.isAssistantReady,
      isChatUIReady: state.isChatUIReady,
      assistantRef: state.assistantRef,
      sceneRef: state.sceneRef,
      positionManagerRef: state.positionManagerRef,
      handleAssistantReady: state.handleAssistantReady,
      setIsAssistantReady: state.setIsAssistantReady,
      setIsChatUIReady: state.setIsChatUIReady,
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
      isVoiceMode: state.isVoiceMode,
      isSpeaking: state.isSpeaking,
      setIsVoiceMode: state.setIsVoiceMode,
      setIsSpeaking: state.setIsSpeaking,
      isSettingsPanelOpen: state.isSettingsPanelOpen,
      isHistoryPanelOpen: state.isHistoryPanelOpen,
      setIsSettingsPanelOpen: state.setIsSettingsPanelOpen,
      setIsHistoryPanelOpen: state.setIsHistoryPanelOpen,
      playingMessageIndex: state.playingMessageIndex,
      loadingMessageIndex: state.loadingMessageIndex,
      setPlayingMessageIndex: state.setPlayingMessageIndex,
      setLoadingMessageIndex: state.setLoadingMessageIndex,
      isDraggingButton: state.isDraggingButton,
      isDraggingModel: state.isDraggingModel,
      isDragOverChat: state.isDragOverChat,
      setIsDraggingButton: state.setIsDraggingButton,
      setIsDraggingModel: state.setIsDraggingModel,
      setIsDragOverChat: state.setIsDragOverChat,
      buttonPosition: state.buttonPosition,
      setButtonPosition: state.setButtonPosition,
      modelOverlayPos: state.modelOverlayPos,
      setModelOverlayPos: state.setModelOverlayPos,
      showModelLoadingOverlay: state.showModelLoadingOverlay,
      setShowModelLoadingOverlay: state.setShowModelLoadingOverlay,
      savedModelPosition: state.savedModelPosition,
      setSavedModelPosition: state.setSavedModelPosition,
      toggleChat: state.toggleChat,
      openChat: state.openChat,
      closeChat: state.closeChat,
      clearChat: state.clearChat,
      stopGeneration: state.stopGeneration,
      loadChatFromHistory: state.loadChatFromHistory,
      updateChatMessages: state.updateChatMessages,
      editUserMessage: state.editUserMessage,
      regenerateAIMessage: state.regenerateAIMessage,
      switchToBranch: state.switchToBranch,
      previousBranch: state.previousBranch,
      nextBranch: state.nextBranch,
      regenerateWithStreamingRef: state.regenerateWithStreamingRef,
      editWithStreamingRef: state.editWithStreamingRef,
      startButtonDrag: state.startButtonDrag,
      endButtonDrag: state.endButtonDrag,
      startModelDrag: state.startModelDrag,
      endModelDrag: state.endModelDrag,
      updateButtonPosition: state.updateButtonPosition,
      toggleSettingsPanel: state.toggleSettingsPanel,
      toggleHistoryPanel: state.toggleHistoryPanel,
      handleSummarize: state.handleSummarize,
      handleTranslate: state.handleTranslate,
      handleAddToChat: state.handleAddToChat,
      sceneKey: state.sceneKey,
      reloadScene: state.reloadScene,
      forceChatOnlyMode: state.forceChatOnlyMode,
    })),
  );
  const configCompat = useConfigStore(
    useShallow((state) => ({
      enableModelLoading: state.isConfigLoading ? null : state.uiConfig.enableModelLoading,
      uiConfig: state.uiConfig,
      aiConfig: state.aiConfig,
    })),
  );

  return useMemo(
    () => ({
      ...appState,
      ...configCompat,
    }),
    [appState, configCompat],
  );
};
