/**
 * @fileoverview Emote Storage Service
 */

import storageServiceProxy from "./proxies/StorageServiceProxy";
import Logger from "./LoggerService";

type UnknownRecord = Record<string, unknown>;

interface EmoteMetadata extends UnknownRecord {
  originalAudioFileName: string;
  originalMotionFileName: string;
  originalCameraFileName: string | null;
  uploadedAt: number;
  audioSize: number;
  motionSize: number;
  cameraSize: number;
  audioMimeType: string;
  lastRenamed?: number;
}

interface StoredEmote extends UnknownRecord {
  name: string;
  audioData: Blob;
  motionData: Blob;
  cameraData: Blob | null;
  categories: string[];
  isVisible: boolean;
  metadata: EmoteMetadata;
}

type StoredEmoteWithId = StoredEmote & { id: string };

interface NameValidationResult {
  valid: boolean;
  error?: string;
  name?: string;
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null;

const normalizeCategories = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return ["general"];
  }

  const categories = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

  if (categories.length === 0) {
    return ["general"];
  }

  return Array.from(new Set(categories));
};

const normalizeMetadata = (
  metadata: unknown,
  audioSize = 0,
  motionSize = 0,
): EmoteMetadata => {
  const value = isRecord(metadata) ? metadata : {};
  const normalized: EmoteMetadata = {
    ...value,
    originalAudioFileName:
      typeof value.originalAudioFileName === "string"
        ? value.originalAudioFileName
        : "unknown.mp3",
    originalMotionFileName:
      typeof value.originalMotionFileName === "string"
        ? value.originalMotionFileName
        : "unknown.vmd",
    originalCameraFileName:
      typeof value.originalCameraFileName === "string"
        ? value.originalCameraFileName
        : null,
    uploadedAt:
      typeof value.uploadedAt === "number" ? value.uploadedAt : Date.now(),
    audioSize:
      typeof value.audioSize === "number" ? value.audioSize : audioSize,
    motionSize:
      typeof value.motionSize === "number" ? value.motionSize : motionSize,
    cameraSize: typeof value.cameraSize === "number" ? value.cameraSize : 0,
    audioMimeType:
      typeof value.audioMimeType === "string"
        ? value.audioMimeType
        : "audio/mpeg",
  };
  if (typeof value.lastRenamed === "number") {
    normalized.lastRenamed = value.lastRenamed;
  }
  return normalized;
};

const normalizeEmote = (value: unknown): StoredEmote | null => {
  if (
    !isRecord(value) ||
    !(value.audioData instanceof Blob) ||
    !(value.motionData instanceof Blob)
  ) {
    return null;
  }

  const metadata = isRecord(value.metadata) ? value.metadata : {};
  return {
    ...value,
    name: typeof value.name === "string" ? value.name : "Unknown Emote",
    audioData: value.audioData,
    motionData: value.motionData,
    cameraData: value.cameraData instanceof Blob ? value.cameraData : null,
    categories: normalizeCategories(value.categories),
    isVisible: value.isVisible !== false,
    metadata: normalizeMetadata(
      metadata,
      value.audioData.size,
      value.motionData.size,
    ),
  };
};

class EmoteStorageService {
  private readonly CATEGORY: string;
  private readonly MAX_NAME_LENGTH: number;

  constructor() {
    this.CATEGORY = "emote";
    this.MAX_NAME_LENGTH = 50;
  }

  /**
   * Validate emote name
   * @param {string} name - Emote name to validate
   * @returns {Object} - { valid: boolean, error: string, name: string }
   */
  validateEmoteName(name: string): NameValidationResult {
    if (!name || typeof name !== "string") {
      return { valid: false, error: "Emote name is required" };
    }

    const trimmed = name.trim();

    if (trimmed.length === 0) {
      return { valid: false, error: "Emote name cannot be empty" };
    }

    if (trimmed.length > this.MAX_NAME_LENGTH) {
      const truncated = trimmed.slice(0, this.MAX_NAME_LENGTH).trimEnd();

      Logger.warn(
        "EmoteStorage",
        `Emote name exceeded ${this.MAX_NAME_LENGTH} characters and was truncated: "${trimmed}" -> "${truncated}"`,
      );

      if (truncated.length === 0) {
        return { valid: false, error: "Emote name cannot be empty" };
      }

      return { valid: true, name: truncated };
    }

    return { valid: true, name: trimmed };
  }

  /**
   * Generate unique emote ID
   * @returns {string} - UUID
   */
  generateEmoteId(): string {
    return `emote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save an emote to storage (audio + motion + optional camera together)
   * @param {string} emoteId - Unique emote ID (or null to generate)
   * @param {string} emoteName - User-editable emote name
   * @param {Blob|ArrayBuffer} audioData - Audio file data (MP3, WAV, OGG, etc.)
   * @param {Blob|ArrayBuffer} motionData - BVMD motion data
   * @param {Blob|ArrayBuffer|null} cameraData - Optional BVMD camera animation data
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<string>} - Emote ID
   */
  async saveEmote(
    emoteId: string | null | undefined,
    emoteName: string,
    audioData: Blob | ArrayBuffer,
    motionData: Blob | ArrayBuffer,
    cameraData: Blob | ArrayBuffer | null = null,
    metadata: UnknownRecord = {},
  ): Promise<string> {
    try {
      const nameValidation = this.validateEmoteName(emoteName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }
      const validatedName = nameValidation.name ?? emoteName.trim();

      if (!emoteId) {
        emoteId = this.generateEmoteId();
      }

      // Convert audio to Blob if needed
      let audioBlob;
      if (audioData instanceof ArrayBuffer) {
        const mimeType =
          typeof metadata.audioMimeType === "string"
            ? metadata.audioMimeType
            : "audio/mpeg";
        audioBlob = new Blob([audioData], { type: mimeType });
      } else if (audioData instanceof Blob) {
        audioBlob = audioData;
      } else {
        throw new Error(
          "Invalid audio data format. Expected Blob or ArrayBuffer.",
        );
      }

      // Convert motion to Blob if needed
      let motionBlob;
      if (motionData instanceof ArrayBuffer) {
        motionBlob = new Blob([motionData], {
          type: "application/octet-stream",
        });
      } else if (motionData instanceof Blob) {
        motionBlob = motionData;
      } else {
        throw new Error(
          "Invalid motion data format. Expected Blob or ArrayBuffer.",
        );
      }

      // Convert camera animation to Blob if provided (optional)
      let cameraBlob = null;
      if (cameraData) {
        if (cameraData instanceof ArrayBuffer) {
          cameraBlob = new Blob([cameraData], {
            type: "application/octet-stream",
          });
        } else if (cameraData instanceof Blob) {
          cameraBlob = cameraData;
        } else {
          throw new Error(
            "Invalid camera data format. Expected Blob or ArrayBuffer.",
          );
        }
      }

      const emoteData = {
        name: validatedName,
        audioData: audioBlob,
        motionData: motionBlob,
        cameraData: cameraBlob, // null if not provided
        categories: normalizeCategories(metadata.categories),
        isVisible: true,
        metadata: {
          originalAudioFileName:
            typeof metadata.originalAudioFileName === "string"
              ? metadata.originalAudioFileName
              : "unknown.mp3",
          originalMotionFileName:
            typeof metadata.originalMotionFileName === "string"
              ? metadata.originalMotionFileName
              : "unknown.vmd",
          originalCameraFileName:
            typeof metadata.originalCameraFileName === "string"
              ? metadata.originalCameraFileName
              : null,
          uploadedAt: Date.now(),
          audioSize: audioBlob.size,
          motionSize: motionBlob.size,
          cameraSize: cameraBlob ? cameraBlob.size : 0,
          audioMimeType: audioBlob.type || "audio/mpeg",
          ...metadata,
        },
      };

      await storageServiceProxy.fileSave(emoteId, emoteData, this.CATEGORY);

      Logger.log("EmoteStorage", `Emote saved: ${emoteId} (${validatedName})`);

      return emoteId;
    } catch (error) {
      Logger.error("EmoteStorage", "Failed to save emote:", error);
      throw error;
    }
  }

  /**
   * Get an emote by ID
   * @param {string} emoteId - Emote ID
   * @returns {Promise<Object|null>} - Emote data or null
   */
  async getEmote(emoteId: string): Promise<StoredEmote | null> {
    try {
      const emoteData = await storageServiceProxy.fileLoad(emoteId);
      return normalizeEmote(emoteData);
    } catch (error) {
      Logger.error("EmoteStorage", `Failed to get emote ${emoteId}:`, error);
      return null;
    }
  }

  /**
   * Get all emotes (including full blob data)
   * Only use when you need the actual emote data
   * @returns {Promise<Array>} - Array of complete emote objects
   */
  async getAllEmotes(): Promise<StoredEmoteWithId[]> {
    try {
      const allEmotes = await storageServiceProxy.filesGetByCategory(
        this.CATEGORY,
      );
      const allRecords = isRecord(allEmotes) ? allEmotes : {};

      const emotesArray = Object.entries(allRecords)
        .map(([id, data]) => {
          const emote = normalizeEmote(data);
          if (!emote) return null;
          return { id, ...emote };
        })
        .filter((item): item is StoredEmoteWithId => item !== null);

      return emotesArray;
    } catch (error) {
      Logger.error("EmoteStorage", "Failed to get all emotes:", error);
      return [];
    }
  }

  /**
   * Get emotes list (lightweight, no blob data)
   * Returns only IDs and metadata for fast listing
   * @returns {Promise<Array>} - Array of emote info without blob data
   */
  async getEmotesList(): Promise<
    Array<{
      id: string;
      name: string;
      categories: string[];
      isVisible: boolean;
      metadata: EmoteMetadata;
    }>
  > {
    try {
      const emotesMetadata =
        await storageServiceProxy.filesGetMetadataByCategory(this.CATEGORY);
      const records = isRecord(emotesMetadata) ? emotesMetadata : {};

      const emotesList = Object.entries(records).map(([id, data]) => {
        const entry = isRecord(data) && isRecord(data.value) ? data.value : {};
        return {
          id,
          name: typeof entry.name === "string" ? entry.name : "Unknown Emote",
          categories: normalizeCategories(entry.categories),
          isVisible: entry.isVisible !== false,
          metadata: normalizeMetadata(entry.metadata),
        };
      });

      Logger.log(
        "EmoteStorage",
        `Retrieved ${emotesList.length} emotes (metadata only)`,
      );
      return emotesList;
    } catch (error) {
      Logger.error("EmoteStorage", "Failed to get emotes list:", error);
      return [];
    }
  }

  /**
   * Update emote name
   * @param {string} emoteId - Emote ID
   * @param {string} newName - New emote name
   * @returns {Promise<boolean>} - Success status
   */
  async updateEmoteName(emoteId: string, newName: string): Promise<boolean> {
    try {
      const nameValidation = this.validateEmoteName(newName);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }
      const validatedName = nameValidation.name ?? newName.trim();

      const emote = await this.getEmote(emoteId);
      if (!emote) {
        throw new Error(`Emote ${emoteId} not found`);
      }

      emote.name = validatedName;

      if (!emote.metadata) {
        emote.metadata = normalizeEmote({
          name: emote.name,
          audioData: emote.audioData,
          motionData: emote.motionData,
          cameraData: emote.cameraData,
          isVisible: emote.isVisible,
          metadata: {},
        })!.metadata;
      }
      emote.metadata.lastRenamed = Date.now();

      await storageServiceProxy.fileSave(emoteId, emote, this.CATEGORY);

      Logger.log(
        "EmoteStorage",
        `Emote ${emoteId} renamed to: ${validatedName}`,
      );
      return true;
    } catch (error) {
      Logger.error("EmoteStorage", "Failed to update emote name:", error);
      throw error;
    }
  }

  /**
   * Toggle emote visibility in emote panel
   * @param {string} emoteId - Emote ID
   * @param {boolean} isVisible - Visibility state
   * @returns {Promise<boolean>} - Success status
   */
  async toggleEmoteVisibility(
    emoteId: string,
    isVisible: boolean,
  ): Promise<boolean> {
    try {
      const emote = await this.getEmote(emoteId);
      if (!emote) {
        throw new Error(`Emote ${emoteId} not found`);
      }

      emote.isVisible = isVisible;

      await storageServiceProxy.fileSave(emoteId, emote, this.CATEGORY);

      Logger.log(
        "EmoteStorage",
        `Emote ${emoteId} visibility set to: ${isVisible}`,
      );
      return true;
    } catch (error) {
      Logger.error("EmoteStorage", "Failed to toggle emote visibility:", error);
      throw error;
    }
  }

  /**
   * Update emote categories
   * @param {string} emoteId - Emote ID
   * @param {string[]} categories - Category list
   */
  async updateEmoteCategories(
    emoteId: string,
    categories: string[],
  ): Promise<boolean> {
    try {
      const emote = await this.getEmote(emoteId);
      if (!emote) {
        throw new Error(`Emote ${emoteId} not found`);
      }

      emote.categories = normalizeCategories(categories);
      await storageServiceProxy.fileSave(emoteId, emote, this.CATEGORY);

      Logger.log(
        "EmoteStorage",
        `Emote ${emoteId} categories updated: ${emote.categories.join(", ")}`,
      );
      return true;
    } catch (error) {
      Logger.error("EmoteStorage", "Failed to update emote categories:", error);
      throw error;
    }
  }

  /**
   * Delete an emote
   * @param {string} emoteId - Emote ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteEmote(emoteId: string): Promise<boolean> {
    try {
      const emote = await this.getEmote(emoteId);
      if (!emote) {
        throw new Error(`Emote ${emoteId} not found`);
      }

      await storageServiceProxy.fileRemove(emoteId);

      Logger.log("EmoteStorage", `Emote ${emoteId} deleted`);
      return true;
    } catch (error) {
      Logger.error("EmoteStorage", "Failed to delete emote:", error);
      throw error;
    }
  }
}

// Export singleton instance
const emoteStorageService = new EmoteStorageService();
export default emoteStorageService;
