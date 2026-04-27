/**
 * Storage Module - Central export for all storage functionality
 * 
 * In dev mode: Exports storageManager for direct use
 * In extension mode: Does NOT export storageManager (use StorageServiceProxy instead)
 */

export { db } from './DatabaseSchema.js';
export { storageAdapter } from './StorageAdapter.js';
export { storageManager } from './StorageManager.js';

// Default export for convenience (dev mode only)
import { storageManager } from './StorageManager.js';
export default storageManager;
