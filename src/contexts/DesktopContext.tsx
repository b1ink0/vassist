/**
 * @fileoverview Desktop store compatibility layer.
 */

import { useEffect, type ReactNode } from "react";
import type { ElectronAPI } from "../types/electron";
import { useShallow } from "zustand/react/shallow";
import { useDesktopStore } from "../stores/useDesktopStore";

interface DesktopContextValue {
  api: ElectronAPI | null;
}

interface DesktopProviderProps {
  children: ReactNode;
}

export function DesktopProvider({ children }: DesktopProviderProps) {
  const refreshApi = useDesktopStore((state) => state.refreshApi);

  useEffect(() => {
    refreshApi();
  }, [refreshApi]);

  return <>{children}</>;
}

export function useDesktop(): DesktopContextValue {
  return useDesktopStore(
    useShallow((state) => ({
      api: state.api,
    })),
  );
}
