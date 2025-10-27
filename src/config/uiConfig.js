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
 * Position preset definitions
 * 
 * Each preset contains:
 * - name: Display name for UI
 * - modelSize: Dimensions in pixels { width, height }
 * - padding: Edge padding in pixels
 * - offset: Camera offset in world units { x, y }
 *   - X-axis: +x = push left, -x = push right
 *   - Y-axis: +y = push down, -y = push up
 * - customBoundaries: Per-edge boundary adjustments { left, right, top, bottom } in pixels
 *   - Positive = more restrictive, Negative = less restrictive
 *   - Used in Normal Mode
 * - portraitCustomBoundaries: Per-edge boundary adjustments for Portrait Mode
 *   - Same rules as customBoundaries but only used when Portrait Mode is active
 * - portraitClipPlaneY: Y-axis height for Portrait Mode clipping plane (default: 6.5)
 *   - Adjust per model to clip at waist/chest level
 * - description: Detailed description
 */
export const PositionPresets = {
  'bottom-right': {
    name: 'Bottom Right',
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 }, // Keep SAME as normal - PositionManager will handle it
    padding: 0,
    offset: { x: -2, y: 2 },
    portraitOffset: { x: 0, y: 6.2 }, // Offset used in Portrait Mode
    customBoundaries: { left: 80, right: 0, top: 100, bottom: 0 }, // 0 = no custom boundaries
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 }, // Separate boundaries for Portrait Mode
    portraitClipPlaneY: 12,
    description: 'Default chatbot position in bottom-right corner'
  },
  
  'bottom-left': {
    name: 'Bottom Left',
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 2, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 0, right: 80, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: 'Chatbot position in bottom-left corner'
  },
  
  'bottom-center': {
    name: 'Bottom Center',
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 0, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 40, right: 40, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: 'Chatbot position at bottom center'
  },
  
  'center': {
    name: 'Center',
    modelSize: { width: 600, height: 900 },
    portraitModelSize: { width: 600, height: 900 },
    padding: 0,
    offset: { x: 0, y: 0 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 0, right: 0, top: 0, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: 'Large centered view for development/debugging'
  },
  
  'top-right': {
    name: 'Top Right',
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: -2, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 80, right: 0, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: 'Top-right corner position'
  },

  'top-left': {
    name: 'Top Left',
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 2, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 0, right: 80, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: 'Top-left corner position'
  },

  'top-center': {
    name: 'Top Center',
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 0, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 40, right: 40, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: 'Model at top center of screen'
  },

  'last-location': {
    name: 'Last Location',
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 0, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: 'Restore model to last saved position'
  },
};

/**
 * FPS Limit Options for rendering
 */
export const FPSLimitOptions = {
  FPS_30: 30,
  FPS_60: 60,
  FPS_90: 90,
  NATIVE: 'native', // No limit - matches monitor refresh rate
};

/**
 * Default UI Configuration
 */
export const DefaultUIConfig = {
  // Model loading behavior
  enableModelLoading: true,
  
  // Portrait Mode - Upper body framing with closer camera
  enablePortraitMode: false,
  
  // FPS Limit - Performance optimization
  fpsLimit: FPSLimitOptions.FPS_60, // Default to 60fps for best balance
  
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
  
  // Position settings (used by both model and chat-only mode)
  position: {
    preset: 'bottom-right', // 'bottom-right', 'bottom-left', 'bottom-center', 'center', 'top-right', 'top-left', 'last-location'
    lastLocation: null, // { x, y, width, height } - saved when user drags model/chat
  },
  
  // Background detection and theming
  backgroundDetection: {
    mode: BackgroundThemeModes.ADAPTIVE,
    sampleGridSize: 5, // 5x5 grid = 25 sample points
    showDebug: false,
  },
};
