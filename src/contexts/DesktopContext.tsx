/**
 * @fileoverview Desktop Context for Electron API access
 */

import { createContext, useContext, type ReactNode } from "react";
import type { ElectronAPI } from "../types/electron";

// Get the API exposed by preload script (or null if not in Electron)
const electronAPI = typeof window !== "undefined" ? window.electron : null;

interface DesktopContextValue {
  api: ElectronAPI | null;
}

const DesktopContext = createContext<DesktopContextValue>({
  api: null,
});

interface DesktopProviderProps {
  children: ReactNode;
}

export function DesktopProvider({ children }: DesktopProviderProps) {
  const value = {
    api: electronAPI ?? null,
  };
  return (
    <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>
  );
}

/**
 * Hook to access desktop API
 * @returns {{ api: ElectronAPI | null }}
 */
export function useDesktop(): DesktopContextValue {
  return useContext(DesktopContext);
}
