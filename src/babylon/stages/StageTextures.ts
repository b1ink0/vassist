import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";

/** DynamicTexture uses a browser canvas, whose full drawing API exceeds Babylon's minimal interface. */
export function drawingContext(
  texture: DynamicTexture,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  return texture.getContext() as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
}

export function setTextureScale(
  texture: BaseTexture | null,
  u: number,
  v: number,
): void {
  if (texture instanceof Texture) {
    texture.uScale = u;
    texture.vScale = v;
  }
}
