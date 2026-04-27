/**
 * @fileoverview Desktop Context for Electron API access
 */

import { createContext, useContext } from 'react';

// Get the API exposed by preload script (or null if not in Electron)
const electronAPI = typeof window !== 'undefined' ? window.electron : null;

const DesktopContext = createContext({
  api: null,
});

export function DesktopProvider({ children }) {
  const value = {
    api: electronAPI,
  };
  return (
    <DesktopContext.Provider value={value}>
      {children}
    </DesktopContext.Provider>
  );
}

/**
 * Hook to access desktop API
 * @returns {{ api: ElectronAPI | null }}
 */
export function useDesktop() {
  return useContext(DesktopContext);
}
