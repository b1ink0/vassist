import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { StageCalibration } from "../../config/stageConfig";
import type { AuthoredStage } from "./types";

/** Read actual geometry rather than the MMD loader's animation-culling margin. */
export function getAvatarBounds(meshes: Mesh[]) {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const point = Vector3.Zero();
  for (const mesh of meshes) {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) continue;
    const world = mesh.computeWorldMatrix(true);
    for (let i = 0; i + 2 < positions.length; i += 3) {
      const x = positions[i],
        y = positions[i + 1],
        z = positions[i + 2];
      if (x === undefined || y === undefined || z === undefined) continue;
      point.set(x, y, z);
      Vector3.TransformCoordinatesToRef(point, world, point);
      min.minimizeInPlace(point);
      max.maximizeInPlace(point);
    }
  }
  if (!Number.isFinite(min.y) || max.y <= min.y)
    throw new Error("Avatar geometry is unavailable for stage alignment");
  return { min, max, height: max.y - min.y };
}

export function placeStage(
  root: TransformNode,
  anchor: AuthoredStage["characterAnchor"],
  meshes: Mesh[],
  calibration: StageCalibration,
): number {
  const bounds = getAvatarBounds(meshes);
  const heightMeters = Math.min(4, Math.max(0.25, calibration.heightMeters));
  const unitsPerMeter = bounds.height / heightMeters;
  const yaw = Math.PI - anchor.facingRadians;
  root.scaling.setAll(unitsPerMeter);
  root.rotation.y = yaw;
  const origin = Vector3.TransformCoordinates(
    Vector3.FromArray(anchor.position).scale(unitsPerMeter),
    Matrix.RotationY(yaw),
  );
  root.position.set(
    (bounds.min.x + bounds.max.x) * 0.5 - origin.x,
    bounds.min.y + calibration.floorOffset * unitsPerMeter - origin.y,
    (bounds.min.z + bounds.max.z) * 0.5 - origin.z,
  );
  return unitsPerMeter;
}
