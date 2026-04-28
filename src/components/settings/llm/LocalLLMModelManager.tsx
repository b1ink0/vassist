import { useState, useEffect } from 'react';
import { Icon } from '../../icons';
import Toggle from '../../common/Toggle';
import { Button, Input } from '../../ui';
import { cn } from '../../../utils/cn';

interface ModelEntry {
  name: string;
  size: number;
  modified?: string | Date;
  hasImageSupport?: boolean;
}

interface DownloadProgress {
  percent: number;
  status: string;
}

interface StorageResult {
  success?: boolean;
  error?: string;
  note?: string;
  filename?: string;
  canceled?: boolean;
  path?: string;
  models?: ModelEntry[];
}

interface LLMStorageServiceLike {
  listModels: (customPath?: string | null) => Promise<StorageResult>;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => (() => void) | undefined;
  downloadFromOllama: (modelName: string, customPath?: string | null) => Promise<StorageResult>;
  downloadFromUrl: (url: string, customPath?: string | null) => Promise<StorageResult>;
  deleteModel: (filename: string, customPath?: string | null) => Promise<StorageResult>;
  importModel: (customPath?: string | null) => Promise<StorageResult>;
  chooseModelsFolder?: () => Promise<StorageResult>;
}

interface LocalLLMModelManagerProps {
  storageService: LLMStorageServiceLike | null;
  selectedModel: string | null;
  onModelSelect: (modelName: string) => void;
  customModelsPath?: string | null;
  onCustomPathChange?: ((path: string | null) => void) | null | undefined;
  isLightBackground?: boolean;
  onRequestDeleteModel?: ((filename: string) => void) | null | undefined;
  refreshTrigger?: unknown;
  supportsCustomFolder?: boolean;
}

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
};

/**
 * LocalLLMModelManager - Shared UI component for local LLM model management
 * 
 * Provides UI for:
 * - Downloading models from Ollama registry or HuggingFace
 * - Importing models from file system
 * - Listing and selecting installed models
 * - Deleting models
 * - Custom storage folder (desktop only)
 * 
 * Platform-agnostic - uses LLMModelStorageService for actual operations
 * 
 * @param {Object} storageService - Implementation of LLMModelStorageService
 * @param {string} selectedModel - Currently selected model name
 * @param {function} onModelSelect - Callback when model is selected
 * @param {string|null} customModelsPath - Custom storage path (desktop only)
 * @param {function} onCustomPathChange - Callback when custom path changes (desktop only)
 * @param {boolean} isLightBackground - Light background theme flag
 * @param {function} onRequestDeleteModel - Optional external delete confirmation handler
 * @param {any} refreshTrigger - External trigger to refresh model list
 */
const LocalLLMModelManager = ({
  storageService,
  selectedModel,
  onModelSelect,
  customModelsPath = null,
  onCustomPathChange = null,
  isLightBackground = false,
  onRequestDeleteModel = null,
  refreshTrigger = null,
  supportsCustomFolder = true
}: LocalLLMModelManagerProps) => {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [downloadMethod, setDownloadMethod] = useState('ollama'); // 'huggingface' or 'ollama'

  // Load model list
  const loadModels = async () => {
    if (!storageService) return;
    
    try {
      const result = await storageService.listModels(customModelsPath);
      if (result?.success) {
        setModels(result.models || []);
      }
    } catch (err) {
      console.error('Failed to load models:', err);
    }
  };

  useEffect(() => {
    loadModels();
  }, [storageService, refreshTrigger, customModelsPath]);

  // Download model from Hugging Face or Ollama
  const handleDownload = async () => {
    if (!storageService) {
      setError('Storage service not available');
      return;
    }

    if (downloadMethod === 'huggingface' && !downloadUrl.trim()) {
      setError('Please enter a Hugging Face URL');
      return;
    }

    if (downloadMethod === 'ollama' && !ollamaModel.trim()) {
      setError('Please enter an Ollama model name');
      return;
    }

    setLoading(true);
    setError('');
    setDownloadProgress({ percent: 0, status: 'Starting...' });

    try {
      // Listen for progress updates
      const unsubscribe = storageService.onDownloadProgress((progress) => {
        setDownloadProgress(progress);
      });

      const result = downloadMethod === 'ollama'
        ? await storageService.downloadFromOllama(ollamaModel, customModelsPath)
        : await storageService.downloadFromUrl(downloadUrl, customModelsPath);
      
      unsubscribe?.();

      if (result?.success) {
        setDownloadUrl('');
        setOllamaModel('');
        setDownloadProgress(null);
        await loadModels();
        setError('');
        if (result.note) {
          setSuccessMessage(result.note);
          setTimeout(() => setSuccessMessage(''), 5000);
        }
      } else {
        setError(result?.error || 'Download failed');
        setDownloadProgress(null);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setDownloadProgress(null);
    } finally {
      setLoading(false);
    }
  };

  // Delete model
  const handleDelete = async (filename: string) => {
    if (!storageService) return;

    if (onRequestDeleteModel) {
      onRequestDeleteModel(filename);
    } else {
      if (!confirm(`Delete model "${filename}"?\n\nThis will permanently remove the file.`)) {
        return;
      }

      try {
        const result = await storageService.deleteModel(filename, customModelsPath);
        if (result?.success) {
          await loadModels();
        } else {
          setError(result?.error || 'Delete failed');
        }
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      }
    }
  };

  // Import model
  const handleImportClick = async () => {
    if (!storageService) return;

    try {
      setLoading(true);
      setError('');
      
      const result = await storageService.importModel(customModelsPath);
      
      if (result?.canceled) {
        setLoading(false);
        return;
      }

      if (result?.success) {
        setSuccessMessage(`Model "${result.filename}" imported successfully!`);
        setTimeout(() => setSuccessMessage(''), 5000);
        await loadModels();
      } else {
        setError(result?.error || 'Import failed');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Handle folder picker (desktop only)
  const handleChooseFolder = async () => {
    if (!storageService || !supportsCustomFolder) return;

    try {
      if (!storageService.chooseModelsFolder) {
        setError('Choosing a custom folder is not supported in this environment');
        return;
      }
      const result = await storageService.chooseModelsFolder();
      
      if (result?.success && result.path) {
        onCustomPathChange?.(result.path);
        setSuccessMessage('Custom models folder set!');
        setTimeout(() => setSuccessMessage(''), 3000);
        await loadModels();
      } else if (!result?.canceled) {
        setError(result?.error || 'Failed to select folder');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  const handleClearCustomFolder = async () => {
    onCustomPathChange?.(null);
    setSuccessMessage('Using default models folder');
    setTimeout(() => setSuccessMessage(''), 3000);
    await loadModels();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-3">
      {/* Custom Models Folder (Desktop only) */}
      {supportsCustomFolder && onCustomPathChange && (
        <div className="p-2 md:p-4 rounded-lg bg-white/5 border border-white/10">
          <h3 className="text-sm font-semibold text-white/90 mb-3 flex items-center gap-2">
            <Icon name="folder" size={16} />
            Models Folder
          </h3>
          
          <div className="space-y-2">
            <Input
              type="text"
              value={customModelsPath || 'Default'}
              readOnly
              placeholder="Default models folder"
              variant={isLightBackground ? 'dark' : 'default'}
              className="w-full text-xs"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleChooseFolder}
                variant={isLightBackground ? 'dark' : 'default'}
                className={customModelsPath ? 'flex-1' : 'w-full'}
              >
                <Icon name="folder" size={14} />
                <span>Choose</span>
              </Button>
              {customModelsPath && (
                <button
                  onClick={handleClearCustomFolder}
                  className="w-10 h-10 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors flex items-center justify-center"
                  title="Reset to default"
                >
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>
            <p className="text-[10px] text-white/50">
              Store models on a different drive or custom location
            </p>
          </div>
        </div>
      )}

      {/* Import Model */}
      <div className="p-2 md:p-4 rounded-lg bg-white/5 border border-white/10">
        <h3 className="text-sm font-semibold text-white/90 mb-3 flex items-center gap-2">
          <Icon name="upload" size={16} />
          Import Model
        </h3>
        
        <button
          onClick={handleImportClick}
          disabled={loading}
          className="w-full p-2 md:p-4 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="upload" size={32} className="mx-auto mb-2 text-white/70" />
          <p className="text-sm text-white/90 mb-1">
            {loading ? 'Importing...' : 'Import GGUF Model'}
          </p>
          <p className="text-xs text-white/50">Click to browse for .gguf file</p>
        </button>
      </div>

      {/* Download Section */}
      <div className="p-2 md:p-4 rounded-lg bg-white/5 border border-white/10">
        <h3 className="text-sm font-semibold text-white/90 mb-3 flex items-center gap-2">
          <Icon name="download" size={16} />
          Download Model
        </h3>
            
        {/* Download method selector */}
        <div className="flex gap-2 mb-3">
          <Button
            onClick={() => setDownloadMethod('ollama')}
            variant={downloadMethod === 'ollama' ? (isLightBackground ? 'dark' : 'default') : 'ghost'}
            className={cn('flex-1', downloadMethod !== 'ollama' && 'bg-white/5 text-white/60 border border-white/10')}
          >
            Ollama
          </Button>
          <Button
            onClick={() => setDownloadMethod('huggingface')}
            variant={downloadMethod === 'huggingface' ? (isLightBackground ? 'dark' : 'default') : 'ghost'}
            className={cn('flex-1', downloadMethod !== 'huggingface' && 'bg-white/5 text-white/60 border border-white/10')}
          >
            Hugging Face
          </Button>
        </div>
        
        <div className="space-y-3">
          {downloadMethod === 'ollama' ? (
            <div>
              <Input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="llama3.2:3b or qwen2.5:3b"
                disabled={loading}
                variant={isLightBackground ? 'dark' : 'default'}
                className="w-full"
              />
              <p className="text-[10px] text-white/50 mt-1.5">
                Enter Ollama model name (e.g., llama3.2:3b, qwen2.5:3b, mistral:7b)
              </p>
            </div>
          ) : (
            <div>
              <Input
                type="text"
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                placeholder="https://huggingface.co/.../model-name"
                disabled={loading}
                variant={isLightBackground ? 'dark' : 'default'}
                className="w-full"
              />
              <p className="text-[10px] text-white/50 mt-1.5">
                Paste direct Hugging Face file URL
              </p>
            </div>
          )}

          {/* Progress Bar */}
          {downloadProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/70">{downloadProgress.status}</span>
                <span className="text-white/70">{downloadProgress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-linear-to-r from-white/40 to-white/60 transition-all duration-300"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleDownload}
            disabled={loading || (downloadMethod === 'huggingface' ? !downloadUrl.trim() : !ollamaModel.trim())}
            variant={isLightBackground ? 'dark' : 'default'}
            className="w-full"
          >
            {loading ? (
              <>
                <svg 
                  className="animate-spin" 
                  width="16" 
                  height="16" 
                  viewBox="0 0 32 32" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle 
                    cx="16" 
                    cy="16" 
                    r="14" 
                    stroke="currentColor" 
                    strokeWidth="3" 
                    strokeLinecap="round"
                    strokeDasharray="70 20"
                    className="text-white opacity-90"
                  />
                </svg>
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Icon name="download" size={16} />
                <span>{downloadMethod === 'ollama' ? 'Pull Model' : 'Download Model'}</span>
              </>
            )}
          </Button>
        </div>

        {/* Quick links */}
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-white/70 hover:text-white/90 flex items-center gap-1 transition-colors">
            <Icon name="help" size={12} />
            <span>{downloadMethod === 'ollama' ? 'Popular Ollama models' : 'Where to find models?'}</span>
          </summary>
          <div className="mt-2 p-2 rounded bg-black/20 text-[10px] text-white/60 space-y-1">
            {downloadMethod === 'ollama' ? (
              <>
                <p><strong>Ollama models (free):</strong></p>
                <ul className="list-disc list-inside space-y-0.5 ml-2">
                  <li>llama3.2:3b - Meta's Llama 3.2 3B</li>
                  <li>qwen2.5:3b - Alibaba's Qwen 2.5 3B</li>
                  <li>mistral:7b - Mistral 7B (larger)</li>
                </ul>
                <p className="mt-1.5">
                  Downloads from <strong>registry.ollama.ai</strong> (no software install needed)
                </p>
              </>
            ) : (
              <>
                <p><strong>Recommended models (GGUF format):</strong></p>
                <ul className="list-disc list-inside space-y-0.5 ml-2">
                  <li>Qwen2.5-3B-Instruct (Q4_K_M) - 2GB, fast</li>
                  <li>Qwen3 0.6B - Small, fast, efficient</li>
                  <li>Mistral-7B-Instruct (Q4_K_M) - 4GB, high quality</li>
                </ul>
                <p className="mt-1.5">
                  Search "GGUF" on Hugging Face, right-click file → Copy link
                </p>
              </>
            )}
          </div>
        </details>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-300 text-xs">
          <div className="flex items-start gap-2">
            <Icon name="check" size={14} className="flex-shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
          <div className="flex items-start gap-2">
            <Icon name="error" size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Model List */}
      <div className="p-2 md:p-4 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <Icon name="folder" size={16} />
            Installed Models ({models.length})
          </h3>
          <button
            onClick={loadModels}
            className="text-xs text-white/70 hover:text-white/90 flex items-center gap-1 transition-colors"
          >
            <Icon name="refresh" size={12} />
            Refresh
          </button>
        </div>

        {models.length === 0 ? (
          <div className="text-center py-8 text-white/40">
            <Icon name="folder" size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">No models installed</p>
            <p className="text-[10px] mt-1">Download a model to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {models.map((model) => (
              <div
                key={model.name}
                className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon name="document" size={14} className="text-white/70 flex-shrink-0" />
                    <span className="text-sm font-medium text-white/90 truncate">
                      {model.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-white/50">
                    <span>{formatBytes(model.size)}</span>
                    {model.modified && (
                      <span>{new Date(model.modified).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {model.hasImageSupport && (
                    <div
                      className="p-2 text-white/70"
                      title="Supports vision/image input"
                    >
                      <Icon name="image" size={16} />
                    </div>
                  )}
                  <button
                    onClick={() => handleDelete(model.name)}
                    className="p-2 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                    title="Delete model"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                  <Toggle
                    checked={selectedModel === model.name}
                    onChange={(checked) => {
                      if (checked) {
                        onModelSelect(model.name);
                      }
                    }}
                    title="Set as default model"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LocalLLMModelManager;
