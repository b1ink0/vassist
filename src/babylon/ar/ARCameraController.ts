import type { Scene } from "@babylonjs/core";
import { FreeCamera, Matrix, Quaternion, Vector3 } from "@babylonjs/core";
import type { ARProvider } from "./ARProvider";
import type { ARFrame } from "./ARTypes";

const HANDEDNESS = [1, 1, -1, 1] as const;

/** A camera that keeps ARCore's exact view matrix instead of decomposing it. */
class NativeARCamera extends FreeCamera {
  private nativeViewMatrix = Matrix.Identity();

  public setNativeMatrices(view: Matrix, projection: Matrix): void {
    this.nativeViewMatrix.copyFrom(view);
    this.freezeProjectionMatrix(projection);
    // Refresh globalPosition and Babylon's camera cache immediately.
    this.getViewMatrix(true);
  }

  public override _getViewMatrix(): Matrix {
    return this.nativeViewMatrix;
  }
}

/** Convert an ARCore RH view matrix into the app's Babylon LH world. */
const convertViewMatrix = (values: number[]): Matrix => {
  const converted = new Array<number>(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      const index = column * 4 + row;
      converted[index] =
        (values[index] ?? 0) *
        (HANDEDNESS[row] ?? 1) *
        (HANDEDNESS[column] ?? 1);
    }
  }
  return Matrix.FromArray(converted);
};

/** Convert LH camera coordinates back to RH before ARCore projection. */
const convertProjectionMatrix = (values: number[]): Matrix => {
  const converted = values.slice(0, 16);
  for (let row = 0; row < 4; row += 1) {
    const index = 8 + row; // third column in column-major storage
    converted[index] = -(converted[index] ?? 0);
  }
  return Matrix.FromArray(converted);
};

export class ARCameraController {
  private readonly camera: NativeARCamera;
  private lastTimestamp = -1;
  private unitsPerMeter = 1;
  private arOrigin = Vector3.Zero();
  private sceneOrigin = Vector3.Zero();

  constructor(scene: Scene, arProvider: ARProvider) {
    this.camera = new NativeARCamera("arCamera", Vector3.Zero(), scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 100;

    arProvider.onCameraFrame((frame) => this.update(frame));
  }

  private update(frame: ARFrame): void {
    if (
      frame.timestamp <= this.lastTimestamp ||
      frame.camera.viewMatrix.length !== 16 ||
      frame.camera.projectionMatrix.length !== 16
    ) {
      return;
    }

    this.lastTimestamp = frame.timestamp;
    const nativeWorld = convertViewMatrix(frame.camera.viewMatrix)
      .clone()
      .invert();
    const nativePosition = nativeWorld.getTranslation();
    const rotation = Quaternion.Identity();
    nativeWorld.decompose(undefined, rotation, undefined);
    const mappedPosition = nativePosition
      .subtract(this.arOrigin)
      .scale(this.unitsPerMeter)
      .add(this.sceneOrigin);
    const mappedWorld = Matrix.Compose(
      new Vector3(this.unitsPerMeter, this.unitsPerMeter, this.unitsPerMeter),
      rotation,
      mappedPosition,
    );

    this.camera.setNativeMatrices(
      mappedWorld.invert(),
      convertProjectionMatrix(frame.camera.projectionMatrix),
    );
  }

  public setWorldMapping(
    unitsPerMeter: number,
    arOrigin: Vector3,
    sceneOrigin: Vector3,
  ): void {
    this.unitsPerMeter = Math.max(unitsPerMeter, 0.0001);
    this.arOrigin.copyFrom(arOrigin);
    this.sceneOrigin.copyFrom(sceneOrigin);
  }

  public getCamera(): FreeCamera {
    return this.camera;
  }
}
