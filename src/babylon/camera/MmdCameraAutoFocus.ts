import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type {
  AutoFocusCameraLike,
  DepthOfFieldPipelineLike,
  RuntimeBoneLike,
  RuntimeBoneModelLike,
} from '../types';

/**
 * Auto-focus controller that keeps depth-of-field focused near the model head.
 */
export class MmdCameraAutoFocus {
  private readonly _camera: AutoFocusCameraLike;
  private readonly _pipeline: DepthOfFieldPipelineLike;
  private _headBone: RuntimeBoneLike | null;
  private _skeletonWorldMatrix: Matrix | null;
  private _beforeRender: (() => void) | null;

  /**
   * @param {AutoFocusCameraLike} camera - Camera that drives focus calculation.
   * @param {DepthOfFieldPipelineLike} pipeline - Rendering pipeline with DoF settings.
   */
  constructor(camera: AutoFocusCameraLike, pipeline: DepthOfFieldPipelineLike) {
    this._camera = camera;
    this._pipeline = pipeline;
    pipeline.depthOfField.fStop = 0.05;
    pipeline.depthOfField.focalLength = 20;

    this._headBone = null;
    this._skeletonWorldMatrix = null;
    this._beforeRender = null;
  }

  /**
   * Set the target model bone used as the focus anchor.
   * @param {RuntimeBoneModelLike} mmdModel - Model containing runtime bones.
   * @param {string} [headBoneName='頭'] - Name of head bone.
   */
  setTarget(mmdModel: RuntimeBoneModelLike, headBoneName = '頭'): void {
    this._headBone =
      mmdModel.runtimeBones.find((bone) => bone.name === headBoneName) ?? null;
  }

  /**
   * Set world transform of the skeleton root for consistent focus placement.
   * @param {Matrix | null} matrix - Skeleton world matrix.
   */
  setSkeletonWorldMatrix(matrix: Matrix | null): void {
    this._skeletonWorldMatrix = matrix;
  }

  /**
   * Register per-frame focus updates.
   * @param {Scene} scene - Scene to attach observers to.
   */
  register(scene: Scene): void {
    if (this._beforeRender) return;

    const camera = this._camera;
    const defaultPipeline = this._pipeline;
    const rotationMatrix = new Matrix();
    const cameraNormal = new Vector3();
    const cameraEyePosition = new Vector3();
    const boneWorldMatrix = new Matrix();
    const headRelativePosition = new Vector3();

    this._beforeRender = () => {
      if (scene.activeCamera !== camera) {
        defaultPipeline.depthOfFieldEnabled = false;
        return;
      }

      const headBone = this._headBone;
      if (!headBone) {
        defaultPipeline.depthOfFieldEnabled = false;
        return;
      }

      defaultPipeline.depthOfFieldEnabled = true;

      const cameraRotation = camera.rotation;
      Matrix.RotationYawPitchRollToRef(
        -cameraRotation.y,
        -cameraRotation.x,
        -cameraRotation.z,
        rotationMatrix
      );

      Vector3.TransformNormalFromFloatsToRef(
        0,
        0,
        1,
        rotationMatrix,
        cameraNormal
      );

      camera.position.addToRef(
        Vector3.TransformCoordinatesFromFloatsToRef(
          0,
          0,
          camera.distance,
          rotationMatrix,
          cameraEyePosition
        ),
        cameraEyePosition
      );

      if (camera.parent !== null) {
        camera.parent.computeWorldMatrix();
        const cameraParentWorldMatrix = camera.parent.getWorldMatrix();

        Vector3.TransformCoordinatesToRef(
          cameraEyePosition,
          cameraParentWorldMatrix,
          cameraEyePosition
        );
        Vector3.TransformNormalToRef(
          cameraNormal,
          cameraParentWorldMatrix,
          cameraNormal
        );
        cameraNormal.normalize();
      }

      const skeletonWorldMatrix = this._skeletonWorldMatrix;
      if (skeletonWorldMatrix !== null) {
        headBone
          .getWorldMatrixToRef(boneWorldMatrix)
          .multiplyToRef(skeletonWorldMatrix, boneWorldMatrix);
      } else {
        headBone.getWorldMatrixToRef(boneWorldMatrix);
      }

      boneWorldMatrix
        .getTranslationToRef(headRelativePosition)
        .subtractToRef(cameraEyePosition, headRelativePosition);

      defaultPipeline.depthOfField.focusDistance =
        (Vector3.Dot(headRelativePosition, cameraNormal) /
          Vector3.Dot(cameraNormal, cameraNormal)) *
        1000;
    };

    scene.onBeforeRenderObservable.add(this._beforeRender);
  }

  /**
   * Unregister per-frame focus updates.
   * @param {Scene} scene - Scene where observer was registered.
   */
  unregister(scene: Scene): void {
    if (!this._beforeRender) return;

    scene.onBeforeRenderObservable.removeCallback(this._beforeRender);
    this._beforeRender = null;
  }
}
