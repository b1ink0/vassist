import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Shared rounded geometry used by the rooms' furniture and architectural details. */
export function createRoundedBox(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  depth: number,
  radius: number,
): Mesh {
  const half = [width / 2, height / 2, depth / 2] as const;
  const inner = half.map((value) => Math.max(0, value - radius));
  const positions: number[] = [],
    indices: number[] = [],
    normals: number[] = [],
    uvs: number[] = [];
  const segments = 6;
  for (let face = 0; face < 6; face++) {
    const axis = Math.floor(face / 2) as 0 | 1 | 2;
    const sign = face % 2 ? 1 : -1;
    const u = ((axis + 1) % 3) as 0 | 1 | 2;
    const v = ((axis + 2) % 3) as 0 | 1 | 2;
    const start = positions.length / 3;
    for (let j = 0; j <= segments; j++)
      for (let i = 0; i <= segments; i++) {
        const point: [number, number, number] = [0, 0, 0];
        point[axis] = sign * half[axis];
        point[u] = ((i / segments) * 2 - 1) * half[u];
        point[v] = ((j / segments) * 2 - 1) * half[v];
        const clamped = point.map((value, index) =>
          Math.max(-inner[index]!, Math.min(inner[index]!, value)),
        );
        const delta = Vector3.FromArray(point).subtract(
          Vector3.FromArray(clamped),
        );
        if (delta.lengthSquared() > 0) delta.normalize().scaleInPlace(radius);
        positions.push(
          clamped[0]! + delta.x,
          clamped[1]! + delta.y,
          clamped[2]! + delta.z,
        );
        uvs.push(i / segments, j / segments);
      }
    for (let j = 0; j < segments; j++)
      for (let i = 0; i < segments; i++) {
        const a = start + j * (segments + 1) + i,
          b = a + 1,
          c = a + segments + 1,
          d = c + 1;
        if (sign > 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  Object.assign(data, { positions, indices, normals, uvs });
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}
