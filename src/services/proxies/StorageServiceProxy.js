/**
 * Storage Service Proxy
 * 
 * Dual-mode wrapper for storage operations.
 * Dev mode: Direct access to StorageManager
 * Extension mode: Message bridge to background worker
 */

import { ServiceProxy } from './ServiceProxy.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';

// In dev mode, we need StorageManager, so use a lazy-loaded module reference
// In extension mode, this will never be used
let devStorageManagerPromise = null;

const initDevStorageManager = async () => {
  if (devStorageManagerPromise) {
    return devStorageManagerPromise;
  }
  
  if (__EXTENSION_MODE__) {
    return null;
  }
  
  devStorageManagerPromise = import('../../storage/StorageManager.js')
    .then(module => module.storageManager)
    .catch(err => {
      return null;
    });
  
  return devStorageManagerPromise;
};

class StorageServiceProxy extends ServiceProxy {
  constructor() {
    super('StorageService');
    this._devStorageManagerPromise = null;
  }

  async _getDevStorageManager() {
    if (!this._devStorageManagerPromise) {
      this._devStorageManagerPromise = initDevStorageManager();
    }
    return await this._devStorageManagerPromise;
  }

  get devStorageManager() {
    // Return the promise for backwards compatibility
    // Methods that sync-accessed this will get a Promise instead
    // So we need to handle this differently
    return null;
  }

  /**
   * CONFIG NAMESPACE
   */

  async configSave(key, value) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_SAVE, { key, value });
    } else {
      const manager = await this._getDevStorageManager();
      return await manager.config.save(key, value);
    }
  }

  async configLoad(key, defaultValue = null) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_LOAD, { key, defaultValue });
    } else {
      const manager = await this._getDevStorageManager();
      return await manager.config.load(key, defaultValue);
    }
  }

  async configExists(key) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_EXISTS, { key });
    } else {
      const manager = await this._getDevStorageManager();
      return await manager.config.exists(key);
    }
  }

  async configRemove(key) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_REMOVE, { key });
    } else {
      const manager = await this._getDevStorageManager();
      return await manager.config.remove(key);
    }
  }

  async configGetAll() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_GET_ALL, {});
    } else {
      const manager = await this._getDevStorageManager();
      return await manager.config.getAll();
    }
  }

  async configClear() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_CLEAR, {});
    } else {
      const manager = await this._getDevStorageManager();
      return await manager.config.clear();
    }
  }

  /**
   * SETTINGS NAMESPACE
   */

  async settingsSave(key, value) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_SAVE, { key, value });
    } else {
      return await (await this._getDevStorageManager()).settings.save(key, value);
    }
  }

  async settingsLoad(key, defaultValue = null) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_LOAD, { key, defaultValue });
    } else {
      return await (await this._getDevStorageManager()).settings.load(key, defaultValue);
    }
  }

  async settingsExists(key) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_EXISTS, { key });
    } else {
      return await (await this._getDevStorageManager()).settings.exists(key);
    }
  }

  async settingsRemove(key) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_REMOVE, { key });
    } else {
      return await (await this._getDevStorageManager()).settings.remove(key);
    }
  }

  async settingsGetAll() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_GET_ALL, {});
    } else {
      return await (await this._getDevStorageManager()).settings.getAll();
    }
  }

  async settingsClear() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_CLEAR, {});
    } else {
      return await (await this._getDevStorageManager()).settings.clear();
    }
  }

  /**
   * CACHE NAMESPACE
   */

  async cacheSave(key, value, ttlSeconds = 3600) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_SAVE, { key, value, ttlSeconds });
    } else {
      return await (await this._getDevStorageManager()).cache.save(key, value, ttlSeconds);
    }
  }

  async cacheLoad(key) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_LOAD, { key });
    } else {
      return await (await this._getDevStorageManager()).cache.load(key);
    }
  }

  async cacheExists(key) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_EXISTS, { key });
    } else {
      return await (await this._getDevStorageManager()).cache.exists(key);
    }
  }

  async cacheRemove(key) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_REMOVE, { key });
    } else {
      return await (await this._getDevStorageManager()).cache.remove(key);
    }
  }

  async cacheGetAll() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_GET_ALL, {});
    } else {
      return await (await this._getDevStorageManager()).cache.getAll();
    }
  }

  async cacheCleanup() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_CLEANUP, {});
    } else {
      return await (await this._getDevStorageManager()).cache.cleanup();
    }
  }

  async cacheClear() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_CLEAR, {});
    } else {
      return await (await this._getDevStorageManager()).cache.clear();
    }
  }

  /**
   * CHAT NAMESPACE
   */

  async chatSave(chatId, data) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_SAVE, { chatId, data });
    } else {
      return await (await this._getDevStorageManager()).chat.save(chatId, data);
    }
  }

  async chatLoad(chatId) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_LOAD, { chatId });
    } else {
      return await (await this._getDevStorageManager()).chat.load(chatId);
    }
  }

  async chatExists(chatId) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_EXISTS, { chatId });
    } else {
      return await (await this._getDevStorageManager()).chat.exists(chatId);
    }
  }

  async chatRemove(chatId) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_REMOVE, { chatId });
    } else {
      return await (await this._getDevStorageManager()).chat.remove(chatId);
    }
  }

  async chatGetAll() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_GET_ALL, {});
    } else {
      return await (await this._getDevStorageManager()).chat.getAll();
    }
  }

  async chatClear() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_CLEAR, {});
    } else {
      return await (await this._getDevStorageManager()).chat.clear();
    }
  }

  /**
   * FILES NAMESPACE
   */

  async fileSave(fileId, data, category = 'general') {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      
      // Convert Blobs to Arrays for message serialization (structured clone limitation)
      let messageData = data;
      if (data && typeof data === 'object') {
        messageData = { ...data };
        if (messageData.data instanceof Blob) {
          const buffer = await messageData.data.arrayBuffer();
          messageData.data = Array.from(new Uint8Array(buffer));
          messageData._blobType = data.data.type || 'application/octet-stream';
        }
      }
      
      return await bridge.sendMessage(MessageTypes.STORAGE_FILE_SAVE, { fileId, data: messageData, category });
    } else {
      return await (await this._getDevStorageManager()).files.save(fileId, data, category);
    }
  }

  async fileLoad(fileId) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      const result = await bridge.sendMessage(MessageTypes.STORAGE_FILE_LOAD, { fileId });
      
      // Convert Arrays back to Blobs if needed
      if (result && typeof result === 'object' && Array.isArray(result.data)) {
        const blobType = result._blobType || 'application/octet-stream';
        const uint8Array = new Uint8Array(result.data);
        const blob = new Blob([uint8Array], { type: blobType });
        result.data = blob;
        delete result._blobType;
      }
      
      return result;
    } else {
      return await (await this._getDevStorageManager()).files.load(fileId);
    }
  }

  async fileExists(fileId) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_FILE_EXISTS, { fileId });
    } else {
      return await (await this._getDevStorageManager()).files.exists(fileId);
    }
  }

  async fileRemove(fileId) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_FILE_REMOVE, { fileId });
    } else {
      return await (await this._getDevStorageManager()).files.remove(fileId);
    }
  }

  async filesGetAll() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_FILES_GET_ALL, {});
    } else {
      return await (await this._getDevStorageManager()).files.getAll();
    }
  }

  async filesGetByCategory(category) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_FILES_GET_BY_CATEGORY, { category });
    } else {
      return await (await this._getDevStorageManager()).files.getByCategory(category);
    }
  }

  async filesClear() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_FILES_CLEAR, {});
    } else {
      return await (await this._getDevStorageManager()).files.clear();
    }
  }

  /**
   * DATA NAMESPACE
   */

  async dataSave(key, value, category = 'general') {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_SAVE, { key, value, category });
    } else {
      return await (await this._getDevStorageManager()).data.save(key, value, category);
    }
  }

  async dataLoad(key) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_LOAD, { key });
    } else {
      return await (await this._getDevStorageManager()).data.load(key);
    }
  }

  async dataExists(key) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_EXISTS, { key });
    } else {
      return await (await this._getDevStorageManager()).data.exists(key);
    }
  }

  async dataRemove(key) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_REMOVE, { key });
    } else {
      return await (await this._getDevStorageManager()).data.remove(key);
    }
  }

  async dataGetAll() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_GET_ALL, {});
    } else {
      return await (await this._getDevStorageManager()).data.getAll();
    }
  }

  async dataGetByCategory(category) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_GET_BY_CATEGORY, { category });
    } else {
      return await (await this._getDevStorageManager()).data.getByCategory(category);
    }
  }

  async dataClear() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_CLEAR, {});
    } else {
      return await (await this._getDevStorageManager()).data.clear();
    }
  }

  /**
   * UTILITY METHODS
   */

  async getStats() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_GET_STATS, {});
    } else {
      return await (await this._getDevStorageManager()).getStats();
    }
  }

  async clearAll() {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CLEAR_ALL, {});
    } else {
      return await (await this._getDevStorageManager()).clearAll();
    }
  }
}

// Create singleton instance
export const storageServiceProxy = new StorageServiceProxy();

export default storageServiceProxy;
