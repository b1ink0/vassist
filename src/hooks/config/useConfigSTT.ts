import { useShallow } from "zustand/react/shallow";
import { useConfigStore } from "../../stores/useConfigStore";

export const useSTTConfig = () => useConfigStore((state) => state.sttConfig);

export const useSTTConfigSaved = () =>
  useConfigStore((state) => state.sttConfigSaved);

export const useSTTConfigError = () =>
  useConfigStore((state) => state.sttConfigError);

export const useSTTTesting = () => useConfigStore((state) => state.sttTesting);

export const useConfigSTTActions = () =>
  useConfigStore(
    useShallow((state) => ({
      updateSTTConfig: state.updateSTTConfig,
      saveSTTConfig: state.saveSTTConfig,
      testSTTRecording: state.testSTTRecording,
      clearSTTConfigError: state.clearSTTConfigError,
    })),
  );
