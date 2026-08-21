import type {
  AbstractMesh,
  Camera,
  Node,
  Observer,
  Plane,
  PointerInfo,
  Scene,
  TransformNode,
} from "@babylonjs/core";
import {
  Color4,
  Matrix,
  PointerEventTypes,
  Quaternion,
  Vector3,
} from "@babylonjs/core";
import type { ARProvider } from "./ARProvider";
import { ARAnchorManager } from "./ARAnchorManager";
import { ARCameraController } from "./ARCameraController";
import { ARGestureController } from "./ARGestureController";
import { ARLightingController } from "./ARLightingController";
import { ARReticle } from "./ARReticle";
import {
  notifyARModeActive,
  notifyARModelPlaced,
  notifyARPlacementActive,
} from "./ARModeLifecycle";

type RestorableNode = Node & {
  isEnabled(): boolean;
  setEnabled(value: boolean): void;
};

type RootState = {
  parent: Node | null;
  position: Vector3;
  scaling: Vector3;
  rotation: Vector3;
  rotationQuaternion: Quaternion | null;
  enabled: boolean;
};

type RenderingPipeline = {
  addCamera(camera: Camera): void;
  removeCamera(camera: Camera): void;
};

export class ARSessionController {
  private isARActive = false;
  private placementPending = false;
  private previousCamera: Camera | null = null;
  private previousClearColor: Color4 | null = null;
  private previousClipPlanes:
    | [
        Plane | null,
        Plane | null,
        Plane | null,
        Plane | null,
        Plane | null,
        Plane | null,
      ]
    | null = null;
  private previousCanvasPointerEvents = "";
  private previousCanvasTouchAction = "";
  private rootState: RootState | null = null;
  private stageWasEnabled: boolean | null = null;
  private placementObserver: Observer<PointerInfo> | null = null;
  private readonly meshSelectionStates = new Map<AbstractMesh, boolean>();
  private arCameraAddedToPipeline = false;
  private unitsPerMeter = 1;
  private modelHeightUnits = 1;
  private desiredModelHeightMeters = 1.65;
  private modelFloor = Vector3.Zero();
  private activeAnchorId: string | null = null;
  private activeAnchorPose: { x: number; y: number; z: number } | null = null;

  public cameraController!: ARCameraController;
  public reticle!: ARReticle;
  public anchorManager!: ARAnchorManager;
  public gestureController!: ARGestureController;
  public lightingController!: ARLightingController;

  constructor(
    private readonly scene: Scene,
    private readonly arProvider: ARProvider,
  ) {}

  public async initialize(): Promise<boolean> {
    if (!(await this.arProvider.isSupported())) return false;

    this.cameraController = new ARCameraController(this.scene, this.arProvider);
    this.reticle = new ARReticle(this.scene, this.arProvider);
    this.anchorManager = new ARAnchorManager(this.scene, this.arProvider);
    this.gestureController = new ARGestureController(this.scene);
    this.lightingController = new ARLightingController(
      this.scene,
      this.arProvider,
    );
    this.arProvider.onAnchorUpdated((anchor) => {
      if (anchor.id === this.activeAnchorId) this.applyAnchorMapping(anchor);
    });

    this.placementObserver = this.scene.onPointerObservable.add(
      (pointerInfo) => {
        if (pointerInfo.type === PointerEventTypes.POINTERTAP) {
          void this.placeAtReticle();
        }
      },
    );

    return true;
  }

  public isActive(): boolean {
    return this.isARActive;
  }

  private getMmdRoot(): TransformNode | null {
    return this.scene.getTransformNodeByName("mmdRoot");
  }

  private getStage(): RestorableNode | null {
    const stage = this.scene.metadata?.stageMesh as RestorableNode | undefined;
    return stage ?? null;
  }

  private applyAnchorMapping(anchor: {
    x: number;
    y: number;
    z: number;
  }): void {
    const arOrigin = new Vector3(anchor.x, anchor.y, -anchor.z);
    this.cameraController.setWorldMapping(
      this.unitsPerMeter,
      arOrigin,
      this.modelFloor,
    );
    this.reticle.setWorldMapping(this.unitsPerMeter, arOrigin, this.modelFloor);
  }

  public resizeModel(action: "in" | "out" | "reset"): void {
    if (!this.isARActive) return;
    if (action === "reset") {
      this.desiredModelHeightMeters = 1.65;
      this.resetModelRotation();
    } else {
      const factor = action === "in" ? 1.15 : 1 / 1.15;
      this.desiredModelHeightMeters = Math.min(
        3,
        Math.max(0.5, this.desiredModelHeightMeters * factor),
      );
    }
    this.unitsPerMeter = this.modelHeightUnits / this.desiredModelHeightMeters;
    if (this.activeAnchorPose) this.applyAnchorMapping(this.activeAnchorPose);
    console.info(
      `[VASSIST_AR] model:physical-height=${this.desiredModelHeightMeters} ` +
        `unitsPerMeter=${this.unitsPerMeter}`,
    );
  }

  public rotateModel(degrees: number): void {
    if (!this.isARActive) return;
    const root = this.getMmdRoot();
    if (!root) return;

    const currentYaw = root.rotationQuaternion
      ? root.rotationQuaternion.toEulerAngles().y
      : root.rotation.y;
    root.rotationQuaternion = Quaternion.FromEulerAngles(
      0,
      currentYaw + (degrees * Math.PI) / 180,
      0,
    );
    root.computeWorldMatrix(true);
  }

  private resetModelRotation(): void {
    const root = this.getMmdRoot();
    if (!root || !this.rootState) return;

    root.rotation.copyFrom(this.rootState.rotation);
    root.rotationQuaternion =
      this.rootState.rotationQuaternion?.clone() ?? null;
    root.computeWorldMatrix(true);
  }

  private async placeAtReticle(): Promise<void> {
    if (!this.isARActive || this.placementPending) return;
    const hit = this.reticle.getCurrentHit();
    const root = this.getMmdRoot();
    if (!hit || !root || !this.rootState) return;

    this.placementPending = true;
    console.info("[VASSIST_AR] placement:requested", hit);
    try {
      const anchor = await this.arProvider.createAnchor(hit);
      if (!this.isARActive) return;

      const model = this.scene.metadata?.modelMesh as TransformNode | undefined;
      const bounds = model?.getHierarchyBoundingVectors(true);
      const height = bounds ? bounds.max.y - bounds.min.y : Number.NaN;
      console.info(
        `[VASSIST_AR] placement:model-bounds height=${height} ` +
          `minY=${bounds?.min.y} scale=original unitsPerMeter=${this.unitsPerMeter}`,
      );

      this.activeAnchorId = anchor.id;
      this.activeAnchorPose = anchor;
      this.applyAnchorMapping(anchor);

      // Keep the authored model transform and its rigid bodies untouched.
      // Placement moves the AR camera coordinate system around the model.
      root.setEnabled(true);

      const modelMeshes = model?.getChildMeshes(false) ?? [];
      if (model && "alwaysSelectAsActiveMesh" in model) {
        modelMeshes.unshift(model as AbstractMesh);
      }
      this.meshSelectionStates.clear();
      modelMeshes.forEach((mesh) => {
        this.meshSelectionStates.set(mesh, mesh.alwaysSelectAsActiveMesh);
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.computeWorldMatrix(true);
      });

      root.computeWorldMatrix(true);
      const anchorWorld = this.modelFloor;

      // A virtual stage is useful in normal mode but destroys the AR illusion.
      this.getStage()?.setEnabled(false);
      this.lightingController.showContactShadow(
        this.modelFloor,
        this.modelHeightUnits,
        root,
      );
      root.computeWorldMatrix(true);
      const camera = this.cameraController.getCamera();
      const engine = this.scene.getEngine();
      const viewport = camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      );
      const projected = Vector3.Project(
        anchorWorld,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        viewport,
      );
      const finalBounds = model?.getHierarchyBoundingVectors(true);
      const finalBottomCenter = finalBounds
        ? new Vector3(
            (finalBounds.min.x + finalBounds.max.x) * 0.5,
            finalBounds.min.y,
            (finalBounds.min.z + finalBounds.max.z) * 0.5,
          )
        : anchorWorld;
      const projectedFeet = Vector3.Project(
        finalBottomCenter,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        viewport,
      );
      const enabledMeshes = modelMeshes.filter((mesh) => mesh.isEnabled());
      const visibleMeshes = enabledMeshes.filter(
        (mesh) => mesh.isVisible && mesh.visibility > 0,
      );
      notifyARModelPlaced();
      console.info(
        `[VASSIST_AR] placement:complete anchor=${anchor.x},${anchor.y},${anchor.z} ` +
          `camera=${camera.globalPosition.x},${camera.globalPosition.y},${camera.globalPosition.z} ` +
          `distance=${Vector3.Distance(camera.globalPosition, anchorWorld)} ` +
          `screen=${projected.x},${projected.y},${projected.z} ` +
          `feetScreen=${projectedFeet.x},${projectedFeet.y},${projectedFeet.z} ` +
          `floorError=${Vector3.Distance(anchorWorld, finalBottomCenter)} ` +
          `meshes=${modelMeshes.length} enabled=${enabledMeshes.length} visible=${visibleMeshes.length}`,
      );
    } catch (error) {
      console.error("Failed to place AR model", error);
    } finally {
      this.placementPending = false;
    }
  }

  public async enterAR(): Promise<void> {
    if (this.isARActive) return;

    const root = this.getMmdRoot();
    if (!root) throw new Error("MMD model root is unavailable");

    await this.arProvider.start();
    console.info("[VASSIST_AR] session:entered-web-layer");
    this.isARActive = true;

    this.previousCamera = this.scene.activeCamera;
    this.previousClearColor = this.scene.clearColor.clone();
    this.previousClipPlanes = [
      this.scene.clipPlane,
      this.scene.clipPlane2,
      this.scene.clipPlane3,
      this.scene.clipPlane4,
      this.scene.clipPlane5,
      this.scene.clipPlane6,
    ];
    this.rootState = {
      parent: root.parent,
      position: root.position.clone(),
      scaling: root.scaling.clone(),
      rotation: root.rotation.clone(),
      rotationQuaternion: root.rotationQuaternion?.clone() ?? null,
      enabled: root.isEnabled(),
    };

    const model = this.scene.metadata?.modelMesh as TransformNode | undefined;
    const bounds = model?.getHierarchyBoundingVectors(true);
    if (!bounds) throw new Error("MMD model bounds are unavailable");
    const modelHeight = bounds.max.y - bounds.min.y;
    this.modelHeightUnits = modelHeight;
    this.desiredModelHeightMeters = 1.65;
    this.unitsPerMeter = modelHeight / this.desiredModelHeightMeters;
    this.modelFloor.copyFromFloats(
      (bounds.min.x + bounds.max.x) * 0.5,
      bounds.min.y,
      (bounds.min.z + bounds.max.z) * 0.5,
    );
    this.cameraController.setWorldMapping(
      this.unitsPerMeter,
      Vector3.Zero(),
      Vector3.Zero(),
    );
    this.reticle.setWorldMapping(
      this.unitsPerMeter,
      Vector3.Zero(),
      Vector3.Zero(),
    );
    console.info(
      `[VASSIST_AR] scene:fresh-world modelHeight=${modelHeight} ` +
        `unitsPerMeter=${this.unitsPerMeter} floor=${this.modelFloor.x},${this.modelFloor.y},${this.modelFloor.z}`,
    );

    const stage = this.getStage();
    this.stageWasEnabled = stage?.isEnabled() ?? null;
    stage?.setEnabled(false);

    // Do not show the normal screen-space model at the AR world origin.
    root.setEnabled(false);
    this.scene.clearColor = new Color4(0, 0, 0, 0);
    // Portrait mode uses a desktop-world clipping plane (normally around
    // Y=12). AR anchors use metre-scale world coordinates around Y=0, so
    // carrying that plane into AR can clip the entire character while every
    // mesh still reports enabled and visible.
    this.scene.clipPlane = null;
    this.scene.clipPlane2 = null;
    this.scene.clipPlane3 = null;
    this.scene.clipPlane4 = null;
    this.scene.clipPlane5 = null;
    this.scene.clipPlane6 = null;
    console.info(
      `[VASSIST_AR] scene:desktop-clipping-disabled hadClipPlane=${this.previousClipPlanes.some(
        (plane) => plane !== null,
      )}`,
    );
    const arCamera = this.cameraController.getCamera();
    this.scene.activeCamera = arCamera;
    const pipeline = this.scene.metadata?.renderPipeline as
      | RenderingPipeline
      | undefined;
    if (pipeline?.addCamera) {
      pipeline.addCamera(arCamera);
      this.arCameraAddedToPipeline = true;
      console.info("[VASSIST_AR] scene:render-pipeline-attached");
    }
    this.reticle.setActive(true);
    // Preserve the scene's authored MMD lights and shaders in AR.
    this.lightingController.setActive(false);

    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (canvas) {
      this.previousCanvasPointerEvents = canvas.style.pointerEvents;
      this.previousCanvasTouchAction = canvas.style.touchAction;
      canvas.style.pointerEvents = "auto";
      canvas.style.touchAction = "none";
    }

    document.documentElement.classList.add("ar-active");
    document.body.classList.add("ar-active");
    notifyARPlacementActive(true);
    notifyARModeActive(true);
  }

  public async exitAR(): Promise<void> {
    if (!this.isARActive) return;

    this.isARActive = false;
    console.info("[VASSIST_AR] session:exiting-web-layer");
    this.reticle.setActive(false);
    this.gestureController.setTargetNode(null);
    this.lightingController.setTargetNode(null);
    this.lightingController.setActive(false);
    this.lightingController.hideContactShadow();
    this.meshSelectionStates.forEach((alwaysSelect, mesh) => {
      mesh.alwaysSelectAsActiveMesh = alwaysSelect;
    });
    this.meshSelectionStates.clear();
    document.documentElement.classList.remove("ar-active");
    document.body.classList.remove("ar-active");
    notifyARPlacementActive(false);

    if (this.previousClearColor) {
      this.scene.clearColor = this.previousClearColor;
    }
    if (this.previousClipPlanes) {
      [
        this.scene.clipPlane,
        this.scene.clipPlane2,
        this.scene.clipPlane3,
        this.scene.clipPlane4,
        this.scene.clipPlane5,
        this.scene.clipPlane6,
      ] = this.previousClipPlanes;
    }
    if (this.arCameraAddedToPipeline) {
      const pipeline = this.scene.metadata?.renderPipeline as
        | RenderingPipeline
        | undefined;
      pipeline?.removeCamera(this.cameraController.getCamera());
      this.arCameraAddedToPipeline = false;
    }
    if (this.previousCamera) {
      this.scene.activeCamera = this.previousCamera;
    }

    const root = this.getMmdRoot();
    if (root && this.rootState) {
      root.parent = this.rootState.parent;
      root.position.copyFrom(this.rootState.position);
      root.scaling.copyFrom(this.rootState.scaling);
      root.rotation.copyFrom(this.rootState.rotation);
      root.rotationQuaternion =
        this.rootState.rotationQuaternion?.clone() ?? null;
      root.setEnabled(this.rootState.enabled);
      root.computeWorldMatrix(true);
    }

    const stage = this.getStage();
    if (stage && this.stageWasEnabled !== null) {
      stage.setEnabled(this.stageWasEnabled);
    }

    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (canvas) {
      canvas.style.pointerEvents = this.previousCanvasPointerEvents;
      canvas.style.touchAction = this.previousCanvasTouchAction;
    }

    this.anchorManager.clear();
    this.activeAnchorId = null;
    this.activeAnchorPose = null;
    this.rootState = null;
    this.previousCamera = null;
    this.previousClearColor = null;
    this.previousClipPlanes = null;

    try {
      await this.arProvider.stop();
    } catch (error) {
      console.error("Failed to stop native AR session", error);
    }
    notifyARModeActive(false);
  }

  public dispose(): void {
    if (this.placementObserver) {
      this.scene.onPointerObservable.remove(this.placementObserver);
      this.placementObserver = null;
    }
    this.gestureController?.dispose(this.scene);
  }
}
