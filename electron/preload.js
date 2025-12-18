/**
 * Electron Preload Script
 * Safely exposes IPC methods to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';

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
    setIgnoreMouseEvents: (ignore, options) => ipcRenderer.invoke('window:set-ignore-mouse-events', ignore, options),
    setPosition: (x, y) => ipcRenderer.invoke('window:set-position', x, y),
    getPosition: () => ipcRenderer.invoke('window:get-position'),
    setSize: (width, height) => ipcRenderer.invoke('window:set-size', width, height),
    getSize: () => ipcRenderer.invoke('window:get-size'),
  },
  
  // Input window controls
  inputWindow: {
    open: () => ipcRenderer.invoke('input-window:open'),
    close: () => ipcRenderer.invoke('input-window:close'),
    isOpen: () => ipcRenderer.invoke('input-window:is-open'),
  },
  
  // IPC communication for window-to-window state sync
  ipc: {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, callback) => {
      const subscription = (event, ...args) => callback(...args);
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
    register: (shortcuts) => ipcRenderer.invoke('shortcuts:register', shortcuts),
    // Listen for shortcut events from main process
    onOpenChat: (callback) => {
      ipcRenderer.on('shortcut:open-chat', callback);
      return () => ipcRenderer.removeListener('shortcut:open-chat', callback);
    },
    onToggleModel: (callback) => {
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
    start: (options) => ipcRenderer.invoke('server:start', options),
    stop: () => ipcRenderer.invoke('server:stop'),
    getStatus: () => ipcRenderer.invoke('server:status'),
  },
  
  // LLM Model Management
  llm: {
    listModels: (customPath) => ipcRenderer.invoke('llm:list-models', customPath),
    downloadModel: (url, customPath) => ipcRenderer.invoke('llm:download-model', url, customPath),
    pullModel: (modelName, customPath) => ipcRenderer.invoke('llm:pull-model', modelName, customPath),
    deleteModel: (filename, customPath) => ipcRenderer.invoke('llm:delete-model', filename, customPath),
    importModel: (sourcePath, customPath) => ipcRenderer.invoke('llm:import-model', sourcePath, customPath),
    chooseModelsFolder: () => ipcRenderer.invoke('llm:choose-models-folder'),
    chooseModelFile: () => ipcRenderer.invoke('llm:choose-model-file'),
    onDownloadProgress: (callback) => {
      const subscription = (event, progress) => callback(progress);
      ipcRenderer.on('llm:download-progress', subscription);
      return () => ipcRenderer.removeListener('llm:download-progress', subscription);
    },
  },
});

console.log('Preload script completed, window.electron exposed!');
