/**
 * Electron Preload Script
 * Safely exposes IPC methods to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

type GenericCallback<T = unknown> = (payload: T) => void;

console.log('Preload script is executing!');

/**
 * Expose protected methods to the renderer process
 */
contextBridge.exposeInMainWorld('electron', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-always-on-top'),
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => ipcRenderer.invoke('window:set-ignore-mouse-events', ignore, options),
    frontendReady: () => ipcRenderer.invoke('window:frontend-ready'),
    setPosition: (x: number, y: number) => ipcRenderer.invoke('window:set-position', x, y),
    getPosition: () => ipcRenderer.invoke('window:get-position'),
    setSize: (width: number, height: number) => ipcRenderer.invoke('window:set-size', width, height),
    getSize: () => ipcRenderer.invoke('window:get-size'),
    updateWindowSizeForZoom: (modelWidth: number, modelHeight: number) => ipcRenderer.invoke('window:update-size-for-zoom', modelWidth, modelHeight),
    setScaleFactor: (scaleFactor: number, scaleFactorHeight?: number) => ipcRenderer.invoke('window:set-scale-factor', scaleFactor, scaleFactorHeight),
    getScaleFactor: () => ipcRenderer.invoke('window:get-scale-factor'),
  },
  
  // Input window controls
  inputWindow: {
    open: () => ipcRenderer.invoke('input-window:open'),
    close: () => ipcRenderer.invoke('input-window:close'),
    isOpen: () => ipcRenderer.invoke('input-window:is-open'),
  },
  
  // IPC communication for window-to-window state sync
  ipc: {
    send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
    on: (channel: string, callback: (...args: unknown[]) => void) => {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    },
  },
  
  // App info
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    getPlatform: () => ipcRenderer.invoke('app:platform'),
  },
  
  // Shortcuts
  shortcuts: {
    register: (shortcuts: Record<string, unknown>) => ipcRenderer.invoke('shortcuts:register', shortcuts),
    // Listen for shortcut events from main process
    onOpenChat: (callback: GenericCallback) => {
      ipcRenderer.on('shortcut:open-chat', callback);
      return () => ipcRenderer.removeListener('shortcut:open-chat', callback);
    },
    onToggleModel: (callback: GenericCallback) => {
      ipcRenderer.on('shortcut:toggle-model', callback);
      return () => ipcRenderer.removeListener('shortcut:toggle-model', callback);
    },
  },
  
  // Environment
  env: {
    isDesktop: true,
    isDev: process.env.NODE_ENV === 'development',
  },
  
  // Server API
  server: {
    start: (options: Record<string, unknown>) => ipcRenderer.invoke('server:start', options),
    stop: () => ipcRenderer.invoke('server:stop'),
    getStatus: () => ipcRenderer.invoke('server:status'),
  },
  
  // LLM Model Management
  llm: {
    listModels: (customPath?: string | null) => ipcRenderer.invoke('llm:list-models', customPath),
    downloadModel: (url: string, customPath?: string | null) => ipcRenderer.invoke('llm:download-model', url, customPath),
    pullModel: (modelName: string, customPath?: string | null) => ipcRenderer.invoke('llm:pull-model', modelName, customPath),
    searchOllamaModels: (query: string, page = 1, pageSize = 20) => ipcRenderer.invoke('llm:search-ollama-models', query, page, pageSize),
    listOllamaModelTags: (modelId: string, query = '', page = 1, pageSize = 20) => ipcRenderer.invoke('llm:list-ollama-model-tags', modelId, query, page, pageSize),
    searchHuggingFaceModels: (query: string, cursor = '', pageSize = 20) => ipcRenderer.invoke('llm:search-huggingface-models', query, cursor, pageSize),
    listHuggingFaceFiles: (repoId: string, query = '', page = 1, pageSize = 20) => ipcRenderer.invoke('llm:list-huggingface-files', repoId, query, page, pageSize),
    deleteModel: (filename: string, customPath?: string | null) => ipcRenderer.invoke('llm:delete-model', filename, customPath),
    importModel: (sourcePath: string, customPath?: string | null) => ipcRenderer.invoke('llm:import-model', sourcePath, customPath),
    chooseModelsFolder: () => ipcRenderer.invoke('llm:choose-models-folder'),
    chooseModelFile: () => ipcRenderer.invoke('llm:choose-model-file'),
    onDownloadProgress: (callback: GenericCallback) => {
      const subscription = (_event: IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on('llm:download-progress', subscription);
      return () => ipcRenderer.removeListener('llm:download-progress', subscription);
    },
    getBackendStatus: (backend: string) => ipcRenderer.invoke('llm:backend-status', backend),
    installBackend: (backend: string) => ipcRenderer.invoke('llm:backend-install', backend),
    cancelBackendInstall: () => ipcRenderer.invoke('llm:backend-cancel-install'),
    onBackendInstallProgress: (callback: GenericCallback) => {
      const subscription = (_event: IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on('llm:backend-install-progress', subscription);
      return () => ipcRenderer.removeListener('llm:backend-install-progress', subscription);
    },
  },
  
  // GPT-SoVITS Setup
  gptSovitsSetup: {
    start: (options: Record<string, unknown> = {}) => ipcRenderer.invoke('gptsovits:setup:start', options),
    cancel: () => ipcRenderer.invoke('gptsovits:setup:cancel'),
    getStatus: () => ipcRenderer.invoke('gptsovits:setup:status'),
    onLog: (callback: GenericCallback) => {
      const subscription = (_event: IpcRendererEvent, log: unknown) => callback(log);
      ipcRenderer.on('gptsovits:setup:log', subscription);
      return () => ipcRenderer.removeListener('gptsovits:setup:log', subscription);
    },
    onComplete: (callback: GenericCallback) => {
      const subscription = (_event: IpcRendererEvent, result: unknown) => callback(result);
      ipcRenderer.on('gptsovits:setup:complete', subscription);
      return () => ipcRenderer.removeListener('gptsovits:setup:complete', subscription);
    },
  },

  // Whisper STT Setup
  whisperSetup: {
    start: (options: Record<string, unknown> = {}) => ipcRenderer.invoke('whisper:setup:start', options),
    cancel: () => ipcRenderer.invoke('whisper:setup:cancel'),
    getStatus: () => ipcRenderer.invoke('whisper:setup:status'),
    onLog: (callback: GenericCallback) => {
      const subscription = (_event: IpcRendererEvent, log: unknown) => callback(log);
      ipcRenderer.on('whisper:setup:log', subscription);
      return () => ipcRenderer.removeListener('whisper:setup:log', subscription);
    },
    onComplete: (callback: GenericCallback) => {
      const subscription = (_event: IpcRendererEvent, result: unknown) => callback(result);
      ipcRenderer.on('whisper:setup:complete', subscription);
      return () => ipcRenderer.removeListener('whisper:setup:complete', subscription);
    },
  },
});

console.log('Preload script completed, window.electron exposed!');
