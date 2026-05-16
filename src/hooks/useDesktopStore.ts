import { useDesktopStore } from "../stores/useDesktopStore";

export const useDesktopApi = () => useDesktopStore((state) => state.api);

export const useDesktopApiReady = () =>
  useDesktopStore((state) => state.api !== null);
