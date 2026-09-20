import type {
  App,
  BrowserWindow,
  GlobalShortcut,
  Tray as ElectronTray,
} from "electron";
import type * as fsType from "fs";
import type * as pathType from "path";
import type {
  DesktopControlPlacement,
  DesktopMode,
  DesktopModeRequest,
  LiveWallpaperInteraction,
} from "./desktopMode";

type WindowState = {
  mainWindow: BrowserWindow | null;
  inputWindow: BrowserWindow | null;
  inputWindowOpen: boolean;
  desktopMode: DesktopMode;
  liveWallpaperInteraction: LiveWallpaperInteraction;
  controlPlacement: DesktopControlPlacement;
  tray: ElectronTray | null;
};

type ShortcutConfig = {
  enabled?: boolean;
  openChat?: string;
  toggleMode?: string;
  toggleVisibility?: string;
};

type TrayShortcutsDeps = {
  app: App & { isQuitting?: boolean };
  globalShortcut: GlobalShortcut;
  Tray: typeof import("electron").Tray;
  Menu: typeof import("electron").Menu;
  screen: typeof import("electron").screen;
  nativeImage: typeof import("electron").nativeImage;
  fs: typeof fsType;
  path: typeof pathType;
  process: NodeJS.Process;
  __dirname: string;
  state: WindowState;
  requestDesktopMode: (request: DesktopModeRequest | DesktopMode) => void;
};

export function createTrayShortcutsManager({
  app,
  globalShortcut,
  Tray,
  Menu,
  screen,
  nativeImage,
  fs,
  path,
  process,
  __dirname,
  state,
  requestDesktopMode,
}: TrayShortcutsDeps) {
  function convertToElectronAccelerator(
    browserCombo: string | undefined | null,
  ) {
    if (!browserCombo) return null;

    const normalizedParts = browserCombo
      .split("+")
      .map((part: string) => part.trim())
      .filter(Boolean)
      .map((part: string) => {
        const lowerPart = part.toLowerCase();

        if (["ctrl", "control", "cmd", "command", "meta"].includes(lowerPart)) {
          return "CommandOrControl";
        }
        if (lowerPart === "option") {
          return "Alt";
        }
        if (lowerPart === "esc") {
          return "Escape";
        }
        if (part.length === 1) {
          return part.toUpperCase();
        }

        return part;
      });

    const dedupedParts: string[] = [];
    for (const part of normalizedParts) {
      if (!dedupedParts.includes(part)) {
        dedupedParts.push(part);
      }
    }

    return dedupedParts.join("+");
  }

  function toggleAppVisibility() {
    if (!state.mainWindow) return;

    if (state.mainWindow.isVisible()) {
      state.mainWindow.hide();

      if (state.inputWindow && !state.inputWindow.isDestroyed()) {
        state.inputWindow.setIgnoreMouseEvents(true);
        state.inputWindow.hide();
        state.inputWindow.setOpacity(0);
      }
      return;
    }

    state.mainWindow.show();
    state.mainWindow.focus();

    if (
      state.inputWindowOpen &&
      state.inputWindow &&
      !state.inputWindow.isDestroyed()
    ) {
      state.inputWindow.setOpacity(1);
      state.inputWindow.show();
      state.inputWindow.setIgnoreMouseEvents(false);
    }
  }

  function resetMainWindowPosition() {
    const mainWindow = state.mainWindow;
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const { workArea } = screen.getPrimaryDisplay();
    const [windowWidth = 0, windowHeight = 0] = mainWindow.getSize();
    const x = Math.round(workArea.x + (workArea.width - windowWidth) / 2);
    const y = Math.round(workArea.y + (workArea.height - windowHeight) / 2);

    mainWindow.setPosition(x, y);
    mainWindow.show();
    mainWindow.focus();
  }

  function registerGlobalShortcuts(shortcuts: ShortcutConfig | undefined) {
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
              state.mainWindow.webContents.send("shortcut:open-chat");
            }
          });

          if (registered) {
            console.log("Registered shortcut for Open Chat:", accelerator);
          } else {
            console.warn(
              "Failed to register shortcut for Open Chat:",
              accelerator,
            );
          }
        } catch (error) {
          console.error("Error registering Open Chat shortcut:", error);
        }
      }
    }

    if (shortcuts.toggleMode) {
      const accelerator = convertToElectronAccelerator(shortcuts.toggleMode);
      if (accelerator) {
        try {
          const registered = globalShortcut.register(accelerator, () => {
            if (state.mainWindow) {
              state.mainWindow.webContents.send("shortcut:toggle-model");
            }
          });

          if (registered) {
            console.log("Registered shortcut for Toggle Model:", accelerator);
          } else {
            console.warn(
              "Failed to register shortcut for Toggle Model:",
              accelerator,
            );
          }
        } catch (error) {
          console.error("Error registering Toggle Model shortcut:", error);
        }
      }
    }

    if (shortcuts.toggleVisibility) {
      const accelerator = convertToElectronAccelerator(
        shortcuts.toggleVisibility,
      );
      if (accelerator) {
        try {
          const registered = globalShortcut.register(accelerator, () => {
            toggleAppVisibility();
          });

          if (registered) {
            console.log("Registered shortcut for App Visibility:", accelerator);
          } else {
            console.warn(
              "Failed to register shortcut for App Visibility:",
              accelerator,
            );
          }
        } catch (error) {
          console.error("Error registering App Visibility shortcut:", error);
        }
      }
    }
  }

  function createTray() {
    const isMac = process.platform === "darwin";
    const trayIconCandidates = [
      ...(isMac
        ? [
            path.join(
              __dirname,
              "..",
              "electron",
              "assets",
              "trayTemplate.png",
            ),
            path.join(
              process.resourcesPath,
              "app.asar",
              "electron",
              "assets",
              "trayTemplate.png",
            ),
            path.join(
              process.resourcesPath,
              "electron",
              "assets",
              "trayTemplate.png",
            ),
          ]
        : []),
      path.join(__dirname, "..", "electron", "assets", "icon-32.png"),
      path.join(
        process.resourcesPath,
        "app.asar",
        "electron",
        "assets",
        "icon-32.png",
      ),
      path.join(process.resourcesPath, "electron", "assets", "icon-32.png"),
    ];

    const resolvedIconPath = trayIconCandidates.find((candidate) =>
      fs.existsSync(candidate),
    );

    try {
      if (resolvedIconPath && isMac) {
        const trayImage = nativeImage.createFromPath(resolvedIconPath);
        trayImage.setTemplateImage(true);
        state.tray = new Tray(trayImage);
      } else {
        state.tray = new Tray(resolvedIconPath || process.execPath);
      }
    } catch (error) {
      console.error("Failed to create tray icon:", error);
      return;
    }

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show VAssist",
        click: () => {
          if (state.mainWindow) {
            if (!state.mainWindow.isVisible()) {
              toggleAppVisibility();
            } else {
              state.mainWindow.show();
            }
          }
        },
      },
      {
        label: "Hide VAssist",
        click: () => {
          if (state.mainWindow && state.mainWindow.isVisible()) {
            toggleAppVisibility();
          }
        },
      },
      {
        label: "Reset Window Position",
        click: () => {
          resetMainWindowPosition();
          requestDesktopMode("app");
        },
      },
      {
        label: "Modes",
        submenu: [
          {
            label: "Floating App",
            click: () => requestDesktopMode("floating-app"),
          },
          {
            label: "App Mode",
            click: () => requestDesktopMode("app"),
          },
          {
            label: "Live Wallpaper",
            submenu: [
              {
                label: "Non-interactive",
                click: () =>
                  requestDesktopMode({
                    mode: "live-wallpaper",
                    liveWallpaperInteraction: "non-interactive",
                  }),
              },
              {
                label: "Interactive",
                click: () =>
                  requestDesktopMode({
                    mode: "live-wallpaper",
                    liveWallpaperInteraction: "interactive",
                  }),
              },
            ],
          },
        ],
      },
      {
        label: "Controls",
        submenu: [
          {
            label: "Attached",
            type: "radio",
            checked: state.controlPlacement === "attached",
            click: () =>
              requestDesktopMode({
                mode: state.desktopMode,
                liveWallpaperInteraction: state.liveWallpaperInteraction,
                controlPlacement: "attached",
              }),
          },
          {
            label: "Detached",
            type: "radio",
            checked: state.controlPlacement === "detached",
            click: () =>
              requestDesktopMode({
                mode: state.desktopMode,
                liveWallpaperInteraction: state.liveWallpaperInteraction,
                controlPlacement: "detached",
              }),
          },
        ],
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

    state.tray.setContextMenu(contextMenu);
    state.tray.setToolTip("VAssist");

    state.tray.on("double-click", () => {
      toggleAppVisibility();
    });
  }

  return {
    registerGlobalShortcuts,
    createTray,
    toggleAppVisibility,
  };
}
