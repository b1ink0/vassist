import { useDesktopStore } from "../stores/useDesktopStore";

export const useDesktopApi = () => useDesktopStore((state) => state.api);

export const useRefreshDesktopApi = () =>
  useDesktopStore((state) => state.refreshApi);

export const useDesktopApiReady = () =>
  useDesktopStore((state) => state.api !== null);
