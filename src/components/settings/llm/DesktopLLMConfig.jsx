import { useState, useEffect, useRef } from 'react';
import { Icon } from '../../icons';
import { useDesktop } from '../../../contexts/DesktopContext';
import { isDesktop } from '../../../utils/PlatformUtils';
import Toggle from '../../common/Toggle';

/**
 * Reusable Desktop LLM Configuration Component
 * Used in both setup wizard and settings panel for desktop-local LLM provider
 * 
 * @param {Object} config - Current LLM configuration (endpoint, model, etc.)
 * @param {Function} onChange - Callback when configuration changes
 * @param {boolean} isLightBackground - Whether component is on light background
 * @param {boolean} showTitle - Whether to show section title
 * @param {boolean} isSetupMode - Whether in setup wizard (affects UI slightly)
 */
const DesktopLLMConfig = ({ 
  config = {}, 
  onChange,
  isLightBackground = false,
  isSetupMode = false,
  onRequestDeleteModel,
  refreshTrigger
}) => {
  const { api } = useDesktop();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [downloadMethod, setDownloadMethod] = useState('ollama'); // 'huggingface' or 'ollama'

  const handleChange = (key, value) => {
    onChange({ [key]: value });
  };

  const handleSetDefault = (modelName) => {
    handleChange('model', modelName);
  };

  // Get custom models path from config
  const customModelsPath = config.customModelsPath || null;

  // Load model list
  const loadModels = async () => {
    if (!isDesktop || !api?.llm) return;
    
    try {
      const result = await api.llm.listModels(customModelsPath);
      if (result?.success) {
        setModels(result.models || []);
      }
    } catch (err) {
      console.error('Failed to load models:', err);
    }
  };

  useEffect(() => {
    loadModels();
  }, [isDesktop, api, refreshTrigger, customModelsPath]);

  // Download model from Hugging Face or Ollama
  const handleDownload = async () => {
    if (!isDesktop || !api) {
      setError('Only available in desktop app');
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
      const unsubscribe = api.llm.onDownloadProgress((progress) => {
        setDownloadProgress(progress);
      });

      const result = downloadMethod === 'ollama'
        ? await api.llm.pullModel(ollamaModel, customModelsPath)
        : await api.llm.downloadModel(downloadUrl, customModelsPath);
      
      unsubscribe();

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
    } catch (err) {
      setError(err.message);
      setDownloadProgress(null);
    } finally {
      setLoading(false);
    }
  };

  // Delete model
  const handleDelete = async (filename) => {
    if (!isDesktop || !api?.llm) return;

    if (onRequestDeleteModel) {
      onRequestDeleteModel(filename);
    } else {
      if (!confirm(`Delete model "${filename}"?\n\nThis will permanently remove the file.`)) {
        return;
      }

      try {
        const result = await api.llm.deleteModel(filename, customModelsPath);
        if (result?.success) {
          await loadModels();
        } else {
          setError(result?.error || 'Delete failed');
        }
      } catch (err) {
        setError(err.message);
      }
    }
  };

  // Import model (use Electron dialog for proper file path)
  const handleImportClick = async () => {
    if (!isDesktop || !api?.llm) return;

    try {
      setLoading(true);
      setError('');
      
      const fileResult = await api.llm.chooseModelFile();
      
      if (fileResult?.canceled || !fileResult?.path) {
        setLoading(false);
        return;
      }

      const filePath = fileResult.path;
      
      if (!filePath.endsWith('.gguf')) {
        setError('Only .gguf files are supported');
        setLoading(false);
        return;
      }
      
      const result = await api.llm.importModel(filePath, customModelsPath);
      
      if (result?.success) {
        setSuccessMessage(`Model "${result.filename}" imported successfully!`);
        setTimeout(() => setSuccessMessage(''), 5000);
        await loadModels();
      } else {
        setError(result?.error || 'Import failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle folder picker
  const handleChooseFolder = async () => {
    if (!isDesktop || !api?.llm) return;

    try {
      const result = await api.llm.chooseModelsFolder();
      
      if (result?.success && result.path) {
        handleChange('customModelsPath', result.path);
        setSuccessMessage('Custom models folder set!');
        setTimeout(() => setSuccessMessage(''), 3000);
        await loadModels();
      } else if (!result?.canceled) {
        setError(result?.error || 'Failed to select folder');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleClearCustomFolder = async () => {
    handleChange('customModelsPath', null);
    setSuccessMessage('Using default models folder');
    setTimeout(() => setSuccessMessage(''), 3000);
    await loadModels();
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-3">
      {/* Info Banner */}
      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
        <div className="flex items-start gap-2">
          <Icon name="cpu" size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-green-300">
            <span className="font-semibold">Desktop Local AI</span> - On-device language model using llama.cpp. GPU-accelerated and runs entirely on your desktop!
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-green-400"></div>
          <span className="text-sm font-semibold text-white/90">Ready to use!</span>
        </div>
        <p className="text-xs text-white/60">
          Model: {config.model || 'No model selected'} • llama.cpp via Electron • GPU accelerated
        </p>
        {!config.model && (
          <p className="text-[10px] text-yellow-400 mt-1">
            ⚠ Select a model below to enable LLM features
          </p>
        )}
      </div>

      {/* Advanced Config */}
      <details className="group" open={isSetupMode}>
        <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-between p-2 rounded hover:bg-white/5">
          <span>Advanced Settings</span>
          <Icon name="arrow-down" size={14} className="group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-2 space-y-3">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Endpoint URL
            </label>
            <input
              type="text"
              value={config.endpoint || 'http://127.0.0.1:11438'}
              onChange={(e) => handleChange('endpoint', e.target.value)}
              placeholder="http://127.0.0.1:11438"
              className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs sm:text-sm`}
            />
            <p className="text-[10px] text-white/50 mt-1">
              Unified local AI server endpoint (Electron manages routing internally)
            </p>
          </div>

          {/* Additional Advanced Parameters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Temperature ({config.temperature !== undefined ? config.temperature : 0.7})
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature !== undefined ? config.temperature : 0.7}
                onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Max Tokens ({config.maxTokens || 2048})
              </label>
              <input
                type="number"
                min="256"
                max="8192"
                step="256"
                value={config.maxTokens || 2048}
                onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Context Size ({config.contextSize || 4096})
              </label>
              <input
                type="number"
                min="512"
                max="32768"
                step="512"
                value={config.contextSize || 4096}
                onChange={(e) => handleChange('contextSize', parseInt(e.target.value))}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                GPU Layers ({config.gpuLayers !== undefined ? config.gpuLayers : 33})
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={config.gpuLayers !== undefined ? config.gpuLayers : 33}
                onChange={(e) => handleChange('gpuLayers', parseInt(e.target.value))}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
              />
              <p className="text-[10px] text-white/50 mt-1">
                Offload layers to GPU (0 = CPU only)
              </p>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Threads ({config.threads || 4})
              </label>
              <input
                type="number"
                min="1"
                max="32"
                value={config.threads || 4}
                onChange={(e) => handleChange('threads', parseInt(e.target.value))}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
              />
            </div>
          </div>
        </div>
      </details>

      {/* Model Management Section */}
      {!isSetupMode && isDesktop && (
        <>
          {/* Custom Models Folder */}
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h3 className="text-sm font-semibold text-white/90 mb-3 flex items-center gap-2">
              <Icon name="folder" size={16} />
              Models Folder
            </h3>
            
            <div className="space-y-2">
              <input
                type="text"
                value={customModelsPath || 'Default'}
                readOnly
                placeholder="Default models folder"
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleChooseFolder}
                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${customModelsPath ? 'flex-1' : 'w-full'}`}
                >
                  <Icon name="folder" size={14} />
                  <span>Choose</span>
                </button>
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

          {/* Import Model */}
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h3 className="text-sm font-semibold text-white/90 mb-3 flex items-center gap-2">
              <Icon name="upload" size={16} />
              Import Model
            </h3>
            
            <button
              onClick={handleImportClick}
              disabled={loading}
              className="w-full p-4 border-2 border-dashed border-white/20 hover:border-white/40 rounded-lg text-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="upload" size={32} className="mx-auto mb-2 text-white/70" />
              <p className="text-sm text-white/90 mb-1">
                {loading ? 'Importing...' : 'Import GGUF Model'}
              </p>
              <p className="text-xs text-white/50">Click to browse for .gguf file</p>
            </button>
          </div>

          {/* Download Section */}
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h3 className="text-sm font-semibold text-white/90 mb-3 flex items-center gap-2">
              <Icon name="download" size={16} />
              Download Model
            </h3>
                
                {/* Download method selector */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setDownloadMethod('ollama')}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      downloadMethod === 'ollama'
                        ? `glass-button ${isLightBackground ? 'glass-button-dark' : ''}`
                        : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    Ollama
                  </button>
                  <button
                    onClick={() => setDownloadMethod('huggingface')}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      downloadMethod === 'huggingface'
                        ? `glass-button ${isLightBackground ? 'glass-button-dark' : ''}`
                        : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    Hugging Face
                  </button>
                </div>
                
                <div className="space-y-3">
                  {downloadMethod === 'ollama' ? (
                    <div>
                      <input
                        type="text"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        placeholder="llama3.2:3b or qwen2.5:3b"
                        disabled={loading}
                        className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                      />
                      <p className="text-[10px] text-white/50 mt-1.5">
                        Enter Ollama model name (e.g., llama3.2:3b, qwen2.5:3b, mistral:7b)
                      </p>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={downloadUrl}
                        onChange={(e) => setDownloadUrl(e.target.value)}
                        placeholder="https://huggingface.co/.../model-name"
                        disabled={loading}
                        className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
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
                          className="h-full bg-gradient-to-r from-white/40 to-white/60 transition-all duration-300"
                          style={{ width: `${downloadProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleDownload}
                    disabled={loading || (downloadMethod === 'huggingface' ? !downloadUrl.trim() : !ollamaModel.trim())}
                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-full px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
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
                  </button>
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
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
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
                          <button
                            onClick={() => handleDelete(model.name)}
                            className="p-2 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                            title="Delete model"
                          >
                            <Icon name="trash" size={16} />
                          </button>
                          <Toggle
                            checked={config.model === model.name}
                            onChange={(checked) => {
                              if (checked) {
                                handleSetDefault(model.name);
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
            </>
          )}
    </div>
  );
};

export default DesktopLLMConfig;
