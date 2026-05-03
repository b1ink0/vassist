/**
 * Storage Module - Central export for all storage functionality
 *
 * In dev mode: Exports storageManager for direct use
 * In extension mode: Does NOT export storageManager (use StorageServiceProxy instead)
 */

export { db } from "./DatabaseSchema";
export { storageAdapter } from "./StorageAdapter";
export { storageManager } from "./StorageManager";

// Default export for convenience (dev mode only)
import { storageManager } from "./StorageManager";
export default storageManager;
