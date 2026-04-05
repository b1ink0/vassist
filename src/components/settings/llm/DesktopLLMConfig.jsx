import { Icon } from '../../icons';
import { useDesktop } from '../../../contexts/DesktopContext';
import { isDesktop } from '../../../utils/PlatformUtils';
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

  return (
    <div className="space-y-3">
      {/* Info Banner */}
      <div className="p-3 rounded-lg bg-white/10 border border-white/20">
        <div className="flex items-start gap-2">
          <Icon name="cpu" size={18} className="text-white/90 flex-shrink-0 mt-0.5" />
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
