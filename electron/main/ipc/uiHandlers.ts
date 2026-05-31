import type {
  App,
  BrowserWindow,
  BrowserWindow as BrowserWindowInstance,
  IpcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  WebContents,
} from "electron";

type WindowState = {
  mainWindow: BrowserWindowInstance | null;
  inputWindow: BrowserWindowInstance | null;
};

type UIHandlersDeps = {
  ipcMain: IpcMain;
  BrowserWindow: typeof import("electron").BrowserWindow;
  app: App;
  process: NodeJS.Process;
  state: WindowState;
  registerGlobalShortcuts: (shortcuts: Record<string, unknown>) => void;
};

export function registerUIIPCHandlers({
  ipcMain,
  BrowserWindow,
  app,
  process,
  state,
  registerGlobalShortcuts,
}: UIHandlersDeps) {
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
        targetWindow.setIgnoreMouseEvents(ignore, options);
      }
    },
  );

  ipcMain.handle("window:frontend-ready", (event: IpcMainInvokeEvent) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);

    if (senderWindow && senderWindow === state.mainWindow) {
      console.log("[Main] Frontend ready - enabling pass-through monitoring");
      senderWindow.setIgnoreMouseEvents(true, { forward: true });
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
    (_event: IpcMainInvokeEvent, x: number, y: number) => {
      if (state.mainWindow) {
        state.mainWindow.setPosition(Math.floor(x), Math.floor(y));
      }
    },
  );

  ipcMain.handle("window:get-position", () => {
    if (state.mainWindow) {
      const [x, y] = state.mainWindow.getPosition();
      return { x, y };
    }
    return { x: 0, y: 0 };
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

  ipcMain.handle("window:get-size", () => {
    if (state.mainWindow) {
      const [width, height] = state.mainWindow.getSize();
      return { width, height };
    }
    return { width: 0, height: 0 };
  });

  ipcMain.handle("input-window:open", async () => {
    if (state.inputWindow) {
      state.inputWindow.setOpacity(1);
      state.inputWindow.setIgnoreMouseEvents(false);
      state.inputWindow.focus();
    }
  });

  ipcMain.handle("input-window:close", () => {
    if (state.inputWindow) {
      state.inputWindow.setOpacity(0);
      state.inputWindow.setIgnoreMouseEvents(true);
    }
  });

  ipcMain.handle("input-window:is-open", () => {
    return state.inputWindow && state.inputWindow.getOpacity() > 0;
  });

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

  ipcMain.on("chatInput:close", () => {
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
