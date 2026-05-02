/**
 * @fileoverview Platform-agnostic abstraction for LLM model storage
 */

import { isDesktop, isAndroid } from '../utils/PlatformUtils';

type UnknownRecord = Record<string, unknown>;

interface ModelInfo {
  name: string;
  size: number;
  modified: Date;
}

interface OperationResult {
  success: boolean;
  error?: string;
  filename?: string;
  note?: string;
  canceled?: boolean;
  downloading?: boolean;
  path?: string;
}

interface DownloadProgress {
  percent: number;
  status: string;
}

export interface DiscoveryItem {
  id: string;
  label: string;
  value: string;
  description?: string;
  secondaryLabel?: string;
  downloads?: number;
  likes?: number;
}

export interface DiscoveryResult extends OperationResult {
  items: DiscoveryItem[];
  nextCursor?: string | null;
  total?: number;
}

interface DesktopLLMApi {
  listModels: (customPath?: string | null) => Promise<OperationResult & { models?: ModelInfo[] }>;
  pullModel: (modelName: string, customPath?: string | null) => Promise<OperationResult>;
  downloadModel: (url: string, customPath?: string | null) => Promise<OperationResult>;
  searchOllamaModels: (query: string, page?: number, pageSize?: number) => Promise<DiscoveryResult>;
  listOllamaModelTags: (modelId: string, query?: string, page?: number, pageSize?: number) => Promise<DiscoveryResult>;
  searchHuggingFaceModels: (query: string, cursor?: string, pageSize?: number) => Promise<DiscoveryResult>;
  listHuggingFaceFiles: (repoId: string, query?: string, page?: number, pageSize?: number) => Promise<DiscoveryResult>;
  deleteModel: (filename: string, customPath?: string | null) => Promise<OperationResult>;
  chooseModelFile: () => Promise<{ canceled?: boolean; path?: string }>;
  importModel: (filePath: string, customPath?: string | null) => Promise<OperationResult>;
  chooseModelsFolder: () => Promise<OperationResult & { path?: string }>;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  getBackendStatus: (backend?: string) => Promise<OperationResult & UnknownRecord>;
  installBackend: (backend: string) => Promise<OperationResult & UnknownRecord>;
  cancelBackendInstall: () => Promise<OperationResult & UnknownRecord>;
  onBackendInstallProgress: (callback: (progress: UnknownRecord) => void) => () => void;
}

interface AndroidAIApi {
  listLLMModels?: () => string;
  pullLLMModel?: (modelName: string) => string;
  downloadLLMModel?: (url: string) => string;
  searchOllamaModels?: (query: string, page?: number, pageSize?: number) => string;
  listOllamaModelTags?: (modelId: string, query?: string, page?: number, pageSize?: number) => string;
  searchHuggingFaceModels?: (query: string, cursor?: string, pageSize?: number) => string;
  listHuggingFaceFiles?: (repoId: string, query?: string, page?: number, pageSize?: number) => string;
  deleteLLMModel?: (filename: string) => string;
  importLLMModel?: () => string;
  getLLMModelsDirectory?: () => string;
  _onDownloadComplete?: ((result: OperationResult) => void) | null;
  _onDownloadError?: ((error: string) => void) | null;
  _onDownloadProgress?: ((percent: number, status: string) => void) | null;
  _onImportComplete?: ((result: OperationResult) => void) | null;
}

const parseJsonRecord = <T>(json: string): T => JSON.parse(json) as T;

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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
  async listModels(customPath: string | null = null): Promise<OperationResult & { models: ModelInfo[] }> {
    void customPath;
    throw new Error('listModels() not implemented');
  }

  /**
   * Download model from Ollama registry
   * @param {string} modelName - Ollama model name (e.g., "llama3.2:3b")
   * @param {string|null} customPath - Optional custom storage path
   * @returns {Promise<OperationResult>}
   */
  async downloadFromOllama(modelName: string, customPath: string | null = null): Promise<OperationResult> {
    void modelName;
    void customPath;
    throw new Error('downloadFromOllama() not implemented');
  }

  /**
   * Download model from URL (e.g., HuggingFace)
   * @param {string} url - Direct download URL
   * @param {string|null} customPath - Optional custom storage path
   * @returns {Promise<OperationResult>}
   */
  async downloadFromUrl(url: string, customPath: string | null = null): Promise<OperationResult> {
    void url;
    void customPath;
    throw new Error('downloadFromUrl() not implemented');
  }

  async searchOllamaModels(query: string, page = 1, pageSize = 20): Promise<DiscoveryResult> {
    void query;
    void page;
    void pageSize;
    throw new Error('searchOllamaModels() not implemented');
  }

  async listOllamaModelTags(modelId: string, query = '', page = 1, pageSize = 20): Promise<DiscoveryResult> {
    void modelId;
    void query;
    void page;
    void pageSize;
    throw new Error('listOllamaModelTags() not implemented');
  }

  async searchHuggingFaceModels(query: string, cursor = '', pageSize = 20): Promise<DiscoveryResult> {
    void query;
    void cursor;
    void pageSize;
    throw new Error('searchHuggingFaceModels() not implemented');
  }

  async listHuggingFaceFiles(repoId: string, query = '', page = 1, pageSize = 20): Promise<DiscoveryResult> {
    void repoId;
    void query;
    void page;
    void pageSize;
    throw new Error('listHuggingFaceFiles() not implemented');
  }

  /**
   * Delete a model
   * @param {string} filename - Model filename to delete
   * @param {string|null} customPath - Optional custom storage path
   * @returns {Promise<OperationResult>}
   */
  async deleteModel(filename: string, customPath: string | null = null): Promise<OperationResult> {
    void filename;
    void customPath;
    throw new Error('deleteModel() not implemented');
  }

  /**
   * Import model from file picker
   * @param {string|null} customPath - Optional custom storage path
   * @returns {Promise<OperationResult>}
   */
  async importModel(customPath: string | null = null): Promise<OperationResult> {
    void customPath;
    throw new Error('importModel() not implemented');
  }

  /**
   * Choose custom models folder
   * @returns {Promise<OperationResult & {path?: string}>}
   */
  async chooseModelsFolder(): Promise<OperationResult & { path?: string }> {
    throw new Error('chooseModelsFolder() not implemented');
  }

  /**
   * Subscribe to download progress events
   * @param {function(DownloadProgress): void} callback - Progress callback
   * @returns {function(): void} Unsubscribe function
   */
  onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void {
    void callback;
    throw new Error('onDownloadProgress() not implemented');
  }

  async getBackendStatus(backend = 'auto'): Promise<OperationResult & UnknownRecord> {
    void backend;
    throw new Error('getBackendStatus() not implemented');
  }

  async installBackend(backend: string): Promise<OperationResult & UnknownRecord> {
    void backend;
    throw new Error('installBackend() not implemented');
  }

  async cancelBackendInstall(): Promise<OperationResult & UnknownRecord> {
    throw new Error('cancelBackendInstall() not implemented');
  }

  onBackendInstallProgress(callback: (progress: UnknownRecord) => void): () => void {
    void callback;
    throw new Error('onBackendInstallProgress() not implemented');
  }
}

/**
 * Desktop implementation using Electron IPC via useDesktop hook
 */
class DesktopLLMModelStorage extends LLMModelStorageBase {
  private readonly api: DesktopLLMApi;

  constructor(api: { llm?: DesktopLLMApi } | null) {
    super();
    if (!api?.llm) {
      throw new Error('Desktop API not provided');
    }
    this.api = api.llm;
  }

  async listModels(customPath: string | null = null): Promise<OperationResult & { models: ModelInfo[] }> {
    const result = await this.api.listModels(customPath);
    return {
      ...result,
      models: Array.isArray(result.models) ? result.models : [],
    };
  }

  async downloadFromOllama(modelName: string, customPath: string | null = null): Promise<OperationResult> {
    return await this.api.pullModel(modelName, customPath);
  }

  async downloadFromUrl(url: string, customPath: string | null = null): Promise<OperationResult> {
    return await this.api.downloadModel(url, customPath);
  }

  async searchOllamaModels(query: string, page = 1, pageSize = 20): Promise<DiscoveryResult> {
    return await this.api.searchOllamaModels(query, page, pageSize);
  }

  async listOllamaModelTags(modelId: string, query = '', page = 1, pageSize = 20): Promise<DiscoveryResult> {
    return await this.api.listOllamaModelTags(modelId, query, page, pageSize);
  }

  async searchHuggingFaceModels(query: string, cursor = '', pageSize = 20): Promise<DiscoveryResult> {
    return await this.api.searchHuggingFaceModels(query, cursor, pageSize);
  }

  async listHuggingFaceFiles(repoId: string, query = '', page = 1, pageSize = 20): Promise<DiscoveryResult> {
    return await this.api.listHuggingFaceFiles(repoId, query, page, pageSize);
  }

  async deleteModel(filename: string, customPath: string | null = null): Promise<OperationResult> {
    return await this.api.deleteModel(filename, customPath);
  }

  async importModel(customPath: string | null = null): Promise<OperationResult> {
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

  async chooseModelsFolder(): Promise<OperationResult & { path?: string }> {
    return await this.api.chooseModelsFolder();
  }

  onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void {
    return this.api.onDownloadProgress(callback);
  }

  async getBackendStatus(backend = 'auto'): Promise<OperationResult & UnknownRecord> {
    return await this.api.getBackendStatus(backend);
  }

  async installBackend(backend: string): Promise<OperationResult & UnknownRecord> {
    return await this.api.installBackend(backend);
  }

  async cancelBackendInstall(): Promise<OperationResult & UnknownRecord> {
    return await this.api.cancelBackendInstall();
  }

  onBackendInstallProgress(callback: (progress: UnknownRecord) => void): () => void {
    return this.api.onBackendInstallProgress(callback);
  }
}

/**
 * Android implementation using AndroidAI JavaScript interface
 */
class AndroidLLMModelStorage extends LLMModelStorageBase {
  private api: AndroidAIApi | null;

  constructor(api: AndroidAIApi | null) {
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

  async listModels(customPath: string | null = null): Promise<OperationResult & { models: ModelInfo[] }> {
    try {
      void customPath;
      if (!this.api?.listLLMModels) {
        console.warn('[Android LLM Storage] AndroidAI.listLLMModels not available');
        return { success: true, models: [] };
      }
      
      const resultJson = this.api.listLLMModels();
      const result = parseJsonRecord<OperationResult & { models?: ModelInfo[] }>(resultJson);
      return {
        ...result,
        models: Array.isArray(result.models) ? result.models : [],
      };
    } catch (error) {
      console.error('[Android LLM Storage] listModels error:', error);
      return { success: false, error: toErrorMessage(error), models: [] };
    }
  }

  async downloadFromOllama(modelName: string, customPath: string | null = null): Promise<OperationResult> {
    void customPath;
    console.log('[Android] downloadFromOllama called:', modelName);
    return new Promise<OperationResult>((resolve, reject) => {
      const api = this.api;
      try {
        if (!api?.pullLLMModel) {
          reject(new Error('AndroidAI interface not available'));
          return;
        }
        
        // Set up completion callbacks BEFORE starting download
        api._onDownloadComplete = (result: OperationResult) => {
          console.log('[Android] Download completed:', result);
          // Clean up callbacks
          delete api._onDownloadComplete;
          delete api._onDownloadError;
          resolve(result);
        };
        
        api._onDownloadError = (error: string) => {
          console.log('[Android] Download error:', error);
          // Clean up callbacks
          delete api._onDownloadComplete;
          delete api._onDownloadError;
          reject(new Error(error));
        };
        
        const resultJson = api.pullLLMModel(modelName);
        const result = parseJsonRecord<OperationResult>(resultJson);
        console.log('[Android] pullLLMModel returned:', result);
        
        // Check if download started successfully
        if (!result.success || !result.downloading) {
          console.log('[Android] Download failed to start');
          delete api._onDownloadComplete;
          delete api._onDownloadError;
          reject(new Error(result.error || 'Failed to start download'));
        }
        console.log('[Android] Waiting for download completion...');
        // Otherwise wait for _onDownloadComplete or _onDownloadError to be called
      } catch (error) {
        console.error('[Android LLM Storage] downloadFromOllama error:', error);
        if (api) {
          delete api._onDownloadComplete;
          delete api._onDownloadError;
        }
        reject(error instanceof Error ? error : new Error(toErrorMessage(error)));
      }
    });
  }

  async downloadFromUrl(url: string, customPath: string | null = null): Promise<OperationResult> {
    void customPath;
    return new Promise<OperationResult>((resolve, reject) => {
      const api = this.api;
      try {
        if (!api?.downloadLLMModel) {
          reject(new Error('AndroidAI interface not available'));
          return;
        }
        
        // Set up completion callbacks BEFORE starting download
        api._onDownloadComplete = (result: OperationResult) => {
          // Clean up callbacks
          delete api._onDownloadComplete;
          delete api._onDownloadError;
          resolve(result);
        };
        
        api._onDownloadError = (error: string) => {
          // Clean up callbacks
          delete api._onDownloadComplete;
          delete api._onDownloadError;
          reject(new Error(error));
        };
        
        const resultJson = api.downloadLLMModel(url);
        const result = parseJsonRecord<OperationResult>(resultJson);
        
        // Check if download started successfully
        if (!result.success || !result.downloading) {
          delete api._onDownloadComplete;
          delete api._onDownloadError;
          reject(new Error(result.error || 'Failed to start download'));
        }
        // Otherwise wait for _onDownloadComplete or _onDownloadError to be called
      } catch (error) {
        console.error('[Android LLM Storage] downloadFromUrl error:', error);
        if (api) {
          delete api._onDownloadComplete;
          delete api._onDownloadError;
        }
        reject(error instanceof Error ? error : new Error(toErrorMessage(error)));
      }
    });
  }

  async searchOllamaModels(query: string, page = 1, pageSize = 20): Promise<DiscoveryResult> {
    try {
      if (!this.api?.searchOllamaModels) {
        return { success: false, items: [], error: 'AndroidAI interface not available' };
      }

      const resultJson = this.api.searchOllamaModels(query, page, pageSize);
      const result = parseJsonRecord<DiscoveryResult>(resultJson);
      return {
        ...result,
        items: Array.isArray(result.items) ? result.items : [],
      };
    } catch (error) {
      console.error('[Android LLM Storage] searchOllamaModels error:', error);
      return { success: false, items: [], error: toErrorMessage(error) };
    }
  }

  async listOllamaModelTags(modelId: string, query = '', page = 1, pageSize = 20): Promise<DiscoveryResult> {
    try {
      if (!this.api?.listOllamaModelTags) {
        return { success: false, items: [], error: 'AndroidAI interface not available' };
      }

      const resultJson = this.api.listOllamaModelTags(modelId, query, page, pageSize);
      const result = parseJsonRecord<DiscoveryResult>(resultJson);
      return {
        ...result,
        items: Array.isArray(result.items) ? result.items : [],
      };
    } catch (error) {
      console.error('[Android LLM Storage] listOllamaModelTags error:', error);
      return { success: false, items: [], error: toErrorMessage(error) };
    }
  }

  async searchHuggingFaceModels(query: string, cursor = '', pageSize = 20): Promise<DiscoveryResult> {
    try {
      if (!this.api?.searchHuggingFaceModels) {
        return { success: false, items: [], error: 'AndroidAI interface not available' };
      }

      const resultJson = this.api.searchHuggingFaceModels(query, cursor, pageSize);
      const result = parseJsonRecord<DiscoveryResult>(resultJson);
      return {
        ...result,
        items: Array.isArray(result.items) ? result.items : [],
      };
    } catch (error) {
      console.error('[Android LLM Storage] searchHuggingFaceModels error:', error);
      return { success: false, items: [], error: toErrorMessage(error) };
    }
  }

  async listHuggingFaceFiles(repoId: string, query = '', page = 1, pageSize = 20): Promise<DiscoveryResult> {
    try {
      if (!this.api?.listHuggingFaceFiles) {
        return { success: false, items: [], error: 'AndroidAI interface not available' };
      }

      const resultJson = this.api.listHuggingFaceFiles(repoId, query, page, pageSize);
      const result = parseJsonRecord<DiscoveryResult>(resultJson);
      return {
        ...result,
        items: Array.isArray(result.items) ? result.items : [],
      };
    } catch (error) {
      console.error('[Android LLM Storage] listHuggingFaceFiles error:', error);
      return { success: false, items: [], error: toErrorMessage(error) };
    }
  }

  async deleteModel(filename: string, customPath: string | null = null): Promise<OperationResult> {
    try {
      void customPath;
      if (!this.api?.deleteLLMModel) {
        return { success: false, error: 'AndroidAI interface not available' };
      }
      
      const resultJson = this.api.deleteLLMModel(filename);
      const result = parseJsonRecord<OperationResult>(resultJson);
      return result;
    } catch (error) {
      console.error('[Android LLM Storage] deleteModel error:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  }

  async importModel(customPath: string | null = null): Promise<OperationResult> {
    void customPath;
    try {
      if (!this.api?.importLLMModel) {
        return { success: false, error: 'AndroidAI interface not available' };
      }

      // Set up callback for import completion
      return new Promise<OperationResult>((resolve) => {
        const api = this.api;
        if (!api) {
          resolve({ success: false, error: 'AndroidAI interface not available' });
          return;
        }

        if (!api._onImportComplete) {
          api._onImportComplete = (result: OperationResult) => {
            console.log('[Android LLM Storage] Import completed:', result);
            resolve(result);
          };
        }

        if (!api.importLLMModel) {
          resolve({ success: false, error: 'AndroidAI interface not available' });
          return;
        }

        const resultJson = api.importLLMModel();
        const result = parseJsonRecord<OperationResult>(resultJson);
        
        if (!result.success) {
          resolve(result);
        }
      });
    } catch (error) {
      console.error('[Android LLM Storage] importModel error:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  }

  async chooseModelsFolder(): Promise<OperationResult & { path?: string }> {
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

  onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void {
    // Set up event listener for Android download progress
    // Kotlin calls window.AndroidAI._onDownloadProgress(percent, status)
    if (this.api) {
      this.api._onDownloadProgress = (percent: number, status: string) => {
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

  async getBackendStatus(backend = 'auto'): Promise<OperationResult & UnknownRecord> {
    void backend;
    return {
      success: false,
      error: 'Backend management is not available on Android'
    };
  }

  async installBackend(backend: string): Promise<OperationResult & UnknownRecord> {
    void backend;
    return {
      success: false,
      error: 'Backend management is not available on Android'
    };
  }

  async cancelBackendInstall(): Promise<OperationResult & UnknownRecord> {
    return {
      success: false,
      error: 'Backend management is not available on Android'
    };
  }

  onBackendInstallProgress(callback: (progress: UnknownRecord) => void): () => void {
    void callback;
    return () => {};
  }
}

/**
 * Factory function to get the appropriate storage implementation
 * @param {Object} api - Platform API (Desktop API from useDesktop or AndroidAI from useAndroid)
 * @returns {LLMModelStorageBase}
 */
export function getLLMModelStorage(api: { llm?: DesktopLLMApi } | AndroidAIApi | null = null): LLMModelStorageBase {
  if (isDesktop) {
    return new DesktopLLMModelStorage(api as { llm?: DesktopLLMApi } | null);
  } else if (isAndroid) {
    return new AndroidLLMModelStorage(api as AndroidAIApi | null);
  } else {
    throw new Error('LLM model storage not available on this platform');
  }
}

export default {
  getLLMModelStorage
};
