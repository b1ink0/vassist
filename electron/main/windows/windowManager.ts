import type {
  App,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  BrowserWindow as BrowserWindowInstance,
  Event,
} from "electron";
import type * as pathType from "path";
import type {
  DesktopMode,
  DesktopModeRequest,
  DesktopControlPlacement,
  LiveWallpaperInteraction,
} from "./desktopMode";

type WindowState = {
  mainWindow: BrowserWindowInstance | null;
  avatarWindow: BrowserWindowInstance | null;
  inputWindow: BrowserWindowInstance | null;
  inputWindowOpen: boolean;
  uiThemeMode: string | null;
  desktopMode: DesktopMode;
  liveWallpaperInteraction: LiveWallpaperInteraction;
  controlPlacement: DesktopControlPlacement;
};

type WindowManagerDeps = {
  BrowserWindow: typeof import("electron").BrowserWindow;
  screen: typeof import("electron").screen;
  path: typeof pathType;
  app: App & { isQuitting?: boolean };
  __dirname: string;
  devServerUrl: string | undefined;
  state: WindowState;
  maybeOpenDevTools: (window: BrowserWindowInstance | null | undefined) => void;
  liveWallpaper: {
    attach: (
      window: BrowserWindowInstance,
      bounds: { x: number; y: number; width: number; height: number },
      interaction: LiveWallpaperInteraction,
    ) => Promise<void>;
    stop: () => void;
  };
};

export function createWindowManager({
  BrowserWindow,
  screen,
  path,
  app,
  __dirname,
  devServerUrl,
  state,
  maybeOpenDevTools,
  liveWallpaper,
}: WindowManagerDeps) {
  function createInputWindow() {
    const shouldUseInputWindow =
      state.desktopMode === "floating-app" ||
      (state.desktopMode === "live-wallpaper" &&
        state.controlPlacement === "detached");
    if (!shouldUseInputWindow) return;
    if (state.inputWindow) return;

    const { width: screenWidth, height: screenHeight } =
      screen.getPrimaryDisplay().workAreaSize;
    const inputWidth = 600;
    const inputHeight = 400;

    const inputWindowOptions: BrowserWindowConstructorOptions = {
      width: inputWidth,
      height: inputHeight,
      x: Math.floor((screenWidth - inputWidth) / 2),
      y: screenHeight - inputHeight - 50,
      transparent: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: path.join(__dirname, "preload.cjs"),
      },
    };

    state.inputWindow = new BrowserWindow(inputWindowOptions);
    const inputWindow = state.inputWindow;

    if (devServerUrl) {
      inputWindow.loadURL(devServerUrl + "/electron/index.html?window=input");
    } else {
      inputWindow.loadURL("app://./electron/index.html?window=input");
    }
    inputWindow.webContents.on("did-finish-load", () => {
      if (state.uiThemeMode) {
        console.log(
          `[Main] Sending initial desktop theme to input window: ${state.uiThemeMode}`,
        );
        inputWindow.webContents.send("state:uiThemeMode", state.uiThemeMode);
      }
    });
    maybeOpenDevTools(inputWindow);

    inputWindow.once("ready-to-show", () => {
      if (state.inputWindowOpen) {
        inputWindow.setOpacity(1);
        inputWindow.show();
        inputWindow.setIgnoreMouseEvents(false);
        return;
      }

      inputWindow.setIgnoreMouseEvents(true);
      inputWindow.setOpacity(0);
      inputWindow.hide();
    });

    inputWindow.on("closed", () => {
      state.inputWindow = null;
      state.inputWindowOpen = false;
    });
  }

  async function createMainWindow(
    mode: DesktopMode = state.desktopMode,
    liveWallpaperInteraction: LiveWallpaperInteraction = state.liveWallpaperInteraction,
    controlPlacement: DesktopControlPlacement = state.controlPlacement,
  ) {
    state.desktopMode = mode;
    state.liveWallpaperInteraction = liveWallpaperInteraction;
    state.controlPlacement = controlPlacement;
    const { width: screenWidth, height: screenHeight } =
      screen.getPrimaryDisplay().workAreaSize;
    const workArea = screen.getPrimaryDisplay().workArea;

    const isAppMode = mode === "app";
    const isLiveWallpaper = mode === "live-wallpaper";
    const isDetached = controlPlacement === "detached" && !isAppMode;
    const isDetachedChatWindow = isDetached;
    const displayBounds = screen.getPrimaryDisplay().bounds;
    const physicalDisplayBounds = isLiveWallpaper
      ? screen.dipToScreenRect(null, displayBounds)
      : null;
    const initialWidth =
      isLiveWallpaper && !isDetached
        ? displayBounds.width
        : isAppMode
          ? 1200
          : 400;
    const initialHeight =
      isLiveWallpaper && !isDetached
        ? displayBounds.height
        : isAppMode
          ? 760
          : 525;
    const detachedChatX = Math.max(
      workArea.x + 24,
      workArea.x + workArea.width - initialWidth - 24,
    );
    const detachedChatY =
      workArea.y +
      Math.max(24, Math.floor((workArea.height - initialHeight) / 2));

    const mainWindowOptions: BrowserWindowConstructorOptions = {
      width: initialWidth,
      height: initialHeight,
      x:
        isLiveWallpaper && !isDetached
          ? displayBounds.x
          : isDetached
            ? detachedChatX
            : Math.floor((screenWidth - initialWidth) / 2),
      y:
        isLiveWallpaper && !isDetached
          ? displayBounds.y
          : isDetached
            ? detachedChatY
            : Math.floor((screenHeight - initialHeight) / 2),
      transparent: !isAppMode,
      ...(isAppMode ? { backgroundColor: "#252a2f" } : {}),
      frame: false,
      resizable: isAppMode || isDetached,
      ...(isAppMode ? { minWidth: 900, minHeight: 600 } : {}),
      ...(isDetached ? { minWidth: 420, minHeight: 420 } : {}),
      alwaysOnTop: isDetached || (!isAppMode && !isLiveWallpaper),
      skipTaskbar: !isAppMode,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: path.join(__dirname, "preload.cjs"),
        backgroundThrottling: isLiveWallpaper ? false : true,
      },
    };

    state.mainWindow = new BrowserWindow(mainWindowOptions);
    const mainWindow = state.mainWindow;

    if (devServerUrl) {
      mainWindow.loadURL(
        devServerUrl +
          `/electron/index.html?desktop-mode=${encodeURIComponent(mode)}&wallpaper-interaction=${encodeURIComponent(liveWallpaperInteraction)}&desktop-controls=${encodeURIComponent(controlPlacement)}&desktop-role=${encodeURIComponent(isDetachedChatWindow ? "chat" : "main")}`,
      );
    } else {
      mainWindow.loadURL(
        `app://./electron/index.html?desktop-mode=${encodeURIComponent(mode)}&wallpaper-interaction=${encodeURIComponent(liveWallpaperInteraction)}&desktop-controls=${encodeURIComponent(controlPlacement)}&desktop-role=${encodeURIComponent(isDetachedChatWindow ? "chat" : "main")}`,
      );
    }
    maybeOpenDevTools(mainWindow);

    mainWindow.once("ready-to-show", () => {
      if (isLiveWallpaper && !isDetached) {
        void liveWallpaper
          .attach(
            mainWindow,
            physicalDisplayBounds ?? displayBounds,
            liveWallpaperInteraction,
          )
          .then(() => {
            if (mainWindow.isDestroyed()) return;
            mainWindow.setIgnoreMouseEvents(
              liveWallpaperInteraction === "non-interactive",
              { forward: liveWallpaperInteraction === "non-interactive" },
            );
            mainWindow.showInactive();
          })
          .catch((error) => {
            console.error(
              "[Main] Failed to attach live wallpaper window:",
              error,
            );
            if (!mainWindow.isDestroyed()) {
              // Do not leave the application invisible when the native shell
              // host is unavailable. The user can still inspect the error and
              // switch back to a supported presentation mode.
              mainWindow.show();
              mainWindow.setIgnoreMouseEvents(false);
            }
          });
        return;
      }

      mainWindow.show();
      mainWindow.setIgnoreMouseEvents(false);
      if (isDetached) {
        createInputWindow();
        createAvatarWindow(mode, liveWallpaperInteraction, controlPlacement);
      } else if (mode === "floating-app") {
        createInputWindow();
      }
    });

    const sendNormalBounds = () => {
      if (mode !== "app" || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send("desktop:app-window-bounds", {
        ...mainWindow.getBounds(),
      });
    };
    mainWindow.on("resize", sendNormalBounds);
    mainWindow.on("move", sendNormalBounds);

    mainWindow.on("close", (event: Event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });

    mainWindow.on("closed", () => {
      if (state.mainWindow === mainWindow) {
        state.mainWindow = null;
      }
    });
  }

  function createAvatarWindow(
    mode: DesktopMode,
    liveWallpaperInteraction: LiveWallpaperInteraction,
    controlPlacement: DesktopControlPlacement,
  ) {
    if (state.avatarWindow || controlPlacement !== "detached") return;

    const isLiveWallpaper = mode === "live-wallpaper";
    const displayBounds = screen.getPrimaryDisplay().bounds;
    const physicalDisplayBounds = isLiveWallpaper
      ? screen.dipToScreenRect(null, displayBounds)
      : null;
    const avatarWidth = isLiveWallpaper ? displayBounds.width : 400;
    const avatarHeight = isLiveWallpaper ? displayBounds.height : 525;

    const avatarWindow = new BrowserWindow({
      width: avatarWidth,
      height: avatarHeight,
      x: isLiveWallpaper
        ? displayBounds.x
        : Math.floor(
            (screen.getPrimaryDisplay().workAreaSize.width - avatarWidth) / 2,
          ),
      y: isLiveWallpaper
        ? displayBounds.y
        : Math.floor(
            (screen.getPrimaryDisplay().workAreaSize.height - avatarHeight) / 2,
          ),
      transparent: true,
      frame: false,
      resizable: false,
      alwaysOnTop: !isLiveWallpaper,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: path.join(__dirname, "preload.cjs"),
        backgroundThrottling: isLiveWallpaper ? false : true,
      },
    });
    state.avatarWindow = avatarWindow;

    const roleQuery =
      `desktop-mode=${encodeURIComponent(mode)}` +
      `&wallpaper-interaction=${encodeURIComponent(liveWallpaperInteraction)}` +
      `&desktop-controls=${encodeURIComponent(controlPlacement)}` +
      `&desktop-role=avatar`;
    if (devServerUrl) {
      avatarWindow.loadURL(`${devServerUrl}/electron/index.html?${roleQuery}`);
    } else {
      avatarWindow.loadURL(`app://./electron/index.html?${roleQuery}`);
    }
    maybeOpenDevTools(avatarWindow);

    avatarWindow.once("ready-to-show", () => {
      if (isLiveWallpaper) {
        void liveWallpaper
          .attach(
            avatarWindow,
            physicalDisplayBounds ?? displayBounds,
            liveWallpaperInteraction,
          )
          .then(() => {
            if (avatarWindow.isDestroyed()) return;
            avatarWindow.setIgnoreMouseEvents(
              liveWallpaperInteraction === "non-interactive",
              { forward: liveWallpaperInteraction === "non-interactive" },
            );
            avatarWindow.showInactive();
          })
          .catch((error) => {
            console.error(
              "[Main] Failed to attach detached avatar wallpaper window:",
              error,
            );
            if (!avatarWindow.isDestroyed()) avatarWindow.show();
          });
        return;
      }

      avatarWindow.show();
      avatarWindow.setIgnoreMouseEvents(false);
    });

    avatarWindow.on("closed", () => {
      if (state.avatarWindow === avatarWindow) state.avatarWindow = null;
    });
  }

  function switchDesktopMode(request: DesktopModeRequest | DesktopMode) {
    const next = typeof request === "string" ? { mode: request } : request;
    const mode = next.mode;
    const liveWallpaperInteraction =
      next.liveWallpaperInteraction ?? state.liveWallpaperInteraction;
    const controlPlacement = next.controlPlacement ?? state.controlPlacement;

    if (
      mode === state.desktopMode &&
      liveWallpaperInteraction === state.liveWallpaperInteraction &&
      controlPlacement === state.controlPlacement &&
      state.mainWindow
    ) {
      state.mainWindow.show();
      if (mode !== "live-wallpaper") state.mainWindow.focus();
      return;
    }

    const previousWindow = state.mainWindow;
    state.desktopMode = mode;
    state.liveWallpaperInteraction = liveWallpaperInteraction;
    state.controlPlacement = controlPlacement;

    if (state.inputWindow && !state.inputWindow.isDestroyed()) {
      state.inputWindow.destroy();
    }
    liveWallpaper.stop();
    if (state.avatarWindow && !state.avatarWindow.isDestroyed()) {
      state.avatarWindow.destroy();
    }
    state.inputWindow = null;
    state.inputWindowOpen = false;

    if (previousWindow && !previousWindow.isDestroyed()) {
      state.mainWindow = null;
      previousWindow.destroy();
    }

    void createMainWindow(mode, liveWallpaperInteraction, controlPlacement);
  }

  function requestDesktopMode(request: DesktopModeRequest | DesktopMode) {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

    state.mainWindow.webContents.send("desktop:mode-request", request);
  }

  function showMainWindowFromActivate() {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (state.mainWindow) {
      state.mainWindow.show();
    }
  }

  return {
    createInputWindow,
    createMainWindow,
    switchDesktopMode,
    requestDesktopMode,
    showMainWindowFromActivate,
  };
}
