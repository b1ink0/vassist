import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";

export const useIsSettingsPanelOpen = () =>
  useAppStore((state) => state.isSettingsPanelOpen);

export const useIsQuickPanelOpen = () =>
  useAppStore((state) => state.isQuickPanelOpen);

export const useIsHistoryPanelOpen = () =>
  useAppStore((state) => state.isHistoryPanelOpen);

export const useToolingActions = () =>
  useAppStore(
    useShallow((state) => ({
      setIsSettingsPanelOpen: state.setIsSettingsPanelOpen,
      setIsQuickPanelOpen: state.setIsQuickPanelOpen,
      setIsHistoryPanelOpen: state.setIsHistoryPanelOpen,
      toggleSettingsPanel: state.toggleSettingsPanel,
      toggleQuickPanel: state.toggleQuickPanel,
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
