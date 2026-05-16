import { useShallow } from "zustand/react/shallow";
import { useConfigStore } from "../../stores/useConfigStore";

export const useConfigUI = () =>
  useConfigStore(
    useShallow((state) => ({
      isConfigLoading: state.isConfigLoading,
      uiConfig: state.uiConfig,
      uiConfigSaved: state.uiConfigSaved,
      uiConfigError: state.uiConfigError,
      updateUIConfig: state.updateUIConfig,
      saveUIConfig: state.saveUIConfig,
    })),
  );
