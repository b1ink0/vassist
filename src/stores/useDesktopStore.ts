import { create } from "zustand";
import type { ElectronAPI } from "../types/electron";

const getDesktopApi = (): ElectronAPI | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.electron ?? null;
};

interface DesktopStoreState {
  api: ElectronAPI | null;
  refreshApi: () => void;
}

export const useDesktopStore = create<DesktopStoreState>((set) => ({
  api: getDesktopApi(),
  refreshApi: () => {
    set({ api: getDesktopApi() });
  },
}));
