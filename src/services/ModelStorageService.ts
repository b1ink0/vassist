/**
 * Model Storage Service
 */

import storageServiceProxy from './proxies/StorageServiceProxy';
import Logger from './LoggerService';

type UnknownRecord = Record<string, unknown>;

interface ModelMetadata extends UnknownRecord {
  originalFileName: string;
  uploadedAt: number;
  fileSize: number;
  conversionInfo: UnknownRecord;
  lastRenamed?: number;
}

interface StoredModel extends UnknownRecord {
  name: string;
  modelData?: Blob;
  isDefault: boolean;
  metadata: ModelMetadata;
  blobURL?: string;
}

interface NameValidationResult {
  valid: boolean;
  error?: string;
  name?: string;
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null;

const getDefaultMetadata = (): ModelMetadata => ({
  originalFileName: 'unknown.pmx',
  uploadedAt: 0,
  fileSize: 0,
  conversionInfo: {},
});

const normalizeModelMetadata = (value: unknown): ModelMetadata => {
  if (!isRecord(value)) {
    return getDefaultMetadata();
  }

  const originalFileName = typeof value.originalFileName === 'string' ? value.originalFileName : 'unknown.pmx';
  const uploadedAt = typeof value.uploadedAt === 'number' ? value.uploadedAt : 0;
  const fileSize = typeof value.fileSize === 'number' ? value.fileSize : 0;
  const conversionInfo = isRecord(value.conversionInfo) ? value.conversionInfo : {};

  return {
    ...value,
    originalFileName,
    uploadedAt,
    fileSize,
    conversionInfo,
  } as ModelMetadata;
};

const normalizeStoredModel = (value: unknown): StoredModel | null => {
  if (!isRecord(value)) {
    return null;
  }

  const name = typeof value.name === 'string' ? value.name : 'Unknown Model';
  const isDefault = value.isDefault === true;
  const metadata = normalizeModelMetadata(value.metadata);
  const normalized: StoredModel = {
    ...value,
    name,
    isDefault,
    metadata,
  };

  if (value.modelData instanceof Blob) {
    normalized.modelData = value.modelData;
  }
  if (typeof value.blobURL === 'string') {
    normalized.blobURL = value.blobURL;
  }

  return normalized;
};

type ModelListItem = {
  id: string;
  name: string;
  isDefault: boolean;
  metadata: ModelMetadata;
};

type ModelWithId = StoredModel & { id: string };

class ModelStorageService {
  private readonly CATEGORY: string;
  private readonly MAX_NAME_LENGTH: number;

  constructor() {
    this.CATEGORY = 'model';
    this.MAX_NAME_LENGTH = 50;
  }

  /**
   * Validate model name
   * @param {string} name - Model name to validate
   * @returns {Object} - { valid: boolean, error: string }
   */
  validateModelName(name: string): NameValidationResult {
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
  async saveModel(
    modelId: string | null | undefined,
    modelName: string,
    bpmxData: Blob | ArrayBuffer,
    metadata: UnknownRecord = {},
    setAsDefault = false,
  ): Promise<string> {
    try {
      const nameValidation = this.validateModelName(modelName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }
      const validatedName = nameValidation.name ?? modelName.trim();

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

      const modelData: StoredModel = {
        name: validatedName,
        modelData: modelBlob,
        isDefault: setAsDefault,
        metadata: {
          originalFileName: typeof metadata.originalFileName === 'string' ? metadata.originalFileName : 'unknown.pmx',
          uploadedAt: Date.now(),
          fileSize: modelBlob.size,
          conversionInfo: isRecord(metadata.conversionInfo) ? metadata.conversionInfo : {},
          ...metadata
        }
      };

      await storageServiceProxy.fileSave(modelId, modelData, this.CATEGORY);

      Logger.log('ModelStorage', `Model saved: ${modelId} (${validatedName})`);
      
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
  async getModel(modelId: string): Promise<StoredModel | null> {
    try {
      const modelData = await storageServiceProxy.fileLoad(modelId);
      return normalizeStoredModel(modelData);
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
  async getModelsList(): Promise<ModelListItem[]> {
    try {
      const modelsMetadata = await storageServiceProxy.filesGetMetadataByCategory(this.CATEGORY);
      const metadataRecord = isRecord(modelsMetadata) ? modelsMetadata : {};
      
      const modelsList = Object.entries(metadataRecord).map(([id, data]): ModelListItem => {
        const entry = isRecord(data) && isRecord(data.value) ? data.value : {};
        return {
          id,
          name: typeof entry.name === 'string' ? entry.name : 'Unknown Model',
          isDefault: entry.isDefault === true,
          metadata: normalizeModelMetadata(entry.metadata),
        };
      });

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
  async getAllModels(): Promise<ModelWithId[]> {
    try {
      const allModels = await storageServiceProxy.filesGetByCategory(this.CATEGORY);
      const allModelsRecord = isRecord(allModels) ? allModels : {};
      
      const modelsArray = Object.entries(allModelsRecord)
        .map(([id, data]) => {
          const normalized = normalizeStoredModel(data);
          if (!normalized) {
            return null;
          }
          return {
            id,
            ...normalized,
          };
        })
        .filter((model): model is ModelWithId => model !== null);

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
  async getDefaultModel(): Promise<ModelWithId | null> {
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
  async setDefaultModel(modelId: string): Promise<boolean> {
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
  async clearAllDefaults(): Promise<void> {
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
  async updateModelName(modelId: string, newName: string): Promise<boolean> {
    try {
      const nameValidation = this.validateModelName(newName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }
      const validatedName = nameValidation.name ?? newName.trim();

      const model = await this.getModel(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      model.name = validatedName;

      if (!model.metadata) {
        model.metadata = getDefaultMetadata();
      }
      model.metadata.lastRenamed = Date.now();

      await storageServiceProxy.fileSave(modelId, model, this.CATEGORY);

      Logger.log('ModelStorage', `Model ${modelId} renamed to: ${validatedName}`);
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
  async updateModelMetadata(modelId: string, metadataUpdates: UnknownRecord): Promise<boolean> {
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
        model.metadata = getDefaultMetadata();
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
  async getBuiltinModelMetadata(): Promise<UnknownRecord> {
    try {
      const metadata = await storageServiceProxy.fileLoad('builtin_default_model_metadata');
      return isRecord(metadata) ? metadata : { textures: [], meshParts: [] };
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
  async deleteModel(modelId: string, force = false): Promise<boolean> {
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
  async modelExists(modelId: string): Promise<boolean> {
    try {
      const exists = await storageServiceProxy.fileExists(modelId);
      return exists === true;
    } catch (error) {
      Logger.error('ModelStorage', `Failed to check if model ${modelId} exists:`, error);
      return false;
    }
  }

  /**
   * Get total storage size for all models
   * @returns {Promise<number>} - Total size in bytes
   */
  async getTotalStorageSize(): Promise<number> {
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
