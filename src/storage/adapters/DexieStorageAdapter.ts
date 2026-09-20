/**
 * Dexie-backed storage adapter.
 */

import { db } from "../DatabaseSchema";
import type {
  StorageAdapterLike,
  StorageMetadata,
  StorageRecord,
  StorageStats,
  StorageTableName,
} from "./types";

interface CacheRecord extends StorageRecord {
  key: string;
  value: unknown;
  expiresAt?: string;
}

export class DexieStorageAdapter implements StorageAdapterLike {
  async get<T = unknown>(
    table: StorageTableName,
    key: string,
  ): Promise<T | StorageRecord | undefined> {
    const record = (await db.table(table).get(key)) as
      | StorageRecord
      | undefined;

    if (table === "chat") {
      return record;
    }

    if (table === "files") {
      return record?.value as T | undefined;
    }

    return record?.value as T | undefined;
  }

  async getRecord(
    table: StorageTableName,
    key: string,
  ): Promise<StorageRecord | undefined> {
    return (await db.table(table).get(key)) as StorageRecord | undefined;
  }

  async set<T>(
    table: StorageTableName,
    key: string,
    value: T,
    metadata: StorageMetadata = {},
  ): Promise<boolean> {
    let record: StorageRecord;

    if (table === "chat") {
      record = {
        ...(value as StorageRecord),
        chatId: key,
        updatedAt: new Date().toISOString(),
      };
    } else if (table === "files") {
      record = {
        fileId: key,
        value,
        createdAt:
          typeof metadata.createdAt === "string"
            ? metadata.createdAt
            : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...metadata,
      };
    } else {
      record = {
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

    await db.table(table).put(record);
    return true;
  }

  async remove(table: StorageTableName, key: string): Promise<boolean> {
    await db.table(table).delete(key);
    return true;
  }

  async exists(table: StorageTableName, key: string): Promise<boolean> {
    if (table === "chat") {
      const record = await db.table(table).where("chatId").equals(key).first();
      return !!record;
    }

    if (table === "files") {
      const record = await db.table(table).where("fileId").equals(key).first();
      return !!record;
    }

    const record = await db.table(table).where("key").equals(key).first();
    return !!record;
  }

  async getMultiple<T = unknown>(
    table: StorageTableName,
    keys: string[],
  ): Promise<Record<string, T | undefined>> {
    const records = (await db.table(table).bulkGet(keys)) as Array<
      StorageRecord | undefined
    >;
    const result: Record<string, T | undefined> = {};
    records.forEach((record, index) => {
      const resultKey = keys[index];
      if (resultKey !== undefined) {
        result[resultKey] = record?.value as T | undefined;
      }
    });
    return result;
  }

  async setMultiple<T>(
    table: StorageTableName,
    items: Record<string, T>,
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const records = Object.entries(items).map(([key, value]) => ({
      key,
      value,
      createdAt: now,
      updatedAt: now,
    }));

    await db.table(table).bulkPut(records);
    return true;
  }

  async clear(table: StorageTableName): Promise<boolean> {
    await db.table(table).clear();
    return true;
  }

  async query(
    table: StorageTableName,
    filter: StorageRecord,
  ): Promise<StorageRecord[]> {
    const query = db.table(table);

    if (typeof filter.key === "string") {
      const record = await this.getRecord(table, filter.key);
      return record ? [record] : [];
    }

    const allRecords = (await query.toArray()) as StorageRecord[];
    return allRecords.filter((record) => {
      return Object.entries(filter).every(([key, value]) => {
        return record[key] === value;
      });
    });
  }

  async getAll(table: StorageTableName): Promise<StorageRecord[]> {
    return (await db.table(table).toArray()) as StorageRecord[];
  }

  async count(table: StorageTableName): Promise<number> {
    return await db.table(table).count();
  }

  async cleanupExpiredCache(): Promise<number> {
    const now = new Date().toISOString();
    const expired = (await db
      .table("cache")
      .where("expiresAt")
      .below(now)
      .toArray()) as CacheRecord[];

    const count = expired.length;
    if (count > 0) {
      await db.table("cache").bulkDelete(expired.map((record) => record.key));
    }
    return count;
  }

  async getStats(): Promise<StorageStats> {
    return await db.getStats();
  }

  async isDatabaseReady(): Promise<boolean> {
    try {
      await db.table("config").count();
      return true;
    } catch {
      return false;
    }
  }
}

export const dexieStorageAdapter = new DexieStorageAdapter();

export default dexieStorageAdapter;
