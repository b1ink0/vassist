import type {
  StorageAdapterLike,
  StorageMetadata,
  StorageRecord,
  StorageStats,
  StorageTableName,
} from "./types";

export type RemoteStorageMethod = keyof Required<StorageAdapterLike>;

/** The session transport owns authorization and binary asset hydration. */
export interface RemoteStorageTransport {
  request<T>(method: RemoteStorageMethod, args: unknown[]): Promise<T>;
}

/** Uses the desktop repository without creating a browser database copy. */
export class RemoteStorageAdapter implements StorageAdapterLike {
  constructor(private readonly transport: RemoteStorageTransport) {}

  get<T = unknown>(table: StorageTableName, key: string) {
    return this.transport.request<T | StorageRecord | undefined>("get", [
      table,
      key,
    ]);
  }

  getRecord(table: StorageTableName, key: string) {
    return this.transport.request<StorageRecord | undefined>("getRecord", [
      table,
      key,
    ]);
  }

  set<T>(
    table: StorageTableName,
    key: string,
    value: T,
    metadata?: StorageMetadata,
  ) {
    return this.transport.request<boolean>("set", [
      table,
      key,
      value,
      metadata,
    ]);
  }

  remove(table: StorageTableName, key: string) {
    return this.transport.request<boolean>("remove", [table, key]);
  }

  exists(table: StorageTableName, key: string) {
    return this.transport.request<boolean>("exists", [table, key]);
  }

  getMultiple<T = unknown>(table: StorageTableName, keys: string[]) {
    return this.transport.request<Record<string, T | undefined>>(
      "getMultiple",
      [table, keys],
    );
  }

  setMultiple<T>(table: StorageTableName, items: Record<string, T>) {
    return this.transport.request<boolean>("setMultiple", [table, items]);
  }

  clear(table: StorageTableName) {
    return this.transport.request<boolean>("clear", [table]);
  }

  query(table: StorageTableName, filter: StorageRecord) {
    return this.transport.request<StorageRecord[]>("query", [table, filter]);
  }

  queryMetadata(table: StorageTableName, filter: StorageRecord) {
    return this.transport.request<StorageRecord[]>("queryMetadata", [
      table,
      filter,
    ]);
  }

  getAll(table: StorageTableName) {
    return this.transport.request<StorageRecord[]>("getAll", [table]);
  }

  count(table: StorageTableName) {
    return this.transport.request<number>("count", [table]);
  }

  cleanupExpiredCache() {
    return this.transport.request<number>("cleanupExpiredCache", []);
  }

  getStats() {
    return this.transport.request<StorageStats>("getStats", []);
  }

  isDatabaseReady() {
    return this.transport.request<boolean>("isDatabaseReady", []);
  }
}
