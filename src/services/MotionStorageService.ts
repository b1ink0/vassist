/**
 * Motion Storage Service
 */

import storageServiceProxy from "./proxies/StorageServiceProxy";
import Logger from "./LoggerService";

type UnknownRecord = Record<string, unknown>;

interface MotionMetadata extends UnknownRecord {
  originalFileName: string;
  uploadedAt: number;
  fileSize: number;
  conversionInfo: UnknownRecord;
  lastRenamed?: number;
  lastToggled?: number;
}

interface StoredMotion extends UnknownRecord {
  name: string;
  motionData?: Blob;
  animationCategories: string[];
  enabledByCategory: Record<string, boolean>;
  animationCategory?: string;
  isEnabled?: boolean;
  metadata: MotionMetadata;
  blobURL?: string;
}

type MotionWithId = StoredMotion & { id: string };

interface NameValidationResult {
  valid: boolean;
  error?: string;
  name?: string;
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const getDefaultMetadata = (): MotionMetadata => ({
  originalFileName: "unknown.vmd",
  uploadedAt: 0,
  fileSize: 0,
  conversionInfo: {},
});

const normalizeMotionMetadata = (value: unknown): MotionMetadata => {
  if (!isRecord(value)) {
    return getDefaultMetadata();
  }

  const originalFileName =
    typeof value.originalFileName === "string"
      ? value.originalFileName
      : "unknown.vmd";
  const uploadedAt =
    typeof value.uploadedAt === "number" ? value.uploadedAt : 0;
  const fileSize = typeof value.fileSize === "number" ? value.fileSize : 0;
  const conversionInfo = isRecord(value.conversionInfo)
    ? value.conversionInfo
    : {};

  return {
    ...value,
    originalFileName,
    uploadedAt,
    fileSize,
    conversionInfo,
  } as MotionMetadata;
};

const normalizeEnabledByCategory = (
  value: unknown,
): Record<string, boolean> => {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, boolean> = {};
  Object.entries(value).forEach(([key, state]) => {
    result[key] = state === true;
  });
  return result;
};

const normalizeAnimationCategories = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
};

const normalizeStoredMotion = (value: unknown): StoredMotion | null => {
  if (!isRecord(value)) {
    return null;
  }

  const animationCategories = normalizeAnimationCategories(
    value.animationCategories,
  );
  const enabledByCategory = normalizeEnabledByCategory(value.enabledByCategory);
  const normalized: StoredMotion = {
    ...value,
    name: typeof value.name === "string" ? value.name : "Unknown Motion",
    animationCategories,
    enabledByCategory,
    metadata: normalizeMotionMetadata(value.metadata),
  };

  if (typeof value.animationCategory === "string") {
    normalized.animationCategory = value.animationCategory;
  }
  if (typeof value.isEnabled === "boolean") {
    normalized.isEnabled = value.isEnabled;
  }
  if (value.motionData instanceof Blob) {
    normalized.motionData = value.motionData;
  }
  if (typeof value.blobURL === "string") {
    normalized.blobURL = value.blobURL;
  }

  return normalized;
};

class MotionStorageService {
  private readonly CATEGORY: string;
  private readonly MAX_NAME_LENGTH: number;

  constructor() {
    this.CATEGORY = "motion";
    this.MAX_NAME_LENGTH = 50;
  }

  /**
   * Validate motion name
   * @param {string} name - Motion name to validate
   * @returns {Object} - { valid: boolean, error: string, name: string }
   */
  validateMotionName(name: string): NameValidationResult {
    if (!name || typeof name !== "string") {
      return { valid: false, error: "Motion name is required" };
    }

    const trimmed = name.trim();

    if (trimmed.length === 0) {
      return { valid: false, error: "Motion name cannot be empty" };
    }

    if (trimmed.length > this.MAX_NAME_LENGTH) {
      return {
        valid: false,
        error: `Motion name cannot exceed ${this.MAX_NAME_LENGTH} characters`,
      };
    }

    return { valid: true, name: trimmed };
  }

  /**
   * Generate unique motion ID
   * @returns {string} - UUID
   */
  generateMotionId(): string {
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
  async saveMotion(
    motionId: string | null | undefined,
    motionName: string,
    bvmdData: Blob | ArrayBuffer,
    animationCategories: string[] = [],
    metadata: UnknownRecord = {},
    enabledByCategory: Record<string, boolean> = {},
  ): Promise<string> {
    try {
      const nameValidation = this.validateMotionName(motionName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }
      const validatedName = nameValidation.name ?? motionName.trim();

      if (!motionId) {
        motionId = this.generateMotionId();
      }

      let motionBlob;
      if (bvmdData instanceof ArrayBuffer) {
        motionBlob = new Blob([bvmdData], { type: "application/octet-stream" });
      } else if (bvmdData instanceof Blob) {
        motionBlob = bvmdData;
      } else {
        throw new Error(
          "Invalid motion data format. Expected Blob or ArrayBuffer.",
        );
      }

      const motionData: StoredMotion = {
        name: validatedName,
        motionData: motionBlob,
        animationCategories,
        enabledByCategory,
        metadata: {
          originalFileName:
            typeof metadata.originalFileName === "string"
              ? metadata.originalFileName
              : "unknown.vmd",
          uploadedAt: Date.now(),
          fileSize: motionBlob.size,
          conversionInfo: isRecord(metadata.conversionInfo)
            ? metadata.conversionInfo
            : {},
          ...metadata,
        },
      };

      await storageServiceProxy.fileSave(motionId, motionData, this.CATEGORY);

      Logger.log(
        "MotionStorage",
        `Motion saved: ${motionId} (${validatedName}) - Categories: ${animationCategories.join(", ")}`,
      );

      return motionId;
    } catch (error) {
      Logger.error("MotionStorage", "Failed to save motion:", error);
      throw error;
    }
  }

  /**
   * Get a motion by ID
   * @param {string} motionId - Motion ID
   * @returns {Promise<Object|null>} - Motion data or null
   */
  async getMotion(motionId: string): Promise<StoredMotion | null> {
    try {
      const motionData = await storageServiceProxy.fileLoad(motionId);
      return normalizeStoredMotion(motionData);
    } catch (error) {
      Logger.error("MotionStorage", `Failed to get motion ${motionId}:`, error);
      return null;
    }
  }

  /**
   * Get all motions (including full blob data)
   * Only use when you need the actual motion data
   * @returns {Promise<Array>} - Array of complete motion objects
   */
  async getAllMotions(): Promise<MotionWithId[]> {
    try {
      const allMotions = await storageServiceProxy.filesGetByCategory(
        this.CATEGORY,
      );
      const motionRecords = isRecord(allMotions) ? allMotions : {};

      const motionsArray = Object.entries(motionRecords)
        .map(([id, data]) => {
          const normalized = normalizeStoredMotion(data);
          if (!normalized) {
            return null;
          }
          return {
            id,
            ...normalized,
          };
        })
        .filter((motion): motion is MotionWithId => motion !== null);

      return motionsArray;
    } catch (error) {
      Logger.error("MotionStorage", "Failed to get all motions:", error);
      return [];
    }
  }

  /**
   * Get motions list (lightweight, no blob data)
   * Returns only IDs, categories, enabled state per category, and metadata for fast listing
   * Fetches only metadata from database level, not blob data
   * @returns {Promise<Array>} - Array of motion info without blob data
   */
  async getMotionsList(): Promise<
    Array<{
      id: string;
      name: string;
      animationCategories: string[];
      enabledByCategory: Record<string, boolean>;
      metadata: MotionMetadata;
    }>
  > {
    try {
      const motionsMetadata =
        await storageServiceProxy.filesGetMetadataByCategory(this.CATEGORY);
      const metadataRecords = isRecord(motionsMetadata) ? motionsMetadata : {};

      const motionsList = Object.entries(metadataRecords).map(([id, data]) => {
        const entry = isRecord(data) && isRecord(data.value) ? data.value : {};
        return {
          id,
          name: typeof entry.name === "string" ? entry.name : "Unknown Motion",
          animationCategories: normalizeAnimationCategories(
            entry.animationCategories,
          ),
          enabledByCategory: normalizeEnabledByCategory(
            entry.enabledByCategory,
          ),
          metadata: normalizeMotionMetadata(entry.metadata),
        };
      });

      Logger.log(
        "MotionStorage",
        `Retrieved ${motionsList.length} motions (metadata only)`,
      );
      return motionsList;
    } catch (error) {
      Logger.error("MotionStorage", "Failed to get motions list:", error);
      return [];
    }
  }

  /**
   * Get motions by animation category
   * @param {string} animCategory - Animation category (idle, thinking, etc.)
   * @returns {Promise<Array>} - Array of motions in category
   */
  async getMotionsByCategory(animCategory: string): Promise<MotionWithId[]> {
    try {
      const allMotions = await this.getAllMotions();
      const categoryMotions = allMotions.filter(
        (motion) =>
          motion.animationCategories &&
          motion.animationCategories.includes(animCategory),
      );

      Logger.log(
        "MotionStorage",
        `Retrieved ${categoryMotions.length} motions for category: ${animCategory}`,
      );
      return categoryMotions;
    } catch (error) {
      Logger.error(
        "MotionStorage",
        `Failed to get motions for category ${animCategory}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Update motion name
   * @param {string} motionId - Motion ID
   * @param {string} newName - New motion name
   * @returns {Promise<boolean>} - Success status
   */
  async updateMotionName(motionId: string, newName: string): Promise<boolean> {
    try {
      const nameValidation = this.validateMotionName(newName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }
      const validatedName = nameValidation.name ?? newName.trim();

      const motion = await this.getMotion(motionId);
      if (!motion) {
        throw new Error(`Motion ${motionId} not found`);
      }

      motion.name = validatedName;

      if (!motion.metadata) {
        motion.metadata = getDefaultMetadata();
      }
      motion.metadata.lastRenamed = Date.now();

      await storageServiceProxy.fileSave(motionId, motion, this.CATEGORY);

      Logger.log(
        "MotionStorage",
        `Motion ${motionId} renamed to: ${validatedName}`,
      );
      return true;
    } catch (error) {
      Logger.error("MotionStorage", "Failed to update motion name:", error);
      throw error;
    }
  }

  /**
   * Update motion metadata
   * @param {string} motionId - Motion ID
   * @param {Object} metadataUpdates - Metadata or top-level fields to update
   * @returns {Promise<boolean>} - Success status
   */
  async updateMotionMetadata(
    motionId: string,
    metadataUpdates: UnknownRecord,
  ): Promise<boolean> {
    try {
      const motion = await this.getMotion(motionId);
      if (!motion) {
        throw new Error(`Motion ${motionId} not found`);
      }

      Object.keys(metadataUpdates).forEach((key) => {
        if (
          key === "animationCategory" ||
          key === "animationCategories" ||
          key === "enabledByCategory" ||
          key === "isEnabled" ||
          key === "name"
        ) {
          if (key === "animationCategories") {
            motion.animationCategories = normalizeAnimationCategories(
              metadataUpdates[key],
            );
          } else if (key === "enabledByCategory") {
            motion.enabledByCategory = normalizeEnabledByCategory(
              metadataUpdates[key],
            );
          } else if (
            key === "animationCategory" &&
            typeof metadataUpdates[key] === "string"
          ) {
            motion.animationCategory = metadataUpdates[key] as string;
          } else if (
            key === "isEnabled" &&
            typeof metadataUpdates[key] === "boolean"
          ) {
            motion.isEnabled = metadataUpdates[key] as boolean;
          } else if (
            key === "name" &&
            typeof metadataUpdates[key] === "string"
          ) {
            motion.name = metadataUpdates[key] as string;
          }
        } else {
          if (!motion.metadata) {
            motion.metadata = getDefaultMetadata();
          }
          motion.metadata[key] = metadataUpdates[key];
        }
      });

      await storageServiceProxy.fileSave(motionId, motion, this.CATEGORY);

      Logger.log(
        "MotionStorage",
        `Motion ${motionId} metadata updated:`,
        metadataUpdates,
      );
      return true;
    } catch (error) {
      Logger.error("MotionStorage", "Failed to update motion metadata:", error);
      throw error;
    }
  }

  /**
   * Toggle motion enabled state
   * @param {string} motionId - Motion ID
   * @param {boolean} enabled - Enabled state
   * @returns {Promise<boolean>} - Success status
   */
  async toggleMotionEnabled(
    motionId: string,
    enabled: boolean,
  ): Promise<boolean> {
    try {
      const motion = await this.getMotion(motionId);
      if (!motion) {
        throw new Error(`Motion ${motionId} not found`);
      }

      if (!enabled) {
        const motionCategory =
          motion.animationCategory ?? motion.animationCategories[0];
        if (motionCategory) {
          const categoryMotions =
            await this.getMotionsByCategory(motionCategory);
          const enabledMotions = categoryMotions.filter((m) => m.isEnabled);

          if (
            enabledMotions.length === 1 &&
            enabledMotions[0]?.id === motionId
          ) {
            throw new Error(
              `Cannot disable last enabled motion in category: ${motionCategory}`,
            );
          }
        }
      }

      motion.isEnabled = enabled;

      if (!motion.metadata) {
        motion.metadata = getDefaultMetadata();
      }
      motion.metadata.lastToggled = Date.now();

      await storageServiceProxy.fileSave(motionId, motion, this.CATEGORY);

      Logger.log(
        "MotionStorage",
        `Motion ${motionId} ${enabled ? "enabled" : "disabled"}`,
      );
      return true;
    } catch (error) {
      Logger.error("MotionStorage", "Failed to toggle motion:", error);
      throw error;
    }
  }

  /**
   * Delete a motion
   * @param {string} motionId - Motion ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteMotion(motionId: string): Promise<boolean> {
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
            const enabledMotions = categoryMotions.filter(
              (m) =>
                m.enabledByCategory && m.enabledByCategory[category] === true,
            );

            if (
              enabledMotions.length === 1 &&
              enabledMotions[0]?.id === motionId
            ) {
              throw new Error(
                `Cannot delete last enabled motion in category: ${category}`,
              );
            }
          }
        }
      }

      await storageServiceProxy.fileRemove(motionId);

      if (motion.blobURL) {
        URL.revokeObjectURL(motion.blobURL);
      }

      Logger.log("MotionStorage", `Motion ${motionId} deleted`);
      return true;
    } catch (error) {
      Logger.error("MotionStorage", "Failed to delete motion:", error);
      throw error;
    }
  }

  /**
   * Check if a motion exists
   * @param {string} motionId - Motion ID
   * @returns {Promise<boolean>} - Exists status
   */
  async motionExists(motionId: string): Promise<boolean> {
    try {
      const exists = await storageServiceProxy.fileExists(motionId);
      return exists === true;
    } catch (error) {
      Logger.error(
        "MotionStorage",
        `Failed to check if motion ${motionId} exists:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get total storage size for all motions
   * @returns {Promise<number>} - Total size in bytes
   */
  async getTotalStorageSize(): Promise<number> {
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
      Logger.error(
        "MotionStorage",
        "Failed to calculate total storage size:",
        error,
      );
      return 0;
    }
  }

  /**
   * Get storage statistics grouped by category
   * @returns {Promise<Object>} - Statistics object
   */
  async getStorageStats(): Promise<
    Record<
      string,
      { count: number; enabled: number; disabled: number; totalSize: number }
    >
  > {
    try {
      const allMotions = await this.getAllMotions();
      const stats: Record<
        string,
        { count: number; enabled: number; disabled: number; totalSize: number }
      > = {};

      for (const motion of allMotions) {
        const category = motion.animationCategory || "unknown";

        if (!stats[category]) {
          stats[category] = {
            count: 0,
            enabled: 0,
            disabled: 0,
            totalSize: 0,
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
      Logger.error("MotionStorage", "Failed to get storage stats:", error);
      return {};
    }
  }
}

// Create singleton instance
export const motionStorageService = new MotionStorageService();

export default motionStorageService;
