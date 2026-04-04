/**
 * @fileoverview Android Context for AndroidAI JavaScript interface access
 */

import { createContext, useContext } from 'react';

// Get the AndroidAI interface exposed by WebView (available immediately when page loads)
const getAndroidAPI = () => {
  if (typeof window === 'undefined') return null;
  return window.AndroidAI || null;
};

const AndroidContext = createContext({
  api: null,
  isReady: false,
});

export function AndroidProvider({ children }) {
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
