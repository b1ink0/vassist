/**
 * Electron Main Process Orchestrator
 * Delegates responsibilities to focused modules under electron/main/
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Tray,
  Menu,
  globalShortcut,
  protocol,
  session,
  desktopCapturer,
  nativeImage,
} from "electron";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";

import { LocalAIServer } from "./server/http-server";
import {
  createGetModelsDir,
  registerLLMHandlers,
} from "./main/ipc/llmHandlers";
import { createRuntimePaths } from "./main/runtime/runtimePaths";
import { createDevToolsManager } from "./main/system/devTools";
import { createWindowManager } from "./main/windows/windowManager";
import { createTrayShortcutsManager } from "./main/windows/trayShortcutsManager";
import {
  registerPrivilegedSchemes,
  setupDesktopPermissions,
  setupAppProtocolHandler,
} from "./main/system/permissionsProtocol";
import { registerUIIPCHandlers } from "./main/ipc/uiHandlers";
import { createLocalServerManager } from "./main/services/localServerManager";
import { createPythonServerManager } from "./main/services/pythonServerManager";
import { createLLMBackendManager } from "./main/services/llmBackendManager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const isElectronTestMode =
  process.env.VITE_VASSIST_TEST_MODE === "1" ||
  process.env.VITE_VASSIST_TEST_MODE === "true";
const serverBasePath = devServerUrl
  ? path.join(process.cwd(), "electron", "server")
  : path.join(__dirname, "server");

const state = {
  mainWindow: null,
  inputWindow: null,
  inputWindowOpen: false,
  tray: null,
};

const getModelsDir = createGetModelsDir({ app, fs, path, baseDir: __dirname });

const runtimePaths = createRuntimePaths({
  app,
  path,
  fs,
  serverBasePath,
  isDevServer: Boolean(devServerUrl),
});

const devToolsManager = createDevToolsManager({
  processArgv: process.argv,
  app,
  BrowserWindow,
});

const windowManager = createWindowManager({
  BrowserWindow,
  screen,
  path,
  app,
  __dirname,
  devServerUrl,
  state,
  maybeOpenDevTools: devToolsManager.maybeOpenDevTools,
});

const trayShortcutsManager = createTrayShortcutsManager({
  app,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  fs,
  path,
  process,
  __dirname,
  state,
});

const llmBackendManager = createLLMBackendManager({
  app,
  fs,
  path,
});

const pythonServerManager = createPythonServerManager({
  fs,
  path,
  spawn,
  processEnv: process.env,
  ensureRuntimeServerScripts: runtimePaths.ensureRuntimeServerScripts,
  getRuntimeServerBasePath: runtimePaths.getRuntimeServerBasePath,
  getGPTSoVITSDataDir: runtimePaths.getGPTSoVITSDataDir,
});

const localServerManager = createLocalServerManager({
  LocalAIServer,
  path,
  fs,
  baseDir: __dirname,
  getModelsDir,
  loadLlamaApi: llmBackendManager.loadRuntimeLlamaApi,
  ensureTTSBackendRunning: pythonServerManager.startGPTSoVITSServer,
  restartTTSBackend: pythonServerManager.restartGPTSoVITSServer,
  onTTSRequestStart: pythonServerManager.markGPTSoVITSTTSRequestStart,
  onTTSRequestComplete: pythonServerManager.markGPTSoVITSTTSRequestComplete,
  stopTTSBackend: pythonServerManager.stopGPTSoVITSServer,
  setTTSBackend: pythonServerManager.setGPTSoVITSTorchBackend,
});

app.commandLine.appendSwitch("force_high_performance_gpu");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("disable-gpu-driver-bug-workarounds");
app.commandLine.appendSwitch("disable-features", "OutOfBlinkCors");
app.commandLine.appendSwitch("ignore-connections-limit", "localhost,127.0.0.1");

registerPrivilegedSchemes(protocol);

registerUIIPCHandlers({
  ipcMain,
  BrowserWindow,
  screen,
  app,
  process,
  state,
  registerGlobalShortcuts: trayShortcutsManager.registerGlobalShortcuts,
  setNativeDevToolsEnabled: devToolsManager.setNativeDevToolsEnabled,
  getNativeDevToolsEnabled: devToolsManager.getNativeDevToolsEnabled,
});

localServerManager.registerIPCHandlers(ipcMain);
pythonServerManager.registerSetupIPCHandlers(ipcMain, localServerManager);
registerLLMHandlers({
  ipcMain,
  fs,
  path,
  require,
  getModelsDir,
  llmBackendManager,
});

app.whenReady().then(() => {
  setupDesktopPermissions({
    session,
    desktopCapturer,
    BrowserWindow,
    ipcMain,
    path,
    __dirname,
    devServerUrl,
    maybeOpenDevTools: devToolsManager.maybeOpenDevTools,
  });

  setupAppProtocolHandler({ protocol, fs, path, __dirname });

  if (!isElectronTestMode) {
    trayShortcutsManager.createTray();
  }
  windowManager.createMainWindow();

  if (!isElectronTestMode) {
    pythonServerManager.startWhisperServer();
  }

  app.on("activate", () => {
    windowManager.showMainWindowFromActivate();
  });
});

app.on("window-all-closed", () => {
  // Keep app alive for tray-driven workflow.
});

app.on("before-quit", () => {
  pythonServerManager.cleanupBeforeQuit(localServerManager);
});
