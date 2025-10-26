/**
 * UI Configuration
 * 
 * Settings for user interface behavior and appearance.
 */

/**
 * Background Theme Modes
 */
export const BackgroundThemeModes = {
  ADAPTIVE: 'adaptive', // Auto-detect background brightness
  LIGHT: 'light',       // Force light theme (dark chat on light background)
  DARK: 'dark',         // Force dark theme (light chat on dark background)
};

/**
 * Default UI Configuration
 */
export const DefaultUIConfig = {
  // Model loading behavior
  enableModelLoading: true,
  
  // Extension auto-load behavior
  autoLoadOnAllPages: true, // Auto-load extension on all pages (extension mode only)
  
  // AI Toolbar
  enableAIToolbar: true,
  
  // AI Toolbar Advanced Settings
  aiToolbar: {
    showOnInputFocus: true, // Auto-show toolbar when focusing input fields (for dictation)
    showOnImageHover: true, // Show toolbar when hovering over images
  },
  
  // Debug panel
  enableDebugPanel: true,
  
  // Background detection and theming
  backgroundDetection: {
    mode: BackgroundThemeModes.ADAPTIVE,
    sampleGridSize: 5, // 5x5 grid = 25 sample points
    showDebug: false,
  },
};
