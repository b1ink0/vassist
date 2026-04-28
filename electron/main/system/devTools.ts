import type { App, BrowserWindow } from 'electron';

type DevToolsManagerDeps = {
  processArgv: string[];
  app: App;
};

export function createDevToolsManager({ processArgv, app }: DevToolsManagerDeps) {
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  const enableDebugDevTools = isDev || processArgv.includes('--debug') || app.commandLine.hasSwitch('debug');

  function maybeOpenDevTools(window: BrowserWindow | null | undefined) {
    if (!enableDebugDevTools || !window || window.isDestroyed()) {
      return;
    }
    window.webContents.openDevTools({ mode: 'detach' });
  }

  return {
    enableDebugDevTools,
    maybeOpenDevTools,
  };
}
