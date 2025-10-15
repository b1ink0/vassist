/**
 * Storage Service for Extension
 * Uses chrome.storage.sync for settings and chrome.storage.local for large data
 */

/* global chrome */

export class StorageService {
  constructor() {
    this.cache = new Map(); // In-memory cache
    console.log('[StorageService] Initialized');
  }

  /**
   * Get value from storage
   * @param {string} key - Storage key
   * @param {*} defaultValue - Default value if key doesn't exist
   * @returns {Promise<*>} Stored value
   */
  async get(key, defaultValue = null) {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    try {
      const result = await chrome.storage.sync.get(key);
      const value = result[key] !== undefined ? result[key] : defaultValue;
      
      // Cache the value
      this.cache.set(key, value);
      
      return value;
    } catch (error) {
      console.error(`[StorageService] Failed to get ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Set value in storage
   * @param {string} key - Storage key
   * @param {*} value - Value to store
   * @returns {Promise<boolean>} Success
   */
  async set(key, value) {
    try {
      await chrome.storage.sync.set({ [key]: value });
      
      // Update cache
      this.cache.set(key, value);
      
      return true;
    } catch (error) {
      console.error(`[StorageService] Failed to set ${key}:`, error);
      
      // If sync fails (quota), try local storage
      try {
        await chrome.storage.local.set({ [key]: value });
        this.cache.set(key, value);
        return true;
      } catch (localError) {
        console.error(`[StorageService] Local storage also failed:`, localError);
        return false;
      }
    }
  }

  /**
   * Remove value from storage
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} Success
   */
  async remove(key) {
    try {
      await chrome.storage.sync.remove(key);
      await chrome.storage.local.remove(key);
      
      this.cache.delete(key);
      
      return true;
    } catch (error) {
      console.error(`[StorageService] Failed to remove ${key}:`, error);
      return false;
    }
  }

  /**
   * Clear all storage
   * @returns {Promise<boolean>} Success
   */
  async clear() {
    try {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      
      this.cache.clear();
      
      return true;
    } catch (error) {
      console.error('[StorageService] Failed to clear storage:', error);
      return false;
    }
  }

  /**
   * Get multiple values
   * @param {string[]} keys - Array of keys
   * @returns {Promise<Object>} Object with key-value pairs
   */
  async getMultiple(keys) {
    try {
      const result = await chrome.storage.sync.get(keys);
      
      // Update cache
      for (const key of keys) {
        if (result[key] !== undefined) {
          this.cache.set(key, result[key]);
        }
      }
      
      return result;
    } catch (error) {
      console.error('[StorageService] Failed to get multiple:', error);
      return {};
    }
  }

  /**
   * Set multiple values
   * @param {Object} items - Object with key-value pairs
   * @returns {Promise<boolean>} Success
   */
  async setMultiple(items) {
    try {
      await chrome.storage.sync.set(items);
      
      // Update cache
      for (const [key, value] of Object.entries(items)) {
        this.cache.set(key, value);
      }
      
      return true;
    } catch (error) {
      console.error('[StorageService] Failed to set multiple:', error);
      return false;
    }
  }

  /**
   * Get storage usage
   * @returns {Promise<number>} Bytes used
   */
  async getUsage() {
    try {
      const bytes = await chrome.storage.sync.getBytesInUse();
      return bytes;
    } catch (error) {
      console.error('[StorageService] Failed to get usage:', error);
      return 0;
    }
  }

  /**
   * Migrate from localStorage to chrome.storage
   * @param {Object} localStorageData - Data from localStorage
   */
  async migrateFromLocalStorage(localStorageData) {
    console.log('[StorageService] Migrating from localStorage...');
    
    try {
      // Convert and store in chrome.storage
      for (const [key, value] of Object.entries(localStorageData)) {
        try {
          // Try to parse JSON if it's a string
          const parsedValue = typeof value === 'string' ? JSON.parse(value) : value;
          await this.set(key, parsedValue);
        } catch {
          // If parsing fails, store as-is
          await this.set(key, value);
        }
      }
      
      console.log('[StorageService] Migration complete');
      return true;
    } catch (error) {
      console.error('[StorageService] Migration failed:', error);
      return false;
    }
  }
}

// Create singleton
export const storageService = new StorageService();
