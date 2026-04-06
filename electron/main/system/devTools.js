export function createDevToolsManager({ processArgv, app }) {
  const enableDebugDevTools = processArgv.includes('--debug') || app.commandLine.hasSwitch('debug');

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
