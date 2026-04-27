export function createWindowManager({
  BrowserWindow,
  screen,
  path,
  app,
  __dirname,
  devServerUrl,
  state,
  maybeOpenDevTools,
}) {
  function createInputWindow() {
    if (state.inputWindow) return;

    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const inputWidth = 600;
    const inputHeight = 400;

    state.inputWindow = new BrowserWindow({
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
        preload: path.join(__dirname, 'preload.mjs'),
      },
    });

    if (devServerUrl) {
      state.inputWindow.loadURL(devServerUrl + '/electron/index.html?window=input');
    } else {
      state.inputWindow.loadURL('app://./electron/index.html?window=input');
    }
    maybeOpenDevTools(state.inputWindow);

    state.inputWindow.once('ready-to-show', () => {
      state.inputWindow.show();
      state.inputWindow.setOpacity(0);
      state.inputWindow.setIgnoreMouseEvents(true);
    });

    state.inputWindow.on('closed', () => {
      state.inputWindow = null;
    });
  }

  async function createMainWindow() {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

    const initialWidth = 400;
    const initialHeight = 525;

    state.mainWindow = new BrowserWindow({
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
        preload: path.join(__dirname, 'preload.mjs'),
      },
    });

    if (devServerUrl) {
      state.mainWindow.loadURL(devServerUrl + '/electron/index.html');
    } else {
      state.mainWindow.loadURL('app://./electron/index.html');
    }
    maybeOpenDevTools(state.mainWindow);

    state.mainWindow.once('ready-to-show', () => {
      state.mainWindow.show();
      state.mainWindow.setIgnoreMouseEvents(true);
      createInputWindow();
    });

    state.mainWindow.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        state.mainWindow.hide();
      }
    });

    state.mainWindow.on('closed', () => {
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
