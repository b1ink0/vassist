/**
 * Electron Main Process
 * Creates a transparent window for the desktop app
 */

import { app, BrowserWindow, ipcMain, screen, Tray, Menu, globalShortcut, protocol } from 'electron';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

let mainWindow;
let inputWindow;
let tray = null;
let gptsovitsProcess = null;

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
  
  // Start GPT-SoVITS TTS server
  startGPTSoVITSServer();
  
  // Server will be started by frontend via 'server:start' IPC after config is loaded
  console.log('[Server] Waiting for frontend to initialize...');

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
  
  stopGPTSoVITSServer();
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

// ============================================
// Desktop AI Server Management
// ============================================
// Server - Native addon integration
// ============================================

let server = null;

// Server IPC handlers
ipcMain.handle('server:start', async (event, config = {}) => {
  console.log('[Server] Starting with config:', config);
  
  if (!server) {
    try {
      const serverPath = process.env.VITE_DEV_SERVER_URL
        ? path.join(process.cwd(), 'electron', 'server', 'build', 'Release', 'server.node')
        : path.join(app.getAppPath(), 'server', 'build', 'Release', 'server.node');
      
      if (!fs.existsSync(serverPath)) {
        const buildMsg = 'Native server not found. Run: bun run build:server';
        console.error('[Server]', buildMsg);
        return { success: false, error: buildMsg };
      }
      
      console.log('[Server] Loading addon from:', serverPath);
      const addon = require(serverPath);
      server = new addon.Server();
      console.log('[Server] Addon loaded successfully');
    } catch (error) {
      console.error('[Server] Failed to load addon:', error);
      
      // Provide helpful error message for missing CUDA DLLs
      if (error.code === 'ERR_DLOPEN_FAILED') {
        const helpMsg = 'Missing CUDA runtime libraries. Install CUDA Toolkit 12.x or rebuild without CUDA (CPU-only).';
        console.error('[Server]', helpMsg);
        return { success: false, error: helpMsg };
      }
      
      return { success: false, error: error.message };
    }
  }

  try {
    // Build server options from config
    const options = {
      port: 11438
    };
    
    // Add LLM model path if specified
    if (config.model) {
      const llmPath = path.join(getModelsDir(), config.model);
      if (fs.existsSync(llmPath)) {
        options.llmModel = llmPath;
        console.log('[Server] LLM model:', config.model);
      } else {
        console.warn('[Server] Model not found:', config.model);
      }
    }
    
    // Add STT model if exists
    const devSttPath = path.join(__dirname, 'server', 'models', 'whisper-base.bin');
    const prodSttPath = path.join(app.getPath('userData'), 'models', 'whisper-base.bin');
    const sttPath = fs.existsSync(devSttPath) ? devSttPath : prodSttPath;
    
    if (fs.existsSync(sttPath)) {
      options.sttModel = sttPath;
      console.log('[Server] STT model found');
    }
    
    const success = server.start(options);
    if (success) {
      const status = server.getStatus();
      console.log('[Server] Started:', status);
      return { success: true, ...status };
    }
    return { success: false, error: 'Failed to start' };
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
    const success = server.stop();
    console.log('[Server] Stopped');
    return { success };
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
// LLM Model Management
// ============================================

// Get models directory (works in both dev and production)
function getModelsDir() {
  if (process.env.VITE_DEV_SERVER_URL) {
    // Development: use electron/server/models
    return path.join(__dirname, 'server', 'models');
  } else {
    // Production: use app data directory
    return path.join(app.getPath('userData'), 'models');
  }
}

// List models in models directory
ipcMain.handle('llm:list-models', async () => {
  try {
    const modelsDir = getModelsDir();
    
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
ipcMain.handle('llm:pull-model', async (event, modelName) => {
  try {
    console.log('[LLM] Pulling model from Ollama registry:', modelName);
    const modelsDir = getModelsDir();
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    // Parse model name (e.g., "llama3.2:3b" -> "library/llama3.2", "3b")
    const [model, tag = 'latest'] = modelName.split(':');
    const namespace = model.includes('/') ? model : `library/${model}`;

    event.sender.send('llm:download-progress', { status: 'Pulling manifest...', percent: 0 });

    // 1. Fetch manifest from registry.ollama.ai
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
      status: `Found ${layers.length} layers`, 
      percent: 5 
    });

    // 2. Download each layer (model files are in layers)
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const digest = layer.digest;
      const size = layer.size;

      event.sender.send('llm:download-progress', {
        status: `Downloading layer ${i + 1}/${layers.length}`,
        percent: 5 + (i / layers.length) * 85
      });

      const blobUrl = `https://registry.ollama.ai/v2/${namespace}/blobs/${digest}`;
      const blobRes = await fetch(blobUrl);

      if (!blobRes.ok) {
        throw new Error(`Failed to download layer: ${digest}`);
      }

      // Save to models directory with digest as filename
      const fileName = `${model.replace('/', '_')}-${tag}-${digest.replace('sha256:', '').substring(0, 12)}.gguf`;
      const filePath = path.join(modelsDir, fileName);
      
      const buffer = await blobRes.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(buffer));

      event.sender.send('llm:download-progress', {
        status: `Downloaded ${fileName}`,
        percent: 5 + ((i + 1) / layers.length) * 85
      });
    }

    event.sender.send('llm:download-progress', { status: 'Model downloaded successfully', percent: 100 });

    return { 
      success: true,
      note: `Downloaded ${layers.length} files from Ollama registry`
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
    
    // Handle Hugging Face URLs
    if (url.includes('huggingface.co') && url.includes('/resolve/')) {
      filename = urlParts[urlParts.length - 1];
    }

    if (!filename.endsWith('.gguf')) {
      throw new Error('Invalid file: must be a .gguf model');
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

  const fileStream = fs.createWriteStream(filePath);
  
  response.pipe(fileStream);

  response.on('data', (chunk) => {
    downloadedSize += chunk.length;
    const percent = Math.round((downloadedSize / totalSize) * 100);
    event.sender.send('llm:download-progress', {
      percent,
      status: `Downloading... ${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB`
    });
  });

  fileStream.on('finish', () => {
    fileStream.close();
    resolve({ success: true, filename: path.basename(filePath) });
  });

  fileStream.on('error', (err) => {
    fs.unlink(filePath, () => {});
    reject(new Error(`File write error: ${err.message}`));
  });
}

// Delete model
ipcMain.handle('llm:delete-model', async (event, filename) => {
  try {
    const modelsDir = getModelsDir();
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

/**
 * GPT-SoVITS TTS Server Management
 */
function startGPTSoVITSServer() {
  if (gptsovitsProcess) {
    console.log('[GPT-SoVITS] Server already running');
    return;
  }

  try {
    const gptsovitsDir = process.env.VITE_DEV_SERVER_URL
      ? path.join(process.cwd(), 'electron', 'server', 'gpt-sovits')
      : path.join(app.getAppPath(), 'server', 'gpt-sovits');
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
