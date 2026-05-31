/**
 * Scene Configuration
 *
 * Configuration for MMD Model Scene including model paths, camera settings,
 * physics, shadows, and other scene properties.
 *
 * Follows the same pattern as animationConfig.js with getter functions.
 */

import { resourceLoader } from "../utils/ResourceLoader";
import {
  normalizeOptionalEmbedAssetBaseUrl,
  normalizeOptionalEmbedAssetValue,
} from "../embed/config";
import { getEmbedConfig } from "../embed/runtimeStore";
import Logger from "../services/LoggerService";
import { isDesktop, isEmbed, isProduction } from "../utils/PlatformUtils";
import type {
  PositionManagerOptionsLike,
  RenderQualitySettingsLike,
} from "../babylon/types";

interface SceneConfigData {
  enableModelLoading: boolean;
  modelUrl: string;
  stageUrl?: string | null;
  customModelFile?: File;
  cameraAnimationUrl: string;
  enableCameraAnimation: boolean;
  orthoHeight: number;
  cameraDistance: number;
  positionConfig: PositionManagerOptionsLike;
  transparentBackground: boolean;
  enablePhysics: boolean;
  enableShadows: boolean;
  onLoadProgress: ((progress: number) => void) | null;
  onModelLoaded: ((modelMesh: unknown) => void) | null;
  onSceneReady: ((scene: unknown) => void) | null;
  modelId?: string;
  modelFileName?: string;
  portraitClipping?: number;
  _customModelBlobUrl?: string;
}

interface RenderQualityPreset extends RenderQualitySettingsLike {
  bloomThreshold: number;
  contrast: number;
  exposure: number;
  saturation: number;
}

type RenderQualityPresetMap = Record<
  "low" | "medium" | "high" | "ultra",
  RenderQualityPreset
>;

const RenderQualityPresets: RenderQualityPresetMap = {
  low: {
    samples: 1,
    bloomEnabled: false,
    chromaticAberrationEnabled: false,
    fxaaEnabled: true,
    bloomKernel: 32,
    bloomScale: 0.5,
    bloomWeight: 0.15,
    bloomThreshold: 0.95,
    contrast: 1.15,
    exposure: 1.0,
    saturation: 10,
  },
  medium: {
    samples: 2,
    bloomEnabled: true,
    chromaticAberrationEnabled: false,
    fxaaEnabled: true,
    bloomKernel: 32,
    bloomScale: 0.5,
    bloomWeight: 0.2,
    bloomThreshold: 0.9,
    contrast: 1.2,
    exposure: 1.05,
    saturation: 15,
  },
  high: {
    samples: 4,
    bloomEnabled: true,
    chromaticAberrationEnabled: false,
    fxaaEnabled: true,
    bloomKernel: 48,
    bloomScale: 0.5,
    bloomWeight: 0.25,
    bloomThreshold: 0.85,
    contrast: 1.2,
    exposure: 1.1,
    saturation: 15,
  },
  ultra: {
    samples: 8,
    bloomEnabled: true,
    chromaticAberrationEnabled: false,
    fxaaEnabled: true,
    bloomKernel: 48,
    bloomScale: 0.5,
    bloomWeight: 0.25,
    bloomThreshold: 0.8,
    contrast: 1.2,
    exposure: 1.1,
    saturation: 18,
  },
};

const RenderQualityPresetsAndroid: RenderQualityPresetMap = {
  low: RenderQualityPresets.low,
  medium: RenderQualityPresets.medium,
  high: { ...RenderQualityPresets.high, samples: 2, bloomKernel: 32 },
  ultra: { ...RenderQualityPresets.ultra, samples: 4 },
};

const resolveEmbedAssetUrl = (
  assetPath: string | null | undefined,
  assetBaseUrl: string | undefined,
): string | null => {
  const normalizedAssetPath = normalizeOptionalEmbedAssetValue(assetPath);
  if (!normalizedAssetPath) {
    return null;
  }

  const normalizedAssetBaseUrl =
    normalizeOptionalEmbedAssetBaseUrl(assetBaseUrl);
  if (!normalizedAssetBaseUrl) {
    return normalizedAssetPath;
  }

  try {
    return new URL(normalizedAssetPath, normalizedAssetBaseUrl).toString();
  } catch {
    return normalizedAssetPath;
  }
};

export function getRenderQualityPresets(
  isAndroid = false,
): RenderQualityPresetMap {
  return isAndroid ? RenderQualityPresetsAndroid : RenderQualityPresets;
}

/**
 * Default scene configuration
 */
const SceneConfig: SceneConfigData = {
  enableModelLoading: true,

  modelUrl: isDesktop
    ? "/res/assets/model/vassist_default.bpmx"
    : "res/assets/model/vassist_default.bpmx",
  cameraAnimationUrl: isDesktop
    ? "/res/private_test/motion/2.bvmd"
    : "res/private_test/motion/2.bvmd",
  enableCameraAnimation: true,

  orthoHeight: 12,
  cameraDistance: -30,

  positionConfig: {
    boundaryPadding: 0,
    allowPartialOffscreen: false,
    partialOffscreenAmount: 0,
  },

  transparentBackground: true,
  enablePhysics: true,
  enableShadows: true,

  onLoadProgress: null,
  onModelLoaded: null,
  onSceneReady: null,
};

/**
 * Resolve resource URLs for runtime environments that cannot use root-relative public paths as-is.
 * Extension mode uses ExtensionBridge, desktop production rewrites to packaged assets,
 * and embed mode resolves relative to the emitted embed bundle.
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Configuration with resolved URLs
 */
export async function resolveResourceURLs(
  config: SceneConfigData,
): Promise<SceneConfigData> {
  Logger.log(
    "sceneConfig",
    "resolveResourceURLs - isExtension:",
    resourceLoader.isExtensionMode(),
  );

  const needsResolution =
    resourceLoader.isExtensionMode() || isEmbed || (isDesktop && isProduction);

  if (!needsResolution) {
    Logger.log("sceneConfig", "Dev/Web mode - using paths as-is");
    return config;
  }

  Logger.log(
    "sceneConfig",
    `${isDesktop && isProduction ? "Desktop Production" : isEmbed ? "Embed" : "Extension"} mode - resolving URLs...`,
  );
  const resolvedConfig = { ...config };

  if (config.modelUrl && !config.modelUrl.startsWith("blob:")) {
    resolvedConfig.modelUrl = await resourceLoader.getURLAsync(config.modelUrl);
    Logger.log("sceneConfig", "Resolved modelUrl:", resolvedConfig.modelUrl);
  }

  if (config.stageUrl && !config.stageUrl.startsWith("blob:")) {
    resolvedConfig.stageUrl = await resourceLoader.getURLAsync(config.stageUrl);
    Logger.log("sceneConfig", "Resolved stageUrl:", resolvedConfig.stageUrl);
  }

  if (
    config.cameraAnimationUrl &&
    !config.cameraAnimationUrl.startsWith("blob:")
  ) {
    resolvedConfig.cameraAnimationUrl = await resourceLoader.getURLAsync(
      config.cameraAnimationUrl,
    );
    Logger.log(
      "sceneConfig",
      "Resolved cameraAnimationUrl:",
      resolvedConfig.cameraAnimationUrl,
    );
  }

  return resolvedConfig;
}

/**
 * Get scene configuration
 * Returns a copy to prevent mutations
 *
 * @returns {Object} Scene configuration
 */
export function getSceneConfig(): SceneConfigData {
  const config = { ...SceneConfig };
  const embedConfig = getEmbedConfig();
  const embedModelUrl = resolveEmbedAssetUrl(
    embedConfig.assets.modelUrl,
    embedConfig.assets.assetBaseUrl,
  );
  const hasEmbedStageOverride = embedConfig.assets.stageUrl !== undefined;
  const embedStageUrl = resolveEmbedAssetUrl(
    embedConfig.assets.stageUrl,
    embedConfig.assets.assetBaseUrl,
  );

  if (embedModelUrl) {
    config.modelUrl = embedModelUrl;
    config.modelId = "embed_config_model";
    config.modelFileName = embedModelUrl.split("/").pop() || "embed-model";
    delete config.customModelFile;
  }

  if (hasEmbedStageOverride) {
    config.stageUrl = embedStageUrl;
  }

  return config;
}

/**
 * Get scene configuration with resolved URLs (async)
 * Use this in extension mode to ensure URLs are properly resolved
 *
 * Checks for custom default model from IndexedDB first
 *
 * @returns {Promise<Object>} Scene configuration with resolved URLs
 */
export async function getSceneConfigAsync(): Promise<SceneConfigData> {
  const config = getSceneConfig();
  const embedConfig = getEmbedConfig();
  const embedModelUrl = resolveEmbedAssetUrl(
    embedConfig.assets.modelUrl,
    embedConfig.assets.assetBaseUrl,
  );

  if (embedModelUrl) {
    Logger.log(
      "sceneConfig",
      "Using embed-configured model URL:",
      embedModelUrl,
    );
    config.modelUrl = embedModelUrl;
    config.modelId = "embed_config_model";
    config.modelFileName = embedModelUrl.split("/").pop() || "embed-model";
    return resolveResourceURLs(config);
  }

  try {
    const { modelStorageService } =
      await import("../services/ModelStorageService");
    const customDefaultModel = await modelStorageService.getDefaultModel();

    if (customDefaultModel && customDefaultModel.modelData) {
      const originalFileName =
        customDefaultModel.metadata?.originalFileName || "model.bpmx";
      const customFileName = originalFileName.toLowerCase().endsWith(".bpmx")
        ? originalFileName
        : originalFileName;
      config.customModelFile = new File(
        [customDefaultModel.modelData],
        customFileName,
        {
          type: customDefaultModel.modelData.type || "application/octet-stream",
        },
      );
      config.modelUrl = customFileName;
      config.modelId = customDefaultModel.id;
      config.modelFileName = customFileName;
      const portraitClippingValue =
        customDefaultModel.metadata?.portraitClipping;
      config.portraitClipping =
        typeof portraitClippingValue === "number" ? portraitClippingValue : 12;
    } else {
      config.modelId = "builtin_default_model";
      config.modelFileName = "vassist_default.bpmx";
      config.portraitClipping = 12;
    }
  } catch (error) {
    Logger.error("sceneConfig", "Failed to load custom default model:", error);
    config.modelId = "builtin_default_model";
    config.modelFileName = "vassist_default.bpmx";
  }

  Logger.log(
    "sceneConfig",
    "Calling resolveResourceURLs with config.modelUrl:",
    config.modelUrl,
  );
  return resolveResourceURLs(config);
}

/**
 * Get default model URL
 * @returns {string} Default model path
 */
export function getDefaultModelUrl(): string {
  return SceneConfig.modelUrl;
}

/**
 * Get default camera animation URL
 * @returns {string} Default camera animation path
 */
export function getDefaultCameraAnimationUrl(): string {
  return SceneConfig.cameraAnimationUrl;
}

/**
 * Get camera settings
 * @returns {Object} Camera configuration
 */
export function getCameraSettings(): {
  orthoHeight: number;
  cameraDistance: number;
} {
  return {
    orthoHeight: SceneConfig.orthoHeight,
    cameraDistance: SceneConfig.cameraDistance,
  };
}

/**
 * Get position manager configuration
 * @returns {Object} Position config
 */
export function getPositionConfig(): PositionManagerOptionsLike {
  return { ...SceneConfig.positionConfig };
}

/**
 * Check if feature is enabled
 * @param {string} feature - Feature name: 'physics', 'shadows', 'cameraAnimation', 'transparentBackground'
 * @returns {boolean} True if enabled
 */
export function isFeatureEnabled(
  feature: "physics" | "shadows" | "cameraAnimation" | "transparentBackground",
): boolean {
  switch (feature) {
    case "physics":
      return SceneConfig.enablePhysics;
    case "shadows":
      return SceneConfig.enableShadows;
    case "cameraAnimation":
      return SceneConfig.enableCameraAnimation;
    case "transparentBackground":
      return SceneConfig.transparentBackground;
    default:
      Logger.warn("SceneConfig", `Unknown feature: ${feature}`);
      return false;
  }
}

/**
 * Create custom scene config by merging with defaults
 * @param {Object} customConfig - Custom configuration to merge
 * @returns {Object} Merged configuration
 */
export function createSceneConfig(
  customConfig: Partial<SceneConfigData> = {},
): SceneConfigData {
  return {
    ...SceneConfig,
    ...customConfig,
    positionConfig: {
      ...SceneConfig.positionConfig,
      ...(customConfig.positionConfig || {}),
    },
  };
}

/**
 * Validate scene configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export function validateSceneConfig(config: Partial<SceneConfigData>): {
  valid: boolean;
  errors: string[];
} {
  const errors = [];

  if (!config.modelUrl) {
    errors.push("modelUrl is required");
  }

  if (typeof config.orthoHeight !== "number" || config.orthoHeight <= 0) {
    errors.push("orthoHeight must be a positive number");
  }

  if (typeof config.cameraDistance !== "number") {
    errors.push("cameraDistance must be a number");
  }

  if (config.positionConfig) {
    if (
      typeof config.positionConfig.boundaryPadding !== "number" ||
      config.positionConfig.boundaryPadding < 0
    ) {
      errors.push(
        "positionConfig.boundaryPadding must be a non-negative number",
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  getSceneConfig,
  getDefaultModelUrl,
  getDefaultCameraAnimationUrl,
  getCameraSettings,
  getPositionConfig,
  isFeatureEnabled,
  createSceneConfig,
  validateSceneConfig,
  getRenderQualityPresets,
};
