import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const useTooling = () =>
  useAppStore(
    useShallow((state) => ({
      isSettingsPanelOpen: state.isSettingsPanelOpen,
      isHistoryPanelOpen: state.isHistoryPanelOpen,
      setIsSettingsPanelOpen: state.setIsSettingsPanelOpen,
      setIsHistoryPanelOpen: state.setIsHistoryPanelOpen,
      toggleSettingsPanel: state.toggleSettingsPanel,
      toggleHistoryPanel: state.toggleHistoryPanel,
      handleSummarize: state.handleSummarize,
      handleTranslate: state.handleTranslate,
      handleAddToChat: state.handleAddToChat,
      editUserMessage: state.editUserMessage,
      regenerateAIMessage: state.regenerateAIMessage,
      switchToBranch: state.switchToBranch,
      previousBranch: state.previousBranch,
      nextBranch: state.nextBranch,
      regenerateWithStreamingRef: state.regenerateWithStreamingRef,
      editWithStreamingRef: state.editWithStreamingRef,
    })),
  );
