import type { Scene } from "@babylonjs/core/scene";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import {
  QUIET_STAGE_IDS,
  type BuiltInStageId,
  type QuietStageId,
} from "../../config/stageConfig";
import resourceLoader from "../../utils/ResourceLoader";
import assetMap from "./assetMap.json";
import type { AuthoredStage, AuthoredStageOptions } from "./types";

export async function createBuiltInStage(
  scene: Scene,
  id: BuiltInStageId,
  quality: AuthoredStageOptions["quality"],
  registerCleanup?: AuthoredStageOptions["registerCleanup"],
): Promise<AuthoredStage> {
  if (QUIET_STAGE_IDS.includes(id as QuietStageId)) {
    const { createQuietStage } = await import("./builtins/QuietStages");
    return createQuietStage(scene, {
      preset: id as QuietStageId,
      lighting: true,
      realShadows: true,
      contactShadow: false,
      shadowSize: quality === "mobile" ? 2048 : 4096,
      shadowFilteringQuality:
        quality === "mobile"
          ? ShadowGenerator.QUALITY_MEDIUM
          : ShadowGenerator.QUALITY_HIGH,
    });
  }
  await import("@babylonjs/loaders/glTF");
  const paths = assetMap[id as keyof typeof assetMap];
  const assetUrls: Record<string, string> = Object.fromEntries(
    await Promise.all(
      Object.entries(paths).map(async ([name, path]) => [
        name,
        await resourceLoader.getURLAsync(`res/assets/stages/${path}`),
      ]),
    ),
  );
  const options = {
    assetUrls,
    quality,
    ...(registerCleanup ? { registerCleanup } : {}),
  };
  switch (id) {
    case "aster-observatory":
      return (
        await import("./builtins/AsterObservatory")
      ).createAsterObservatory(scene, options);
    case "moss-house":
      return (await import("./builtins/MossHouse")).createMossHouse(
        scene,
        options,
      );
    case "rainlight-library":
      return (
        await import("./builtins/RainlightLibrary")
      ).createRainlightLibrary(scene, options);
    default:
      throw new Error(`Unknown built-in stage: ${id}`);
  }
}
