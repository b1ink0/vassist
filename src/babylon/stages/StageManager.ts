import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowLight } from "@babylonjs/core/Lights/shadowLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import type { SceneBuildConfig, SceneWithMetadata } from "../types";
import { stageStorageService } from "../../services/storage/StageStorageService";
import {
  DefaultStageCalibration,
  DefaultStageOptions,
  getStageSeasonForDate,
  type StageFormat,
  type StageSeason,
  type StageOptions,
} from "../../config/stageConfig";
import { createBuiltInStage } from "./StageRegistry";
import { getAvatarBounds, placeStage } from "./StagePlacement";
import { attachStageParallax } from "./StageParallax";
import { createStageSeasonalEffects } from "./StageSeasonalEffects";
import { registerStageSurface } from "./stageSurfaceState";
import type { StageRuntime } from "./types";
import { canRenderStages } from "./stageAvailability";

export async function loadStage(
  scene: SceneWithMetadata,
  config: SceneBuildConfig,
  avatarMeshes: Mesh[],
  parent: TransformNode,
  materialBuilder: MmdStandardMaterialBuilder,
): Promise<StageRuntime | null> {
  if (!canRenderStages && config.presentation !== "xr") return null;
  if (
    config.stageUrl === null ||
    (!config.stageUrl && config.uiConfig?.stage?.selection?.kind === "none")
  )
    return null;
  const selection = config.uiConfig?.stage?.selection;
  if (!config.stageUrl && selection?.kind === "builtin") {
    const settings = {
      ...DefaultStageOptions,
      ...config.uiConfig?.stage?.options[selection.id],
    };
    return loadEnvironment(
      scene,
      config,
      avatarMeshes,
      parent,
      selection.id,
      settings,
    );
  }
  const stored = config.stageUrl
    ? null
    : selection?.kind === "custom"
      ? await stageStorageService.getStage(selection.id)
      : await stageStorageService.getDefaultStage();
  if (!config.stageUrl && !stored?.stageData) return null;
  const settingsId =
    selection?.kind === "custom"
      ? selection.id
      : typeof stored?.id === "string"
        ? stored.id
        : "custom-stage";
  const customSettings = {
    ...DefaultStageOptions,
    ...config.uiConfig?.stage?.options[settingsId],
  };
  const format: StageFormat = config.stageUrl
    ? (config.stageFormat ?? "bpmx")
    : stored?.metadata.format === "glb"
      ? "glb"
      : stored?.metadata.format === "babylon"
        ? "babylon"
        : "bpmx";
  const source = config.stageUrl ?? URL.createObjectURL(stored!.stageData!);
  try {
    if (format === "glb") await import("@babylonjs/loaders/glTF");
    if (format === "babylon")
      await import("@babylonjs/core/Loading/Plugins/babylonFileLoader");
    const container = await LoadAssetContainerAsync(source, scene, {
      pluginExtension: `.${format}`,
      ...(format === "bpmx"
        ? {
            pluginOptions: {
              mmdmodel: {
                materialBuilder,
                boundingBoxMargin: 60,
                loggingEnabled: true,
              },
            },
          }
        : {}),
    });
    if (scene.isDisposed) {
      container.dispose();
      return null;
    }
    const root = new TransformNode("stageRoot", scene);
    const activeCamera = scene.activeCamera;
    container.addAllToScene();
    scene.activeCamera = activeCamera;
    const topNodes = container.rootNodes.filter(
      (node): node is TransformNode =>
        node instanceof TransformNode && !node.parent,
    );
    for (const node of topNodes) node.parent = root;
    const meshes = container.meshes.filter(
      (mesh): mesh is Mesh => mesh instanceof Mesh,
    );
    const calibration =
      config.uiConfig?.stage?.calibration[
        config.modelId ?? "builtin_default_model"
      ] ?? DefaultStageCalibration;
    let units: number;
    try {
      if (format !== "bpmx")
        units = placeStage(
          root,
          { position: [0, 0, 0], facingRadians: Math.PI },
          avatarMeshes,
          calibration,
        );
      else
        units = getAvatarBounds(avatarMeshes).height / calibration.heightMeters;
    } catch (error) {
      container.dispose();
      root.dispose();
      throw error;
    }
    root.parent = parent;
    const seasonalEffects = createStageSeasonalEffects(
      scene,
      root,
      [0, 0, 0],
      config.renderQuality === "low" ? 0.5 : 1,
    );
    const season =
      customSettings.season === "auto"
        ? getStageSeasonForDate(new Date())
        : customSettings.season;
    seasonalEffects.setSeason(season);
    seasonalEffects.setEnabled(customSettings.seasonalEffects);
    for (const mesh of meshes) {
      mesh.receiveShadows = true;
      mesh.isPickable =
        config.presentation === "xr" && mesh.metadata?.xrWalkable === true;
    }
    const generator = scene.metadata.shadowGenerator as ShadowGenerator | null;
    for (const mesh of meshes) generator?.addShadowCaster(mesh, false);
    const parallax = attachStageParallax(scene, root, units);
    const unregisterSurface = registerStageSurface();
    let disposed = false;
    return {
      root,
      meshes,
      floorMeshes:
        config.presentation === "xr"
          ? meshes.filter((mesh) => mesh.metadata?.xrWalkable === true)
          : [],
      isEnvironment: format !== "bpmx",
      get brightness() {
        return Math.min(1.5, Math.max(0.35, customSettings.brightness ?? 1));
      },
      updateOptions(next) {
        Object.assign(customSettings, next);
        seasonalEffects.setSeason(
          customSettings.season === "auto"
            ? getStageSeasonForDate(new Date())
            : customSettings.season,
        );
        seasonalEffects.setEnabled(customSettings.seasonalEffects);
      },
      setAvatarShadows: (enabled) => {
        for (const mesh of avatarMeshes) {
          if (enabled) generator?.addShadowCaster(mesh, false);
          else generator?.removeShadowCaster(mesh, false);
        }
      },
      setParallax: parallax.setInput,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        for (const mesh of meshes) generator?.removeShadowCaster(mesh, false);
        seasonalEffects.dispose();
        parallax.dispose();
        unregisterSurface();
        container.dispose();
        root.dispose();
      },
    };
  } finally {
    if (!config.stageUrl) URL.revokeObjectURL(source);
  }
}

async function loadEnvironment(
  scene: SceneWithMetadata,
  config: SceneBuildConfig,
  avatarMeshes: Mesh[],
  parent: TransformNode,
  id: Parameters<typeof createBuiltInStage>[1],
  settings: StageOptions,
): Promise<StageRuntime | null> {
  const existingLights = new Set(scene.lights);
  const existingMeshes = new Set(scene.meshes);
  const existingNodes = new Set(scene.transformNodes);
  const cleanup: (() => void)[] = [];
  const existingMaterials = new Set(scene.materials);
  const existingTextures = new Set(scene.textures);
  const previous = {
    clearColor: scene.clearColor.clone(),
    environmentTexture: scene.environmentTexture,
    environmentIntensity: scene.environmentIntensity,
    fogMode: scene.fogMode,
    fogColor: scene.fogColor.clone(),
    fogDensity: scene.fogDensity,
  };
  let stage: Awaited<ReturnType<typeof createBuiltInStage>>;
  try {
    stage = await createBuiltInStage(
      scene,
      id,
      config.renderQuality === "low"
        ? "mobile"
        : config.renderQuality === "ultra" || config.renderQuality === "high"
          ? "high"
          : "balanced",
      (dispose) => cleanup.push(dispose),
    );
  } catch (error) {
    for (const dispose of cleanup) dispose();
    for (const node of [...scene.transformNodes])
      if (!existingNodes.has(node)) node.dispose();
    for (const light of [...scene.lights])
      if (!existingLights.has(light)) light.dispose();
    for (const mesh of [...scene.meshes])
      if (!existingMeshes.has(mesh)) mesh.dispose();
    for (const material of [...scene.materials])
      if (!existingMaterials.has(material)) material.dispose();
    for (const texture of [...scene.textures])
      if (!existingTextures.has(texture)) texture.dispose();
    Object.assign(scene, previous);
    throw error;
  }
  if (scene.isDisposed) {
    stage.dispose();
    return null;
  }
  const root = new TransformNode("stageWorldRoot", scene);
  const calibration =
    config.uiConfig?.stage?.calibration[
      config.modelId ?? "builtin_default_model"
    ] ?? DefaultStageCalibration;
  let units: number;
  try {
    units = placeStage(root, stage.characterAnchor, avatarMeshes, calibration);
  } catch (error) {
    stage.dispose();
    root.dispose();
    throw error;
  }
  stage.root.parent = root;
  if (stage.runtime) stage.runtime.parent = root;
  const lights = scene.lights.filter((light) => !existingLights.has(light));
  const disabledLights = [...existingLights].filter((light) =>
    light.isEnabled(),
  );
  for (const light of disabledLights) light.setEnabled(false);
  const shadowMaps: ShadowGenerator[] = [];
  const directionalShadowLights: DirectionalLight[] = [];
  const hasRoomLamps = lights.some((light) => light instanceof PointLight);
  for (const light of lights) {
    if (hasRoomLamps && light instanceof HemisphericLight)
      light.specular.setAll(0);
    light.parent = root;
    light.range *= units;
    light.radius *= units;
    if (light instanceof ShadowLight) {
      if (Number.isFinite(light.shadowMinZ)) light.shadowMinZ *= units;
      if (Number.isFinite(light.shadowMaxZ)) light.shadowMaxZ *= units;
      const generator = light.getShadowGenerator();
      if (generator instanceof ShadowGenerator) {
        generator.normalBias = Math.min(
          generator.normalBias * units,
          units * 0.008,
        );
        generator.setDarkness(0.38);
        shadowMaps.push(generator);
        if (light instanceof DirectionalLight) {
          light.autoUpdateExtends = false;
          directionalShadowLights.push(light);
        }
      }
    }
  }
  const avatarCasterSet = new Set(avatarMeshes);
  for (const generator of shadowMaps) {
    const renderList = generator.getShadowMap()?.renderList ?? [];
    for (const caster of [...renderList])
      if (!avatarCasterSet.has(caster as Mesh))
        generator.removeShadowCaster(caster, false);
  }
  root.parent = parent;
  const seasonalEffects = createStageSeasonalEffects(
    scene,
    root,
    stage.characterAnchor.position,
    config.renderQuality === "low" ? 0.5 : 1,
    stage.weatherBounds,
  );
  const parallax = attachStageParallax(scene, root, units);
  const unregisterSurface = registerStageSurface();
  const meshes = root
    .getChildMeshes()
    .filter((mesh): mesh is Mesh => mesh instanceof Mesh);
  for (const mesh of meshes) mesh.isPickable = false;
  if (config.presentation === "xr")
    for (const mesh of stage.floorMeshes ?? []) mesh.isPickable = true;
  const contact = meshes.find((mesh) => mesh.name === "quiet contact");
  const pointLights = lights.filter(
    (light): light is PointLight => light instanceof PointLight,
  );
  const nativeIntensities = new Map(
    pointLights.map((light) => [light, light.intensity]),
  );
  // PBR rooms also receive environment lighting, which MMD materials do not.
  // Supply that missing indirect light without adding specular highlights.
  const avatarAmbient = hasRoomLamps
    ? lights.flatMap((source) => {
        if (!(source instanceof HemisphericLight)) return [];
        const affected = avatarMeshes.filter((mesh) =>
          source.canAffectMesh(mesh),
        );
        if (!affected.length) return [];
        const fill = new HemisphericLight(
          `${source.name} avatar ambient`,
          source.direction.clone(),
          scene,
        );
        fill.parent = root;
        fill.includedOnlyMeshes = affected;
        fill.specular.setAll(0);
        source.excludedMeshes.push(...affected);
        return [{ source, fill }];
      })
    : [];
  const neutralFill = Color3.White();
  const avatarLamps = pointLights.flatMap((source) => {
    const affected = avatarMeshes.filter((mesh) => source.canAffectMesh(mesh));
    if (!affected.length) return [];
    const fill = new PointLight(
      `${source.name} avatar fill`,
      source.position.clone(),
      scene,
    );
    fill.parent = root;
    fill.includedOnlyMeshes = affected;
    fill.specular.setAll(0);
    source.excludedMeshes.push(...affected);
    return [{ source, fill }];
  });
  const updateAvatarLamps = () => {
    for (const { source, fill } of avatarAmbient) {
      fill.direction.copyFrom(source.direction);
      Color3.LerpToRef(source.diffuse, neutralFill, 0.6, fill.diffuse);
      Color3.LerpToRef(source.groundColor, neutralFill, 0.55, fill.groundColor);
      fill.intensity = 0.65 + Math.max(0, source.intensity) * 0.25;
      fill.setEnabled(source.isEnabled());
    }
    for (const { source, fill } of avatarLamps) {
      fill.position.copyFrom(source.position);
      fill.diffuse.copyFrom(source.diffuse);
      fill.range = source.range;
      fill.radius = source.radius;
      fill.setEnabled(source.isEnabled());
      const intensity = Math.max(0, source.intensity);
      fill.intensity = (0.65 * intensity) / (1 + intensity);
    }
  };
  const restoreIntensities = () => {
    for (const light of pointLights)
      light.intensity = nativeIntensities.get(light) ?? light.intensity;
  };
  const scaleIntensities = () => {
    for (const light of pointLights) {
      nativeIntensities.set(light, light.intensity);
      light.intensity *= units * units;
    }
  };
  let lightingMode =
    settings.lightingMode ??
    (settings.localTime
      ? "time"
      : settings.mood || stage.setMood
        ? "mood"
        : "time");
  let lastMinute = -1;
  let nextTimeCheckAt = 0;
  let shadowFitPending = false;
  const refitShadowBounds = () => {
    if (shadowFitPending || directionalShadowLights.length === 0) return;
    shadowFitPending = true;
    for (const light of directionalShadowLights) {
      light.autoUpdateExtends = true;
      light.forceProjectionMatrixCompute();
    }
    scene.onAfterRenderObservable.addOnce(() => {
      for (const light of directionalShadowLights)
        light.autoUpdateExtends = false;
      shadowFitPending = false;
    });
  };
  const applyTime = (timestamp = Date.now()) => {
    if (lightingMode === "time" && settings.localTime && stage.setTime) {
      if (timestamp < nextTimeCheckAt) return;
      nextTimeCheckAt = timestamp + 1000;
      const now = new Date(timestamp);
      const minute = now.getHours() * 60 + now.getMinutes();
      if (minute !== lastMinute) {
        stage.setTime(minute / 60);
        lastMinute = minute;
        refitShadowBounds();
      }
    }
  };
  let lastSeasonCheck = "";
  let nextSeasonCheckAt = 0;
  const applySeason = (timestamp = Date.now()) => {
    if (timestamp < nextSeasonCheckAt) return;
    nextSeasonCheckAt = timestamp + 60_000;
    const now = new Date(timestamp);
    const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    if (dateKey === lastSeasonCheck) return;
    lastSeasonCheck = dateKey;
    const season =
      settings.season === "auto" ? getStageSeasonForDate(now) : settings.season;
    stage.setSeason?.(season);
    seasonalEffects.setSeason(season);
  };
  if (lightingMode === "time") {
    if (settings.localTime) applyTime();
    else stage.setTime?.(settings.hour);
  } else if (settings.mood && stage.setMood) {
    stage.setMood(settings.mood);
    refitShadowBounds();
  }
  applySeason();
  seasonalEffects.setEnabled(settings.seasonalEffects);
  updateAvatarLamps();
  scaleIntensities();
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (
      typeof document !== "undefined" &&
      document.hidden &&
      !scene.metadata?.xrActive
    )
      return;
    const timestamp = Date.now();
    const updateLighting =
      (settings.animate && stage.animatedLighting) ||
      (lightingMode === "time" &&
        settings.localTime &&
        !!stage.setTime &&
        timestamp >= nextTimeCheckAt) ||
      timestamp >= nextSeasonCheckAt;
    if (updateLighting) {
      restoreIntensities();
      applyTime(timestamp);
      applySeason(timestamp);
    }
    if (settings.animate)
      stage.update?.(Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1));
    if (updateLighting) {
      updateAvatarLamps();
      scaleIntensities();
    }
  });
  let disposed = false;
  return {
    root,
    meshes,
    floorMeshes: stage.floorMeshes ?? [],
    isEnvironment: true,
    get brightness() {
      return Math.min(1.5, Math.max(0.35, settings.brightness ?? 1));
    },
    updateOptions(next) {
      const lightingChanged = (
        ["hour", "localTime", "lightingMode", "mood", "season"] as const
      ).some((key) => next[key] !== undefined && next[key] !== settings[key]);
      const effectsChanged =
        next.seasonalEffects !== undefined &&
        next.seasonalEffects !== settings.seasonalEffects;
      if (!lightingChanged) {
        Object.assign(settings, next);
        if (effectsChanged)
          seasonalEffects.setEnabled(settings.seasonalEffects);
        return;
      }
      restoreIntensities();
      Object.assign(settings, next);
      lightingMode =
        settings.lightingMode ??
        (settings.localTime
          ? "time"
          : settings.mood || stage.setMood
            ? "mood"
            : "time");
      lastMinute = -1;
      nextTimeCheckAt = 0;
      lastSeasonCheck = "";
      nextSeasonCheckAt = 0;
      if (lightingMode === "time") {
        if (settings.localTime) applyTime();
        else stage.setTime?.(settings.hour);
      } else if (settings.mood) stage.setMood?.(settings.mood);
      applySeason();
      seasonalEffects.setEnabled(settings.seasonalEffects);
      updateAvatarLamps();
      scaleIntensities();
      refitShadowBounds();
    },
    setAvatarShadows(enabled) {
      for (const generator of shadowMaps)
        for (const mesh of avatarMeshes) {
          if (enabled) generator.addShadowCaster(mesh, false);
          else generator.removeShadowCaster(mesh, false);
        }
      if (enabled) refitShadowBounds();
      contact?.setEnabled(enabled);
    },
    setParallax: parallax.setInput,
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.onBeforeRenderObservable.remove(observer);
      parallax.dispose();
      seasonalEffects.dispose();
      unregisterSurface();
      for (const { fill } of avatarAmbient) fill.dispose();
      for (const { fill } of avatarLamps) fill.dispose();
      stage.dispose();
      root.dispose();
      for (const light of disabledLights)
        if (!light.isDisposed()) light.setEnabled(true);
      Object.assign(scene, previous);
    },
  };
}
