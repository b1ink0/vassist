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
  
  // Background detection and theming
  backgroundDetection: {
    mode: BackgroundThemeModes.ADAPTIVE,
    sampleGridSize: 5, // 5x5 grid = 25 sample points
    showDebug: false,
  },
};
