import dexieStorageAdapter from "./adapters/DexieStorageAdapter";
import { createMemoryStorageAdapter } from "./adapters/MemoryStorageAdapter";
import type { StorageAdapterLike } from "./adapters/types";

export type StorageAdapterSelection = "dexie" | "memory" | StorageAdapterLike;

const registeredStorageAdapters = new Map<string, StorageAdapterLike>([
  ["dexie", dexieStorageAdapter],
  ["memory", createMemoryStorageAdapter()],
]);

let defaultStorageAdapterSelection: StorageAdapterSelection = "dexie";

export function registerStorageAdapter(
  name: string,
  adapter: StorageAdapterLike,
): void {
  registeredStorageAdapters.set(name, adapter);
}

export function getRegisteredStorageAdapter(
  name: string,
): StorageAdapterLike | undefined {
  return registeredStorageAdapters.get(name);
}

export function listRegisteredStorageAdapters(): string[] {
  return Array.from(registeredStorageAdapters.keys());
}

export function resolveStorageAdapter(
  selection?: StorageAdapterSelection,
): StorageAdapterLike {
  const resolvedSelection = selection ?? defaultStorageAdapterSelection;

  if (typeof resolvedSelection === "string") {
    const registeredAdapter = registeredStorageAdapters.get(resolvedSelection);
    if (!registeredAdapter) {
      throw new Error(`Unknown storage adapter: ${resolvedSelection}`);
    }
    return registeredAdapter;
  }

  return resolvedSelection;
}

export function setDefaultStorageAdapter(
  selection: StorageAdapterSelection,
): void {
  defaultStorageAdapterSelection = selection;
}

export function getDefaultStorageAdapter(): StorageAdapterLike {
  return resolveStorageAdapter(defaultStorageAdapterSelection);
}
