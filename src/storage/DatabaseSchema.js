/**
 * Unified Database Schema
 * 
 * Centralized Dexie IndexedDB schema for both dev and extension modes.
 * All storage goes through this unified interface.
 */

import Dexie from 'dexie';

class VassistDatabase extends Dexie {
  constructor() {
    super('VassistDB');

    // Define database schema
    // Version 1: Initial schema with core storage tables
    this.version(1).stores({
      // Config table: Stores configuration and settings
      // Primary key: key (unique config key)
      // Indexes: updatedAt (for sorting/filtering by modification time)
      config: 'key, updatedAt',

      // Settings table: Stores user preferences and UI settings
      // Similar structure but separate from config for organization
      settings: 'key, updatedAt',

      // Cache table: Temporary data and cache entries with TTL
      // Primary key: key
      // Indexes: updatedAt, expiresAt (for automatic cleanup)
      cache: 'key, expiresAt, updatedAt',

      // Chat table: Stores chat history and messages
      // Primary key: chatId (unique per chat session)
      // Indexes: createdAt, updatedAt (for chronological access)
      chat: 'chatId, createdAt, updatedAt',

      // Files table: Extensible for future file storage
      // Primary key: fileId
      // Indexes: fileName, createdAt, category (for organization)
      files: 'fileId, fileName, createdAt, category',

      // Sessions table: For tracking user sessions across tabs/contexts
      // Primary key: sessionId
      // Indexes: createdAt, lastActivity
      sessions: 'sessionId, createdAt, lastActivity',

      // Data table: General purpose key-value storage for any feature data
      // Primary key: key
      // Indexes: category (for grouping related data)
      data: 'key, category, updatedAt',
    });

    console.log('[VassistDatabase] Schema initialized');
  }

  /**
   * Clear all tables (for development/testing only)
   */
  async clearAll() {
    console.log('[VassistDatabase] Clearing all data...');
    await this.tables.forEach(table => table.clear());
  }

  /**
   * Get database statistics
   */
  async getStats() {
    const stats = {};
    for (const table of this.tables) {
      stats[table.name] = await table.count();
    }
    return stats;
  }
}

// Create singleton instance
export const db = new VassistDatabase();

export default db;
