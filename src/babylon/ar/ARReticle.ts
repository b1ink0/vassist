import type { Mesh, Scene } from "@babylonjs/core";
import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import type { ARProvider } from "./ARProvider";
import type { ARHit } from "./ARTypes";
import { notifyARSurfaceFound } from "./ARModeLifecycle";

export class ARReticle {
  private readonly reticleMesh: Mesh;
  private currentHit: ARHit | null = null;
  private active = false;
  private hitTestPending = false;
  private lastHitTestAt = 0;
  private surfaceFound = false;
  private unitsPerMeter = 1;
  private arOrigin = Vector3.Zero();
  private sceneOrigin = Vector3.Zero();

  constructor(
    scene: Scene,
    private readonly arProvider: ARProvider,
  ) {
    this.reticleMesh = MeshBuilder.CreateTorus(
      "arReticle",
      { diameter: 0.16, thickness: 0.012, tessellation: 48 },
      scene,
    );

    const material = new StandardMaterial("arReticleMaterial", scene);
    material.diffuseColor = new Color3(0.15, 0.9, 1);
    material.emissiveColor = new Color3(0.1, 0.65, 0.8);
    material.disableLighting = true;
    this.reticleMesh.material = material;
    this.reticleMesh.isVisible = false;
    // ARCore supplies a custom projection matrix that Babylon cannot reliably
    // use for its normal mesh-frustum culling.
    this.reticleMesh.alwaysSelectAsActiveMesh = true;

    // 15 Hz stays responsive without creating overlapping bridge requests.
    scene.onBeforeRenderObservable.add(() => {
      void this.update();
    });
  }

  public setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.currentHit = null;
      this.reticleMesh.isVisible = false;
      this.setSurfaceFound(false);
    }
  }

  private setSurfaceFound(found: boolean): void {
    if (this.surfaceFound === found) return;
    this.surfaceFound = found;
    notifyARSurfaceFound(found);
    console.info(`[VASSIST_AR] reticle:surface-found=${found}`);
  }

  private async update(): Promise<void> {
    const now = performance.now();
    if (!this.active || this.hitTestPending || now - this.lastHitTestAt < 66) {
      return;
    }

    this.hitTestPending = true;
    this.lastHitTestAt = now;
    try {
      // Normalized coordinates avoid CSS-pixel/device-pixel mismatches.
      const hit = await this.arProvider.hitTest(0.5, 0.5);
      if (!this.active) return;

      this.currentHit = hit;
      this.reticleMesh.isVisible = hit !== null;
      this.setSurfaceFound(hit !== null);
      if (hit) {
        const hitPosition = new Vector3(hit.x, hit.y, -hit.z);
        this.reticleMesh.position.copyFrom(
          hitPosition
            .subtract(this.arOrigin)
            .scale(this.unitsPerMeter)
            .add(this.sceneOrigin),
        );
      }
    } catch {
      this.currentHit = null;
      this.reticleMesh.isVisible = false;
      this.setSurfaceFound(false);
    } finally {
      this.hitTestPending = false;
    }
  }

  public getCurrentHit(): ARHit | null {
    return this.currentHit;
  }

  public setWorldMapping(
    unitsPerMeter: number,
    arOrigin: Vector3,
    sceneOrigin: Vector3,
  ): void {
    this.unitsPerMeter = Math.max(unitsPerMeter, 0.0001);
    this.arOrigin.copyFrom(arOrigin);
    this.sceneOrigin.copyFrom(sceneOrigin);
    this.reticleMesh.scaling.setAll(this.unitsPerMeter);
  }
}
