import type { Mesh, Scene, TransformNode } from "@babylonjs/core";
import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { ShadowOnlyMaterial } from "@babylonjs/materials/shadowOnly";
import type { ARProvider } from "./ARProvider";
import type { ARLightEstimate } from "./ARTypes";

export class ARLightingController {
  private readonly hemisphericLight: HemisphericLight;
  private readonly directionalLight: DirectionalLight;
  private readonly shadowLight: DirectionalLight;
  private readonly shadowReceiver: Mesh;
  private readonly shadowGenerator: ShadowGenerator;

  constructor(scene: Scene, arProvider: ARProvider) {
    this.hemisphericLight = new HemisphericLight(
      "arHemiLight",
      new Vector3(0, 1, 0),
      scene,
    );
    this.hemisphericLight.diffuse = Color3.White();
    this.hemisphericLight.groundColor = new Color3(0.45, 0.45, 0.45);
    this.hemisphericLight.specular = Color3.Black();
    this.hemisphericLight.intensity = 0.55;

    this.directionalLight = new DirectionalLight(
      "arDirLight",
      new Vector3(0.5, -1, 1),
      scene,
    );
    this.directionalLight.diffuse = Color3.White();
    this.directionalLight.intensity = 0.65;

    const metadata = scene.metadata as
      | {
          directionalLight?: DirectionalLight;
          shadowGenerator?: ShadowGenerator | null;
        }
      | undefined;
    this.shadowLight = metadata?.directionalLight ?? this.directionalLight;
    this.shadowGenerator =
      metadata?.shadowGenerator ??
      new ShadowGenerator(2048, this.shadowLight, true);
    this.shadowGenerator.usePercentageCloserFiltering = false;
    this.shadowGenerator.usePoissonSampling = false;
    this.shadowGenerator.useExponentialShadowMap = false;
    this.shadowGenerator.useBlurExponentialShadowMap = false;
    this.shadowGenerator.useCloseExponentialShadowMap = false;
    this.shadowGenerator.useBlurCloseExponentialShadowMap = false;
    this.shadowGenerator.forceBackFacesOnly = false;
    this.shadowGenerator.transparencyShadow = false;
    this.shadowGenerator.frustumEdgeFalloff = 0;
    this.shadowGenerator.mapSize = 4096;
    this.shadowGenerator.setDarkness(0.28);

    const shadowMaterial = new ShadowOnlyMaterial("arShadowMaterial", scene);
    shadowMaterial.activeLight = this.shadowLight;
    shadowMaterial.shadowColor = Color3.Black();
    shadowMaterial.alpha = 0.62;
    shadowMaterial.disableDepthWrite = true;

    this.shadowReceiver = MeshBuilder.CreateGround(
      "arShadowReceiver",
      { width: 1, height: 1, subdivisions: 1 },
      scene,
    );
    this.shadowReceiver.material = shadowMaterial;
    this.shadowReceiver.receiveShadows = true;
    this.shadowReceiver.isPickable = false;
    this.shadowReceiver.alwaysSelectAsActiveMesh = true;
    this.shadowReceiver.renderingGroupId = 1;
    scene.setRenderingAutoClearDepthStencil(1, false, false, false);
    this.shadowReceiver.setEnabled(false);

    this.setActive(false);

    arProvider.onLightEstimateChanged((estimate) => this.update(estimate));
  }

  public setActive(active: boolean): void {
    this.hemisphericLight.setEnabled(active);
    this.directionalLight.setEnabled(active);
  }

  public setTargetNode(_node: TransformNode | null): void {
    // A ShadowOnlyMaterial receiver cannot composite reliably when Babylon's
    // transparent WebGL canvas sits above a native Android camera surface. It
    // becomes a visible two-triangle polygon, so AR intentionally uses no
    // synthetic ground geometry.
  }

  public showContactShadow(
    floorPosition: Vector3,
    modelHeightUnits: number,
    modelRoot: TransformNode,
  ): void {
    const shadowExtent = Math.max(modelHeightUnits * 4, 10);
    const modelCenter = floorPosition.add(
      new Vector3(0, modelHeightUnits * 0.5, 0),
    );
    const lightDirection = this.shadowLight.direction.normalize();
    this.shadowLight.position.copyFrom(
      modelCenter.subtract(lightDirection.scale(modelHeightUnits * 4)),
    );
    this.shadowLight.autoUpdateExtends = false;
    this.shadowLight.autoCalcShadowZBounds = false;
    this.shadowLight.shadowFrustumSize = shadowExtent;
    this.shadowLight.shadowMinZ = 0;
    this.shadowLight.shadowMaxZ = shadowExtent * 2;
    this.shadowLight.shadowOrthoScale = 0;
    this.shadowLight.forceProjectionMatrixCompute();

    modelRoot
      .getChildMeshes(false)
      .forEach((mesh) => this.shadowGenerator.addShadowCaster(mesh, false));
    this.shadowReceiver.position.copyFrom(floorPosition);
    this.shadowReceiver.position.y -= Math.max(
      modelHeightUnits * 0.004,
      0.004,
    );
    this.shadowReceiver.scaling.copyFromFloats(
      modelHeightUnits * 5,
      1,
      modelHeightUnits * 5,
    );
    this.shadowReceiver.setEnabled(true);
    console.info(
      `[VASSIST_AR] shadow:silhouette-shown floor=${floorPosition.x},${floorPosition.y},${floorPosition.z} ` +
        `casters=${modelRoot.getChildMeshes(false).length} extent=${shadowExtent} ` +
        `depth=0..${shadowExtent * 2}`,
    );
  }

  public hideContactShadow(): void {
    this.shadowReceiver.setEnabled(false);
  }

  private update(estimate: ARLightEstimate) {
    if (estimate.mainLightIntensity) {
      const color = estimate.mainLightIntensity;
      const maximum = Math.max(color[0], color[1], color[2], 0.001);
      this.directionalLight.intensity = Math.min(
        Math.max(maximum / 2000, 0.5),
        0.8,
      );
    }
  }
}
