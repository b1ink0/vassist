/**
 * Scene Configuration
 * 
 * Configuration for MMD Model Scene including model paths, camera settings,
 * physics, shadows, and other scene properties.
 * 
 * Follows the same pattern as animationConfig.js with getter functions.
 */

import { resourceLoader } from '../utils/ResourceLoader.js';
import Logger from '../services/LoggerService';

/**
 * Render Quality Presets
 * Controls post-processing effects and rendering quality
 * @param {boolean} isAndroid - Whether the device is Android
 * @returns {Object} Quality presets configuration
 */
export function getRenderQualityPresets(isAndroid = false) {
  return {
    low: {
      samples: 1,                    // No MSAA
      bloomEnabled: false,           // Disable bloom
      chromaticAberrationEnabled: false,
      fxaaEnabled: true,             // Keep FXAA (lightweight)
      bloomKernel: 32,
      bloomScale: 0.3,
      bloomWeight: 0.1,
    },
    medium: {
      samples: 2,                    // 2x MSAA
      bloomEnabled: true,
      chromaticAberrationEnabled: false, // Disable on medium for performance
      fxaaEnabled: true,
      bloomKernel: isAndroid ? 32 : 48,
      bloomScale: 0.5,
      bloomWeight: 0.15,
    },
    high: {
      samples: isAndroid ? 2 : 4,    // 4x MSAA on desktop, 2x on Android
      bloomEnabled: true,
      chromaticAberrationEnabled: !isAndroid, // Only on desktop
      fxaaEnabled: true,
      bloomKernel: 64,
      bloomScale: 0.6,
      bloomWeight: 0.2,
    },
    ultra: {
      samples: isAndroid ? 4 : 8,    // 8x MSAA on desktop, 4x on Android
      bloomEnabled: true,
      chromaticAberrationEnabled: true,
      fxaaEnabled: true,
      bloomKernel: 64,
      bloomScale: 0.7,
      bloomWeight: 0.25,
    },
  };
}

/**
 * Default scene configuration
 */
const SceneConfig = {
  enableModelLoading: true,
  
  modelUrl: "res/assets/model/vassist_default.bpmx",
  cameraAnimationUrl: "res/private_test/motion/2.bvmd",
  enableCameraAnimation: true,
  
  orthoHeight: 12,
  cameraDistance: -30,
  
  positionConfig: {
    boundaryPadding: 0,
    allowPartialOffscreen: false,
    partialOffscreenAmount: 0
  },
  
  transparentBackground: true,
  enablePhysics: true,
  enableShadows: true,
  
  onLoadProgress: null,
  onModelLoaded: null,
  onSceneReady: null,
};

/**
 * Resolve resource URLs for extension mode
 * In extension mode, URLs must be fetched via ExtensionBridge
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Configuration with resolved URLs
 */
export async function resolveResourceURLs(config) {
  Logger.log('sceneConfig', 'resolveResourceURLs - isExtension:', resourceLoader.isExtensionMode());
  
  if (!resourceLoader.isExtensionMode()) {
    Logger.log('sceneConfig', 'Dev mode - returning config as-is');
    return config;
  }

  Logger.log('sceneConfig', 'Extension mode - resolving URLs...');
  const resolvedConfig = { ...config };
  
  if (config.modelUrl) {
    Logger.log('sceneConfig', 'Resolving modelUrl:', config.modelUrl);
    if (config.modelUrl.startsWith('blob:')) {
      Logger.log('sceneConfig', 'modelUrl is a Blob URL, using as-is');
      resolvedConfig.modelUrl = config.modelUrl;
    } else {
      resolvedConfig.modelUrl = await resourceLoader.getURLAsync(config.modelUrl);
      Logger.log('sceneConfig', 'Resolved modelUrl:', resolvedConfig.modelUrl);
    }
  }
  
  if (config.cameraAnimationUrl) {
    Logger.log('sceneConfig', 'Resolving cameraAnimationUrl:', config.cameraAnimationUrl);
    if (config.cameraAnimationUrl.startsWith('blob:')) {
      Logger.log('sceneConfig', 'cameraAnimationUrl is a Blob URL, using as-is');
      resolvedConfig.cameraAnimationUrl = config.cameraAnimationUrl;
    } else {
      resolvedConfig.cameraAnimationUrl = await resourceLoader.getURLAsync(config.cameraAnimationUrl);
      Logger.log('sceneConfig', 'Resolved cameraAnimationUrl:', resolvedConfig.cameraAnimationUrl);
    }
  }
  
  Logger.log('sceneConfig', 'Final resolved config:', resolvedConfig);
  return resolvedConfig;
}

/**
 * Get scene configuration
 * Returns a copy to prevent mutations
 * 
 * @returns {Object} Scene configuration
 */
export function getSceneConfig() {
  return { ...SceneConfig };
}

/**
 * Get scene configuration with resolved URLs (async)
 * Use this in extension mode to ensure URLs are properly resolved
 * 
 * Checks for custom default model from IndexedDB first
 * 
 * @returns {Promise<Object>} Scene configuration with resolved URLs
 */
export async function getSceneConfigAsync() {
  const config = getSceneConfig();
  
  try {
    const { modelStorageService } = await import('../services/ModelStorageService.js');
    const customDefaultModel = await modelStorageService.getDefaultModel();
    
    
    if (customDefaultModel && customDefaultModel.modelData) {
      const customModelUrl = URL.createObjectURL(customDefaultModel.modelData);
      
      config.modelUrl = customModelUrl;
      config.modelId = customDefaultModel.id;
      config.modelFileName = customDefaultModel.name || 'model.bpmx';
      config.portraitClipping = customDefaultModel.metadata?.portraitClipping ?? 12;
      config._customModelBlobUrl = customModelUrl;
    } else {
      config.modelId = 'builtin_default_model';
      config.modelFileName = 'vassist_default.bpmx';
      config.portraitClipping = 12;
    }
  } catch (error) {
    Logger.error('sceneConfig', 'Failed to load custom default model:', error);
    config.modelId = 'builtin_default_model';
    config.modelFileName = 'vassist_default.bpmx';
  }
  
  Logger.log('sceneConfig', 'Calling resolveResourceURLs with config.modelUrl:', config.modelUrl);
  return resolveResourceURLs(config);
}

/**
 * Get default model URL
 * @returns {string} Default model path
 */
export function getDefaultModelUrl() {
  return SceneConfig.modelUrl;
}

/**
 * Get default camera animation URL
 * @returns {string} Default camera animation path
 */
export function getDefaultCameraAnimationUrl() {
  return SceneConfig.cameraAnimationUrl;
}

/**
 * Get camera settings
 * @returns {Object} Camera configuration
 */
export function getCameraSettings() {
  return {
    orthoHeight: SceneConfig.orthoHeight,
    cameraDistance: SceneConfig.cameraDistance,
  };
}

/**
 * Get position manager configuration
 * @returns {Object} Position config
 */
export function getPositionConfig() {
  return { ...SceneConfig.positionConfig };
}

/**
 * Check if feature is enabled
 * @param {string} feature - Feature name: 'physics', 'shadows', 'cameraAnimation', 'transparentBackground'
 * @returns {boolean} True if enabled
 */
export function isFeatureEnabled(feature) {
  switch (feature) {
    case 'physics':
      return SceneConfig.enablePhysics;
    case 'shadows':
      return SceneConfig.enableShadows;
    case 'cameraAnimation':
      return SceneConfig.enableCameraAnimation;
    case 'transparentBackground':
      return SceneConfig.transparentBackground;
    default:
      Logger.warn('SceneConfig', `Unknown feature: ${feature}`);
      return false;
  }
}

/**
 * Create custom scene config by merging with defaults
 * @param {Object} customConfig - Custom configuration to merge
 * @returns {Object} Merged configuration
 */
export function createSceneConfig(customConfig = {}) {
  return {
    ...SceneConfig,
    ...customConfig,
    positionConfig: {
      ...SceneConfig.positionConfig,
      ...(customConfig.positionConfig || {})
    }
  };
}

/**
 * Validate scene configuration
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export function validateSceneConfig(config) {
  const errors = [];
  
  if (!config.modelUrl) {
    errors.push('modelUrl is required');
  }
  
  if (typeof config.orthoHeight !== 'number' || config.orthoHeight <= 0) {
    errors.push('orthoHeight must be a positive number');
  }
  
  if (typeof config.cameraDistance !== 'number') {
    errors.push('cameraDistance must be a number');
  }
  
  if (config.positionConfig) {
    if (typeof config.positionConfig.boundaryPadding !== 'number' || config.positionConfig.boundaryPadding < 0) {
      errors.push('positionConfig.boundaryPadding must be a non-negative number');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
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
