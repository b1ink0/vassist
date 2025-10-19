import storageManager from '../storage';
import { DefaultUIConfig, BackgroundThemeModes } from '../config/uiConfig';

/**
 * Singleton utility for detecting background brightness
 * Used by ChatContainer and ChatInput for adaptive theming
 */
class BackgroundDetector {
  constructor() {
    if (BackgroundDetector.instance) {
      return BackgroundDetector.instance;
    }
    BackgroundDetector.instance = this;
    this.cachedUIConfig = DefaultUIConfig; // Cache config for sync access
    this._loadConfig(); // Load async in background
  }

  /**
   * Load and cache UI config from storage
   */
  async _loadConfig() {
    try {
      const config = await storageManager.config.load('uiConfig', DefaultUIConfig);
      this.cachedUIConfig = config;
    } catch (error) {
      console.error('[BackgroundDetector] Failed to load UI config:', error);
      this.cachedUIConfig = DefaultUIConfig;
    }
  }

  /**
   * Detect background brightness at specific sample points
   * @param {Object} options - Configuration options
   * @param {Object} options.sampleArea - Area to sample { type: 'grid' | 'horizontal', ... }
   * @param {Array<HTMLElement>} options.elementsToIgnore - Elements to skip during sampling
   * @param {string} options.logPrefix - Prefix for console logs
   * @param {boolean} options.enableDebug - Enable debug markers (overrides config if set)
   * @returns {Object} { isLight: boolean, brightness: number, debugMarkers: Array }
   */
  detectBrightness(options = {}) {
    const {
      sampleArea = { type: 'grid', x: 0, y: 0, width: 400, height: 500, padding: 60 },
      elementsToIgnore = [],
      logPrefix = '[BackgroundDetector]',
      enableDebug, // No default - will be undefined if not passed
    } = options;

    try {
      // Get UI config from cache (loads async in background)
      const uiConfig = this.cachedUIConfig;
      const bgConfig = uiConfig.backgroundDetection || DefaultUIConfig.backgroundDetection;
      
      // If forced mode, skip detection
      if (bgConfig.mode === BackgroundThemeModes.LIGHT) {
        return { isLight: true, brightness: 255, debugMarkers: [] };
      }
      if (bgConfig.mode === BackgroundThemeModes.DARK) {
        return { isLight: false, brightness: 0, debugMarkers: [] };
      }
      
      // Use config setting for debug, but allow override if explicitly set
      const showDebug = enableDebug !== undefined ? enableDebug : (bgConfig.showDebug || false);
      const gridSize = bgConfig.sampleGridSize || 5;
      
      // Generate sample points based on area type
      const samplePoints = this._generateSamplePoints(sampleArea, gridSize);
      
      // Collect brightness values
      const allBrightness = [];
      const markers = [];
      
      for (const point of samplePoints) {
        const result = this._samplePointBrightness(point, elementsToIgnore);
        
        if (result.brightness !== null) {
          allBrightness.push(result.brightness);
          
          if (showDebug) {
            const hue = (result.brightness / 255) * 120; // 0 (red) to 120 (green)
            const color = `hsl(${hue}, 100%, 50%)`;
            markers.push({
              x: point.x,
              y: point.y,
              color,
              brightness: Math.round(result.brightness),
              alpha: result.alpha?.toFixed(2) || '1.00',
              element: result.element || 'unknown',
            });
          }
        }
      }
      
      if (allBrightness.length === 0) {
        console.warn(`${logPrefix} No valid samples found`);
        return { isLight: false, brightness: 0, debugMarkers: [] };
      }
      
      // Calculate median brightness (more robust than average)
      const sortedBrightness = [...allBrightness].sort((a, b) => a - b);
      const medianIndex = Math.floor(sortedBrightness.length / 2);
      const medianBrightness = sortedBrightness.length % 2 === 0
        ? (sortedBrightness[medianIndex - 1] + sortedBrightness[medianIndex]) / 2
        : sortedBrightness[medianIndex];
      
      // Use dark theme if median brightness is above threshold (light background)
      const brightnessThreshold = 127.5;
      const isLight = medianBrightness > brightnessThreshold;
      
      return {
        isLight,
        brightness: medianBrightness,
        debugMarkers: markers,
        sampleCount: allBrightness.length,
      };
    } catch (error) {
      console.error(`${logPrefix} Detection failed:`, error);
      return { isLight: false, brightness: 0, debugMarkers: [] };
    }
  }

  /**
   * Generate sample points based on area configuration
   * @private
   */
  _generateSamplePoints(sampleArea, gridSize) {
    const points = [];
    
    if (sampleArea.type === 'grid') {
      // Grid sampling (for ChatContainer)
      const { x, y, width, height, padding } = sampleArea;
      const cols = gridSize;
      const rows = gridSize;
      
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const px = x + padding + (col * (width - 2 * padding) / (cols - 1));
          const py = y + padding + (row * (height - 2 * padding) / (rows - 1));
          points.push({ x: px, y: py });
        }
      }
    } else if (sampleArea.type === 'horizontal') {
      // Horizontal line sampling (for ChatInput)
      const { centerX, centerY, width, padding } = sampleArea;
      
      for (let i = 0; i < gridSize; i++) {
        const x = centerX - width/2 + padding + (i * (width - padding*2) / (gridSize - 1));
        points.push({ x, y: centerY });
      }
    }
    
    return points;
  }

  /**
   * Sample brightness at a specific point
   * @private
   */
  _samplePointBrightness(point, elementsToIgnore = []) {
    let elementBehind = document.elementFromPoint(point.x, point.y);
    if (!elementBehind) {
      return { brightness: null };
    }
    
    // Traverse up DOM tree to find first element with non-transparent background
    let bgColor = '';
    let attempts = 0;
    const maxAttempts = 10;
    
    while (elementBehind && attempts < maxAttempts) {
      // Check if this element should be ignored
      const shouldIgnore = elementsToIgnore.some(el => {
        if (el instanceof HTMLElement) {
          return elementBehind === el;
        } else if (typeof el === 'string') {
          // Selector or ID
          if (el.startsWith('.')) {
            return elementBehind.closest(el);
          } else if (el.startsWith('#')) {
            return elementBehind.id === el.substring(1);
          }
        }
        return false;
      });
      
      if (shouldIgnore) {
        // Move up to parent
        elementBehind = elementBehind.parentElement;
        attempts++;
        continue;
      }
      
      bgColor = window.getComputedStyle(elementBehind).backgroundColor;
      
      // Check if we got a valid color
      const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (rgbMatch) {
        const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
        // If we found a non-transparent color, use it
        if (a > 0.1) {
          const r = parseInt(rgbMatch[1]);
          const g = parseInt(rgbMatch[2]);
          const b = parseInt(rgbMatch[3]);
          
          // Calculate perceived brightness using luminance formula
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          
          return {
            brightness,
            alpha: a,
            element: elementBehind.tagName,
          };
        }
      }
      
      // Move to parent element
      elementBehind = elementBehind.parentElement;
      attempts++;
    }
    
    return { brightness: null };
  }

  /**
   * Helper to temporarily disable pointer events on elements during sampling
   */
  withDisabledPointerEvents(elements, callback) {
    const originalStyles = new Map();
    
    // Disable pointer events
    elements.forEach(el => {
      if (el && el.style) {
        originalStyles.set(el, el.style.pointerEvents);
        el.style.pointerEvents = 'none';
      }
    });
    
    // Execute callback
    const result = callback();
    
    // Restore pointer events
    elements.forEach(el => {
      if (el && el.style) {
        el.style.pointerEvents = originalStyles.get(el) || '';
      }
    });
    
    return result;
  }
}

// Export singleton instance
export default new BackgroundDetector();
