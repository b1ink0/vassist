import type { StageSelection } from "../../config/stageConfig";
import type { XrSceneSnapshot } from "../../types/xr";
import type { XrRpcCall } from "../../types/xr";
import type { XrStreamChunk } from "../../types/xr";
import type { XrWireValue } from "./wireCodec";
import { encodeXrValue, decodeXrValue } from "./wireCodec";

/** Requests are never replayed on reconnect because their outcome may be unknown. */
export class XrConnection {
  private socket: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private revision = -1;
  private connected = false;
  private sessionToken = "";
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      ...extra,
      ...(this.sessionToken
        ? { Authorization: `Bearer ${this.sessionToken}` }
        : {}),
    };
  }
  private assetCache = new Map<string, Promise<Blob>>();
  private assetSlots = 0;
  private assetWaiters: Array<() => void> = [];
  private async downloadAsset(id: string, mime: string): Promise<Blob> {
    await new Promise<void>((resolve) => {
      const start = () => {
        this.assetSlots++;
        resolve();
      };
      if (this.assetSlots < 2) start();
      else this.assetWaiters.push(start);
    });
    try {
      if (this.closed) throw new Error("XR client closed.");
      const result = await fetch(new URL(`/api/xr/assets/${id}`, this.origin), {
        credentials: "same-origin",
        headers: this.headers(),
      });
      if (!result.ok) throw new Error("The XR asset is unavailable.");
      const blob = new Blob([await result.arrayBuffer()], { type: mime });
      if (blob.size > 32 * 1024 * 1024) this.assetCache.delete(id);
      return blob;
    } finally {
      this.assetSlots--;
      this.assetWaiters.shift()?.();
    }
  }
  private pending = new Map<
    string,
    {
      resolve: () => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(
    private readonly onSnapshot: (snapshot: XrSceneSnapshot) => void,
    private readonly onStatus: (connected: boolean) => void,
    private readonly origin = location.origin,
  ) {}

  async connect(launchTicket?: string): Promise<void> {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const ticket = launchTicket ?? fragment.get("ticket");
    fragment.delete("ticket");
    fragment.set("xrHost", this.origin);
    if (location.protocol === "https:" || location.protocol === "http:")
      history.replaceState(
        null,
        "",
        `${location.pathname}${location.search}#${fragment}`,
      );
    if (ticket) {
      const response = await fetch(new URL("/api/xr/connect", this.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket }),
        credentials: "same-origin",
      });
      if (!response.ok)
        throw new Error(
          "This XR launch link expired. Open XR again from VAssist.",
        );
      this.sessionToken = ((await response.json()) as { token: string }).token;
    }
    const response = await fetch(new URL("/api/xr/snapshot", this.origin), {
      credentials: "same-origin",
      headers: this.headers(),
    });
    if (!response.ok)
      throw new Error(
        "Open in XR from the VAssist desktop app to connect this browser.",
      );
    const snapshot = (await response.json()) as XrSceneSnapshot;
    this.revision = snapshot.revision;
    this.onSnapshot(snapshot);
    this.connected = true;
    this.openSocket();
  }

  private openSocket(): void {
    if (this.closed) return;
    const url = new URL("/api/xr/events", this.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      url,
      this.sessionToken
        ? ["vassist-xr", `credential.${this.sessionToken}`]
        : ["vassist-xr"],
    );
    this.socket = socket;
    socket.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.onStatus(true);
    };
    socket.onmessage = (event) => {
      try {
        const value = JSON.parse(String(event.data));
        if (
          value.type === "snapshot" &&
          Number.isSafeInteger(value.snapshot?.revision) &&
          value.snapshot.revision > this.revision
        ) {
          this.revision = value.snapshot.revision;
          this.onSnapshot(value.snapshot);
        } else if (value.type === "ack" || value.type === "error") {
          const item = this.pending.get(value.id);
          if (item) {
            clearTimeout(item.timer);
            this.pending.delete(value.id);
            if (value.type === "ack") item.resolve();
            else item.reject(new Error(value.error));
          }
        }
      } catch {
        socket.close(1002, "Invalid session message");
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      this.onStatus(false);
      this.connected = false;
      for (const item of this.pending.values()) {
        clearTimeout(item.timer);
        item.reject(
          new Error("Connection lost. Reconnect before changing the stage."),
        );
      }
      this.pending.clear();
      if (!this.closed && this.retry < 5)
        this.timer = setTimeout(
          () => {
            this.retry++;
            this.openSocket();
          },
          Math.min(1000 * 2 ** this.retry, 15000),
        );
    };
  }

  setStage(selection: StageSelection): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error("VAssist is disconnected."));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "VAssist did not confirm the stage change. Check the connection before retrying.",
          ),
        );
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ type: "stage.set", id, selection }));
    });
  }

  async request(
    call:
      | Omit<Extract<XrRpcCall, { kind: "storage" }>, "args">
      | Omit<Extract<XrRpcCall, { kind: "provider" }>, "args">
      | Omit<Extract<XrRpcCall, { kind: "action" }>, "args">,
    args: unknown[],
    onStream?: (chunk: XrStreamChunk) => void,
  ): Promise<unknown> {
    try {
      if (!this.connected || this.closed)
        throw new Error(
          "VAssist is disconnected. Reconnect before making changes.",
        );
      const encoded = await encodeXrValue(args, async (blob) => {
        const response = await fetch(new URL("/api/xr/uploads", this.origin), {
          method: "POST",
          credentials: "same-origin",
          headers: this.headers({ "Content-Type": "application/octet-stream" }),
          body: blob,
        });
        if (!response.ok)
          throw new Error("XR upload failed or exceeded the transfer limit.");
        return ((await response.json()) as { id: string }).id;
      });
      const response = await fetch(new URL("/api/xr/rpc", this.origin), {
        method: "POST",
        credentials: "same-origin",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          id: crypto.randomUUID(),
          call: { ...call, args: encoded },
        }),
      });
      const value = await this.readReply(response, onStream);
      return await decodeXrValue(value, async (id, mime) => {
        let asset = this.assetCache.get(id);
        if (!asset) {
          asset = this.downloadAsset(id, mime);
          if (this.assetCache.size >= 16)
            this.assetCache.delete(this.assetCache.keys().next().value!);
          this.assetCache.set(id, asset);
          asset.catch(() => this.assetCache.delete(id));
        }
        return asset;
      });
    } catch (reason) {
      window.dispatchEvent(
        new CustomEvent("vassist:xr-connection-error", {
          detail: reason instanceof Error ? reason.message : String(reason),
        }),
      );
      throw reason;
    }
  }

  private async readReply(
    response: Response,
    onStream?: (chunk: XrStreamChunk) => void,
  ): Promise<XrWireValue> {
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        error.error ?? "The XR session did not confirm this operation.",
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The XR response was interrupted.");
    const decoder = new TextDecoder();
    let buffer = "";
    let result: XrWireValue | undefined;
    const consume = (line: string) => {
      if (!line.trim()) return;
      const item = JSON.parse(line) as {
        type: string;
        value?: XrWireValue;
        stream?: XrStreamChunk;
        error?: string;
      };
      if (item.type === "error")
        throw new Error(item.error ?? "XR operation failed.");
      if (item.type === "stream" && item.stream) onStream?.(item.stream);
      if (item.type === "result") result = item.value;
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          consume(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
        }
        if (done) break;
      }
      consume(buffer);
    } finally {
      reader.releaseLock();
    }
    if (result === undefined)
      throw new Error(
        "The XR response ended before confirmation. Check the connection before retrying.",
      );
    return result;
  }

  async disconnect(): Promise<void> {
    try {
      await fetch(new URL("/api/xr/disconnect", this.origin), {
        method: "POST",
        credentials: "same-origin",
        headers: this.headers(),
      });
    } finally {
      this.dispose();
    }
  }

  dispose(): void {
    this.closed = true;
    this.connected = false;
    this.onStatus(false);
    this.sessionToken = "";
    this.assetCache.clear();
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("XR client closed."));
    }
    this.pending.clear();
  }
}
