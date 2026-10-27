import type { BrowserWindow, IpcMain, WebContents } from "electron";
import { dialog } from "electron";
import { randomUUID } from "node:crypto";
import type { XrRendererRequest, XrRendererReply } from "../../../src/types/xr";
import { XrSessionHost } from "./XrSessionHost";
import { launchXrBrowser, listXrBrowsers } from "./browserLauncher";

export function registerXrHandlers(options: {
  ipcMain: IpcMain;
  getWindows: () => Array<BrowserWindow | null>;
  getAssistantWindow: () => BrowserWindow | null;
  getChatWindow: () => BrowserWindow | null;
  root: string;
  resourceRoot: string;
  userData: () => string;
  openExternal: (url: string) => Promise<void>;
}) {
  const { ipcMain } = options;
  const pending = new Map<
    string,
    {
      sender: WebContents;
      resolve: (reply: XrRendererReply) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      onStream:
        | ((chunk: import("../../../src/types/xr").XrStreamChunk) => void)
        | undefined;
    }
  >();
  const trusted = (sender: WebContents) =>
    options
      .getWindows()
      .some(
        (window) =>
          window && !window.isDestroyed() && window.webContents === sender,
      );
  let owner: WebContents | null = null;
  let chatOwner: WebContents | null = null;
  let removeChatOwnerListeners: (() => void) | undefined;
  const assetOwners = new Map<string, WebContents>();
  let removeOwnerListeners: (() => void) | undefined;
  const revokeOwner = () => {
    host.dispose();
    assetOwners.clear();
    launched = false;
    for (const [id, item] of pending) {
      clearTimeout(item.timer);
      item.reject(
        new Error(
          "The owning VAssist window restarted. Create a fresh pairing link.",
        ),
      );
      pending.delete(id);
    }
  };
  const requestRenderer = (
    request: XrRendererRequest["request"],
    onStream?: (chunk: import("../../../src/types/xr").XrStreamChunk) => void,
  ): Promise<XrRendererReply> => {
    const sceneWindow = options.getAssistantWindow();
    const chatWindow = options.getChatWindow();
    if (
      !sceneWindow ||
      sceneWindow.isDestroyed() ||
      !chatWindow ||
      chatWindow.isDestroyed()
    )
      return Promise.reject(
        new Error("The VAssist avatar window is unavailable."),
      );
    const chatRequest =
      request.kind === "chat.snapshot" ||
      (request.kind === "rpc" &&
        (request.call.kind !== "action" ||
          request.call.action.startsWith("chat.")));
    const sender =
      request.kind === "asset.read"
        ? (assetOwners.get(request.assetId) ?? sceneWindow.webContents)
        : (chatRequest ? chatWindow : sceneWindow).webContents;
    if (chatOwner !== chatWindow.webContents) {
      if (chatOwner && chatOwner !== owner) revokeOwner();
      removeChatOwnerListeners?.();
      chatOwner = chatWindow.webContents;
      const attached = chatOwner;
      const gone = () => revokeOwner();
      attached.on("render-process-gone", gone);
      attached.on("destroyed", gone);
      attached.on("did-start-loading", gone);
      removeChatOwnerListeners = () => {
        attached.removeListener("render-process-gone", gone);
        attached.removeListener("destroyed", gone);
        attached.removeListener("did-start-loading", gone);
      };
    }
    if (owner !== sceneWindow.webContents) {
      if (owner) {
        host.revoke();
        launched = false;
        for (const [id, item] of pending) {
          clearTimeout(item.timer);
          item.reject(
            new Error("The owning VAssist window changed. Pair again."),
          );
          pending.delete(id);
        }
      }
      removeOwnerListeners?.();
      owner = sceneWindow.webContents;
      const navigation = (
        _event: unknown,
        _url: string,
        inPlace: boolean,
        mainFrame: boolean,
      ) => {
        if (mainFrame && !inPlace) revokeOwner();
      };
      const gone = () => revokeOwner();
      owner.on("did-start-navigation", navigation);
      owner.on("render-process-gone", gone);
      owner.on("destroyed", gone);
      const attached = owner;
      removeOwnerListeners = () => {
        attached.removeListener("did-start-navigation", navigation);
        attached.removeListener("render-process-gone", gone);
        attached.removeListener("destroyed", gone);
      };
    }
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(
        () => {
          pending.delete(id);
          reject(
            new Error(
              "VAssist did not respond. Wait for the avatar to load and try again.",
            ),
          );
        },
        request.kind === "rpc" ? 120000 : 30000,
      );
      pending.set(id, {
        sender,
        resolve,
        reject,
        timer,
        onStream,
      });
      sender.send("xr:request", { id, request });
    });
  };
  const host = new XrSessionHost(
    options.root,
    options.resourceRoot,
    async (request) => {
      const [reply, chat] = await Promise.all([
        requestRenderer(request),
        requestRenderer({ kind: "chat.snapshot" }),
      ]);
      if ("update" in reply && "chat" in chat) {
        for (const asset of reply.update.assets)
          assetOwners.set(asset.id, options.getAssistantWindow()!.webContents);
        return {
          ...reply.update,
          snapshot: {
            ...reply.update.snapshot,
            chat: chat.chat,
            currentChatId: chat.chat.currentChatId,
            chatRevision: chat.chatRevision,
            speech: chat.speech,
          },
        };
      }
      throw new Error("Unexpected XR snapshot reply.");
    },
    async (assetId) => {
      const reply = await requestRenderer({ kind: "asset.read", assetId });
      if ("asset" in reply) return reply.asset;
      throw new Error("Unexpected XR asset reply.");
    },
    async (call, uploads, onStream) => {
      const reply = await requestRenderer(
        { kind: "rpc", call, uploads },
        onStream,
      );
      if ("value" in reply) {
        const chatRequest =
          call.kind !== "action" || call.action.startsWith("chat.");
        const sender = (
          chatRequest ? options.getChatWindow() : options.getAssistantWindow()
        )?.webContents;
        if (sender)
          for (const asset of reply.assets) assetOwners.set(asset.id, sender);
        return reply;
      }
      throw new Error("Unexpected XR operation reply.");
    },
  );
  ipcMain.on("xr:reply", (event, reply: XrRendererReply) => {
    const item = pending.get(reply?.id);
    if (!item || item.sender !== event.sender || !trusted(event.sender)) return;
    if ("stream" in reply) {
      if (
        typeof reply.stream.text === "string" &&
        ["text", "reasoning"].includes(reply.stream.channel)
      )
        item.onStream?.(reply.stream);
      return;
    }
    pending.delete(reply.id);
    clearTimeout(item.timer);
    if ("error" in reply) item.reject(new Error(reply.error));
    else item.resolve(reply);
  });
  ipcMain.handle("xr:browsers", (event) => {
    if (!trusted(event.sender)) throw new Error("Unknown desktop window.");
    return listXrBrowsers();
  });
  let opening = false;
  let launched = false;
  ipcMain.handle(
    "xr:open",
    async (
      event,
      preference: {
        browser?: unknown;
        forceOpenXR?: unknown;
        clientUrl?: unknown;
        launch?: unknown;
        network?: import("../../../src/types/xr").XrNetworkOptions;
      },
    ) => {
      if (
        !trusted(event.sender) ||
        !preference ||
        !["default", "chrome", "edge", "brave"].includes(
          String(preference.browser),
        )
      )
        throw new Error("Invalid XR launch request.");
      if (opening) throw new Error("XR is already opening.");
      opening = true;
      try {
        await host.start(preference.network);
        await host.refresh();
        if (
          preference.clientUrl !== undefined &&
          typeof preference.clientUrl !== "string"
        )
          throw new Error("Invalid hosted XR URL.");
        const url = host.createLaunchUrl(
          preference.clientUrl as string | undefined,
        );
        if (preference.launch !== false)
          await launchXrBrowser(
            url,
            {
              browser: preference.browser as
                | "default"
                | "chrome"
                | "edge"
                | "brave",
              forceOpenXR: preference.forceOpenXR === true,
            },
            options.userData(),
            options.openExternal,
          );
        launched = true;
        return { url };
      } finally {
        opening = false;
      }
    },
  );
  ipcMain.handle("xr:revoke", (event) => {
    if (!trusted(event.sender)) throw new Error("Unknown desktop window.");
    host.dispose();
    launched = false;
  });
  ipcMain.handle("xr:tls-files", async (event) => {
    if (!trusted(event.sender)) throw new Error("Unknown desktop window.");
    const certificate = await dialog.showOpenDialog({
      title: "Choose XR HTTPS certificate",
      properties: ["openFile"],
      filters: [{ name: "TLS certificate", extensions: ["pem", "crt", "cer"] }],
    });
    if (certificate.canceled || !certificate.filePaths[0]) return null;
    const key = await dialog.showOpenDialog({
      title: "Choose XR HTTPS private key",
      properties: ["openFile"],
      filters: [{ name: "TLS private key", extensions: ["pem", "key"] }],
    });
    if (key.canceled || !key.filePaths[0]) return null;
    return { certPath: certificate.filePaths[0], keyPath: key.filePaths[0] };
  });
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  // No background snapshots until a browser has actually attached or launched.
  ipcMain.on("xr:invalidate", (event) => {
    if (
      !trusted(event.sender) ||
      (event.sender !== options.getAssistantWindow()?.webContents &&
        event.sender !== options.getChatWindow()?.webContents)
    )
      return;
    if (refreshTimer || !launched) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void host.refresh().catch(() => undefined);
    }, 250);
  });
  return {
    dispose: () => {
      removeOwnerListeners?.();
      removeChatOwnerListeners?.();
      if (refreshTimer) clearTimeout(refreshTimer);
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(new Error("VAssist is closing."));
      }
      pending.clear();
      host.dispose();
    },
  };
}
