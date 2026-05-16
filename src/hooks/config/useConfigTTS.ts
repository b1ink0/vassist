import { useShallow } from "zustand/react/shallow";
import { useConfigStore } from "../../stores/useConfigStore";

export const useConfigTTS = () =>
  useConfigStore(
    useShallow((state) => ({
      ttsConfig: state.ttsConfig,
      ttsConfigSaved: state.ttsConfigSaved,
      ttsConfigError: state.ttsConfigError,
      ttsTesting: state.ttsTesting,
      updateTTSConfig: state.updateTTSConfig,
      saveTTSConfig: state.saveTTSConfig,
      testTTSConnection: state.testTTSConnection,
      setTtsConfigError: state.setTtsConfigError,
      clearTTSConfigError: state.clearTTSConfigError,
    })),
  );
