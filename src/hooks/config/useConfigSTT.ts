import { useShallow } from "zustand/react/shallow";
import { useConfigStore } from "../../stores/useConfigStore";

export const useConfigSTT = () =>
  useConfigStore(
    useShallow((state) => ({
      sttConfig: state.sttConfig,
      sttConfigSaved: state.sttConfigSaved,
      sttConfigError: state.sttConfigError,
      sttTesting: state.sttTesting,
      updateSTTConfig: state.updateSTTConfig,
      saveSTTConfig: state.saveSTTConfig,
      testSTTRecording: state.testSTTRecording,
      clearSTTConfigError: state.clearSTTConfigError,
    })),
  );
