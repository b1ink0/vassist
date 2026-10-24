/**
 * Storage Manager
 *
 * High-level storage interface combining old StorageManager and StorageService functionality.
 * Works seamlessly across dev and extension modes.
 */

import {
  getDefaultStorageAdapter,
  resolveStorageAdapter,
  type StorageAdapterSelection,
} from "./StorageAdapterRegistry";
import type { StorageAdapterLike, StorageStats } from "./StorageAdapter";

type UnknownRecord = Record<string, unknown>;

type ConfigValidator = (data: unknown) => boolean;

interface ConfigNamespace {
  save: (key: string, value: unknown) => Promise<boolean>;
  load: <T = unknown>(
    key: string,
    defaultValue?: T | null,
  ) => Promise<T | null | unknown>;
  exists: (key: string) => Promise<boolean>;
  remove: (key: string) => Promise<boolean>;
  getAll: () => Promise<Record<string, unknown>>;
  clear: () => Promise<boolean>;
}

interface SettingsNamespace extends ConfigNamespace {}

interface CacheNamespace {
  save: (key: string, value: unknown, ttlSeconds?: number) => Promise<boolean>;
  load: (key: string) => Promise<unknown>;
  exists: (key: string) => Promise<boolean>;
  remove: (key: string) => Promise<boolean>;
  getAll: () => Promise<Record<string, unknown>>;
  clear: () => Promise<boolean>;
  cleanup: () => Promise<number>;
}

interface ChatNamespace {
  save: (chatId: string, data: UnknownRecord) => Promise<boolean>;
  load: (chatId: string) => Promise<unknown>;
  exists: (chatId: string) => Promise<boolean>;
  remove: (chatId: string) => Promise<boolean>;
  getAll: () => Promise<Record<string, unknown>>;
  clear: () => Promise<boolean>;
}

interface FilesNamespace {
  save: (fileId: string, data: unknown, category?: string) => Promise<boolean>;
  load: (fileId: string) => Promise<unknown>;
  exists: (fileId: string) => Promise<boolean>;
  remove: (fileId: string) => Promise<boolean>;
  getAll: () => Promise<Record<string, unknown>>;
  getByCategory: (category: string) => Promise<Record<string, unknown>>;
  getMetadataByCategory: (
    category: string,
  ) => Promise<Record<string, UnknownRecord>>;
  clear: () => Promise<boolean>;
}

interface DataNamespace {
  save: (key: string, value: unknown, category?: string) => Promise<boolean>;
  load: (key: string) => Promise<unknown>;
  exists: (key: string) => Promise<boolean>;
  remove: (key: string) => Promise<boolean>;
  getAll: () => Promise<Record<string, unknown>>;
  getByCategory: (category: string) => Promise<Record<string, unknown>>;
  clear: () => Promise<boolean>;
}

/**
 * Config Schema Validators
 * Validates data structure before saving to prevent corruption
 */
const CONFIG_VALIDATORS: Record<string, ConfigValidator> = {
  setupState: (data: unknown): boolean => {
    // setupState MUST have: setupCompleted, currentStep, completedSteps, setupData
    if (typeof data !== "object" || data === null) return false;

    const hasSetupFields =
      "setupCompleted" in data &&
      "currentStep" in data &&
      "completedSteps" in data;
    const hasUIConfigFields =
      "enableModelLoading" in data ||
      "enablePortraitMode" in data ||
      "theme" in data ||
      "position" in data ||
      "fpsLimit" in data;

    return hasSetupFields && !hasUIConfigFields;
  },

  uiConfig: (data: unknown): boolean => {
    // uiConfig MUST have: theme, position
    if (typeof data !== "object" || data === null) return false;

    const hasUIFields =
      "theme" in data || "position" in data || "enableModelLoading" in data;
    const hasSetupFields =
      "setupCompleted" in data ||
      "currentStep" in data ||
      "completedSteps" in data;

    return hasUIFields && !hasSetupFields;
  },

  aiConfig: (data: unknown): boolean => {
    // aiConfig MUST have: provider
    if (typeof data !== "object" || data === null) return false;

    const hasAIFields =
      "provider" in data ||
      "chromeAi" in data ||
      "openai" in data ||
      "ollama" in data;
    const hasSetupFields = "setupCompleted" in data || "currentStep" in data;
    const hasUIFields = "theme" in data || "position" in data;

    return hasAIFields && !hasSetupFields && !hasUIFields;
  },

  ttsConfig: (data: unknown): boolean => {
    // ttsConfig MUST have: enabled, provider
    if (typeof data !== "object" || data === null) return false;

    const hasTTSFields = "enabled" in data && "provider" in data;
    const hasSetupFields = "setupCompleted" in data || "currentStep" in data;

    return hasTTSFields && !hasSetupFields;
  },

  sttConfig: (data: unknown): boolean => {
    // sttConfig MUST have provider-specific fields
    if (typeof data !== "object" || data === null) return false;

    const hasSTTFields =
      "chromeAi" in data || "openai" in data || "recordingFormat" in data;
    const hasSetupFields = "setupCompleted" in data || "currentStep" in data;

    return hasSTTFields && !hasSetupFields;
  },
};

export class StorageManager {
  private adapter: StorageAdapterLike;

  public config: ConfigNamespace;
  public settings: SettingsNamespace;
  public cache: CacheNamespace;
  public chat: ChatNamespace;
  public files: FilesNamespace;
  public data: DataNamespace;
  public db: StorageAdapterLike;

  constructor(adapter: StorageAdapterLike = getDefaultStorageAdapter()) {
    this.adapter = adapter;
    this.db = this.adapter;

    // Namespace for configuration storage (replaces old StorageManager)
    this.config = {
      save: (key: string, value: unknown) => this._configSave(key, value),
      load: <T = unknown>(key: string, defaultValue: T | null = null) =>
        this._configLoad<T>(key, defaultValue),
      exists: (key: string) => this._configExists(key),
      remove: (key: string) => this._configRemove(key),
      getAll: () => this._configGetAll(),
      clear: () => this._configClear(),
    };

    // Namespace for settings storage
    this.settings = {
      save: (key: string, value: unknown) => this._settingsSave(key, value),
      load: <T = unknown>(key: string, defaultValue: T | null = null) =>
        this._settingsLoad<T>(key, defaultValue),
      exists: (key: string) => this._settingsExists(key),
      remove: (key: string) => this._settingsRemove(key),
      getAll: () => this._settingsGetAll(),
      clear: () => this._settingsClear(),
    };

    // Namespace for cache storage with TTL
    this.cache = {
      save: (key: string, value: unknown, ttlSeconds = 3600) =>
        this._cacheSave(key, value, ttlSeconds),
      load: (key: string) => this._cacheLoad(key),
      exists: (key: string) => this._cacheExists(key),
      remove: (key: string) => this._cacheRemove(key),
      getAll: () => this._cacheGetAll(),
      clear: () => this._cacheClear(),
      cleanup: () => this.adapter.cleanupExpiredCache(),
    };

    // Namespace for chat storage
    this.chat = {
      save: (chatId: string, data: UnknownRecord) =>
        this._chatSave(chatId, data),
      load: (chatId: string) => this._chatLoad(chatId),
      exists: (chatId: string) => this._chatExists(chatId),
      remove: (chatId: string) => this._chatRemove(chatId),
      getAll: () => this._chatGetAll(),
      clear: () => this._chatClear(),
    };

    // Namespace for file storage
    this.files = {
      save: (fileId: string, data: unknown, category = "general") =>
        this._fileSave(fileId, data, category),
      load: (fileId: string) => this._fileLoad(fileId),
      exists: (fileId: string) => this._fileExists(fileId),
      remove: (fileId: string) => this._fileRemove(fileId),
      getAll: () => this._filesGetAll(),
      getByCategory: (category: string) => this._filesGetByCategory(category),
      getMetadataByCategory: (category: string) =>
        this._filesGetMetadataByCategory(category),
      clear: () => this._filesClear(),
    };

    // Namespace for generic data storage by category
    this.data = {
      save: (key: string, value: unknown, category = "general") =>
        this._dataSave(key, value, category),
      load: (key: string) => this._dataLoad(key),
      exists: (key: string) => this._dataExists(key),
      remove: (key: string) => this._dataRemove(key),
      getAll: () => this._dataGetAll(),
      getByCategory: (category: string) => this._dataGetByCategory(category),
      clear: () => this._dataClear(),
    };
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    return await this.adapter.getStats();
  }

  async clearAll(): Promise<boolean> {
    await Promise.all([
      this.config.clear(),
      this.settings.clear(),
      this.cache.clear(),
      this.chat.clear(),
      this.files.clear(),
      this.data.clear(),
    ]);
    return true;
  }

  private async _configSave(key: string, value: unknown): Promise<boolean> {
    // Validate data before saving to prevent corruption
    if (CONFIG_VALIDATORS[key]) {
      const isValid = CONFIG_VALIDATORS[key](value);

      if (!isValid) {
        const error = new Error(
          `[StorageManager] VALIDATION FAILED: Attempted to save invalid data to '${key}'. Data structure does not match expected schema. This prevents data corruption.`,
        );
        throw error;
      }
    }

    return await this.adapter.set("config", key, value);
  }

  private async _configLoad<T = unknown>(
    key: string,
    defaultValue: T | null = null,
  ): Promise<T | null | unknown> {
    const value = await this.adapter.get<T>("config", key);
    return value !== undefined ? value : defaultValue;
  }

  private async _configExists(key: string): Promise<boolean> {
    return await this.adapter.exists("config", key);
  }

  private async _configRemove(key: string): Promise<boolean> {
    return await this.adapter.remove("config", key);
  }

  private async _configGetAll(): Promise<Record<string, unknown>> {
    const records = await this.adapter.getAll("config");
    const result: Record<string, unknown> = {};
    records.forEach((record) => {
      if (typeof record.key === "string") {
        result[record.key] = record.value;
      }
    });
    return result;
  }

  private async _configClear(): Promise<boolean> {
    return await this.adapter.clear("config");
  }

  // SETTINGS NAMESPACE METHODS
  private async _settingsSave(key: string, value: unknown): Promise<boolean> {
    return await this.adapter.set("settings", key, value);
  }

  private async _settingsLoad<T = unknown>(
    key: string,
    defaultValue: T | null = null,
  ): Promise<T | null | unknown> {
    const value = await this.adapter.get<T>("settings", key);
    return value !== undefined ? value : defaultValue;
  }

  private async _settingsExists(key: string): Promise<boolean> {
    return await this.adapter.exists("settings", key);
  }

  private async _settingsRemove(key: string): Promise<boolean> {
    return await this.adapter.remove("settings", key);
  }

  private async _settingsGetAll(): Promise<Record<string, unknown>> {
    const records = await this.adapter.getAll("settings");
    const result: Record<string, unknown> = {};
    records.forEach((record) => {
      if (typeof record.key === "string") {
        result[record.key] = record.value;
      }
    });
    return result;
  }

  private async _settingsClear(): Promise<boolean> {
    return await this.adapter.clear("settings");
  }

  // CACHE NAMESPACE METHODS (with TTL support)
  private async _cacheSave(
    key: string,
    value: unknown,
    ttlSeconds = 3600,
  ): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    return await this.adapter.set("cache", key, value, { expiresAt });
  }

  private async _cacheLoad(key: string): Promise<unknown> {
    const record = await this.adapter.getRecord("cache", key);

    if (!record) return undefined;

    // Check if expired
    const expiresAt =
      typeof record.expiresAt === "string" ? new Date(record.expiresAt) : null;
    if (expiresAt && expiresAt < new Date()) {
      await this.adapter.remove("cache", key);
      return undefined;
    }

    return record.value;
  }

  private async _cacheExists(key: string): Promise<boolean> {
    const record = await this.adapter.getRecord("cache", key);
    if (!record) return false;

    // Check if expired
    const expiresAt =
      typeof record.expiresAt === "string" ? new Date(record.expiresAt) : null;
    if (expiresAt && expiresAt < new Date()) {
      await this.adapter.remove("cache", key);
      return false;
    }

    return true;
  }

  private async _cacheRemove(key: string): Promise<boolean> {
    return await this.adapter.remove("cache", key);
  }

  private async _cacheGetAll(): Promise<Record<string, unknown>> {
    const records = await this.adapter.getAll("cache");
    const now = new Date();
    const result: Record<string, unknown> = {};

    for (const record of records) {
      const expiresAt =
        typeof record.expiresAt === "string"
          ? new Date(record.expiresAt)
          : null;
      if (!expiresAt || expiresAt >= now) {
        if (typeof record.key === "string") {
          result[record.key] = record.value;
        }
      }
    }

    return result;
  }

  private async _cacheClear(): Promise<boolean> {
    return await this.adapter.clear("cache");
  }

  // CHAT NAMESPACE METHODS
  private async _chatSave(
    chatId: string,
    data: UnknownRecord,
  ): Promise<boolean> {
    return await this.adapter.set("chat", chatId, data);
  }

  private async _chatLoad(chatId: string): Promise<unknown> {
    return await this.adapter.get("chat", chatId);
  }

  private async _chatExists(chatId: string): Promise<boolean> {
    return await this.adapter.exists("chat", chatId);
  }

  private async _chatRemove(chatId: string): Promise<boolean> {
    return await this.adapter.remove("chat", chatId);
  }

  private async _chatGetAll(): Promise<Record<string, unknown>> {
    const records = await this.adapter.getAll("chat");
    const result: Record<string, unknown> = {};
    records.forEach((record) => {
      // Chat records are stored as complete objects, not wrapped in 'value'
      const chatId =
        typeof record.chatId === "string" ? record.chatId : undefined;
      if (chatId) {
        result[chatId] = record;
      }
    });
    return result;
  }

  private async _chatClear(): Promise<boolean> {
    return await this.adapter.clear("chat");
  }

  // FILES NAMESPACE METHODS
  private async _fileSave(
    fileId: string,
    data: unknown,
    category = "general",
  ): Promise<boolean> {
    return await this.adapter.set("files", fileId, data, { category });
  }

  private async _fileLoad(fileId: string): Promise<unknown> {
    return await this.adapter.get("files", fileId);
  }

  private async _fileExists(fileId: string): Promise<boolean> {
    return await this.adapter.exists("files", fileId);
  }

  private async _fileRemove(fileId: string): Promise<boolean> {
    return await this.adapter.remove("files", fileId);
  }

  private async _filesGetAll(): Promise<Record<string, unknown>> {
    const records = await this.adapter.getAll("files");
    const result: Record<string, unknown> = {};
    records.forEach((record) => {
      if (typeof record.fileId === "string") {
        result[record.fileId] = record.value;
      }
    });
    return result;
  }

  private async _filesGetByCategory(
    category: string,
  ): Promise<Record<string, unknown>> {
    const records = await this.adapter.query("files", { category });
    const result: Record<string, unknown> = {};
    records.forEach((record) => {
      if (typeof record.fileId === "string") {
        result[record.fileId] = record.value;
      }
    });
    return result;
  }

  private async _filesGetMetadataByCategory(
    category: string,
  ): Promise<Record<string, UnknownRecord>> {
    const records = await this.adapter.query("files", { category });
    const result: Record<string, UnknownRecord> = {};
    records.forEach((record) => {
      const metadata: UnknownRecord = {
        fileId: record.fileId,
        fileName: record.fileName,
        category: record.category,
        createdAt: record.createdAt,
      };

      if (record.value && typeof record.value === "object") {
        const value = record.value as UnknownRecord;
        const cleanValue: UnknownRecord = {};
        for (const [key, val] of Object.entries(value)) {
          if (
            !(val instanceof Blob) &&
            key !== "modelData" &&
            key !== "motionData"
          ) {
            cleanValue[key] = val;
          }
        }
        metadata.value = cleanValue;
      }

      if (typeof record.fileId === "string") {
        result[record.fileId] = metadata;
      }
    });
    return result;
  }

  private async _filesClear(): Promise<boolean> {
    return await this.adapter.clear("files");
  }

  // DATA NAMESPACE METHODS
  private async _dataSave(
    key: string,
    value: unknown,
    category = "general",
  ): Promise<boolean> {
    return await this.adapter.set("data", key, value, { category });
  }

  private async _dataLoad(key: string): Promise<unknown> {
    return await this.adapter.get("data", key);
  }

  private async _dataExists(key: string): Promise<boolean> {
    return await this.adapter.exists("data", key);
  }

  private async _dataRemove(key: string): Promise<boolean> {
    return await this.adapter.remove("data", key);
  }

  private async _dataGetAll(): Promise<Record<string, unknown>> {
    const records = await this.adapter.getAll("data");
    const result: Record<string, unknown> = {};
    records.forEach((record) => {
      if (typeof record.key === "string") {
        result[record.key] = record.value;
      }
    });
    return result;
  }

  private async _dataGetByCategory(
    category: string,
  ): Promise<Record<string, unknown>> {
    const records = await this.adapter.query("data", { category });
    const result: Record<string, unknown> = {};
    records.forEach((record) => {
      if (typeof record.key === "string") {
        result[record.key] = record.value;
      }
    });
    return result;
  }

  private async _dataClear(): Promise<boolean> {
    return await this.adapter.clear("data");
  }
}

export function createStorageManager(
  adapter?: StorageAdapterSelection | StorageAdapterLike,
): StorageManager {
  return new StorageManager(
    adapter ? resolveStorageAdapter(adapter) : getDefaultStorageAdapter(),
  );
}

// Export singleton instance
export const storageManager = createStorageManager();

export default storageManager;
