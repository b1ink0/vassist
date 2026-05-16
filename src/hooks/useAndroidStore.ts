import { useAndroidStore } from "../stores/useAndroidStore";

export const useAndroidApi = () => useAndroidStore((state) => state.api);

export const useAndroidReady = () => useAndroidStore((state) => state.isReady);
