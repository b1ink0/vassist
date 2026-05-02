import { useState, useEffect, type ChangeEventHandler } from 'react';
import { Icon } from '../../icons';
import Dialog from '../../common/Dialog';
import Toggle from '../../common/Toggle';
import { Button, Input } from '../../ui';
import { cn } from '../../../utils/cn';
import type { DiscoveryItem } from '../../../services/LLMModelStorageService';

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
  searchOllamaModels: (query: string, page?: number, pageSize?: number) => Promise<{ success?: boolean; error?: string; items?: DiscoveryItem[]; nextCursor?: string | null }>;
  listOllamaModelTags: (modelId: string, query?: string, page?: number, pageSize?: number) => Promise<{ success?: boolean; error?: string; items?: DiscoveryItem[]; nextCursor?: string | null }>;
  searchHuggingFaceModels: (query: string, cursor?: string, pageSize?: number) => Promise<{ success?: boolean; error?: string; items?: DiscoveryItem[]; nextCursor?: string | null }>;
  listHuggingFaceFiles: (repoId: string, query?: string, page?: number, pageSize?: number) => Promise<{ success?: boolean; error?: string; items?: DiscoveryItem[]; nextCursor?: string | null }>;
  deleteModel: (filename: string, customPath?: string | null) => Promise<StorageResult>;
  importModel: (customPath?: string | null) => Promise<StorageResult>;
  chooseModelsFolder?: () => Promise<StorageResult>;
}

interface CatalogListProps {
  items: DiscoveryItem[];
  loading: boolean;
  error: string;
  emptyText: string;
  selectedValue?: string | undefined;
  hasMore?: boolean;
  onLoadMore?: (() => void) | null;
  onSelect: (item: DiscoveryItem) => void;
}

interface SearchInputProps {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  isLightBackground?: boolean;
}

const SearchInput = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  loading = false,
  isLightBackground = false,
}: SearchInputProps) => {
  return (
    <div className="relative">
      <Input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        variant={isLightBackground ? 'dark' : 'default'}
        className="w-full pr-10"
      />
      {loading && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/45">
          <Icon name="loading" size={14} className="animate-spin" />
        </span>
      )}
    </div>
  );
};

const CatalogList = ({
  items,
  loading,
  error,
  emptyText,
  selectedValue,
  hasMore = false,
  onLoadMore = null,
  onSelect,
}: CatalogListProps) => {
  if (loading && items.length === 0) {
    return <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/55">Loading results...</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>;
  }

  if (!items.length) {
    return <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/45">{emptyText}</div>;
  }

  return (
    <div className="space-y-2">
      <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-black/10 p-2 scrollbar-glass">
        {items.map((item) => {
          const isSelected = selectedValue === item.value || selectedValue === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                isSelected
                  ? 'border-white/30 bg-white/12 text-white'
                  : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
              )}
              title={item.label}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                {item.secondaryLabel && item.secondaryLabel !== item.label && (
                  <span className="max-w-[45%] shrink truncate text-[10px] text-white/45" title={item.secondaryLabel}>
                    {item.secondaryLabel}
                  </span>
                )}
              </div>
              {item.description && (
                <div className="mt-1 truncate text-[11px] text-white/55" title={item.description}>
                  {item.description}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {hasMore && onLoadMore && (
        <Button type="button" onClick={onLoadMore} variant="ghost" className="w-full border border-white/10 bg-white/5 text-white/80 hover:bg-white/10">
          Load More
        </Button>
      )}

      {loading && items.length > 0 && (
        <div className="text-[11px] text-white/50">Loading more results...</div>
      )}
    </div>
  );
};

interface OllamaBrowserProps {
  storageService: LLMStorageServiceLike | null;
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  isLightBackground?: boolean;
}

const OllamaBrowser = ({ storageService, value, onSelect, disabled = false, isLightBackground = false }: OllamaBrowserProps) => {
  const initialModelId = value.includes(':') ? value.split(':')[0] || '' : value;
  const [query, setQuery] = useState(initialModelId);
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(initialModelId);
  const [tagQuery, setTagQuery] = useState('');
  const [tags, setTags] = useState<DiscoveryItem[]>([]);
  const [tagLoading, setTagLoading] = useState(false);
  const [tagError, setTagError] = useState('');
  const [nextTagPage, setNextTagPage] = useState<string | null>(null);
  const displayItems = items.map(({ description: _description, secondaryLabel: _secondaryLabel, ...item }) => item);
  const displayTags = tags.map(({ description: _description, secondaryLabel: _secondaryLabel, ...item }) => item);

  useEffect(() => {
    const nextModelId = value.includes(':') ? value.split(':')[0] || '' : value;
    setSelectedModelId(nextModelId);
    if (nextModelId && nextModelId !== query) {
      setQuery(nextModelId);
    }
  }, [value]);

  useEffect(() => {
    if (!storageService || disabled) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await storageService.searchOllamaModels(query.trim(), 1, 12);
        if (cancelled) {
          return;
        }
        setItems(Array.isArray(result.items) ? result.items : []);
        setNextPage(result.nextCursor || null);
        setError(result.success === false ? (result.error || 'Unable to load Ollama models') : '');
      } catch (error) {
        if (!cancelled) {
          setItems([]);
          setNextPage(null);
          setError(error instanceof Error ? error.message : 'Unable to load Ollama models');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [disabled, query, storageService]);

  useEffect(() => {
    if (!storageService || !selectedModelId || disabled) {
      setTags((prev) => (prev.length > 0 ? [] : prev));
      setTagError((prev) => (prev ? '' : prev));
      setNextTagPage((prev) => (prev !== null ? null : prev));
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setTagLoading(true);
      try {
        const result = await storageService.listOllamaModelTags(selectedModelId, tagQuery.trim(), 1, 12);
        if (cancelled) {
          return;
        }
        setTags(Array.isArray(result.items) ? result.items : []);
        setNextTagPage(result.nextCursor || null);
        setTagError(result.success === false ? (result.error || 'Unable to load model tags') : '');
      } catch (error) {
        if (!cancelled) {
          setTags([]);
          setNextTagPage(null);
          setTagError(error instanceof Error ? error.message : 'Unable to load model tags');
        }
      } finally {
        if (!cancelled) {
          setTagLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [disabled, selectedModelId, storageService, tagQuery]);

  const loadMoreModels = async () => {
    if (!storageService || !nextPage || loading) {
      return;
    }
    setLoading(true);
    try {
      const result = await storageService.searchOllamaModels(query.trim(), Number(nextPage), 12);
      setItems((prev) => [...prev, ...(Array.isArray(result.items) ? result.items : [])]);
      setNextPage(result.nextCursor || null);
      setError(result.success === false ? (result.error || 'Unable to load Ollama models') : '');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to load Ollama models');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreTags = async () => {
    if (!storageService || !selectedModelId || !nextTagPage || tagLoading) {
      return;
    }
    setTagLoading(true);
    try {
      const result = await storageService.listOllamaModelTags(selectedModelId, tagQuery.trim(), Number(nextTagPage), 12);
      setTags((prev) => [...prev, ...(Array.isArray(result.items) ? result.items : [])]);
      setNextTagPage(result.nextCursor || null);
      setTagError(result.success === false ? (result.error || 'Unable to load model tags') : '');
    } catch (error) {
      setTagError(error instanceof Error ? error.message : 'Unable to load model tags');
    } finally {
      setTagLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="block text-xs font-medium text-white/80">Search Ollama Library</label>
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search models like qwen, llama, mistral"
          disabled={disabled}
          loading={loading}
          isLightBackground={isLightBackground}
        />
        <CatalogList
          items={displayItems}
          loading={loading}
          error={error}
          emptyText="No Ollama models matched the current search."
          selectedValue={selectedModelId}
          hasMore={Boolean(nextPage)}
          onLoadMore={loadMoreModels}
          onSelect={(item) => {
            setSelectedModelId(item.value);
            setQuery(item.label);
            onSelect(item.value);
          }}
        />
      </div>

      {selectedModelId && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-white/80">Choose Tag</label>
          <SearchInput
            value={tagQuery}
            onChange={(event) => setTagQuery(event.target.value)}
            placeholder="Filter tags like 3b, 7b, latest"
            disabled={disabled}
            loading={tagLoading}
            isLightBackground={isLightBackground}
          />
          <CatalogList
            items={displayTags}
            loading={tagLoading}
            error={tagError}
            emptyText="No tags matched the current filter."
            selectedValue={value}
            hasMore={Boolean(nextTagPage)}
            onLoadMore={loadMoreTags}
            onSelect={(item) => onSelect(item.value)}
          />
        </div>
      )}
    </div>
  );
};

interface HuggingFaceBrowserProps {
  storageService: LLMStorageServiceLike | null;
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  isLightBackground?: boolean;
}

const HuggingFaceBrowser = ({ storageService, value, onSelect, disabled = false, isLightBackground = false }: HuggingFaceBrowserProps) => {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<DiscoveryItem | null>(null);
  const [fileQuery, setFileQuery] = useState('');
  const [files, setFiles] = useState<DiscoveryItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [nextFilePage, setNextFilePage] = useState<string | null>(null);

  useEffect(() => {
    if (!storageService || disabled) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await storageService.searchHuggingFaceModels(query.trim(), '', 12);
        if (cancelled) {
          return;
        }
        setItems(Array.isArray(result.items) ? result.items : []);
        setNextCursor(result.nextCursor || null);
        setError(result.success === false ? (result.error || 'Unable to search Hugging Face') : '');
      } catch (error) {
        if (!cancelled) {
          setItems([]);
          setNextCursor(null);
          setError(error instanceof Error ? error.message : 'Unable to search Hugging Face');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [disabled, query, storageService]);

  useEffect(() => {
    if (!storageService || !selectedRepo?.value || disabled) {
      setFiles((prev) => (prev.length > 0 ? [] : prev));
      setFilesError((prev) => (prev ? '' : prev));
      setNextFilePage((prev) => (prev !== null ? null : prev));
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setFilesLoading(true);
      try {
        const result = await storageService.listHuggingFaceFiles(selectedRepo.value, fileQuery.trim(), 1, 12);
        if (cancelled) {
          return;
        }
        setFiles(Array.isArray(result.items) ? result.items : []);
        setNextFilePage(result.nextCursor || null);
        setFilesError(result.success === false ? (result.error || 'Unable to load GGUF files') : '');
      } catch (error) {
        if (!cancelled) {
          setFiles([]);
          setNextFilePage(null);
          setFilesError(error instanceof Error ? error.message : 'Unable to load GGUF files');
        }
      } finally {
        if (!cancelled) {
          setFilesLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [disabled, fileQuery, selectedRepo, storageService]);

  const loadMoreRepos = async () => {
    if (!storageService || !nextCursor || loading) {
      return;
    }
    setLoading(true);
    try {
      const result = await storageService.searchHuggingFaceModels(query.trim(), nextCursor, 12);
      setItems((prev) => [...prev, ...(Array.isArray(result.items) ? result.items : [])]);
      setNextCursor(result.nextCursor || null);
      setError(result.success === false ? (result.error || 'Unable to search Hugging Face') : '');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to search Hugging Face');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreFiles = async () => {
    if (!storageService || !selectedRepo?.value || !nextFilePage || filesLoading) {
      return;
    }
    setFilesLoading(true);
    try {
      const result = await storageService.listHuggingFaceFiles(selectedRepo.value, fileQuery.trim(), Number(nextFilePage), 12);
      setFiles((prev) => [...prev, ...(Array.isArray(result.items) ? result.items : [])]);
      setNextFilePage(result.nextCursor || null);
      setFilesError(result.success === false ? (result.error || 'Unable to load GGUF files') : '');
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : 'Unable to load GGUF files');
    } finally {
      setFilesLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="block text-xs font-medium text-white/80">Search Hugging Face GGUF Repositories</label>
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search GGUF repos like qwen, mistral, llama"
          disabled={disabled}
          loading={loading}
          isLightBackground={isLightBackground}
        />
        <CatalogList
          items={items}
          loading={loading}
          error={error}
          emptyText="No GGUF repositories matched the current search."
          selectedValue={selectedRepo?.value}
          hasMore={Boolean(nextCursor)}
          onLoadMore={loadMoreRepos}
          onSelect={(item) => setSelectedRepo(item)}
        />
      </div>

      {selectedRepo && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-white/80">Choose GGUF File</label>
          <div className="truncate text-[11px] text-white/55" title={selectedRepo.label}>{selectedRepo.label}</div>
          <SearchInput
            value={fileQuery}
            onChange={(event) => setFileQuery(event.target.value)}
            placeholder="Filter GGUF files within this repo"
            disabled={disabled}
            loading={filesLoading}
            isLightBackground={isLightBackground}
          />
          <CatalogList
            items={files}
            loading={filesLoading}
            error={filesError}
            emptyText="No GGUF files matched the current filter."
            selectedValue={value}
            hasMore={Boolean(nextFilePage)}
            onLoadMore={loadMoreFiles}
            onSelect={(item) => onSelect(item.value)}
          />
        </div>
      )}
    </div>
  );
};

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
  const [downloadMethod, setDownloadMethod] = useState<'ollama' | 'huggingface'>('ollama');
  const [pendingDeleteFilename, setPendingDeleteFilename] = useState<string | null>(null);

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
      setPendingDeleteFilename(filename);
    }
  };

  const confirmDelete = async () => {
    if (!storageService || !pendingDeleteFilename) return;

    const filename = pendingDeleteFilename;
    setPendingDeleteFilename(null);

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
            <>
              <OllamaBrowser
                storageService={storageService}
                value={ollamaModel}
                onSelect={setOllamaModel}
                disabled={loading}
                isLightBackground={isLightBackground}
              />
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/80">Selected Ollama Pull Target</label>
                <Input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="qwen2.5:3b"
                  disabled={loading}
                  variant={isLightBackground ? 'dark' : 'default'}
                  className="w-full"
                />
                <p className="mt-1.5 text-[10px] text-white/50">
                  Search above, choose a tag, or type a full Ollama model reference manually.
                </p>
              </div>
            </>
          ) : (
            <>
              <HuggingFaceBrowser
                storageService={storageService}
                value={downloadUrl}
                onSelect={setDownloadUrl}
                disabled={loading}
                isLightBackground={isLightBackground}
              />
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/80">Selected Hugging Face Download URL</label>
                <Input
                  type="text"
                  value={downloadUrl}
                  onChange={(e) => setDownloadUrl(e.target.value)}
                  placeholder="https://huggingface.co/.../resolve/.../model.gguf?download=true"
                  disabled={loading}
                  variant={isLightBackground ? 'dark' : 'default'}
                  className="w-full"
                />
                <p className="mt-1.5 text-[10px] text-white/50">
                  Search GGUF repos above, pick a file, or paste a direct download URL manually.
                </p>
              </div>
            </>
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
                <Icon name="loading-2" size={16} className="animate-spin" />
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

      {pendingDeleteFilename && (
        <Dialog
          type="confirm"
          title={`Delete model "${pendingDeleteFilename}"?`}
          message="This will permanently remove the file."
          confirmLabel="Delete"
          confirmStyle="error"
          isLightBackground={isLightBackground}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDeleteFilename(null)}
        />
      )}
    </div>
  );
};

export default LocalLLMModelManager;
