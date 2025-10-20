/**
 * Storage Adapter
 * 
 * Core abstraction layer for all storage operations.
 * Works with Dexie IndexedDB and provides a clean API.
 * Handles automatic timestamp management and basic validation.
 */

import { db } from './DatabaseSchema.js';

export class StorageAdapter {
  /**
   * Get a value from storage
   * @param {string} table - Table name (config, settings, cache, chat, files, sessions, data)
   * @param {string} key - Primary key
   * @returns {Promise<*>} Stored value or undefined
   */
  async get(table, key) {
    try {
      const record = await db.table(table).get(key);
      
      // Chat table stores the full chat object, not wrapped in 'value'
      if (table === 'chat') {
        return record;  // Return the whole chat record
      }
      
      // Files table stores data in 'value' field
      if (table === 'files') {
        return record?.value;
      }
      
      // Other tables also use 'value' field
      return record?.value;
    } catch (error) {
      console.error(`[StorageAdapter] Failed to get ${table}.${key}:`, error);
      throw error;
    }
  }

  /**
   * Get full record with metadata
   * @param {string} table - Table name
   * @param {string} key - Primary key
   * @returns {Promise<Object|undefined>} Full record with metadata
   */
  async getRecord(table, key) {
    try {
      return await db.table(table).get(key);
    } catch (error) {
      console.error(`[StorageAdapter] Failed to get record ${table}.${key}:`, error);
      throw error;
    }
  }

  /**
   * Set a value in storage
   * @param {string} table - Table name
   * @param {string} key - Primary key
   * @param {*} value - Value to store (will be stored in 'value' field)
   * @param {Object} metadata - Optional metadata (category, tags, etc.)
   * @returns {Promise<boolean>} Success status
   */
  async set(table, key, value, metadata = {}) {
    try {
      let record;
      
      // Different tables have different primary key field names
      if (table === 'chat') {
        // Chat table stores the full chat object directly, no 'value' wrapper
        record = {
          ...value,  // Chat data should have chatId, title, messages, etc.
          chatId: key,  // Ensure chatId is set as primary key
          updatedAt: new Date().toISOString(),
        };
      } else if (table === 'files') {
        // Files table uses fileId as primary key
        record = {
          fileId: key,
          value,
          createdAt: metadata.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...metadata,
        };
      } else {
        // Other tables use 'key' as primary key
        record = {
          key,
          value,
          createdAt: metadata.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...metadata,
        };
      }

      await db.table(table).put(record);
      return true;
    } catch (error) {
      console.error(`[StorageAdapter] Failed to set ${table}.${key}:`, error);
      throw error;
    }
  }

  /**
   * Remove a value from storage
   * @param {string} table - Table name
   * @param {string} key - Primary key
   * @returns {Promise<boolean>} Success status
   */
  async remove(table, key) {
    try {
      await db.table(table).delete(key);
      return true;
    } catch (error) {
      console.error(`[StorageAdapter] Failed to remove ${table}.${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if a key exists
   * @param {string} table - Table name
   * @param {string} key - Primary key
   * @returns {Promise<boolean>} True if exists
   */
  async exists(table, key) {
    try {
      // Different tables have different primary key field names
      let query = db.table(table);
      
      if (table === 'chat') {
        query = query.where('chatId');
      } else if (table === 'files') {
        query = query.where('fileId');
      } else {
        query = query.where('key');
      }
      
      const count = await query.equals(key).count();
      return count > 0;
    } catch (error) {
      console.error(`[StorageAdapter] Failed to check existence ${table}.${key}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple values
   * @param {string} table - Table name
   * @param {string[]} keys - Array of keys
   * @returns {Promise<Object>} Object with key-value pairs
   */
  async getMultiple(table, keys) {
    try {
      const records = await db.table(table).bulkGet(keys);
      const result = {};
      records.forEach((record, index) => {
        result[keys[index]] = record?.value;
      });
      return result;
    } catch (error) {
      console.error(`[StorageAdapter] Failed to get multiple from ${table}:`, error);
      throw error;
    }
  }

  /**
   * Set multiple values at once
   * @param {string} table - Table name
   * @param {Object} items - Object with key-value pairs
   * @param {Object} metadata - Optional metadata to apply to all items
   * @returns {Promise<boolean>} Success status
   */
  async setMultiple(table, items, metadata = {}) {
    try {
      const now = new Date().toISOString();
      const records = Object.entries(items).map(([key, value]) => ({
        key,
        value,
        createdAt: now,
        updatedAt: now,
        ...metadata,
      }));

      await db.table(table).bulkPut(records);
      return true;
    } catch (error) {
      console.error(`[StorageAdapter] Failed to set multiple in ${table}:`, error);
      throw error;
    }
  }

  /**
   * Clear all records in a table
   * @param {string} table - Table name
   * @returns {Promise<boolean>} Success status
   */
  async clear(table) {
    try {
      await db.table(table).clear();
      return true;
    } catch (error) {
      console.error(`[StorageAdapter] Failed to clear ${table}:`, error);
      throw error;
    }
  }

  /**
   * Query records by filter
   * @param {string} table - Table name
   * @param {Object} filter - Filter object (e.g., { category: 'chat' })
   * @returns {Promise<Array>} Matching records
   */
  async query(table, filter) {
    try {
      let query = db.table(table);
      
      // Build query based on filter
      if (filter.key) {
        return [await this.getRecord(table, filter.key)].filter(Boolean);
      }

      // For other filters, we need to scan the table
      const allRecords = await query.toArray();
      return allRecords.filter(record => {
        return Object.entries(filter).every(([key, value]) => {
          if (key === 'key') return record.key === value;
          return record[key] === value;
        });
      });
    } catch (error) {
      console.error(`[StorageAdapter] Failed to query ${table}:`, error);
      throw error;
    }
  }

  /**
   * Get all records from a table
   * @param {string} table - Table name
   * @returns {Promise<Array>} All records
   */
  async getAll(table) {
    try {
      return await db.table(table).toArray();
    } catch (error) {
      console.error(`[StorageAdapter] Failed to get all from ${table}:`, error);
      throw error;
    }
  }

  /**
   * Get record count
   * @param {string} table - Table name
   * @returns {Promise<number>} Record count
   */
  async count(table) {
    try {
      return await db.table(table).count();
    } catch (error) {
      console.error(`[StorageAdapter] Failed to count ${table}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup expired cache entries
   * @returns {Promise<number>} Number of records deleted
   */
  async cleanupExpiredCache() {
    try {
      const now = new Date().toISOString();
      const expired = await db.table('cache')
        .where('expiresAt')
        .below(now)
        .toArray();
      
      const count = expired.length;
      if (count > 0) {
        await db.table('cache').bulkDelete(expired.map(r => r.key));
        console.log(`[StorageAdapter] Cleaned up ${count} expired cache entries`);
      }
      return count;
    } catch (error) {
      console.error('[StorageAdapter] Failed to cleanup cache:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>} Storage stats per table
   */
  async getStats() {
    try {
      return await db.getStats();
    } catch (error) {
      console.error('[StorageAdapter] Failed to get stats:', error);
      throw error;
    }
  }

  /**
   * Database exists check (for initialization)
   * @returns {Promise<boolean>} True if database is accessible
   */
  async isDatabaseReady() {
    try {
      await db.table('config').count();
      return true;
    } catch {
      return false;
    }
  }
}

// Create singleton instance
export const storageAdapter = new StorageAdapter();

export default storageAdapter;
