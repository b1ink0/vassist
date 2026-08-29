/**
 * UI Configuration
 *
 * Settings for user interface behavior and appearance.
 */

import { isAndroid, isDesktop } from "../utils/PlatformUtils";

export type BackgroundThemeMode = "adaptive" | "light" | "dark";

export interface PixelSize {
  width: number;
  height: number;
}

export interface PositionOffset {
  x: number;
  y: number;
}

export interface BoundaryInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PositionPreset {
  name: string;
  modelSize: PixelSize;
  portraitModelSize: PixelSize;
  padding: number;
  offset: PositionOffset;
  portraitOffset: PositionOffset;
  customBoundaries: BoundaryInsets;
  portraitCustomBoundaries: BoundaryInsets;
  portraitClipPlaneY: number;
  description: string;
}

export type PositionPresetOverride = Omit<
  PositionPreset,
  "name" | "description"
>;

export type FPSLimit = 15 | 24 | 30 | 60 | 90 | "native";
export type PhysicsEngine = "bullet" | "havok";
export type RenderQuality = "low" | "medium" | "high" | "ultra" | "custom";

export interface CustomQualitySettings {
  samples: number;
  bloomEnabled: boolean;
  bloomKernel: number;
  bloomScale: number;
  bloomWeight: number;
  bloomThreshold: number;
  fxaaEnabled: boolean;
  contrast: number;
  exposure: number;
  saturation: number;
}

export interface UIConfig {
  enableModelLoading: boolean;
  enablePortraitMode: boolean;
  enablePhysics: boolean;
  physicsEngine: PhysicsEngine;
  renderQuality: RenderQuality;
  customQuality: CustomQualitySettings;
  fpsLimit: FPSLimit;
  autoLoadOnAllPages: boolean;
  enableAIToolbar: boolean;
  aiToolbar: {
    showOnInputFocus: boolean;
    showOnImageHover: boolean;
  };
  enableColoredIcons: boolean;
  enableColoredIconsToolbarOnly: boolean;
  enableDebugPanel: boolean;
  nativeDevTools: boolean;
  emotePlayback: {
    showDurationBar: boolean;
    showTime: boolean;
    autoPlayCategory: string;
  };
  position: {
    preset: string;
    lastLocation: {
      x: number;
      y: number;
      width: number;
      height: number;
      preset?: string;
    } | null;
  };
  modelSizePx: PixelSize | null;
  camera: {
    mode: "2D" | "3D";
    locked: boolean;
    savePosition: boolean;
    saved3D: {
      distance: number;
      rotation: { x: number; y: number };
      position: { x: number; y: number };
    };
    saved2D: {
      modelHeightPx: number;
      positionX: number;
      positionY: number;
      rotation: { x: number; y: number };
    };
  };
  backgroundDetection: {
    mode: BackgroundThemeMode;
    sampleGridSize: number;
    showDebug: boolean;
  };
  smoothStreamingAnimation: boolean;
  thinkingPanelAutoExpand: boolean;
  shortcuts: {
    enabled: boolean;
    openChat: string;
    toggleMode: string;
    toggleVisibility: string;
  };
}

/**
 * Background Theme Modes
 */
export const BackgroundThemeModes: {
  ADAPTIVE: BackgroundThemeMode;
  LIGHT: BackgroundThemeMode;
  DARK: BackgroundThemeMode;
} = {
  ADAPTIVE: "adaptive", // Auto-detect background brightness
  LIGHT: "dark", // Force light theme (dark chat on light background)
  DARK: "light", // Force dark theme (light chat on dark background)
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
export const PositionPresets: Record<string, PositionPreset> = {
  "bottom-right": {
    name: "Bottom Right",
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 }, // Keep SAME as normal - PositionManager will handle it
    padding: 0,
    offset: { x: -2, y: 2 },
    portraitOffset: { x: 0, y: 6.2 }, // Offset used in Portrait Mode
    customBoundaries: { left: 80, right: 0, top: 100, bottom: 0 }, // 0 = no custom boundaries
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 }, // Separate boundaries for Portrait Mode
    portraitClipPlaneY: 12,
    description: "Default chatbot position in bottom-right corner",
  },

  "bottom-left": {
    name: "Bottom Left",
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 2, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 0, right: 80, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: "Chatbot position in bottom-left corner",
  },

  "bottom-center": {
    name: "Bottom Center",
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 0, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 40, right: 40, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: "Chatbot position at bottom center",
  },

  center: {
    name: "Center",
    modelSize: { width: 600, height: 900 },
    portraitModelSize: { width: 600, height: 900 },
    padding: 0,
    offset: { x: 0, y: 0 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 0, right: 0, top: 0, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: "Large centered view for development/debugging",
  },

  "top-right": {
    name: "Top Right",
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: -2, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 80, right: 0, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: "Top-right corner position",
  },

  "top-left": {
    name: "Top Left",
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 2, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 0, right: 80, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: "Top-left corner position",
  },

  "top-center": {
    name: "Top Center",
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 0, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 40, right: 40, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: "Model at top center of screen",
  },

  "last-location": {
    name: "Last Location",
    modelSize: { width: 300, height: 500 },
    portraitModelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 0, y: 2 },
    portraitOffset: { x: 0, y: 6.2 },
    customBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitCustomBoundaries: { left: 0, right: 0, top: 100, bottom: 0 },
    portraitClipPlaneY: 12,
    description: "Restore model to last saved position",
  },
};

/**
 * Android-specific preset configuration
 */
export const AndroidPresetOverride: PositionPresetOverride = {
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
 * Desktop-specific preset configuration
 */
export const DesktopPresetOverride: PositionPresetOverride = {
  modelSize: { width: 400, height: 600 },
  portraitModelSize: { width: 400, height: 600 },
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
export const FPSLimitOptions: {
  FPS_15: Extract<FPSLimit, 15>;
  FPS_24: Extract<FPSLimit, 24>;
  FPS_30: Extract<FPSLimit, 30>;
  FPS_60: Extract<FPSLimit, 60>;
  FPS_90: Extract<FPSLimit, 90>;
  NATIVE: Extract<FPSLimit, "native">;
} = {
  FPS_15: 15,
  FPS_24: 24,
  FPS_30: 30,
  FPS_60: 60,
  FPS_90: 90,
  NATIVE: "native", // No limit - matches monitor refresh rate
};

/**
 * Physics Engine Options
 * - BULLET: Bullet Physics (WASM) - Better performance, requires SharedArrayBuffer
 * - HAVOK: Havok Physics - Used in extension mode
 */
export const PhysicsEngineOptions: {
  BULLET: Extract<PhysicsEngine, "bullet">;
  HAVOK: Extract<PhysicsEngine, "havok">;
} = {
  BULLET: "bullet",
  HAVOK: "havok",
};

/**
 * Render Quality Options
 * Controls post-processing effects and rendering quality
 * - LOW: Minimal effects, best performance (mobile/low-end)
 * - MEDIUM: Balanced quality and performance (default)
 * - HIGH: Full effects, good quality (desktop)
 * - ULTRA: Maximum quality, highest GPU usage (high-end desktop)
 * - CUSTOM: User-defined settings
 */
export const RenderQualityOptions: {
  LOW: Extract<RenderQuality, "low">;
  MEDIUM: Extract<RenderQuality, "medium">;
  HIGH: Extract<RenderQuality, "high">;
  ULTRA: Extract<RenderQuality, "ultra">;
  CUSTOM: Extract<RenderQuality, "custom">;
} = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  ULTRA: "ultra",
  CUSTOM: "custom",
};

/**
 * Default Custom Render Quality Settings
 */
export const DefaultCustomQualitySettings: CustomQualitySettings = {
  samples: 2, // MSAA samples: 1, 2, 4, 8
  bloomEnabled: true,
  bloomKernel: 32, // 16, 32, 48, 64
  bloomScale: 0.5, // 0.1 - 1.0
  bloomWeight: 0.2, // 0.05 - 0.5
  bloomThreshold: 0.9, // 0.5 - 1.0
  fxaaEnabled: true,
  contrast: 1.2, // 0.5 - 2.0
  exposure: 1.05, // 0.5 - 2.0
  saturation: 15, // -50 - 50
};

/**
 * Default UI Configuration
 */
export const DefaultUIConfig: UIConfig = {
  enableModelLoading: true,

  enablePortraitMode: false,

  enablePhysics: true,

  physicsEngine: PhysicsEngineOptions.BULLET,

  renderQuality: RenderQualityOptions.MEDIUM,

  customQuality: { ...DefaultCustomQualitySettings },

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
  nativeDevTools: false,

  emotePlayback: {
    showDurationBar: true,
    showTime: true,
    autoPlayCategory: "all",
  },

  position: {
    preset: isDesktop || isAndroid ? "bottom-center" : "bottom-right",
    lastLocation: null,
  },

  modelSizePx: null,

  camera: {
    mode: "2D",
    locked: true,
    savePosition: false,
    saved3D: {
      distance: -40,
      rotation: { x: 0, y: 0 },
      position: { x: 0, y: 0 },
    },
    saved2D: {
      modelHeightPx: 600,
      positionX: 0,
      positionY: 0,
      rotation: { x: 0, y: 0 },
    },
  },

  backgroundDetection: {
    mode: BackgroundThemeModes.ADAPTIVE,
    sampleGridSize: 5,
    showDebug: false,
  },

  smoothStreamingAnimation: false,

  thinkingPanelAutoExpand: false,

  shortcuts: {
    enabled: false,
    openChat: "",
    toggleMode: "",
    toggleVisibility: "",
  },
};
