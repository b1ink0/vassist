import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";

/** A room owns one source container per prop, shared by its placed instances. */
export class StageAssets {
  private readonly containers = new Map<string, AssetContainer>();
  private readonly loading = new Map<string, Promise<AssetContainer>>();
  private readonly bounds = new Map<string, { min: Vector3; max: Vector3 }>();
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly urls: Record<string, string>,
    private readonly onMaterial: (material: PBRMaterial) => void,
    private readonly onProgress: (message: string) => void,
  ) {}

  url(name: string): string {
    const url = this.urls[name];
    if (!url) throw new Error(`Missing stage asset: ${name}`);
    return url;
  }

  async load(name: string): Promise<AssetContainer> {
    if (this.disposed) throw new Error("Stage assets have been disposed");
    const cached = this.containers.get(name);
    if (cached) return cached;
    const pending = this.loading.get(name);
    if (pending) return pending;
    const request = this.loadContainer(name);
    this.loading.set(name, request);
    try {
      return await request;
    } finally {
      this.loading.delete(name);
    }
  }

  async preload(): Promise<void> {
    const names = Object.keys(this.urls)
      .filter((name) => name.endsWith(".glb"))
      .map((name) => name.slice(0, -4));
    for (let i = 0; i < names.length; i += 3)
      await Promise.all(names.slice(i, i + 3).map((name) => this.load(name)));
  }

  private async loadContainer(name: string): Promise<AssetContainer> {
    this.onProgress(`Loading ${name}`);
    const container = await LoadAssetContainerAsync(
      this.url(`${name}.glb`),
      this.scene,
      {
        pluginExtension: ".glb",
        pluginOptions: {
          gltf: {
            preprocessUrlAsync: async (url: string) => {
              const dependency = Object.keys(this.urls).find(
                (key) => url === key || url.endsWith(`/${key}`),
              );
              return dependency ? this.url(dependency) : url;
            },
          },
        },
      },
    );
    if (this.disposed || this.scene.isDisposed) {
      container.dispose();
      throw new Error("Stage scene was disposed while loading");
    }
    this.containers.set(name, container);
    for (const material of container.materials)
      if (material instanceof PBRMaterial) {
        material.maxSimultaneousLights = 4;
        this.onMaterial(material);
      }
    return container;
  }

  async place(
    name: string,
    parent: TransformNode,
    position: Vector3,
    height: number,
    yaw = 0,
    cast = true,
  ): Promise<TransformNode & { assetRoot: TransformNode }> {
    const container = await this.load(name);
    const instance = container.instantiateModelsToScene(
      (nodeName) => `${name} ${nodeName}`,
      false,
      { doNotInstantiate: false },
    );
    const normalizer = new TransformNode(
      `${name} normalized origin`,
      this.scene,
    );
    for (const node of instance.rootNodes) node.parent = normalizer;
    const cachedBounds = this.bounds.get(name);
    const min = cachedBounds?.min ?? new Vector3(Infinity, Infinity, Infinity),
      max = cachedBounds?.max ?? new Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of normalizer.getChildMeshes()) {
      if (!mesh.getTotalVertices()) continue;
      if (!cachedBounds) {
        mesh.computeWorldMatrix(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        min.minimizeInPlace(bounds.minimumWorld);
        max.maximizeInPlace(bounds.maximumWorld);
      }
      mesh.receiveShadows = true;
      mesh.metadata = { ...mesh.metadata, stageCast: cast };
    }
    if (!Number.isFinite(min.y) || max.y <= min.y) {
      normalizer.dispose();
      throw new Error(`Stage prop ${name} has no usable geometry`);
    }
    if (!cachedBounds) this.bounds.set(name, { min, max });
    const scale = height / (max.y - min.y);
    normalizer.scaling.setAll(scale);
    normalizer.position.set(
      (-(min.x + max.x) / 2) * scale,
      -min.y * scale,
      (-(min.z + max.z) / 2) * scale,
    );
    const anchor = new TransformNode(`${name} placement`, this.scene);
    normalizer.parent = anchor;
    anchor.parent = parent;
    anchor.position.copyFrom(position);
    anchor.rotation.y = yaw;
    const assetRoot =
      instance.rootNodes.find(
        (node): node is TransformNode => node instanceof TransformNode,
      ) ?? normalizer;
    return Object.assign(anchor, { assetRoot });
  }

  dispose(): void {
    this.disposed = true;
    for (const container of this.containers.values()) container.dispose();
    this.containers.clear();
    this.bounds.clear();
    this.loading.clear();
  }
}
