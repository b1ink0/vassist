import type {
  App,
  BrowserWindow,
  BrowserWindow as BrowserWindowInstance,
  dialog as ElectronDialog,
  IpcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  WebContents,
} from "electron";
import type * as fsType from "fs";
import type * as pathType from "path";
import sharp from "sharp";
import type {
  DesktopMode,
  DesktopModeRequest,
  DesktopControlPlacement,
  LiveWallpaperInteraction,
} from "../windows/desktopMode";
import {
  isDesktopMode,
  isDesktopControlPlacement,
  isLiveWallpaperInteraction,
} from "../windows/desktopMode";
import { isBuiltInBackgroundId } from "../../../src/config/backgroundCatalog";

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

type UIHandlersDeps = {
  ipcMain: IpcMain;
  BrowserWindow: typeof import("electron").BrowserWindow;
  dialog: typeof ElectronDialog;
  screen: typeof import("electron").screen;
  fs: typeof fsType;
  path: typeof pathType;
  app: App;
  process: NodeJS.Process;
  state: WindowState;
  registerGlobalShortcuts: (shortcuts: Record<string, unknown>) => void;
  setNativeDevToolsEnabled: (enabled: boolean) => boolean;
  getNativeDevToolsEnabled: () => boolean;
  switchDesktopMode: (request: DesktopModeRequest | DesktopMode) => void;
};

export function registerUIIPCHandlers({
  ipcMain,
  BrowserWindow,
  dialog,
  screen,
  fs,
  path,
  app,
  process,
  state,
  registerGlobalShortcuts,
  setNativeDevToolsEnabled,
  getNativeDevToolsEnabled,
  switchDesktopMode,
}: UIHandlersDeps) {
  let assistantRuntimeReadyWindow: BrowserWindowInstance | null = null;
  let pendingAssistantRuntimeEvents: unknown[] = [];

  const backgroundImageTypes: Record<string, string> = {
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  const imagePreviewCache = new Map<
    string,
    { version: string; dataUrl: string }
  >();
  const imagePreviewWaiters: Array<() => void> = [];
  let activeImagePreviewJobs = 0;

  const acquireImagePreviewSlot = async () => {
    if (activeImagePreviewJobs >= 2) {
      await new Promise<void>((resolve) => imagePreviewWaiters.push(resolve));
      return;
    }
    activeImagePreviewJobs += 1;
  };

  const releaseImagePreviewSlot = () => {
    const next = imagePreviewWaiters.shift();
    if (next) {
      next();
    } else {
      activeImagePreviewJobs -= 1;
    }
  };

  const getBuiltInBackgroundPath = (
    backgroundId: string,
    preview = false,
  ) => {
    if (!isBuiltInBackgroundId(backgroundId)) {
      throw new Error("Unknown built-in background");
    }
    const relativePath = preview
      ? path.join("previews", `${backgroundId}.jpg`)
      : `${backgroundId}.webp`;
    if (app.isPackaged) {
      return path.join(process.resourcesPath, "backgrounds", relativePath);
    }

    const appPath = path.join(
      app.getAppPath(),
      "electron",
      "assets",
      "backgrounds",
      relativePath,
    );
    const workingDirectoryPath = path.join(
      process.cwd(),
      "electron",
      "assets",
      "backgrounds",
      relativePath,
    );
    return fs.existsSync(appPath) ? appPath : workingDirectoryPath;
  };

  const listBackgroundImages = async (folderPath: string) => {
    const entries = await fs.promises.readdir(folderPath, {
      withFileTypes: true,
    });
    const images = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isFile() &&
            Boolean(
              backgroundImageTypes[path.extname(entry.name).toLowerCase()],
            ),
        )
        .map(async (entry) => {
          const imagePath = path.join(folderPath, entry.name);
          try {
            const stats = await fs.promises.stat(imagePath);
            return stats.isFile() && stats.size <= 50 * 1024 * 1024
              ? { path: imagePath, name: entry.name }
              : null;
          } catch {
            return null;
          }
        }),
    );
    return images
      .filter(
        (image): image is { path: string; name: string } => image !== null,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  ipcMain.handle(
    "desktop-background:choose-images",
    async (_event: IpcMainInvokeEvent, multiple = true) => {
      try {
        const result = await dialog.showOpenDialog({
          properties: multiple
            ? ["openFile", "multiSelections"]
            : ["openFile"],
          title: "Choose Desktop Background Images",
          filters: [
            {
              name: "Images",
              extensions: ["jpg", "jpeg", "png", "webp", "gif"],
            },
          ],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { success: false, canceled: true };
        }
        return {
          success: true,
          paths: result.filePaths.filter((imagePath) =>
            Boolean(
              backgroundImageTypes[path.extname(imagePath).toLowerCase()],
            ),
          ),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle("desktop-background:choose-folder", async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
        title: "Choose Desktop Background Folder",
        buttonLabel: "Use Folder",
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      const folderPath = result.filePaths[0];
      if (!folderPath) return { success: false, canceled: true };
      return {
        success: true,
        folderPath,
        images: await listBackgroundImages(folderPath),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    "desktop-background:list-folder-images",
    async (_event: IpcMainInvokeEvent, folderPath: string) => {
      try {
        const stats = await fs.promises.stat(folderPath);
        if (!stats.isDirectory()) {
          throw new Error("The selected background path is not a folder");
        }
        return {
          success: true,
          images: await listBackgroundImages(folderPath),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    "desktop-background:read-image",
    async (_event: IpcMainInvokeEvent, imagePath: string) => {
      try {
        let resolvedPath = imagePath;
        if (imagePath.startsWith("builtin:")) {
          const backgroundId = imagePath.slice("builtin:".length);
          resolvedPath = getBuiltInBackgroundPath(backgroundId);
        }
        const mimeType =
          backgroundImageTypes[path.extname(resolvedPath).toLowerCase()];
        if (!mimeType) throw new Error("Unsupported background image type");
        const stats = await fs.promises.stat(resolvedPath);
        if (!stats.isFile()) throw new Error("Background image is unavailable");
        if (stats.size > 50 * 1024 * 1024) {
          throw new Error("Background images must be 50 MB or smaller");
        }
        const contents = await fs.promises.readFile(resolvedPath);
        return {
          success: true,
          dataUrl: `data:${mimeType};base64,${contents.toString("base64")}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    "desktop-background:read-image-preview",
    async (_event: IpcMainInvokeEvent, imagePath: string) => {
      let acquiredPreviewSlot = false;
      try {
        const resolvedPath = path.resolve(imagePath);
        const mimeType =
          backgroundImageTypes[path.extname(resolvedPath).toLowerCase()];
        if (!mimeType) throw new Error("Unsupported background image type");
        const stats = await fs.promises.stat(resolvedPath);
        if (!stats.isFile()) throw new Error("Background image is unavailable");
        if (stats.size > 50 * 1024 * 1024) {
          throw new Error("Background images must be 50 MB or smaller");
        }

        const version = `${stats.size}:${stats.mtimeMs}`;
        const cached = imagePreviewCache.get(resolvedPath);
        if (cached?.version === version) {
          imagePreviewCache.delete(resolvedPath);
          imagePreviewCache.set(resolvedPath, cached);
          return { success: true, dataUrl: cached.dataUrl };
        }

        await acquireImagePreviewSlot();
        acquiredPreviewSlot = true;
        const contents = await sharp(resolvedPath, {
          limitInputPixels: 40_000_000,
        })
          .rotate()
          .resize(480, 270, {
            fit: "cover",
            position: "centre",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 72 })
          .toBuffer();
        const dataUrl = `data:image/jpeg;base64,${contents.toString("base64")}`;
        imagePreviewCache.delete(resolvedPath);
        imagePreviewCache.set(resolvedPath, { version, dataUrl });
        while (imagePreviewCache.size > 64) {
          const oldestPath = imagePreviewCache.keys().next().value;
          if (oldestPath === undefined) break;
          imagePreviewCache.delete(oldestPath);
        }

        return { success: true, dataUrl };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        if (acquiredPreviewSlot) releaseImagePreviewSlot();
      }
    },
  );

  ipcMain.handle(
    "desktop-background:read-built-in-preview",
    async (_event: IpcMainInvokeEvent, backgroundId: string) => {
      try {
        const imagePath = getBuiltInBackgroundPath(backgroundId, true);
        const contents = await fs.promises.readFile(imagePath);
        return {
          success: true,
          dataUrl: `data:image/jpeg;base64,${contents.toString("base64")}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  const openInputWindow = () => {
    state.inputWindowOpen = true;

    if (state.inputWindow && !state.inputWindow.isDestroyed()) {
      state.inputWindow.setOpacity(1);
      state.inputWindow.show();
      state.inputWindow.setIgnoreMouseEvents(false);
      state.inputWindow.focus();
      if (state.uiThemeMode) {
        console.log(
          `[Main] Syncing desktop theme while opening input window: ${state.uiThemeMode}`,
        );
        state.inputWindow.webContents.send(
          "state:uiThemeMode",
          state.uiThemeMode,
        );
      }
    }
  };

  const closeInputWindow = () => {
    state.inputWindowOpen = false;

    if (state.inputWindow && !state.inputWindow.isDestroyed()) {
      state.inputWindow.setIgnoreMouseEvents(true);
      state.inputWindow.hide();
      state.inputWindow.setOpacity(0);
    }
  };

  ipcMain.handle("window:minimize", () => {
    if (state.mainWindow) state.mainWindow.minimize();
  });

  ipcMain.handle("window:maximize", () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMaximized()) {
        state.mainWindow.unmaximize();
      } else {
        state.mainWindow.maximize();
      }
    }
  });

  ipcMain.handle("window:close", () => {
    if (state.mainWindow) state.mainWindow.close();
  });

  ipcMain.handle("window:toggle-always-on-top", () => {
    if (state.mainWindow) {
      const isOnTop = state.mainWindow.isAlwaysOnTop();
      state.mainWindow.setAlwaysOnTop(!isOnTop);
      return !isOnTop;
    }
    return false;
  });

  ipcMain.handle(
    "window:set-ignore-mouse-events",
    (
      event: IpcMainInvokeEvent,
      ignore: boolean,
      options?: { forward?: boolean },
    ) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const targetWindow = senderWindow ?? state.mainWindow;

      if (targetWindow) {
        if (targetWindow === state.inputWindow && !targetWindow.isVisible()) {
          targetWindow.setIgnoreMouseEvents(true);
          return;
        }

        targetWindow.setIgnoreMouseEvents(ignore, options);
      }
    },
  );

  ipcMain.handle("window:frontend-ready", (event: IpcMainInvokeEvent) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);

    if (senderWindow && senderWindow === state.mainWindow) {
      console.log(
        "[Main] Frontend ready - renderer interactivity bridge active",
      );
      senderWindow.setIgnoreMouseEvents(false);
      senderWindow.moveTop();
    }
  });

  ipcMain.handle("app:version", () => app.getVersion());

  ipcMain.handle("app:platform", () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.versions,
    };
  });

  ipcMain.handle(
    "shortcuts:register",
    (_event: IpcMainInvokeEvent, shortcuts: Record<string, unknown>) => {
      registerGlobalShortcuts(shortcuts);
    },
  );

  ipcMain.handle(
    "window:set-position",
    (event: IpcMainInvokeEvent, x: number, y: number) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (senderWindow) {
        senderWindow.setPosition(Math.floor(x), Math.floor(y));
      }
    },
  );

  ipcMain.handle(
    "window:set-bounds",
    (
      event: IpcMainInvokeEvent,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (!senderWindow) return;

      senderWindow.setBounds({
        x: Math.floor(x),
        y: Math.floor(y),
        width: Math.floor(width),
        height: Math.floor(height),
      });
    },
  );

  ipcMain.handle("window:get-position", (event: IpcMainInvokeEvent) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow) {
      const [x, y] = senderWindow.getPosition();
      return { x, y };
    }
    return { x: 0, y: 0 };
  });

  ipcMain.handle("window:get-cursor-screen-point", () => {
    const { x, y } = screen.getCursorScreenPoint();
    return { x, y };
  });

  ipcMain.handle(
    "window:set-size",
    (event: IpcMainInvokeEvent, width: number, height: number) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (senderWindow) {
        const currentBounds = senderWindow.getBounds();

        const newY = currentBounds.y - (height - currentBounds.height);
        senderWindow.setBounds({
          x: currentBounds.x,
          y: newY,
          width: Math.floor(width),
          height: Math.floor(height),
        });
      }
    },
  );

  let windowScaleFactorWidth = 0.85;
  let windowScaleFactorHeight = 0.75;

  ipcMain.handle(
    "window:update-size-for-zoom",
    (event: IpcMainInvokeEvent, modelWidth: number, modelHeight: number) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (senderWindow) {
        const baseWidth = 400;
        const baseHeight = 525;
        const baseModelWidth = 300;
        const baseModelHeight = 500;

        const modelWidthDelta = modelWidth - baseModelWidth;
        const modelHeightDelta = modelHeight - baseModelHeight;

        const windowWidth = Math.max(
          baseWidth + modelWidthDelta * windowScaleFactorWidth,
          400,
        );
        const windowHeight = Math.max(
          baseHeight + modelHeightDelta * windowScaleFactorHeight,
          525,
        );

        const currentBounds = senderWindow.getBounds();
        const newY = currentBounds.y - (windowHeight - currentBounds.height);

        senderWindow.setBounds({
          x: currentBounds.x,
          y: newY,
          width: Math.floor(windowWidth),
          height: Math.floor(windowHeight),
        });
      }
    },
  );

  ipcMain.handle(
    "window:set-scale-factor",
    (
      _event: IpcMainInvokeEvent,
      newScaleFactorWidth: number,
      newScaleFactorHeight?: number,
    ) => {
      windowScaleFactorWidth = newScaleFactorWidth;
      if (newScaleFactorHeight !== undefined) {
        windowScaleFactorHeight = newScaleFactorHeight;
      }
      console.log(
        `Scale factors updated - Width: ${windowScaleFactorWidth}, Height: ${windowScaleFactorHeight}`,
      );
      return { width: windowScaleFactorWidth, height: windowScaleFactorHeight };
    },
  );

  ipcMain.handle("window:get-scale-factor", () => {
    return { width: windowScaleFactorWidth, height: windowScaleFactorHeight };
  });

  ipcMain.handle("window:get-size", (event: IpcMainInvokeEvent) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow) {
      const [width, height] = senderWindow.getSize();
      return { width, height };
    }
    return { width: 0, height: 0 };
  });

  ipcMain.handle("window:get-desktop-mode", () => {
    return {
      mode: state.desktopMode,
      liveWallpaperInteraction: state.liveWallpaperInteraction,
      controlPlacement: state.controlPlacement,
    };
  });

  ipcMain.handle(
    "window:set-desktop-mode",
    (event: IpcMainInvokeEvent, request: DesktopModeRequest | DesktopMode) => {
      const normalizedRequest =
        typeof request === "string" ? { mode: request } : request;

      if (!isDesktopMode(normalizedRequest?.mode)) {
        throw new Error(
          `Unsupported desktop mode: ${String(normalizedRequest?.mode)}`,
        );
      }

      if (
        normalizedRequest.liveWallpaperInteraction !== undefined &&
        !isLiveWallpaperInteraction(normalizedRequest.liveWallpaperInteraction)
      ) {
        throw new Error(
          `Unsupported live wallpaper interaction: ${String(normalizedRequest.liveWallpaperInteraction)}`,
        );
      }

      if (
        normalizedRequest.controlPlacement !== undefined &&
        !isDesktopControlPlacement(normalizedRequest.controlPlacement)
      ) {
        throw new Error(
          `Unsupported desktop control placement: ${String(normalizedRequest.controlPlacement)}`,
        );
      }

      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (senderWindow && senderWindow !== state.mainWindow) return;

      switchDesktopMode(normalizedRequest);
    },
  );

  ipcMain.handle(
    "window:set-native-devtools-enabled",
    (_event: IpcMainInvokeEvent, enabled: boolean) => {
      return setNativeDevToolsEnabled(enabled);
    },
  );

  ipcMain.handle("window:get-native-devtools-enabled", () => {
    return getNativeDevToolsEnabled();
  });

  ipcMain.handle("input-window:open", () => {
    openInputWindow();
  });

  ipcMain.handle("input-window:close", () => {
    closeInputWindow();
  });

  ipcMain.handle("input-window:is-open", () => {
    return Boolean(
      state.inputWindowOpen &&
      state.inputWindow &&
      !state.inputWindow.isDestroyed() &&
      state.inputWindow.isVisible(),
    );
  });

  ipcMain.on("desktop:toggle-chat-window", (event: IpcMainEvent) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow || senderWindow === state.mainWindow) return;
    if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

    state.mainWindow.show();
    state.mainWindow.webContents.send("desktop:toggle-chat");
  });

  ipcMain.on(
    "desktop:chat-visibility",
    (event: IpcMainEvent, payload: unknown) => {
      if (
        !state.mainWindow ||
        state.mainWindow.isDestroyed() ||
        event.sender !== state.mainWindow.webContents ||
        state.controlPlacement !== "detached"
      ) {
        return;
      }

      const visible =
        payload &&
        typeof payload === "object" &&
        "visible" in payload &&
        typeof payload.visible === "boolean"
          ? payload.visible
          : null;

      if (visible === null) {
        return;
      }

      state.mainWindow.showInactive();

      if (state.avatarWindow && !state.avatarWindow.isDestroyed()) {
        state.avatarWindow.webContents.send("desktop:chat-visibility", {
          visible,
        });
      }
    },
  );

  ipcMain.on(
    "desktop:assistant-runtime",
    (event: IpcMainEvent, payload: unknown) => {
      if (
        !state.mainWindow ||
        state.mainWindow.isDestroyed() ||
        event.sender !== state.mainWindow.webContents ||
        !state.avatarWindow ||
        state.avatarWindow.isDestroyed() ||
        state.controlPlacement !== "detached"
      ) {
        return;
      }

      if (assistantRuntimeReadyWindow !== state.avatarWindow) {
        if (assistantRuntimeReadyWindow !== null) {
          pendingAssistantRuntimeEvents = [];
        }
        pendingAssistantRuntimeEvents = [
          ...pendingAssistantRuntimeEvents,
          payload,
        ].slice(-32);
        return;
      }

      state.avatarWindow.webContents.send("desktop:assistant-runtime", payload);
    },
  );

  ipcMain.on("desktop:assistant-runtime-ready", (event: IpcMainEvent) => {
    if (
      !state.avatarWindow ||
      state.avatarWindow.isDestroyed() ||
      event.sender !== state.avatarWindow.webContents ||
      state.controlPlacement !== "detached"
    ) {
      return;
    }

    assistantRuntimeReadyWindow = state.avatarWindow;
    const pendingEvents = pendingAssistantRuntimeEvents;
    pendingAssistantRuntimeEvents = [];

    for (const payload of pendingEvents) {
      if (!state.avatarWindow.isDestroyed()) {
        state.avatarWindow.webContents.send(
          "desktop:assistant-runtime",
          payload,
        );
      }
    }
  });

  ipcMain.on(
    "state:desktopUIConfig",
    (event: IpcMainEvent, config: unknown) => {
      if (!config || typeof config !== "object") return;

      for (const target of [
        state.mainWindow,
        state.avatarWindow,
        state.inputWindow,
      ]) {
        if (
          target &&
          !target.isDestroyed() &&
          target.webContents !== event.sender
        ) {
          target.webContents.send("state:desktopUIConfig", config);
        }
      }
    },
  );

  ipcMain.on("chatInput:send", (_event: IpcMainEvent, data: unknown) => {
    if (state.mainWindow && state.mainWindow.webContents) {
      state.mainWindow.webContents.send("chatInput:send", data);
    }
  });

  ipcMain.on(
    "chatInput:setPendingDropData",
    (_event: IpcMainEvent, data: unknown) => {
      if (state.mainWindow && state.mainWindow.webContents) {
        state.mainWindow.webContents.send("chatInput:setPendingDropData", data);
      }
    },
  );

  ipcMain.on(
    "chatInput:thinkingChanged",
    (event: IpcMainEvent, data: unknown) => {
      const payload = data as { section?: unknown; enabled?: unknown } | null;
      const validSections = new Set([
        "chromeAi",
        "openai",
        "ollama",
        "android-local",
        "desktop-local",
      ]);
      const sentByInputWindow =
        state.inputWindow &&
        !state.inputWindow.isDestroyed() &&
        event.sender === state.inputWindow.webContents;
      const validPayload =
        payload &&
        typeof payload.section === "string" &&
        validSections.has(payload.section) &&
        typeof payload.enabled === "boolean";

      if (
        sentByInputWindow &&
        validPayload &&
        state.mainWindow &&
        !state.mainWindow.isDestroyed()
      ) {
        state.mainWindow.webContents.send("chatInput:thinkingChanged", payload);
      }
    },
  );

  ipcMain.on("chatInput:close", () => {
    closeInputWindow();

    if (state.mainWindow && state.mainWindow.webContents) {
      state.mainWindow.webContents.send("chatInput:close");
    }
  });

  ipcMain.on("chatInput:toggleQuickPanel", () => {
    if (state.mainWindow && state.mainWindow.webContents) {
      state.mainWindow.webContents.send("chatInput:toggleQuickPanel");
    }
  });

  ipcMain.on(
    "state:isChatInputVisible",
    (_event: IpcMainEvent, visible: boolean) => {
      if (state.inputWindow && state.inputWindow.webContents) {
        state.inputWindow.webContents.send("state:isChatInputVisible", visible);
      }
    },
  );

  ipcMain.on("state:uiThemeMode", (event: IpcMainEvent, mode: unknown) => {
    if (mode !== "adaptive" && mode !== "light" && mode !== "dark") {
      console.warn(
        `[Main] Ignored invalid desktop theme mode: ${String(mode)}`,
      );
      return;
    }

    state.uiThemeMode = mode;
    console.log(
      `[Main] Desktop theme changed; forwarding to input window: ${mode}`,
    );

    if (
      state.inputWindow &&
      !state.inputWindow.isDestroyed() &&
      event.sender !== state.inputWindow.webContents
    ) {
      state.inputWindow.webContents.send("state:uiThemeMode", mode);
    }
  });

  ipcMain.on("state:uiThemeReady", (event: IpcMainEvent) => {
    if (
      !state.uiThemeMode ||
      !state.inputWindow ||
      state.inputWindow.isDestroyed() ||
      event.sender !== state.inputWindow.webContents
    ) {
      return;
    }

    console.log(
      `[Main] Input window requested current desktop theme: ${state.uiThemeMode}`,
    );
    event.sender.send("state:uiThemeMode", state.uiThemeMode);
  });

  ipcMain.on("state:pendingDropData", (_event: IpcMainEvent, data: unknown) => {
    if (state.inputWindow && state.inputWindow.webContents) {
      state.inputWindow.webContents.send("state:pendingDropData", data);
    }
  });

  ipcMain.on("state:micDevices", (_event: IpcMainEvent, data: unknown) => {
    if (state.inputWindow && state.inputWindow.webContents) {
      state.inputWindow.webContents.send("state:micDevices", data);
    }
  });

  ipcMain.on("mic:requestState", () => {
    if (state.mainWindow && state.mainWindow.webContents) {
      state.mainWindow.webContents.send("mic:requestState");
    }
  });

  ipcMain.on("state:selectedMicId", (event: IpcMainEvent, deviceId: string) => {
    if (
      state.mainWindow &&
      state.mainWindow.webContents &&
      event.sender !== state.mainWindow.webContents
    ) {
      state.mainWindow.webContents.send("state:selectedMicId", deviceId);
    }
    if (
      state.inputWindow &&
      state.inputWindow.webContents &&
      event.sender !== state.inputWindow.webContents
    ) {
      state.inputWindow.webContents.send("state:selectedMicId", deviceId);
    }
  });

  ipcMain.on("state:cameraDevices", (_event: IpcMainEvent, data: unknown) => {
    if (state.inputWindow && state.inputWindow.webContents) {
      state.inputWindow.webContents.send("state:cameraDevices", data);
    }
  });

  ipcMain.on("state:screenShare", (_event: IpcMainEvent, data: unknown) => {
    if (state.inputWindow && state.inputWindow.webContents) {
      state.inputWindow.webContents.send("state:screenShare", data);
    }
  });

  ipcMain.on(
    "camera:selectDevice",
    (_event: IpcMainEvent, deviceId: string) => {
      if (state.mainWindow && state.mainWindow.webContents) {
        state.mainWindow.webContents.send("camera:selectDevice", deviceId);
      }
    },
  );

  ipcMain.on("camera:toggle", () => {
    if (state.mainWindow && state.mainWindow.webContents) {
      state.mainWindow.webContents.send("camera:toggle");
    }
  });

  ipcMain.on("screenShare:toggle", () => {
    if (state.mainWindow && state.mainWindow.webContents) {
      state.mainWindow.webContents.send("screenShare:toggle");
    }
  });

  ipcMain.on(
    "state:selectedCameraId",
    (event: IpcMainEvent, deviceId: string) => {
      if (
        state.mainWindow &&
        state.mainWindow.webContents &&
        event.sender !== state.mainWindow.webContents
      ) {
        state.mainWindow.webContents.send("state:selectedCameraId", deviceId);
      }
      if (
        state.inputWindow &&
        state.inputWindow.webContents &&
        event.sender !== state.inputWindow.webContents
      ) {
        state.inputWindow.webContents.send("state:selectedCameraId", deviceId);
      }
    },
  );

  ipcMain.on(
    "chatInput:voiceTranscription",
    (_event: IpcMainEvent, data: unknown) => {
      if (state.mainWindow && state.mainWindow.webContents) {
        state.mainWindow.webContents.send("chatInput:voiceTranscription", data);
      }
    },
  );

  ipcMain.on(
    "voice:transcriptionReceived",
    (_event: IpcMainEvent, text: string) => {
      if (state.inputWindow && state.inputWindow.webContents) {
        state.inputWindow.webContents.send("voice:transcriptionReceived", text);
      }
    },
  );

  ipcMain.on(
    "stt:transcriptionReceived",
    (_event: IpcMainEvent, text: string) => {
      if (state.inputWindow && state.inputWindow.webContents) {
        state.inputWindow.webContents.send("stt:transcriptionReceived", text);
      }
    },
  );

  ipcMain.on(
    "chatInput:voiceMode",
    (_event: IpcMainEvent, isActive: boolean) => {
      if (state.mainWindow && state.mainWindow.webContents) {
        state.mainWindow.webContents.send("chatInput:voiceMode", isActive);
      }
    },
  );

  ipcMain.on("chatInput:micToggle", () => {
    if (state.mainWindow && state.mainWindow.webContents) {
      state.mainWindow.webContents.send("chatInput:micToggle");
    }
  });

  ipcMain.on("voice:interrupt", () => {
    if (state.mainWindow && state.mainWindow.webContents) {
      state.mainWindow.webContents.send("voice:interrupt");
    }
  });

  ipcMain.on("voice:vadSpeechDetected", () => {
    if (state.mainWindow && state.mainWindow.webContents) {
      state.mainWindow.webContents.send("voice:vadSpeechDetected");
    }
  });

  ipcMain.on(
    "state:voiceState",
    (_event: IpcMainEvent, stateValue: unknown) => {
      if (state.inputWindow && state.inputWindow.webContents) {
        state.inputWindow.webContents.send("state:voiceState", stateValue);
      }
    },
  );

  ipcMain.on("state:sttRecording", (_event: IpcMainEvent, payload: unknown) => {
    if (state.inputWindow && state.inputWindow.webContents) {
      state.inputWindow.webContents.send("state:sttRecording", payload);
    }
  });
}
