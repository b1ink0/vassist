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
 * 
 * @see docs/POSITIONING_SYSTEM_ARCHITECTURE.md
 */

/**
 * Position preset definitions
 * 
 * offset: Camera offset in world units { x, y }
 *         X-axis (horizontal):
 *           - Positive = moves camera RIGHT (model appears LEFT on screen)
 *           - Negative = moves camera LEFT (model appears RIGHT on screen)
 *         Y-axis (vertical):
 *           - Positive = moves camera UP (model appears LOWER on screen)
 *           - Negative = moves camera DOWN (model appears HIGHER on screen)
 *         Tune these values to adjust positioning
 * 
 * customBoundaries: Optional per-edge boundary adjustments { left, right, top, bottom } in pixels
 *         - Positive values = more restrictive (adds padding)
 *         - Negative values = less restrictive (allows going past edge)
 *         - Use to compensate for model-specific bounding box differences
 */
export const PositionPresets = {
  'bottom-right': {
    name: 'Bottom Right (Chatbot)',
    modelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: -2, y: 2 },  // Tune: +x = push left, -x = push right, +y = push down, -y = push up
    customBoundaries: { left: -80, right: 0, top: -80, bottom: 0 },  // Compensate for model bounding box
    description: 'Default chatbot position in bottom-right corner'
  },
  
  'bottom-left': {
    name: 'Bottom Left',
    modelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 2, y: 2 },  // Tune: +x = push left, -x = push right, +y = push down, -y = push up
    customBoundaries: { left: 0, right: -80, top: -80, bottom: 0 },  // Compensate for model bounding box
    description: 'Chatbot position in bottom-left corner'
  },
  
  'bottom-center': {
    name: 'Bottom Center',
    modelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 0, y: 2 },  // Tune: +x = push left, -x = push right, +y = push down, -y = push up
    customBoundaries: { left: -40, right: -40, top: -80, bottom: 0 },  // Compensate for model bounding box
    description: 'Chatbot position at bottom center'
  },
  
  'top-center': {
    name: 'Top Center',
    modelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 0, y: -2 },  // Tune: +x = push left, -x = push right, +y = push down, -y = push up
    customBoundaries: { left: -40, right: -40, top: 0, bottom: -80 },  // Compensate for model bounding box
    description: 'Model at top center of screen'
  },
  
  'center': {
    name: 'Center (Debug)',
    modelSize: { width: 600, height: 900 },
    padding: 0,
    offset: { x: 0, y: 0 },  // Tune: +x = push left, -x = push right, +y = push down, -y = push up
    customBoundaries: { left: -80, right: -80, top: -80, bottom: -80 },  // Compensate for model bounding box
    description: 'Large centered view for development/debugging'
  },
  
  'top-left': {
    name: 'Top Left',
    modelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: 2, y: -2 },  // Tune: +x = push left, -x = push right, +y = push down, -y = push up
    customBoundaries: { left: 0, right: -80, top: 0, bottom: -80 },  // Compensate for model bounding box
    description: 'Top-left corner position'
  },
  
  'top-right': {
    name: 'Top Right',
    modelSize: { width: 300, height: 500 },
    padding: 0,
    offset: { x: -2, y: -2 },  // Tune: +x = push left, -x = push right, +y = push down, -y = push up
    customBoundaries: { left: -80, right: 0, top: 0, bottom: -80 },  // Compensate for model bounding box
    description: 'Top-right corner position'
  }
};

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
    this.modelHeightPx = 600;  // Model height in pixels (default)
    this.positionX = 0;        // Position X in pixels (from left)
    this.positionY = 0;        // Position Y in pixels (from top)
    this.offset = { x: 0, y: 0 }; // Camera offset in world units
    
    // Resize handler reference for cleanup
    this.resizeHandler = null;
    this.resizeTimeout = null;
    
    // Event throttling for position updates
    this.eventThrottleRAF = null;
    this.pendingPositionUpdate = null;
    
    // Constants
    this.RESIZE_DEBOUNCE_MS = 150; // Debounce window resize to prevent 60fps updates
    
    console.log('[PositionManager] Created with options:', {
      boundaryPadding: this.boundaryPadding,
      allowPartialOffscreen: this.allowPartialOffscreen,
      partialOffscreenAmount: this.partialOffscreenAmount,
      customBoundaries: this.customBoundaries
    });
  }
  
  /**
   * Initialize - setup resize handler and apply default position
   * Call this after model is fully loaded
   */
  initialize() {
    console.log('[PositionManager] Initializing...');
    
    this.updateCanvasDimensions();
    this.setupResizeHandler();
    
    // Apply default position (bottom-right chatbot style)
    // This will trigger modelPositionChange event
    this.applyPreset('bottom-right');
    
    console.log('[PositionManager] Initialized', {
      canvas: { width: this.canvasWidth, height: this.canvasHeight }
    });
    
    // CRITICAL: Force emit initial position event after a microtask delay
    // This ensures all listeners are attached before the event fires
    Promise.resolve().then(() => {
      console.log('[PositionManager] Emitting initial position change event');
      window.dispatchEvent(new CustomEvent('modelPositionChange', {
        detail: {
          x: this.positionX,
          y: this.positionY,
          width: this.modelWidthPx,
          height: this.modelHeightPx
        }
      }));
    });
  }
  
  /**
   * Update canvas dimensions from actual DOM
   * Uses clientWidth/clientHeight for actual pixel dimensions
   */
  updateCanvasDimensions() {
    this.canvasWidth = this.canvas.clientWidth;
    this.canvasHeight = this.canvas.clientHeight;
    
    console.log('[PositionManager] Canvas dimensions:', {
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
      console.warn(`[PositionManager] Unknown preset: ${preset}, using center`);
      preset = 'center';
    }
    
    const config = PositionPresets[preset];
    const modelWidth = options.modelSizePx?.width || config.modelSize.width;
    const modelHeight = options.modelSizePx?.height || config.modelSize.height;
    const padding = options.padding !== undefined ? options.padding : config.padding;
    const offset = options.offset || config.offset || { x: 0, y: 0 };
    
    // Apply preset's custom boundaries (if defined)
    if (config.customBoundaries) {
      this.customBoundaries = { ...config.customBoundaries };
      console.log(`[PositionManager] Applied custom boundaries from preset '${preset}':`, this.customBoundaries);
    } else {
      // Clear custom boundaries if preset doesn't define them
      this.customBoundaries = null;
    }
    
    let pixelX, pixelY;
    
    // Calculate pixel position based on preset
    switch(preset) {
      case 'bottom-right':
        pixelX = this.canvasWidth - modelWidth - padding;
        pixelY = this.canvasHeight - modelHeight - padding;
        break;
        
      case 'bottom-left':
        pixelX = padding;
        pixelY = this.canvasHeight - modelHeight - padding;
        break;
        
      case 'bottom-center':
        pixelX = (this.canvasWidth - modelWidth) / 2;
        pixelY = this.canvasHeight - modelHeight - padding;
        break;
        
      case 'top-center':
        pixelX = (this.canvasWidth - modelWidth) / 2;
        pixelY = padding;
        break;
        
      case 'center':
        pixelX = (this.canvasWidth - modelWidth) / 2;
        pixelY = (this.canvasHeight - modelHeight) / 2;
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
        pixelY = (this.canvasHeight - modelHeight) / 2;
    }
    
    console.log(`[PositionManager] Applying preset: ${preset}`, {
      pixelPosition: { x: pixelX, y: pixelY },
      modelSize: { width: modelWidth, height: modelHeight },
      padding,
      offset
    });
    
    this.setPositionPixels(pixelX, pixelY, modelWidth, modelHeight, offset);
  }
  
  /**
   * Set model position in pixel coordinates
   * This is the main positioning method - everything goes through here
   * @param {number} x - X position in pixels (from left edge of canvas)
   * @param {number} y - Y position in pixels (from top edge of canvas)
   * @param {number} width - Model width in pixels
   * @param {number} height - Model height in pixels
   * @param {object} offset - Camera offset in world units { x, y }
   */
  setPositionPixels(x, y, width, height, offset = { x: 0, y: 0 }) {
    // Validate and clamp to prevent cutoff
    const validated = this.validatePosition(x, y, width, height);
    
    // Store current position
    this.positionX = validated.adjustedX;
    this.positionY = validated.adjustedY;
    this.modelWidthPx = width;
    this.modelHeightPx = height;
    this.offset = offset;  // Store offset for camera calculations
    
    // Convert pixel position to camera frustum
    this.updateCameraFrustum();
    
    // Throttle position change events using RAF to prevent excessive updates
    // This batches multiple rapid position changes into a single event per frame
    this.emitPositionChangeThrottled({
      x: this.positionX, 
      y: this.positionY, 
      width: this.modelWidthPx, 
      height: this.modelHeightPx 
    });
    
    if (!validated.valid) {
      console.warn('[PositionManager] Position adjusted to prevent cutoff', {
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
    const modelCenterPixelX = this.positionX + this.modelWidthPx / 2;
    const modelCenterPixelY = this.positionY + this.modelHeightPx / 2;
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
        console.log('[PositionManager] Window resize complete, updating position');
        
        const oldWidth = this.canvasWidth;
        const oldHeight = this.canvasHeight;
        
        // Update canvas dimensions
        this.updateCanvasDimensions();
        
        // Recalculate frustum with new dimensions
        // This maintains the same relative position
        this.updateCameraFrustum();
        
        console.log('[PositionManager] Resize complete', {
          from: { width: oldWidth, height: oldHeight },
          to: { width: this.canvasWidth, height: this.canvasHeight }
        });
      }, this.RESIZE_DEBOUNCE_MS);
    };
    
    // Listen to window resize
    window.addEventListener('resize', this.resizeHandler);
    
    console.log('[PositionManager] Resize handler setup with debounce:', this.RESIZE_DEBOUNCE_MS, 'ms');
  }
  
  /**
   * Get current position in pixels
   * @returns {object} - { x, y, width, height } all in pixels
   */
  getPositionPixels() {
    return {
      x: this.positionX,
      y: this.positionY,
      width: this.modelWidthPx,
      height: this.modelHeightPx
    };
  }
  
  /**
   * Check if position would cause model cutoff and adjust if needed
   * @param {number} x - Proposed X position (pixels from left)
   * @param {number} y - Proposed Y position (pixels from top)
   * @param {number} width - Model width (pixels)
   * @param {number} height - Model height (pixels)
   * @returns {object} - { valid: boolean, adjustedX, adjustedY }
   */
  validatePosition(x, y, width = this.modelWidthPx, height = this.modelHeightPx) {
    let adjustedX = x;
    let adjustedY = y;
    let valid = true;
    
    // Calculate allowed offscreen amount if enabled
    const allowedOffscreenX = this.allowPartialOffscreen ? width * this.partialOffscreenAmount : 0;
    const allowedOffscreenY = this.allowPartialOffscreen ? height * this.partialOffscreenAmount : 0;
    
    // Calculate effective boundaries
    // Use custom boundaries if provided, otherwise use uniform padding
    let leftPadding, rightPadding, topPadding, bottomPadding;
    
    if (this.customBoundaries) {
      // Custom per-edge boundaries (fine-tuned for specific model)
      leftPadding = this.customBoundaries.left ?? this.boundaryPadding;
      rightPadding = this.customBoundaries.right ?? this.boundaryPadding;
      topPadding = this.customBoundaries.top ?? this.boundaryPadding;
      bottomPadding = this.customBoundaries.bottom ?? this.boundaryPadding;
    } else {
      // Uniform padding on all edges
      leftPadding = rightPadding = topPadding = bottomPadding = this.boundaryPadding;
    }
    
    // Pure pixel boundaries (offset is handled separately in camera frustum)
    const minX = leftPadding - allowedOffscreenX;
    const maxX = this.canvasWidth - width - rightPadding + allowedOffscreenX;
    const minY = topPadding - allowedOffscreenY;
    const maxY = this.canvasHeight - height - bottomPadding + allowedOffscreenY;
    
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
    console.log('[PositionManager] Custom boundaries manually set (overriding preset):', boundaries);
    
    // Revalidate current position with new boundaries
    const validated = this.validatePosition(this.positionX, this.positionY);
    if (!validated.valid) {
      this.positionX = validated.adjustedX;
      this.positionY = validated.adjustedY;
      this.updateCameraFrustum();
      console.log('[PositionManager] Position adjusted due to new boundaries');
    }
  }
  
  /**
   * Clear custom boundaries and use uniform padding
   * Will revert to preset boundaries on next preset change
   */
  clearCustomBoundaries() {
    this.customBoundaries = null;
    console.log('[PositionManager] Custom boundaries cleared, using uniform padding');
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
    
    console.log('[PositionManager] Disposed');
  }
}
