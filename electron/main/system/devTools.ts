import type { App, BrowserWindow } from "electron";

type DevToolsManagerDeps = {
  processArgv: string[];
  app: App;
  BrowserWindow: typeof import("electron").BrowserWindow;
};

export function createDevToolsManager({
  processArgv,
  app,
  BrowserWindow,
}: DevToolsManagerDeps) {
  const isDevServer = Boolean(process.env.VITE_DEV_SERVER_URL);
  const startupDevToolsFlags = [
    "debug",
    "devtools",
    "open-devtools",
    "inspect",
    "inspect-brk",
  ];
  const hasStartupFlag = startupDevToolsFlags.some((flag) => {
    const prefix = `--${flag}`;
    const hasArgvFlag = processArgv.some(
      (arg) => arg === prefix || arg.startsWith(`${prefix}=`),
    );
    return hasArgvFlag || app.commandLine.hasSwitch(flag);
  });
  const enableDebugDevTools = isDevServer || hasStartupFlag;
  let nativeDevToolsEnabled = false;

  const shouldOpenDevTools = () => enableDebugDevTools || nativeDevToolsEnabled;

  function applyDevToolsToWindow(window: BrowserWindow | null | undefined) {
    if (!window || window.isDestroyed()) {
      return;
    }

    if (shouldOpenDevTools()) {
      if (!window.webContents.isDevToolsOpened()) {
        window.webContents.openDevTools({ mode: "detach" });
      }
      return;
    }

    if (window.webContents.isDevToolsOpened()) {
      window.webContents.closeDevTools();
    }
  }

  function applyDevToolsToAllWindows() {
    for (const window of BrowserWindow.getAllWindows()) {
      applyDevToolsToWindow(window);
    }
  }

  function maybeOpenDevTools(window: BrowserWindow | null | undefined) {
    applyDevToolsToWindow(window);
  }

  function setNativeDevToolsEnabled(enabled: boolean) {
    nativeDevToolsEnabled = Boolean(enabled);
    applyDevToolsToAllWindows();
    return nativeDevToolsEnabled;
  }

  function getNativeDevToolsEnabled() {
    return nativeDevToolsEnabled;
  }

  return {
    enableDebugDevTools,
    maybeOpenDevTools,
    setNativeDevToolsEnabled,
    getNativeDevToolsEnabled,
    applyDevToolsToAllWindows,
  };
}
