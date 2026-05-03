/**
 * Storage Adapter
 *
 * Core abstraction layer for all storage operations.
 * Works with Dexie IndexedDB and provides a clean API.
 * Handles automatic timestamp management and basic validation.
 */

import { db, type StorageStats } from "./DatabaseSchema";

export type StorageTableName =
  | "config"
  | "settings"
  | "cache"
  | "chat"
  | "files"
  | "sessions"
  | "data";

type JsonRecord = Record<string, unknown>;

type StorageMetadata = JsonRecord;

interface CacheRecord extends JsonRecord {
  key: string;
  value: unknown;
  expiresAt?: string;
}

export class StorageAdapter {
  /**
   * Get a value from storage
   */
  async get<T = unknown>(
    table: StorageTableName,
    key: string,
  ): Promise<T | JsonRecord | undefined> {
    const record = (await db.table(table).get(key)) as JsonRecord | undefined;

    // Chat table stores the full chat object, not wrapped in 'value'
    if (table === "chat") {
      return record;
    }

    // Files table stores data in 'value' field
    if (table === "files") {
      return record?.value as T | undefined;
    }

    // Other tables also use 'value' field
    return record?.value as T | undefined;
  }

  /**
   * Get full record with metadata
   */
  async getRecord(
    table: StorageTableName,
    key: string,
  ): Promise<JsonRecord | undefined> {
    return (await db.table(table).get(key)) as JsonRecord | undefined;
  }

  /**
   * Set a value in storage
   */
  async set<T>(
    table: StorageTableName,
    key: string,
    value: T,
    metadata: StorageMetadata = {},
  ): Promise<boolean> {
    let record: JsonRecord;

    // Different tables have different primary key field names
    if (table === "chat") {
      // Chat table stores the full chat object directly, no 'value' wrapper
      record = {
        ...(value as JsonRecord), // Chat data should have chatId, title, messages, etc.
        chatId: key, // Ensure chatId is set as primary key
        updatedAt: new Date().toISOString(),
      };
    } else if (table === "files") {
      // Files table uses fileId as primary key
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
      // Other tables use 'key' as primary key
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

  /**
   * Remove a value from storage
   */
  async remove(table: StorageTableName, key: string): Promise<boolean> {
    await db.table(table).delete(key);
    return true;
  }

  /**
   * Check if a key exists
   */
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

  /**
   * Get multiple values
   */
  async getMultiple<T = unknown>(
    table: StorageTableName,
    keys: string[],
  ): Promise<Record<string, T | undefined>> {
    const records = (await db.table(table).bulkGet(keys)) as Array<
      JsonRecord | undefined
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

  /**
   * Set multiple values at once
   */
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

  /**
   * Clear all records in a table
   */
  async clear(table: StorageTableName): Promise<boolean> {
    await db.table(table).clear();
    return true;
  }

  /**
   * Query records by filter
   */
  async query(
    table: StorageTableName,
    filter: JsonRecord,
  ): Promise<JsonRecord[]> {
    const query = db.table(table);

    // Build query based on filter
    if (typeof filter.key === "string") {
      const record = await this.getRecord(table, filter.key);
      return record ? [record] : [];
    }

    // For other filters, we need to scan the table
    const allRecords = (await query.toArray()) as JsonRecord[];
    return allRecords.filter((record) => {
      return Object.entries(filter).every(([key, value]) => {
        return record[key] === value;
      });
    });
  }

  /**
   * Get all records from a table
   */
  async getAll(table: StorageTableName): Promise<JsonRecord[]> {
    return (await db.table(table).toArray()) as JsonRecord[];
  }

  /**
   * Get record count
   */
  async count(table: StorageTableName): Promise<number> {
    return await db.table(table).count();
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanupExpiredCache(): Promise<number> {
    const now = new Date().toISOString();
    const expired = (await db
      .table("cache")
      .where("expiresAt")
      .below(now)
      .toArray()) as CacheRecord[];

    const count = expired.length;
    if (count > 0) {
      await db.table("cache").bulkDelete(expired.map((r) => r.key));
    }
    return count;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    return await db.getStats();
  }

  /**
   * Database exists check (for initialization)
   */
  async isDatabaseReady(): Promise<boolean> {
    try {
      await db.table("config").count();
      return true;
    } catch {
      return false;
    }
  }
}

// Create singleton instance
export const storageAdapter = new StorageAdapter();

export default storageAdapter;
