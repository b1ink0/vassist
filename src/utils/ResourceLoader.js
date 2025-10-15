/**
 * Resource Loader Utility
 * Handles loading assets in both dev and extension modes
 * Uses chrome-extension:// URLs in extension mode, relative paths in dev mode
 */

class ResourceLoader {
  constructor() {
    // Check multiple ways to detect extension mode
    // 1. Check if explicitly set via setMode()
    // 2. Check chrome.runtime.id (may not be available in all contexts)
    // 3. Check if running from chrome-extension:// URL
    this.isExtension = this._detectExtensionMode();
    
    console.log(`[ResourceLoader] Mode: ${this.isExtension ? 'Extension' : 'Development'}`);
  }

  /**
   * Detect if running in extension context
   * @returns {boolean} True if extension mode
   */
  _detectExtensionMode() {
    // Check if the current script was loaded from a chrome-extension:// URL
    // When running as extension, import.meta.url will be chrome-extension://...
    // In dev mode with Vite, it will be http://localhost:5173/...
    const isExtension = import.meta.url.startsWith('chrome-extension://');
    console.log('[ResourceLoader] Mode:', isExtension ? 'Extension' : 'Development');
    return isExtension;
  }

  /**
   * Explicitly set extension mode
   * @param {boolean} isExtension - True for extension mode, false for dev mode
   */
  setMode(isExtension) {
    this.isExtension = isExtension;
    console.log(`[ResourceLoader] Mode set to: ${this.isExtension ? 'Extension' : 'Development'}`);
  }

  /**
   * Get URL for a resource file
   * @param {string} path - Relative path to resource (e.g., 'res/models/model.pmx')
   * @returns {string|Promise<string>} - Full URL to resource
   */
  getURL(path) {
    if (!this.isExtension) {
      // In dev mode, use relative path from public folder
      // Vite serves public folder at root
      return `/${path}`;
    }

    // Extension mode - request URL from content script via ExtensionBridge
    // Content script has access to chrome.runtime.getURL, we don't
    // Import here to avoid circular dependency
    import('./ExtensionBridge.js').then(({ extensionBridge }) => {
      return extensionBridge.getResourceURL(path);
    });
    
    // For now, return a promise that will resolve to the URL
    // This makes the function async in extension mode
    console.warn('[ResourceLoader] getURL in extension mode - this should use async getURLAsync instead');
    return `/${path}`; // Temporary fallback
  }

  /**
   * Get URL for a resource file (async version for extension mode)
   * @param {string} path - Relative path to resource
   * @returns {Promise<string>} - Full URL to resource
   */
  async getURLAsync(path) {
    if (!this.isExtension) {
      // In dev mode, use relative path from public folder
      // Ensure path starts with / but don't double it
      return path.startsWith('/') ? path : `/${path}`;
    }

    // Extension mode - request URL from content script via ExtensionBridge
    const { extensionBridge } = await import('./ExtensionBridge.js');
    return extensionBridge.getResourceURL(path);
  }

  /**
   * Get URL for a model file (.pmx, .pmd)
   * @param {string} filename - Model filename
   * @returns {string} - Full URL to model
   */
  getModelURL(filename) {
    return this.getURL(`res/models/${filename}`);
  }

  /**
   * Get URL for an animation file (.bvmd, .vmd)
   * @param {string} filename - Animation filename
   * @returns {string} - Full URL to animation
   */
  getAnimationURL(filename) {
    return this.getURL(`res/animations/${filename}`);
  }

  /**
   * Get URL for a texture file
   * @param {string} filename - Texture filename
   * @returns {string} - Full URL to texture
   */
  getTextureURL(filename) {
    return this.getURL(`res/textures/${filename}`);
  }

  /**
   * Get URL for a private test resource
   * @param {string} type - Resource type (models, animations, etc.)
   * @param {string} filename - Filename
   * @returns {string} - Full URL to resource
   */
  getPrivateTestURL(type, filename) {
    return this.getURL(`res/private_test/${type}/${filename}`);
  }

  /**
   * Check if running in extension mode
   * @returns {boolean} - True if extension mode
   */
  isExtensionMode() {
    return this.isExtension;
  }

  /**
   * Load JSON configuration file
   * @param {string} path - Path to JSON file
   * @returns {Promise<Object>} - Parsed JSON data
   */
  async loadJSON(path) {
    const url = this.getURL(path);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to load JSON from ${url}: ${response.statusText}`);
    }
    
    return response.json();
  }

  /**
   * Load text file
   * @param {string} path - Path to text file
   * @returns {Promise<string>} - File contents
   */
  async loadText(path) {
    const url = this.getURL(path);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to load text from ${url}: ${response.statusText}`);
    }
    
    return response.text();
  }

  /**
   * Load binary file
   * @param {string} path - Path to binary file
   * @returns {Promise<ArrayBuffer>} - File contents as ArrayBuffer
   */
  async loadBinary(path) {
    const url = this.getURL(path);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to load binary from ${url}: ${response.statusText}`);
    }
    
    return response.arrayBuffer();
  }

  /**
   * Preload multiple resources
   * @param {Array<string>} paths - Array of resource paths
   * @returns {Promise<Array>} - Array of loaded resources
   */
  async preloadResources(paths) {
    const promises = paths.map(path => this.loadBinary(path));
    return Promise.all(promises);
  }
}

// Export singleton instance
export const resourceLoader = new ResourceLoader();
export default resourceLoader;
