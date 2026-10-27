import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { SixDofDragBehavior } from "@babylonjs/core/Behaviors/Meshes/sixDofDragBehavior";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FollowBehavior } from "@babylonjs/core/Behaviors/Meshes/followBehavior";
import {
  HandConstraintBehavior,
  HandConstraintVisibility,
} from "@babylonjs/core/Behaviors/Meshes/handConstraintBehavior";
import type { WebXRExperienceHelper } from "@babylonjs/core/XR/webXRExperienceHelper";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";

export type SpatialAnchor = "follow" | "world" | "hand";
export interface SpatialPanelPose {
  anchor: SpatialAnchor;
  position: [number, number, number];
  yaw: number;
}

/** Placement and anchoring only. React and the HTML texture own panel content. */
export class SpatialPanel {
  readonly root: Mesh;
  readonly mesh: ReturnType<typeof MeshBuilder.CreatePlane>;
  private readonly follow = new FollowBehavior();
  private anchor: SpatialAnchor = "world";
  private readonly drag = new SixDofDragBehavior();
  private readonly handleMaterial: StandardMaterial;
  private readonly handleTexture: DynamicTexture;
  private readonly units: number;
  private readonly onMoved: ((pose: SpatialPanelPose) => void) | undefined;
  private hand: HandConstraintBehavior | undefined;
  private readonly offset: Vector3;

  constructor(
    scene: Scene,
    options: {
      id: string;
      widthMeters: number;
      heightMeters: number;
      worldUnitsPerMeter: number;
      material: Material;
      anchor: SpatialAnchor;
      offsetMeters?: [number, number, number];
      pose?: SpatialPanelPose | undefined;
      onMoved?: (pose: SpatialPanelPose) => void;
    },
  ) {
    const units = options.worldUnitsPerMeter;
    this.units = units;
    this.offset = Vector3.FromArray(options.offsetMeters ?? [0, 0, 0]).scale(
      units,
    );
    this.onMoved = options.onMoved;
    if (
      ![units, options.widthMeters, options.heightMeters].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    )
      throw new Error("Spatial panel dimensions and scale must be positive.");
    this.root = new Mesh(`${options.id}-anchor`, scene);
    this.mesh = MeshBuilder.CreatePlane(
      options.id,
      {
        width: options.widthMeters * units,
        height: options.heightMeters * units,
      },
      scene,
    );
    this.mesh.material = options.material;
    this.mesh.metadata = { xrHtmlPanel: options.id };
    this.mesh.isNearPickable = true;
    this.mesh.parent = this.root;
    if (options.offsetMeters)
      this.mesh.position.copyFrom(
        Vector3.FromArray(options.offsetMeters).scale(units),
      );
    this.follow.defaultDistance = units * 1.2;
    this.follow.minimumDistance = units * 1.05;
    this.follow.maximumDistance = units * 1.4;
    this.follow.lerpTime = 600;
    this.follow.ignoreCameraPitchAndRoll = true;
    this.follow.maxViewHorizontalDegrees = 20;
    this.follow.maxViewVerticalDegrees = 15;
    this.setAnchor(options.anchor);
    const handle = MeshBuilder.CreateBox(
      `${options.id}-grab`,
      {
        width: Math.min(options.widthMeters, 0.08) * units,
        height: 0.035 * units,
        depth: 0.012 * units,
      },
      scene,
    );
    handle.parent = this.root;
    handle.position.copyFrom(this.mesh.position);
    handle.position.y += (options.heightMeters / 2 + 0.025) * units;
    handle.metadata = { xrPanelHandle: options.id };
    handle.isNearGrabbable = true;
    this.handleMaterial = new StandardMaterial(
      `${options.id}-grab-material`,
      scene,
    );
    this.handleMaterial.disableLighting = true;
    this.handleMaterial.emissiveColor = Color3.White();
    this.handleTexture = new DynamicTexture(
      `${options.id}-grab-label`,
      { width: 256, height: 64 },
      scene,
      false,
    );
    const grip = this.handleTexture.getContext();
    grip.fillStyle = "#25292c";
    grip.fillRect(0, 0, 256, 64);
    grip.fillStyle = "#d4d4d4";
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 3; column++) {
        grip.beginPath();
        grip.arc(96 + column * 32, 20 + row * 24, 5, 0, Math.PI * 2);
        grip.fill();
      }
    }
    this.handleTexture.update();
    this.handleMaterial.diffuseTexture = this.handleTexture;
    handle.material = this.handleMaterial;
    this.drag.draggableMeshes = [handle];
    this.drag.allowMultiPointer = false;
    this.drag.rotateAroundYOnly = true;
    this.drag.rotateWithMotionController = false;
    this.root.addBehavior(this.drag);
    this.drag.onDragStartObservable.add(() => this.setAnchor("world"));
    this.drag.onDragEndObservable.add(() => {
      const yaw =
        this.root.rotationQuaternion?.toEulerAngles().y ?? this.root.rotation.y;
      this.root.rotationQuaternion = null;
      this.root.rotation.set(0, yaw, 0);
      this.onMoved?.(this.getPose());
    });
    if (
      options.pose &&
      [...options.pose.position, options.pose.yaw].every(Number.isFinite)
    ) {
      this.setAnchor(options.pose.anchor);
      if (options.pose.anchor === "world") {
        this.root.position.copyFrom(
          Vector3.FromArray(options.pose.position).scale(units),
        );
        this.root.rotationQuaternion = null;
        this.root.rotation.set(0, options.pose.yaw, 0);
      }
    }
  }

  setAnchor(anchor: SpatialAnchor): void {
    if (anchor === this.anchor) return;
    if (anchor === "hand" && !this.hand) return;
    if (this.anchor === "hand") {
      this.root.removeBehavior(this.hand!);
      for (const child of this.root.getChildMeshes())
        child.position.addInPlace(this.offset);
      this.root.scaling.setAll(1);
      this.root.setEnabled(true);
    }
    this.anchor = anchor;
    if (anchor === "follow") {
      this.root.addBehavior(this.follow, true);
      this.follow.recenter();
    } else {
      this.root.removeBehavior(this.follow);
      if (anchor === "hand") {
        for (const child of this.root.getChildMeshes())
          child.position.subtractInPlace(this.offset);
        this.root.scaling.setAll(0.6);
        this.root.addBehavior(this.hand!, true);
      }
    }
  }
  enableHandAnchor(
    experience: WebXRExperienceHelper,
    initiallyOnHand: boolean,
  ): void {
    this.hand = new HandConstraintBehavior();
    this.hand.handedness = "left";
    this.hand.targetOffset = this.units * 0.2;
    this.hand.handConstraintVisibility = HandConstraintVisibility.PALM_UP;
    this.hand.linkToXRExperience(experience);
    if (initiallyOnHand) this.setAnchor("hand");
  }
  toggleHand(): void {
    this.setAnchor(this.anchor === "hand" ? "follow" : "hand");
    this.onMoved?.(this.getPose());
  }

  recenter(): void {
    this.setAnchor("follow");
    this.follow.recenter();
  }
  applyPose(pose: SpatialPanelPose): void {
    if (![...pose.position, pose.yaw].every(Number.isFinite)) return;
    this.setAnchor(pose.anchor);
    if (pose.anchor === "world") {
      this.root.position.copyFrom(
        Vector3.FromArray(pose.position).scale(this.units),
      );
      this.root.rotationQuaternion = null;
      this.root.rotation.set(0, pose.yaw, 0);
    }
  }
  togglePin(): void {
    this.setAnchor(this.anchor === "world" ? "follow" : "world");
    this.onMoved?.(this.getPose());
  }
  getPose(): SpatialPanelPose {
    return {
      anchor: this.anchor,
      position: this.root.position.scale(1 / this.units).asArray() as [
        number,
        number,
        number,
      ],
      yaw:
        this.root.rotationQuaternion?.toEulerAngles().y ?? this.root.rotation.y,
    };
  }
  dispose(): void {
    this.root.removeBehavior(this.follow);
    this.root.removeBehavior(this.drag);
    if (this.hand) this.root.removeBehavior(this.hand);
    this.root.dispose();
    this.handleMaterial.dispose();
    this.handleTexture.dispose();
  }
}
