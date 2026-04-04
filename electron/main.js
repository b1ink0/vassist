/**
 * Electron Main Process
 * Creates a transparent window for the desktop app
 */

import { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, protocol, session, desktopCapturer } from 'electron';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { LocalAIServer } from './server/http-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const serverBasePath = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.cwd(), 'electron', 'server')
  : path.join(__dirname, 'server');

let mainWindow;
let inputWindow;
let tray = null;
let gptsovitsProcess = null;
let whisperProcess = null;

/**
 * Force dedicated GPU usage for better 3D rendering performance
 */
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-gpu-driver-bug-workarounds');

/**
 * Network optimizations for faster dev server loading
 */
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('ignore-connections-limit', 'localhost,127.0.0.1');

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
    inputWindow.webContents.openDevTools({ mode: 'detach' });
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
async function createWindow() {
  // Get primary display dimensions
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const initialWidth = 500;
  const initialHeight = 600;
  
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
    mainWindow.setIgnoreMouseEvents(true);
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
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
  
  // Enable screen sharing
  // Note: Electron requires either a custom picker UI or using desktopCapturer
  // We'll use the handler to provide all sources and let Chromium show the picker
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'display-capture') {
      return true;
    }
    return false;
  });
  
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ 
      types: ['screen', 'window'],
      thumbnailSize: { width: 1920, height: 1080 }
    }).then((sources) => {
      // If no sources available, deny
      if (sources.length === 0) {
        return callback({});
      }
      
      let callbackCalled = false;
      let cleanupDone = false;
      
      const safeCallback = (result) => {
        if (!callbackCalled) {
          callbackCalled = true;
          callback(result);
        }
      };
      
      // Create picker window with React component
      let pickerWindow = new BrowserWindow({
        width: 900,
        height: 600,
        resizable: false,
        minimizable: false,
        maximizable: false,
        alwaysOnTop: true,
        autoHideMenuBar: true,
        frame: false,
        backgroundColor: '#1a1a1a',
        webPreferences: {
          preload: path.join(__dirname, 'preload.mjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          devTools: true,
        }
      });

      // Open dev tools
      pickerWindow.webContents.openDevTools({ mode: 'detach' });

      // Load React app with screenPicker mode
      if (process.env.VITE_DEV_SERVER_URL) {
        pickerWindow.loadURL(process.env.VITE_DEV_SERVER_URL + '/electron/index.html?mode=screenPicker');
      } else {
        pickerWindow.loadURL('app://./electron/index.html?mode=screenPicker');
      }

      // Serialize sources data 
      const sourcesData = sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        appIcon: source.appIcon ? source.appIcon.toDataURL() : null
      }));

      console.log('Picker: Total sources:', sources.length);
      console.log('Picker: Serialized sources:', sourcesData.length);

      // Handle picker ready - send sources
      const handlePickerReady = () => {
        console.log('Picker ready, sending sources...');
        if (pickerWindow && pickerWindow.webContents) {
          pickerWindow.webContents.send('picker:sources', sourcesData);
        }
      };

      // Handle source selection
      const handlePickerSelect = (event, sourceId) => {
        console.log('Picker: Source selected:', sourceId);
        const selectedSource = sources.find(s => s.id === sourceId);
        if (selectedSource) {
          safeCallback({ video: selectedSource, audio: 'loopback' });
        } else {
          safeCallback({});
        }
        cleanup();
      };

      // Handle cancel
      const handlePickerCancel = () => {
        console.log('Picker: Cancelled');
        // Don't call callback - just cleanup and let the 'closed' handler deal with it
        cleanup();
      };

      // Cleanup function
      const cleanup = () => {
        if (cleanupDone) return;
        cleanupDone = true;
        
        console.log('Picker: Cleanup started');
        ipcMain.removeListener('picker:ready', handlePickerReady);
        ipcMain.removeListener('picker:select', handlePickerSelect);
        ipcMain.removeListener('picker:cancel', handlePickerCancel);
        
        if (pickerWindow && !pickerWindow.isDestroyed()) {
          console.log('Picker: Closing window');
          pickerWindow.destroy();
        }
        pickerWindow = null;
        console.log('Picker: Cleanup complete');
      };

      // Register handlers
      ipcMain.on('picker:ready', handlePickerReady);
      ipcMain.on('picker:select', handlePickerSelect);
      ipcMain.on('picker:cancel', handlePickerCancel);

      // Handle window close (user closes via X or ESC)
      pickerWindow.on('closed', () => {
        console.log('Picker: Window closed event');
        // Deny the request by calling callback with no video source
        if (!callbackCalled) {
          callbackCalled = true;
          // Don't provide any sources - this denies the request
          callback();
        }
        cleanup();
      });

    }).catch((error) => {
      console.error('Failed to get desktop sources:', error);
      callback({});
    });
  });
  
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
      '.onnx': 'application/octet-stream',
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
  
  // Start Python servers
  startGPTSoVITSServer();
  startWhisperServer();
  
  // Auto-start HTTP proxy server
  setTimeout(async () => {
    try {
      if (!server) {
        server = new LocalAIServer();
      }
      
      // Prepare server configuration
      const serverConfig = {
        llm: {
          modelPath: null,
          temperature: 0.7,
          maxTokens: 2048,
          contextSize: 4096,
          gpuLayers: 'auto'
        },
        stt: {
          proxyUrl: 'http://127.0.0.1:9881'
        },
        tts: {
          proxyUrl: 'http://127.0.0.1:9880'
        }
      };
      
      console.log('[Server] Initializing with config:', JSON.stringify(serverConfig, null, 2));
      
      await server.initialize(serverConfig);
      
      await server.start();
      console.log('[Server] HTTP proxy server started on port 11438');
    } catch (error) {
      console.error('[Server] Failed to auto-start:', error.message);
    }
  }, 2000);

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

app.on('before-quit', () => {
  // Cleanup: stop servers
  if (server) {
    try {
      console.log('[Server] Stopping AI server...');
      server.stop();
    } catch (error) {
      console.error('[Server] Stop error:', error);
    }
  }
  
  // Cancel any running setup
  if (setupRunner) {
    console.log('[GPT-SoVITS] Cancelling setup on app quit...');
    try {
      setupRunner.cancel();
    } catch (error) {
      console.error('[GPT-SoVITS] Setup cancel error:', error);
    }
    setupRunner = null;
  }
  
  stopGPTSoVITSServer();
  stopWhisperServer();
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

// Notify main process that frontend is ready (remove ignore mouse events)
ipcMain.handle('window:frontend-ready', () => {
  if (mainWindow) {
    console.log('[Main] Frontend ready - enabling mouse events');
    mainWindow.setIgnoreMouseEvents(false);
    // Ensure main window is on top
    mainWindow.moveTop();
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

let windowScaleFactorWidth = 0.85;
let windowScaleFactorHeight = 0.75;

ipcMain.handle('window:update-size-for-zoom', (event, modelWidth, modelHeight) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (senderWindow) {
    const baseWidth = 400;
    const baseHeight = 600;
    const baseModelWidth = 400;
    const baseModelHeight = 600;
    
    const modelWidthDelta = modelWidth - baseModelWidth;
    const modelHeightDelta = modelHeight - baseModelHeight;
    
    const windowWidth = Math.max(baseWidth + (modelWidthDelta * windowScaleFactorWidth), 400);
    const windowHeight = Math.max(baseHeight + (modelHeightDelta * windowScaleFactorHeight), 500);
    
    const currentBounds = senderWindow.getBounds();
    const newY = currentBounds.y - (windowHeight - currentBounds.height);
    
    senderWindow.setBounds({
      x: currentBounds.x,
      y: newY,
      width: Math.floor(windowWidth),
      height: Math.floor(windowHeight)
    });
  }
});

ipcMain.handle('window:set-scale-factor', (event, newScaleFactorWidth, newScaleFactorHeight) => {
  windowScaleFactorWidth = newScaleFactorWidth;
  if (newScaleFactorHeight !== undefined) {
    windowScaleFactorHeight = newScaleFactorHeight;
  }
  console.log(`Scale factors updated - Width: ${windowScaleFactorWidth}, Height: ${windowScaleFactorHeight}`);
  return { width: windowScaleFactorWidth, height: windowScaleFactorHeight };
});

ipcMain.handle('window:get-scale-factor', () => {
  return { width: windowScaleFactorWidth, height: windowScaleFactorHeight };
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

// Microphone device state sync between windows
ipcMain.on('state:micDevices', (event, data) => {
  if (inputWindow && inputWindow.webContents) {
    inputWindow.webContents.send('state:micDevices', data);
  }
});

ipcMain.on('state:selectedMicId', (event, deviceId) => {
  // Sync selected mic between main and input windows
  if (mainWindow && mainWindow.webContents && event.sender !== mainWindow.webContents) {
    mainWindow.webContents.send('state:selectedMicId', deviceId);
  }
  if (inputWindow && inputWindow.webContents && event.sender !== inputWindow.webContents) {
    inputWindow.webContents.send('state:selectedMicId', deviceId);
  }
});

// Camera device state sync between windows
ipcMain.on('state:cameraDevices', (event, data) => {
  if (inputWindow && inputWindow.webContents) {
    inputWindow.webContents.send('state:cameraDevices', data);
  }
});

// Screen share state sync from main window to input window
ipcMain.on('state:screenShare', (event, data) => {
  if (inputWindow && inputWindow.webContents) {
    inputWindow.webContents.send('state:screenShare', data);
  }
});

// Camera control from input window to main window
ipcMain.on('camera:selectDevice', (event, deviceId) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('camera:selectDevice', deviceId);
  }
});

ipcMain.on('camera:toggle', () => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('camera:toggle');
  }
});

// Screen share IPC handler - relay from input window to main window
ipcMain.on('screenShare:toggle', () => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('screenShare:toggle');
  }
});

ipcMain.on('state:selectedCameraId', (event, deviceId) => {
  // Sync selected camera between main and input windows
  if (mainWindow && mainWindow.webContents && event.sender !== mainWindow.webContents) {
    mainWindow.webContents.send('state:selectedCameraId', deviceId);
  }
  if (inputWindow && inputWindow.webContents && event.sender !== inputWindow.webContents) {
    inputWindow.webContents.send('state:selectedCameraId', deviceId);
  }
});

// Voice conversation state sync from input window to main window
ipcMain.on('chatInput:voiceTranscription', (event, data) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('chatInput:voiceTranscription', data);
  }
});

// Main window sends transcription to input window, input window sends back with images
ipcMain.on('voice:transcriptionReceived', (event, text) => {
  if (inputWindow && inputWindow.webContents) {
    inputWindow.webContents.send('voice:transcriptionReceived', text);
  }
});

ipcMain.on('chatInput:voiceMode', (event, isActive) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('chatInput:voiceMode', isActive);
  }
});

// Voice interrupt from input window to main window
ipcMain.on('voice:interrupt', () => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('voice:interrupt');
  }
});

// VAD speech detected in input window - forward to main window for TTS interrupt check
ipcMain.on('voice:vadSpeechDetected', () => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('voice:vadSpeechDetected');
  }
});

// Forward voice state from main window to input window
ipcMain.on('state:voiceState', (event, state) => {
  if (inputWindow && inputWindow.webContents) {
    inputWindow.webContents.send('state:voiceState', state);
  }
});

// ============================================
// Desktop AI Server Management
// ============================================

let server = null;

// Server IPC handlers
ipcMain.handle('server:start', async (event, config = {}) => {
  console.log('[Server] Starting with config:', config);
  
  // Create server instance if it doesn't exist
  if (!server) {
    try {
      server = new LocalAIServer();
    } catch (error) {
      console.error('[Server] Failed to create server:', error);
      return { success: false, error: error.message };
    }
  }

  // Build server configuration
  const serverConfig = {
    llm: {
      modelPath: null,
      defaultModelsDir: getModelsDir(),
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 2048,
      contextSize: config.contextSize || 4096,
      gpuLayers: config.gpuLayers === 99 ? 'auto' : config.gpuLayers || 'auto'
    },
    stt: {
      modelPath: null,
      language: 'en'
    },
    tts: {
      proxyUrl: 'http://127.0.0.1:9880'
    }
  };
  
  // Add LLM model path if specified
  if (config.model) {
    const llmPath = path.join(getModelsDir(config.customModelsPath), config.model);
    if (fs.existsSync(llmPath)) {
      serverConfig.llm.modelPath = llmPath;
      console.log('[Server] LLM model:', config.model);
    } else {
      console.warn('[Server] Model not found:', config.model);
    }
  }

  // Check if already running - update config and return
  if (server.getStatus().running) {
    console.log('[Server] Already running, updating config');
    console.log('[Server] Old LLM model path:', server.config.llm.modelPath);
    console.log('[Server] New LLM model path:', serverConfig.llm.modelPath);
    
    // Update server config
    Object.assign(server.config.llm, serverConfig.llm);
    Object.assign(server.config.stt, serverConfig.stt);
    Object.assign(server.config.tts, serverConfig.tts);
    
    console.log('[Server] Updated LLM model path:', server.config.llm.modelPath);
    console.log('[Server] Config updated successfully');
    return { success: true, ...server.getStatus() };
  }

  try {
    
    // Add STT model if exists
    const whisperModelName = 'ggml-base.en.bin';
    const devSttPath = path.join(__dirname, 'server', 'models', 'whisper', whisperModelName);
    const prodSttPath = path.join(__dirname, 'server', 'models', 'whisper', whisperModelName);
    const sttPath = process.env.VITE_DEV_SERVER_URL ? devSttPath : prodSttPath;
    
    console.log('[Server] Checking STT model at:', sttPath);
    if (fs.existsSync(sttPath)) {
      serverConfig.stt.modelPath = sttPath;
      console.log('[Server] STT model found:', whisperModelName);
    } else {
      console.warn('[Server] STT model not found at:', sttPath);
    }
    
    console.log('[Server] Final serverConfig:', JSON.stringify(serverConfig, null, 2));
    
    await server.initialize(serverConfig);
    
    await server.start();
    
    const status = server.getStatus();
    console.log('[Server] Started:', status);
    return { success: true, ...status };
    
  } catch (error) {
    console.error('[Server] Start error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('server:stop', async () => {
  console.log('[Server] Stopping...');
  
  if (!server) {
    return { success: false, error: 'Not initialized' };
  }

  try {
    await server.stop();
    console.log('[Server] Stopped');
    return { success: true };
  } catch (error) {
    console.error('[Server] Stop error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('server:status', async () => {
  if (!server) {
    return { running: false };
  }

  try {
    return server.getStatus();
  } catch (error) {
    console.error('[Server] Status error:', error);
    return { running: false, error: error.message };
  }
});

// ============================================
// GPT-SoVITS Setup Management
// ============================================

let setupRunner = null;

ipcMain.handle('gptsovits:setup:start', async (event) => {
  const setupRunnerPath = path.join(serverBasePath, 'gpt-sovits', 'setup-runner.js');
  const { default: SetupRunner } = await import(pathToFileURL(setupRunnerPath).href);
  
  if (setupRunner) {
    throw new Error('Setup already running');
  }
  
  console.log('[GPT-SoVITS] Starting setup...');
  setupRunner = new SetupRunner();
  
  // Start setup with log streaming
  setupRunner.run((log) => {
    // Send log to renderer
    event.sender.send('gptsovits:setup:log', log);
  }).then(() => {
    console.log('[GPT-SoVITS] Setup complete');
    event.sender.send('gptsovits:setup:complete', { success: true });
    setupRunner = null;
    
    // Restart all servers after successful installation
    console.log('[GPT-SoVITS] Restarting servers...');
    stopGPTSoVITSServer();
    stopWhisperServer();
    
    setTimeout(() => {
      startGPTSoVITSServer();
      startWhisperServer();
      
      // Restart HTTP server if it was running
      if (server && server.getStatus().running) {
        console.log('[Server] Restarting HTTP server...');
        server.stop().then(() => {
          setTimeout(() => server.start(), 1000);
        }).catch(err => console.error('[Server] Restart error:', err));
      }
    }, 2000);
  }).catch((error) => {
    console.error('[GPT-SoVITS] Setup failed:', error);
    event.sender.send('gptsovits:setup:complete', { 
      success: false, 
      error: error.message 
    });
    setupRunner = null;
  });
  
  return { started: true };
});

ipcMain.handle('gptsovits:setup:cancel', async () => {
  if (setupRunner) {
    console.log('[GPT-SoVITS] Cancelling setup...');
    setupRunner.cancel();
    setupRunner = null;
    return { cancelled: true };
  }
  return { cancelled: false, message: 'No setup running' };
});

ipcMain.handle('gptsovits:setup:status', async () => {
  const setupRunnerPath = path.join(serverBasePath, 'gpt-sovits', 'setup-runner.js');
  const { default: SetupRunner } = await import(pathToFileURL(setupRunnerPath).href);
  const runner = new SetupRunner();
  
  try {
    const status = runner.getStatus();
    console.log('[GPT-SoVITS] Setup status:', status);
    return status;
  } catch (error) {
    console.error('[GPT-SoVITS] Status check error:', error);
    return {
      isSetup: false,
      pythonExists: false,
      modelsExist: false,
      gptsovitsExists: false,
      error: error.message
    };
  }
});

// ============================================
// LLM Model Management
// ============================================

function getModelsDir(customPath = null) {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  let modelsDir;
  if (process.env.VITE_DEV_SERVER_URL) {
    modelsDir = path.join(__dirname, '..', 'electron', 'server', 'models');
  } else {
    modelsDir = path.join(__dirname, 'server', 'models');
  }
  
  // Ensure directory exists
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }
  
  return modelsDir;
}

// List models in models directory
ipcMain.handle('llm:list-models', async (event, customPath = null) => {
  try {
    const modelsDir = getModelsDir(customPath);
    
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
      return { success: true, models: [] };
    }

    const files = fs.readdirSync(modelsDir);
    const models = files
      .filter(file => file.endsWith('.gguf') && !file.startsWith('mmproj-')) // Exclude mmproj files
      .map(file => {
        const filePath = path.join(modelsDir, file);
        const stats = fs.statSync(filePath);
        
        // Check if mmproj file exists for this model
        const mmprojFile = `mmproj-${file}`;
        const mmprojPath = path.join(modelsDir, mmprojFile);
        const hasImageSupport = fs.existsSync(mmprojPath);
        
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime,
          hasImageSupport
        };
      });

    return { success: true, models };
  } catch (error) {
    console.error('[LLM] List models error:', error);
    return { success: false, error: error.message };
  }
});

// Pull model using Ollama (free, open source)
ipcMain.handle('llm:pull-model', async (event, modelName, customPath = null) => {
  const https = require('https');
  const http = require('http');
  
  try {
    console.log('[LLM] Pulling model from Ollama registry:', modelName);
    const modelsDir = getModelsDir(customPath);
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    const [model, tag = 'latest'] = modelName.split(':');
    const namespace = model.includes('/') ? model : `library/${model}`;

    event.sender.send('llm:download-progress', { status: 'Pulling manifest...', percent: 0 });

    const manifestUrl = `https://registry.ollama.ai/v2/${namespace}/manifests/${tag}`;
    const manifestRes = await fetch(manifestUrl, {
      headers: { 'Accept': 'application/vnd.docker.distribution.manifest.v2+json' }
    });

    if (!manifestRes.ok) {
      throw new Error(`Model not found: ${modelName}`);
    }

    const manifest = await manifestRes.json();
    const layers = manifest.layers || [];

    // Separate model and mmproj layers by mediaType
    const modelLayers = [];
    const mmprojLayers = [];
    
    for (const layer of layers) {
      const mediaType = layer.mediaType || '';
      // Detect mmproj layers (vision encoder)
      if (mediaType.includes('projector') || mediaType === 'application/vnd.ollama.image.projector') {
        mmprojLayers.push(layer);
        console.log('[LLM] Detected mmproj layer:', layer.digest.substring(0, 20));
      } else {
        modelLayers.push(layer);
      }
    }

    const isMultimodal = mmprojLayers.length > 0;
    const totalLayers = modelLayers.length + mmprojLayers.length;
    
    event.sender.send('llm:download-progress', { 
      status: `Found ${modelLayers.length} model layers${isMultimodal ? ' + ' + mmprojLayers.length + ' vision layers' : ''}`, 
      percent: 2 
    });

    const downloadFile = (url, destPath, layerSize, layerIndex, totalLayers, fileType = 'model') => {
      return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);
        let downloadedBytes = 0;
        
        const request = protocol.get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
            file.close();
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            
            const redirectUrl = response.headers.location;
            if (!redirectUrl) {
              reject(new Error(`Redirect without location header`));
              return;
            }
            
            console.log(`[LLM] Following redirect to: ${redirectUrl}`);
            // Follow redirect
            downloadFile(redirectUrl, destPath, layerSize, layerIndex, totalLayers, fileType)
              .then(resolve)
              .catch(reject);
            return;
          }
          
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
            return;
          }

          const totalBytes = parseInt(response.headers['content-length'], 10) || layerSize;
          
          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            file.write(chunk);
            
            const layerProgress = Math.round((downloadedBytes / totalBytes) * 1000) / 10;
            
            if (Math.floor(layerProgress * 2) % 1 === 0) {
              const sizeMB = (downloadedBytes / 1024 / 1024).toFixed(1);
              const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
              const prefix = fileType === 'mmproj' ? 'Vision' : 'Model';
              event.sender.send('llm:download-progress', {
                status: `${prefix} ${layerIndex + 1}/${totalLayers}: ${sizeMB}MB / ${totalMB}MB`,
                percent: Math.min(100, layerProgress)
              });
            }
          });

          response.on('end', () => {
            file.end();
            resolve({ path: destPath, size: downloadedBytes, type: fileType });
          });

          response.on('error', (err) => {
            file.close();
            fs.unlinkSync(destPath);
            reject(err);
          });
        });

        request.on('error', (err) => {
          file.close();
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          reject(err);
        });

        file.on('error', (err) => {
          file.close();
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          reject(err);
        });
      });
    };

    // Download model layers
    const downloadedModelFiles = [];
    for (let i = 0; i < modelLayers.length; i++) {
      const layer = modelLayers[i];
      const digest = layer.digest;
      const size = layer.size;

      const blobUrl = `https://registry.ollama.ai/v2/${namespace}/blobs/${digest}`;
      const tempFileName = `${model.replace('/', '_')}-${tag}-model-${digest.replace('sha256:', '').substring(0, 12)}.tmp`;
      const tempFilePath = path.join(modelsDir, tempFileName);

      event.sender.send('llm:download-progress', {
        status: `Starting model layer ${i + 1}/${modelLayers.length}...`,
        percent: 2 + (i / totalLayers) * 93
      });

      const result = await downloadFile(blobUrl, tempFilePath, size, i, modelLayers.length, 'model');
      downloadedModelFiles.push(result);
    }

    // Download mmproj layers if multimodal
    const downloadedMmprojFiles = [];
    if (isMultimodal) {
      for (let i = 0; i < mmprojLayers.length; i++) {
        const layer = mmprojLayers[i];
        const digest = layer.digest;
        const size = layer.size;

        const blobUrl = `https://registry.ollama.ai/v2/${namespace}/blobs/${digest}`;
        const tempFileName = `${model.replace('/', '_')}-${tag}-mmproj-${digest.replace('sha256:', '').substring(0, 12)}.tmp`;
        const tempFilePath = path.join(modelsDir, tempFileName);

        event.sender.send('llm:download-progress', {
          status: `Starting vision layer ${i + 1}/${mmprojLayers.length}...`,
          percent: 2 + ((modelLayers.length + i) / totalLayers) * 93
        });

        const result = await downloadFile(blobUrl, tempFilePath, size, i, mmprojLayers.length, 'mmproj');
        downloadedMmprojFiles.push(result);
      }
    }

    event.sender.send('llm:download-progress', { status: 'Processing files...', percent: 95 });

    // Save main model (largest file from model layers)
    let largestModelFile = downloadedModelFiles[0];
    for (const file of downloadedModelFiles) {
      if (file.size > largestModelFile.size) {
        largestModelFile = file;
      }
    }

    const finalModelName = `${model.replace('/', '_')}-${tag}.gguf`;
    const finalModelPath = path.join(modelsDir, finalModelName);
    fs.renameSync(largestModelFile.path, finalModelPath);

    // Save mmproj if exists (largest file from mmproj layers)
    let mmprojFileName = null;
    if (downloadedMmprojFiles.length > 0) {
      let largestMmprojFile = downloadedMmprojFiles[0];
      for (const file of downloadedMmprojFiles) {
        if (file.size > largestMmprojFile.size) {
          largestMmprojFile = file;
        }
      }

      mmprojFileName = `mmproj-${finalModelName}`;
      const finalMmprojPath = path.join(modelsDir, mmprojFileName);
      fs.renameSync(largestMmprojFile.path, finalMmprojPath);
      
      console.log('[LLM] Vision encoder saved:', mmprojFileName, `(${(largestMmprojFile.size / 1024 / 1024).toFixed(1)}MB)`);
    }

    event.sender.send('llm:download-progress', { status: 'Cleaning up...', percent: 97 });

    // Clean up temp files
    for (const file of [...downloadedModelFiles, ...downloadedMmprojFiles]) {
      if (file.path !== largestModelFile.path && 
          (!downloadedMmprojFiles.length || file.path !== downloadedMmprojFiles.find(f => f.size === Math.max(...downloadedMmprojFiles.map(f => f.size)))?.path) &&
          fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }

    event.sender.send('llm:download-progress', { 
      status: `Model ready${isMultimodal ? ' (with vision support)' : ''}`, 
      percent: 100 
    });

    console.log('[LLM] Model downloaded:', finalModelName, `(${(largestModelFile.size / 1024 / 1024).toFixed(1)}MB)`);

    return { 
      success: true,
      modelFile: finalModelName,
      mmprojFile: mmprojFileName,
      isMultimodal,
      note: isMultimodal ? 'Multimodal model with vision support' : `Model saved as ${finalModelName}`
    };
  } catch (error) {
    console.error('[LLM] Pull error:', error);
    return { success: false, error: error.message };
  }
});

// Download model from Hugging Face
ipcMain.handle('llm:download-model', async (event, url, customPath = null) => {
  try {
    const https = require('https');
    const modelsDir = getModelsDir(customPath);
    
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    // Extract filename from URL
    const urlParts = url.split('/');
    let filename = urlParts[urlParts.length - 1];
    
    // Handle Hugging Face URLs and remove query parameters
    if (url.includes('huggingface.co') && url.includes('/resolve/')) {
      filename = urlParts[urlParts.length - 1];
    }
    filename = filename.split('?')[0];

    if (!filename.endsWith('.gguf')) {
      return { success: false, error: 'Invalid file: must be a .gguf model file' };
    }

    const filePath = path.join(modelsDir, filename);

    // Check if model has mmproj file (for multimodal support)
    let mmprojUrl = null;
    let mmprojFilename = null;
    
    if (url.includes('huggingface.co')) {
      event.sender.send('llm:download-progress', { 
        status: 'Checking for vision support...', 
        percent: 0 
      });
      
      try {
        // Parse Hugging Face URL: https://huggingface.co/{org}/{repo}/resolve/{branch}/{file}
        const match = url.match(/huggingface\.co\/([^\/]+)\/([^\/]+)\/resolve\/([^\/]+)\//);
        if (match) {
          const [, org, repo, branch] = match;
          
          // Try to find mmproj in the same repo
          const apiUrl = `https://huggingface.co/api/models/${org}/${repo}/tree/${branch}`;
          const apiRes = await fetch(apiUrl);
          
          if (apiRes.ok) {
            const files = await apiRes.json();
            // Look for mmproj-*.gguf file
            const mmprojFile = files.find(f => f.path && f.path.match(/mmproj.*\.gguf$/i));
            
            if (mmprojFile) {
              mmprojFilename = `mmproj-${filename}`;
              mmprojUrl = `https://huggingface.co/${org}/${repo}/resolve/${branch}/${mmprojFile.path}`;
              console.log('[LLM] Found mmproj in repo:', mmprojFile.path);
            } else {
              // Fallback: try ggml-org/{model}-GGUF repo
              const modelName = repo.replace(/-GGUF$/i, '');
              const fallbackApiUrl = `https://huggingface.co/api/models/ggml-org/${modelName}-GGUF/tree/main`;
              
              try {
                const fallbackRes = await fetch(fallbackApiUrl);
                if (fallbackRes.ok) {
                  const fallbackFiles = await fallbackRes.json();
                  const fallbackMmproj = fallbackFiles.find(f => f.path && f.path.match(/mmproj.*\.gguf$/i));
                  
                  if (fallbackMmproj) {
                    mmprojFilename = `mmproj-${filename}`;
                    mmprojUrl = `https://huggingface.co/ggml-org/${modelName}-GGUF/resolve/main/${fallbackMmproj.path}`;
                    console.log('[LLM] Found mmproj in fallback repo:', fallbackMmproj.path);
                  }
                }
              } catch (fallbackErr) {
                console.log('[LLM] No mmproj in fallback repo:', fallbackErr.message);
              }
            }
          }
        }
      } catch (apiError) {
        console.log('[LLM] Could not check for mmproj:', apiError.message);
      }
    }

    // Download main model file
    event.sender.send('llm:download-progress', { 
      status: 'Starting model download...', 
      percent: 1 
    });

    await new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          https.get(response.headers.location, (redirectResponse) => {
            downloadFile(redirectResponse, filePath, event, resolve, reject, 'model', mmprojUrl ? 50 : 100);
          });
        } else {
          downloadFile(response, filePath, event, resolve, reject, 'model', mmprojUrl ? 50 : 100);
        }
      }).on('error', (err) => {
        reject(new Error(`Download failed: ${err.message}`));
      });
    });

    // Download mmproj if found
    if (mmprojUrl && mmprojFilename) {
      event.sender.send('llm:download-progress', { 
        status: 'Downloading vision support...', 
        percent: 51 
      });

      const mmprojPath = path.join(modelsDir, mmprojFilename);
      
      await new Promise((resolve, reject) => {
        https.get(mmprojUrl, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            https.get(response.headers.location, (redirectResponse) => {
              downloadFile(redirectResponse, mmprojPath, event, resolve, reject, 'mmproj', 100, 50);
            });
          } else {
            downloadFile(response, mmprojPath, event, resolve, reject, 'mmproj', 100, 50);
          }
        }).on('error', (err) => {
          console.warn('[LLM] Failed to download mmproj (non-critical):', err.message);
          resolve({ success: true }); // Continue even if mmproj fails
        });
      });

      console.log('[LLM] Downloaded with vision support:', filename, '+', mmprojFilename);
      return { 
        success: true, 
        filename,
        mmprojFilename,
        isMultimodal: true,
        note: 'Model downloaded with vision support'
      };
    }

    console.log('[LLM] Downloaded model:', filename);
    return { 
      success: true, 
      filename,
      note: 'Model downloaded successfully'
    };
  } catch (error) {
    console.error('[LLM] Download error:', error);
    return { success: false, error: error.message };
  }
});

function downloadFile(response, filePath, event, resolve, reject, fileType = 'model', maxPercent = 100, startPercent = 0) {
  const totalSize = parseInt(response.headers['content-length'], 10);
  let downloadedSize = 0;
  let lastReportedPercent = 0;

  const fileStream = fs.createWriteStream(filePath);
  
  response.pipe(fileStream);

  response.on('data', (chunk) => {
    downloadedSize += chunk.length;
    const downloadPercent = Math.round((downloadedSize / totalSize) * 1000) / 10;
    const actualPercent = startPercent + (downloadPercent / 100) * (maxPercent - startPercent);
    
    if (Math.floor(actualPercent * 2) !== Math.floor(lastReportedPercent * 2)) {
      const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(1);
      const totalMB = (totalSize / 1024 / 1024).toFixed(1);
      const prefix = fileType === 'mmproj' ? 'Vision' : 'Model';
      event.sender.send('llm:download-progress', {
        percent: Math.min(100, actualPercent),
        status: `${prefix}: ${downloadedMB}MB / ${totalMB}MB`
      });
      lastReportedPercent = actualPercent;
    }
  });

  fileStream.on('finish', () => {
    fileStream.close();
    event.sender.send('llm:download-progress', {
      percent: maxPercent,
      status: fileType === 'mmproj' ? 'Vision support ready' : `Download complete: ${path.basename(filePath)}`
    });
    resolve({ success: true, filename: path.basename(filePath) });
  });

  fileStream.on('error', (err) => {
    fs.unlink(filePath, () => {});
    reject(new Error(`File write error: ${err.message}`));
  });
}

// Delete model
ipcMain.handle('llm:delete-model', async (event, filename, customPath = null) => {
  try {
    const modelsDir = getModelsDir(customPath);
    const filePath = path.join(modelsDir, filename);

    // Security: ensure file is within models directory
    const normalizedFilePath = path.normalize(filePath);
    const normalizedModelsDir = path.normalize(modelsDir);
    
    if (!normalizedFilePath.startsWith(normalizedModelsDir)) {
      throw new Error('Invalid file path');
    }

    if (!fs.existsSync(filePath)) {
      // List files in directory to help debug
      const files = fs.readdirSync(modelsDir);
      console.log('[LLM]   Files in directory:', files);
      throw new Error('Model not found');
    }

    // Delete main model file
    fs.unlinkSync(filePath);
    console.log('[LLM] Deleted model:', filename);
    
    // Also delete associated mmproj file if exists
    const mmprojFile = `mmproj-${filename}`;
    const mmprojPath = path.join(modelsDir, mmprojFile);
    if (fs.existsSync(mmprojPath)) {
      fs.unlinkSync(mmprojPath);
      console.log('[LLM] Deleted associated mmproj:', mmprojFile);
    }
    
    return { success: true };
  } catch (error) {
    console.error('[LLM] Delete error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('llm:import-model', async (event, sourcePath, customPath = null) => {
  try {
    console.log('[LLM] Importing model from:', sourcePath);
    const modelsDir = getModelsDir(customPath);
    
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    if (!sourcePath.endsWith('.gguf')) {
      throw new Error('Only .gguf files are supported');
    }

    const filename = path.basename(sourcePath);
    const destPath = path.join(modelsDir, filename);

    if (fs.existsSync(destPath)) {
      throw new Error(`Model "${filename}" already exists`);
    }

    fs.copyFileSync(sourcePath, destPath);

    console.log('[LLM] Model imported successfully:', filename);
    return { success: true, filename };
  } catch (error) {
    console.error('[LLM] Import model error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('llm:choose-models-folder', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Models Folder',
      buttonLabel: 'Select Folder'
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    console.error('[LLM] Choose folder error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('llm:choose-model-file', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Select GGUF Model File',
      buttonLabel: 'Import',
      filters: [
        { name: 'GGUF Models', extensions: ['gguf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    console.error('[LLM] Choose file error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * GPT-SoVITS TTS Server Management
 */
function startGPTSoVITSServer() {
  if (gptsovitsProcess) {
    console.log('[GPT-SoVITS] Server already running');
    return;
  }

  try {
    const gptsovitsDir = path.join(serverBasePath, 'gpt-sovits');
    const pythonExe = path.join(gptsovitsDir, 'python', 'python.exe');
    const apiScript = path.join(gptsovitsDir, 'api.py');

    // Check if embedded Python exists
    if (!fs.existsSync(pythonExe)) {
      console.error('[GPT-SoVITS] Embedded Python not found. Run setup.py first.');
      console.log('[GPT-SoVITS] Run: python electron/server/gpt-sovits/setup.py');
      return;
    }

    console.log('[GPT-SoVITS] Starting TTS server...');
    console.log('[GPT-SoVITS] Python:', pythonExe);
    console.log('[GPT-SoVITS] Script:', apiScript);

    gptsovitsProcess = spawn(pythonExe, [apiScript], {
      cwd: gptsovitsDir,
      env: {
        ...process.env,
        GPTSOVITS_PORT: '9880',
        PYTHONUNBUFFERED: '1'
      }
    });

    gptsovitsProcess.stdout.on('data', (data) => {
      console.log(`[GPT-SoVITS] ${data.toString().trim()}`);
    });

    gptsovitsProcess.stderr.on('data', (data) => {
      console.error(`[GPT-SoVITS] ${data.toString().trim()}`);
    });

    gptsovitsProcess.on('error', (error) => {
      console.error('[GPT-SoVITS] Failed to start:', error);
      gptsovitsProcess = null;
    });

    gptsovitsProcess.on('exit', (code, signal) => {
      console.log(`[GPT-SoVITS] Process exited with code ${code}, signal ${signal}`);
      gptsovitsProcess = null;
    });

    console.log('[GPT-SoVITS] Server started on http://127.0.0.1:9880');
  } catch (error) {
    console.error('[GPT-SoVITS] Start error:', error);
  }
}

function stopGPTSoVITSServer() {
  if (gptsovitsProcess) {
    console.log('[GPT-SoVITS] Stopping server...');
    gptsovitsProcess.kill('SIGTERM');
    gptsovitsProcess = null;
  }
}

/**
 * Faster Whisper STT Server Management
 */
function startWhisperServer() {
  if (whisperProcess) {
    console.log('[Whisper] Server already running');
    return;
  }

  try {
    const gptsovitsDir = path.join(serverBasePath, 'gpt-sovits');
    const whisperDir = path.join(serverBasePath, 'whisper-stt');
    const pythonExe = path.join(gptsovitsDir, 'python', 'python.exe'); 
    const serverScript = path.join(whisperDir, 'server.py');

    if (!fs.existsSync(pythonExe)) {
      console.error('[Whisper] Embedded Python not found. Run setup.py first.');
      return;
    }

    if (!fs.existsSync(serverScript)) {
      console.error('[Whisper] Server script not found:', serverScript);
      return;
    }

    console.log('[Whisper] Starting STT server...');
    console.log('[Whisper] Python:', pythonExe);
    console.log('[Whisper] Script:', serverScript);

    whisperProcess = spawn(pythonExe, [serverScript], {
      cwd: whisperDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      }
    });

    whisperProcess.stdout.on('data', (data) => {
      console.log(`[Whisper] ${data.toString().trim()}`);
    });

    whisperProcess.stderr.on('data', (data) => {
      console.error(`[Whisper] ${data.toString().trim()}`);
    });

    whisperProcess.on('error', (error) => {
      console.error('[Whisper] Failed to start:', error);
      whisperProcess = null;
    });

    whisperProcess.on('exit', (code, signal) => {
      console.log(`[Whisper] Process exited with code ${code}, signal ${signal}`);
      whisperProcess = null;
    });

    console.log('[Whisper] Server started on http://127.0.0.1:9881');
  } catch (error) {
    console.error('[Whisper] Start error:', error);
  }
}

function stopWhisperServer() {
  if (whisperProcess) {
    console.log('[Whisper] Stopping server...');
    whisperProcess.kill('SIGTERM');
    whisperProcess = null;
  }
}
