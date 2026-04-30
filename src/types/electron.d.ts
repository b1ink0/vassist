/**
 * @fileoverview Type definitions for Electron API exposed via preload script 
 */

import type { AndroidAPI } from './android';

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
  updateWindowSizeForZoom?: (width: number, height: number) => Promise<void>;
}

export interface ElectronServerAPI {
  start: (config?: Record<string, unknown>) => Promise<{ success?: boolean; error?: string } | unknown>;
  stop: () => Promise<void>;
  getStatus?: () => Promise<unknown>;
}

export interface ElectronLLMAPI {
  getBackendStatus?: (backend: string) => Promise<{ success?: boolean; selectedInstalled?: boolean } | unknown>;
  [method: string]: ((...args: unknown[]) => Promise<unknown>) | undefined;
}

export interface ElectronSetupAPI {
  [method: string]: ((...args: unknown[]) => unknown) | undefined;
}

export interface ElectronInputWindow {
  open: () => Promise<void>;
  close: () => Promise<void>;
  isOpen: () => Promise<boolean>;
}

export interface ElectronShortcuts {
  register: (shortcuts: Record<string, string | boolean | null | undefined>) => Promise<void>;
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
  send: (channel: string, data?: unknown) => void;
  on: <TArgs extends unknown[]>(channel: string, callback: (...args: TArgs) => void) => () => void;
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
  server?: ElectronServerAPI;
  llm?: ElectronLLMAPI;
  whisperSetup?: ElectronSetupAPI;
  gptSovitsSetup?: ElectronSetupAPI;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
    AndroidAI?: AndroidAPI;
  }
}

export {};
