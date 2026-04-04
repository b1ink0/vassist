/**
 * Model Storage Service
 */

import storageServiceProxy from './proxies/StorageServiceProxy';
import Logger from './LoggerService';

class ModelStorageService {
  constructor() {
    this.CATEGORY = 'model';
    this.MAX_NAME_LENGTH = 50;
  }

  /**
   * Validate model name
   * @param {string} name - Model name to validate
   * @returns {Object} - { valid: boolean, error: string }
   */
  validateModelName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Model name is required' };
    }

    const trimmed = name.trim();
    
    if (trimmed.length === 0) {
      return { valid: false, error: 'Model name cannot be empty' };
    }

    if (trimmed.length > this.MAX_NAME_LENGTH) {
      return { valid: false, error: `Model name cannot exceed ${this.MAX_NAME_LENGTH} characters` };
    }

    return { valid: true, name: trimmed };
  }

  /**
   * Generate unique model ID
   * @returns {string} - UUID
   */
  generateModelId() {
    return `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save a model to storage
   * @param {string} modelId - Unique model ID (or null to generate)
   * @param {string} modelName - User-editable model name
   * @param {Blob|ArrayBuffer} bpmxData - BPMX binary data
   * @param {Object} metadata - Additional metadata
   * @param {boolean} setAsDefault - Whether to set this as the default model
   * @returns {Promise<string>} - Model ID
   */
  async saveModel(modelId, modelName, bpmxData, metadata = {}, setAsDefault = false) {
    try {
      const nameValidation = this.validateModelName(modelName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }

      if (!modelId) {
        modelId = this.generateModelId();
      }

      let modelBlob;
      if (bpmxData instanceof ArrayBuffer) {
        modelBlob = new Blob([bpmxData], { type: 'application/octet-stream' });
      } else if (bpmxData instanceof Blob) {
        modelBlob = bpmxData;
      } else {
        throw new Error('Invalid model data format. Expected Blob or ArrayBuffer.');
      }

      if (setAsDefault) {
        await this.clearAllDefaults();
      }

      const modelData = {
        name: nameValidation.name,
        modelData: modelBlob,
        isDefault: setAsDefault,
        metadata: {
          originalFileName: metadata.originalFileName || 'unknown.pmx',
          uploadedAt: Date.now(),
          fileSize: modelBlob.size,
          conversionInfo: metadata.conversionInfo || {},
          ...metadata
        }
      };

      await storageServiceProxy.fileSave(modelId, modelData, this.CATEGORY);

      Logger.log('ModelStorage', `Model saved: ${modelId} (${nameValidation.name})`);
      
      return modelId;
    } catch (error) {
      Logger.error('ModelStorage', 'Failed to save model:', error);
      throw error;
    }
  }

  /**
   * Get a model by ID
   * @param {string} modelId - Model ID
   * @returns {Promise<Object|null>} - Model data or null
   */
  async getModel(modelId) {
    try {
      const modelData = await storageServiceProxy.fileLoad(modelId);
      return modelData || null;
    } catch (error) {
      Logger.error('ModelStorage', `Failed to get model ${modelId}:`, error);
      return null;
    }
  }

  /**
   * Get models list (lightweight, no blob data)
   * Returns only IDs, isDefault flag, and metadata for fast listing
   * Fetches only metadata from database level, not blob data
   * @returns {Promise<Array>} - Array of model info without blob data
   */
  async getModelsList() {
    try {
      const modelsMetadata = await storageServiceProxy.filesGetMetadataByCategory(this.CATEGORY);
      
      const modelsList = Object.entries(modelsMetadata).map(([id, data]) => ({
        id,
        name: data.value?.name || 'Unknown Model',
        isDefault: data.value?.isDefault || false,
        metadata: data.value?.metadata || {
          originalFileName: 'unknown.pmx',
          uploadedAt: 0,
          fileSize: 0
        },
      }));

      Logger.log('ModelStorage', `Retrieved ${modelsList.length} models (metadata only)`);
      return modelsList;
    } catch (error) {
      Logger.error('ModelStorage', 'Failed to get models list:', error);
      return [];
    }
  }

  /**
   * Get all models (including full blob data)
   * Only use when you need the actual model data
   * @returns {Promise<Array>} - Array of complete model objects
   */
  async getAllModels() {
    try {
      const allModels = await storageServiceProxy.filesGetByCategory(this.CATEGORY);
      
      const modelsArray = Object.entries(allModels).map(([id, data]) => ({
        id,
        ...data
      }));

      return modelsArray;
    } catch (error) {
      Logger.error('ModelStorage', 'Failed to get all models:', error);
      return [];
    }
  }

  /**
   * Get the default model
   * @returns {Promise<Object|null>} - Default model with ID or null
   */
  async getDefaultModel() {
    try {
      const allModels = await this.getAllModels();
      const defaultModel = allModels.find(model => model.isDefault === true);
      return defaultModel || null;
    } catch (error) {
      Logger.error('ModelStorage', 'Failed to get default model:', error);
      return null;
    }
  }

  /**
   * Set a model as default
   * @param {string} modelId - Model ID to set as default
   * @returns {Promise<boolean>} - Success status
   */
  async setDefaultModel(modelId) {
    try {
      await this.clearAllDefaults();

      const model = await this.getModel(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      model.isDefault = true;

      await storageServiceProxy.fileSave(modelId, model, this.CATEGORY);

      Logger.log('ModelStorage', `Model ${modelId} set as default`);
      return true;
    } catch (error) {
      Logger.error('ModelStorage', 'Failed to set default model:', error);
      throw error;
    }
  }

  /**
   * Clear default flag from all models
   * @private
   * @returns {Promise<void>}
   */
  async clearAllDefaults() {
    try {
      const allModels = await this.getAllModels();
      
      for (const model of allModels) {
        if (model.isDefault) {
          model.isDefault = false;
          await storageServiceProxy.fileSave(model.id, model, this.CATEGORY);
        }
      }

      Logger.log('ModelStorage', 'Cleared all default flags');
    } catch (error) {
      Logger.error('ModelStorage', 'Failed to clear defaults:', error);
      throw error;
    }
  }

  /**
   * Update model name
   * @param {string} modelId - Model ID
   * @param {string} newName - New model name
   * @returns {Promise<boolean>} - Success status
   */
  async updateModelName(modelId, newName) {
    try {
      const nameValidation = this.validateModelName(newName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }

      const model = await this.getModel(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      model.name = nameValidation.name;

      if (!model.metadata) {
        model.metadata = {};
      }
      model.metadata.lastRenamed = Date.now();

      await storageServiceProxy.fileSave(modelId, model, this.CATEGORY);

      Logger.log('ModelStorage', `Model ${modelId} renamed to: ${nameValidation.name}`);
      return true;
    } catch (error) {
      Logger.error('ModelStorage', 'Failed to update model name:', error);
      throw error;
    }
  }

  /**
   * Update model metadata
   * @param {string} modelId - Model ID
   * @param {Object} metadataUpdates - Metadata fields to update
   * @returns {Promise<boolean>} - Success status
   */
  async updateModelMetadata(modelId, metadataUpdates) {
    try {
      if (modelId === 'builtin_default_model') {
        const existingMetadata = await this.getBuiltinModelMetadata();
        
        const updatedMetadata = {
          ...existingMetadata,
          ...metadataUpdates
        };
        
        await storageServiceProxy.fileSave('builtin_default_model_metadata', updatedMetadata, this.CATEGORY);
        
        Logger.log('ModelStorage', 'Built-in model metadata updated:', metadataUpdates);
        return true;
      }
      
      const model = await this.getModel(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      if (!model.metadata) {
        model.metadata = {};
      }

      Object.assign(model.metadata, metadataUpdates);

      await storageServiceProxy.fileSave(modelId, model, this.CATEGORY);

      Logger.log('ModelStorage', `Model ${modelId} metadata updated:`, metadataUpdates);
      return true;
    } catch (error) {
      Logger.error('ModelStorage', 'Failed to update model metadata:', error);
      throw error;
    }
  }

  /**
   * Get metadata for built-in default model
   * @returns {Promise<Object>} - Metadata object
   */
  async getBuiltinModelMetadata() {
    try {
      const metadata = await storageServiceProxy.fileLoad('builtin_default_model_metadata', this.CATEGORY);
      return metadata || { textures: [], meshParts: [] };
    } catch {
      Logger.log('ModelStorage', 'No metadata found for built-in model, returning empty');
      return { textures: [], meshParts: [] };
    }
  }

  /**
   * Delete a model
   * @param {string} modelId - Model ID
   * @param {boolean} force - Force delete even if default (requires manual confirmation)
   * @returns {Promise<boolean>} - Success status
   */
  async deleteModel(modelId, force = false) {
    try {
      const model = await this.getModel(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      if (model.isDefault && !force) {
        throw new Error('Cannot delete default model. Please set another model as default first.');
      }

      await storageServiceProxy.fileRemove(modelId);

      if (model.blobURL) {
        URL.revokeObjectURL(model.blobURL);
      }

      Logger.log('ModelStorage', `Model ${modelId} deleted`);
      return true;
    } catch (error) {
      Logger.error('ModelStorage', 'Failed to delete model:', error);
      throw error;
    }
  }

  /**
   * Check if a model exists
   * @param {string} modelId - Model ID
   * @returns {Promise<boolean>} - Exists status
   */
  async modelExists(modelId) {
    try {
      return await storageServiceProxy.fileExists(modelId);
    } catch (error) {
      Logger.error('ModelStorage', `Failed to check if model ${modelId} exists:`, error);
      return false;
    }
  }

  /**
   * Get total storage size for all models
   * @returns {Promise<number>} - Total size in bytes
   */
  async getTotalStorageSize() {
    try {
      const allModels = await this.getAllModels();
      let totalSize = 0;

      for (const model of allModels) {
        if (model.metadata && model.metadata.fileSize) {
          totalSize += model.metadata.fileSize;
        }
      }

      return totalSize;
    } catch (error) {
      Logger.error('ModelStorage', 'Failed to calculate total storage size:', error);
      return 0;
    }
  }
}

export const modelStorageService = new ModelStorageService();

export default modelStorageService;
