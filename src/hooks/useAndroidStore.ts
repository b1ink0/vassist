import { useAndroidStore } from "../stores/useAndroidStore";

export const useAndroidApi = () => useAndroidStore((state) => state.api);

export const useRefreshAndroidApi = () =>
  useAndroidStore((state) => state.refreshApi);

export const useAndroidReady = () => useAndroidStore((state) => state.isReady);
