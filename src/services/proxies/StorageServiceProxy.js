/**
 * Storage Service Proxy
 * 
 * Dual-mode wrapper for storage operations.
 * Dev mode: Direct access to StorageManager
 * Extension mode: Message bridge to background worker
 */

import { ServiceProxy } from './ServiceProxy.js';
import { storageManager as devStorageManager } from '../../storage/StorageManager.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';

class StorageServiceProxy extends ServiceProxy {
  constructor() {
    super('StorageService');
    this.devStorageManager = devStorageManager;
  }

  /**
   * CONFIG NAMESPACE
   */

  async configSave(key, value) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_SAVE, { key, value });
    } else {
      return await this.devStorageManager.config.save(key, value);
    }
  }

  async configLoad(key, defaultValue = null) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_LOAD, { key, defaultValue });
    } else {
      return await this.devStorageManager.config.load(key, defaultValue);
    }
  }

  async configExists(key) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_EXISTS, { key });
    } else {
      return await this.devStorageManager.config.exists(key);
    }
  }

  async configRemove(key) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_REMOVE, { key });
    } else {
      return await this.devStorageManager.config.remove(key);
    }
  }

  async configGetAll() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_GET_ALL, {});
    } else {
      return await this.devStorageManager.config.getAll();
    }
  }

  async configClear() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_CLEAR, {});
    } else {
      return await this.devStorageManager.config.clear();
    }
  }

  /**
   * SETTINGS NAMESPACE
   */

  async settingsSave(key, value) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_SAVE, { key, value });
    } else {
      return await this.devStorageManager.settings.save(key, value);
    }
  }

  async settingsLoad(key, defaultValue = null) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_LOAD, { key, defaultValue });
    } else {
      return await this.devStorageManager.settings.load(key, defaultValue);
    }
  }

  async settingsExists(key) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_EXISTS, { key });
    } else {
      return await this.devStorageManager.settings.exists(key);
    }
  }

  async settingsRemove(key) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_REMOVE, { key });
    } else {
      return await this.devStorageManager.settings.remove(key);
    }
  }

  async settingsGetAll() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_GET_ALL, {});
    } else {
      return await this.devStorageManager.settings.getAll();
    }
  }

  async settingsClear() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_CLEAR, {});
    } else {
      return await this.devStorageManager.settings.clear();
    }
  }

  /**
   * CACHE NAMESPACE
   */

  async cacheSave(key, value, ttlSeconds = 3600) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_SAVE, { key, value, ttlSeconds });
    } else {
      return await this.devStorageManager.cache.save(key, value, ttlSeconds);
    }
  }

  async cacheLoad(key) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_LOAD, { key });
    } else {
      return await this.devStorageManager.cache.load(key);
    }
  }

  async cacheExists(key) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_EXISTS, { key });
    } else {
      return await this.devStorageManager.cache.exists(key);
    }
  }

  async cacheRemove(key) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_REMOVE, { key });
    } else {
      return await this.devStorageManager.cache.remove(key);
    }
  }

  async cacheGetAll() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_GET_ALL, {});
    } else {
      return await this.devStorageManager.cache.getAll();
    }
  }

  async cacheCleanup() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_CLEANUP, {});
    } else {
      return await this.devStorageManager.cache.cleanup();
    }
  }

  async cacheClear() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_CLEAR, {});
    } else {
      return await this.devStorageManager.cache.clear();
    }
  }

  /**
   * CHAT NAMESPACE
   */

  async chatSave(chatId, data) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_SAVE, { chatId, data });
    } else {
      return await this.devStorageManager.chat.save(chatId, data);
    }
  }

  async chatLoad(chatId) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_LOAD, { chatId });
    } else {
      return await this.devStorageManager.chat.load(chatId);
    }
  }

  async chatExists(chatId) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_EXISTS, { chatId });
    } else {
      return await this.devStorageManager.chat.exists(chatId);
    }
  }

  async chatRemove(chatId) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_REMOVE, { chatId });
    } else {
      return await this.devStorageManager.chat.remove(chatId);
    }
  }

  async chatGetAll() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_GET_ALL, {});
    } else {
      return await this.devStorageManager.chat.getAll();
    }
  }

  async chatClear() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_CLEAR, {});
    } else {
      return await this.devStorageManager.chat.clear();
    }
  }

  /**
   * FILES NAMESPACE
   */

  async fileSave(fileId, data, category = 'general') {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_FILE_SAVE, { fileId, data, category });
    } else {
      return await this.devStorageManager.files.save(fileId, data, category);
    }
  }

  async fileLoad(fileId) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_FILE_LOAD, { fileId });
    } else {
      return await this.devStorageManager.files.load(fileId);
    }
  }

  async fileExists(fileId) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_FILE_EXISTS, { fileId });
    } else {
      return await this.devStorageManager.files.exists(fileId);
    }
  }

  async fileRemove(fileId) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_FILE_REMOVE, { fileId });
    } else {
      return await this.devStorageManager.files.remove(fileId);
    }
  }

  async filesGetAll() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_FILES_GET_ALL, {});
    } else {
      return await this.devStorageManager.files.getAll();
    }
  }

  async filesGetByCategory(category) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_FILES_GET_BY_CATEGORY, { category });
    } else {
      return await this.devStorageManager.files.getByCategory(category);
    }
  }

  async filesClear() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_FILES_CLEAR, {});
    } else {
      return await this.devStorageManager.files.clear();
    }
  }

  /**
   * DATA NAMESPACE
   */

  async dataSave(key, value, category = 'general') {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_SAVE, { key, value, category });
    } else {
      return await this.devStorageManager.data.save(key, value, category);
    }
  }

  async dataLoad(key) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_LOAD, { key });
    } else {
      return await this.devStorageManager.data.load(key);
    }
  }

  async dataExists(key) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_EXISTS, { key });
    } else {
      return await this.devStorageManager.data.exists(key);
    }
  }

  async dataRemove(key) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_REMOVE, { key });
    } else {
      return await this.devStorageManager.data.remove(key);
    }
  }

  async dataGetAll() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_GET_ALL, {});
    } else {
      return await this.devStorageManager.data.getAll();
    }
  }

  async dataGetByCategory(category) {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_GET_BY_CATEGORY, { category });
    } else {
      return await this.devStorageManager.data.getByCategory(category);
    }
  }

  async dataClear() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_CLEAR, {});
    } else {
      return await this.devStorageManager.data.clear();
    }
  }

  /**
   * UTILITY METHODS
   */

  async getStats() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_GET_STATS, {});
    } else {
      return await this.devStorageManager.getStats();
    }
  }

  async clearAll() {
    if (this.isExtension) {
      const bridge = this.getBridge();
      return await bridge.sendMessage(MessageTypes.STORAGE_CLEAR_ALL, {});
    } else {
      return await this.devStorageManager.clearAll();
    }
  }
}

// Create singleton instance
export const storageServiceProxy = new StorageServiceProxy();

export default storageServiceProxy;
