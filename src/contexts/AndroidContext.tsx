/**
 * @fileoverview Android store compatibility layer.
 */

import { useEffect, type ReactNode } from "react";
import type { AndroidAPI } from "../types/android";
import { useShallow } from "zustand/react/shallow";
import { useAndroidStore } from "../stores/useAndroidStore";

interface AndroidContextValue {
  api: AndroidAPI | null;
  isReady: boolean;
}

interface AndroidProviderProps {
  children: ReactNode;
}

export function AndroidProvider({ children }: AndroidProviderProps) {
  const refreshApi = useAndroidStore((state) => state.refreshApi);

  useEffect(() => {
    refreshApi();
  }, [refreshApi]);

  return <>{children}</>;
}

export function useAndroid(): AndroidContextValue {
  return useAndroidStore(
    useShallow((state) => ({
      api: state.api,
      isReady: state.isReady,
    })),
  );
}
