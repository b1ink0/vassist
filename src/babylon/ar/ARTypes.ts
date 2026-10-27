export interface ARHit {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Normalized display coordinates used to reproduce the native hit test. */
  screenX: number;
  screenY: number;
}

export interface ARAnchor {
  id: string;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export interface ARPlane {
  id: string;
  type: string;
  center: [number, number, number];
  polygon: number[];
}

export interface ARFrame {
  timestamp: number;
  camera: {
    projectionMatrix: number[];
    viewMatrix: number[];
  };
}

export interface ARTrackingState {
  state: "tracking" | "paused" | "stopped";
  reason?: string;
}

export interface ARLightEstimate {
  sphericalHarmonics?: number[];
  mainLightDirection?: [number, number, number];
  mainLightIntensity?: [number, number, number];
}
