import { useShallow } from "zustand/react/shallow";
import { useConfigStore } from "../../stores/useConfigStore";

export const useChromeAIStatus = () =>
  useConfigStore((state) => state.chromeAiStatus);

export const useKokoroStatus = () =>
  useConfigStore((state) => state.kokoroStatus);

export const useIsKokoroPreInitializing = () =>
  useConfigStore((state) => state.kokoroStatus.preInitializing);

export const useConfigStatusActions = () =>
  useConfigStore(
    useShallow((state) => ({
      checkChromeAIAvailability: state.checkChromeAIAvailability,
      startChromeAIDownload: state.startChromeAIDownload,
      checkKokoroStatus: state.checkKokoroStatus,
      initializeKokoro: state.initializeKokoro,
    })),
  );
