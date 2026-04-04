/**
 * @fileoverview Type definitions for Electron API exposed via preload script 
 */

export interface ElectronWindow {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  toggleAlwaysOnTop: () => Promise<boolean>;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => Promise<void>;
  frontendReady: () => Promise<void>;
  setPosition: (x: number, y: number) => Promise<void>;
  getPosition: () => Promise<{ x: number; y: number }>;
  setSize: (width: number, height: number) => Promise<void>;
  getSize: () => Promise<{ width: number; height: number }>;
}

export interface ElectronInputWindow {
  open: () => Promise<void>;
  close: () => Promise<void>;
  isOpen: () => Promise<boolean>;
}

export interface ElectronShortcuts {
  register: (shortcuts: any) => Promise<void>;
  onOpenChat: (callback: () => void) => () => void;
  onToggleModel: (callback: () => void) => () => void;
}

export interface ElectronApp {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<{
    platform: string;
    arch: string;
    version: Record<string, string>;
  }>;
}

export interface ElectronIPC {
  send: (channel: string, data?: any) => void;
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
}

export interface ElectronAPI {
  window: ElectronWindow;
  inputWindow: ElectronInputWindow;
  shortcuts: ElectronShortcuts;
  app: ElectronApp;
  ipc: ElectronIPC;
  env: {
    isDesktop: boolean;
    isDev: boolean;
  };
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
