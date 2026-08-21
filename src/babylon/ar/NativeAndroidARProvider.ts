import type { ARProvider } from "./ARProvider";
import type {
  ARAnchor,
  ARFrame,
  ARHit,
  ARLightEstimate,
  ARPlane,
  ARTrackingState,
} from "./ARTypes";

type NativeMessagePort = {
  addEventListener(
    type: "message",
    callback: (event: MessageEvent<string>) => void,
  ): void;
  postMessage(message: string): void;
};

type PendingRequest = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
};

export class NativeAndroidARProvider implements ARProvider {
  private port: NativeMessagePort | null = null;
  private readonly trackingCallbacks = new Set<
    (state: ARTrackingState) => void
  >();
  private readonly frameCallbacks = new Set<(frame: ARFrame) => void>();
  private readonly planeCallbacks = new Set<(planes: ARPlane[]) => void>();
  private readonly anchorCallbacks = new Set<(anchor: ARAnchor) => void>();
  private readonly lightCallbacks = new Set<
    (estimate: ARLightEstimate) => void
  >();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private messageIdCounter = 0;
  private receivedFirstFrame = false;
  private lastTrackingState: ARTrackingState["state"] | null = null;

  constructor() {
    const nativePort = window.NativeARPlugin;
    if (!nativePort) {
      console.error("[VASSIST_AR] bridge:NativeARPlugin unavailable");
      return;
    }

    this.port = nativePort;
    console.info("[VASSIST_AR] bridge:connected");
    nativePort.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });
  }

  private handleMessage(message: string): void {
    try {
      const data = JSON.parse(message) as Record<string, unknown>;
      if (data.type === "frame") {
        const frame = data.frame as ARFrame;
        if (!this.receivedFirstFrame) {
          this.receivedFirstFrame = true;
          console.info("[VASSIST_AR] bridge:first-frame", frame.timestamp);
        }
        this.frameCallbacks.forEach((callback) => callback(frame));

        const planes = data.planes as ARPlane[] | undefined;
        if (planes) {
          this.planeCallbacks.forEach((callback) => callback(planes));
        }

        const anchors = data.anchors as ARAnchor[] | undefined;
        anchors?.forEach((anchor) => {
          this.anchorCallbacks.forEach((callback) => callback(anchor));
        });

        const light = data.lightEstimate as ARLightEstimate | undefined;
        if (light) {
          this.lightCallbacks.forEach((callback) => callback(light));
        }

        const trackingState = data.trackingState as ARTrackingState | undefined;
        if (trackingState) {
          if (this.lastTrackingState !== trackingState.state) {
            this.lastTrackingState = trackingState.state;
            console.info(`[VASSIST_AR] bridge:tracking=${trackingState.state}`);
          }
          this.trackingCallbacks.forEach((callback) => callback(trackingState));
        }
        return;
      }

      const messageId = data.messageId;
      if (typeof messageId === "string") {
        const pending = this.pendingRequests.get(messageId);
        if (pending) {
          this.pendingRequests.delete(messageId);
          pending.resolve(data);
        }
      }
    } catch (error) {
      console.error("Error parsing native AR message", error);
    }
  }

  private sendWithPromise(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.port) {
        reject(new Error("Native AR bridge is unavailable"));
        return;
      }

      const messageId = `ar_${this.messageIdCounter++}`;
      this.pendingRequests.set(messageId, { resolve, reject });
      this.port.postMessage(JSON.stringify({ ...payload, messageId }));

      window.setTimeout(() => {
        const pending = this.pendingRequests.get(messageId);
        if (!pending) return;
        this.pendingRequests.delete(messageId);
        pending.reject(
          new Error(`Native AR request timed out: ${payload.action}`),
        );
      }, 5000);
    });
  }

  public async isSupported(): Promise<boolean> {
    try {
      const response = await this.sendWithPromise({
        action: "checkSupported",
      });
      return response.supported === true;
    } catch {
      return false;
    }
  }

  public async start(): Promise<void> {
    const response = await this.sendWithPromise({ action: "startSession" });
    if (response.success !== true) {
      throw new Error(String(response.error ?? "Unable to start AR session"));
    }
  }

  public async stop(): Promise<void> {
    await this.sendWithPromise({ action: "stopSession" });
  }

  public onTrackingStateChanged(
    callback: (state: ARTrackingState) => void,
  ): void {
    this.trackingCallbacks.add(callback);
  }

  public onCameraFrame(callback: (frame: ARFrame) => void): void {
    this.frameCallbacks.add(callback);
  }

  public onPlanesChanged(callback: (planes: ARPlane[]) => void): void {
    this.planeCallbacks.add(callback);
  }

  public onAnchorUpdated(callback: (anchor: ARAnchor) => void): void {
    this.anchorCallbacks.add(callback);
  }

  public onLightEstimateChanged(
    callback: (estimate: ARLightEstimate) => void,
  ): void {
    this.lightCallbacks.add(callback);
  }

  public async hitTest(x: number, y: number): Promise<ARHit | null> {
    const response = await this.sendWithPromise({ action: "hitTest", x, y });
    return (response.result as ARHit | null) ?? null;
  }

  public async createAnchor(hit: ARHit): Promise<ARAnchor> {
    const response = await this.sendWithPromise({
      action: "createAnchor",
      worldX: hit.x,
      worldY: hit.y,
      worldZ: hit.z,
    });
    const anchor = response.anchor as ARAnchor | null;
    if (!anchor) throw new Error("ARCore could not create an anchor");
    return anchor;
  }
}

declare global {
  interface Window {
    NativeARPlugin?: NativeMessagePort;
  }
}
