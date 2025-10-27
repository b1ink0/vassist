/**
 * Scene Configuration
 * 
 * Configuration for MMD Model Scene including model paths, camera settings,
 * physics, shadows, and other scene properties.
 * 
 * Follows the same pattern as animationConfig.js with getter functions.
 */

import { resourceLoader } from '../utils/ResourceLoader.js';

/**
 * Default scene configuration
 */
const SceneConfig = {
  // General configuration
  enableModelLoading: true,  // Set to false to disable 3D model loading (chat-only mode)
  
  // Model configuration - these will be resolved at runtime
  // In extension mode, URLs are fetched via ExtensionBridge.getResourceURL()
  modelUrl: "res/assets/model/default1.bpmx",
  cameraAnimationUrl: "res/private_test/motion/2.bvmd",
  enableCameraAnimation: true,
  
  // Camera settings
  orthoHeight: 12,          // Orthographic height (zoom level)
  cameraDistance: -30,      // Camera distance from origin
  
  // Position manager settings
  positionConfig: {
    boundaryPadding: 0,
    allowPartialOffscreen: false,
    partialOffscreenAmount: 0
  },
  
  // Scene settings
  transparentBackground: true,  // Transparent or solid background
  enablePhysics: true,          // Enable Havok physics
  enableShadows: true,          // Enable shadow rendering
  
  // Loading callbacks (set by consumer)
  onLoadProgress: null,  // (progress: number) => void
  onModelLoaded: null,   // (modelMesh) => void
  onSceneReady: null,    // (scene) => void
};

/**
 * Resolve resource URLs for extension mode
 * In extension mode, URLs must be fetched via ExtensionBridge
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Configuration with resolved URLs
 */
export async function resolveResourceURLs(config) {
  console.log('[sceneConfig] resolveResourceURLs - isExtension:', resourceLoader.isExtensionMode());
  
  if (!resourceLoader.isExtensionMode()) {
    // Dev mode - URLs are already correct
    console.log('[sceneConfig] Dev mode - returning config as-is');
    return config;
  }

  // Extension mode - resolve URLs via ExtensionBridge
  console.log('[sceneConfig] Extension mode - resolving URLs...');
  const resolvedConfig = { ...config };
  
  if (config.modelUrl) {
    console.log('[sceneConfig] Resolving modelUrl:', config.modelUrl);
    resolvedConfig.modelUrl = await resourceLoader.getURLAsync(config.modelUrl);
    console.log('[sceneConfig] Resolved modelUrl:', resolvedConfig.modelUrl);
  }
  
  if (config.cameraAnimationUrl) {
    console.log('[sceneConfig] Resolving cameraAnimationUrl:', config.cameraAnimationUrl);
    resolvedConfig.cameraAnimationUrl = await resourceLoader.getURLAsync(config.cameraAnimationUrl);
    console.log('[sceneConfig] Resolved cameraAnimationUrl:', resolvedConfig.cameraAnimationUrl);
  }
  
  console.log('[sceneConfig] Final resolved config:', resolvedConfig);
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
      console.warn(`[SceneConfig] Unknown feature: ${feature}`);
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
    // Deep merge positionConfig if provided
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
  
  // Check required fields
  if (!config.modelUrl) {
    errors.push('modelUrl is required');
  }
  
  // Validate camera settings
  if (typeof config.orthoHeight !== 'number' || config.orthoHeight <= 0) {
    errors.push('orthoHeight must be a positive number');
  }
  
  if (typeof config.cameraDistance !== 'number') {
    errors.push('cameraDistance must be a number');
  }
  
  // Validate position config
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
