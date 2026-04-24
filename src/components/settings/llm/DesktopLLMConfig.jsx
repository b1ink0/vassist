import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../icons';
import { useDesktop } from '../../../contexts/DesktopContext';
import { isDesktop } from '../../../utils/PlatformUtils';
import { Button, Select, Input } from '../../ui';
import LocalLLMModelManager from './LocalLLMModelManager';
import { getLLMModelStorage } from '../../../services/LLMModelStorageService';

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
  const [backendStatus, setBackendStatus] = useState(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState('');
  const [backendProgress, setBackendProgress] = useState(null);

  const handleChange = (key, value) => {
    onChange({ [key]: value });
  };

  const handleModelSelect = (modelName) => {
    handleChange('model', modelName);
  };

  const handleCustomPathChange = (path) => {
    handleChange('customModelsPath', path);
  };

  const storageService = isDesktop && api ? getLLMModelStorage(api) : null;
  const selectedBackend = config.backend || 'auto';
  const backendProgressBytes = useMemo(() => {
    if (!backendProgress) return null;
    const downloaded = Number.isFinite(backendProgress.downloadedBytes)
      ? backendProgress.downloadedBytes
      : null;
    const total = Number.isFinite(backendProgress.totalBytes)
      ? backendProgress.totalBytes
      : null;
    if (downloaded === null) return null;
    return {
      downloadedMB: (downloaded / 1024 / 1024).toFixed(1),
      totalMB: total !== null ? (total / 1024 / 1024).toFixed(1) : null,
    };
  }, [backendProgress]);

  const backendItems = useMemo(() => {
    return backendStatus?.supportedBackends || [];
  }, [backendStatus]);

  const loadBackendStatus = useCallback(async () => {
    if (!storageService) return;
    try {
      const status = await storageService.getBackendStatus(selectedBackend);
      if (status?.success) {
        setBackendStatus(status);
      } else if (status?.error) {
        setBackendError(status.error);
      }
    } catch (error) {
      setBackendError(error.message || 'Failed to load backend status');
    }
  }, [selectedBackend, storageService]);

  useEffect(() => {
    if (!storageService) return;

    loadBackendStatus();

    const unsubscribe = storageService.onBackendInstallProgress((progress) => {
      setBackendProgress(progress);
      if (progress?.stage === 'done') {
        setBackendLoading(false);
        setBackendError('');
        loadBackendStatus();
      } else if (progress?.stage === 'error') {
        setBackendLoading(false);
        setBackendError(progress.status || 'Backend installation failed');
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [storageService, selectedBackend, loadBackendStatus]);

  const installSelectedBackend = async () => {
    if (!storageService) return;

    setBackendLoading(true);
    setBackendError('');
    setBackendProgress({ percent: 0, stage: 'install', status: 'Starting backend setup...' });

    try {
      const result = await storageService.installBackend(selectedBackend);
      if (!result?.success) {
        setBackendLoading(false);
        setBackendError(result?.error || 'Backend installation failed');
      }
    } catch (error) {
      setBackendLoading(false);
      setBackendError(error.message || 'Backend installation failed');
    }
  };

  return (
    <div className="space-y-3">
      {/* Info Banner */}
      <div className="p-3 rounded-lg bg-white/10 border border-white/20">
        <div className="flex items-start gap-2">
          <Icon name="cpu" size={18} className="text-white/90 shrink-0 mt-0.5" />
          <p className="text-xs text-white/90">
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

      {/* Backend Manager */}
      <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white/90">Runtime Backend</h3>
            <p className="text-[11px] text-white/60">Choose and install llama.cpp compute backend</p>
          </div>
          <button
            onClick={loadBackendStatus}
            className="text-xs text-white/70 hover:text-white/90"
            type="button"
          >
            Refresh
          </button>
        </div>

        <Select
          value={selectedBackend}
          onChange={(e) => handleChange('backend', e.target.value)}
          variant={isLightBackground ? 'dark' : 'default'}
          options={
            backendItems.length > 0
              ? backendItems.map((item) => ({
                  value: item.name,
                  label: `${item.name.toUpperCase()}${!item.supported ? ' (unsupported)' : ''}`,
                  disabled: !item.supported,
                }))
              : [
                  { value: 'auto', label: 'AUTO' },
                  { value: 'cpu', label: 'CPU' },
                  { value: 'cuda', label: 'CUDA' },
                  { value: 'vulkan', label: 'VULKAN' },
                  { value: 'metal', label: 'METAL' },
                ]
          }
        />

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-white/60">
            {backendStatus?.selectedInstalled
              ? `Selected backend (${selectedBackend}) is installed`
              : `Selected backend (${selectedBackend}) is not installed`}
          </p>
          <Button
            onClick={installSelectedBackend}
            disabled={backendLoading || selectedBackend === 'auto'}
            variant={isLightBackground ? 'dark' : 'default'}
            size="sm"
            type="button"
          >
            {backendLoading ? 'Installing...' : (backendStatus?.selectedInstalled ? 'Reinstall' : 'Install')}
          </Button>
        </div>

        {backendProgress && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-white/70">{backendProgress.status}</span>
              <span className="text-white/70">{Math.round(backendProgress.percent || 0)}%</span>
            </div>
            {backendProgressBytes && (
              <div className="text-xs text-white/70">
                {backendProgressBytes.totalMB
                  ? `${backendProgressBytes.downloadedMB}MB / ${backendProgressBytes.totalMB}MB`
                  : `${backendProgressBytes.downloadedMB}MB downloaded`}
              </div>
            )}
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-white/40 to-white/60 transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, backendProgress.percent || 0))}%` }}
              />
            </div>
          </div>
        )}

        {backendError && (
          <p className="text-[11px] text-red-300">{backendError}</p>
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
            <Input
              type="text"
              value={config.endpoint || 'http://127.0.0.1:11438'}
              onChange={(e) => handleChange('endpoint', e.target.value)}
              placeholder="http://127.0.0.1:11438"
              variant={isLightBackground ? 'dark' : 'default'}
            />
            <p className="text-[10px] text-white/50 mt-1">
              Local AI server endpoint
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
              <Input
                type="number"
                min="256"
                max="8192"
                step="256"
                value={config.maxTokens || 2048}
                onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
                variant={isLightBackground ? 'dark' : 'default'}
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Context Size ({config.contextSize || 4096})
              </label>
              <Input
                type="number"
                min="512"
                max="32768"
                step="512"
                value={config.contextSize || 4096}
                onChange={(e) => handleChange('contextSize', parseInt(e.target.value))}
                variant={isLightBackground ? 'dark' : 'default'}
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                GPU Layers ({config.gpuLayers !== undefined ? config.gpuLayers : 33})
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                value={config.gpuLayers !== undefined ? config.gpuLayers : 33}
                onChange={(e) => handleChange('gpuLayers', parseInt(e.target.value))}
                variant={isLightBackground ? 'dark' : 'default'}
              />
              <p className="text-[10px] text-white/50 mt-1">
                Offload layers to GPU (0 = CPU only)
              </p>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Threads ({config.threads || 4})
              </label>
              <Input
                type="number"
                min="1"
                max="32"
                value={config.threads || 4}
                onChange={(e) => handleChange('threads', parseInt(e.target.value))}
                variant={isLightBackground ? 'dark' : 'default'}
              />
            </div>
          </div>
        </div>
      </details>

      {/* Model Management Section */}
      {!isSetupMode && isDesktop && storageService && (
        <LocalLLMModelManager
          storageService={storageService}
          selectedModel={config.model}
          onModelSelect={handleModelSelect}
          customModelsPath={config.customModelsPath || null}
          onCustomPathChange={handleCustomPathChange}
          isLightBackground={isLightBackground}
          onRequestDeleteModel={onRequestDeleteModel}
          refreshTrigger={refreshTrigger}
          supportsCustomFolder={true}
        />
      )}
    </div>
  );
};

export default DesktopLLMConfig;
