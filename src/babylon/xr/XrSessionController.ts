import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes";
import type { SceneWithMetadata } from "../types";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { WebXRControllerMovement } from "@babylonjs/core/XR/features/WebXRControllerMovement";

/** Owns the browser XR lifecycle, independently of the desktop session bridge. */
export class XrSessionController {
  private disposed = false;
  private readonly htmlPanels = new Map<
    AbstractMesh,
    (delta: number) => void
  >();
  private floors: AbstractMesh[] = [];
  private sceneEditing = false;
  setSceneEditing(enabled: boolean): void {
    this.sceneEditing = enabled;
  }
  private readonly removeFrameObserver: () => void;

  private constructor(
    readonly experience: WebXRDefaultExperience,
    private readonly scene: SceneWithMetadata,
    private readonly movement: WebXRControllerMovement,
  ) {
    experience.baseExperience.onInitialXRPoseSetObservable.add((camera) => {
      const spawn = scene.metadata?.xrSpawnPosition;
      if (spawn) {
        camera.position.copyFrom(Vector3.FromArray(spawn));
        camera.position.y += camera.realWorldHeight;
      }
      camera.rotationQuaternion.copyFrom(Quaternion.Identity());
    });
    experience.baseExperience.onStateChangedObservable.add((state) => {
      // Prevent Babylon from copying the headset position into the MMD camera on exit.
      if (state === WebXRState.EXITING_XR)
        experience.baseExperience.camera.compensateOnFirstFrame = false;
      else if (state === WebXRState.NOT_IN_XR)
        experience.baseExperience.camera.compensateOnFirstFrame = true;
    });
    this.floors = scene.metadata?.xrFloorMeshes ?? [];
    const frameObserver = scene.onBeforeAnimationsObservable.add(() => {
      if (this.disposed || experience.baseExperience.state !== WebXRState.IN_XR)
        return;
      const floors = scene.metadata?.xrFloorMeshes ?? this.floors;
      if (floors !== this.floors) {
        this.updateFloors(this.floors, floors);
        this.floors = floors;
      }
      let overUI = false;
      let leftOverUI = false;
      for (const input of experience.input.controllers) {
        const mesh = experience.pointerSelection.getMeshUnderPointer(
          input.uniqueId,
        );
        const scroll = mesh && this.htmlPanels.get(mesh);
        if (!scroll) {
          if (mesh?.metadata?.xrPanelHandle) overUI = true;
          continue;
        }
        overUI = true;
        const left = input.inputSource.handedness === "left";
        leftOverUI ||= left;
        const stick =
          input.motionController?.getComponentOfType("thumbstick") ??
          input.motionController?.getComponentOfType("touchpad");
        const y = stick?.axes.y ?? 0;
        // The right stick always moves. The left stick scrolls the panel it targets.
        if (left && Math.abs(y) > 0.2)
          scroll(y * Math.min(50, scene.getEngine().getDeltaTime()) * 0.8);
      }
      this.movement.movementEnabled = !this.sceneEditing;
      this.movement.rotationEnabled = !leftOverUI && !this.sceneEditing;
      experience.baseExperience.camera.cameraDirection.y = 0;
      const teleport = experience.teleportation;
      if (teleport) {
        teleport.teleportationEnabled =
          !overUI &&
          !this.sceneEditing &&
          (scene.metadata?.xrFloorMeshes?.length ?? 0) > 0;
        teleport.rotationEnabled = false;
      }
    });
    this.removeFrameObserver = () =>
      scene.onBeforeAnimationsObservable.remove(frameObserver);
  }

  /** Prepare before enabling Enter VR so entry can start inside its click handler. */
  static async create(
    scene: SceneWithMetadata,
    options: {
      floorMeshes: AbstractMesh[];
      worldUnitsPerMeter: number;
      handTracking?: boolean;
    },
  ): Promise<XrSessionController> {
    if (
      !Number.isFinite(options.worldUnitsPerMeter) ||
      options.worldUnitsPerMeter <= 0
    ) {
      throw new Error("XR requires a positive scene units per meter value.");
    }
    const experience = await WebXRDefaultExperience.CreateAsync(scene, {
      disableDefaultUI: true,
      pointerSelectionOptions: {
        useUtilityLayer: true,
        enablePointerSelectionOnAllControllers: true,
      },
      disableHandTracking: !options.handTracking,
      disableNearInteraction: !options.handTracking,
      floorMeshes: options.floorMeshes,
      disableTeleportation: true,
      optionalFeatures: options.handTracking ? ["hand-tracking"] : [],
      useStablePlugins: true,
    });
    // The helper can return a partial experience after initialization fails.
    if (
      scene.isDisposed ||
      !experience.baseExperience ||
      !experience.input ||
      !experience.renderTarget
    ) {
      experience.dispose();
      throw new Error("The browser could not initialize the XR experience.");
    }
    experience.baseExperience.sessionManager.worldScalingFactor =
      options.worldUnitsPerMeter;
    const movement = experience.baseExperience.featuresManager.enableFeature(
      WebXRControllerMovement.Name,
      "stable",
      {
        xrInput: experience.input,
        movementOrientationFollowsViewerPose: true,
        movementOrientationFollowsController: false,
        movementSpeed: 1,
        rotationSpeed: 1,
        movementThreshold: 0.2,
        rotationThreshold: 0.35,
        customRegistrationConfigurations: [
          {
            allowedComponentTypes: ["thumbstick", "touchpad"],
            forceHandedness: "right",
            axisChangedHandler: (axes, state) => {
              state.moveX = Math.abs(axes.x) > 0.2 ? axes.x : 0;
              state.moveY = Math.abs(axes.y) > 0.2 ? axes.y : 0;
            },
          },
          {
            allowedComponentTypes: ["thumbstick", "touchpad"],
            forceHandedness: "left",
            axisChangedHandler: (axes, state) => {
              state.rotateX = Math.abs(axes.x) > 0.35 ? axes.x : 0;
              state.rotateY = 0;
            },
          },
        ] satisfies import("@babylonjs/core/XR/features/WebXRControllerMovement").WebXRControllerMovementRegistrationConfiguration[],
      } satisfies import("@babylonjs/core/XR/features/WebXRControllerMovement").IWebXRControllerMovementOptions,
    ) as WebXRControllerMovement;
    experience.baseExperience.camera.speed = options.worldUnitsPerMeter * 0.5;
    experience.baseExperience.camera.inertia = 0;
    return new XrSessionController(experience, scene, movement);
  }

  /** Call directly from user activation. The caller presents any entry rejection. */
  enter(): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject(new Error("The XR scene has been disposed."));
    }
    if (this.experience.baseExperience.state !== WebXRState.NOT_IN_XR) {
      return Promise.reject(
        new Error("An XR transition is already in progress."),
      );
    }
    return this.experience.baseExperience.enterXRAsync(
      "immersive-vr",
      "local-floor",
      this.experience.renderTarget,
    );
  }

  exit(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.experience.baseExperience.exitXRAsync();
  }

  recenter(): void {
    const spawn = this.scene.metadata?.xrSpawnPosition;
    if (!spawn || this.disposed) return;
    const camera = this.experience.baseExperience.camera;
    camera.position.copyFrom(Vector3.FromArray(spawn));
    camera.position.y += camera.realWorldHeight;
    camera.rotationQuaternion.copyFrom(Quaternion.Identity());
  }

  registerHtmlPanel(
    mesh: AbstractMesh,
    scroll: (delta: number) => void,
  ): () => void {
    this.htmlPanels.set(mesh, scroll);
    return () => {
      this.htmlPanels.delete(mesh);
    };
  }

  updateFloors(previous: AbstractMesh[], next: AbstractMesh[]): void {
    const teleport = this.experience.teleportation;
    if (!teleport) return;
    for (const mesh of previous)
      if (!next.includes(mesh)) teleport.removeFloorMesh(mesh);
    for (const mesh of next)
      if (!previous.includes(mesh)) teleport.addFloorMesh(mesh);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.htmlPanels.clear();
    this.removeFrameObserver();
    this.experience.dispose();
  }
}
