import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** Move the stage subtly around the still avatar, with frame-rate independent easing. */
export function attachStageParallax(
  scene: Scene,
  root: TransformNode,
  unitsPerMeter: number,
): { setInput: (x: number, y: number) => void; dispose: () => void } {
  const origin = root.position.clone();
  let targetX = 0;
  let targetY = 0;
  let offsetX = 0;
  let offsetY = 0;
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (scene.metadata?.xrActive) return;
    if (
      scene.isDisposed ||
      (typeof document !== "undefined" &&
        document.hidden &&
        !scene.metadata?.xrActive)
    )
      return;
    if (
      Math.abs(targetX - offsetX) < 0.0001 &&
      Math.abs(targetY - offsetY) < 0.0001
    )
      return;
    const delta = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);
    const easing = 1 - Math.exp(-delta / 0.12);
    offsetX += (targetX - offsetX) * easing;
    offsetY += (targetY - offsetY) * easing;
    root.position.x = origin.x + offsetX * unitsPerMeter * 0.075;
    root.position.z = origin.z - offsetY * unitsPerMeter * 0.055;
  });
  return {
    setInput(x, y) {
      if (scene.metadata?.xrActive) {
        root.position.x -= offsetX * unitsPerMeter * 0.075;
        root.position.z += offsetY * unitsPerMeter * 0.055;
        targetX = targetY = offsetX = offsetY = 0;
        return;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      targetX = Math.max(-1, Math.min(1, x));
      targetY = Math.max(-1, Math.min(1, y));
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      root.position.copyFrom(origin);
    },
  };
}
