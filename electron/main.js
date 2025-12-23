/**
 * Electron Main Process
 * Creates a transparent window for the desktop app
 */

import { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, protocol, session } from 'electron';
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
let gptsovitsRustProcess = null;
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
    if (permission === 'media' || permission === 'microphone') {
      callback(true);
    } else {
      callback(false);
    }
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
  
  // TTS servers will be started by ConfigContext based on user's configuration
  // Python (port 9880) OR Rust (port 9882) - not both
  // ConfigContext.jsx checks config.tts.implementation and starts the appropriate server
  
  // Start Whisper STT server (port 9881)
  startWhisperServer();
  
  // Auto-start HTTP proxy server
  setTimeout(async () => {
    try {
      if (!server) {
        server = new LocalAIServer();
      }
      
      // Set callback for Rust TTS on-demand start + activity tracking
      server.onRustTTSRequest = async () => {
        // Update activity (for idle timeout)
        if (typeof updateRustServerActivity === 'function') {
          updateRustServerActivity();
        }
        
        // Start server if not running (on-demand)
        if (!gptsovitsRustProcess) {
          console.log('[GPT-SoVITS-Rust] Server not running, starting on-demand...');
          try {
            await startGPTSoVITSRustServer();
            return { running: true };
          } catch (error) {
            console.error('[GPT-SoVITS-Rust] Failed to start on-demand:', error);
            return { running: false, error: error.message };
          }
        }
        
        return { running: true };
      };
      
      // Set callback for Python TTS start
      server.onStartPythonTTS = async () => {
        if (!gptsovitsProcess) {
          console.log('[GPT-SoVITS] Starting Python TTS on-demand...');
          startGPTSoVITSServer();
          // Wait for server to be ready
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      };
      
      // Set callbacks for stopping servers
      server.onStopRustTTS = async () => {
        stopGPTSoVITSRustServer();
      };
      
      server.onStopPythonTTS = async () => {
        stopGPTSoVITSServer();
      };
      
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
          proxyUrl: 'http://127.0.0.1:9880',
          rustProxyUrl: 'http://127.0.0.1:9882'
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

// Update HTTP server TTS configuration
ipcMain.handle('server:update-tts-config', async (event, ttsConfig) => {
  if (!server) {
    console.warn('[Server] Server not initialized, cannot update TTS config');
    return { success: false, error: 'Server not initialized' };
  }

  try {
    const { implementation } = ttsConfig;
    
    // Update TTS config in HTTP server
    server.config.tts.implementation = implementation;
    
    console.log(`[Server] TTS config updated: implementation=${implementation}`);
    console.log(`[Server] Will route to: ${implementation === 'gpt-sovits-rust' ? 'Rust (9882)' : 'Python (9880)'}`);
    
    return { success: true };
  } catch (error) {
    console.error('[Server] Failed to update TTS config:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// GPT-SoVITS Setup Management
// ============================================

let setupRunner = null;
let setupRunnerRust = null;

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
// GPT-SoVITS Rust Setup Management
// ============================================

ipcMain.handle('gptsovits-rust:setup:start', async (event) => {
  const setupRunnerPath = path.join(serverBasePath, 'gpt-sovits-rs', 'setup-runner-rust.js');
  const { default: SetupRunnerRust } = await import(pathToFileURL(setupRunnerPath).href);
  
  if (setupRunnerRust) {
    throw new Error('Rust setup already running');
  }
  
  console.log('[GPT-SoVITS-Rust] Starting setup...');
  setupRunnerRust = new SetupRunnerRust();
  
  // Start setup with progress streaming
  setupRunnerRust.run((progress) => {
    // Send progress to renderer
    event.sender.send('gptsovits-rust:setup:progress', progress);
  }).then(() => {
    console.log('[GPT-SoVITS-Rust] Setup complete');
    event.sender.send('gptsovits-rust:setup:complete', { success: true });
    setupRunnerRust = null;
    
    // Start Rust server after successful installation
    console.log('[GPT-SoVITS-Rust] Starting server...');
    setTimeout(() => {
      startGPTSoVITSRustServer();
    }, 1000);
  }).catch((error) => {
    console.error('[GPT-SoVITS-Rust] Setup failed:', error);
    event.sender.send('gptsovits-rust:setup:complete', { 
      success: false, 
      error: error.message 
    });
    setupRunnerRust = null;
  });
  
  return { started: true };
});

ipcMain.handle('gptsovits-rust:setup:cancel', async () => {
  if (setupRunnerRust) {
    console.log('[GPT-SoVITS-Rust] Cancelling setup...');
    setupRunnerRust.cancel();
    setupRunnerRust = null;
    return { cancelled: true };
  }
  return { cancelled: false, message: 'No setup running' };
});

ipcMain.handle('gptsovits-rust:setup:status', async () => {
  const setupRunnerPath = path.join(serverBasePath, 'gpt-sovits-rs', 'setup-runner-rust.js');
  const { default: SetupRunnerRust } = await import(pathToFileURL(setupRunnerPath).href);
  const runner = new SetupRunnerRust();
  
  try {
    const status = runner.getStatus();
    console.log('[GPT-SoVITS-Rust] Setup status:', status);
    return status;
  } catch (error) {
    console.error('[GPT-SoVITS-Rust] Status check error:', error);
    return {
      isSetup: false,
      libtorchExists: false,
      modelsExist: false,
      error: error.message
    };
  }
});

// Handler to start Rust TTS server on-demand (called from frontend after config load)
ipcMain.handle('gptsovits-rust:server:start', async () => {
  try {
    if (gptsovitsRustProcess) {
      return { success: true, message: 'Server already running' };
    }
    
    await startGPTSoVITSRustServer();
    return { success: true };
  } catch (error) {
    console.error('[GPT-SoVITS-Rust] Failed to start server:', error);
    return { success: false, error: error.message };
  }
});

// Handler to start Python TTS server on-demand (called from frontend after config load)
ipcMain.handle('gptsovits:server:start', async () => {
  try {
    if (gptsovitsProcess) {
      return { success: true, message: 'Server already running' };
    }
    
    startGPTSoVITSServer();
    return { success: true };
  } catch (error) {
    console.error('[GPT-SoVITS] Failed to start server:', error);
    return { success: false, error: error.message };
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
      .filter(file => file.endsWith('.gguf'))
      .map(file => {
        const filePath = path.join(modelsDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime
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

    event.sender.send('llm:download-progress', { 
      status: `Found ${layers.length} layers to download`, 
      percent: 2 
    });

    const downloadFile = (url, destPath, layerSize, layerIndex, totalLayers) => {
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
            downloadFile(redirectUrl, destPath, layerSize, layerIndex, totalLayers)
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
              event.sender.send('llm:download-progress', {
                status: `Layer ${layerIndex + 1}/${totalLayers}: ${sizeMB}MB / ${totalMB}MB`,
                percent: Math.min(100, layerProgress)
              });
            }
          });

          response.on('end', () => {
            file.end();
            resolve({ path: destPath, size: downloadedBytes });
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

    const downloadedFiles = [];
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const digest = layer.digest;
      const size = layer.size;

      const blobUrl = `https://registry.ollama.ai/v2/${namespace}/blobs/${digest}`;
      const tempFileName = `${model.replace('/', '_')}-${tag}-${digest.replace('sha256:', '').substring(0, 12)}.tmp`;
      const tempFilePath = path.join(modelsDir, tempFileName);

      event.sender.send('llm:download-progress', {
        status: `Starting layer ${i + 1}/${layers.length}...`,
        percent: 2 + (i / layers.length) * 93
      });

      const result = await downloadFile(blobUrl, tempFilePath, size, i, layers.length);
      downloadedFiles.push(result);
    }

    event.sender.send('llm:download-progress', { status: 'Processing files...', percent: 95 });

    let largestFile = downloadedFiles[0];
    for (const file of downloadedFiles) {
      if (file.size > largestFile.size) {
        largestFile = file;
      }
    }

    const finalFileName = `${model.replace('/', '_')}-${tag}.gguf`;
    const finalFilePath = path.join(modelsDir, finalFileName);
    fs.renameSync(largestFile.path, finalFilePath);

    event.sender.send('llm:download-progress', { status: 'Cleaning up...', percent: 97 });

    for (const file of downloadedFiles) {
      if (file.path !== largestFile.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }

    event.sender.send('llm:download-progress', { 
      status: `Model ready: ${finalFileName}`, 
      percent: 100 
    });

    console.log('[LLM] Model downloaded:', finalFileName, `(${(largestFile.size / 1024 / 1024).toFixed(1)}MB)`);

    return { 
      success: true,
      note: `Model saved as ${finalFileName}`
    };
  } catch (error) {
    console.error('[LLM] Pull error:', error);
    return { success: false, error: error.message };
  }
});

// Download model from Hugging Face
ipcMain.handle('llm:download-model', async (event, url) => {
  try {
    const https = require('https');
    const modelsDir = getModelsDir();
    
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

    // Download file
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          https.get(response.headers.location, (redirectResponse) => {
            downloadFile(redirectResponse, filePath, event, resolve, reject);
          });
        } else {
          downloadFile(response, filePath, event, resolve, reject);
        }
      }).on('error', (err) => {
        reject(new Error(`Download failed: ${err.message}`));
      });
    });
  } catch (error) {
    console.error('[LLM] Download error:', error);
    return { success: false, error: error.message };
  }
});

function downloadFile(response, filePath, event, resolve, reject) {
  const totalSize = parseInt(response.headers['content-length'], 10);
  let downloadedSize = 0;
  let lastReportedPercent = 0;

  const fileStream = fs.createWriteStream(filePath);
  
  response.pipe(fileStream);

  response.on('data', (chunk) => {
    downloadedSize += chunk.length;
    const percent = Math.round((downloadedSize / totalSize) * 1000) / 10;
    
    if (Math.floor(percent * 2) !== Math.floor(lastReportedPercent * 2)) {
      const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(1);
      const totalMB = (totalSize / 1024 / 1024).toFixed(1);
      event.sender.send('llm:download-progress', {
        percent: Math.min(100, percent),
        status: `Downloading: ${downloadedMB}MB / ${totalMB}MB`
      });
      lastReportedPercent = percent;
    }
  });

  fileStream.on('finish', () => {
    fileStream.close();
    event.sender.send('llm:download-progress', {
      percent: 100,
      status: `Download complete: ${path.basename(filePath)}`
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
    if (!filePath.startsWith(modelsDir)) {
      throw new Error('Invalid file path');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error('Model not found');
    }

    fs.unlinkSync(filePath);
    console.log('[LLM] Deleted model:', filename);
    
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
 * GPT-SoVITS Rust TTS Server Management
 */
let gptsovitsRustServerReady = false;
let rustServerLastUsed = null;
let rustServerIdleTimer = null;
const RUST_IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

function updateRustServerActivity() {
  rustServerLastUsed = Date.now();
  
  // Clear existing timer
  if (rustServerIdleTimer) {
    clearTimeout(rustServerIdleTimer);
  }
  
  // Set new idle timeout
  rustServerIdleTimer = setTimeout(() => {
    const idleTime = Date.now() - (rustServerLastUsed || 0);
    if (idleTime >= RUST_IDLE_TIMEOUT && gptsovitsRustProcess) {
      console.log('[GPT-SoVITS-Rust] Stopping server due to inactivity (10min idle)');
      stopGPTSoVITSRustServer();
    }
  }, RUST_IDLE_TIMEOUT);
}

async function waitForRustServerReady(maxWaitMs = 30000) {
  const https = require('https');
  const http = require('http');
  const startTime = Date.now();
  const checkInterval = 500;
  
  return new Promise((resolve, reject) => {
    const checkHealth = () => {
      if (Date.now() - startTime > maxWaitMs) {
        reject(new Error('Rust server health check timeout'));
        return;
      }
      
      http.get('http://127.0.0.1:9882/health', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.status === 'healthy') {
              console.log('[GPT-SoVITS-Rust] Server ready');
              gptsovitsRustServerReady = true;
              resolve();
            } else {
              setTimeout(checkHealth, checkInterval);
            }
          } catch (e) {
            setTimeout(checkHealth, checkInterval);
          }
        });
      }).on('error', () => {
        // Server not ready yet, try again
        setTimeout(checkHealth, checkInterval);
      });
    };
    
    checkHealth();
  });
}

async function startGPTSoVITSRustServer(retryCount = 0, maxRetries = 3) {
  if (gptsovitsRustProcess) {
    console.log('[GPT-SoVITS-Rust] Server already running');
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    try {
      const rustDir = path.join(serverBasePath, 'gpt-sovits-rs');
      const exeName = process.platform === 'win32' ? 'gpt-sovits-server.exe' : 'gpt-sovits-server';
      const exePath = path.join(rustDir, 'target', 'release', exeName);
      const libtorchLib = path.join(rustDir, 'libtorch', 'lib');

      // Check if exe exists
      if (!fs.existsSync(exePath)) {
        console.error('[GPT-SoVITS-Rust] Executable not found. Run setup first.');
        return reject(new Error('Rust executable not found'));
      }

      // Check if LibTorch exists
      if (!fs.existsSync(libtorchLib)) {
        console.error('[GPT-SoVITS-Rust] LibTorch not found. Run setup first.');
        return reject(new Error('LibTorch not found'));
      }

      console.log('[GPT-SoVITS-Rust] Starting TTS server...');
      if (retryCount > 0) {
        console.log(`[GPT-SoVITS-Rust] Retry attempt ${retryCount}/${maxRetries}`);
      }
      console.log('[GPT-SoVITS-Rust] Exe:', exePath);
      console.log('[GPT-SoVITS-Rust] LibTorch:', libtorchLib);
      console.log('[GPT-SoVITS-Rust] Port: 9882');

      gptsovitsRustServerReady = false;

      gptsovitsRustProcess = spawn(exePath, ['9882'], {
        cwd: rustDir,
        env: {
          ...process.env,
          LD_LIBRARY_PATH: libtorchLib, // Linux/macOS
          PATH: `${libtorchLib};${process.env.PATH}`, // Windows
        }
      });

      gptsovitsRustProcess.stdout.on('data', (data) => {
        console.log(`[GPT-SoVITS-Rust] ${data.toString().trim()}`);
      });

      gptsovitsRustProcess.stderr.on('data', (data) => {
        console.error(`[GPT-SoVITS-Rust] ${data.toString().trim()}`);
      });

      gptsovitsRustProcess.on('error', (error) => {
        console.error('[GPT-SoVITS-Rust] Failed to start:', error);
        gptsovitsRustProcess = null;
        gptsovitsRustServerReady = false;
        
        // Retry on error
        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(`[GPT-SoVITS-Rust] Retrying in ${delay}ms...`);
          setTimeout(() => {
            startGPTSoVITSRustServer(retryCount + 1, maxRetries).then(resolve).catch(reject);
          }, delay);
        } else {
          reject(error);
        }
      });

      gptsovitsRustProcess.on('exit', (code, signal) => {
        console.log(`[GPT-SoVITS-Rust] Process exited with code ${code}, signal ${signal}`);
        const wasRunning = gptsovitsRustProcess !== null;
        gptsovitsRustProcess = null;
        gptsovitsRustServerReady = false;
        
        // Auto-restart on unexpected crash (if it was running and exit code is non-zero)
        if (wasRunning && code !== 0 && code !== null && retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`[GPT-SoVITS-Rust] Unexpected crash detected. Restarting in ${delay}ms...`);
          setTimeout(() => {
            startGPTSoVITSRustServer(retryCount + 1, maxRetries).then(resolve).catch(reject);
          }, delay);
        }
      });

      console.log('[GPT-SoVITS-Rust] Server started on http://127.0.0.1:9882');
      
      // Wait for server to be ready
      waitForRustServerReady().then(() => {
        // Start idle timeout tracking
        updateRustServerActivity();
        resolve();
      }).catch(err => {
        // Retry on health check failure
        if (retryCount < maxRetries) {
          console.log('[GPT-SoVITS-Rust] Health check failed, stopping and retrying...');
          stopGPTSoVITSRustServer();
          const delay = Math.pow(2, retryCount) * 1000;
          setTimeout(() => {
            startGPTSoVITSRustServer(retryCount + 1, maxRetries).then(resolve).catch(reject);
          }, delay);
        } else {
          reject(err);
        }
      });
      
    } catch (error) {
      console.error('[GPT-SoVITS-Rust] Start error:', error);
      
      // Retry on exception
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`[GPT-SoVITS-Rust] Retrying in ${delay}ms...`);
        setTimeout(() => {
          startGPTSoVITSRustServer(retryCount + 1, maxRetries).then(resolve).catch(reject);
        }, delay);
      } else {
        reject(error);
      }
    }
  });
}

function stopGPTSoVITSRustServer() {
  if (gptsovitsRustProcess) {
    console.log('[GPT-SoVITS-Rust] Stopping server...');
    gptsovitsRustProcess.kill('SIGTERM');
    gptsovitsRustProcess = null;
    gptsovitsRustServerReady = false;
  }
  
  // Clear idle timer
  if (rustServerIdleTimer) {
    clearTimeout(rustServerIdleTimer);
    rustServerIdleTimer = null;
  }
  rustServerLastUsed = null;
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
