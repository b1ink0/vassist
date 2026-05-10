import type {
  BrowserWindow,
  DesktopCapturer,
  DesktopCapturerSource,
  DisplayMediaRequestHandlerHandlerRequest,
  IpcMainEvent,
  IpcMain,
  Protocol,
  SourcesOptions,
  WebFrameMain,
  WebContents,
} from "electron";
import type * as fsType from "fs";
import type * as pathType from "path";

type DesktopPermissionsDeps = {
  session: typeof import("electron").session;
  desktopCapturer: DesktopCapturer;
  BrowserWindow: typeof import("electron").BrowserWindow;
  ipcMain: IpcMain;
  path: typeof pathType;
  __dirname: string;
  devServerUrl: string | undefined;
  maybeOpenDevTools: (window: BrowserWindow | null | undefined) => void;
};

type AppProtocolDeps = {
  protocol: Protocol;
  fs: typeof fsType;
  path: typeof pathType;
  __dirname: string;
};

export function registerPrivilegedSchemes(protocol: Protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export function setupDesktopPermissions({
  session,
  desktopCapturer,
  BrowserWindow,
  ipcMain,
  path,
  __dirname,
  devServerUrl,
  maybeOpenDevTools,
}: DesktopPermissionsDeps) {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents: WebContents, permission, callback) => {
      if (permission === "media" || permission === "display-capture") {
        callback(true);
      } else {
        callback(false);
      }
    },
  );

  session.defaultSession.setPermissionCheckHandler(
    (
      _webContents: WebContents | null,
      permission,
      _requestingOrigin,
      _details,
    ) => {
      if (permission === "media") {
        return true;
      }
      return false;
    },
  );

  const sourceOptions: SourcesOptions = {
    types: ["screen", "window"],
    thumbnailSize: { width: 1920, height: 1080 },
  };

  const setOtherWindowsInteractive = (
    excludedWindow?: BrowserWindow | null,
  ) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window === excludedWindow || window.isDestroyed()) {
        continue;
      }

      window.setIgnoreMouseEvents(false);
    }
  };

  const mediaHandler = (
    _request: DisplayMediaRequestHandlerHandlerRequest,
    callback: (result: {
      video?: DesktopCapturerSource;
      audio?: "loopback" | "loopbackWithMute" | WebFrameMain;
    }) => void,
  ) => {
    desktopCapturer
      .getSources(sourceOptions)
      .then((sources) => {
        if (sources.length === 0) {
          (callback as unknown as (result: null) => void)(null);
          return;
        }

        let callbackCalled = false;
        let cleanupDone = false;

        const safeCallback = (result: {
          video?: DesktopCapturerSource;
          audio?: "loopback" | "loopbackWithMute" | WebFrameMain;
        }) => {
          if (!callbackCalled) {
            callbackCalled = true;
            callback(result);
          }
        };

        const abortCallback = () => {
          if (!callbackCalled) {
            callbackCalled = true;
            (callback as unknown as (result: null) => void)(null);
          }
        };

        let pickerWindow: BrowserWindow | null = new BrowserWindow({
          width: 900,
          height: 600,
          resizable: false,
          minimizable: false,
          maximizable: false,
          alwaysOnTop: true,
          autoHideMenuBar: true,
          frame: false,
          transparent: true,
          backgroundColor: "#00000000",
          show: false,
          webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            devTools: true,
          },
        });

        maybeOpenDevTools(pickerWindow);

        if (devServerUrl) {
          pickerWindow.loadURL(
            devServerUrl + "/electron/index.html?mode=screenPicker",
          );
        } else {
          pickerWindow.loadURL("app://./electron/index.html?mode=screenPicker");
        }

        pickerWindow.once("ready-to-show", () => {
          pickerWindow?.setIgnoreMouseEvents(false);
          setOtherWindowsInteractive(pickerWindow);
          pickerWindow?.show();
        });

        const sourcesData = sources.map((source) => ({
          id: source.id,
          name: source.name,
          thumbnail: source.thumbnail.toDataURL(),
          appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
        }));

        console.log("Picker: Total sources:", sources.length);
        console.log("Picker: Serialized sources:", sourcesData.length);

        const handlePickerReady = () => {
          console.log("Picker ready, sending sources...");
          if (pickerWindow && pickerWindow.webContents) {
            pickerWindow.webContents.send("picker:sources", sourcesData);
          }
        };

        const handlePickerSelect = (_event: IpcMainEvent, sourceId: string) => {
          console.log("Picker: Source selected:", sourceId);
          const selectedSource = sources.find((s) => s.id === sourceId);
          if (selectedSource) {
            safeCallback({ video: selectedSource, audio: "loopback" });
          } else {
            abortCallback();
          }
          cleanup();
        };

        const handlePickerCancel = () => {
          console.log("Picker: Cancelled");
          abortCallback();
          cleanup();
        };

        const cleanup = () => {
          if (cleanupDone) return;
          cleanupDone = true;

          console.log("Picker: Cleanup started");
          ipcMain.removeListener("picker:ready", handlePickerReady);
          ipcMain.removeListener("picker:select", handlePickerSelect);
          ipcMain.removeListener("picker:cancel", handlePickerCancel);

          if (pickerWindow && !pickerWindow.isDestroyed()) {
            console.log("Picker: Closing window");
            pickerWindow.destroy();
          }
          pickerWindow = null;
          setOtherWindowsInteractive(null);
          console.log("Picker: Cleanup complete");
        };

        ipcMain.on("picker:ready", handlePickerReady);
        ipcMain.on("picker:select", handlePickerSelect);
        ipcMain.on("picker:cancel", handlePickerCancel);

        pickerWindow.on("closed", () => {
          console.log("Picker: Window closed event");
          if (!callbackCalled) {
            abortCallback();
          }
          cleanup();
        });
      })
      .catch((error: unknown) => {
        console.error("Failed to get desktop sources:", error);
        (callback as unknown as (result: null) => void)(null);
      });
  };

  session.defaultSession.setDisplayMediaRequestHandler(mediaHandler);
}

export function setupAppProtocolHandler({
  protocol,
  fs,
  path,
  __dirname,
}: AppProtocolDeps) {
  protocol.handle("app", (request: Request) => {
    const url = request.url.substring("app://".length);
    const rawPath = url.split("?")[0] || "";
    const requestedPath = rawPath.replace(/^\.\//, "").replace(/^\//, "");

    const candidatePaths = [
      path.normalize(path.join(__dirname, requestedPath)),
    ];

    if (requestedPath.startsWith("electron/res/")) {
      candidatePaths.push(
        path.normalize(
          path.join(__dirname, requestedPath.replace(/^electron\//, "")),
        ),
      );
    }

    if (requestedPath.startsWith("dist-desktop/electron/res/")) {
      candidatePaths.push(
        path.normalize(
          path.join(
            __dirname,
            requestedPath.replace(/^dist-desktop\/electron\//, ""),
          ),
        ),
      );
    }

    const filePath = candidatePaths.find((candidate) =>
      fs.existsSync(candidate),
    );
    if (!filePath) {
      return new Response(`Not Found: ${requestedPath}`, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".mjs": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".wasm": "application/wasm",
      ".onnx": "application/octet-stream",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  });
}
