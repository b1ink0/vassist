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
 * Android-specific preset configuration
 */
export const AndroidPresetOverride = {
  modelSize: { width: 600, height: 1000 },
  portraitModelSize: { width: 600, height: 1000 },
  padding: 0,
  offset: { x: 2.5, y: 7 },
  portraitOffset: { x: 0, y: 6.2 },
  customBoundaries: { left: 0, right: 0, top: 0, bottom: 0 },
  portraitCustomBoundaries: { left: 0, right: 0, top: 0, bottom: 0 },
  portraitClipPlaneY: 12,
};

/**
 * FPS Limit Options for rendering
 */
export const FPSLimitOptions = {
  FPS_15: 15,
  FPS_24: 24,
  FPS_30: 30,
  FPS_60: 60,
  FPS_90: 90,
  NATIVE: 'native', // No limit - matches monitor refresh rate
};

/**
 * Physics Engine Options
 * - BULLET: Bullet Physics (WASM) - Better performance, requires SharedArrayBuffer
 * - HAVOK: Havok Physics - Used in extension mode
 */
export const PhysicsEngineOptions = {
  BULLET: 'bullet',
  HAVOK: 'havok',
};

/**
 * Render Quality Options
 * Controls post-processing effects and rendering quality
 * - LOW: Minimal effects, best performance (mobile/low-end)
 * - MEDIUM: Balanced quality and performance (default)
 * - HIGH: Full effects, good quality (desktop)
 * - ULTRA: Maximum quality, highest GPU usage (high-end desktop)
 */
export const RenderQualityOptions = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  ULTRA: 'ultra',
};

/**
 * Default UI Configuration
 */
export const DefaultUIConfig = {
  enableModelLoading: true,
  
  enablePortraitMode: false,
  
  enablePhysics: true,
  
  physicsEngine: PhysicsEngineOptions.BULLET,
  
  renderQuality: RenderQualityOptions.MEDIUM,
  
  fpsLimit: FPSLimitOptions.FPS_60,
  
  autoLoadOnAllPages: true,
  
  enableAIToolbar: true,
  
  aiToolbar: {
    showOnInputFocus: true,
    showOnImageHover: true,
  },
  
  enableColoredIcons: false,
  enableColoredIconsToolbarOnly: false,
  
  enableDebugPanel: false,
  
  position: {
    preset: 'bottom-right',
    lastLocation: null,
  },
  
  backgroundDetection: {
    mode: BackgroundThemeModes.ADAPTIVE,
    sampleGridSize: 5,
    showDebug: false,
  },
  
  smoothStreamingAnimation: false,
  
  shortcuts: {
    enabled: false,
    openChat: '',
    toggleMode: '',
  },
};
