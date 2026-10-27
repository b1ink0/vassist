import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/loaders/glTF";
import { createQuietStage } from "../../src/babylon/stages/builtins/QuietStages";
import { createMossHouse } from "../../src/babylon/stages/builtins/MossHouse";
import { createRainlightLibrary } from "../../src/babylon/stages/builtins/RainlightLibrary";
import { createAsterObservatory } from "../../src/babylon/stages/builtins/AsterObservatory";
import assetMap from "../../src/babylon/stages/assetMap.json";
import type {
  BuiltInStageId,
  QuietStageId,
} from "../../src/config/stageConfig";
import type {
  AuthoredStage,
  AuthoredStageOptions,
} from "../../src/babylon/stages/types";

declare global {
  interface Window {
    renderStage: (id: BuiltInStageId) => Promise<void>;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("canvas");
if (!canvas) throw new Error("Missing stage preview canvas");
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
let scene: Scene | undefined;
let activeStage: AuthoredStage | undefined;
window.renderStage = async (id) => {
  activeStage?.dispose();
  scene?.dispose();
  scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("preview", new Vector3(0, 1.5, -5), scene);
  const factories: Partial<
    Record<
      BuiltInStageId,
      (scene: Scene, options: AuthoredStageOptions) => Promise<AuthoredStage>
    >
  > = {
    "moss-house": createMossHouse,
    "rainlight-library": createRainlightLibrary,
    "aster-observatory": createAsterObservatory,
  };
  const paths = id in assetMap ? assetMap[id as keyof typeof assetMap] : {};
  const assetUrls = Object.fromEntries(
    Object.entries(paths).map(([key, value]) => [
      key,
      "/res/assets/stages/" + value,
    ]),
  );
  const factory = factories[id];
  const stage = factory
    ? await factory(scene, { assetUrls, quality: "balanced" })
    : createQuietStage(scene, {
        preset: id as QuietStageId,
        lighting: true,
        realShadows: false,
        contactShadow: false,
      });
  activeStage = stage;
  stage.setSeason?.("summer");
  stage.setTime?.(id === "dusk" ? 17.5 : 15.5);
  const preset = stage.cameraPreset ?? stage.cameraPresets?.companion;
  if (preset) {
    camera.position.copyFrom(Vector3.FromArray(preset.position));
    camera.setTarget(Vector3.FromArray(preset.target));
    camera.fov = preset.fov ?? 0.8;
  }
  if (id === "ink" || id === "dusk") {
    camera.setTarget(new Vector3(0, 2.2, 0));
    camera.fov = 0.85;
  }
  if (id === "stillwater") {
    camera.position.set(1.8, 1.3, -3.5);
    camera.setTarget(new Vector3(0, 0.95, 0));
    camera.fov = 0.85;
  }
  if (id === "slate") camera.setTarget(new Vector3(0, 1.25, 0));
  scene.activeCamera = camera;
  await scene.whenReadyAsync();
  for (let i = 0; i < 8; i++) {
    stage.update?.(1 / 60);
    scene.render();
  }
};
