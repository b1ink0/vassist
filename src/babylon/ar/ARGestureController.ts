import type {
  Observer,
  PointerInfo,
  Scene,
  TransformNode,
} from "@babylonjs/core";
import { PointerEventTypes, Quaternion } from "@babylonjs/core";

export class ARGestureController {
  private targetNode: TransformNode | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly observer: Observer<PointerInfo>;
  private gestureStarted = false;
  private initialAngle = 0;
  private initialYaw = 0;

  constructor(scene: Scene) {
    this.observer = scene.onPointerObservable.add((pointerInfo) => {
      this.handlePointer(pointerInfo);
    });
  }

  private handlePointer(pointerInfo: PointerInfo): void {
    const event = pointerInfo.event as PointerEvent;

    if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
      this.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }

    if (pointerInfo.type === PointerEventTypes.POINTERUP) {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.gestureStarted = false;
      return;
    }

    if (
      pointerInfo.type !== PointerEventTypes.POINTERMOVE ||
      !this.pointers.has(event.pointerId)
    ) {
      return;
    }

    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size !== 2 || !this.targetNode) return;

    const [first, second] = Array.from(this.pointers.values());
    if (!first || !second) return;

    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const angle = Math.atan2(dy, dx);

    if (!this.gestureStarted) {
      this.initialAngle = angle;
      this.initialYaw = this.targetNode.rotationQuaternion
        ? this.targetNode.rotationQuaternion.toEulerAngles().y
        : this.targetNode.rotation.y;
      this.gestureStarted = true;
      return;
    }

    const yaw = this.initialYaw - (angle - this.initialAngle);
    this.targetNode.rotationQuaternion = Quaternion.FromEulerAngles(0, yaw, 0);
  }

  public setTargetNode(node: TransformNode | null): void {
    this.targetNode = node;
    this.pointers.clear();
    this.gestureStarted = false;
  }

  public dispose(scene: Scene): void {
    scene.onPointerObservable.remove(this.observer);
  }
}
