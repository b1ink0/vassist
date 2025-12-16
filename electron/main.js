/**
 * Electron Main Process
 * Creates a transparent window for the desktop app
 */

import { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, protocol } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let inputWindow;
let tray = null;

/**
 * Force dedicated GPU usage for better 3D rendering performance
 */
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-gpu-driver-bug-workarounds');

/**
 * Create the input window
 */
function createInputWindow() {
  if (inputWindow) return;

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const inputWidth = 600;
  const inputHeight = 400;

  inputWindow = new BrowserWindow({
    width: inputWidth,
    height: inputHeight,
    x: Math.floor((screenWidth - inputWidth) / 2),
    y: screenHeight - inputHeight - 50,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.mjs'),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    inputWindow.loadURL(process.env.VITE_DEV_SERVER_URL + '/electron/index.html?window=input');
    inputWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    inputWindow.loadURL('app://./electron/index.html?window=input');
  }

  inputWindow.once('ready-to-show', () => {
    inputWindow.show();
    inputWindow.setOpacity(0);
    inputWindow.setIgnoreMouseEvents(true);
  });

  inputWindow.on('closed', () => {
    inputWindow = null;
  });
}

/**
 * Create the main application window with transparency
 */
function createWindow() {
  // Get primary display dimensions
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const initialWidth = 400;
  const initialHeight = 500;
  
  mainWindow = new BrowserWindow({
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

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    // Development mode - load from dev server with electron HTML
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL + '/electron/index.html');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL('app://./electron/index.html');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }


  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    createInputWindow();
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
 * Register custom protocol with CORS headers to enable SharedArrayBuffer
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

/**
 * App lifecycle handlers
 */
app.whenReady().then(() => {
  // Register protocol handler that serves files with proper CORS headers
  protocol.handle('app', (request) => {
    const url = request.url.substring('app://'.length);
    const filePath = path.normalize(path.join(__dirname, url.split('?')[0]));
    
    const fileBuffer = fs.readFileSync(filePath);
    
    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.wasm': 'application/wasm',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // Return with CORS headers
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin'
      }
    });
  });

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

// Window positioning and sizing for model dragging
ipcMain.handle('window:set-position', (event, x, y) => {
  if (mainWindow) {
    mainWindow.setPosition(Math.floor(x), Math.floor(y));
  }
});

ipcMain.handle('window:get-position', () => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    return { x, y };
  }
  return { x: 0, y: 0 };
});

ipcMain.handle('window:set-size', (event, width, height) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (senderWindow) {
    const currentBounds = senderWindow.getBounds();

    const newY = currentBounds.y - (height - currentBounds.height);
    senderWindow.setBounds({
      x: currentBounds.x,
      y: newY,
      width: Math.floor(width),
      height: Math.floor(height)
    });
  }
});

ipcMain.handle('window:get-size', () => {
  if (mainWindow) {
    const [width, height] = mainWindow.getSize();
    return { width, height };
  }
  return { width: 0, height: 0 };
});

ipcMain.handle('input-window:open', async () => {
  if (inputWindow) {
    inputWindow.setOpacity(1);
    inputWindow.setIgnoreMouseEvents(false);
    inputWindow.focus();
  }
});

ipcMain.handle('input-window:close', () => {
  if (inputWindow) {
    inputWindow.setOpacity(0);
    inputWindow.setIgnoreMouseEvents(true);
  }
});

ipcMain.handle('input-window:is-open', () => {
  return inputWindow && inputWindow.getOpacity() > 0;
});

ipcMain.on('chatInput:send', (event, data) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('chatInput:send', data);
  }
});

ipcMain.on('chatInput:setPendingDropData', (event, data) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('chatInput:setPendingDropData', data);
  }
});

ipcMain.on('chatInput:close', () => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('chatInput:close');
  }
});

ipcMain.on('state:isChatInputVisible', (event, visible) => {
  if (inputWindow && inputWindow.webContents) {
    inputWindow.webContents.send('state:isChatInputVisible', visible);
  }
});

ipcMain.on('state:pendingDropData', (event, data) => {
  if (inputWindow && inputWindow.webContents) {
    inputWindow.webContents.send('state:pendingDropData', data);
  }
});
