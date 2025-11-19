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
    Logger.log('sceneConfig', 'Dev/Desktop mode - making paths absolute');
    const resolvedConfig = { ...config };
    
    // In dev/desktop mode, make paths absolute by prepending /
    if (config.modelUrl && !config.modelUrl.startsWith('/') && !config.modelUrl.startsWith('http')) {
      resolvedConfig.modelUrl = '/' + config.modelUrl;
      Logger.log('sceneConfig', 'Made modelUrl absolute:', resolvedConfig.modelUrl);
    }
    
    if (config.cameraAnimationUrl && !config.cameraAnimationUrl.startsWith('/') && !config.cameraAnimationUrl.startsWith('http')) {
      resolvedConfig.cameraAnimationUrl = '/' + config.cameraAnimationUrl;
      Logger.log('sceneConfig', 'Made cameraAnimationUrl absolute:', resolvedConfig.cameraAnimationUrl);
    }
    
    return resolvedConfig;
  }

  Logger.log('sceneConfig', 'Extension mode - resolving URLs...');
  const resolvedConfig = { ...config };
  
  if (config.modelUrl) {
    Logger.log('sceneConfig', 'Resolving modelUrl:', config.modelUrl);
    resolvedConfig.modelUrl = await resourceLoader.getURLAsync(config.modelUrl);
    Logger.log('sceneConfig', 'Resolved modelUrl:', resolvedConfig.modelUrl);
  }
  
  if (config.cameraAnimationUrl) {
    Logger.log('sceneConfig', 'Resolving cameraAnimationUrl:', config.cameraAnimationUrl);
    resolvedConfig.cameraAnimationUrl = await resourceLoader.getURLAsync(config.cameraAnimationUrl);
    Logger.log('sceneConfig', 'Resolved cameraAnimationUrl:', resolvedConfig.cameraAnimationUrl);
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
 * @returns {Promise<Object>} Scene configuration with resolved URLs
 */
export async function getSceneConfigAsync() {
  const config = getSceneConfig();
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
};
