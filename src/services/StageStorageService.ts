/**
 * Stage Storage Service
 * Handles storage and management of MMD stage models (PMX format)
 */

import storageServiceProxy from "./proxies/StorageServiceProxy";
import Logger from "./LoggerService";

type UnknownRecord = Record<string, unknown>;

interface StageMetadata extends UnknownRecord {
  originalFileName: string;
  uploadedAt: number;
  fileSize: number;
  conversionInfo: UnknownRecord;
  lastRenamed?: number;
}

interface StoredStage extends UnknownRecord {
  name: string;
  stageData?: Blob;
  isDefault: boolean;
  metadata: StageMetadata;
}

interface NameValidationResult {
  valid: boolean;
  error?: string;
  name?: string;
}

type StageListItem = {
  id: string;
  name: string;
  isDefault: boolean;
  metadata: StageMetadata;
};

type StageWithId = StoredStage & { id: string };

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const getDefaultMetadata = (): StageMetadata => ({
  originalFileName: "unknown.pmx",
  uploadedAt: 0,
  fileSize: 0,
  conversionInfo: {},
});

const normalizeStageMetadata = (value: unknown): StageMetadata => {
  if (!isRecord(value)) {
    return getDefaultMetadata();
  }

  return {
    ...value,
    originalFileName:
      typeof value.originalFileName === "string"
        ? value.originalFileName
        : "unknown.pmx",
    uploadedAt: typeof value.uploadedAt === "number" ? value.uploadedAt : 0,
    fileSize: typeof value.fileSize === "number" ? value.fileSize : 0,
    conversionInfo: isRecord(value.conversionInfo) ? value.conversionInfo : {},
  } as StageMetadata;
};

const normalizeStage = (value: unknown): StoredStage | null => {
  if (!isRecord(value)) {
    return null;
  }

  const normalized: StoredStage = {
    ...value,
    name: typeof value.name === "string" ? value.name : "Unknown Stage",
    isDefault: value.isDefault === true,
    metadata: normalizeStageMetadata(value.metadata),
  };

  if (value.stageData instanceof Blob) {
    normalized.stageData = value.stageData;
  }

  return normalized;
};

class StageStorageService {
  private readonly CATEGORY: string;
  private readonly MAX_NAME_LENGTH: number;

  constructor() {
    this.CATEGORY = "stage";
    this.MAX_NAME_LENGTH = 50;
  }

  /**
   * Validate stage name
   * @param {string} name - Stage name to validate
   * @returns {Object} - { valid: boolean, error: string }
   */
  validateStageName(name: string): NameValidationResult {
    if (!name || typeof name !== "string") {
      return { valid: false, error: "Stage name is required" };
    }

    const trimmed = name.trim();

    if (trimmed.length === 0) {
      return { valid: false, error: "Stage name cannot be empty" };
    }

    if (trimmed.length > this.MAX_NAME_LENGTH) {
      return {
        valid: false,
        error: `Stage name cannot exceed ${this.MAX_NAME_LENGTH} characters`,
      };
    }

    return { valid: true, name: trimmed };
  }

  /**
   * Generate unique stage ID
   * @returns {string} - UUID
   */
  generateStageId(): string {
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
  async saveStage(
    stageId: string | null | undefined,
    stageName: string,
    bpmxData: Blob | ArrayBuffer,
    metadata: UnknownRecord = {},
    setAsDefault = false,
  ): Promise<string> {
    try {
      const nameValidation = this.validateStageName(stageName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }
      const validatedName = nameValidation.name ?? stageName.trim();

      if (!stageId) {
        stageId = this.generateStageId();
      }

      let stageBlob;
      if (bpmxData instanceof ArrayBuffer) {
        stageBlob = new Blob([bpmxData], { type: "application/octet-stream" });
      } else if (bpmxData instanceof Blob) {
        stageBlob = bpmxData;
      } else {
        throw new Error(
          "Invalid stage data format. Expected Blob or ArrayBuffer.",
        );
      }

      if (setAsDefault) {
        await this.clearAllDefaults();
      }

      const stageData: StoredStage = {
        name: validatedName,
        stageData: stageBlob,
        isDefault: setAsDefault,
        metadata: {
          originalFileName:
            typeof metadata.originalFileName === "string"
              ? metadata.originalFileName
              : "unknown.pmx",
          uploadedAt: Date.now(),
          fileSize: stageBlob.size,
          conversionInfo: isRecord(metadata.conversionInfo)
            ? metadata.conversionInfo
            : {},
          ...metadata,
        },
      };

      await storageServiceProxy.fileSave(stageId, stageData, this.CATEGORY);

      Logger.log("StageStorage", `Stage saved: ${stageId} (${validatedName})`);

      return stageId;
    } catch (error) {
      Logger.error("StageStorage", "Failed to save stage:", error);
      throw error;
    }
  }

  /**
   * Get a stage by ID
   * @param {string} stageId - Stage ID
   * @returns {Promise<Object|null>} - Stage data or null
   */
  async getStage(stageId: string): Promise<StoredStage | null> {
    try {
      const stageData = await storageServiceProxy.fileLoad(stageId);
      return normalizeStage(stageData);
    } catch (error) {
      Logger.error("StageStorage", `Failed to get stage ${stageId}:`, error);
      return null;
    }
  }

  /**
   * Get stages list (lightweight, no blob data)
   * Returns only IDs, isDefault flag, and metadata for fast listing
   * @returns {Promise<Array>} - Array of stage info without blob data
   */
  async getStagesList(): Promise<StageListItem[]> {
    try {
      const stagesMetadata =
        await storageServiceProxy.filesGetMetadataByCategory(this.CATEGORY);
      const metadataRecord = isRecord(stagesMetadata) ? stagesMetadata : {};

      const stagesList = Object.entries(metadataRecord).map(
        ([id, data]): StageListItem => {
          const entry =
            isRecord(data) && isRecord(data.value) ? data.value : {};
          return {
            id,
            name: typeof entry.name === "string" ? entry.name : "Unknown Stage",
            isDefault: entry.isDefault === true,
            metadata: normalizeStageMetadata(entry.metadata),
          };
        },
      );

      Logger.log(
        "StageStorage",
        `Retrieved ${stagesList.length} stages (metadata only)`,
      );
      return stagesList;
    } catch (error) {
      Logger.error("StageStorage", "Failed to get stages list:", error);
      return [];
    }
  }

  /**
   * Get all stages (including full blob data)
   * Only use when you need the actual stage data
   * @returns {Promise<Array>} - Array of complete stage objects
   */
  async getAllStages(): Promise<StageWithId[]> {
    try {
      const allStages = await storageServiceProxy.filesGetByCategory(
        this.CATEGORY,
      );
      const allStageRecords = isRecord(allStages) ? allStages : {};

      const stagesArray = Object.entries(allStageRecords)
        .map(([id, data]) => {
          const normalized = normalizeStage(data);
          if (!normalized) {
            return null;
          }
          return { id, ...normalized };
        })
        .filter((stage): stage is StageWithId => stage !== null);

      return stagesArray;
    } catch (error) {
      Logger.error("StageStorage", "Failed to get all stages:", error);
      return [];
    }
  }

  /**
   * Get the default stage
   * @returns {Promise<Object|null>} - Default stage with ID or null
   */
  async getDefaultStage(): Promise<StageWithId | null> {
    try {
      const allStages = await this.getAllStages();
      const defaultStage = allStages.find((stage) => stage.isDefault === true);
      return defaultStage || null;
    } catch (error) {
      Logger.error("StageStorage", "Failed to get default stage:", error);
      return null;
    }
  }

  /**
   * Set a stage as default
   * @param {string} stageId - Stage ID to set as default
   * @returns {Promise<boolean>} - Success status
   */
  async setDefaultStage(stageId: string): Promise<boolean> {
    try {
      await this.clearAllDefaults();

      const stage = await this.getStage(stageId);
      if (!stage) {
        throw new Error(`Stage ${stageId} not found`);
      }

      stage.isDefault = true;

      await storageServiceProxy.fileSave(stageId, stage, this.CATEGORY);

      Logger.log("StageStorage", `Stage ${stageId} set as default`);
      return true;
    } catch (error) {
      Logger.error("StageStorage", "Failed to set default stage:", error);
      throw error;
    }
  }

  /**
   * Clear default flag from all stages
   * @private
   * @returns {Promise<void>}
   */
  async clearAllDefaults(): Promise<void> {
    try {
      const allStages = await this.getAllStages();

      for (const stage of allStages) {
        if (stage.isDefault) {
          stage.isDefault = false;
          await storageServiceProxy.fileSave(stage.id, stage, this.CATEGORY);
        }
      }

      Logger.log("StageStorage", "Cleared all default flags");
    } catch (error) {
      Logger.error("StageStorage", "Failed to clear defaults:", error);
      throw error;
    }
  }

  /**
   * Update stage name
   * @param {string} stageId - Stage ID
   * @param {string} newName - New stage name
   * @returns {Promise<boolean>} - Success status
   */
  async updateStageName(stageId: string, newName: string): Promise<boolean> {
    try {
      const nameValidation = this.validateStageName(newName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }
      const validatedName = nameValidation.name ?? newName.trim();

      const stage = await this.getStage(stageId);
      if (!stage) {
        throw new Error(`Stage ${stageId} not found`);
      }

      stage.name = validatedName;

      if (!stage.metadata) {
        stage.metadata = getDefaultMetadata();
      }
      stage.metadata.lastRenamed = Date.now();

      await storageServiceProxy.fileSave(stageId, stage, this.CATEGORY);

      Logger.log(
        "StageStorage",
        `Stage ${stageId} renamed to: ${validatedName}`,
      );
      return true;
    } catch (error) {
      Logger.error("StageStorage", "Failed to update stage name:", error);
      throw error;
    }
  }

  /**
   * Update stage metadata
   * @param {string} stageId - Stage ID
   * @param {Object} metadataUpdates - Metadata fields to update
   * @returns {Promise<boolean>} - Success status
   */
  async updateStageMetadata(
    stageId: string,
    metadataUpdates: UnknownRecord,
  ): Promise<boolean> {
    try {
      const stage = await this.getStage(stageId);
      if (!stage) {
        throw new Error(`Stage ${stageId} not found`);
      }

      if (!stage.metadata) {
        stage.metadata = getDefaultMetadata();
      }

      Object.assign(stage.metadata, metadataUpdates);

      await storageServiceProxy.fileSave(stageId, stage, this.CATEGORY);

      Logger.log("StageStorage", `Stage ${stageId} metadata updated`);
      return true;
    } catch (error) {
      Logger.error("StageStorage", "Failed to update stage metadata:", error);
      throw error;
    }
  }

  /**
   * Delete a stage
   * @param {string} stageId - Stage ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteStage(stageId: string): Promise<boolean> {
    try {
      await storageServiceProxy.fileRemove(stageId);
      Logger.log("StageStorage", `Stage ${stageId} deleted`);
      return true;
    } catch (error) {
      Logger.error("StageStorage", "Failed to delete stage:", error);
      throw error;
    }
  }
}

// Create singleton instance
export const stageStorageService = new StageStorageService();

export default stageStorageService;
