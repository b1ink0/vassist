/**
 * Storage Module - Central export for all storage functionality
 */

export { db } from './DatabaseSchema.js';
export { storageAdapter } from './StorageAdapter.js';
export { storageManager } from './StorageManager.js';

// Default export for convenience
import { storageManager } from './StorageManager.js';
export default storageManager;
