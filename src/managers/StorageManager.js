/**
 * StorageManager - localStorage abstraction layer
 * 
 * Simple wrapper around localStorage with error handling.
 * Designed to be easily swappable with IndexedDB or cloud storage in the future.
 */

class StorageManager {
  constructor(prefix = 'vassist_') {
    this.prefix = prefix;
  }

  /**
   * Save configuration to localStorage
   * @param {string} key - Configuration key
   * @param {any} value - Value to save (will be JSON stringified)
   * @returns {boolean} Success status
   */
  saveConfig(key, value) {
    try {
      const fullKey = this.prefix + key;
      const serialized = JSON.stringify(value);
      localStorage.setItem(fullKey, serialized);
      console.log(`[StorageManager] Saved config: ${key}`);
      return true;
    } catch (error) {
      console.error(`[StorageManager] Failed to save config: ${key}`, error);
      return false;
    }
  }

  /**
   * Get configuration from localStorage
   * @param {string} key - Configuration key
   * @param {any} defaultValue - Default value if key doesn't exist
   * @returns {any} Stored value or default
   */
  getConfig(key, defaultValue = null) {
    try {
      const fullKey = this.prefix + key;
      const item = localStorage.getItem(fullKey);
      
      if (item === null) {
        console.log(`[StorageManager] Config not found: ${key}, using default`);
        return defaultValue;
      }
      
      const parsed = JSON.parse(item);
      console.log(`[StorageManager] Loaded config: ${key}`);
      return parsed;
    } catch (error) {
      console.error(`[StorageManager] Failed to load config: ${key}`, error);
      return defaultValue;
    }
  }

  /**
   * Remove configuration from localStorage
   * @param {string} key - Configuration key
   * @returns {boolean} Success status
   */
  clearConfig(key) {
    try {
      const fullKey = this.prefix + key;
      localStorage.removeItem(fullKey);
      console.log(`[StorageManager] Cleared config: ${key}`);
      return true;
    } catch (error) {
      console.error(`[StorageManager] Failed to clear config: ${key}`, error);
      return false;
    }
  }

  /**
   * Check if configuration exists
   * @param {string} key - Configuration key
   * @returns {boolean} True if exists
   */
  hasConfig(key) {
    const fullKey = this.prefix + key;
    return localStorage.getItem(fullKey) !== null;
  }

  /**
   * Get all configuration keys (without prefix)
   * @returns {string[]} Array of configuration keys
   */
  getAllKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key.substring(this.prefix.length));
      }
    }
    return keys;
  }

  /**
   * Clear all configurations with this prefix
   * @returns {boolean} Success status
   */
  clearAll() {
    try {
      const keys = this.getAllKeys();
      keys.forEach(key => this.clearConfig(key));
      console.log(`[StorageManager] Cleared all configs (${keys.length} items)`);
      return true;
    } catch (error) {
      console.error('[StorageManager] Failed to clear all configs', error);
      return false;
    }
  }
}

// Export singleton instance
export default new StorageManager('vassist_');
