import { useState, useEffect } from 'react';
import { Icon } from '../../icons';
import { useDesktop } from '../../../contexts/DesktopContext';
import { isDesktop } from '../../../utils/PlatformUtils';

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
  isSetupMode = false
}) => {
  const { api } = useDesktop();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [error, setError] = useState('');
  const [downloadMethod, setDownloadMethod] = useState('huggingface'); // 'huggingface' or 'ollama'

  const handleChange = (key, value) => {
    onChange({ [key]: value });
  };

  // Load model list
  const loadModels = async () => {
    if (!isDesktop || !api?.llm) return;
    
    try {
      const result = await api.llm.listModels();
      if (result?.success) {
        setModels(result.models || []);
      }
    } catch (err) {
      console.error('Failed to load models:', err);
    }
  };

  useEffect(() => {
    loadModels();
  }, [isDesktop, api]);

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
        ? await api.llm.pullModel(ollamaModel)
        : await api.llm.downloadModel(downloadUrl);
      
      unsubscribe();

      if (result?.success) {
        setDownloadUrl('');
        setOllamaModel('');
        setDownloadProgress(null);
        await loadModels();
        if (result.note) {
          setError(result.note); // Show info message
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

    if (!confirm(`Delete model "${filename}"?\n\nThis will permanently remove the file.`)) {
      return;
    }

    try {
      const result = await api.llm.deleteModel(filename);
      if (result?.success) {
        await loadModels();
      } else {
        setError(result?.error || 'Delete failed');
      }
    } catch (err) {
      setError(err.message);
    }
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
        <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10 space-y-3">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Endpoint URL
            </label>
            <input
              type="text"
              value={config.endpoint || 'http://127.0.0.1:11438'}
              onChange={(e) => handleChange('endpoint', e.target.value)}
              placeholder="http://127.0.0.1:11438"
              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
            />
            <p className="text-[10px] text-white/50 mt-1">
              Unified local AI server endpoint (Electron manages routing internally)
            </p>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Model File
            </label>
            {isDesktop && models.length > 0 ? (
              <select
                value={config.model || ''}
                onChange={(e) => handleChange('model', e.target.value)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400"
              >
                <option value="">Select a model...</option>
                {models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name} ({formatBytes(model.size)})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={config.model || ''}
                onChange={(e) => handleChange('model', e.target.value)}
                placeholder="qwen3:0.6b"
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
              />
            )}
            <p className="text-[10px] text-white/50 mt-1">
              {isDesktop && models.length > 0 
                ? 'Select from downloaded models or download new ones below'
                : 'GGUF model filename (download models below)'}
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
                className="w-full px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400"
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
                className="w-full px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400"
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
                className="w-full px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400"
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
                className="w-full px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>

          {/* Model Management Section - Only show in settings, not setup */}
          {!isSetupMode && isDesktop && (
            <>
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
                    className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${
                      downloadMethod === 'ollama'
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    Ollama (Recommended)
                  </button>
                  <button
                    onClick={() => setDownloadMethod('huggingface')}
                    className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${
                      downloadMethod === 'huggingface'
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
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
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                          style={{ width: `${downloadProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleDownload}
                    disabled={loading || (downloadMethod === 'huggingface' ? !downloadUrl.trim() : !ollamaModel.trim())}
                    className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <><Icon name="loader" size={16} className="animate-spin" /> Downloading...</>
                    ) : (
                      <><Icon name="download" size={16} /> {downloadMethod === 'ollama' ? 'Pull Model' : 'Download Model'}</>
                    )}
                  </button>
                </div>

                {/* Quick links */}
                <details className="mt-3 group">
                  <summary className="cursor-pointer text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                    <Icon name="help" size={12} />
                    <span>{downloadMethod === 'ollama' ? 'Popular Ollama models' : 'Where to find models?'}</span>
                  </summary>
                  <div className="mt-2 p-2 rounded bg-black/20 text-[10px] text-white/60 space-y-1">
                    {downloadMethod === 'ollama' ? (
                      <>
                        <p><strong>Recommended Ollama models (free):</strong></p>
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
                    className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
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
                            <Icon name="file" size={14} className="text-purple-400 flex-shrink-0" />
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
                        <button
                          onClick={() => handleDelete(model.name)}
                          className="ml-3 p-2 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                          title="Delete model"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </details>
    </div>
  );
};

export default DesktopLLMConfig;
