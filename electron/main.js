/**
 * Electron Main Process
 * Creates a transparent window for the desktop app
 */

import { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let tray = null;

/**
 * Force dedicated GPU usage for better 3D rendering performance
 */
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-gpu-driver-bug-workarounds');

/**
 * Create the main application window with transparency
 */
function createWindow() {
  // Get primary display dimensions
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true, // Hide from taskbar
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.mjs'),
    },
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    // Development mode - load from dev server with electron HTML
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL + '/electron/index.html');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production mode
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }

  // Enable click-through by default (before React loads)
  // This allows clicking through transparent areas to desktop
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window close - hide instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Convert browser-style key combo to Electron accelerator
 * Browser format: "Ctrl+Alt+C"
 * Electron format: "CommandOrControl+Alt+C"
 */
function convertToElectronAccelerator(browserCombo) {
  if (!browserCombo) return null;
  
  // Replace Ctrl with CommandOrControl for cross-platform
  let accelerator = browserCombo.replace(/Ctrl/g, 'CommandOrControl');
  
  return accelerator;
}

/**
 * Register global shortcuts from UI config
 */
function registerGlobalShortcuts(shortcuts) {
  // Unregister all existing shortcuts first
  globalShortcut.unregisterAll();
  
  if (!shortcuts || !shortcuts.enabled) {
    return;
  }
  
  // Register Open Chat shortcut
  if (shortcuts.openChat) {
    const accelerator = convertToElectronAccelerator(shortcuts.openChat);
    if (accelerator) {
      try {
        const registered = globalShortcut.register(accelerator, () => {
          if (mainWindow) {
            mainWindow.webContents.send('shortcut:open-chat');
          }
        });
        
        if (registered) {
          console.log('Registered shortcut for Open Chat:', accelerator);
        } else {
          console.warn('Failed to register shortcut for Open Chat:', accelerator);
        }
      } catch (error) {
        console.error('Error registering Open Chat shortcut:', error);
      }
    }
  }
  
  // Register Toggle Model shortcut
  if (shortcuts.toggleMode) {
    const accelerator = convertToElectronAccelerator(shortcuts.toggleMode);
    if (accelerator) {
      try {
        const registered = globalShortcut.register(accelerator, () => {
          if (mainWindow) {
            mainWindow.webContents.send('shortcut:toggle-model');
          }
        });
        
        if (registered) {
          console.log('Registered shortcut for Toggle Model:', accelerator);
        } else {
          console.warn('Failed to register shortcut for Toggle Model:', accelerator);
        }
      } catch (error) {
        console.error('Error registering Toggle Model shortcut:', error);
      }
    }
  }
}

/**
 * Create system tray icon
 */
function createTray() {
  // Use the extension icon for tray
  const iconPath = path.join(__dirname, '..', 'extension', 'icons', 'icon-32.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show VAssist',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    {
      label: 'Hide VAssist',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('VAssist');

  // Double click to show/hide
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });
}

/**
 * App lifecycle handlers
 */
app.whenReady().then(() => {
  createTray();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on window close, keep tray icon
  // Only quit when user selects Quit from tray menu
});

/**
 * IPC Handlers
 */

// Window controls
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:toggle-always-on-top', () => {
  if (mainWindow) {
    const isOnTop = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isOnTop);
    return !isOnTop;
  }
  return false;
});

// Set click-through for transparent areas
ipcMain.handle('window:set-ignore-mouse-events', (event, ignore, options) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, options);
  }
});

// Get app version
ipcMain.handle('app:version', () => {
  return app.getVersion();
});

// Get platform info
ipcMain.handle('app:platform', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: process.versions,
  };
});

// Register global shortcuts
ipcMain.handle('shortcuts:register', (event, shortcuts) => {
  registerGlobalShortcuts(shortcuts);
});
