/**
 * Motion Storage Service
 */

import storageServiceProxy from './proxies/StorageServiceProxy';
import Logger from './LoggerService';

class MotionStorageService {
  constructor() {
    this.CATEGORY = 'motion';
    this.MAX_NAME_LENGTH = 50;
  }

  /**
   * Validate motion name
   * @param {string} name - Motion name to validate
   * @returns {Object} - { valid: boolean, error: string, name: string }
   */
  validateMotionName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Motion name is required' };
    }

    const trimmed = name.trim();
    
    if (trimmed.length === 0) {
      return { valid: false, error: 'Motion name cannot be empty' };
    }

    if (trimmed.length > this.MAX_NAME_LENGTH) {
      return { valid: false, error: `Motion name cannot exceed ${this.MAX_NAME_LENGTH} characters` };
    }

    return { valid: true, name: trimmed };
  }

  /**
   * Generate unique motion ID
   * @returns {string} - UUID
   */
  generateMotionId() {
    return `motion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save a motion to storage
   * @param {string} motionId - Unique motion ID (or null to generate)
   * @param {string} motionName - User-editable motion name
   * @param {Blob|ArrayBuffer} bvmdData - BVMD binary data
   * @param {Array<string>} animationCategories - Array of animation categories (idle, thinking, etc.)
   * @param {Object} metadata - Additional metadata
   * @param {Object} enabledByCategory - Object mapping category to enabled state {idle: true, thinking: false}
   * @returns {Promise<string>} - Motion ID
   */
  async saveMotion(motionId, motionName, bvmdData, animationCategories = [], metadata = {}, enabledByCategory = {}) {
    try {
      const nameValidation = this.validateMotionName(motionName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }

      if (!motionId) {
        motionId = this.generateMotionId();
      }

      let motionBlob;
      if (bvmdData instanceof ArrayBuffer) {
        motionBlob = new Blob([bvmdData], { type: 'application/octet-stream' });
      } else if (bvmdData instanceof Blob) {
        motionBlob = bvmdData;
      } else {
        throw new Error('Invalid motion data format. Expected Blob or ArrayBuffer.');
      }

      const motionData = {
        name: nameValidation.name,
        motionData: motionBlob,
        animationCategories: animationCategories, 
        enabledByCategory: enabledByCategory, 
        metadata: {
          originalFileName: metadata.originalFileName || 'unknown.vmd',
          uploadedAt: Date.now(),
          fileSize: motionBlob.size,
          conversionInfo: metadata.conversionInfo || {},
          ...metadata
        }
      };

      await storageServiceProxy.fileSave(motionId, motionData, this.CATEGORY);

      Logger.log('MotionStorage', `Motion saved: ${motionId} (${nameValidation.name}) - Categories: ${animationCategories.join(', ')}`);
      
      return motionId;
    } catch (error) {
      Logger.error('MotionStorage', 'Failed to save motion:', error);
      throw error;
    }
  }

  /**
   * Get a motion by ID
   * @param {string} motionId - Motion ID
   * @returns {Promise<Object|null>} - Motion data or null
   */
  async getMotion(motionId) {
    try {
      const motionData = await storageServiceProxy.fileLoad(motionId);
      return motionData || null;
    } catch (error) {
      Logger.error('MotionStorage', `Failed to get motion ${motionId}:`, error);
      return null;
    }
  }

  /**
   * Get all motions (including full blob data)
   * Only use when you need the actual motion data
   * @returns {Promise<Array>} - Array of complete motion objects
   */
  async getAllMotions() {
    try {
      const allMotions = await storageServiceProxy.filesGetByCategory(this.CATEGORY);
      
      const motionsArray = Object.entries(allMotions).map(([id, data]) => ({
        id,
        ...data
      }));

      return motionsArray;
    } catch (error) {
      Logger.error('MotionStorage', 'Failed to get all motions:', error);
      return [];
    }
  }

  /**
   * Get motions list (lightweight, no blob data)
   * Returns only IDs, categories, enabled state per category, and metadata for fast listing
   * Fetches only metadata from database level, not blob data
   * @returns {Promise<Array>} - Array of motion info without blob data
   */
  async getMotionsList() {
    try {
      const motionsMetadata = await storageServiceProxy.filesGetMetadataByCategory(this.CATEGORY);
      
      const motionsList = Object.entries(motionsMetadata).map(([id, data]) => ({
        id,
        name: data.value?.name || 'Unknown Motion',
        animationCategories: data.value?.animationCategories || [], 
        enabledByCategory: data.value?.enabledByCategory || {},
        metadata: data.value?.metadata || {
          originalFileName: 'unknown.vmd',
          uploadedAt: 0,
          fileSize: 0
        },
      }));

      Logger.log('MotionStorage', `Retrieved ${motionsList.length} motions (metadata only)`);
      return motionsList;
    } catch (error) {
      Logger.error('MotionStorage', 'Failed to get motions list:', error);
      return [];
    }
  }

  /**
   * Get motions by animation category
   * @param {string} animCategory - Animation category (idle, thinking, etc.)
   * @returns {Promise<Array>} - Array of motions in category
   */
  async getMotionsByCategory(animCategory) {
    try {
      const allMotions = await this.getAllMotions();
      const categoryMotions = allMotions.filter(motion => 
        motion.animationCategories && motion.animationCategories.includes(animCategory)
      );

      Logger.log('MotionStorage', `Retrieved ${categoryMotions.length} motions for category: ${animCategory}`);
      return categoryMotions;
    } catch (error) {
      Logger.error('MotionStorage', `Failed to get motions for category ${animCategory}:`, error);
      return [];
    }
  }

  /**
   * Update motion name
   * @param {string} motionId - Motion ID
   * @param {string} newName - New motion name
   * @returns {Promise<boolean>} - Success status
   */
  async updateMotionName(motionId, newName) {
    try {
      const nameValidation = this.validateMotionName(newName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }

      const motion = await this.getMotion(motionId);
      if (!motion) {
        throw new Error(`Motion ${motionId} not found`);
      }

      motion.name = nameValidation.name;

      if (!motion.metadata) {
        motion.metadata = {};
      }
      motion.metadata.lastRenamed = Date.now();

      await storageServiceProxy.fileSave(motionId, motion, this.CATEGORY);

      Logger.log('MotionStorage', `Motion ${motionId} renamed to: ${nameValidation.name}`);
      return true;
    } catch (error) {
      Logger.error('MotionStorage', 'Failed to update motion name:', error);
      throw error;
    }
  }

  /**
   * Update motion metadata
   * @param {string} motionId - Motion ID
   * @param {Object} metadataUpdates - Metadata or top-level fields to update
   * @returns {Promise<boolean>} - Success status
   */
  async updateMotionMetadata(motionId, metadataUpdates) {
    try {
      const motion = await this.getMotion(motionId);
      if (!motion) {
        throw new Error(`Motion ${motionId} not found`);
      }

      Object.keys(metadataUpdates).forEach(key => {
        if (key === 'animationCategory' || key === 'animationCategories' || key === 'enabledByCategory' || key === 'isEnabled' || key === 'name') {
          motion[key] = metadataUpdates[key];
        } else {
          if (!motion.metadata) {
            motion.metadata = {};
          }
          motion.metadata[key] = metadataUpdates[key];
        }
      });

      await storageServiceProxy.fileSave(motionId, motion, this.CATEGORY);

      Logger.log('MotionStorage', `Motion ${motionId} metadata updated:`, metadataUpdates);
      return true;
    } catch (error) {
      Logger.error('MotionStorage', 'Failed to update motion metadata:', error);
      throw error;
    }
  }

  /**
   * Toggle motion enabled state
   * @param {string} motionId - Motion ID
   * @param {boolean} enabled - Enabled state
   * @returns {Promise<boolean>} - Success status
   */
  async toggleMotionEnabled(motionId, enabled) {
    try {
      const motion = await this.getMotion(motionId);
      if (!motion) {
        throw new Error(`Motion ${motionId} not found`);
      }

      if (!enabled) {
        const categoryMotions = await this.getMotionsByCategory(motion.animationCategory);
        const enabledMotions = categoryMotions.filter(m => m.isEnabled);
        
        if (enabledMotions.length === 1 && enabledMotions[0].id === motionId) {
          throw new Error(`Cannot disable last enabled motion in category: ${motion.animationCategory}`);
        }
      }

      motion.isEnabled = enabled;
      
      if (!motion.metadata) {
        motion.metadata = {};
      }
      motion.metadata.lastToggled = Date.now();

      await storageServiceProxy.fileSave(motionId, motion, this.CATEGORY);

      Logger.log('MotionStorage', `Motion ${motionId} ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error) {
      Logger.error('MotionStorage', 'Failed to toggle motion:', error);
      throw error;
    }
  }

  /**
   * Delete a motion
   * @param {string} motionId - Motion ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteMotion(motionId) {
    try {
      const motion = await this.getMotion(motionId);
      if (!motion) {
        throw new Error(`Motion ${motionId} not found`);
      }

      // Check if this motion is enabled in any category and if it's the last one
      if (motion.animationCategories && motion.animationCategories.length > 0) {
        const enabledByCategory = motion.enabledByCategory || {};
        
        for (const category of motion.animationCategories) {
          // Only check categories where this motion is enabled
          if (enabledByCategory[category] === true) {
            const categoryMotions = await this.getMotionsByCategory(category);
            const enabledMotions = categoryMotions.filter(m => 
              m.enabledByCategory && m.enabledByCategory[category] === true
            );
            
            if (enabledMotions.length === 1 && enabledMotions[0].id === motionId) {
              throw new Error(`Cannot delete last enabled motion in category: ${category}`);
            }
          }
        }
      }

      await storageServiceProxy.fileRemove(motionId);

      if (motion.blobURL) {
        URL.revokeObjectURL(motion.blobURL);
      }

      Logger.log('MotionStorage', `Motion ${motionId} deleted`);
      return true;
    } catch (error) {
      Logger.error('MotionStorage', 'Failed to delete motion:', error);
      throw error;
    }
  }

  /**
   * Check if a motion exists
   * @param {string} motionId - Motion ID
   * @returns {Promise<boolean>} - Exists status
   */
  async motionExists(motionId) {
    try {
      return await storageServiceProxy.fileExists(motionId);
    } catch (error) {
      Logger.error('MotionStorage', `Failed to check if motion ${motionId} exists:`, error);
      return false;
    }
  }

  /**
   * Get total storage size for all motions
   * @returns {Promise<number>} - Total size in bytes
   */
  async getTotalStorageSize() {
    try {
      const allMotions = await this.getAllMotions();
      let totalSize = 0;

      for (const motion of allMotions) {
        if (motion.metadata && motion.metadata.fileSize) {
          totalSize += motion.metadata.fileSize;
        }
      }

      return totalSize;
    } catch (error) {
      Logger.error('MotionStorage', 'Failed to calculate total storage size:', error);
      return 0;
    }
  }

  /**
   * Get storage statistics grouped by category
   * @returns {Promise<Object>} - Statistics object
   */
  async getStorageStats() {
    try {
      const allMotions = await this.getAllMotions();
      const stats = {};

      for (const motion of allMotions) {
        const category = motion.animationCategory || 'unknown';
        
        if (!stats[category]) {
          stats[category] = {
            count: 0,
            enabled: 0,
            disabled: 0,
            totalSize: 0
          };
        }

        stats[category].count++;
        if (motion.isEnabled) {
          stats[category].enabled++;
        } else {
          stats[category].disabled++;
        }
        
        if (motion.metadata && motion.metadata.fileSize) {
          stats[category].totalSize += motion.metadata.fileSize;
        }
      }

      return stats;
    } catch (error) {
      Logger.error('MotionStorage', 'Failed to get storage stats:', error);
      return {};
    }
  }
}

// Create singleton instance
export const motionStorageService = new MotionStorageService();

export default motionStorageService;
