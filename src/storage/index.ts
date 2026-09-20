/**
 * Storage Module - Central export for all storage functionality
 *
 * In dev mode: Exports storageManager for direct use
 * In extension mode: Does NOT export storageManager (use StorageServiceProxy instead)
 */

export { db } from "./DatabaseSchema";
export { storageAdapter } from "./StorageAdapter";
export { storageManager } from "./StorageManager";
export {
  getDefaultStorageAdapter,
  getRegisteredStorageAdapter,
  listRegisteredStorageAdapters,
  registerStorageAdapter,
  resolveStorageAdapter,
  setDefaultStorageAdapter,
  type StorageAdapterSelection,
} from "./StorageAdapterRegistry";
export { createStorageManager } from "./StorageManager";
export {
  DexieStorageAdapter,
  dexieStorageAdapter,
} from "./adapters/DexieStorageAdapter";
export {
  createMemoryStorageAdapter,
  MemoryStorageAdapter,
} from "./adapters/MemoryStorageAdapter";
export type {
  StorageAdapterLike,
  StorageMetadata,
  StorageRecord,
  StorageStats,
  StorageTableName,
} from "./adapters/types";

// Default export for convenience (dev mode only)
import { storageManager } from "./StorageManager";
export default storageManager;
