export function createTrayShortcutsManager({
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
}) {
  function convertToElectronAccelerator(browserCombo) {
    if (!browserCombo) return null;

    const normalizedParts = browserCombo
      .split('+')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const lowerPart = part.toLowerCase();

        if (['ctrl', 'control', 'cmd', 'command', 'meta'].includes(lowerPart)) {
          return 'CommandOrControl';
        }
        if (lowerPart === 'option') {
          return 'Alt';
        }
        if (lowerPart === 'esc') {
          return 'Escape';
        }
        if (part.length === 1) {
          return part.toUpperCase();
        }

        return part;
      });

    const dedupedParts = [];
    for (const part of normalizedParts) {
      if (!dedupedParts.includes(part)) {
        dedupedParts.push(part);
      }
    }

    return dedupedParts.join('+');
  }

  function toggleAppVisibility() {
    if (!state.mainWindow) return;

    if (state.mainWindow.isVisible()) {
      state.mainWindow.hide();

      if (state.inputWindow && !state.inputWindow.isDestroyed()) {
        state.inputWindow.setOpacity(0);
        state.inputWindow.setIgnoreMouseEvents(true);
      }
      return;
    }

    state.mainWindow.show();
    state.mainWindow.focus();
  }

  function registerGlobalShortcuts(shortcuts) {
    globalShortcut.unregisterAll();

    if (!shortcuts || !shortcuts.enabled) {
      return;
    }

    if (shortcuts.openChat) {
      const accelerator = convertToElectronAccelerator(shortcuts.openChat);
      if (accelerator) {
        try {
          const registered = globalShortcut.register(accelerator, () => {
            if (state.mainWindow) {
              state.mainWindow.webContents.send('shortcut:open-chat');
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

    if (shortcuts.toggleMode) {
      const accelerator = convertToElectronAccelerator(shortcuts.toggleMode);
      if (accelerator) {
        try {
          const registered = globalShortcut.register(accelerator, () => {
            if (state.mainWindow) {
              state.mainWindow.webContents.send('shortcut:toggle-model');
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

    if (shortcuts.toggleVisibility) {
      const accelerator = convertToElectronAccelerator(shortcuts.toggleVisibility);
      if (accelerator) {
        try {
          const registered = globalShortcut.register(accelerator, () => {
            toggleAppVisibility();
          });

          if (registered) {
            console.log('Registered shortcut for App Visibility:', accelerator);
          } else {
            console.warn('Failed to register shortcut for App Visibility:', accelerator);
          }
        } catch (error) {
          console.error('Error registering App Visibility shortcut:', error);
        }
      }
    }
  }

  function createTray() {
    const isMac = process.platform === 'darwin';
    const trayIconCandidates = [
      ...(isMac ? [
        path.join(__dirname, '..', 'electron', 'assets', 'trayTemplate.png'),
        path.join(process.resourcesPath, 'app.asar', 'electron', 'assets', 'trayTemplate.png'),
        path.join(process.resourcesPath, 'electron', 'assets', 'trayTemplate.png'),
      ] : []),
      path.join(__dirname, '..', 'electron', 'assets', 'icon-32.png'),
      path.join(process.resourcesPath, 'app.asar', 'electron', 'assets', 'icon-32.png'),
      path.join(process.resourcesPath, 'electron', 'assets', 'icon-32.png'),
    ];

    const resolvedIconPath = trayIconCandidates.find((candidate) => fs.existsSync(candidate));

    try {
      if (resolvedIconPath && isMac) {
        const trayImage = nativeImage.createFromPath(resolvedIconPath);
        trayImage.setTemplateImage(true);
        state.tray = new Tray(trayImage);
      } else {
        state.tray = new Tray(resolvedIconPath || process.execPath);
      }
    } catch (error) {
      console.error('Failed to create tray icon:', error);
      return;
    }

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show VAssist',
        click: () => {
          if (state.mainWindow) {
            if (!state.mainWindow.isVisible()) {
              toggleAppVisibility();
            } else {
              state.mainWindow.show();
            }
          }
        }
      },
      {
        label: 'Hide VAssist',
        click: () => {
          if (state.mainWindow && state.mainWindow.isVisible()) {
            toggleAppVisibility();
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

    state.tray.setContextMenu(contextMenu);
    state.tray.setToolTip('VAssist');

    state.tray.on('double-click', () => {
      toggleAppVisibility();
    });
  }

  return {
    registerGlobalShortcuts,
    createTray,
    toggleAppVisibility,
  };
}
