/**
 * Storage Service Proxy
 * 
 * Dual-mode wrapper for storage operations.
 * Dev mode: Direct access to StorageManager
 * Extension mode: Message bridge to background worker
 */

import { ServiceProxy } from './ServiceProxy';
import { MessageTypes } from '../../../extension/shared/MessageTypes';
import { isExtension } from '../../utils/PlatformUtils';

type StorageRecord = Record<string, unknown>;

interface StorageManagerLike {
  config: {
    save(key: string, value: unknown): Promise<unknown>;
    load(key: string, defaultValue?: unknown): Promise<unknown>;
    exists(key: string): Promise<unknown>;
    remove(key: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  settings: {
    save(key: string, value: unknown): Promise<unknown>;
    load(key: string, defaultValue?: unknown): Promise<unknown>;
    exists(key: string): Promise<unknown>;
    remove(key: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  cache: {
    save(key: string, value: unknown, ttlSeconds?: number): Promise<unknown>;
    load(key: string): Promise<unknown>;
    exists(key: string): Promise<unknown>;
    remove(key: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    cleanup(): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  chat: {
    save(chatId: string, data: unknown): Promise<unknown>;
    load(chatId: string): Promise<unknown>;
    exists(chatId: string): Promise<unknown>;
    remove(chatId: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  files: {
    save(fileId: string, data: unknown, category?: string): Promise<unknown>;
    load(fileId: string): Promise<unknown>;
    exists(fileId: string): Promise<unknown>;
    remove(fileId: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    getByCategory(category: string): Promise<unknown>;
    getMetadataByCategory(category: string): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  data: {
    save(key: string, value: unknown, category?: string): Promise<unknown>;
    load(key: string): Promise<unknown>;
    exists(key: string): Promise<unknown>;
    remove(key: string): Promise<unknown>;
    getAll(): Promise<unknown>;
    getByCategory(category: string): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  getStats?(): Promise<unknown>;
  clearAll?(): Promise<unknown>;
}

// In dev mode, we need StorageManager, so use a lazy-loaded module reference
// In extension mode, this will never be used
let devStorageManagerPromise: Promise<StorageManagerLike | null> | null = null;

const initDevStorageManager = async (): Promise<StorageManagerLike | null> => {
  if (devStorageManagerPromise) {
    return devStorageManagerPromise;
  }
  
  if (isExtension) {
    return null;
  }
  
  devStorageManagerPromise = import('../../storage/StorageManager')
    .then(module => module.storageManager)
    .catch((err: unknown) => {
      return null;
    });
  
  return devStorageManagerPromise;
};

class StorageServiceProxy extends ServiceProxy {
  private _devStorageManagerPromise: Promise<StorageManagerLike | null> | null;

  constructor() {
    super('StorageService');
    this._devStorageManagerPromise = null;
  }

  async _getDevStorageManager(): Promise<StorageManagerLike> {
    if (!this._devStorageManagerPromise) {
      this._devStorageManagerPromise = initDevStorageManager();
    }
    const manager = await this._devStorageManagerPromise;
    if (!manager) {
      throw new Error('StorageServiceProxy: Dev StorageManager not available');
    }
    return manager;
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

  async configSave(key: string, value: unknown): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_SAVE, { key, value });
    } else {
      const manager = await this._getDevStorageManager();
      return await manager.config.save(key, value);
    }
  }

  async configLoad(key: string, defaultValue: unknown = null): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_LOAD, { key, defaultValue });
    } else {
      const manager = await this._getDevStorageManager();
      return await manager.config.load(key, defaultValue);
    }
  }

  async configExists(key: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_EXISTS, { key });
    } else {
      const manager = await this._getDevStorageManager();
      return await manager.config.exists(key);
    }
  }

  async configRemove(key: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_REMOVE, { key });
    } else {
      const manager = await this._getDevStorageManager();
      return await manager.config.remove(key);
    }
  }

  async configGetAll(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CONFIG_GET_ALL, {});
    } else {
      const manager = await this._getDevStorageManager();
      return await manager.config.getAll();
    }
  }

  async configClear(): Promise<unknown> {
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

  async settingsSave(key: string, value: unknown): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_SAVE, { key, value });
    } else {
      return await (await this._getDevStorageManager()).settings.save(key, value);
    }
  }

  async settingsLoad(key: string, defaultValue: unknown = null): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_LOAD, { key, defaultValue });
    } else {
      return await (await this._getDevStorageManager()).settings.load(key, defaultValue);
    }
  }

  async settingsExists(key: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_EXISTS, { key });
    } else {
      return await (await this._getDevStorageManager()).settings.exists(key);
    }
  }

  async settingsRemove(key: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_REMOVE, { key });
    } else {
      return await (await this._getDevStorageManager()).settings.remove(key);
    }
  }

  async settingsGetAll(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_SETTINGS_GET_ALL, {});
    } else {
      return await (await this._getDevStorageManager()).settings.getAll();
    }
  }

  async settingsClear(): Promise<unknown> {
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

  async cacheSave(key: string, value: unknown, ttlSeconds = 3600): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_SAVE, { key, value, ttlSeconds });
    } else {
      return await (await this._getDevStorageManager()).cache.save(key, value, ttlSeconds);
    }
  }

  async cacheLoad(key: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_LOAD, { key });
    } else {
      return await (await this._getDevStorageManager()).cache.load(key);
    }
  }

  async cacheExists(key: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_EXISTS, { key });
    } else {
      return await (await this._getDevStorageManager()).cache.exists(key);
    }
  }

  async cacheRemove(key: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_REMOVE, { key });
    } else {
      return await (await this._getDevStorageManager()).cache.remove(key);
    }
  }

  async cacheGetAll(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_GET_ALL, {});
    } else {
      return await (await this._getDevStorageManager()).cache.getAll();
    }
  }

  async cacheCleanup(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CACHE_CLEANUP, {});
    } else {
      return await (await this._getDevStorageManager()).cache.cleanup();
    }
  }

  async cacheClear(): Promise<unknown> {
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

  async chatSave(chatId: string, data: unknown): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_SAVE, { chatId, data });
    } else {
      return await (await this._getDevStorageManager()).chat.save(chatId, data);
    }
  }

  async chatLoad(chatId: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_LOAD, { chatId });
    } else {
      return await (await this._getDevStorageManager()).chat.load(chatId);
    }
  }

  async chatExists(chatId: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_EXISTS, { chatId });
    } else {
      return await (await this._getDevStorageManager()).chat.exists(chatId);
    }
  }

  async chatRemove(chatId: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_REMOVE, { chatId });
    } else {
      return await (await this._getDevStorageManager()).chat.remove(chatId);
    }
  }

  async chatGetAll(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CHAT_GET_ALL, {});
    } else {
      return await (await this._getDevStorageManager()).chat.getAll();
    }
  }

  async chatClear(): Promise<unknown> {
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

  async fileSave(fileId: string, data: unknown, category = 'general'): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      
      // Convert Blobs to Arrays for message serialization (structured clone limitation)
      let messageData: unknown = data;
      if (data && typeof data === 'object') {
        const sourceData = data as StorageRecord;
        const mutableData: StorageRecord = { ...sourceData };
        messageData = mutableData;
        
        // Handle data.data (general file storage)
        if (mutableData.data instanceof Blob) {
          const blob = mutableData.data;
          const buffer = await blob.arrayBuffer();
          mutableData.data = Array.from(new Uint8Array(buffer));
          mutableData._blobType = blob.type || 'application/octet-stream';
        }
        
        // Handle motionData (MotionStorageService)
        if (mutableData.motionData instanceof Blob) {
          const blob = mutableData.motionData;
          const buffer = await blob.arrayBuffer();
          mutableData.motionData = Array.from(new Uint8Array(buffer));
          mutableData._motionBlobType = blob.type || 'application/octet-stream';
        }

        // Handle audioData (EmoteStorageService)
        if (mutableData.audioData instanceof Blob) {
          const blob = mutableData.audioData;
          const buffer = await blob.arrayBuffer();
          mutableData.audioData = Array.from(new Uint8Array(buffer));
          mutableData._audioBlobType = blob.type || 'audio/mpeg';
        }

        // Handle cameraData (EmoteStorageService)
        if (mutableData.cameraData instanceof Blob) {
          const blob = mutableData.cameraData;
          const buffer = await blob.arrayBuffer();
          mutableData.cameraData = Array.from(new Uint8Array(buffer));
          mutableData._cameraBlobType = blob.type || 'application/octet-stream';
        }
        
        // Handle modelData (ModelStorageService)
        if (mutableData.modelData instanceof Blob) {
          const blob = mutableData.modelData;
          const buffer = await blob.arrayBuffer();
          mutableData.modelData = Array.from(new Uint8Array(buffer));
          mutableData._modelBlobType = blob.type || 'application/octet-stream';
        }
        
        // Handle stageData (StageStorageService)
        if (mutableData.stageData instanceof Blob) {
          const blob = mutableData.stageData;
          const buffer = await blob.arrayBuffer();
          mutableData.stageData = Array.from(new Uint8Array(buffer));
          mutableData._stageBlobType = blob.type || 'application/octet-stream';
        }
      }
      
      return await bridge.sendMessage(MessageTypes.STORAGE_FILE_SAVE, { fileId, data: messageData, category });
    } else {
      return await (await this._getDevStorageManager()).files.save(fileId, data, category);
    }
  }

  async fileLoad(fileId: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      const result = await bridge.sendMessage(MessageTypes.STORAGE_FILE_LOAD, { fileId });
      
      // Convert Arrays back to Blobs if needed
      if (result && typeof result === 'object') {
        const mutableResult = result as StorageRecord;
        // Handle data.data (general file storage)
        if (Array.isArray(mutableResult.data)) {
          const blobType = (mutableResult._blobType as string | undefined) || 'application/octet-stream';
          const uint8Array = new Uint8Array(mutableResult.data);
          const blob = new Blob([uint8Array], { type: blobType });
          mutableResult.data = blob;
          delete mutableResult._blobType;
        }
        
        // Handle motionData (MotionStorageService)
        if (Array.isArray(mutableResult.motionData)) {
          const blobType = (mutableResult._motionBlobType as string | undefined) || 'application/octet-stream';
          const uint8Array = new Uint8Array(mutableResult.motionData);
          const blob = new Blob([uint8Array], { type: blobType });
          mutableResult.motionData = blob;
          delete mutableResult._motionBlobType;
        }

        // Handle audioData (EmoteStorageService)
        if (Array.isArray(mutableResult.audioData)) {
          const blobType = (mutableResult._audioBlobType as string | undefined) || 'audio/mpeg';
          const uint8Array = new Uint8Array(mutableResult.audioData);
          const blob = new Blob([uint8Array], { type: blobType });
          mutableResult.audioData = blob;
          delete mutableResult._audioBlobType;
        }

        // Handle cameraData (EmoteStorageService)
        if (Array.isArray(mutableResult.cameraData)) {
          const blobType = (mutableResult._cameraBlobType as string | undefined) || 'application/octet-stream';
          const uint8Array = new Uint8Array(mutableResult.cameraData);
          const blob = new Blob([uint8Array], { type: blobType });
          mutableResult.cameraData = blob;
          delete mutableResult._cameraBlobType;
        }
        
        // Handle modelData (ModelStorageService)
        if (Array.isArray(mutableResult.modelData)) {
          const blobType = (mutableResult._modelBlobType as string | undefined) || 'application/octet-stream';
          const uint8Array = new Uint8Array(mutableResult.modelData);
          const blob = new Blob([uint8Array], { type: blobType });
          mutableResult.modelData = blob;
          delete mutableResult._modelBlobType;
        }
        
        // Handle stageData (StageStorageService)
        if (Array.isArray(mutableResult.stageData)) {
          const blobType = (mutableResult._stageBlobType as string | undefined) || 'application/octet-stream';
          const uint8Array = new Uint8Array(mutableResult.stageData);
          const blob = new Blob([uint8Array], { type: blobType });
          mutableResult.stageData = blob;
          delete mutableResult._stageBlobType;
        }
      }
      
      return result;
    } else {
      return await (await this._getDevStorageManager()).files.load(fileId);
    }
  }

  async fileExists(fileId: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_FILE_EXISTS, { fileId });
    } else {
      return await (await this._getDevStorageManager()).files.exists(fileId);
    }
  }

  async fileRemove(fileId: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_FILE_REMOVE, { fileId });
    } else {
      return await (await this._getDevStorageManager()).files.remove(fileId);
    }
  }

  async filesGetAll(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_FILES_GET_ALL, {});
    } else {
      return await (await this._getDevStorageManager()).files.getAll();
    }
  }

  async filesGetByCategory(category: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      const files = await bridge.sendMessage(MessageTypes.STORAGE_FILES_GET_BY_CATEGORY, { category });
      
      // Convert Arrays back to Blobs for all files
      if (files && typeof files === 'object') {
        const mutableFiles = files as Record<string, StorageRecord>;
        for (const fileData of Object.values(mutableFiles)) {
          if (fileData && typeof fileData === 'object') {
            // Handle data.data (general file storage)
            if (Array.isArray(fileData.data)) {
              const blobType = (fileData._blobType as string | undefined) || 'application/octet-stream';
              const uint8Array = new Uint8Array(fileData.data);
              fileData.data = new Blob([uint8Array], { type: blobType });
              delete fileData._blobType;
            }
            
            // Handle motionData (MotionStorageService)
            if (Array.isArray(fileData.motionData)) {
              const blobType = (fileData._motionBlobType as string | undefined) || 'application/octet-stream';
              const uint8Array = new Uint8Array(fileData.motionData);
              fileData.motionData = new Blob([uint8Array], { type: blobType });
              delete fileData._motionBlobType;
            }

            // Handle audioData (EmoteStorageService)
            if (Array.isArray(fileData.audioData)) {
              const blobType = (fileData._audioBlobType as string | undefined) || 'audio/mpeg';
              const uint8Array = new Uint8Array(fileData.audioData);
              fileData.audioData = new Blob([uint8Array], { type: blobType });
              delete fileData._audioBlobType;
            }

            // Handle cameraData (EmoteStorageService)
            if (Array.isArray(fileData.cameraData)) {
              const blobType = (fileData._cameraBlobType as string | undefined) || 'application/octet-stream';
              const uint8Array = new Uint8Array(fileData.cameraData);
              fileData.cameraData = new Blob([uint8Array], { type: blobType });
              delete fileData._cameraBlobType;
            }
            
            // Handle modelData (ModelStorageService)
            if (Array.isArray(fileData.modelData)) {
              const blobType = (fileData._modelBlobType as string | undefined) || 'application/octet-stream';
              const uint8Array = new Uint8Array(fileData.modelData);
              fileData.modelData = new Blob([uint8Array], { type: blobType });
              delete fileData._modelBlobType;
            }
            
            // Handle stageData (StageStorageService)
            if (Array.isArray(fileData.stageData)) {
              const blobType = (fileData._stageBlobType as string | undefined) || 'application/octet-stream';
              const uint8Array = new Uint8Array(fileData.stageData);
              fileData.stageData = new Blob([uint8Array], { type: blobType });
              delete fileData._stageBlobType;
            }
          }
        }
      }
      
      return files;
    } else {
      return await (await this._getDevStorageManager()).files.getByCategory(category);
    }
  }

  async filesGetMetadataByCategory(category: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_FILES_GET_METADATA_BY_CATEGORY, { category });
    } else {
      return await (await this._getDevStorageManager()).files.getMetadataByCategory(category);
    }
  }

  async filesClear(): Promise<unknown> {
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

  async dataSave(key: string, value: unknown, category = 'general'): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_SAVE, { key, value, category });
    } else {
      return await (await this._getDevStorageManager()).data.save(key, value, category);
    }
  }

  async dataLoad(key: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_LOAD, { key });
    } else {
      return await (await this._getDevStorageManager()).data.load(key);
    }
  }

  async dataExists(key: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_EXISTS, { key });
    } else {
      return await (await this._getDevStorageManager()).data.exists(key);
    }
  }

  async dataRemove(key: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_REMOVE, { key });
    } else {
      return await (await this._getDevStorageManager()).data.remove(key);
    }
  }

  async dataGetAll(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_GET_ALL, {});
    } else {
      return await (await this._getDevStorageManager()).data.getAll();
    }
  }

  async dataGetByCategory(category: string): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_DATA_GET_BY_CATEGORY, { category });
    } else {
      return await (await this._getDevStorageManager()).data.getByCategory(category);
    }
  }

  async dataClear(): Promise<unknown> {
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

  async getStats(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_GET_STATS, {});
    } else {
      const manager = await this._getDevStorageManager();
      if (!manager.getStats) {
        throw new Error('StorageServiceProxy: getStats is not supported by StorageManager');
      }
      return await manager.getStats();
    }
  }

  async clearAll(): Promise<unknown> {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('StorageServiceProxy: Bridge not available');
      return await bridge.sendMessage(MessageTypes.STORAGE_CLEAR_ALL, {});
    } else {
      const manager = await this._getDevStorageManager();
      if (!manager.clearAll) {
        throw new Error('StorageServiceProxy: clearAll is not supported by StorageManager');
      }
      return await manager.clearAll();
    }
  }
}

// Create singleton instance
export const storageServiceProxy = new StorageServiceProxy();

export default storageServiceProxy;
