/**
 * PositionManager - Pixel-based model positioning system
 * 
 * Manages virtual assistant positioning using ACTUAL screen/canvas pixel coordinates.
 * Converts pixel positions to camera frustum adjustments (camera-based approach).
 * 
 * Key Features:
 * - Position presets (bottom-right, bottom-left, top-center, center, etc.)
 * - Pixel-accurate positioning tied to canvas dimensions
 * - Automatic window resize handling with debouncing
 * - Boundary validation to prevent model cutoff
 * - No hardcoded magic numbers - everything calculated from actual dimensions
 */

import { PositionPresets } from '../../config/uiConfig.js';
import Logger from '../../services/LoggerService';

export class PositionManager {
  /**
   * Create PositionManager instance
   * @param {Scene} scene - Babylon.js scene
   * @param {MmdCamera} camera - MMD camera (must be orthographic)
   * @param {HTMLCanvasElement} canvas - Babylon.js canvas element
   * @param {object} options - Optional configuration
   * @param {number} options.boundaryPadding - Padding from screen edges in pixels (default: 0)
   * @param {boolean} options.allowPartialOffscreen - Allow model to go partially offscreen (default: false)
   * @param {number} options.partialOffscreenAmount - How much can go offscreen (0-1, default: 0)
   */
  constructor(scene, camera, canvas, options = {}) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    
    // Boundary configuration (TUNE THESE!)
    this.boundaryPadding = options.boundaryPadding ?? 0; // Pixels from edge
    this.allowPartialOffscreen = options.allowPartialOffscreen ?? false; // Allow going partially off
    this.partialOffscreenAmount = options.partialOffscreenAmount ?? 0; // 0 = none, 0.5 = half can go off, 1 = full can go off
    
    // Custom boundary insets per edge (set by preset or manually)
    // Use this to fine-tune boundaries for specific models
    // Positive values = move boundary inward (more restrictive)
    // Negative values = move boundary outward (less restrictive)
    // Will be set automatically when applying a preset that defines customBoundaries
    this.customBoundaries = null;
    
    // Current state (all in PIXELS relative to canvas)
    this.canvasWidth = 0;
    this.canvasHeight = 0;
    this.modelWidthPx = 400;   // Model width in pixels (default)
    this.modelHeightPx = 600;  // Model height in pixels (used for CAMERA frustum zoom calculation)
    this.effectiveHeightPx = 600; // Effective height for positioning/boundaries (same as modelHeightPx in normal mode)
    this.positionX = 0;        // Position X in pixels (from left) - for camera
    this.positionY = 0;        // Position Y in pixels (from top) - for camera
    this.offset = { x: 0, y: 0 }; // Camera offset in world units
    
    // Portrait Mode tracking
    this.isPortraitMode = false;
    this.effectiveHeightRatio = 1.0; // Ratio for effective height calculation
    
    // Resize handler reference for cleanup
    this.resizeHandler = null;
    this.resizeTimeout = null;
    
    // Event throttling for position updates
    this.eventThrottleRAF = null;
    this.pendingPositionUpdate = null;
    
    // Constants
    this.RESIZE_DEBOUNCE_MS = 150; // Debounce window resize to prevent 60fps updates
    
    Logger.log('PositionManager', 'Created with options:', {
      boundaryPadding: this.boundaryPadding,
      allowPartialOffscreen: this.allowPartialOffscreen,
      partialOffscreenAmount: this.partialOffscreenAmount,
      customBoundaries: this.customBoundaries
    });
  }
  
  /**
   * Initialize - setup resize handler and apply default position
   * Call this after model is fully loaded
   * @param {string} savedPreset - Optional saved preset from settings (default: 'bottom-right')
   */
  initialize(savedPreset = 'bottom-right') {
    Logger.log('PositionManager', 'Initializing...');
    
    this.updateCanvasDimensions();
    this.setupResizeHandler();
    
    // Apply saved position preset from settings (or default bottom-right)
    // This will trigger modelPositionChange event
    this.applyPreset(savedPreset);
    
    Logger.log('PositionManager', 'Initialized with preset:', savedPreset, {
      canvas: { width: this.canvasWidth, height: this.canvasHeight }
    });
    
    // CRITICAL: Force emit initial position event after a microtask delay
    // This ensures all listeners are attached before the event fires
    Promise.resolve().then(() => {
      Logger.log('PositionManager', 'Emitting initial position change event');
      window.dispatchEvent(new CustomEvent('modelPositionChange', {
        detail: {
          x: this.positionX,
          y: this.positionY,
          width: this.modelWidthPx,
          height: this.effectiveHeightPx,  // Use effective height for UI, not camera height
          cameraHeight: this.modelHeightPx // Also expose camera height
        }
      }));
    });
    
    // Notify AnimationManager that PositionManager is ready (for intro locomotion compensation)
    // ONLY apply intro offset if the preset actually plays intro (not center positions, last-location, or Portrait Mode)
    const isPortraitMode = this.scene.metadata?.isPortraitMode || false;
    const shouldSkipIntro = savedPreset.includes('center') || savedPreset === 'last-location' || isPortraitMode;
    const animationManager = this.scene.metadata?.animationManager;
    
    if (!shouldSkipIntro && animationManager && animationManager._introLocomotionOffset) {
      Logger.log('PositionManager', 'Applying intro locomotion offset stored by AnimationManager');
      
      const { x, y } = animationManager._introLocomotionOffset;
      const currentOffset = this.offset || { x: 0, y: 0 };
      
      const preShiftedOffset = {
        x: currentOffset.x + x,
        y: currentOffset.y - y
      };
      
      Logger.log('PositionManager', 'PRE-SHIFTING camera for intro:', {
        from: currentOffset,
        to: preShiftedOffset,
        locomotion: { x, y }
      });
      
      const currentPos = this.getPositionPixels();
      // Use two-height system when applying intro offset
      this.setPositionPixels(
        currentPos.x,
        currentPos.y,
        currentPos.width,
        this.modelHeightPx,      // Use stored camera height (1500px in Portrait Mode)
        this.effectiveHeightPx,  // Use stored effective height (500px)
        preShiftedOffset
      );
      
      Logger.log('PositionManager', 'Camera pre-shifted - intro will play with model walking in from offscreen');
      // Record original/pre-shifted offsets on the AnimationManager so it can schedule resets
      try {
        if (animationManager) {
          animationManager._cameraOriginalOffset = currentOffset;
          animationManager._cameraPreShiftedOffset = preShiftedOffset;
          Logger.log('PositionManager', 'Recorded original and pre-shift offsets on AnimationManager');
        }
      } catch (e) {
        Logger.warn('PositionManager', 'Failed to record camera offsets on AnimationManager', e);
      }
    } else if (shouldSkipIntro) {
      Logger.log('PositionManager', 'Skipping intro locomotion offset (center position, last-location, or Portrait Mode)');
    }
  }
  
  /**
   * Update canvas dimensions from actual DOM
   * Uses clientWidth/clientHeight for actual pixel dimensions
   */
  updateCanvasDimensions() {
    this.canvasWidth = this.canvas.clientWidth;
    this.canvasHeight = this.canvas.clientHeight;
    
    Logger.log('PositionManager', 'Canvas dimensions:', {
      width: this.canvasWidth,
      height: this.canvasHeight
    });
  }
  
  /**
   * Apply a position preset
   * @param {string} preset - Preset name ('bottom-right', 'bottom-left', 'top-center', 'center', etc.)
   * @param {object} options - Optional overrides { modelSizePx: {width, height}, padding, offset: {x, y} }
   */
  applyPreset(preset, options = {}) {
    const presetConfig = PositionPresets[preset];
    
    if (!presetConfig) {
      Logger.warn('PositionManager', `Unknown preset: ${preset}, using center`);
      preset = 'center';
    }
    
    const config = PositionPresets[preset];
    
    // Use Portrait Mode model size if enabled, otherwise use standard size
    const isPortraitMode = this.scene.metadata?.isPortraitMode || false;
    this.isPortraitMode = isPortraitMode; // Store for later use
    
    const modelSize = isPortraitMode && config.portraitModelSize 
      ? config.portraitModelSize 
      : config.modelSize;
    
    let modelWidth = options.modelSizePx?.width || modelSize.width;
    let modelHeight = options.modelSizePx?.height || modelSize.height;
    
    let cameraHeight = modelHeight; // Height used for camera frustum (zoom)
    let effectiveHeight = modelHeight; // Height used for positioning/boundaries
    
    if (isPortraitMode) {
      // For zoom: Use larger height (3x normal) → makes camera zoom IN
      cameraHeight = modelHeight * 3;
      
      // For positioning: Keep normal height so boundaries work correctly
      effectiveHeight = modelHeight;
      
      this.effectiveHeightRatio = 1.0;
      
      Logger.log('PositionManager', `Portrait Mode: Camera height=${cameraHeight}px (zoom), Effective height=${effectiveHeight}px (positioning)`);
    } else {
      this.effectiveHeightRatio = 1.0;
    }
    
    const padding = options.padding !== undefined ? options.padding : config.padding;
    
    // Use portraitOffset in Portrait Mode, otherwise use regular offset
    let offset;
    if (isPortraitMode && config.portraitOffset) {
      offset = options.offset || config.portraitOffset;
    } else {
      offset = options.offset || config.offset || { x: 0, y: 0 };
    }
    
    // Apply preset's custom boundaries (if defined)
    // Use portraitCustomBoundaries if in Portrait Mode, otherwise use customBoundaries
    const isPortrait = this.scene.metadata?.isPortraitMode;
    if (isPortrait && config.portraitCustomBoundaries) {
      this.customBoundaries = { ...config.portraitCustomBoundaries };
      Logger.log('PositionManager', `Applied Portrait Mode custom boundaries from preset '${preset}':`, this.customBoundaries);
    } else if (config.customBoundaries) {
      this.customBoundaries = { ...config.customBoundaries };
      Logger.log('PositionManager', `Applied custom boundaries from preset '${preset}':`, this.customBoundaries);
    } else {
      // Clear custom boundaries if preset doesn't define them
      this.customBoundaries = null;
    }
    
    let pixelX, pixelY;
    
    // Calculate pixel position based on preset
    // Use effectiveHeight for positioning (accounts for clipping in Portrait Mode)
    switch(preset) {
      case 'bottom-right':
        pixelX = this.canvasWidth - modelWidth - padding;
        pixelY = this.canvasHeight - effectiveHeight - padding;
        break;
        
      case 'bottom-left':
        pixelX = padding;
        pixelY = this.canvasHeight - effectiveHeight - padding;
        break;
        
      case 'bottom-center':
        pixelX = (this.canvasWidth - modelWidth) / 2;
        pixelY = this.canvasHeight - effectiveHeight - padding;
        break;
        
      case 'top-center':
        pixelX = (this.canvasWidth - modelWidth) / 2;
        pixelY = padding;
        break;
        
      case 'center':
        pixelX = (this.canvasWidth - modelWidth) / 2;
        pixelY = (this.canvasHeight - effectiveHeight) / 2;
        break;
        
      case 'top-left':
        pixelX = padding;
        pixelY = padding;
        break;
        
      case 'top-right':
        pixelX = this.canvasWidth - modelWidth - padding;
        pixelY = padding;
        break;
        
      default:
        // Fallback to center
        pixelX = (this.canvasWidth - modelWidth) / 2;
        pixelY = (this.canvasHeight - effectiveHeight) / 2;
    }
    
    Logger.log('PositionManager', 'Applying preset: ${preset}', {
      isPortraitMode: isPortraitMode,
      pixelPosition: { x: pixelX, y: pixelY },
      modelSize: { width: modelWidth, height: modelHeight },
      cameraHeight: cameraHeight,
      effectiveHeight: effectiveHeight,
      padding,
      offset
    });
    
    this.setPositionPixels(pixelX, pixelY, modelWidth, cameraHeight, effectiveHeight, offset);
  }
  
  /**
   * Set model position in pixel coordinates
   * This is the main positioning method - everything goes through here
   * @param {number} x - X position in pixels (from left edge of canvas)
   * @param {number} y - Y position in pixels (from top edge of canvas)
   * @param {number} width - Model width in pixels
   * @param {number} cameraHeight - Height used for camera frustum (zoom calculation)
   * @param {number} effectiveHeight - Height used for positioning/boundaries (can be same as cameraHeight)
   * @param {object} offset - Camera offset in world units { x, y }
   */
  setPositionPixels(x, y, width, cameraHeight, effectiveHeight = null, offset = { x: 0, y: 0 }) {
    // If effectiveHeight not provided, use cameraHeight for both
    if (effectiveHeight === null || typeof effectiveHeight === 'object') {
      offset = effectiveHeight || offset;
      effectiveHeight = cameraHeight;
    }
    
    // Validate using effective height for boundaries
    const validated = this.validatePosition(x, y, width, effectiveHeight);
    
    // Store current position
    this.positionX = validated.adjustedX;
    this.positionY = validated.adjustedY;
    this.modelWidthPx = width;
    this.modelHeightPx = cameraHeight;
    this.effectiveHeightPx = effectiveHeight;
    this.offset = offset;  // Store offset for camera calculations
    
    // Convert pixel position to camera frustum
    this.updateCameraFrustum();
    
    // Throttle position change events using RAF to prevent excessive updates
    // This batches multiple rapid position changes into a single event per frame
    this.emitPositionChangeThrottled({
      x: this.positionX, 
      y: this.positionY, 
      width: this.modelWidthPx, 
      height: this.effectiveHeightPx,
      cameraHeight: this.modelHeightPx
    });
    
    if (!validated.valid) {
      Logger.warn('PositionManager', 'Position adjusted to prevent cutoff', {
        requested: { x, y },
        adjusted: { x: validated.adjustedX, y: validated.adjustedY }
      });
    }
  }
  
  /**
   * Emit position change event with RAF throttling
   * Batches multiple rapid updates into one event per frame
   */
  emitPositionChangeThrottled(detail) {
    // Store the latest position data
    this.pendingPositionUpdate = detail;
    
    // If RAF already scheduled, just update the pending data
    if (this.eventThrottleRAF !== null) {
      return;
    }
    
    // Schedule emission for next frame
    this.eventThrottleRAF = requestAnimationFrame(() => {
      // Emit the most recent position
      if (this.pendingPositionUpdate) {
        window.dispatchEvent(new CustomEvent('modelPositionChange', {
          detail: this.pendingPositionUpdate
        }));
        this.pendingPositionUpdate = null;
      }
      this.eventThrottleRAF = null;
    });
  }
  
  /**
   * Convert pixel-based position to camera frustum settings
   * THIS IS THE CORE CONVERSION LOGIC - pixels → camera view
   */
  updateCameraFrustum() {
    // Step 1: Calculate orthoHeight for desired model pixel size
    const baseOrthoHeight = 12; // Original working value
    const baseModelHeightPx = this.canvasHeight; // Assume original fills canvas height
    const orthoHeight = (baseOrthoHeight * baseModelHeightPx) / this.modelHeightPx;
    const aspectRatio = this.canvasWidth / this.canvasHeight;
    
    // Step 2: Calculate pixel offsets for positioning
    // Use effectiveHeightPx for positioning - this represents the visible area
    const modelCenterPixelX = this.positionX + this.modelWidthPx / 2;
    const modelCenterPixelY = this.positionY + this.effectiveHeightPx / 2;
    const canvasCenterX = this.canvasWidth / 2;
    const canvasCenterY = this.canvasHeight / 2;
    const offsetPixelX = modelCenterPixelX - canvasCenterX;
    const offsetPixelY = modelCenterPixelY - canvasCenterY;
    
    // Step 3: Convert pixel offsets to world space
    const pixelsPerWorldUnit = this.canvasHeight / (2 * orthoHeight);
    const worldOffsetX = -offsetPixelX / pixelsPerWorldUnit;  // NEGATE X - frustum X is inverted
    const worldOffsetY = offsetPixelY / pixelsPerWorldUnit;
    
    // Step 4: Calculate frustum center
    // Apply camera offsets (inverted logic):
    // Positive X offset moves camera RIGHT, making model appear LEFT on screen
    // Negative X offset moves camera LEFT, making model appear RIGHT on screen
    // Positive Y offset moves camera UP, making model appear LOWER on screen
    // Negative Y offset moves camera DOWN, making model appear HIGHER on screen
    const offset = this.offset || { x: 0, y: 0 };
    const frustumCenterX = worldOffsetX + offset.x;
    const frustumCenterY = worldOffsetY + offset.y;
    
    // Step 5: Set frustum bounds (same pattern as original MmdCompositeScene)
    this.camera.orthoTop = frustumCenterY + orthoHeight;
    this.camera.orthoBottom = frustumCenterY - orthoHeight;
    this.camera.orthoLeft = frustumCenterX - (orthoHeight * aspectRatio);
    this.camera.orthoRight = frustumCenterX + (orthoHeight * aspectRatio);
  }
  
  /**
   * Setup debounced window resize handler
   * Prevents updating 60 times per second during resize (would crash browser)
   * Only updates after user stops resizing for RESIZE_DEBOUNCE_MS
   */
  setupResizeHandler() {
    this.resizeHandler = () => {
      // Clear existing timeout
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      
      // Set new timeout - only fire after resize stops
      this.resizeTimeout = setTimeout(() => {
        Logger.log('PositionManager', 'Window resize complete, updating position');
        
        const oldWidth = this.canvasWidth;
        const oldHeight = this.canvasHeight;
        
        // Update canvas dimensions
        this.updateCanvasDimensions();
        
        // Recalculate frustum with new dimensions
        // This maintains the same relative position
        this.updateCameraFrustum();
        
        Logger.log('PositionManager', 'Resize complete', {
          from: { width: oldWidth, height: oldHeight },
          to: { width: this.canvasWidth, height: this.canvasHeight }
        });
      }, this.RESIZE_DEBOUNCE_MS);
    };
    
    // Listen to window resize
    window.addEventListener('resize', this.resizeHandler);
    
    Logger.log('PositionManager', 'Resize handler setup with debounce:', this.RESIZE_DEBOUNCE_MS, 'ms');
  }
  
  /**
   * Get current position in pixels
   * Returns where the VISIBLE area appears on screen, accounting for zoom
   * @returns {object} - { x, y, width, height } all in pixels
   */
  getPositionPixels() {
    const result = {
      x: this.positionX,
      y: this.positionY,
      width: this.modelWidthPx,
      height: this.effectiveHeightPx,
      cameraHeight: this.modelHeightPx
    };
    
    return result;
  }
  
  /**
   * Check if position would cause model cutoff and adjust if needed
   * @param {number} x - Proposed X position (pixels from left)
   * @param {number} y - Proposed Y position (pixels from top)
   * @param {number} width - Model width (pixels)
   * @param {number} height - Model height (pixels)
   * @returns {object} - { valid: boolean, adjustedX, adjustedY }
   */
  validatePosition(x, y, width = this.modelWidthPx, height = this.effectiveHeightPx) {
    let adjustedX = x;
    let adjustedY = y;
    let valid = true;
    
    // Use the height parameter directly
    const effectiveHeight = height;
    
    // Calculate allowed offscreen amount if enabled
    const allowedOffscreenX = this.allowPartialOffscreen ? width * this.partialOffscreenAmount : 0;
    const allowedOffscreenY = this.allowPartialOffscreen ? effectiveHeight * this.partialOffscreenAmount : 0;
    
    // Calculate effective boundaries
    let leftPadding, rightPadding, topPadding, bottomPadding;
    
    if (this.customBoundaries) {
      leftPadding = this.customBoundaries.left ?? this.boundaryPadding;
      rightPadding = this.customBoundaries.right ?? this.boundaryPadding;
      topPadding = this.customBoundaries.top ?? this.boundaryPadding;
      bottomPadding = this.customBoundaries.bottom ?? this.boundaryPadding;
    } else {
      // Uniform padding on all edges
      leftPadding = rightPadding = topPadding = bottomPadding = this.boundaryPadding;
    }
    
    // Pure pixel boundaries (offset is handled separately in camera frustum)
    // Negative padding values allow model to go beyond canvas edge
    const minX = -leftPadding - allowedOffscreenX;
    const maxX = this.canvasWidth + rightPadding - width + allowedOffscreenX;
    const minY = -topPadding - allowedOffscreenY;
    const maxY = this.canvasHeight + bottomPadding - effectiveHeight + allowedOffscreenY;
    
    // Check left edge
    if (x < minX) {
      adjustedX = minX;
      valid = false;
    }
    
    // Check right edge
    if (x > maxX) {
      adjustedX = maxX;
      valid = false;
    }
    
    // Check top edge
    if (y < minY) {
      adjustedY = minY;
      valid = false;
    }
    
    // Check bottom edge
    if (y > maxY) {
      adjustedY = maxY;
      valid = false;
    }
    
    // Final clamp to ensure within bounds
    adjustedX = Math.max(minX, Math.min(adjustedX, maxX));
    adjustedY = Math.max(minY, Math.min(adjustedY, maxY));
    
    return {
      valid,
      adjustedX,
      adjustedY,
      // Debug info
      debug: {
        boundaries: { minX, maxX, minY, maxY },
        padding: { left: leftPadding, right: rightPadding, top: topPadding, bottom: bottomPadding },
        modelSize: { width, height },
        canvasSize: { width: this.canvasWidth, height: this.canvasHeight },
        allowedOffscreen: { x: allowedOffscreenX, y: allowedOffscreenY }
      }
    };
  }
  
  /**
   * Set custom boundary insets for fine-tuning model-specific boundaries
   * NOTE: Normally boundaries are set automatically by presets. Use this method to override.
   * Useful for runtime adjustments or testing different boundary values.
   * @param {object} boundaries - Custom boundary insets { left, right, top, bottom } in pixels
   */
  setCustomBoundaries(boundaries) {
    this.customBoundaries = boundaries;
    Logger.log('PositionManager', 'Custom boundaries manually set (overriding preset):', boundaries);
    
    // Revalidate current position with new boundaries
    const validated = this.validatePosition(this.positionX, this.positionY);
    if (!validated.valid) {
      this.positionX = validated.adjustedX;
      this.positionY = validated.adjustedY;
      this.updateCameraFrustum();
      Logger.log('PositionManager', 'Position adjusted due to new boundaries');
    }
  }
  
  /**
   * Clear custom boundaries and use uniform padding
   * Will revert to preset boundaries on next preset change
   */
  clearCustomBoundaries() {
    this.customBoundaries = null;
    Logger.log('PositionManager', 'Custom boundaries cleared, using uniform padding');
  }
  
  /**
   * Get current boundary configuration
   * @returns {object} - Current boundary settings
   */
  getBoundaryConfig() {
    return {
      uniformPadding: this.boundaryPadding,
      customBoundaries: this.customBoundaries,
      allowPartialOffscreen: this.allowPartialOffscreen,
      partialOffscreenAmount: this.partialOffscreenAmount
    };
  }
  
  /**
   * Get available position presets
   * @returns {object} - PositionPresets object
   */
  static getPresets() {
    return PositionPresets;
  }
  
  /**
   * Get list of preset names
   * @returns {string[]} - Array of preset names
   */
  static getPresetNames() {
    return Object.keys(PositionPresets);
  }
  
  /**
   * Cleanup - remove event listeners
   */
  dispose() {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
    
    // Cancel pending RAF for position events
    if (this.eventThrottleRAF !== null) {
      cancelAnimationFrame(this.eventThrottleRAF);
      this.eventThrottleRAF = null;
    }
    this.pendingPositionUpdate = null;
    
    Logger.log('PositionManager', 'Disposed');
  }
}
