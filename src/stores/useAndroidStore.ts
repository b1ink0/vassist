import { create } from "zustand";
import type { AndroidAPI } from "../types/android";

const getAndroidApi = (): AndroidAPI | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.AndroidAI ?? null;
};

interface AndroidStoreState {
  api: AndroidAPI | null;
  isReady: boolean;
  refreshApi: () => void;
}

export const useAndroidStore = create<AndroidStoreState>((set) => ({
  api: getAndroidApi(),
  isReady: getAndroidApi() !== null,
  refreshApi: () => {
    const api = getAndroidApi();
    set({
      api,
      isReady: api !== null,
    });
  },
}));
