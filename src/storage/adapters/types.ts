export type StorageTableName =
  | "config"
  | "settings"
  | "cache"
  | "chat"
  | "files"
  | "sessions"
  | "data";

export type StorageStats = Record<string, number>;
export type StorageRecord = Record<string, unknown>;
export type StorageMetadata = StorageRecord;

export interface StorageAdapterLike {
  get<T = unknown>(
    table: StorageTableName,
    key: string,
  ): Promise<T | StorageRecord | undefined>;
  getRecord(
    table: StorageTableName,
    key: string,
  ): Promise<StorageRecord | undefined>;
  set<T>(
    table: StorageTableName,
    key: string,
    value: T,
    metadata?: StorageMetadata,
  ): Promise<boolean>;
  remove(table: StorageTableName, key: string): Promise<boolean>;
  exists(table: StorageTableName, key: string): Promise<boolean>;
  getMultiple<T = unknown>(
    table: StorageTableName,
    keys: string[],
  ): Promise<Record<string, T | undefined>>;
  setMultiple<T>(
    table: StorageTableName,
    items: Record<string, T>,
  ): Promise<boolean>;
  clear(table: StorageTableName): Promise<boolean>;
  query(
    table: StorageTableName,
    filter: StorageRecord,
  ): Promise<StorageRecord[]>;
  getAll(table: StorageTableName): Promise<StorageRecord[]>;
  count(table: StorageTableName): Promise<number>;
  cleanupExpiredCache(): Promise<number>;
  getStats(): Promise<StorageStats>;
  isDatabaseReady?(): Promise<boolean>;
}
