import { useShallow } from "zustand/react/shallow";
import { useConfigStore } from "../../stores/useConfigStore";

export const useTTSConfig = () => useConfigStore((state) => state.ttsConfig);

export const useTTSConfigSaved = () =>
  useConfigStore((state) => state.ttsConfigSaved);

export const useTTSConfigError = () =>
  useConfigStore((state) => state.ttsConfigError);

export const useTTSTesting = () => useConfigStore((state) => state.ttsTesting);

export const useConfigTTSActions = () =>
  useConfigStore(
    useShallow((state) => ({
      updateTTSConfig: state.updateTTSConfig,
      saveTTSConfig: state.saveTTSConfig,
      testTTSConnection: state.testTTSConnection,
      setTtsConfigError: state.setTtsConfigError,
      clearTTSConfigError: state.clearTTSConfigError,
    })),
  );
