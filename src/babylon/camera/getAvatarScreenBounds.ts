import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { SceneWithMetadata, PositionPixels } from "../types";

const geometryBounds = new WeakMap<
  AbstractMesh,
  { min: Vector3; max: Vector3 }
>();

/** Project geometry bounds without MMD's expanded animation-culling margin. */
export function getAvatarScreenBounds(
  scene: SceneWithMetadata,
): PositionPixels | null {
  const model = scene.metadata?.modelMesh as AbstractMesh | undefined;
  const camera = scene.activeCamera;
  const engine = scene.getEngine();
  const canvas = engine.getRenderingCanvas();
  if (!model || !camera || !canvas) return null;
  const metadata = model.metadata as { meshes?: AbstractMesh[] } | null;
  const meshes = metadata?.meshes ?? [model];
  const viewport = camera.viewport.toGlobal(
    engine.getRenderWidth(),
    engine.getRenderHeight(),
  );
  const points: Vector3[] = [];
  for (const mesh of meshes) {
    let bounds = geometryBounds.get(mesh);
    if (!bounds) {
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
      if (!positions?.length) continue;
      const min = new Vector3(Infinity, Infinity, Infinity);
      const max = new Vector3(-Infinity, -Infinity, -Infinity);
      const point = new Vector3();
      for (let i = 0; i + 2 < positions.length; i += 3) {
        point.set(positions[i]!, positions[i + 1]!, positions[i + 2]!);
        min.minimizeInPlace(point);
        max.maximizeInPlace(point);
      }
      bounds = { min, max };
      geometryBounds.set(mesh, bounds);
    }
    const world = mesh.computeWorldMatrix();
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = Vector3.Project(
            new Vector3(x, y, z),
            world,
            scene.getTransformMatrix(),
            viewport,
          );
          if (
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            point.z >= 0 &&
            point.z <= 1
          )
            points.push(point);
        }
  }
  if (!points.length) return null;
  const rect = canvas.getBoundingClientRect();
  const x = Math.min(...points.map((point) => point.x));
  const y = Math.min(...points.map((point) => point.y));
  return {
    x: rect.left + (x * rect.width) / engine.getRenderWidth(),
    y: rect.top + (y * rect.height) / engine.getRenderHeight(),
    width:
      ((Math.max(...points.map((point) => point.x)) - x) * rect.width) /
      engine.getRenderWidth(),
    height:
      ((Math.max(...points.map((point) => point.y)) - y) * rect.height) /
      engine.getRenderHeight(),
  };
}
