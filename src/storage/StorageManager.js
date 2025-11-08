/**
 * Storage Manager
 * 
 * High-level storage interface combining old StorageManager and StorageService functionality.
 * Works seamlessly across dev and extension modes.
 * 
 * Architecture:
 * - storageManager.config.*  : Configuration storage (like old StorageManager)
 * - storageManager.settings.* : User settings and preferences
 * - storageManager.cache.*    : Temporary cache data with TTL support
 * - storageManager.chat.*     : Chat history and messages
 * - storageManager.files.*    : File storage (extensible for future)
 * - storageManager.data.*     : Generic key-value storage by category
 * - storageManager.db.*       : Direct database adapter access for advanced usage
 */

import { storageAdapter } from './StorageAdapter.js';

export class StorageManager {
  constructor() {
    this.adapter = storageAdapter;
    
    // Namespace for configuration storage (replaces old StorageManager)
    this.config = {
      save: (key, value) => this._configSave(key, value),
      load: (key, defaultValue) => this._configLoad(key, defaultValue),
      exists: (key) => this._configExists(key),
      remove: (key) => this._configRemove(key),
      getAll: () => this._configGetAll(),
      clear: () => this._configClear(),
    };

    // Namespace for settings storage
    this.settings = {
      save: (key, value) => this._settingsSave(key, value),
      load: (key, defaultValue) => this._settingsLoad(key, defaultValue),
      exists: (key) => this._settingsExists(key),
      remove: (key) => this._settingsRemove(key),
      getAll: () => this._settingsGetAll(),
      clear: () => this._settingsClear(),
    };

    // Namespace for cache storage with TTL
    this.cache = {
      save: (key, value, ttlSeconds) => this._cacheSave(key, value, ttlSeconds),
      load: (key) => this._cacheLoad(key),
      exists: (key) => this._cacheExists(key),
      remove: (key) => this._cacheRemove(key),
      getAll: () => this._cacheGetAll(),
      clear: () => this._cacheClear(),
      cleanup: () => this.adapter.cleanupExpiredCache(),
    };

    // Namespace for chat storage
    this.chat = {
      save: (chatId, data) => this._chatSave(chatId, data),
      load: (chatId) => this._chatLoad(chatId),
      exists: (chatId) => this._chatExists(chatId),
      remove: (chatId) => this._chatRemove(chatId),
      getAll: () => this._chatGetAll(),
      clear: () => this._chatClear(),
    };

    // Namespace for file storage
    this.files = {
      save: (fileId, data, category) => this._fileSave(fileId, data, category),
      load: (fileId) => this._fileLoad(fileId),
      exists: (fileId) => this._fileExists(fileId),
      remove: (fileId) => this._fileRemove(fileId),
      getAll: () => this._filesGetAll(),
      getByCategory: (category) => this._filesGetByCategory(category),
      clear: () => this._filesClear(),
    };

    // Namespace for generic data storage by category
    this.data = {
      save: (key, value, category) => this._dataSave(key, value, category),
      load: (key) => this._dataLoad(key),
      exists: (key) => this._dataExists(key),
      remove: (key) => this._dataRemove(key),
      getAll: () => this._dataGetAll(),
      getByCategory: (category) => this._dataGetByCategory(category),
      clear: () => this._dataClear(),
    };

    // Direct database adapter access for advanced usage
    this.db = this.adapter;

    // Note: Don't use Logger.log in constructor to avoid circular dependency with singleton initialization
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    return await this.adapter.getStats();
  }

  // CONFIG NAMESPACE METHODS
  async _configSave(key, value) {
    return await this.adapter.set('config', key, value);
  }

  async _configLoad(key, defaultValue = null) {
    const value = await this.adapter.get('config', key);
    return value !== undefined ? value : defaultValue;
  }

  async _configExists(key) {
    return await this.adapter.exists('config', key);
  }

  async _configRemove(key) {
    return await this.adapter.remove('config', key);
  }

  async _configGetAll() {
    const records = await this.adapter.getAll('config');
    const result = {};
    records.forEach(record => {
      result[record.key] = record.value;
    });
    return result;
  }

  async _configClear() {
    return await this.adapter.clear('config');
  }

  // SETTINGS NAMESPACE METHODS
  async _settingsSave(key, value) {
    return await this.adapter.set('settings', key, value);
  }

  async _settingsLoad(key, defaultValue = null) {
    const value = await this.adapter.get('settings', key);
    return value !== undefined ? value : defaultValue;
  }

  async _settingsExists(key) {
    return await this.adapter.exists('settings', key);
  }

  async _settingsRemove(key) {
    return await this.adapter.remove('settings', key);
  }

  async _settingsGetAll() {
    const records = await this.adapter.getAll('settings');
    const result = {};
    records.forEach(record => {
      result[record.key] = record.value;
    });
    return result;
  }

  async _settingsClear() {
    return await this.adapter.clear('settings');
  }

  // CACHE NAMESPACE METHODS (with TTL support)
  async _cacheSave(key, value, ttlSeconds = 3600) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    
    return await this.adapter.set('cache', key, value, { expiresAt });
  }

  async _cacheLoad(key) {
    const record = await this.adapter.getRecord('cache', key);
    
    if (!record) return undefined;

    // Check if expired
    const expiresAt = record.expiresAt ? new Date(record.expiresAt) : null;
    if (expiresAt && expiresAt < new Date()) {
      await this.adapter.remove('cache', key);
      return undefined;
    }

    return record.value;
  }

  async _cacheExists(key) {
    const record = await this.adapter.getRecord('cache', key);
    if (!record) return false;

    // Check if expired
    const expiresAt = record.expiresAt ? new Date(record.expiresAt) : null;
    if (expiresAt && expiresAt < new Date()) {
      await this.adapter.remove('cache', key);
      return false;
    }

    return true;
  }

  async _cacheRemove(key) {
    return await this.adapter.remove('cache', key);
  }

  async _cacheGetAll() {
    const records = await this.adapter.getAll('cache');
    const now = new Date();
    const result = {};
    
    for (const record of records) {
      const expiresAt = record.expiresAt ? new Date(record.expiresAt) : null;
      if (!expiresAt || expiresAt >= now) {
        result[record.key] = record.value;
      }
    }
    
    return result;
  }

  async _cacheClear() {
    return await this.adapter.clear('cache');
  }

  // CHAT NAMESPACE METHODS
  async _chatSave(chatId, data) {
    return await this.adapter.set('chat', chatId, data);
  }

  async _chatLoad(chatId) {
    return await this.adapter.get('chat', chatId);
  }

  async _chatExists(chatId) {
    return await this.adapter.exists('chat', chatId);
  }

  async _chatRemove(chatId) {
    return await this.adapter.remove('chat', chatId);
  }

  async _chatGetAll() {
    const records = await this.adapter.getAll('chat');
    const result = {};
    records.forEach(record => {
      // Chat records are stored as complete objects, not wrapped in 'value'
      result[record.chatId] = record;
    });
    return result;
  }

  async _chatClear() {
    return await this.adapter.clear('chat');
  }

  // FILES NAMESPACE METHODS
  async _fileSave(fileId, data, category = 'general') {
    return await this.adapter.set('files', fileId, data, { category });
  }

  async _fileLoad(fileId) {
    return await this.adapter.get('files', fileId);
  }

  async _fileExists(fileId) {
    return await this.adapter.exists('files', fileId);
  }

  async _fileRemove(fileId) {
    return await this.adapter.remove('files', fileId);
  }

  async _filesGetAll() {
    const records = await this.adapter.getAll('files');
    const result = {};
    records.forEach(record => {
      result[record.fileId] = record.value;
    });
    return result;
  }

  async _filesGetByCategory(category) {
    const records = await this.adapter.query('files', { category });
    const result = {};
    records.forEach(record => {
      result[record.fileId] = record.value;
    });
    return result;
  }

  async _filesClear() {
    return await this.adapter.clear('files');
  }

  // DATA NAMESPACE METHODS
  async _dataSave(key, value, category = 'general') {
    return await this.adapter.set('data', key, value, { category });
  }

  async _dataLoad(key) {
    return await this.adapter.get('data', key);
  }

  async _dataExists(key) {
    return await this.adapter.exists('data', key);
  }

  async _dataRemove(key) {
    return await this.adapter.remove('data', key);
  }

  async _dataGetAll() {
    const records = await this.adapter.getAll('data');
    const result = {};
    records.forEach(record => {
      result[record.key] = record.value;
    });
    return result;
  }

  async _dataGetByCategory(category) {
    const records = await this.adapter.query('data', { category });
    const result = {};
    records.forEach(record => {
      result[record.key] = record.value;
    });
    return result;
  }

  async _dataClear() {
    return await this.adapter.clear('data');
  }

  /**
   * Clear all storage (development/testing only)
   */
  async clearAll() {
    return await this.adapter.db.clearAll();
  }
}

// Create singleton instance
export const storageManager = new StorageManager();

export default storageManager;
