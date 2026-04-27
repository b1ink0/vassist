import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"

export class MmdCameraAutoFocus {
  constructor(camera, pipeline) {
    this._camera = camera
    this._pipeline = pipeline
    pipeline.depthOfField.fStop = 0.05
    pipeline.depthOfField.focalLength = 20

    this._headBone = null
    this._skeletonWorldMatrix = null
    this._beforeRender = null
  }

  setTarget(mmdModel, headBoneName = "頭") {
    this._headBone =
      mmdModel.runtimeBones.find(bone => bone.name === headBoneName) ?? null
  }

  setSkeletonWorldMatrix(matrix) {
    this._skeletonWorldMatrix = matrix
  }

  register(scene) {
    if (this._beforeRender) return

    const camera = this._camera
    const defaultPipeline = this._pipeline
    const rotationMatrix = new Matrix()
    const cameraNormal = new Vector3()
    const cameraEyePosition = new Vector3()
    const skeletonWorldMatrix = this._skeletonWorldMatrix
    const boneWorldMatrix = new Matrix()
    const headRelativePosition = new Vector3()

    this._beforeRender = () => {
      if (scene.activeCamera !== camera) {
        defaultPipeline.depthOfFieldEnabled = false
        return
      }
      defaultPipeline.depthOfFieldEnabled = true

      const cameraRotation = camera.rotation
      Matrix.RotationYawPitchRollToRef(
        -cameraRotation.y,
        -cameraRotation.x,
        -cameraRotation.z,
        rotationMatrix
      )

      Vector3.TransformNormalFromFloatsToRef(
        0,
        0,
        1,
        rotationMatrix,
        cameraNormal
      )

      camera.position.addToRef(
        Vector3.TransformCoordinatesFromFloatsToRef(
          0,
          0,
          camera.distance,
          rotationMatrix,
          cameraEyePosition
        ),
        cameraEyePosition
      )

      if (camera.parent !== null) {
        camera.parent.computeWorldMatrix()
        const cameraParentWorldMatrix = camera.parent.getWorldMatrix()

        Vector3.TransformCoordinatesToRef(
          cameraEyePosition,
          cameraParentWorldMatrix,
          cameraEyePosition
        )
        Vector3.TransformNormalToRef(
          cameraNormal,
          cameraParentWorldMatrix,
          cameraNormal
        )
        cameraNormal.normalize()
      }

      if (skeletonWorldMatrix !== null) {
        this._headBone
          .getWorldMatrixToRef(boneWorldMatrix)
          .multiplyToRef(skeletonWorldMatrix, boneWorldMatrix)
      } else {
        this._headBone.getWorldMatrixToRef(boneWorldMatrix)
      }

      boneWorldMatrix
        .getTranslationToRef(headRelativePosition)
        .subtractToRef(cameraEyePosition, headRelativePosition)

      defaultPipeline.depthOfField.focusDistance =
        (Vector3.Dot(headRelativePosition, cameraNormal) /
          Vector3.Dot(cameraNormal, cameraNormal)) *
        1000
    }

    scene.onBeforeRenderObservable.add(this._beforeRender)
  }

  unregister(scene) {
    if (!this._beforeRender) return

    scene.onBeforeRenderObservable.removeCallback(this._beforeRender)
    this._beforeRender = null
  }
}
