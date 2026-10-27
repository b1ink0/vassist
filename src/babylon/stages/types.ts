import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type {
  QuietStageId,
  StageSeason,
  StageOptions,
} from "../../config/stageConfig";

export interface StageWeatherBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface AuthoredStage {
  floorMeshes?: Mesh[];
  id: string;
  name?: string;
  root: TransformNode;
  runtime?: TransformNode;
  weatherBounds?: StageWeatherBounds | null;
  characterAnchor: {
    position: [number, number, number];
    facingRadians: number;
  };
  update?: (deltaSeconds: number) => void;
  animatedLighting?: boolean;
  setTime?: (hour: number) => unknown;
  setSeason?: (season: StageSeason) => unknown;
  setMood?: (mood: string) => unknown;
  dispose: () => void;
  readonly mood?: string;
  readonly hour?: number;
  cameraPreset?: StageCameraPreset;
  cameraPresets?: Record<string, StageCameraPreset>;
  setContactPosition?: (x: number, z: number) => void;
  addShadowCaster?: (mesh: AbstractMesh, includeChildren?: boolean) => void;
}

export interface StageCameraPreset {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

export interface AuthoredStageOptions {
  assetUrls: Record<string, string>;
  quality: "mobile" | "balanced" | "high";
  onProgress?: (message: string) => void;
  registerCleanup?: (cleanup: () => void) => void;
}
export interface QuietStageOptions {
  preset?: QuietStageId;
  lighting?: boolean;
  realShadows?: boolean;
  contactShadow?: boolean;
  shadowSize?: number;
  shadowFilteringQuality?: number;
}

export interface StageRuntime {
  floorMeshes?: Mesh[];
  root: TransformNode;
  meshes: Mesh[];
  isEnvironment: boolean;
  brightness: number;
  updateOptions: (options: Partial<StageOptions>) => void;
  setAvatarShadows: (enabled: boolean) => void;
  setParallax: (x: number, y: number) => void;
  dispose: () => void;
}
