/**
 * Background Storage Service
 */

import storageManager from '../storage';
import Logger from './LoggerService';

class BackgroundStorageService {
  constructor() {
    this.CATEGORY = 'background';
    this.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max
    this.ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  }

  /**
   * Generate unique background ID
   */
  generateId() {
    return `bg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate image file
   */
  validateImage(file) {
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    if (!this.ALLOWED_TYPES.includes(file.type)) {
      return { valid: false, error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' };
    }

    if (file.size > this.MAX_FILE_SIZE) {
      return { valid: false, error: 'File too large. Maximum size: 10MB' };
    }

    return { valid: true };
  }

  /**
   * Save a background image
   * @param {File} file - Image file
   * @param {string} name - Optional name for the background
   * @returns {Promise<string>} Background ID
   */
  async saveBackground(file, name = null) {
    try {
      const validation = this.validateImage(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const id = this.generateId();
      const displayName = name || file.name.replace(/\.[^/.]+$/, '');

      // Read file as blob
      const imageBlob = new Blob([await file.arrayBuffer()], { type: file.type });

      const data = {
        name: displayName,
        imageData: imageBlob,
        mimeType: file.type,
        isActive: false,
        metadata: {
          originalFileName: file.name,
          fileSize: file.size,
          uploadedAt: Date.now()
        }
      };

      await storageManager.files.save(id, data, this.CATEGORY);

      Logger.log('BackgroundStorage', `Background saved: ${id} (${displayName})`);
      return id;
    } catch (error) {
      Logger.error('BackgroundStorage', 'Failed to save background:', error);
      throw error;
    }
  }

  /**
   * Get all backgrounds
   * @returns {Promise<Array>} List of backgrounds with metadata
   */
  async getBackgroundsList() {
    try {
      const backgroundsObj = await storageManager.files.getByCategory(this.CATEGORY);
      
      const backgrounds = Object.entries(backgroundsObj).map(([fileId, data]) => ({
        id: fileId,
        name: data?.name || 'Unnamed',
        isActive: data?.isActive || false,
        mimeType: data?.mimeType,
        metadata: data?.metadata || {},
        // Create object URL for preview
        previewUrl: data?.imageData ? URL.createObjectURL(data.imageData) : null
      }));

      Logger.log('BackgroundStorage', `Found ${backgrounds.length} backgrounds`);
      return backgrounds;
    } catch (error) {
      Logger.error('BackgroundStorage', 'Failed to get backgrounds list:', error);
      return [];
    }
  }

  /**
   * Get a single background by ID
   * @param {string} id - Background ID
   * @returns {Promise<Object|null>} Background data
   */
  async getBackground(id) {
    try {
      const bg = await storageManager.files.load(id);
      if (!bg) return null;

      return {
        id: bg.fileId,
        name: bg.data?.name,
        isActive: bg.data?.isActive || false,
        mimeType: bg.data?.mimeType,
        imageData: bg.data?.imageData,
        metadata: bg.data?.metadata || {}
      };
    } catch (error) {
      Logger.error('BackgroundStorage', 'Failed to get background:', error);
      return null;
    }
  }

  /**
   * Get the active background
   * @returns {Promise<Object|null>} Active background data with URL
   */
  async getActiveBackground() {
    try {
      const backgroundsObj = await storageManager.files.getByCategory(this.CATEGORY);
      
      const activeEntry = Object.entries(backgroundsObj).find(([_, data]) => data?.isActive === true);
      
      if (!activeEntry) return null;

      const [fileId, data] = activeEntry;
      return {
        id: fileId,
        name: data?.name,
        mimeType: data?.mimeType,
        imageUrl: data?.imageData ? URL.createObjectURL(data.imageData) : null
      };
    } catch (error) {
      Logger.error('BackgroundStorage', 'Failed to get active background:', error);
      return null;
    }
  }

  /**
   * Set a background as active (and deactivate others)
   * @param {string} id - Background ID to activate (null to clear)
   */
  async setActiveBackground(id) {
    try {
      const backgroundsObj = await storageManager.files.getByCategory(this.CATEGORY);
      
      for (const [fileId, data] of Object.entries(backgroundsObj)) {
        const newIsActive = fileId === id;
        if (data?.isActive !== newIsActive) {
          await storageManager.files.save(fileId, {
            ...data,
            isActive: newIsActive
          }, this.CATEGORY);
        }
      }

      Logger.log('BackgroundStorage', `Active background set: ${id || 'none'}`);
    } catch (error) {
      Logger.error('BackgroundStorage', 'Failed to set active background:', error);
      throw error;
    }
  }

  /**
   * Clear active background
   */
  async clearActiveBackground() {
    await this.setActiveBackground(null);
  }

  /**
   * Delete a background
   * @param {string} id - Background ID
   */
  async deleteBackground(id) {
    try {
      await storageManager.files.remove(id);
      Logger.log('BackgroundStorage', `Background deleted: ${id}`);
    } catch (error) {
      Logger.error('BackgroundStorage', 'Failed to delete background:', error);
      throw error;
    }
  }

  /**
   * Update background name
   * @param {string} id - Background ID
   * @param {string} newName - New name
   */
  async updateBackgroundName(id, newName) {
    try {
      const bg = await storageManager.files.load(id);
      if (!bg) throw new Error('Background not found');

      await storageManager.files.save(id, {
        ...bg.data,
        name: newName
      }, this.CATEGORY);

      Logger.log('BackgroundStorage', `Background renamed: ${id} -> ${newName}`);
    } catch (error) {
      Logger.error('BackgroundStorage', 'Failed to update background name:', error);
      throw error;
    }
  }
}

export const backgroundStorageService = new BackgroundStorageService();
export default backgroundStorageService;
