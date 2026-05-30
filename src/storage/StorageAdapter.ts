export {
  DexieStorageAdapter as StorageAdapter,
  dexieStorageAdapter as storageAdapter,
} from "./adapters/DexieStorageAdapter";
export type {
  StorageAdapterLike,
  StorageMetadata,
  StorageRecord,
  StorageStats,
  StorageTableName,
} from "./adapters/types";

export { dexieStorageAdapter as default } from "./adapters/DexieStorageAdapter";
