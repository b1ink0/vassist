import { useShallow } from "zustand/react/shallow";
import { useConfigStore } from "../../stores/useConfigStore";

export const useConfigStatus = () =>
  useConfigStore(
    useShallow((state) => ({
      isConfigLoading: state.isConfigLoading,
      chromeAiStatus: state.chromeAiStatus,
      checkChromeAIAvailability: state.checkChromeAIAvailability,
      startChromeAIDownload: state.startChromeAIDownload,
      kokoroStatus: state.kokoroStatus,
      checkKokoroStatus: state.checkKokoroStatus,
      initializeKokoro: state.initializeKokoro,
    })),
  );