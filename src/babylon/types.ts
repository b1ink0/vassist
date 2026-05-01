import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { MmdAnimationSpan } from 'babylon-mmd/esm/Runtime/Animation/mmdCompositeAnimation';
import type { ElectronAPI } from '../types/electron';

export type CameraMode = '2D' | '3D';

export interface PixelSize {
  width: number;
  height: number;
}

export interface CameraOffset {
  x: number;
  y: number;
}

export interface CustomBoundaryInsets {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export interface PositionManagerOptionsLike {
  boundaryPadding?: number;
  allowPartialOffscreen?: boolean;
  partialOffscreenAmount?: number;
}

export interface PositionPresetLike {
  name: string;
  modelSize: PixelSize;
  portraitModelSize?: PixelSize;
  padding: number;
  offset?: CameraOffset;
  portraitOffset?: CameraOffset;
  customBoundaries?: CustomBoundaryInsets;
  portraitCustomBoundaries?: CustomBoundaryInsets;
  portraitClipPlaneY?: number;
  description?: string;
}

export interface SavedModelPositionLike {
  x: number;
  y: number;
  width: number;
  height: number;
  preset?: string;
}

export interface PositionState2DLike {
  modelHeightPx?: number;
  positionX?: number;
  positionY?: number;
  rotation?: { x?: number; y?: number };
}

export interface PositionState3DLike {
  distance?: number;
  rotation?: { x?: number; y?: number };
  position?: { x?: number; y?: number };
}

export interface CameraUIConfigLike {
  mode?: CameraMode | string;
  locked?: boolean;
  savePosition?: boolean;
  saved3D?: PositionState3DLike;
  saved2D?: PositionState2DLike;
}

export interface UIPositionConfigLike {
  preset?: string;
  lastLocation?: SavedModelPositionLike | null;
}

export interface UIConfigLike {
  enablePortraitMode?: boolean;
  physicsEngine?: string;
  position?: UIPositionConfigLike;
  modelSizePx?: PixelSize | null;
  camera?: CameraUIConfigLike;
  [key: string]: unknown;
}

export interface RenderQualitySettingsLike {
  samples: number;
  bloomEnabled: boolean;
  chromaticAberrationEnabled?: boolean;
  fxaaEnabled: boolean;
  bloomKernel: number;
  bloomScale: number;
  bloomWeight: number;
  bloomThreshold?: number;
  contrast?: number;
  exposure?: number;
  saturation?: number;
}

export interface SceneAnimationConfigLike {
  id: string;
  name: string;
  filePath?: string;
  cameraFilePath?: string;
  isCustom?: boolean;
  customMotionId?: string;
  preserveRootBone?: boolean;
  transitionFrames?: number;
  loop?: boolean;
  loopTransition?: boolean;
  disableBlinking?: boolean;
  [key: string]: unknown;
}

export interface SceneBuildConfig {
  enableModelLoading?: boolean;
  modelUrl: string;
  customModelFile?: File;
  modelId?: string;
  modelFileName?: string;
  portraitClipping?: number;
  cameraAnimationUrl?: string;
  enableCameraAnimation?: boolean;
  orthoHeight: number;
  cameraDistance: number;
  positionConfig?: PositionManagerOptionsLike;
  transparentBackground?: boolean;
  enablePhysics?: boolean;
  enableShadows?: boolean;
  renderQuality?: string;
  customQuality?: RenderQualitySettingsLike;
  uiConfig?: UIConfigLike;
  desktopAPI?: ElectronAPI | null;
  savedModelPosition?: SavedModelPositionLike | null;
  onLoadProgress?: (progress: number) => void;
  onModelLoaded?: (modelMesh: unknown) => void;
  onSceneReady?: (scene: SceneWithMetadata) => void;
  updateUIConfig?: (path: string, value: unknown) => void;
  getRandomAnimation?: (category: string) => SceneAnimationConfigLike | null;
  getEnabledAnimations?: (category: string) => SceneAnimationConfigLike[];
}

export interface DepthOfFieldSettingsLike {
  fStop: number;
  focalLength: number;
  focusDistance: number;
}

export interface DepthOfFieldPipelineLike {
  depthOfField: DepthOfFieldSettingsLike;
  depthOfFieldEnabled: boolean;
}

export interface CameraParentLike {
  computeWorldMatrix: () => unknown;
  getWorldMatrix: () => Matrix;
}

export type AutoFocusCameraLike = Camera & {
  rotation: Vector3;
  position: Vector3;
  distance: number;
  parent: CameraParentLike | null;
};

export interface RuntimeBoneLike {
  name: string;
  getWorldMatrixToRef: (matrix: Matrix) => Matrix;
}

export interface RuntimeBoneModelLike {
  runtimeBones: RuntimeBoneLike[];
}

export interface BoneTrackLike {
  name: string;
  rotations?: number[];
}

export interface MovableBoneTrackLike {
  name: string;
  frameNumbers: number[];
  positions: number[];
}

export interface MorphTrackLike {
  name: string;
  frameNumbers: number[];
  weights: number[];
}

export interface CameraTrackLike {
  positions?: number[];
}

export type MmdBindableAnimationLike = ConstructorParameters<typeof MmdAnimationSpan>[0];

export type LoadedAnimationLike = MmdBindableAnimationLike & {
  name: string;
  endFrame: number;
  boneTracks?: BoneTrackLike[];
  movableBoneTracks?: MovableBoneTrackLike[];
  morphTracks?: MorphTrackLike[];
  cameraTrack?: CameraTrackLike;
};

export interface AnimationLoaderLike {
  loadAsync: (id: string, filePath: string) => Promise<LoadedAnimationLike>;
}

export interface MmdRuntimeLike {
  currentFrameTime: number;
  animationFrameTimeDuration: number;
  isAnimationPlaying: boolean;
  playAnimation: (() => Promise<void> | void) | boolean;
  timeScale: number;
  setManualAnimationDuration: (duration: number) => void;
  seekAnimation: (frameTime: number, forceEvaluate?: boolean) => Promise<void>;
}

export interface MorphControllerLike {
  setMorphWeight: (name: string, weight: number) => void;
}

export interface SkeletonBoneLike {
  name: string;
  position: Vector3;
}

export interface SkeletonLike {
  bones: SkeletonBoneLike[];
}

export interface MmdModelLike extends RuntimeBoneModelLike {
  skeleton: SkeletonLike;
  morph: MorphControllerLike;
  createRuntimeAnimation: (animation: unknown) => number;
  setRuntimeAnimation: (handle: number | null) => void;
}

export interface MmdCameraRuntimeAnimationLike {
  animate: (frame: number) => void;
}

export interface MmdCameraLike extends AutoFocusCameraLike {
  fov: number;
  mode: number;
  orthoTop: number;
  orthoBottom: number;
  orthoLeft: number;
  orthoRight: number;
  currentAnimation?: MmdCameraRuntimeAnimationLike | null;
  createRuntimeAnimation: (animation: LoadedAnimationLike) => number;
  setRuntimeAnimation: (handle: number | null) => void;
  destroyRuntimeAnimation: (handle: number) => void;
}

export interface PositionPixels {
  x: number;
  y: number;
  width: number;
  height: number;
  cameraHeight?: number;
}

export interface PositionValidationResult {
  valid: boolean;
  adjustedX: number;
  adjustedY: number;
  debug: {
    boundaries: { minX: number; maxX: number; minY: number; maxY: number };
    padding: { left: number; right: number; top: number; bottom: number };
    modelSize: { width: number; height: number };
    canvasSize: { width: number; height: number };
    allowedOffscreen: { x: number; y: number };
  };
}

export interface PositionManagerLike {
  canvasWidth: number;
  modelWidthPx: number;
  modelHeightPx: number;
  effectiveHeightPx: number;
  canvasHeight: number;
  positionX: number;
  positionY: number;
  offset?: CameraOffset;
  updateCanvasDimensions: () => void;
  getPositionPixels: () => PositionPixels;
  setPositionPixels: (
    x: number,
    y: number,
    width: number,
    height: number,
    effectiveHeight?: number | CameraOffset | null,
    offset?: CameraOffset
  ) => void;
  updateCameraFrustum: () => void;
}

export interface AnimationManagerOffsetLike {
  _introLocomotionOffset?: { x: number; y: number; z?: number };
  _cameraOriginalOffset?: CameraOffset;
  _cameraPreShiftedOffset?: CameraOffset;
}

export interface SceneMetadataLike {
  isPortraitMode?: boolean;
  portraitClipPlaneY?: number;
  mmdCamera?: MmdCameraLike;
  arcRotateCamera?: Camera;
  positionManager?: PositionManagerLike;
  animationManager?: AnimationManagerOffsetLike | unknown;
  defaultGround?: Mesh;
  stageMesh?: Mesh | null;
  interactionManager?: unknown;
  modelMesh?: unknown;
  mmdModel?: unknown;
  mmdRuntime?: unknown;
  renderPipeline?: unknown;
  toggleCameraMode?: () => CameraMode;
  getCameraMode?: () => CameraMode;
  resetCameraPosition?: () => boolean;
  toggleCameraSave?: () => boolean;
  isCameraSaveEnabled?: () => boolean;
  toggleCameraLock?: () => boolean;
  isCameraLocked?: () => boolean;
  [key: string]: unknown;
}

export type SceneWithMetadata = Scene & {
  metadata?: SceneMetadataLike;
};

export interface DesktopWindowApiLike {
  getPosition?: () => Promise<{ x: number; y: number }>;
  setPosition?: (x: number, y: number) => Promise<void>;
}

export interface DesktopApiLike {
  window?: DesktopWindowApiLike;
}
