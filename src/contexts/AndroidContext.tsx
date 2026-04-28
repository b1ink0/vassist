/**
 * @fileoverview Android Context for AndroidAI JavaScript interface access
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { AndroidAPI } from '../types/android';

interface AndroidContextValue {
  api: AndroidAPI | null;
  isReady: boolean;
}

interface AndroidProviderProps {
  children: ReactNode;
}

// Get the AndroidAI interface exposed by WebView (available immediately when page loads)
const getAndroidAPI = (): AndroidAPI | null => {
  if (typeof window === 'undefined') return null;
  return window.AndroidAI || null;
};

const AndroidContext = createContext<AndroidContextValue>({
  api: null,
  isReady: false,
});

export function AndroidProvider({ children }: AndroidProviderProps) {
  // AndroidAI is registered before page loads, so it's available immediately
  const api = getAndroidAPI();
  const isReady = api !== null;

  const value = {
    api,
    isReady,
  };

  return (
    <AndroidContext.Provider value={value}>
      {children}
    </AndroidContext.Provider>
  );
}

/**
 * Hook to access Android API
 * @returns {{ api: AndroidAI | null, isReady: boolean }}
 */
export function useAndroid() {
  return useContext(AndroidContext);
}
