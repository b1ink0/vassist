import "@babylonjs/core/Loading/loadingScreen";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "babylon-mmd/esm/Loader/Optimized/bpmxLoader";
import "babylon-mmd/esm/Loader/mmdOutlineRenderer";
import "babylon-mmd/esm/Runtime/Animation/mmdCompositeRuntimeCameraAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdCompositeRuntimeModelAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation";

import { Camera } from "@babylonjs/core/Cameras/camera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import havokPhysics from "@babylonjs/havok";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";

import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { BvmdLoader } from "babylon-mmd/esm/Loader/Optimized/bvmdLoader";
import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdPhysics } from "babylon-mmd/esm/Runtime/Physics/mmdPhysics";
import { MmdWasmInstanceTypeMPR } from "babylon-mmd/esm/Runtime/Optimized/InstanceType/multiPhysicsRelease";
import { MmdWasmInstanceTypeSPR } from "babylon-mmd/esm/Runtime/Optimized/InstanceType/singlePhysicsRelease";
import { GetMmdWasmInstance } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmInstance";
import { MultiPhysicsRuntime } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/multiPhysicsRuntime";
import { PhysicsRuntime } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/physicsRuntime";
import { MmdBulletPhysics } from "babylon-mmd/esm/Runtime/Optimized/Physics/mmdBulletPhysics";
import { MotionType } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/motionType";
import { PhysicsStaticPlaneShape } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/physicsShape";
import { RigidBody } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/rigidBody";
import { RigidBodyConstructionInfo } from "babylon-mmd/esm/Runtime/Optimized/Physics/Bind/rigidBodyConstructionInfo";
import { AnimationManager } from "../managers/AnimationManager";
import { PositionManager } from "../managers/PositionManager";
import { CanvasInteractionManager } from "../managers/CanvasInteractionManager";
import Logger from "../../services/LoggerService";
import { VmdLoader } from "babylon-mmd";
import { pmxConverterService } from "../../services/PMXConverterService";
import { modelStorageService } from "../../services/ModelStorageService";
import { stageStorageService } from "../../services/StageStorageService";
import { isAndroid, isDesktop } from "../../utils/PlatformUtils";
import type {
  AnimationLoaderLike,
  CameraMode,
  MmdModelLike,
  PositionPixels,
  PositionPresetLike,
  RenderQualitySettingsLike,
  SavedModelPositionLike,
  SceneBuildConfig,
  SceneWithMetadata,
} from "../types";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const isWasmCspError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("content security policy") ||
    message.includes("unsafe-eval") ||
    message.includes("instantiate") ||
    message.includes("wasm")
  );
};

let allowBulletPhysics = true;
let allowMultiThreadedBulletPhysics = true;

type MaterialWithState = {
  diffuseTexture?: unknown;
  sphereTexture?: unknown;
  toonTexture?: unknown;
  alpha?: number;
  renderOutline?: boolean;
  outlineWidth?: number;
  outlineColor?: { set: (r: number, g: number, b: number) => void };
  outlineAlpha?: number;
  _originalAlpha?: number;
  _isHidden?: boolean;
  [key: string]: unknown;
};

type MeshMetadataState = {
  meshes?: Mesh[];
  materials?: MaterialWithState[];
};

type TextureState = {
  materialIndex: number;
  type: "diffuse" | "sphere" | "toon" | string;
  isActive: boolean;
};

type MeshPartState = {
  meshIndex: number;
  type?: "submesh" | string;
  subMeshIndex?: number;
  isVisible: boolean;
};

const toTextureStates = (value: unknown): TextureState[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object",
    )
    .map((item) => ({
      materialIndex:
        typeof item.materialIndex === "number" ? item.materialIndex : -1,
      type: typeof item.type === "string" ? item.type : "diffuse",
      isActive: item.isActive !== false,
    }))
    .filter((item) => item.materialIndex >= 0);
};

const toMeshPartStates = (value: unknown): MeshPartState[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object",
    )
    .map((item) => {
      const normalized: MeshPartState = {
        meshIndex: typeof item.meshIndex === "number" ? item.meshIndex : -1,
        isVisible: item.isVisible !== false,
      };

      if (typeof item.type === "string") {
        normalized.type = item.type;
      }
      if (typeof item.subMeshIndex === "number") {
        normalized.subMeshIndex = item.subMeshIndex;
      }

      return normalized;
    })
    .filter((item) => item.meshIndex >= 0);
};

/**
 * Build MMD Model Scene with async model loading support
 *
 * This scene builder expects to receive a complete configuration object
 * from BabylonScene, which handles merging user config with defaults.
 *
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Engine} engine - Babylon.js engine
 * @param {Object} config - Complete scene configuration (already merged with defaults)
 * @returns {Promise<Scene>} Configured Babylon.js scene
 */
export const buildMmdModelScene = async (
  canvas: HTMLCanvasElement,
  engine: Engine,
  config: SceneBuildConfig,
): Promise<SceneWithMetadata> => {
  const finalConfig: SceneBuildConfig = config;

  // Check if Portrait Mode is enabled (used in multiple places)
  const isPortraitMode = finalConfig.uiConfig?.enablePortraitMode || false;

  SdefInjector.OverrideEngineCreateEffect(engine);

  const scene = new Scene(engine) as SceneWithMetadata;

  // Set background transparency
  if (finalConfig.transparentBackground) {
    scene.clearColor = new Color4(0, 0, 0, 0); // Fully transparent
  }

  // ========================================
  // SCENE SETUP
  // ========================================

  // Create MMD root and camera root
  const mmdRoot = new TransformNode("mmdRoot", scene);
  const cameraRoot = new TransformNode("cameraRoot", scene);
  cameraRoot.scaling.y = 0.98;
  cameraRoot.parent = mmdRoot;

  // Create MMD Camera
  const mmdCamera = new MmdCamera("mmdCamera", new Vector3(0, 10, 0), scene);
  mmdCamera.maxZ = 5000;
  mmdCamera.ignoreParentScaling = true;
  mmdCamera.parent = cameraRoot;

  // Default to 2D/ORTHOGRAPHIC mode
  mmdCamera.mode = Camera.ORTHOGRAPHIC_CAMERA;

  Logger.log("MmdModelScene", "Camera initialized in 2D/ORTHOGRAPHIC mode");

  // Set orthographic frustum
  const orthoHeight = finalConfig.orthoHeight;
  const cameraDistance = finalConfig.cameraDistance;
  const aspectRatio = engine.getAspectRatio(mmdCamera);

  mmdCamera.orthoTop = orthoHeight;
  mmdCamera.orthoBottom = -orthoHeight;
  mmdCamera.orthoLeft = -orthoHeight * aspectRatio;
  mmdCamera.orthoRight = orthoHeight * aspectRatio;

  // Set camera distance for orthographic view
  mmdCamera.distance = cameraDistance;
  mmdCamera.rotation.set(0, 0, 0);

  // Handle window resize to maintain aspect ratio
  engine.onResizeObservable.add(() => {
    const newAspect = engine.getAspectRatio(mmdCamera);
    mmdCamera.orthoLeft = -orthoHeight * newAspect;
    mmdCamera.orthoRight = orthoHeight * newAspect;
  });

  // Create default ArcRotate camera for debugging
  const camera = new ArcRotateCamera(
    "arcRotateCamera",
    0,
    0,
    45,
    new Vector3(0, 10, 0),
    scene,
  );
  camera.minZ = 1;
  camera.maxZ = 5000;
  camera.setPosition(new Vector3(0, 10, -45));
  camera.inertia = 0.8;
  camera.speed = 10;

  // Store cameras in metadata for debug panel access
  scene.metadata = scene.metadata || {};
  scene.metadata.mmdCamera = mmdCamera;
  scene.metadata.arcRotateCamera = camera;
  scene.metadata.is3DViewActive = false;

  // Camera control constants
  const CAMERA_3D_DISTANCE = -40;
  const CAMERA_3D_DISTANCE_MIN = -100;
  const CAMERA_3D_DISTANCE_MAX = -10;
  const CAMERA_2D_HEIGHT_MIN = 300;
  const CAMERA_2D_HEIGHT_MAX = 3500;
  const CAMERA_2D_HEIGHT_DEFAULT = 600;
  const CAMERA_2D_WIDTH_DEFAULT = 360;
  const CAMERA_2D_ASPECT_RATIO = 0.6;
  const CAMERA_ZOOM_SENSITIVITY_2D = 10;
  const CAMERA_PINCH_SENSITIVITY = 0.2;
  const CAMERA_PAN_SPEED_MULTIPLIER = 0.001;
  const CAMERA_ROTATION_SENSITIVITY = 0.01;

  // Load camera state from UI config
  const initialCameraMode: CameraMode =
    finalConfig.uiConfig?.camera?.mode === "2D" ? "2D" : "3D";
  const initialCameraLocked = finalConfig.uiConfig?.camera?.locked ?? true;
  let cameraSaveEnabled = finalConfig.uiConfig?.camera?.savePosition ?? false;

  // Helper functions for camera controls
  const applyZoom = (delta: number): void => {
    const positionManager = scene.metadata?.positionManager;
    if (!positionManager) {
      Logger.warn("MmdModelScene", "PositionManager not initialized yet");
      return;
    }

    if (mmdCamera.mode === Camera.ORTHOGRAPHIC_CAMERA) {
      // In 2D mode, adjust model height which updates frustum via PositionManager
      const currentHeight =
        positionManager.modelHeightPx || CAMERA_2D_HEIGHT_DEFAULT;
      const currentWidth =
        positionManager.modelWidthPx || CAMERA_2D_WIDTH_DEFAULT;
      const newHeight = currentHeight + delta * CAMERA_ZOOM_SENSITIVITY_2D;

      // Clamp to reasonable sizes
      const clampedHeight = Math.max(
        CAMERA_2D_HEIGHT_MIN,
        Math.min(newHeight, CAMERA_2D_HEIGHT_MAX),
      );
      const newWidth = clampedHeight * CAMERA_2D_ASPECT_RATIO;

      // Calculate position compensation to keep zoom centered
      const heightDelta = clampedHeight - currentHeight;
      const widthDelta = newWidth - currentWidth;

      // Adjust position to keep model centered during zoom
      const oldPosX = positionManager.positionX;
      const oldPosY = positionManager.positionY;

      positionManager.positionX = oldPosX - widthDelta / 2;
      positionManager.positionY = oldPosY - heightDelta / 2;
      positionManager.modelHeightPx = clampedHeight;
      positionManager.modelWidthPx = newWidth;
      positionManager.effectiveHeightPx = clampedHeight;
      positionManager.updateCameraFrustum();
      saveCameraState();
    } else {
      // In 3D mode, adjust distance
      mmdCamera.distance += delta;
      mmdCamera.distance = Math.max(
        CAMERA_3D_DISTANCE_MIN,
        Math.min(mmdCamera.distance, CAMERA_3D_DISTANCE_MAX),
      );
      saveCameraState();
    }
  };

  const applyPan = (deltaX: number, deltaY: number): void => {
    if (mmdCamera.position) {
      const panSpeed =
        Math.abs(mmdCamera.distance) * CAMERA_PAN_SPEED_MULTIPLIER;
      mmdCamera.position.x -= deltaX * panSpeed;
      mmdCamera.position.y += deltaY * panSpeed;
      saveCameraState();
    }
  };

  const applyRotation = (deltaX: number, deltaY: number): void => {
    mmdCamera.rotation.y -= deltaX * CAMERA_ROTATION_SENSITIVITY;
    mmdCamera.rotation.x -= deltaY * CAMERA_ROTATION_SENSITIVITY;
    saveCameraState();
  };

  const saveCameraState = (): void => {
    if (!finalConfig.updateUIConfig) return;
    if (!cameraSaveEnabled) return;

    const positionManager = scene.metadata?.positionManager;
    const currentMode =
      mmdCamera.mode === Camera.PERSPECTIVE_CAMERA ? "3D" : "2D";

    if (currentMode === "3D") {
      const state = {
        distance: mmdCamera.distance,
        rotation: { x: mmdCamera.rotation.x, y: mmdCamera.rotation.y },
        position: { x: mmdCamera.position.x, y: mmdCamera.position.y },
      };
      Logger.log("MmdModelScene", "Saving 3D camera state:", state);
      finalConfig.updateUIConfig("camera.saved3D", state);
    } else {
      if (!positionManager) {
        Logger.warn(
          "MmdModelScene",
          "Cannot save 2D camera state - positionManager not initialized",
        );
        return;
      }
      const state = {
        modelHeightPx: positionManager.modelHeightPx,
        positionX: positionManager.positionX,
        positionY: positionManager.positionY,
        rotation: { x: mmdCamera.rotation.x, y: mmdCamera.rotation.y },
      };
      Logger.log("MmdModelScene", "Saving 2D camera state:", state);
      finalConfig.updateUIConfig("camera.saved2D", state);
    }
  };

  const loadCameraState = (): void => {
    if (!cameraSaveEnabled) return;

    const positionManager = scene.metadata?.positionManager;
    const currentMode =
      mmdCamera.mode === Camera.PERSPECTIVE_CAMERA ? "3D" : "2D";

    if (currentMode === "3D") {
      const saved = finalConfig.uiConfig?.camera?.saved3D;
      if (saved) {
        mmdCamera.distance = saved.distance ?? CAMERA_3D_DISTANCE;
        if (saved.rotation) {
          mmdCamera.rotation.x = saved.rotation.x ?? 0;
          mmdCamera.rotation.y = saved.rotation.y ?? 0;
        }
        if (saved.position && mmdCamera.position) {
          mmdCamera.position.x = saved.position.x ?? 0;
          mmdCamera.position.y = saved.position.y ?? 0;
        }
        Logger.log("MmdModelScene", "Loaded saved 3D camera state");
      }
    } else {
      const saved = finalConfig.uiConfig?.camera?.saved2D;
      if (saved && positionManager) {
        if (saved.modelHeightPx) {
          positionManager.modelHeightPx = saved.modelHeightPx;
          positionManager.modelWidthPx =
            saved.modelHeightPx * CAMERA_2D_ASPECT_RATIO;
          positionManager.effectiveHeightPx = saved.modelHeightPx;
        }
        if (saved.positionX !== undefined)
          positionManager.positionX = saved.positionX;
        if (saved.positionY !== undefined)
          positionManager.positionY = saved.positionY;
        if (saved.rotation) {
          mmdCamera.rotation.x = saved.rotation.x ?? 0;
          mmdCamera.rotation.y = saved.rotation.y ?? 0;
        }
        positionManager.updateCameraFrustum();
        Logger.log("MmdModelScene", "Loaded saved 2D camera state");
      }
    }
  };

  const resetCameraState = (): void => {
    const positionManager = scene.metadata?.positionManager;
    const currentMode =
      mmdCamera.mode === Camera.PERSPECTIVE_CAMERA ? "3D" : "2D";

    if (currentMode === "3D") {
      mmdCamera.distance = CAMERA_3D_DISTANCE;
      mmdCamera.rotation.x = 0;
      mmdCamera.rotation.y = 0;
      if (mmdCamera.position) {
        mmdCamera.position.x = 0;
        mmdCamera.position.y = 10;
      }
      Logger.log("MmdModelScene", "Reset 3D camera to defaults");
    } else {
      if (positionManager) {
        // Reset by re-applying the preset with current saved zoom (if any)
        const modelSizePx = finalConfig.uiConfig?.modelSizePx;
        positionManager.applyPreset(actualPreset, {
          modelSizePx: modelSizePx || undefined,
        });

        mmdCamera.rotation.x = 0;
        mmdCamera.rotation.y = 0;
        Logger.log(
          "MmdModelScene",
          `Reset 2D camera using preset: ${actualPreset}`,
        );
      }
    }

    // Save the reset state if save is enabled
    if (cameraSaveEnabled) {
      saveCameraState();
    }
  };

  const attachCameraControls = (): void => {
    if (canvas.style.pointerEvents === "none") {
      canvas.style.pointerEvents = "auto";
      Logger.log(
        "MmdModelScene",
        "Canvas pointer events enabled for camera controls",
      );
    }
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("touchstart", onPointerDown, { passive: false });
    canvas.addEventListener("touchmove", onPointerMove, { passive: false });
    canvas.addEventListener("touchend", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
  };

  const detachCameraControls = (): void => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("touchstart", onPointerDown);
    canvas.removeEventListener("touchmove", onPointerMove);
    canvas.removeEventListener("touchend", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
  };

  const setCameraMode = (mode: CameraMode): void => {
    if (mode === "3D") {
      mmdCamera.mode = Camera.PERSPECTIVE_CAMERA;
      mmdCamera.distance = CAMERA_3D_DISTANCE;
    } else {
      mmdCamera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      mmdCamera.distance = cameraDistance;
      // Reset frustum to default size
      const aspectRatio = engine.getAspectRatio(mmdCamera);
      mmdCamera.orthoTop = orthoHeight;
      mmdCamera.orthoBottom = -orthoHeight;
      mmdCamera.orthoLeft = -orthoHeight * aspectRatio;
      mmdCamera.orthoRight = orthoHeight * aspectRatio;
    }
  };

  // Set initial mode
  setCameraMode(initialCameraMode);
  Logger.log(
    "MmdModelScene",
    `Camera initialized in ${initialCameraMode} mode with distance: ${mmdCamera.distance}`,
  );

  // Camera lock state and manual control
  let isCameraLocked = initialCameraLocked;
  let isPointerDown = false;
  let isPanning = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let initialPinchDistance = 0;
  let isPinching = false;

  const getTouchDistance = (touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (
    touch1: Touch,
    touch2: Touch,
  ): { x: number; y: number } => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    };
  };

  type CameraPointerEvent = PointerEvent | TouchEvent;

  const isTouchEvent = (event: CameraPointerEvent): event is TouchEvent => {
    return "touches" in event;
  };

  const getPrimaryPoint = (
    event: CameraPointerEvent,
  ): { x: number; y: number } | null => {
    if (isTouchEvent(event)) {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (!touch) return null;
      return { x: touch.clientX, y: touch.clientY };
    }
    return { x: event.clientX, y: event.clientY };
  };

  const onPointerDown = (evt: CameraPointerEvent): void => {
    if (isCameraLocked) return;

    // Check for multi-touch (pinch zoom or pan)
    if (isTouchEvent(evt) && evt.touches.length === 2) {
      const touchA = evt.touches[0];
      const touchB = evt.touches[1];
      if (!touchA || !touchB) return;
      isPinching = true;
      initialPinchDistance = getTouchDistance(touchA, touchB);
      const center = getTouchCenter(touchA, touchB);
      lastPointerX = center.x;
      lastPointerY = center.y;
      isPointerDown = false; // Disable rotation during pinch
      return;
    }

    // Middle mouse button for panning
    if (!isTouchEvent(evt) && evt.button === 1) {
      isPanning = true;
      lastPointerX = evt.clientX;
      lastPointerY = evt.clientY;
      evt.preventDefault();
      return;
    }

    // Left mouse button or single touch for rotation
    if (isTouchEvent(evt) || evt.button === 0) {
      const point = getPrimaryPoint(evt);
      if (!point) return;
      isPointerDown = true;
      lastPointerX = point.x;
      lastPointerY = point.y;
    }
  };

  const onPointerMove = (evt: CameraPointerEvent): void => {
    if (isCameraLocked) return;

    // Handle pinch zoom and pan
    if (isTouchEvent(evt) && evt.touches.length === 2) {
      const touchA = evt.touches[0];
      const touchB = evt.touches[1];
      if (!touchA || !touchB) return;

      if (!isPinching) {
        isPinching = true;
        initialPinchDistance = getTouchDistance(touchA, touchB);
        const center = getTouchCenter(touchA, touchB);
        lastPointerX = center.x;
        lastPointerY = center.y;
        return;
      }

      const currentPinchDistance = getTouchDistance(touchA, touchB);
      const delta =
        (currentPinchDistance - initialPinchDistance) *
        CAMERA_PINCH_SENSITIVITY;

      applyZoom(delta);

      // Pan based on center movement
      const center = getTouchCenter(touchA, touchB);
      const deltaX = center.x - lastPointerX;
      const deltaY = center.y - lastPointerY;

      applyPan(deltaX, deltaY);

      initialPinchDistance = currentPinchDistance;
      lastPointerX = center.x;
      lastPointerY = center.y;
      evt.preventDefault();
      return;
    }

    if (isTouchEvent(evt)) return;

    // Handle panning with middle mouse
    if (isPanning) {
      const deltaX = evt.clientX - lastPointerX;
      const deltaY = evt.clientY - lastPointerY;

      applyPan(deltaX, deltaY);

      lastPointerX = evt.clientX;
      lastPointerY = evt.clientY;
      evt.preventDefault();
      return;
    }

    // Handle rotation
    if (!isPointerDown || isPinching) return;

    const clientX = evt.clientX;
    const clientY = evt.clientY;

    const deltaX = clientX - lastPointerX;
    const deltaY = clientY - lastPointerY;

    applyRotation(deltaX, deltaY);

    lastPointerX = clientX;
    lastPointerY = clientY;
  };

  const onPointerUp = (): void => {
    isPointerDown = false;
    isPinching = false;
    isPanning = false;
  };

  const onWheel = (evt: WheelEvent): void => {
    if (isCameraLocked) return;
    evt.preventDefault();

    const delta = evt.deltaY > 0 ? 2 : -2;
    applyZoom(delta);
  };

  // Camera control functions (exposed for UI components like ChatButton)
  scene.metadata.toggleCameraMode = () => {
    const currentMode =
      mmdCamera.mode === Camera.PERSPECTIVE_CAMERA ? "3D" : "2D";
    const newMode = currentMode === "2D" ? "3D" : "2D";

    setCameraMode(newMode);
    loadCameraState();

    Logger.log(
      "MmdModelScene",
      `Camera mode toggled: ${currentMode} → ${newMode}, distance: ${mmdCamera.distance}`,
    );

    if (finalConfig.updateUIConfig) {
      finalConfig.updateUIConfig("camera.mode", newMode);
    }

    return newMode;
  };

  scene.metadata.getCameraMode = () => {
    return mmdCamera.mode === Camera.PERSPECTIVE_CAMERA ? "3D" : "2D";
  };

  scene.metadata.resetCameraPosition = () => {
    resetCameraState();
    return true;
  };

  scene.metadata.toggleCameraSave = () => {
    const newSaveState = !cameraSaveEnabled;
    cameraSaveEnabled = newSaveState;

    if (finalConfig.updateUIConfig) {
      finalConfig.updateUIConfig("camera.savePosition", newSaveState);
    }

    if (!newSaveState) {
      resetCameraState();
    } else {
      saveCameraState();
    }

    Logger.log(
      "MmdModelScene",
      `Camera save ${newSaveState ? "enabled" : "disabled"}`,
    );
    return newSaveState;
  };

  scene.metadata.isCameraSaveEnabled = () => {
    return cameraSaveEnabled;
  };

  scene.metadata.toggleCameraLock = () => {
    isCameraLocked = !isCameraLocked;

    if (isCameraLocked) {
      detachCameraControls();
      Logger.log(
        "MmdModelScene",
        "Camera locked (manual rotation/zoom disabled)",
      );
    } else {
      attachCameraControls();
      canvas.style.pointerEvents = "auto";
      Logger.log(
        "MmdModelScene",
        "Camera unlocked (manual rotation/zoom enabled)",
      );
    }

    if (finalConfig.updateUIConfig) {
      finalConfig.updateUIConfig("camera.locked", isCameraLocked);
    }

    return isCameraLocked;
  };

  scene.metadata.isCameraLocked = () => {
    return isCameraLocked;
  };

  // ========================================
  // LIGHTING
  // ========================================

  // Create lights
  const hemisphericLight = new HemisphericLight(
    "hemisphericLight",
    new Vector3(0, 1, 0),
    scene,
  );
  hemisphericLight.intensity = 0.3;
  hemisphericLight.specular.set(0, 0, 0);
  hemisphericLight.groundColor.set(1, 1, 1);

  const directionalLight = new DirectionalLight(
    "directionalLight",
    new Vector3(0.5, -1, 1),
    scene,
  );
  directionalLight.intensity = 0.7;
  directionalLight.autoCalcShadowZBounds = false;
  directionalLight.autoUpdateExtends = false;
  directionalLight.shadowMaxZ = 30;
  directionalLight.shadowMinZ = -20;
  directionalLight.orthoTop = 20;
  directionalLight.orthoBottom = -10;
  directionalLight.orthoLeft = -20;
  directionalLight.orthoRight = 20;
  directionalLight.shadowOrthoScale = 0;

  // Create shadow generator
  const shadowGenerator = finalConfig.enableShadows
    ? new ShadowGenerator(2048, directionalLight, true)
    : null;
  if (shadowGenerator) {
    shadowGenerator.usePercentageCloserFiltering = true;
    shadowGenerator.forceBackFacesOnly = false;
    shadowGenerator.bias = 0.01;
    shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
    shadowGenerator.frustumEdgeFalloff = 0.1;
    shadowGenerator.transparencyShadow = true;
  }

  // Create ground
  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: 60, height: 60 },
    scene,
  );
  if (finalConfig.enableShadows) {
    ground.receiveShadows = true;
  }

  ground.visibility = 0;

  // Store ground in scene metadata so we can toggle it later
  scene.metadata = scene.metadata || {};
  scene.metadata.defaultGround = ground;

  // ========================================
  // MMD RUNTIME INITIALIZATION
  // ========================================

  const isExtension = import.meta.url.startsWith("chrome-extension://");

  const hasSharedArrayBuffer =
    typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated;

  const physicsEngine = finalConfig.uiConfig?.physicsEngine || "bullet";

  let physicsRuntime: MultiPhysicsRuntime | PhysicsRuntime | null = null;
  let mmdPhysics: MmdBulletPhysics | MmdPhysics | null = null;
  let isMultiThreadedPhysics = false;

  if (finalConfig.enablePhysics) {
    const useBullet = physicsEngine === "bullet";
    const canUseMultiThreadedBulletPhysics =
      !isExtension &&
      hasSharedArrayBuffer &&
      allowBulletPhysics &&
      allowMultiThreadedBulletPhysics;

    if (useBullet) {
      if (!allowBulletPhysics) {
        Logger.warn(
          "MmdModelScene",
          "Bullet physics was disabled after a previous initialization failure; continuing without physics",
        );
      } else if (canUseMultiThreadedBulletPhysics) {
        // Multi-threaded Bullet physics (faster, requires SharedArrayBuffer)
        Logger.log(
          "MmdModelScene",
          "Initializing Multi-threaded Bullet Physics...",
        );
        try {
          const wasmInstance = await GetMmdWasmInstance(
            new MmdWasmInstanceTypeMPR(),
          );
          physicsRuntime = new MultiPhysicsRuntime(wasmInstance);
          physicsRuntime.setGravity(new Vector3(0, -98, 0)); // MMD uses 10x gravity
          physicsRuntime.register(scene);
          mmdPhysics = new MmdBulletPhysics(physicsRuntime);
          isMultiThreadedPhysics = true;
          Logger.log(
            "MmdModelScene",
            "✓ Multi-threaded Bullet Physics initialized",
          );
        } catch (error) {
          Logger.error(
            "MmdModelScene",
            "Failed to initialize Multi-threaded Bullet Physics:",
            error,
          );
          Logger.warn(
            "MmdModelScene",
            "Falling back to single-threaded mode...",
          );
          allowMultiThreadedBulletPhysics = false;
        }
      }

      // Fall back to single-threaded if multi-threaded failed or SharedArrayBuffer not available
      if (!mmdPhysics && allowBulletPhysics) {
        Logger.log(
          "MmdModelScene",
          `Initializing Single-threaded Bullet Physics (${isExtension ? "Extension/Page mode" : "Android/WebView mode"})...`,
        );
        try {
          const wasmInstance = await GetMmdWasmInstance(
            new MmdWasmInstanceTypeSPR(),
          );
          physicsRuntime = new PhysicsRuntime(wasmInstance);
          physicsRuntime.setGravity(new Vector3(0, -98, 0)); // MMD uses 10x gravity
          physicsRuntime.register(scene);
          mmdPhysics = new MmdBulletPhysics(
            physicsRuntime as unknown as MultiPhysicsRuntime,
          );
          isMultiThreadedPhysics = false;
          Logger.log(
            "MmdModelScene",
            "✓ Single-threaded Bullet Physics initialized",
          );
        } catch (error) {
          Logger.error(
            "MmdModelScene",
            "Failed to initialize Single-threaded Bullet Physics:",
            error,
          );
          Logger.warn("MmdModelScene", "Continuing without physics");
          allowBulletPhysics = false;
        }
      }
    } else if (isExtension) {
      Logger.log("MmdModelScene", "Initializing Havok Physics...");
      try {
        mmdPhysics = new MmdPhysics(scene);
        Logger.log("MmdModelScene", "✓ Havok Physics initialized");
      } catch (error) {
        Logger.error(
          "MmdModelScene",
          "Failed to initialize Havok Physics:",
          error,
        );
        Logger.warn("MmdModelScene", "Continuing without physics");
      }
    }
  }

  // Initialize MMD Runtime with physics
  const mmdRuntime = new MmdRuntime(scene, mmdPhysics);
  mmdRuntime.loggingEnabled = true;
  mmdRuntime.register(scene);

  // BVMD Loader
  const bvmdLoader = new BvmdLoader(scene);
  bvmdLoader.loggingEnabled = false;

  const vmdLoader = new VmdLoader(scene);
  vmdLoader.loggingEnabled = false;

  // Material builder with outline support
  const materialBuilder = new MmdStandardMaterialBuilder();
  // Let it load outline properties from the model

  // ========================================
  // MODEL LOADING (ASYNC WITH PROGRESS)
  // ========================================

  const modelSource = finalConfig.customModelFile ?? finalConfig.modelUrl;

  Logger.log(
    "MmdModelScene",
    "Loading model from:",
    finalConfig.customModelFile
      ? `custom file ${finalConfig.customModelFile.name}`
      : finalConfig.modelUrl,
  );

  let modelMesh: Mesh | null = null;
  let mmdModel: MmdModelLike | null = null;

  try {
    // Load model with progress tracking (no built-in loading UI)
    // For blob URLs from custom models, LoadAssetContainerAsync can load directly
    const result = await LoadAssetContainerAsync(modelSource, scene, {
      // Specify plugin explicitly for custom model files
      ...(finalConfig.modelFileName ? { pluginExtension: ".bpmx" } : {}),
      pluginOptions: {
        mmdmodel: {
          materialBuilder: materialBuilder,
          boundingBoxMargin: 60,
          loggingEnabled: true,
        },
      },
      // Progress callback
      onProgress: (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          Logger.log("MmdModelScene", `Model loading: ${progress.toFixed(1)}%`);

          // Call user's progress callback
          if (finalConfig.onLoadProgress) {
            finalConfig.onLoadProgress(progress);
          }
        }
      },
    });

    Logger.log("MmdModelScene", "Model loaded, adding to scene...");

    // Add model to scene
    result.addAllToScene();
    modelMesh = (result.meshes[0] as Mesh | undefined) ?? null;
    if (!modelMesh) {
      throw new Error("Model loaded but no root mesh was returned");
    }

    Logger.log("MmdModelScene", "Model added to scene successfully");

    // ========================================
    // EXTRACT AND SAVE TEXTURE/MESH METADATA
    // ========================================
    // Check if we need to populate texture/mesh metadata for this model
    if (finalConfig.modelId) {
      try {
        Logger.log(
          "MmdModelScene",
          "Checking if model metadata needs population...",
        );

        // Get current model data from storage
        const currentModel = await modelStorageService.getModel(
          finalConfig.modelId,
        );

        // Check if textures and meshParts metadata already exists
        const needsMetadata =
          !currentModel?.metadata?.textures ||
          !currentModel?.metadata?.meshParts;

        if (needsMetadata) {
          Logger.log(
            "MmdModelScene",
            "Extracting texture and mesh metadata from loaded model...",
          );

          // Extract metadata using the same function from PMXConverterService
          const modelMetadata =
            pmxConverterService.extractModelMetadata(modelMesh);

          Logger.log(
            "MmdModelScene",
            `Extracted ${modelMetadata.textures.length} textures and ${modelMetadata.meshParts.length} mesh parts`,
          );

          // Update model metadata in storage
          await modelStorageService.updateModelMetadata(finalConfig.modelId, {
            textures: modelMetadata.textures,
            meshParts: modelMetadata.meshParts,
          });

          Logger.log("MmdModelScene", "✓ Model metadata saved to storage");
        } else {
          Logger.log(
            "MmdModelScene",
            "Model already has texture/mesh metadata, skipping extraction",
          );
        }
      } catch (error) {
        Logger.warn(
          "MmdModelScene",
          "Failed to extract/save model metadata:",
          error,
        );
        // Don't throw - this is not critical for scene loading
      }
    }
    // ========================================

    // Call user's model loaded callback
    if (finalConfig.onModelLoaded) {
      finalConfig.onModelLoaded(modelMesh);
    }
  } catch (error: unknown) {
    Logger.error("MmdModelScene", "Failed to load model:", error);
    throw new Error(`Failed to load MMD model: ${getErrorMessage(error)}`);
  }

  // ========================================
  // STAGE LOADING
  // ========================================

  let stageMesh: Mesh | null = null;

  const loadStageFromSource = async (
    stageSource: string,
    stageLabel: string,
  ): Promise<Mesh> => {
    const stageResult = await LoadAssetContainerAsync(stageSource, scene, {
      pluginExtension: ".bpmx",
      pluginOptions: {
        mmdmodel: {
          materialBuilder: materialBuilder,
          boundingBoxMargin: 60,
          loggingEnabled: true,
        },
      },
      onProgress: (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          Logger.log("MmdModelScene", `Stage loading: ${progress.toFixed(1)}%`);
        }
      },
    });

    Logger.log("MmdModelScene", "Stage loaded, adding to scene...");

    stageResult.addAllToScene();
    const loadedStageMesh = (stageResult.meshes[0] as Mesh | undefined) ?? null;
    if (!loadedStageMesh) {
      throw new Error(
        `Stage \"${stageLabel}\" loaded but no root mesh was returned`,
      );
    }

    return loadedStageMesh;
  };

  try {
    if (finalConfig.stageUrl === null) {
      Logger.log(
        "MmdModelScene",
        "Stage loading skipped by embed configuration",
      );
    } else if (finalConfig.stageUrl) {
      Logger.log(
        "MmdModelScene",
        `Loading embed-configured stage: ${finalConfig.stageUrl}`,
      );

      stageMesh = await loadStageFromSource(
        finalConfig.stageUrl,
        "embed-configured stage",
      );
    } else {
      const defaultStage = await stageStorageService.getDefaultStage();

      if (defaultStage && defaultStage.stageData) {
        Logger.log("MmdModelScene", `Loading stage: ${defaultStage.name}`);

        const stageBlobUrl = URL.createObjectURL(defaultStage.stageData);

        try {
          stageMesh = await loadStageFromSource(
            stageBlobUrl,
            defaultStage.name,
          );
        } finally {
          URL.revokeObjectURL(stageBlobUrl);
        }

        Logger.log(
          "MmdModelScene",
          `✓ Stage "${defaultStage.name}" loaded successfully`,
        );
      } else {
        Logger.log(
          "MmdModelScene",
          "No default stage selected, using default ground plane",
        );
      }
    }

    if (stageMesh) {
      // Setup stage shadows
      if (finalConfig.enableShadows && shadowGenerator) {
        const stageMetadata = stageMesh.metadata as
          | MeshMetadataState
          | undefined;
        const stageMeshes = Array.isArray(stageMetadata?.meshes)
          ? stageMetadata.meshes
          : [stageMesh];
        for (const mesh of stageMeshes) {
          mesh.receiveShadows = true;
          shadowGenerator.addShadowCaster(mesh, false);
        }
      }

      // Parent stage to mmdRoot
      stageMesh.parent = mmdRoot;

      // Store stage in scene metadata
      scene.metadata.stageMesh = stageMesh;

      // Hide default ground when stage is loaded
      if (scene.metadata.defaultGround) {
        scene.metadata.defaultGround.setEnabled(false);
        Logger.log("MmdModelScene", "Default ground hidden (stage is active)");
      }
    }
  } catch (error) {
    Logger.error("MmdModelScene", "Failed to load stage:", error);
    // Don't throw - fall back to default ground
    Logger.warn("MmdModelScene", "Falling back to default ground plane");
  }

  // ========================================
  // SCENE PHYSICS INITIALIZATION (for ground collider)
  // ========================================

  if (finalConfig.enablePhysics) {
    const useBullet = !isExtension && physicsEngine === "bullet";

    if (!useBullet) {
      Logger.log("MmdModelScene", "Initializing Havok scene physics...");
      try {
        const havokInstance = await havokPhysics();
        const havokPlugin = new HavokPlugin(true, havokInstance);
        scene.enablePhysics(new Vector3(0, -9.8 * 10, 0), havokPlugin);
        Logger.log("MmdModelScene", "Havok scene physics initialized");
      } catch (error) {
        if (isExtension && isWasmCspError(error)) {
          Logger.warn(
            "MmdModelScene",
            "Havok blocked by host-page CSP in extension mode. Disabling physics for this session.",
          );
          mmdPhysics = null;
        } else {
          throw error;
        }
      }
    } else if (physicsRuntime) {
      Logger.log("MmdModelScene", "Adding Bullet ground collider...");
      const info = new RigidBodyConstructionInfo(physicsRuntime.wasmInstance);
      info.motionType = MotionType.Static;
      info.shape = new PhysicsStaticPlaneShape(
        physicsRuntime,
        new Vector3(0, 1, 0),
        0,
      );
      const groundBody = new RigidBody(physicsRuntime, info);

      if (isMultiThreadedPhysics) {
        (physicsRuntime as MultiPhysicsRuntime).addRigidBodyToGlobal(
          groundBody,
        );
      } else {
        (physicsRuntime as PhysicsRuntime).addRigidBody(groundBody);
      }
      Logger.log("MmdModelScene", "Bullet ground collider added");
    }
  }

  // ========================================
  // MODEL CONFIGURATION
  // ========================================

  // Setup model shadows
  if (finalConfig.enableShadows && shadowGenerator) {
    const modelMetadata = modelMesh.metadata as MeshMetadataState | undefined;
    const modelMeshes = Array.isArray(modelMetadata?.meshes)
      ? modelMetadata.meshes
      : [modelMesh];
    for (const mesh of modelMeshes) {
      mesh.receiveShadows = true;
      shadowGenerator.addShadowCaster(mesh, false);
    }
  }

  modelMesh.parent = mmdRoot;

  // Create MMD model
  mmdModel = mmdRuntime.createMmdModel(modelMesh, {
    buildPhysics: mmdPhysics !== null && mmdPhysics !== undefined,
  }) as unknown as MmdModelLike;

  // Enable and configure outline rendering on all materials
  const modelMetadata = modelMesh.metadata as MeshMetadataState | undefined;
  const modelMeshes = Array.isArray(modelMetadata?.meshes)
    ? modelMetadata.meshes
    : [modelMesh];
  for (const mesh of modelMeshes) {
    const material = mesh.material as MaterialWithState | null | undefined;
    if (material) {
      material.renderOutline = true;
      material.outlineWidth = 0.5; // Increase thickness (default is 0.01)
      if (material.outlineColor) {
        material.outlineColor.set(0, 0, 0); // Black outline
      }
      material.outlineAlpha = 1.0; // Full opacity
    }
  }

  Logger.log("MmdModelScene", "MMD model created with outlines enabled");

  // ========================================
  // APPLY SAVED TEXTURE/MESH STATES
  // ========================================
  // Apply saved texture and mesh visibility states from metadata
  // This runs AFTER model is fully loaded and materials are set up
  if (finalConfig.modelId) {
    try {
      Logger.log("MmdModelScene", "Applying saved texture and mesh states...");

      const currentModel = await modelStorageService.getModel(
        finalConfig.modelId,
      );

      if (
        currentModel?.metadata?.textures ||
        currentModel?.metadata?.meshParts
      ) {
        // Collect all materials using the same logic as extraction
        const materials: MaterialWithState[] = [];
        const runtimeModelMetadata = modelMesh.metadata as
          | MeshMetadataState
          | undefined;

        if (Array.isArray(runtimeModelMetadata?.materials)) {
          materials.push(...runtimeModelMetadata.materials);
        }

        const rootMaterial = modelMesh.material as
          | MaterialWithState
          | null
          | undefined;
        if (rootMaterial && !materials.includes(rootMaterial)) {
          materials.push(rootMaterial);
        }

        if (modelMesh.subMeshes) {
          modelMesh.subMeshes.forEach((subMesh) => {
            if (subMesh.getMaterial && subMesh.getMaterial()) {
              const subMaterial =
                subMesh.getMaterial() as MaterialWithState | null;
              if (subMaterial && !materials.includes(subMaterial)) {
                materials.push(subMaterial);
              }
            }
          });
        }

        Logger.log(
          "MmdModelScene",
          `Found ${materials.length} materials for texture application`,
        );

        // Apply texture states - store original textures and toggle disabled ones to null
        const textureStates = toTextureStates(currentModel.metadata.textures);
        if (textureStates.length > 0) {
          let appliedCount = 0;
          for (const textureData of textureStates) {
            if (textureData.materialIndex >= materials.length) {
              Logger.warn(
                "MmdModelScene",
                `Texture material index ${textureData.materialIndex} out of bounds`,
              );
              continue;
            }

            const material = materials[textureData.materialIndex];
            if (!material) continue;

            // Store original texture reference if not already stored
            // This is critical for toggling later
            const textureKey = `_original_${textureData.type}_texture`;

            if (textureData.type === "diffuse" && material.diffuseTexture) {
              if (!material[textureKey]) {
                material[textureKey] = material.diffuseTexture;
              }
              if (!textureData.isActive) {
                material.diffuseTexture = null;
                appliedCount++;
              }
            } else if (
              textureData.type === "sphere" &&
              material.sphereTexture
            ) {
              if (!material[textureKey]) {
                material[textureKey] = material.sphereTexture;
              }
              if (!textureData.isActive) {
                material.sphereTexture = null;
                appliedCount++;
              }
            } else if (textureData.type === "toon" && material.toonTexture) {
              if (!material[textureKey]) {
                material[textureKey] = material.toonTexture;
              }
              if (!textureData.isActive) {
                material.toonTexture = null;
                appliedCount++;
              }
            }
          }
          Logger.log(
            "MmdModelScene",
            `Applied ${appliedCount} disabled texture states`,
          );
        }

        // Apply mesh visibility states
        const meshPartStates = toMeshPartStates(
          currentModel.metadata.meshParts,
        );
        const meshStateMetadata = modelMesh.metadata as
          | MeshMetadataState
          | undefined;
        if (
          meshPartStates.length > 0 &&
          Array.isArray(meshStateMetadata?.meshes)
        ) {
          let appliedCount = 0;
          for (const meshPart of meshPartStates) {
            if (!meshPart.isVisible) {
              const mesh = meshStateMetadata.meshes[meshPart.meshIndex];
              if (mesh) {
                if (
                  meshPart.type === "submesh" &&
                  meshPart.subMeshIndex !== undefined
                ) {
                  // For submeshes, toggle via material alpha
                  if (mesh.subMeshes && mesh.subMeshes[meshPart.subMeshIndex]) {
                    const subMesh = mesh.subMeshes[meshPart.subMeshIndex];
                    const material = (
                      subMesh?.getMaterial
                        ? subMesh.getMaterial()
                        : mesh.material
                    ) as MaterialWithState | null | undefined;
                    if (material) {
                      if (!material._originalAlpha) {
                        material._originalAlpha =
                          material.alpha !== undefined ? material.alpha : 1;
                      }
                      material.alpha = 0;
                      material._isHidden = true;
                      appliedCount++;
                    }
                  }
                } else {
                  // For main meshes, use setEnabled
                  mesh.setEnabled(false);
                  appliedCount++;
                }
              }
            }
          }
          Logger.log(
            "MmdModelScene",
            `Applied ${appliedCount} hidden mesh states`,
          );
        }

        Logger.log("MmdModelScene", "✓ Saved states applied successfully");
      }
    } catch (error) {
      Logger.warn("MmdModelScene", "Failed to apply saved states:", error);
      // Don't throw - this is not critical
    }
  }
  // ========================================

  // ========================================
  // ANIMATION MANAGER INTEGRATION
  // ========================================

  Logger.log("MmdModelScene", "Initializing AnimationManager...");

  const animationManager = new AnimationManager(
    scene,
    mmdRuntime,
    mmdModel,
    bvmdLoader as unknown as AnimationLoaderLike,
    vmdLoader as unknown as AnimationLoaderLike,
    finalConfig.getRandomAnimation,
    finalConfig.getEnabledAnimations,
  );

  // Initialize scene metadata if null
  if (!scene.metadata) {
    scene.metadata = {};
  }

  // Store AnimationManager in scene metadata for cross-manager communication
  scene.metadata.animationManager = animationManager;

  // Get position preset BEFORE initializing AnimationManager
  // so intro animation can be flipped if model is on left side
  const positionConfig = finalConfig.uiConfig?.position || {
    preset: "bottom-right",
  };
  const preset = positionConfig.preset || "bottom-right";
  // Use the actual preset directly (last-location preset now exists in config)
  const actualPreset = preset;

  // Portrait Mode - Use clipping plane to hide lower body
  // Get clipping plane Y value from config (model-specific) or preset
  if (isPortraitMode) {
    // Use portrait clipping from model metadata (via config) or fall back to preset
    let clipPlaneY = finalConfig.portraitClipping ?? 12;

    // If no custom value, try preset
    if (clipPlaneY === 12) {
      const { PositionPresets } = await import("../../config/uiConfig");
      const presetData = (
        PositionPresets as Record<string, PositionPresetLike>
      )[actualPreset];
      clipPlaneY = presetData?.portraitClipPlaneY ?? 12;
    }

    Logger.log(
      "MmdModelScene",
      `Portrait Mode enabled - setting up clipping plane at Y = ${clipPlaneY}`,
    );

    // Create a clipping plane at specified height
    // Normal pointing DOWN (0,-1,0) clips everything BELOW the Y coordinate
    const clipPlane = new Plane(0, -1, 0, clipPlaneY);
    scene.clipPlane = clipPlane;

    // Store clipping plane Y value in metadata for debug panel access
    scene.metadata.portraitClipPlaneY = clipPlaneY;

    // Store Portrait Mode flag in scene metadata
    scene.metadata.isPortraitMode = true;

    Logger.log(
      "MmdModelScene",
      `Portrait Mode: Clipping plane set at Y = ${clipPlaneY}`,
    );
  }

  // Determine if we should skip intro
  // Skip for: center positions, last-location, Portrait Mode, Android, OR if we have savedModelPosition (model already loaded before)
  const shouldSkipIntro =
    preset.includes("center") ||
    preset === "last-location" ||
    isPortraitMode ||
    isAndroid ||
    isDesktop ||
    finalConfig.savedModelPosition !== null; // Skip intro if model already loaded in this session

  Logger.log(
    "MmdModelScene",
    `Position preset: ${preset}, actual: ${actualPreset}, skipIntro: ${shouldSkipIntro}${isPortraitMode ? " (Portrait Mode)" : ""}${finalConfig.savedModelPosition ? " (has saved position)" : ""}`,
  );

  // Initialize animation system
  // Skip intro for center positions (model just appears in place)
  // Pass position preset so intro can be flipped for left-side positions
  await animationManager.initialize(!shouldSkipIntro, actualPreset);

  Logger.log("MmdModelScene", "AnimationManager initialized and running");

  // ========================================
  // POSITION MANAGER INTEGRATION
  // ========================================

  Logger.log("MmdModelScene", "Initializing PositionManager...");

  const positionManager = new PositionManager(
    scene,
    mmdCamera,
    canvas,
    finalConfig.positionConfig,
  );

  // Store in metadata BEFORE initializing so AnimationManager can find it
  scene.metadata = scene.metadata || {};
  scene.metadata.positionManager = positionManager;

  // Initialize positioning system with saved preset/location from uiConfig
  Logger.log(
    "MmdModelScene",
    "Initializing PositionManager with config:",
    positionConfig,
  );
  Logger.log("MmdModelScene", "uiConfig:", finalConfig.uiConfig);
  Logger.log(
    "MmdModelScene",
    "savedModelPosition from context:",
    finalConfig.savedModelPosition,
  );

  // Priority: savedModelPosition from context > lastLocation from config > preset
  // savedModelPosition persists across unmount/remount (tab visibility changes)
  const shouldUseSavedPosition =
    !isAndroid &&
    Boolean(
      finalConfig.savedModelPosition ||
      (preset === "last-location" && positionConfig.lastLocation),
    );

  if (shouldUseSavedPosition) {
    const savedPos = (finalConfig.savedModelPosition ||
      positionConfig.lastLocation) as SavedModelPositionLike;
    const { x, y, width, height, preset: savedPreset } = savedPos;
    Logger.log("MmdModelScene", "Loading saved position:", savedPos);

    // Setup PositionManager manually (without calling applyPreset which would fire wrong position event)
    positionManager.updateCanvasDimensions();
    positionManager.setupResizeHandler();

    // Store Portrait Mode state on PositionManager (needed for offset calculations)
    positionManager.isPortraitMode = isPortraitMode;

    // Get preset data for dimensions and offset
    const { PositionPresets } = await import("../../config/uiConfig");
    const presetToUse = savedPreset || actualPreset;
    const presetMap = PositionPresets as Record<string, PositionPresetLike>;
    const presetData = presetMap[presetToUse] ?? presetMap["bottom-right"];
    if (!presetData) {
      throw new Error(`Unknown position preset: ${presetToUse}`);
    }

    const modelSize =
      (isPortraitMode ? presetData.portraitModelSize : presetData.modelSize) ??
      presetData.modelSize;
    const finalWidth = width || modelSize.width;
    const finalHeight = height || modelSize.height;

    // Get the correct offset based on Portrait Mode
    const offset =
      isPortraitMode && presetData.portraitOffset
        ? presetData.portraitOffset
        : presetData.offset || { x: 0, y: 0 };

    // Apply two-height system for Portrait Mode
    let cameraHeight = finalHeight;
    let effectiveHeight = finalHeight;
    if (isPortraitMode) {
      cameraHeight = finalHeight * 3; // 1500px for zoom
      effectiveHeight = finalHeight; // 500px for positioning
    }

    Logger.log(
      "MmdModelScene",
      `Restoring position (${x}, ${y}) with size ${finalWidth}x${finalHeight}, offset:`,
      offset,
    );
    positionManager.setPositionPixels(
      x,
      y,
      finalWidth,
      cameraHeight,
      effectiveHeight,
      offset,
    );
  } else {
    Logger.log(
      "MmdModelScene",
      "Using preset:",
      actualPreset,
      isAndroid ? "(Android mode)" : "",
    );
    positionManager.initialize(actualPreset);

    const modelSizePx = finalConfig.uiConfig?.modelSizePx;
    if (modelSizePx && modelSizePx.width && modelSizePx.height) {
      Logger.log("MmdModelScene", "Applying saved zoom:", modelSizePx);

      const { PositionPresets } = await import("../../config/uiConfig");
      const presetConfig =
        (PositionPresets as Record<string, PositionPresetLike>)[actualPreset] ??
        (PositionPresets as Record<string, PositionPresetLike>)["bottom-right"];
      if (!presetConfig) {
        throw new Error(`Unknown position preset: ${actualPreset}`);
      }
      const padding = presetConfig.padding || 0;

      let pixelX, pixelY;
      const modelWidth = modelSizePx.width;
      const modelHeight = modelSizePx.height;
      const canvasWidth = positionManager.canvasWidth;
      const canvasHeight = positionManager.canvasHeight;

      switch (actualPreset) {
        case "bottom-right":
          pixelX = canvasWidth - modelWidth - padding;
          pixelY = canvasHeight - modelHeight - padding;
          break;
        case "bottom-left":
          pixelX = padding;
          pixelY = canvasHeight - modelHeight - padding;
          break;
        case "bottom-center":
          pixelX = (canvasWidth - modelWidth) / 2;
          pixelY = canvasHeight - modelHeight - padding;
          break;
        case "top-center":
          pixelX = (canvasWidth - modelWidth) / 2;
          pixelY = padding;
          break;
        case "center":
          pixelX = (canvasWidth - modelWidth) / 2;
          pixelY = (canvasHeight - modelHeight) / 2;
          break;
        case "top-left":
          pixelX = padding;
          pixelY = padding;
          break;
        case "top-right":
          pixelX = canvasWidth - modelWidth - padding;
          pixelY = padding;
          break;
        default:
          pixelX = (canvasWidth - modelWidth) / 2;
          pixelY = (canvasHeight - modelHeight) / 2;
      }

      positionManager.positionX = pixelX;
      positionManager.positionY = pixelY;
      positionManager.modelWidthPx = modelWidth;
      positionManager.modelHeightPx = modelHeight;
      positionManager.effectiveHeightPx = modelHeight;
      positionManager.updateCameraFrustum();

      Logger.log(
        "MmdModelScene",
        `Position recalculated for zoom: (${pixelX}, ${pixelY})`,
      );
    }
  }

  Logger.log("MmdModelScene", "PositionManager initialized");

  // Load saved camera state now that positionManager is ready
  loadCameraState();

  // Notify AnimationManager about PositionManager (for picking box creation)
  animationManager.setPositionManager(positionManager);

  // ========================================
  // POST-PROCESSING PIPELINE
  // ========================================

  const defaultPipeline = new DefaultRenderingPipeline("default", true, scene);

  // Get render quality from config (default to 'medium')
  const renderQuality = finalConfig.renderQuality || "medium";

  // Get quality settings - either custom or from presets
  let quality: RenderQualitySettingsLike;
  if (renderQuality === "custom" && finalConfig.customQuality) {
    quality = finalConfig.customQuality;
    Logger.log(
      "MmdModelScene",
      "Using custom render quality settings:",
      JSON.stringify(quality),
    );
  } else {
    const { getRenderQualityPresets } =
      await import("../../config/sceneConfig");
    const qualityPresets = getRenderQualityPresets(isAndroid);
    const qualityPresetMap = qualityPresets as Record<
      string,
      RenderQualitySettingsLike
    >;
    quality = qualityPresetMap[renderQuality] || qualityPresets.medium;
    Logger.log(
      "MmdModelScene",
      `Using preset quality: ${renderQuality}`,
      JSON.stringify(quality),
    );
  }

  // Apply quality settings
  defaultPipeline.samples = quality.samples;
  defaultPipeline.bloomEnabled = quality.bloomEnabled;
  if (quality.bloomEnabled) {
    defaultPipeline.bloomKernel = quality.bloomKernel;
    defaultPipeline.bloomScale = quality.bloomScale;
    defaultPipeline.bloomWeight = quality.bloomWeight;
    defaultPipeline.bloomThreshold = quality.bloomThreshold || 0.9;
  }

  defaultPipeline.chromaticAberrationEnabled = false;

  defaultPipeline.depthOfFieldEnabled = false;

  defaultPipeline.fxaaEnabled = quality.fxaaEnabled;

  defaultPipeline.imageProcessingEnabled = true;

  defaultPipeline.imageProcessing.toneMappingEnabled = true;
  defaultPipeline.imageProcessing.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_STANDARD;

  defaultPipeline.imageProcessing.vignetteEnabled = false;

  defaultPipeline.imageProcessing.contrast = quality.contrast || 1.2;
  defaultPipeline.imageProcessing.exposure = quality.exposure || 1.05;

  defaultPipeline.imageProcessing.colorCurvesEnabled = true;
  const colorCurves = new ColorCurves();
  colorCurves.globalSaturation = quality.saturation || 15;
  defaultPipeline.imageProcessing.colorCurves = colorCurves;

  Logger.log(
    "MmdModelScene",
    `Post-processing configured: quality=${renderQuality}, samples=${quality.samples}, bloom=${quality.bloomEnabled}, chromatic=${quality.chromaticAberrationEnabled}, isAndroid=${isAndroid}`,
  );

  // ========================================
  // CANVAS INTERACTION MANAGER
  // ========================================

  Logger.log("MmdModelScene", "Initializing CanvasInteractionManager...");

  const interactionManager = new CanvasInteractionManager(
    scene,
    canvas,
    modelMesh,
    isDesktop,
    finalConfig.desktopAPI,
  );
  interactionManager.initialize();

  // Drag state for smooth dragging
  let dragRAF: number | null = null;
  let accumulatedDeltaX = 0;
  let accumulatedDeltaY = 0;
  let dragBasePosition: PositionPixels | null = null;

  // Setup drag callbacks to work with PositionManager (only for web/extension mode)
  // In desktop mode, window dragging is handled in CanvasInteractionManager
  if (!isDesktop) {
    interactionManager.setDragCallbacks(
      // onDragStart
      (startX, startY) => {
        Logger.log("MmdModelScene", "Drag started at", startX, startY);
        dragBasePosition = positionManager.getPositionPixels();
        accumulatedDeltaX = 0;
        accumulatedDeltaY = 0;

        if (dragRAF) {
          cancelAnimationFrame(dragRAF);
          dragRAF = null;
        }
      },
      // onDrag - update smoothly
      (deltaX, deltaY) => {
        if (!dragBasePosition) return;

        // Accumulate all deltas since drag start
        accumulatedDeltaX += deltaX;
        accumulatedDeltaY += deltaY;

        positionManager.setPositionPixels(
          dragBasePosition.x + accumulatedDeltaX,
          dragBasePosition.y + accumulatedDeltaY,
          dragBasePosition.width,
          positionManager.modelHeightPx,
          positionManager.effectiveHeightPx,
          positionManager.offset,
        );
      },
      // onDragEnd
      (endX, endY) => {
        Logger.log("MmdModelScene", "Drag completed at", endX, endY);

        if (dragRAF) {
          cancelAnimationFrame(dragRAF);
          dragRAF = null;
        }

        // Apply final accumulated position
        if (dragBasePosition) {
          positionManager.setPositionPixels(
            dragBasePosition.x + accumulatedDeltaX,
            dragBasePosition.y + accumulatedDeltaY,
            dragBasePosition.width,
            positionManager.modelHeightPx,
            positionManager.effectiveHeightPx,
            positionManager.offset,
          );

          dragBasePosition = null;
          accumulatedDeltaX = 0;
          accumulatedDeltaY = 0;
        }
      },
    );
  }

  Logger.log(
    "MmdModelScene",
    `CanvasInteractionManager initialized (${isDesktop ? "desktop" : "web"} mode)`,
  );

  // ========================================
  // START ANIMATION
  // ========================================

  mmdRuntime.playAnimation();
  Logger.log("MmdModelScene", "Animation playback started");

  // ========================================
  // SCENE METADATA (FOR EXTERNAL ACCESS)
  // ========================================

  // Expose managers via scene metadata for external control
  scene.metadata.animationManager = animationManager;
  scene.metadata.interactionManager = interactionManager;
  scene.metadata.modelMesh = modelMesh;
  scene.metadata.mmdModel = mmdModel;
  scene.metadata.mmdRuntime = mmdRuntime;
  scene.metadata.mmdCamera = mmdCamera;
  scene.metadata.renderPipeline = defaultPipeline;

  // ========================================
  // CLEANUP
  // ========================================

  // Cleanup on scene dispose
  scene.onDisposeObservable.add(() => {
    Logger.log("MmdModelScene", "Scene disposing, cleaning up managers");

    try {
      mmdRuntime.dispose(scene);
    } catch (error) {
      Logger.warn(
        "MmdModelScene",
        "Failed to dispose MMD runtime cleanly:",
        error,
      );
    }

    animationManager.dispose();
    positionManager.dispose();
    interactionManager.dispose();

    // Dispose stage mesh if loaded
    if (scene.metadata.stageMesh) {
      Logger.log("MmdModelScene", "Disposing stage mesh");
      scene.metadata.stageMesh.dispose();
      scene.metadata.stageMesh = null;
    }
  });

  Logger.log("MmdModelScene", "Scene build complete");
  Logger.log(
    "MmdModelScene",
    "- AnimationManager accessible via scene.metadata.animationManager",
  );
  Logger.log(
    "MmdModelScene",
    "- PositionManager accessible via scene.metadata.positionManager",
  );
  Logger.log(
    "MmdModelScene",
    "- CanvasInteractionManager accessible via scene.metadata.interactionManager",
  );
  Logger.log(
    "MmdModelScene",
    "- Model accessible via scene.metadata.modelMesh and scene.metadata.mmdModel",
  );

  // Attach camera controls after scene is fully built and ready
  scene.executeWhenReady(() => {
    if (!isCameraLocked) {
      attachCameraControls();
      Logger.log("MmdModelScene", "Camera controls attached after scene ready");
    }
  });

  // Call user's scene ready callback
  if (finalConfig.onSceneReady) {
    finalConfig.onSceneReady(scene);
  }

  return scene;
};
