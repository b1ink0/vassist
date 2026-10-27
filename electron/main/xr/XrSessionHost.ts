import express from "express";
import { createServer, type Server, type IncomingMessage } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { randomBytes, createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type {
  XrHostRequest,
  XrHostUpdate,
  XrSceneSnapshot,
  XrAsset,
  XrRpcCall,
  XrNetworkOptions,
  XrStreamChunk,
} from "../../../src/types/xr";
import type { XrWireValue } from "../../../src/services/xr/wireCodec";
import { BUILT_IN_STAGES } from "../../../src/config/stageConfig";

const SESSION_MS = 8 * 60 * 60 * 1000;
const token = () => randomBytes(32).toString("base64url");

/** XR has its own explicit network setting, independent of AI gateway sharing. */
export class XrSessionHost {
  private server: Server | null = null;
  private sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
  });
  private origin = "";
  private protocol = "http:";
  private networkKey = "";
  private tickets = new Map<string, number>();
  private sessions = new Map<string, number>();
  private sessionOrigins = new Map<string, string>();
  private ticketOrigins = new Map<string, string>();
  private allowedOrigins = new Set<string>();
  private idleSessions = new Map<string, ReturnType<typeof setTimeout>>();
  private assets = new Map<string, string>();
  private assetExpiry = new Map<string, number>();
  private generation = 0;
  private clients = new Map<WebSocket, { session: string; alive: boolean }>();
  private assetReads = 0;
  private uploads = new Map<
    string,
    { session: string; data: Buffer; expires: number }
  >();
  private operations = new Map<
    string,
    { hash: string; result: Promise<{ value: XrWireValue }> }
  >();
  private pendingOperations = 0;
  private snapshot: XrSceneSnapshot | null = null;
  private revision = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly root: string,
    private readonly resourceRoot: string,
    private readonly request: (request: XrHostRequest) => Promise<XrHostUpdate>,
    private readonly readAsset: (id: string) => Promise<XrAsset> = async () => {
      throw new Error("XR asset provider unavailable.");
    },
    private readonly rpc: (
      call: XrRpcCall,
      uploads: XrAsset[],
      onStream: (chunk: XrStreamChunk) => void,
    ) => Promise<{
      value: XrWireValue;
      assets: Array<{ id: string; type: string }>;
    }> = async () => {
      throw new Error("XR operations are unavailable.");
    },
  ) {}

  private sessionId(cookie = ""): string {
    return (
      cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("vassist_xr="))
        ?.slice(11) ?? ""
    );
  }

  private requestSession(req: Pick<IncomingMessage, "headers">): string {
    const authorization = req.headers.authorization;
    if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
    const protocols = req.headers["sec-websocket-protocol"]
      ?.split(",")
      .map((part) => part.trim());
    const credential = protocols?.find((part) =>
      part.startsWith("credential."),
    );
    return credential
      ? credential.slice(11)
      : this.sessionId(req.headers.cookie);
  }

  private allowedOrigin(origin?: string): boolean {
    return !origin || origin === this.origin || this.allowedOrigins.has(origin);
  }

  private authorized(req: Pick<IncomingMessage, "headers">): boolean {
    const id = this.requestSession(req);
    return (
      (this.sessions.get(id) ?? 0) > Date.now() &&
      (this.sessionOrigins.get(id) ?? this.origin) ===
        (req.headers.origin ?? this.origin)
    );
  }

  private acceptUpdate(update: XrHostUpdate): XrSceneSnapshot {
    for (const asset of update.assets) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(asset.id))
        throw new Error("Invalid XR asset reference.");
      this.assets.set(asset.id, asset.type);
    }
    this.snapshot = { ...update.snapshot, revision: ++this.revision };
    const message = JSON.stringify({
      type: "snapshot",
      snapshot: this.snapshot,
    });
    for (const [socket, client] of this.clients) {
      if (
        (this.sessions.get(client.session) ?? 0) <= Date.now() ||
        socket.bufferedAmount > 1024 * 1024
      )
        socket.terminate();
      else if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
    return this.snapshot;
  }

  refresh(
    request: XrHostRequest = { kind: "snapshot" },
  ): Promise<XrSceneSnapshot> {
    const generation = this.generation;
    const task = this.queue.then(async () => {
      if (generation !== this.generation) throw new Error("XR host restarted.");
      const update = await this.request(request);
      if (generation !== this.generation) throw new Error("XR host restarted.");
      return this.acceptUpdate(update);
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  async start(network?: XrNetworkOptions): Promise<void> {
    const networkKey = network?.enabled ? JSON.stringify(network) : "loopback";
    if (this.server && this.networkKey === networkKey) return;
    if (this.server) this.dispose();
    this.sockets = new WebSocketServer({
      noServer: true,
      maxPayload: 16 * 1024,
    });
    if (
      network?.enabled &&
      (typeof network.hostname !== "string" ||
        !/^[a-zA-Z0-9.-]{1,253}$/.test(network.hostname) ||
        typeof network.certPath !== "string" ||
        !network.certPath ||
        typeof network.keyPath !== "string" ||
        !network.keyPath)
    )
      throw new Error(
        "HTTPS sharing needs a certificate, private key and the host name covered by that certificate.",
      );
    this.protocol = network?.enabled ? "https:" : "http:";
    await access(path.join(this.root, "index.html"));
    const application = express();
    application.disable("x-powered-by");
    application.use((req, res, next) => {
      if (`${this.protocol}//${req.headers.host}` !== this.origin) {
        res.sendStatus(403);
        return;
      }
      if (!this.allowedOrigin(req.headers.origin)) {
        res.sendStatus(403);
        return;
      }
      if (req.headers.origin)
        res.set({
          "Access-Control-Allow-Origin": req.headers.origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Private-Network": "true",
          Vary: "Origin",
        });
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      res.set({
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy":
          "frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
      });
      next();
    });
    application.post(
      "/api/xr/connect",
      express.json({ limit: "1kb" }),
      (req, res) => {
        if (
          !this.allowedOrigin(req.headers.origin) ||
          typeof req.body?.ticket !== "string"
        ) {
          res.sendStatus(403);
          return;
        }
        const expires = this.tickets.get(req.body.ticket) ?? 0;
        const ticketOrigin = this.ticketOrigins.get(req.body.ticket);
        this.tickets.delete(req.body.ticket);
        this.ticketOrigins.delete(req.body.ticket);
        if (expires <= Date.now() || ticketOrigin !== req.headers.origin) {
          res.status(401).json({
            error:
              "This XR launch link has expired. Open XR again from VAssist.",
          });
          return;
        }
        const existingSession = this.requestSession(req);
        if (this.sessions.size >= 8 && !this.authorized(req)) {
          res.status(429).json({
            error: "Too many XR sessions. Close an existing session first.",
          });
          return;
        }
        const session = this.authorized(req) ? existingSession : token();
        const idleTimer = this.idleSessions.get(session);
        if (idleTimer) clearTimeout(idleTimer);
        this.idleSessions.delete(session);
        this.sessions.set(session, Date.now() + SESSION_MS);
        this.sessionOrigins.set(session, req.headers.origin!);
        res.setHeader(
          "Set-Cookie",
          `vassist_xr=${session}; HttpOnly; SameSite=Strict; ${this.protocol === "https:" ? "Secure; " : ""}Path=/api/xr; Max-Age=${SESSION_MS / 1000}`,
        );
        res.json({ connected: true, token: session });
      },
    );
    application.use("/api/xr", (req, res, next) => {
      if (!this.authorized(req)) {
        res.sendStatus(401);
        return;
      }
      next();
    });
    application.get("/api/xr/snapshot", (_req, res) => res.json(this.snapshot));
    application.post(
      "/api/xr/uploads",
      express.raw({ type: "application/octet-stream", limit: "64mb" }),
      (req, res) => {
        if (
          !this.authorized(req) ||
          !this.allowedOrigin(req.headers.origin) ||
          !Buffer.isBuffer(req.body)
        ) {
          res.sendStatus(403);
          return;
        }
        for (const [id, upload] of this.uploads)
          if (upload.expires < Date.now()) this.uploads.delete(id);
        if (
          this.uploads.size >= 16 ||
          [...this.uploads.values()].reduce(
            (size, upload) => size + upload.data.byteLength,
            req.body.byteLength,
          ) >
            128 * 1024 * 1024
        ) {
          res.sendStatus(429);
          return;
        }
        const id = token();
        this.uploads.set(id, {
          session: this.requestSession(req),
          data: req.body,
          expires: Date.now() + 60_000,
        });
        res.json({ id });
      },
    );
    application.post(
      "/api/xr/rpc",
      express.json({ limit: "2mb" }),
      async (req, res) => {
        if (!this.authorized(req) || !this.allowedOrigin(req.headers.origin)) {
          res.sendStatus(403);
          return;
        }
        const { id, call } = req.body ?? {};
        if (
          typeof id !== "string" ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
          !call ||
          !["storage", "provider", "action"].includes(call.kind)
        ) {
          res.sendStatus(400);
          return;
        }
        const session = this.requestSession(req);
        const operationId = `${session}:${id}`;
        const hash = createHash("sha256")
          .update(JSON.stringify(call))
          .digest("hex");
        let operation = this.operations.get(operationId);
        if (operation && operation.hash !== hash) {
          res.sendStatus(409);
          return;
        }
        if (!operation) {
          if (this.pendingOperations >= 8 || this.operations.size >= 2048) {
            res.sendStatus(429);
            return;
          }
          const uploads: XrAsset[] = [];
          const collect = (value: unknown, depth = 0) => {
            if (depth > 40) throw new Error("XR request is nested too deeply.");
            if (!value || typeof value !== "object") return;
            const item = value as Record<string, unknown>;
            if (item.type === "asset") {
              const upload = this.uploads.get(String(item.id));
              if (
                !upload ||
                upload.session !== session ||
                upload.expires < Date.now()
              )
                throw new Error("XR upload expired.");
              uploads.push({
                id: String(item.id),
                type: "application/octet-stream",
                data: new Uint8Array(upload.data),
              });
              return;
            }
            for (const child of Object.values(item)) collect(child, depth + 1);
          };
          try {
            collect(call.args);
          } catch {
            res.sendStatus(400);
            return;
          }
          for (const upload of uploads) this.uploads.delete(upload.id);
          // Authentication has been checked before creating this operation or calling the renderer.
          this.pendingOperations++;
          res.type("application/x-ndjson");
          const result = this.rpc(call, uploads, (stream) => {
            if (this.authorized(req) && !res.destroyed && !res.writableEnded)
              res.write(JSON.stringify({ type: "stream", stream }) + "\n");
          })
            .then(async (reply) => {
              if (!this.authorized(req))
                throw new Error("XR session was revoked.");
              if (this.assets.size + reply.assets.length > 4096)
                throw new Error(
                  "XR asset limit reached. Reconnect to release old assets.",
                );
              for (const asset of reply.assets) {
                if (!/^[a-zA-Z0-9_-]{1,100}$/.test(asset.id))
                  throw new Error("Invalid XR asset.");
                this.assets.set(asset.id, asset.type);
                this.assetExpiry.set(asset.id, Date.now() + 5 * 60_000);
              }
              if (
                (call.kind === "action" && call.action !== "chat.audio") ||
                (call.kind === "storage" &&
                  ["set", "setMultiple", "remove"].includes(call.method))
              )
                await this.refresh();
              return { value: reply.value };
            })
            .finally(() => {
              this.pendingOperations--;
              if (
                (call.kind === "storage" &&
                  !["set", "setMultiple", "remove", "clear"].includes(
                    call.method,
                  )) ||
                (call.kind === "action" &&
                  ["chat.audio", "chat.playback"].includes(call.action))
              )
                this.operations.delete(operationId);
            });
          operation = { hash, result };
          this.operations.set(operationId, operation);
        }
        try {
          const reply = await operation.result;
          if (!this.authorized(req)) {
            if (res.headersSent)
              res.end(
                JSON.stringify({
                  type: "error",
                  error: "XR session was revoked.",
                }) + "\n",
              );
            else res.sendStatus(401);
            return;
          }
          if (!res.headersSent) res.type("application/x-ndjson");
          res.end(JSON.stringify({ type: "result", ...reply }) + "\n");
        } catch (error) {
          const message = {
            type: "error",
            error:
              error instanceof Error ? error.message : "XR operation failed.",
          };
          if (res.headersSent) res.end(JSON.stringify(message) + "\n");
          else res.status(400).json(message);
        }
      },
    );
    application.post("/api/xr/disconnect", (req, res) => {
      if (!this.authorized(req) || !this.allowedOrigin(req.headers.origin)) {
        res.sendStatus(403);
        return;
      }
      const session = this.requestSession(req);
      this.sessions.delete(session);
      this.sessionOrigins.delete(session);
      for (const [socket, client] of this.clients)
        if (client.session === session)
          socket.close(1008, "Session disconnected");
      res.setHeader(
        "Set-Cookie",
        "vassist_xr=; HttpOnly; SameSite=Strict; Path=/api/xr; Max-Age=0",
      );
      res.sendStatus(204);
    });
    application.get("/api/xr/assets/:id", async (req, res) => {
      const type = this.assets.get(req.params.id);
      if (!type) {
        res.sendStatus(404);
        return;
      }
      if (this.assetReads >= 2) {
        res.sendStatus(429);
        return;
      }
      this.assetReads++;
      try {
        const asset = await this.readAsset(req.params.id);
        if (!this.authorized(req)) {
          res.sendStatus(401);
          return;
        }
        if (asset.data.byteLength > 512 * 1024 * 1024) {
          res.sendStatus(413);
          return;
        }
        res.type(type).send(Buffer.from(asset.data));
      } catch {
        res.status(404).json({
          error: "The selected asset is no longer available in VAssist.",
        });
      } finally {
        this.assetReads--;
      }
    });
    application.get("/xr", (_req, res) => res.redirect("/index.html"));
    application.use(
      "/res",
      express.static(this.resourceRoot, { dotfiles: "deny" }),
    );
    application.use(
      express.static(this.root, { index: false, dotfiles: "deny" }),
    );
    const server = network?.enabled
      ? createSecureServer(
          {
            cert: await readFile(network.certPath),
            key: await readFile(network.keyPath),
          },
          application,
        )
      : createServer(application);
    server.on("upgrade", (req, socket, head) => {
      if (
        this.clients.size >= 16 ||
        req.url !== "/api/xr/events" ||
        !this.allowedOrigin(req.headers.origin) ||
        `${this.protocol}//${req.headers.host}` !== this.origin ||
        !this.authorized(req)
      ) {
        socket.destroy();
        return;
      }
      this.sockets.handleUpgrade(req, socket, head, (ws) => {
        const session = this.requestSession(req);
        const idleTimer = this.idleSessions.get(session);
        if (idleTimer) clearTimeout(idleTimer);
        this.idleSessions.delete(session);
        const client = { session, alive: true };
        this.clients.set(ws, client);
        ws.on("pong", () => {
          client.alive = true;
        });
        let busy = false;
        const seen = new Set<string>();
        if (this.snapshot)
          ws.send(
            JSON.stringify({ type: "snapshot", snapshot: this.snapshot }),
          );
        ws.on("error", () => ws.close());
        ws.on("message", async (raw, binary) => {
          if (binary || !this.authorized(req)) {
            ws.close(1008);
            return;
          }
          let id = "";
          let ownsBusy = false;
          try {
            const value = JSON.parse(raw.toString());
            if (typeof value.id !== "string" || value.id.length > 100)
              throw new Error("Invalid command ID.");
            id = value.id;
            if (seen.has(id))
              throw new Error("This command was already received.");
            if (busy)
              throw new Error("Wait for the current command to finish.");
            const selection = value.selection;
            if (
              value.type !== "stage.set" ||
              !selection ||
              !(
                selection.kind === "none" ||
                (selection.kind === "builtin" &&
                  BUILT_IN_STAGES.some((stage) => stage.id === selection.id)) ||
                (selection.kind === "custom" &&
                  this.snapshot?.customStages?.some(
                    (stage) => stage.id === selection.id,
                  ))
              )
            )
              throw new Error("This stage command is not supported.");
            seen.add(id);
            if (seen.size > 256) {
              ws.close(1008, "Reconnect to continue");
              return;
            }
            busy = true;
            ownsBusy = true;
            const snapshot = await this.refresh({
              kind: "stage.set",
              selection:
                selection.kind === "none"
                  ? { kind: "none" }
                  : selection.kind === "builtin"
                    ? { kind: "builtin", id: selection.id }
                    : { kind: "custom", id: selection.id },
            });
            ws.send(
              JSON.stringify({ type: "ack", id, revision: snapshot.revision }),
            );
          } catch (error) {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(
                JSON.stringify({
                  type: "error",
                  id,
                  error:
                    error instanceof Error
                      ? error.message
                      : "XR command failed.",
                }),
              );
          } finally {
            if (ownsBusy) busy = false;
          }
        });
        ws.on("close", () => {
          this.clients.delete(ws);
          // Allow a short reload/reconnect window, then revoke closed sessions.
          if (
            ![...this.clients.values()].some(
              (client) => client.session === session,
            )
          ) {
            const timer = setTimeout(() => {
              this.sessions.delete(session);
              this.sessionOrigins.delete(session);
              this.idleSessions.delete(session);
            }, 60000);
            timer.unref();
            this.idleSessions.set(session, timer);
          }
        });
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, network?.enabled ? "0.0.0.0" : "127.0.0.1", () =>
        resolve(),
      );
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("XR host did not receive a local port.");
    }
    this.origin = `${this.protocol}//${network?.enabled ? network.hostname : "127.0.0.1"}:${address.port}`;
    this.networkKey = networkKey;
    this.server = server;
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [key, expiry] of this.tickets)
        if (expiry <= now) {
          this.tickets.delete(key);
          this.ticketOrigins.delete(key);
        }
      for (const [key, expiry] of this.sessions)
        if (expiry <= now) {
          this.sessions.delete(key);
          this.sessionOrigins.delete(key);
        }
      for (const [key, expiry] of this.assetExpiry)
        if (expiry <= now) {
          this.assets.delete(key);
          this.assetExpiry.delete(key);
        }
      for (const [key, upload] of this.uploads)
        if (upload.expires <= now) this.uploads.delete(key);
      for (const key of this.operations.keys())
        if (!this.sessions.has(key.split(":")[0]!)) this.operations.delete(key);
      for (const [socket, client] of this.clients) {
        if (!client.alive || (this.sessions.get(client.session) ?? 0) <= now)
          socket.terminate();
        else if (socket.readyState === WebSocket.OPEN) {
          client.alive = false;
          socket.ping();
        }
      }
    }, 30000);
    this.timer.unref();
  }

  createLaunchUrl(clientUrl?: string): string {
    if (!this.server) throw new Error("The XR host has not started.");
    if (this.tickets.size >= 32)
      this.tickets.delete(this.tickets.keys().next().value!);
    const ticket = token();
    const target = clientUrl
      ? new URL(clientUrl)
      : new URL("/index.html", this.origin);
    if (target.protocol !== "https:" && target.origin !== this.origin)
      throw new Error("Hosted XR clients require HTTPS.");
    this.allowedOrigins.add(target.origin);
    this.ticketOrigins.set(ticket, target.origin);
    this.tickets.set(ticket, Date.now() + 60000);
    const fragment = new URLSearchParams(target.hash.slice(1));
    fragment.set("ticket", ticket);
    fragment.set("xrHost", this.origin);
    target.hash = fragment.toString();
    return target.href;
  }

  dispose(): void {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    for (const socket of this.sockets.clients) socket.terminate();
    this.sockets.close();
    this.server?.close();
    this.server = null;
    this.sessions.clear();
    this.sessionOrigins.clear();
    this.ticketOrigins.clear();
    this.allowedOrigins.clear();
    for (const timer of this.idleSessions.values()) clearTimeout(timer);
    this.idleSessions.clear();
    this.tickets.clear();
    this.assets.clear();
    this.assetExpiry.clear();
    this.snapshot = null;
    this.clients.clear();
    this.uploads.clear();
    this.operations.clear();
  }

  revoke(): void {
    this.sessions.clear();
    this.sessionOrigins.clear();
    this.ticketOrigins.clear();
    this.allowedOrigins.clear();
    this.tickets.clear();
    this.operations.clear();
    this.uploads.clear();
    for (const socket of this.clients.keys())
      socket.close(1008, "Session revoked");
  }
}
