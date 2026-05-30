/**
 * Storage Service Proxy
 *
 * Dual-mode wrapper for storage operations.
 * Dev mode: Direct access to StorageManager
 * Extension mode: Message bridge to background worker
 */

import { MessageTypes } from "../../../extension/shared/MessageTypes";
import { getEmbedConfig } from "../../embed/runtimeStore";
import type { StorageAdapterSelection } from "../../storage/StorageAdapterRegistry";
import { isExtension } from "../../utils/PlatformUtils";
import { ServiceProxy } from "./ServiceProxy";

type StorageRecord = Record<string, unknown>;

interface StorageManagerLike {
  config: {
    save(key: string, value: unknown): Promise<unknown>;
    load(key: string, defaultValue?: unknown): Promise<unknown>;
    exists(key: string): Promise<unknown>;
    remove(key: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  settings: {
    save(key: string, value: unknown): Promise<unknown>;
    load(key: string, defaultValue?: unknown): Promise<unknown>;
    exists(key: string): Promise<unknown>;
    remove(key: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  cache: {
    save(key: string, value: unknown, ttlSeconds?: number): Promise<unknown>;
    load(key: string): Promise<unknown>;
    exists(key: string): Promise<unknown>;
    remove(key: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    cleanup(): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  chat: {
    save(chatId: string, data: unknown): Promise<unknown>;
    load(chatId: string): Promise<unknown>;
    exists(chatId: string): Promise<unknown>;
    remove(chatId: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  files: {
    save(fileId: string, data: unknown, category?: string): Promise<unknown>;
    load(fileId: string): Promise<unknown>;
    exists(fileId: string): Promise<unknown>;
    remove(fileId: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    getByCategory(category: string): Promise<unknown>;
    getMetadataByCategory(category: string): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  data: {
    save(key: string, value: unknown, category?: string): Promise<unknown>;
    load(key: string): Promise<unknown>;
    exists(key: string): Promise<unknown>;
    remove(key: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    getByCategory(category: string): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  getStats?(): Promise<unknown>;
  clearAll?(): Promise<unknown>;
}

const blobFieldDescriptors = [
  {
    field: "data",
    blobTypeField: "_blobType",
    defaultType: "application/octet-stream",
  },
  {
    field: "motionData",
    blobTypeField: "_motionBlobType",
    defaultType: "application/octet-stream",
  },
  {
    field: "audioData",
    blobTypeField: "_audioBlobType",
    defaultType: "audio/mpeg",
  },
  {
    field: "cameraData",
    blobTypeField: "_cameraBlobType",
    defaultType: "application/octet-stream",
  },
  {
    field: "modelData",
    blobTypeField: "_modelBlobType",
    defaultType: "application/octet-stream",
  },
  {
    field: "stageData",
    blobTypeField: "_stageBlobType",
    defaultType: "application/octet-stream",
  },
] as const;

let defaultDevStorageManagerPromise: Promise<StorageManagerLike | null> | null =
  null;
const namedDevStorageManagerPromises = new Map<
  string,
  Promise<StorageManagerLike | null>
>();
const customDevStorageManagerPromises = new WeakMap<
  object,
  Promise<StorageManagerLike | null>
>();

const isStorageRecord = (value: unknown): value is StorageRecord => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const getStoragePolicy = () => getEmbedConfig().storage;

const getStorageAdapterSelection = (): StorageAdapterSelection | undefined => {
  const { mode, adapter } = getStoragePolicy();
  if (mode === "memory") {
    return adapter ?? "memory";
  }

  return adapter;
};

const getNamespacePrefix = () => {
  const { namespace } = getStoragePolicy();
  if (!namespace) {
    return "";
  }

  return `${namespace}:`;
};

const resolveScopedKey = (key: string) => `${getNamespacePrefix()}${key}`;

const resolveScopedCategory = (category: string) =>
  `${getNamespacePrefix()}${category}`;

const isInScope = (key: string) => {
  const prefix = getNamespacePrefix();
  return !prefix || key.startsWith(prefix);
};

const stripScope = (key: string) => {
  const prefix = getNamespacePrefix();
  return prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
};

const scopeRecord = (value: unknown): unknown => {
  if (!isStorageRecord(value)) {
    return value;
  }

  const scoped: StorageRecord = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (!isInScope(key)) {
      continue;
    }
    scoped[stripScope(key)] = entryValue;
  }

  return scoped;
};

const getCachedDevStorageManagerPromise = (
  selection?: StorageAdapterSelection,
): Promise<StorageManagerLike | null> => {
  if (!selection || selection === "dexie") {
    if (!defaultDevStorageManagerPromise) {
      defaultDevStorageManagerPromise = import("../../storage/StorageManager")
        .then((module) => module.storageManager)
        .catch(() => null);
    }

    return defaultDevStorageManagerPromise;
  }

  if (typeof selection === "string") {
    const cachedPromise = namedDevStorageManagerPromises.get(selection);
    if (cachedPromise) {
      return cachedPromise;
    }

    const managerPromise = import("../../storage/StorageManager")
      .then((module) => module.createStorageManager(selection))
      .catch(() => null);
    namedDevStorageManagerPromises.set(selection, managerPromise);
    return managerPromise;
  }

  const adapterObject = selection as object;
  const cachedPromise = customDevStorageManagerPromises.get(adapterObject);
  if (cachedPromise) {
    return cachedPromise;
  }

  const managerPromise = import("../../storage/StorageManager")
    .then((module) => module.createStorageManager(selection))
    .catch(() => null);
  customDevStorageManagerPromises.set(adapterObject, managerPromise);
  return managerPromise;
};

const deserializeBlobFields = <T>(value: T): T => {
  if (!isStorageRecord(value)) {
    return value;
  }

  const mutableValue = value as StorageRecord;

  for (const descriptor of blobFieldDescriptors) {
    const binaryValue = mutableValue[descriptor.field];
    if (!Array.isArray(binaryValue)) {
      continue;
    }

    const blobType =
      (mutableValue[descriptor.blobTypeField] as string | undefined) ??
      descriptor.defaultType;
    mutableValue[descriptor.field] = new Blob([new Uint8Array(binaryValue)], {
      type: blobType,
    });
    delete mutableValue[descriptor.blobTypeField];
  }

  return value;
};

const deserializeBlobFieldMap = (value: unknown): unknown => {
  if (!isStorageRecord(value)) {
    return value;
  }

  for (const entryValue of Object.values(value)) {
    if (isStorageRecord(entryValue)) {
      deserializeBlobFields(entryValue);
    }
  }

  return value;
};

const serializeBlobFields = async (value: unknown): Promise<unknown> => {
  if (!isStorageRecord(value)) {
    return value;
  }

  const serializedValue: StorageRecord = { ...value };

  for (const descriptor of blobFieldDescriptors) {
    const binaryValue = serializedValue[descriptor.field];
    if (!(binaryValue instanceof Blob)) {
      continue;
    }

    const buffer = await binaryValue.arrayBuffer();
    serializedValue[descriptor.field] = Array.from(new Uint8Array(buffer));
    serializedValue[descriptor.blobTypeField] =
      binaryValue.type || descriptor.defaultType;
  }

  return serializedValue;
};

class StorageServiceProxy extends ServiceProxy {
  constructor() {
    super("StorageService");
  }

  private async sendStorageMessage(
    type: string,
    payload: StorageRecord,
  ): Promise<unknown> {
    const bridge = await this.waitForBridge();
    if (!bridge) {
      throw new Error("StorageServiceProxy: Bridge not available");
    }

    return bridge.sendMessage(type, payload);
  }

  private async getDevStorageManager(): Promise<StorageManagerLike> {
    if (isExtension) {
      throw new Error("StorageServiceProxy: Dev StorageManager not available");
    }

    const manager = await getCachedDevStorageManagerPromise(
      getStorageAdapterSelection(),
    );
    if (!manager) {
      throw new Error("StorageServiceProxy: Dev StorageManager not available");
    }

    return manager;
  }

  async configSave(key: string, value: unknown): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CONFIG_SAVE, {
        key: scopedKey,
        value,
      });
    }

    return (await this.getDevStorageManager()).config.save(scopedKey, value);
  }

  async configLoad(
    key: string,
    defaultValue: unknown = null,
  ): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CONFIG_LOAD, {
        key: scopedKey,
        defaultValue,
      });
    }

    return (await this.getDevStorageManager()).config.load(
      scopedKey,
      defaultValue,
    );
  }

  async configExists(key: string): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CONFIG_EXISTS, {
        key: scopedKey,
      });
    }

    return (await this.getDevStorageManager()).config.exists(scopedKey);
  }

  async configRemove(key: string): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CONFIG_REMOVE, {
        key: scopedKey,
      });
    }

    return (await this.getDevStorageManager()).config.remove(scopedKey);
  }

  async configGetAll(): Promise<unknown> {
    if (this.isExtension) {
      return scopeRecord(
        await this.sendStorageMessage(MessageTypes.STORAGE_CONFIG_GET_ALL, {}),
      );
    }

    return scopeRecord(
      await (await this.getDevStorageManager()).config.getAll(),
    );
  }

  async configClear(): Promise<unknown> {
    if (getNamespacePrefix()) {
      const entries = (await this.configGetAll()) as StorageRecord;
      await Promise.all(
        Object.keys(entries).map((key) => this.configRemove(key)),
      );
      return true;
    }

    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CONFIG_CLEAR, {});
    }

    return (await this.getDevStorageManager()).config.clear();
  }

  async settingsSave(key: string, value: unknown): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_SETTINGS_SAVE, {
        key: scopedKey,
        value,
      });
    }

    return (await this.getDevStorageManager()).settings.save(scopedKey, value);
  }

  async settingsLoad(
    key: string,
    defaultValue: unknown = null,
  ): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_SETTINGS_LOAD, {
        key: scopedKey,
        defaultValue,
      });
    }

    return (await this.getDevStorageManager()).settings.load(
      scopedKey,
      defaultValue,
    );
  }

  async settingsExists(key: string): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_SETTINGS_EXISTS, {
        key: scopedKey,
      });
    }

    return (await this.getDevStorageManager()).settings.exists(scopedKey);
  }

  async settingsRemove(key: string): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_SETTINGS_REMOVE, {
        key: scopedKey,
      });
    }

    return (await this.getDevStorageManager()).settings.remove(scopedKey);
  }

  async settingsGetAll(): Promise<unknown> {
    if (this.isExtension) {
      return scopeRecord(
        await this.sendStorageMessage(
          MessageTypes.STORAGE_SETTINGS_GET_ALL,
          {},
        ),
      );
    }

    return scopeRecord(
      await (await this.getDevStorageManager()).settings.getAll(),
    );
  }

  async settingsClear(): Promise<unknown> {
    if (getNamespacePrefix()) {
      const entries = (await this.settingsGetAll()) as StorageRecord;
      await Promise.all(
        Object.keys(entries).map((key) => this.settingsRemove(key)),
      );
      return true;
    }

    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_SETTINGS_CLEAR, {});
    }

    return (await this.getDevStorageManager()).settings.clear();
  }

  async cacheSave(
    key: string,
    value: unknown,
    ttlSeconds = 3600,
  ): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CACHE_SAVE, {
        key: scopedKey,
        value,
        ttlSeconds,
      });
    }

    return (await this.getDevStorageManager()).cache.save(
      scopedKey,
      value,
      ttlSeconds,
    );
  }

  async cacheLoad(key: string): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CACHE_LOAD, {
        key: scopedKey,
      });
    }

    return (await this.getDevStorageManager()).cache.load(scopedKey);
  }

  async cacheExists(key: string): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CACHE_EXISTS, {
        key: scopedKey,
      });
    }

    return (await this.getDevStorageManager()).cache.exists(scopedKey);
  }

  async cacheRemove(key: string): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CACHE_REMOVE, {
        key: scopedKey,
      });
    }

    return (await this.getDevStorageManager()).cache.remove(scopedKey);
  }

  async cacheGetAll(): Promise<unknown> {
    if (this.isExtension) {
      return scopeRecord(
        await this.sendStorageMessage(MessageTypes.STORAGE_CACHE_GET_ALL, {}),
      );
    }

    return scopeRecord(
      await (await this.getDevStorageManager()).cache.getAll(),
    );
  }

  async cacheCleanup(): Promise<unknown> {
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CACHE_CLEANUP, {});
    }

    return (await this.getDevStorageManager()).cache.cleanup();
  }

  async cacheClear(): Promise<unknown> {
    if (getNamespacePrefix()) {
      const entries = (await this.cacheGetAll()) as StorageRecord;
      await Promise.all(
        Object.keys(entries).map((key) => this.cacheRemove(key)),
      );
      return true;
    }

    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CACHE_CLEAR, {});
    }

    return (await this.getDevStorageManager()).cache.clear();
  }

  async chatSave(chatId: string, data: unknown): Promise<unknown> {
    const scopedChatId = resolveScopedKey(chatId);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CHAT_SAVE, {
        chatId: scopedChatId,
        data,
      });
    }

    return (await this.getDevStorageManager()).chat.save(scopedChatId, data);
  }

  async chatLoad(chatId: string): Promise<unknown> {
    const scopedChatId = resolveScopedKey(chatId);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CHAT_LOAD, {
        chatId: scopedChatId,
      });
    }

    return (await this.getDevStorageManager()).chat.load(scopedChatId);
  }

  async chatExists(chatId: string): Promise<unknown> {
    const scopedChatId = resolveScopedKey(chatId);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CHAT_EXISTS, {
        chatId: scopedChatId,
      });
    }

    return (await this.getDevStorageManager()).chat.exists(scopedChatId);
  }

  async chatRemove(chatId: string): Promise<unknown> {
    const scopedChatId = resolveScopedKey(chatId);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CHAT_REMOVE, {
        chatId: scopedChatId,
      });
    }

    return (await this.getDevStorageManager()).chat.remove(scopedChatId);
  }

  async chatGetAll(): Promise<unknown> {
    if (this.isExtension) {
      return scopeRecord(
        await this.sendStorageMessage(MessageTypes.STORAGE_CHAT_GET_ALL, {}),
      );
    }

    return scopeRecord(await (await this.getDevStorageManager()).chat.getAll());
  }

  async chatClear(): Promise<unknown> {
    if (getNamespacePrefix()) {
      const entries = (await this.chatGetAll()) as StorageRecord;
      await Promise.all(
        Object.keys(entries).map((key) => this.chatRemove(key)),
      );
      return true;
    }

    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CHAT_CLEAR, {});
    }

    return (await this.getDevStorageManager()).chat.clear();
  }

  async fileSave(
    fileId: string,
    data: unknown,
    category = "general",
  ): Promise<unknown> {
    const scopedFileId = resolveScopedKey(fileId);
    const scopedCategory = resolveScopedCategory(category);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_FILE_SAVE, {
        fileId: scopedFileId,
        data: await serializeBlobFields(data),
        category: scopedCategory,
      });
    }

    return (await this.getDevStorageManager()).files.save(
      scopedFileId,
      data,
      scopedCategory,
    );
  }

  async fileLoad(fileId: string): Promise<unknown> {
    const scopedFileId = resolveScopedKey(fileId);
    if (this.isExtension) {
      return deserializeBlobFields(
        await this.sendStorageMessage(MessageTypes.STORAGE_FILE_LOAD, {
          fileId: scopedFileId,
        }),
      );
    }

    return (await this.getDevStorageManager()).files.load(scopedFileId);
  }

  async fileExists(fileId: string): Promise<unknown> {
    const scopedFileId = resolveScopedKey(fileId);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_FILE_EXISTS, {
        fileId: scopedFileId,
      });
    }

    return (await this.getDevStorageManager()).files.exists(scopedFileId);
  }

  async fileRemove(fileId: string): Promise<unknown> {
    const scopedFileId = resolveScopedKey(fileId);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_FILE_REMOVE, {
        fileId: scopedFileId,
      });
    }

    return (await this.getDevStorageManager()).files.remove(scopedFileId);
  }

  async filesGetAll(): Promise<unknown> {
    if (this.isExtension) {
      return scopeRecord(
        deserializeBlobFieldMap(
          await this.sendStorageMessage(MessageTypes.STORAGE_FILES_GET_ALL, {}),
        ),
      );
    }

    return scopeRecord(
      await (await this.getDevStorageManager()).files.getAll(),
    );
  }

  async filesGetByCategory(category: string): Promise<unknown> {
    const scopedCategory = resolveScopedCategory(category);
    if (this.isExtension) {
      return scopeRecord(
        deserializeBlobFieldMap(
          await this.sendStorageMessage(
            MessageTypes.STORAGE_FILES_GET_BY_CATEGORY,
            { category: scopedCategory },
          ),
        ),
      );
    }

    return scopeRecord(
      await (
        await this.getDevStorageManager()
      ).files.getByCategory(scopedCategory),
    );
  }

  async filesGetMetadataByCategory(category: string): Promise<unknown> {
    const scopedCategory = resolveScopedCategory(category);
    if (this.isExtension) {
      return scopeRecord(
        await this.sendStorageMessage(
          MessageTypes.STORAGE_FILES_GET_METADATA_BY_CATEGORY,
          { category: scopedCategory },
        ),
      );
    }

    return scopeRecord(
      await (
        await this.getDevStorageManager()
      ).files.getMetadataByCategory(scopedCategory),
    );
  }

  async filesClear(): Promise<unknown> {
    if (getNamespacePrefix()) {
      const entries = (await this.filesGetAll()) as StorageRecord;
      await Promise.all(
        Object.keys(entries).map((key) => this.fileRemove(key)),
      );
      return true;
    }

    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_FILES_CLEAR, {});
    }

    return (await this.getDevStorageManager()).files.clear();
  }

  async dataSave(
    key: string,
    value: unknown,
    category = "general",
  ): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    const scopedCategory = resolveScopedCategory(category);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_DATA_SAVE, {
        key: scopedKey,
        value,
        category: scopedCategory,
      });
    }

    return (await this.getDevStorageManager()).data.save(
      scopedKey,
      value,
      scopedCategory,
    );
  }

  async dataLoad(key: string): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_DATA_LOAD, {
        key: scopedKey,
      });
    }

    return (await this.getDevStorageManager()).data.load(scopedKey);
  }

  async dataExists(key: string): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_DATA_EXISTS, {
        key: scopedKey,
      });
    }

    return (await this.getDevStorageManager()).data.exists(scopedKey);
  }

  async dataRemove(key: string): Promise<unknown> {
    const scopedKey = resolveScopedKey(key);
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_DATA_REMOVE, {
        key: scopedKey,
      });
    }

    return (await this.getDevStorageManager()).data.remove(scopedKey);
  }

  async dataGetAll(): Promise<unknown> {
    if (this.isExtension) {
      return scopeRecord(
        await this.sendStorageMessage(MessageTypes.STORAGE_DATA_GET_ALL, {}),
      );
    }

    return scopeRecord(await (await this.getDevStorageManager()).data.getAll());
  }

  async dataGetByCategory(category: string): Promise<unknown> {
    const scopedCategory = resolveScopedCategory(category);
    if (this.isExtension) {
      return scopeRecord(
        await this.sendStorageMessage(
          MessageTypes.STORAGE_DATA_GET_BY_CATEGORY,
          {
            category: scopedCategory,
          },
        ),
      );
    }

    return scopeRecord(
      await (
        await this.getDevStorageManager()
      ).data.getByCategory(scopedCategory),
    );
  }

  async dataClear(): Promise<unknown> {
    if (getNamespacePrefix()) {
      const entries = (await this.dataGetAll()) as StorageRecord;
      await Promise.all(
        Object.keys(entries).map((key) => this.dataRemove(key)),
      );
      return true;
    }

    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_DATA_CLEAR, {});
    }

    return (await this.getDevStorageManager()).data.clear();
  }

  async getStats(): Promise<unknown> {
    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_GET_STATS, {});
    }

    const manager = await this.getDevStorageManager();
    if (!manager.getStats) {
      throw new Error(
        "StorageServiceProxy: getStats is not supported by StorageManager",
      );
    }

    return manager.getStats();
  }

  async clearAll(): Promise<unknown> {
    if (getNamespacePrefix()) {
      await Promise.all([
        this.configClear(),
        this.settingsClear(),
        this.cacheClear(),
        this.chatClear(),
        this.filesClear(),
        this.dataClear(),
      ]);
      return true;
    }

    if (this.isExtension) {
      return this.sendStorageMessage(MessageTypes.STORAGE_CLEAR_ALL, {});
    }

    const manager = await this.getDevStorageManager();
    if (!manager.clearAll) {
      throw new Error(
        "StorageServiceProxy: clearAll is not supported by StorageManager",
      );
    }

    return manager.clearAll();
  }
}

export const storageServiceProxy = new StorageServiceProxy();

export default storageServiceProxy;
