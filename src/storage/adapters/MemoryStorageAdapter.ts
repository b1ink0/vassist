/**
 * In-memory storage adapter that mirrors the unified storage record shapes.
 */

import type {
  StorageAdapterLike,
  StorageMetadata,
  StorageRecord,
  StorageStats,
  StorageTableName,
} from "./types";

type MemoryStore = Record<StorageTableName, Map<string, StorageRecord>>;

interface CacheRecord extends StorageRecord {
  key: string;
  value: unknown;
  expiresAt?: string;
}

const createStores = (): MemoryStore => ({
  config: new Map(),
  settings: new Map(),
  cache: new Map(),
  chat: new Map(),
  files: new Map(),
  sessions: new Map(),
  data: new Map(),
});

const cloneValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      const result: Record<string, unknown> = {};
      for (const [key, entryValue] of Object.entries(value)) {
        result[key] = cloneValue(entryValue);
      }
      return result as T;
    }
  }

  return value;
};

export class MemoryStorageAdapter implements StorageAdapterLike {
  private readonly stores: MemoryStore;

  constructor(initialStores: MemoryStore = createStores()) {
    this.stores = initialStores;
  }

  private getPrimaryKey(table: StorageTableName, key: string): string {
    return key;
  }

  private getStore(table: StorageTableName): Map<string, StorageRecord> {
    return this.stores[table];
  }

  private createRecord<T>(
    table: StorageTableName,
    key: string,
    value: T,
    metadata: StorageMetadata = {},
  ): StorageRecord {
    if (table === "chat") {
      return {
        ...(value as StorageRecord),
        chatId: key,
        updatedAt: new Date().toISOString(),
      };
    }

    if (table === "files") {
      return {
        fileId: key,
        value,
        createdAt:
          typeof metadata.createdAt === "string"
            ? metadata.createdAt
            : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...metadata,
      };
    }

    return {
      key,
      value,
      createdAt:
        typeof metadata.createdAt === "string"
          ? metadata.createdAt
          : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...metadata,
    };
  }

  async get<T = unknown>(
    table: StorageTableName,
    key: string,
  ): Promise<T | StorageRecord | undefined> {
    const record = this.getStore(table).get(this.getPrimaryKey(table, key));

    if (!record) {
      return undefined;
    }

    if (table === "chat") {
      return cloneValue(record);
    }

    return cloneValue(record.value as T | undefined);
  }

  async getRecord(
    table: StorageTableName,
    key: string,
  ): Promise<StorageRecord | undefined> {
    const record = this.getStore(table).get(this.getPrimaryKey(table, key));
    return record ? cloneValue(record) : undefined;
  }

  async set<T>(
    table: StorageTableName,
    key: string,
    value: T,
    metadata: StorageMetadata = {},
  ): Promise<boolean> {
    const record = this.createRecord(
      table,
      key,
      cloneValue(value),
      cloneValue(metadata),
    );
    this.getStore(table).set(this.getPrimaryKey(table, key), record);
    return true;
  }

  async remove(table: StorageTableName, key: string): Promise<boolean> {
    this.getStore(table).delete(this.getPrimaryKey(table, key));
    return true;
  }

  async exists(table: StorageTableName, key: string): Promise<boolean> {
    return this.getStore(table).has(this.getPrimaryKey(table, key));
  }

  async getMultiple<T = unknown>(
    table: StorageTableName,
    keys: string[],
  ): Promise<Record<string, T | undefined>> {
    const result: Record<string, T | undefined> = {};
    for (const key of keys) {
      result[key] = (await this.get<T>(table, key)) as T | undefined;
    }
    return result;
  }

  async setMultiple<T>(
    table: StorageTableName,
    items: Record<string, T>,
  ): Promise<boolean> {
    await Promise.all(
      Object.entries(items).map(([key, value]) => this.set(table, key, value)),
    );
    return true;
  }

  async clear(table: StorageTableName): Promise<boolean> {
    this.getStore(table).clear();
    return true;
  }

  async query(
    table: StorageTableName,
    filter: StorageRecord,
  ): Promise<StorageRecord[]> {
    const records = await this.getAll(table);
    return records.filter((record) => {
      return Object.entries(filter).every(
        ([key, value]) => record[key] === value,
      );
    });
  }

  async getAll(table: StorageTableName): Promise<StorageRecord[]> {
    return Array.from(this.getStore(table).values()).map((record) =>
      cloneValue(record),
    );
  }

  async count(table: StorageTableName): Promise<number> {
    return this.getStore(table).size;
  }

  async cleanupExpiredCache(): Promise<number> {
    const cacheStore = this.getStore("cache");
    const now = new Date();
    let count = 0;

    for (const [key, record] of cacheStore.entries()) {
      const expiresAt =
        typeof record.expiresAt === "string"
          ? new Date(record.expiresAt)
          : null;
      if (expiresAt && expiresAt < now) {
        cacheStore.delete(key);
        count += 1;
      }
    }

    return count;
  }

  async getStats(): Promise<StorageStats> {
    return {
      config: this.stores.config.size,
      settings: this.stores.settings.size,
      cache: this.stores.cache.size,
      chat: this.stores.chat.size,
      files: this.stores.files.size,
      sessions: this.stores.sessions.size,
      data: this.stores.data.size,
    };
  }
}

export const createMemoryStorageAdapter = () => new MemoryStorageAdapter();
