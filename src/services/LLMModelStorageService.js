/**
 * @fileoverview Platform-agnostic abstraction for LLM model storage
 */

import { isDesktop, isAndroid } from '../utils/PlatformUtils';

/**
 * Model information object
 * @typedef {Object} ModelInfo
 * @property {string} name - Model filename
 * @property {number} size - File size in bytes
 * @property {Date} modified - Last modified date
 */

/**
 * Operation result object
 * @typedef {Object} OperationResult
 * @property {boolean} success - Whether operation succeeded
 * @property {string} [error] - Error message if failed
 * @property {string} [filename] - Resulting filename if successful
 * @property {string} [note] - Additional information
 */

/**
 * Download progress object
 * @typedef {Object} DownloadProgress
 * @property {number} percent - Progress percentage (0-100)
 * @property {string} status - Status message
 */

/**
 * Base class for LLM model storage operations
 * Platform-specific implementations must override all methods
 */
class LLMModelStorageBase {
  /**
   * List all available models
   * @param {string|null} customPath - Optional custom storage path
   * @returns {Promise<OperationResult & {models: ModelInfo[]}>}
   */
  async listModels(customPath = null) {
    throw new Error('listModels() not implemented');
  }

  /**
   * Download model from Ollama registry
   * @param {string} modelName - Ollama model name (e.g., "llama3.2:3b")
   * @param {string|null} customPath - Optional custom storage path
   * @returns {Promise<OperationResult>}
   */
  async downloadFromOllama(modelName, customPath = null) {
    throw new Error('downloadFromOllama() not implemented');
  }

  /**
   * Download model from URL (e.g., HuggingFace)
   * @param {string} url - Direct download URL
   * @param {string|null} customPath - Optional custom storage path
   * @returns {Promise<OperationResult>}
   */
  async downloadFromUrl(url, customPath = null) {
    throw new Error('downloadFromUrl() not implemented');
  }

  /**
   * Delete a model
   * @param {string} filename - Model filename to delete
   * @param {string|null} customPath - Optional custom storage path
   * @returns {Promise<OperationResult>}
   */
  async deleteModel(filename, customPath = null) {
    throw new Error('deleteModel() not implemented');
  }

  /**
   * Import model from file picker
   * @param {string|null} customPath - Optional custom storage path
   * @returns {Promise<OperationResult>}
   */
  async importModel(customPath = null) {
    throw new Error('importModel() not implemented');
  }

  /**
   * Choose custom models folder
   * @returns {Promise<OperationResult & {path?: string}>}
   */
  async chooseModelsFolder() {
    throw new Error('chooseModelsFolder() not implemented');
  }

  /**
   * Subscribe to download progress events
   * @param {function(DownloadProgress): void} callback - Progress callback
   * @returns {function(): void} Unsubscribe function
   */
  onDownloadProgress(callback) {
    throw new Error('onDownloadProgress() not implemented');
  }

  async getBackendStatus(backend = 'auto') {
    throw new Error('getBackendStatus() not implemented');
  }

  async installBackend(backend) {
    throw new Error('installBackend() not implemented');
  }

  async cancelBackendInstall() {
    throw new Error('cancelBackendInstall() not implemented');
  }

  onBackendInstallProgress(callback) {
    throw new Error('onBackendInstallProgress() not implemented');
  }
}

/**
 * Desktop implementation using Electron IPC via useDesktop hook
 */
class DesktopLLMModelStorage extends LLMModelStorageBase {
  constructor(api) {
    super();
    if (!api?.llm) {
      throw new Error('Desktop API not provided');
    }
    this.api = api.llm;
  }

  async listModels(customPath = null) {
    return await this.api.listModels(customPath);
  }

  async downloadFromOllama(modelName, customPath = null) {
    return await this.api.pullModel(modelName, customPath);
  }

  async downloadFromUrl(url, customPath = null) {
    return await this.api.downloadModel(url, customPath);
  }

  async deleteModel(filename, customPath = null) {
    return await this.api.deleteModel(filename, customPath);
  }

  async importModel(customPath = null) {
    // Desktop uses file dialog, handled by chooseModelFile + importModel
    const fileResult = await this.api.chooseModelFile();
    
    if (fileResult?.canceled || !fileResult?.path) {
      return { success: false, canceled: true };
    }

    const filePath = fileResult.path;
    
    if (!filePath.endsWith('.gguf')) {
      return { success: false, error: 'Only .gguf files are supported' };
    }
    
    return await this.api.importModel(filePath, customPath);
  }

  async chooseModelsFolder() {
    return await this.api.chooseModelsFolder();
  }

  onDownloadProgress(callback) {
    return this.api.onDownloadProgress(callback);
  }

  async getBackendStatus(backend = 'auto') {
    return await this.api.getBackendStatus(backend);
  }

  async installBackend(backend) {
    return await this.api.installBackend(backend);
  }

  async cancelBackendInstall() {
    return await this.api.cancelBackendInstall();
  }

  onBackendInstallProgress(callback) {
    return this.api.onBackendInstallProgress(callback);
  }
}

/**
 * Android implementation using AndroidAI JavaScript interface
 */
class AndroidLLMModelStorage extends LLMModelStorageBase {
  constructor(api) {
    super();
    if (!isAndroid) {
      throw new Error('Android platform not detected');
    }
    // Use AndroidAI interface from context
    this.api = api;
    if (!this.api) {
      console.warn('[Android LLM Storage] AndroidAI interface not available yet - waiting for initialization');
    }
  }

  async listModels(customPath = null) {
    try {
      if (!this.api?.listLLMModels) {
        console.warn('[Android LLM Storage] AndroidAI.listLLMModels not available');
        return { success: true, models: [] };
      }
      
      const resultJson = this.api.listLLMModels();
      const result = JSON.parse(resultJson);
      return result;
    } catch (error) {
      console.error('[Android LLM Storage] listModels error:', error);
      return { success: false, error: error.message };
    }
  }

  async downloadFromOllama(modelName, customPath = null) {
    console.log('[Android] downloadFromOllama called:', modelName);
    return new Promise((resolve, reject) => {
      try {
        if (!this.api?.pullLLMModel) {
          reject(new Error('AndroidAI interface not available'));
          return;
        }
        
        // Set up completion callbacks BEFORE starting download
        this.api._onDownloadComplete = (result) => {
          console.log('[Android] Download completed:', result);
          // Clean up callbacks
          delete this.api._onDownloadComplete;
          delete this.api._onDownloadError;
          resolve(result);
        };
        
        this.api._onDownloadError = (error) => {
          console.log('[Android] Download error:', error);
          // Clean up callbacks
          delete this.api._onDownloadComplete;
          delete this.api._onDownloadError;
          reject(new Error(error));
        };
        
        const resultJson = this.api.pullLLMModel(modelName);
        const result = JSON.parse(resultJson);
        console.log('[Android] pullLLMModel returned:', result);
        
        // Check if download started successfully
        if (!result.success || !result.downloading) {
          console.log('[Android] Download failed to start');
          delete this.api._onDownloadComplete;
          delete this.api._onDownloadError;
          reject(new Error(result.error || 'Failed to start download'));
        }
        console.log('[Android] Waiting for download completion...');
        // Otherwise wait for _onDownloadComplete or _onDownloadError to be called
      } catch (error) {
        console.error('[Android LLM Storage] downloadFromOllama error:', error);
        delete this.api._onDownloadComplete;
        delete this.api._onDownloadError;
        reject(error);
      }
    });
  }

  async downloadFromUrl(url, customPath = null) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.api?.downloadLLMModel) {
          reject(new Error('AndroidAI interface not available'));
          return;
        }
        
        // Set up completion callbacks BEFORE starting download
        this.api._onDownloadComplete = (result) => {
          // Clean up callbacks
          delete this.api._onDownloadComplete;
          delete this.api._onDownloadError;
          resolve(result);
        };
        
        this.api._onDownloadError = (error) => {
          // Clean up callbacks
          delete this.api._onDownloadComplete;
          delete this.api._onDownloadError;
          reject(new Error(error));
        };
        
        const resultJson = this.api.downloadLLMModel(url);
        const result = JSON.parse(resultJson);
        
        // Check if download started successfully
        if (!result.success || !result.downloading) {
          delete this.api._onDownloadComplete;
          delete this.api._onDownloadError;
          reject(new Error(result.error || 'Failed to start download'));
        }
        // Otherwise wait for _onDownloadComplete or _onDownloadError to be called
      } catch (error) {
        console.error('[Android LLM Storage] downloadFromUrl error:', error);
        delete this.api._onDownloadComplete;
        delete this.api._onDownloadError;
        reject(error);
      }
    });
  }

  async deleteModel(filename, customPath = null) {
    try {
      if (!this.api?.deleteLLMModel) {
        return { success: false, error: 'AndroidAI interface not available' };
      }
      
      const resultJson = this.api.deleteLLMModel(filename);
      const result = JSON.parse(resultJson);
      return result;
    } catch (error) {
      console.error('[Android LLM Storage] deleteModel error:', error);
      return { success: false, error: error.message };
    }
  }

  async importModel(customPath = null) {
    try {
      if (!this.api?.importLLMModel) {
        return { success: false, error: 'AndroidAI interface not available' };
      }

      // Set up callback for import completion
      return new Promise((resolve) => {
        if (!window.AndroidAI._onImportComplete) {
          window.AndroidAI._onImportComplete = (result) => {
            console.log('[Android LLM Storage] Import completed:', result);
            resolve(result);
          };
        }

        const resultJson = this.api.importLLMModel();
        const result = JSON.parse(resultJson);
        
        if (!result.success) {
          resolve(result);
        }
      });
    } catch (error) {
      console.error('[Android LLM Storage] importModel error:', error);
      return { success: false, error: error.message };
    }
  }

  async chooseModelsFolder() {
    // Android uses fixed external storage location
    try {
      if (this.api?.getLLMModelsDirectory) {
        const path = this.api.getLLMModelsDirectory();
        return { 
          success: true,
          path: path,
          note: 'Android uses fixed external storage location'
        };
      }
    } catch (error) {
      console.error('[Android LLM Storage] chooseModelsFolder error:', error);
    }
    
    return { 
      success: false, 
      error: 'Custom folders not supported on Android - models stored in app external storage' 
    };
  }

  onDownloadProgress(callback) {
    // Set up event listener for Android download progress
    // Kotlin calls window.AndroidAI._onDownloadProgress(percent, status)
    if (this.api) {
      this.api._onDownloadProgress = (percent, status) => {
        callback({ percent, status });
      };
      
      // Return unsubscribe function
      return () => {
        if (this.api) {
          this.api._onDownloadProgress = null;
        }
      };
    }
    
    return () => {}; // No-op if AndroidAI not available
  }

  async getBackendStatus(backend = 'auto') {
    return {
      success: false,
      error: 'Backend management is not available on Android'
    };
  }

  async installBackend(backend) {
    return {
      success: false,
      error: 'Backend management is not available on Android'
    };
  }

  async cancelBackendInstall() {
    return {
      success: false,
      error: 'Backend management is not available on Android'
    };
  }

  onBackendInstallProgress(callback) {
    return () => {};
  }
}

/**
 * Factory function to get the appropriate storage implementation
 * @param {Object} api - Platform API (Desktop API from useDesktop or AndroidAI from useAndroid)
 * @returns {LLMModelStorageBase}
 */
export function getLLMModelStorage(api = null) {
  if (isDesktop) {
    return new DesktopLLMModelStorage(api);
  } else if (isAndroid) {
    return new AndroidLLMModelStorage(api);
  } else {
    throw new Error('LLM model storage not available on this platform');
  }
}

export default {
  getLLMModelStorage
};
