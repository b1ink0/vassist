export function createDevToolsManager({ processArgv, app }) {
  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  const enableDebugDevTools = isDev || processArgv.includes('--debug') || app.commandLine.hasSwitch('debug');

  function maybeOpenDevTools(window) {
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
