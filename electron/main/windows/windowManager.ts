import type {
  App,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  BrowserWindow as BrowserWindowInstance,
  Event,
} from "electron";
import type * as pathType from "path";

type WindowState = {
  mainWindow: BrowserWindowInstance | null;
  inputWindow: BrowserWindowInstance | null;
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
}: WindowManagerDeps) {
  function createInputWindow() {
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
    maybeOpenDevTools(inputWindow);

    inputWindow.once("ready-to-show", () => {
      inputWindow.show();
      inputWindow.setOpacity(0);
      inputWindow.setIgnoreMouseEvents(true);
    });

    inputWindow.on("closed", () => {
      state.inputWindow = null;
    });
  }

  async function createMainWindow() {
    const { width: screenWidth, height: screenHeight } =
      screen.getPrimaryDisplay().workAreaSize;

    const initialWidth = 400;
    const initialHeight = 525;

    const mainWindowOptions: BrowserWindowConstructorOptions = {
      width: initialWidth,
      height: initialHeight,
      x: Math.floor((screenWidth - initialWidth) / 2),
      y: Math.floor((screenHeight - initialHeight) / 2),
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

    state.mainWindow = new BrowserWindow(mainWindowOptions);
    const mainWindow = state.mainWindow;

    if (devServerUrl) {
      mainWindow.loadURL(devServerUrl + "/electron/index.html");
    } else {
      mainWindow.loadURL("app://./electron/index.html");
    }
    maybeOpenDevTools(mainWindow);

    mainWindow.once("ready-to-show", () => {
      mainWindow.show();
      mainWindow.setIgnoreMouseEvents(false);
      createInputWindow();
    });

    mainWindow.on("close", (event: Event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });

    mainWindow.on("closed", () => {
      state.mainWindow = null;
    });
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
    showMainWindowFromActivate,
  };
}
