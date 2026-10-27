import { useShallow } from "zustand/react/shallow";
import { useConfigStore } from "../../stores/useConfigStore";

const useIsConfigLoading = () =>
  useConfigStore((state) => state.isConfigLoading);

const useUIConfig = () => useConfigStore((state) => state.uiConfig);

const useEnableModelLoading = () =>
  useConfigStore((state) => state.uiConfig.enableModelLoading);

const useUIConfigSaved = () => useConfigStore((state) => state.uiConfigSaved);

const useUIConfigError = () => useConfigStore((state) => state.uiConfigError);

const useConfigUIActions = () =>
  useConfigStore(
    useShallow((state) => ({
      updateUIConfig: state.updateUIConfig,
      saveUIConfig: state.saveUIConfig,
    })),
  );

export {
  useConfigUIActions,
  useEnableModelLoading,
  useIsConfigLoading,
  useUIConfig,
  useUIConfigError,
  useUIConfigSaved,
};
