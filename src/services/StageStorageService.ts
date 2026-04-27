/**
 * Stage Storage Service
 * Handles storage and management of MMD stage models (PMX format)
 */

import storageServiceProxy from './proxies/StorageServiceProxy';
import Logger from './LoggerService';

class StageStorageService {
  constructor() {
    this.CATEGORY = 'stage';
    this.MAX_NAME_LENGTH = 50;
  }

  /**
   * Validate stage name
   * @param {string} name - Stage name to validate
   * @returns {Object} - { valid: boolean, error: string }
   */
  validateStageName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Stage name is required' };
    }

    const trimmed = name.trim();
    
    if (trimmed.length === 0) {
      return { valid: false, error: 'Stage name cannot be empty' };
    }

    if (trimmed.length > this.MAX_NAME_LENGTH) {
      return { valid: false, error: `Stage name cannot exceed ${this.MAX_NAME_LENGTH} characters` };
    }

    return { valid: true, name: trimmed };
  }

  /**
   * Generate unique stage ID
   * @returns {string} - UUID
   */
  generateStageId() {
    return `stage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save a stage to storage
   * @param {string} stageId - Unique stage ID (or null to generate)
   * @param {string} stageName - User-editable stage name
   * @param {Blob|ArrayBuffer} bpmxData - BPMX binary data
   * @param {Object} metadata - Additional metadata
   * @param {boolean} setAsDefault - Whether to set this as the default stage
   * @returns {Promise<string>} - Stage ID
   */
  async saveStage(stageId, stageName, bpmxData, metadata = {}, setAsDefault = false) {
    try {
      const nameValidation = this.validateStageName(stageName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }

      if (!stageId) {
        stageId = this.generateStageId();
      }

      let stageBlob;
      if (bpmxData instanceof ArrayBuffer) {
        stageBlob = new Blob([bpmxData], { type: 'application/octet-stream' });
      } else if (bpmxData instanceof Blob) {
        stageBlob = bpmxData;
      } else {
        throw new Error('Invalid stage data format. Expected Blob or ArrayBuffer.');
      }

      if (setAsDefault) {
        await this.clearAllDefaults();
      }

      const stageData = {
        name: nameValidation.name,
        stageData: stageBlob,
        isDefault: setAsDefault,
        metadata: {
          originalFileName: metadata.originalFileName || 'unknown.pmx',
          uploadedAt: Date.now(),
          fileSize: stageBlob.size,
          conversionInfo: metadata.conversionInfo || {},
          ...metadata
        }
      };

      await storageServiceProxy.fileSave(stageId, stageData, this.CATEGORY);

      Logger.log('StageStorage', `Stage saved: ${stageId} (${nameValidation.name})`);
      
      return stageId;
    } catch (error) {
      Logger.error('StageStorage', 'Failed to save stage:', error);
      throw error;
    }
  }

  /**
   * Get a stage by ID
   * @param {string} stageId - Stage ID
   * @returns {Promise<Object|null>} - Stage data or null
   */
  async getStage(stageId) {
    try {
      const stageData = await storageServiceProxy.fileLoad(stageId);
      return stageData || null;
    } catch (error) {
      Logger.error('StageStorage', `Failed to get stage ${stageId}:`, error);
      return null;
    }
  }

  /**
   * Get stages list (lightweight, no blob data)
   * Returns only IDs, isDefault flag, and metadata for fast listing
   * @returns {Promise<Array>} - Array of stage info without blob data
   */
  async getStagesList() {
    try {
      const stagesMetadata = await storageServiceProxy.filesGetMetadataByCategory(this.CATEGORY);
      
      const stagesList = Object.entries(stagesMetadata).map(([id, data]) => ({
        id,
        name: data.value?.name || 'Unknown Stage',
        isDefault: data.value?.isDefault || false,
        metadata: data.value?.metadata || {
          originalFileName: 'unknown.pmx',
          uploadedAt: 0,
          fileSize: 0
        },
      }));

      Logger.log('StageStorage', `Retrieved ${stagesList.length} stages (metadata only)`);
      return stagesList;
    } catch (error) {
      Logger.error('StageStorage', 'Failed to get stages list:', error);
      return [];
    }
  }

  /**
   * Get all stages (including full blob data)
   * Only use when you need the actual stage data
   * @returns {Promise<Array>} - Array of complete stage objects
   */
  async getAllStages() {
    try {
      const allStages = await storageServiceProxy.filesGetByCategory(this.CATEGORY);
      
      const stagesArray = Object.entries(allStages).map(([id, data]) => ({
        id,
        ...data
      }));

      return stagesArray;
    } catch (error) {
      Logger.error('StageStorage', 'Failed to get all stages:', error);
      return [];
    }
  }

  /**
   * Get the default stage
   * @returns {Promise<Object|null>} - Default stage with ID or null
   */
  async getDefaultStage() {
    try {
      const allStages = await this.getAllStages();
      const defaultStage = allStages.find(stage => stage.isDefault === true);
      return defaultStage || null;
    } catch (error) {
      Logger.error('StageStorage', 'Failed to get default stage:', error);
      return null;
    }
  }

  /**
   * Set a stage as default
   * @param {string} stageId - Stage ID to set as default
   * @returns {Promise<boolean>} - Success status
   */
  async setDefaultStage(stageId) {
    try {
      await this.clearAllDefaults();

      const stage = await this.getStage(stageId);
      if (!stage) {
        throw new Error(`Stage ${stageId} not found`);
      }

      stage.isDefault = true;

      await storageServiceProxy.fileSave(stageId, stage, this.CATEGORY);

      Logger.log('StageStorage', `Stage ${stageId} set as default`);
      return true;
    } catch (error) {
      Logger.error('StageStorage', 'Failed to set default stage:', error);
      throw error;
    }
  }

  /**
   * Clear default flag from all stages
   * @private
   * @returns {Promise<void>}
   */
  async clearAllDefaults() {
    try {
      const allStages = await this.getAllStages();
      
      for (const stage of allStages) {
        if (stage.isDefault) {
          stage.isDefault = false;
          await storageServiceProxy.fileSave(stage.id, stage, this.CATEGORY);
        }
      }

      Logger.log('StageStorage', 'Cleared all default flags');
    } catch (error) {
      Logger.error('StageStorage', 'Failed to clear defaults:', error);
      throw error;
    }
  }

  /**
   * Update stage name
   * @param {string} stageId - Stage ID
   * @param {string} newName - New stage name
   * @returns {Promise<boolean>} - Success status
   */
  async updateStageName(stageId, newName) {
    try {
      const nameValidation = this.validateStageName(newName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }

      const stage = await this.getStage(stageId);
      if (!stage) {
        throw new Error(`Stage ${stageId} not found`);
      }

      stage.name = nameValidation.name;

      if (!stage.metadata) {
        stage.metadata = {};
      }
      stage.metadata.lastRenamed = Date.now();

      await storageServiceProxy.fileSave(stageId, stage, this.CATEGORY);

      Logger.log('StageStorage', `Stage ${stageId} renamed to: ${nameValidation.name}`);
      return true;
    } catch (error) {
      Logger.error('StageStorage', 'Failed to update stage name:', error);
      throw error;
    }
  }

  /**
   * Update stage metadata
   * @param {string} stageId - Stage ID
   * @param {Object} metadataUpdates - Metadata fields to update
   * @returns {Promise<boolean>} - Success status
   */
  async updateStageMetadata(stageId, metadataUpdates) {
    try {
      const stage = await this.getStage(stageId);
      if (!stage) {
        throw new Error(`Stage ${stageId} not found`);
      }

      if (!stage.metadata) {
        stage.metadata = {};
      }

      Object.assign(stage.metadata, metadataUpdates);

      await storageServiceProxy.fileSave(stageId, stage, this.CATEGORY);

      Logger.log('StageStorage', `Stage ${stageId} metadata updated`);
      return true;
    } catch (error) {
      Logger.error('StageStorage', 'Failed to update stage metadata:', error);
      throw error;
    }
  }

  /**
   * Delete a stage
   * @param {string} stageId - Stage ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteStage(stageId) {
    try {
      await storageServiceProxy.fileRemove(stageId);
      Logger.log('StageStorage', `Stage ${stageId} deleted`);
      return true;
    } catch (error) {
      Logger.error('StageStorage', 'Failed to delete stage:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const stageStorageService = new StageStorageService();

export default stageStorageService;
