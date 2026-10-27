import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { SceneWithMetadata } from "../types";
import type { UIConfig } from "../../config/uiConfig";

export type XrEnvironmentPose = NonNullable<
  UIConfig["xr"]["environments"]
>[string];
export type XrEditMode = "move" | "rotate" | "scale";
const identity = (): XrEnvironmentPose => ({
  position: [0, 0, 0],
  yaw: 0,
  scale: 1,
});

/** Edits the environment around the avatar without scaling its physics rig. */
export class XrSceneEditor {
  private readonly gizmos: GizmoManager;
  private readonly basePosition: Vector3;
  private readonly baseScale: Vector3;
  private readonly baseRotation: Vector3;
  private history: XrEnvironmentPose[];
  private cursor = 0;
  private pose: XrEnvironmentPose;

  constructor(
    scene: SceneWithMetadata,
    private readonly root: TransformNode,
    private readonly units: number,
    saved: XrEnvironmentPose | undefined,
    private readonly onChange: (pose: XrEnvironmentPose) => void,
  ) {
    this.basePosition = root.position.clone();
    this.baseScale = root.scaling.clone();
    this.baseRotation =
      root.rotationQuaternion?.toEulerAngles() ?? root.rotation.clone();
    this.pose = saved ?? identity();
    this.history = [structuredClone(this.pose)];
    this.apply(this.pose);
    this.gizmos = new GizmoManager(scene);
    this.gizmos.usePointerToAttachGizmos = false;
    this.gizmos.enableAutoPicking = false;
    this.gizmos.clearGizmoOnEmptyPointerEvent = false;
    this.gizmos.positionGizmoEnabled = true;
    this.gizmos.rotationGizmoEnabled = true;
    this.gizmos.scaleGizmoEnabled = true;
    const { positionGizmo, rotationGizmo, scaleGizmo } = this.gizmos.gizmos;
    if (rotationGizmo) {
      rotationGizmo.xGizmo.isEnabled = false;
      rotationGizmo.zGizmo.isEnabled = false;
    }
    if (scaleGizmo) {
      scaleGizmo.xGizmo.isEnabled = false;
      scaleGizmo.yGizmo.isEnabled = false;
      scaleGizmo.zGizmo.isEnabled = false;
    }
    for (const gizmo of [positionGizmo, rotationGizmo, scaleGizmo])
      gizmo?.onDragEndObservable.add(() => this.commit(this.read()));
    this.setMode(null);
  }

  private read(): XrEnvironmentPose {
    const rotation =
      this.root.rotationQuaternion?.toEulerAngles() ?? this.root.rotation;
    return {
      position: this.root.position
        .subtract(this.basePosition)
        .scale(1 / this.units)
        .asArray() as [number, number, number],
      yaw: rotation.y - this.baseRotation.y,
      scale: Math.max(
        0.25,
        Math.min(4, this.root.scaling.x / this.baseScale.x),
      ),
    };
  }
  private apply(pose: XrEnvironmentPose): void {
    this.pose = structuredClone(pose);
    this.root.position.copyFrom(
      this.basePosition.add(Vector3.FromArray(pose.position).scale(this.units)),
    );
    this.root.rotationQuaternion = null;
    this.root.rotation.copyFrom(this.baseRotation);
    this.root.rotation.y += pose.yaw;
    this.root.scaling.copyFrom(this.baseScale.scale(pose.scale));
    this.root.computeWorldMatrix(true);
  }
  private commit(pose: XrEnvironmentPose): void {
    this.history = this.history.slice(0, this.cursor + 1);
    this.history.push(structuredClone(pose));
    if (this.history.length > 50) this.history.shift();
    this.cursor = this.history.length - 1;
    this.apply(pose);
    this.onChange(this.pose);
  }
  setMode(mode: XrEditMode | null): void {
    this.gizmos.positionGizmoEnabled = mode === "move";
    this.gizmos.rotationGizmoEnabled = mode === "rotate";
    this.gizmos.scaleGizmoEnabled = mode === "scale";
    this.gizmos.attachToNode(mode ? this.root : null);
  }
  reset(): void {
    this.commit(identity());
  }
  syncPose(pose: XrEnvironmentPose | undefined): void {
    const next = pose ?? identity();
    if (
      this.gizmos.isDragging ||
      JSON.stringify(this.pose) === JSON.stringify(next)
    )
      return;
    this.apply(next);
    this.history = [structuredClone(next)];
    this.cursor = 0;
  }
  undo(): void {
    if (this.cursor === 0) return;
    this.apply(this.history[--this.cursor]!);
    this.onChange(this.pose);
  }
  redo(): void {
    if (this.cursor >= this.history.length - 1) return;
    this.apply(this.history[++this.cursor]!);
    this.onChange(this.pose);
  }
  dispose(): void {
    this.gizmos.dispose();
    if (!this.root.isDisposed()) this.apply(identity());
  }
}
