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
});

console.log('Preload script completed, window.electron exposed!');
