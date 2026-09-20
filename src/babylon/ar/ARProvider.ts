import type {
  ARTrackingState,
  ARFrame,
  ARPlane,
  ARHit,
  ARAnchor,
  ARLightEstimate,
} from "./ARTypes";

export interface ARProvider {
  isSupported(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;

  onTrackingStateChanged(callback: (state: ARTrackingState) => void): void;
  onCameraFrame(callback: (frame: ARFrame) => void): void;
  onPlanesChanged(callback: (planes: ARPlane[]) => void): void;
  onAnchorUpdated(callback: (anchor: ARAnchor) => void): void;
  onLightEstimateChanged(callback: (estimate: ARLightEstimate) => void): void;

  hitTest(x: number, y: number): Promise<ARHit | null>;
  createAnchor(hit: ARHit): Promise<ARAnchor>;
}
