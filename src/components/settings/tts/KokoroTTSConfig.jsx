/**
 * KokoroTTSConfig - Reusable Kokoro TTS Configuration Component
 * 
 * Shared between TTSSettings and SetupWizard Step 7
 * Provides voice selection, speed control, device backend, and advanced settings
 */

import { Icon } from '../../icons';
import Toggle from '../../common/Toggle';
import { KokoroVoices, KokoroDevice } from '../../../config/aiConfig';
import StatusMessage from '../../common/StatusMessage';

/**
 * Helper function to format voice key into a readable label
 * Example: AF_HEART -> Heart, AM_ADAM -> Adam
 */
const formatVoiceLabel = (key) => {
  const name = key.split('_').slice(1).join(' '); // Remove prefix (AF, AM, BF, BM)
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
};

/**
 * Helper function to group voices by accent and gender
 * Dynamically generated from KokoroVoices enum
 */
const getVoiceGroups = () => {
  const groups = {
    'American English - Female': [],
    'American English - Male': [],
    'British English - Female': [],
    'British English - Male': []
  };

  Object.entries(KokoroVoices).forEach(([key, value]) => {
    const label = formatVoiceLabel(key);
    
    if (key.startsWith('AF_')) {
      groups['American English - Female'].push({ value, label });
    } else if (key.startsWith('AM_')) {
      groups['American English - Male'].push({ value, label });
    } else if (key.startsWith('BF_')) {
      groups['British English - Female'].push({ value, label });
    } else if (key.startsWith('BM_')) {
      groups['British English - Male'].push({ value, label });
    }
  });

  return Object.entries(groups)
    .filter(([, voices]) => voices.length > 0)
    .map(([label, voices]) => ({ label, voices }));
};

/**
 * Helper function to get device options with descriptions
 * Dynamically generated from KokoroDevice enum
 */
const getDeviceOptions = () => {
  const descriptions = {
    [KokoroDevice.AUTO]: { label: 'Auto (Recommended)', description: 'Automatically chooses the best available backend' },
    [KokoroDevice.WEBGPU]: { label: 'WebGPU', description: 'GPU acceleration (2-10x faster, fp32 precision)' },
    [KokoroDevice.WASM]: { label: 'WASM', description: 'CPU-based (slower but more stable, q8 quantized)' }
  };

  return Object.entries(KokoroDevice).map(([, value]) => ({
    value,
    ...descriptions[value]
  }));
};

const KokoroTTSConfig = ({ 
  config,
  onChange,
  kokoroStatus,
  onInitialize,
  onCheckStatus,
  onTestVoice,
  testingVoice = false, // New prop to show loading state
  isLightBackground = false,
  showTitle = true,
  showTestButton = true,
  isSetupMode = false, // New prop for setup wizard
}) => {
  const handleChange = (field, value) => {
    onChange(field, value);
  };

  const voiceGroups = getVoiceGroups();
  const deviceOptions = getDeviceOptions();

  return (
    <div className="space-y-4 p-4 rounded-lg bg-white/5 border border-white/10">
      {showTitle && <h4 className="text-sm font-semibold text-white/90">Kokoro TTS Configuration</h4>}
      
      {/* Setup Instructions - Only show in setup mode */}
      {isSetupMode && (
        <div className="space-y-3 p-4 rounded-lg bg-blue-500/10 border border-blue-400/30">
          <div className="flex items-start gap-3">
            <Icon name="info" size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm text-blue-100">
              <p className="font-semibold">How to Configure Kokoro TTS</p>
              <ol className="list-decimal list-inside space-y-2 text-blue-200/90 ml-2">
                <li><strong>Choose a Voice:</strong> Select from the dropdown below. Try different voices to find your favorite!</li>
                <li><strong>Adjust Speed:</strong> Use the slider to make speech faster or slower (1.0x is normal speed).</li>
                <li><strong>Pick Device Backend:</strong> Auto is recommended. WebGPU uses ~350MB (faster), WASM uses ~86MB (slower but more compatible).</li>
                <li><strong>Download the Model:</strong> Click "Initialize Model" to download. Size depends on backend selected.</li>
                <li><strong>Test Your Voice:</strong> After initialization, click "Test Voice" to hear a sample.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Consolidated Performance & Compatibility Warnings - Only show in setup mode */}
      {isSetupMode && (
        <div className="space-y-3">
          {/* Main Performance Warning */}
          <div className="rounded-lg p-3 border border-yellow-500/30 bg-yellow-500/10">
            <div className="flex items-start gap-3">
              <Icon name="warning" size={20} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm text-yellow-100">
                <p className="font-semibold">Important Performance & Compatibility Notes</p>
                <ol className="list-decimal list-inside space-y-2 text-yellow-200/90 ml-2">
                  <li className="pl-2">
                    <strong>Page Lag:</strong> If you experience lag or poor performance with WebGPU or Auto backend, 
                    switch to <strong>WASM backend</strong> (in Advanced Settings below) or choose a different TTS provider.
                  </li>
                  <li className="pl-2">
                    <strong>Gibberish Audio:</strong> If the generated audio sounds like gibberish or is unintelligible while using WebGPU or Auto, 
                    your system doesn't support WebGPU properly. Switch to <strong>WASM backend</strong> to fix this issue.
                  </li>
                  <li className="pl-2">
                    <strong>Backend Comparison:</strong> WebGPU is 2-10x faster but requires GPU support and uses more memory (~350MB). 
                    WASM is slower but more stable, compatible with all systems, and uses less memory (~86MB).
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Voice Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          Voice {isSetupMode && <span className="text-xs text-white/60">(Step 1)</span>}
        </label>
        {isSetupMode && (
          <p className="text-xs text-white/60 mb-2">
            Choose the voice that will speak to you. Each voice has a unique personality and accent.
          </p>
        )}
        <select
          value={config.voice || KokoroVoices.AF_HEART}
          onChange={(e) => handleChange('voice', e.target.value)}
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
        >
          {voiceGroups.map((group) => (
            <optgroup key={group.label} label={group.label} className="bg-gray-800">
              {group.voices.map((voice) => (
                <option key={voice.value} value={voice.value} className="bg-gray-900">
                  {voice.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Speed Control */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          Speech Speed: {(config.speed || 1.0).toFixed(1)}x {isSetupMode && <span className="text-xs text-white/60">(Step 2)</span>}
        </label>
        {isSetupMode && (
          <p className="text-xs text-white/60 mb-2">
            Drag the slider to adjust how fast or slow the voice speaks. 1.0x is normal speed.
          </p>
        )}
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={config.speed || 1.0}
          onChange={(e) => handleChange('speed', parseFloat(e.target.value))}
          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-thumb"
        />
        <div className="flex justify-between text-xs text-white/50">
          <span>0.5x (Slower)</span>
          <span>1.0x (Normal)</span>
          <span>2.0x (Faster)</span>
        </div>
      </div>

      {/* Device Backend Selection - Moved outside Advanced Settings for visibility */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          Device Backend {isSetupMode && <span className="text-xs text-white/60">(Step 3 - Optional)</span>}
        </label>
        {isSetupMode && (
          <p className="text-xs text-white/60 mb-2">
            Choose how the model runs: <strong>Auto</strong> (recommended) automatically picks the best option. 
            <strong>WebGPU</strong> is faster (~350MB download) but needs a good graphics card. 
            <strong>WASM</strong> is slower but smaller (~86MB) and works on any device.
          </p>
        )}
        <select
          value={config.device || KokoroDevice.AUTO}
          onChange={(e) => handleChange('device', e.target.value)}
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
        >
          {deviceOptions.map((option) => (
            <option key={option.value} value={option.value} className="bg-gray-900">
              {option.label}
            </option>
          ))}
        </select>
        {isSetupMode && (
          <div className="mt-2 p-2 rounded-lg bg-blue-500/10 border border-blue-400/20">
            <p className="text-xs text-blue-200/90 flex items-start gap-1.5">
              <Icon name="idea" size={14} className="text-blue-300 flex-shrink-0 mt-0.5" />
              <span><strong>Tip:</strong> Select "Auto" to let the system choose the best option for your device. 
              If you have a gaming PC or laptop with a dedicated graphics card, it will use WebGPU (faster). 
              Otherwise, it will use WASM (smaller download, works everywhere).</span>
            </p>
          </div>
        )}
        {!isSetupMode && (
          <>
            <p className="text-xs text-white/50">
              Quantization is automatic: WebGPU uses fp32 (~350MB), WASM uses q8 (~86MB)
            </p>
            <div className="mt-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-2">
              <Icon name="warning" size={16} className="text-yellow-200/90 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-200/90 leading-relaxed">
                <strong>Performance Note:</strong> If the model or page lags, try switching to WASM backend for better stability. 
                However, WASM is significantly slower than WebGPU. For optimal performance, consider using different TTS providers 
                (OpenAI, OpenAI-Compatible) or hosting a TTS service directly on your device.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Advanced Settings Collapsible - Collapsed by default now */}
      <details className="space-y-2">
        <summary className="text-sm font-medium text-white/70 cursor-pointer hover:text-white/90">
          Advanced Settings {isSetupMode && <span className="text-xs text-white/60">(Optional)</span>}
        </summary>
        
        <div className="space-y-4 pt-2">
          {/* Model ID - Hidden in setup mode for simplicity */}
          {!isSetupMode && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/90">Model ID</label>
              <input
                type="text"
                value={config.modelId || ''}
                onChange={(e) => handleChange('modelId', e.target.value)}
                placeholder="onnx-community/Kokoro-82M-v1.0-ONNX"
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
              />
              <p className="text-xs text-white/50">
                HuggingFace model ID (Leave empty to use default: onnx-community/Kokoro-82M-v1.0-ONNX)
              </p>
            </div>
          )}

          {/* Keep Model Loaded */}
          <div className="space-y-2">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm font-medium text-white/90">Keep Model Loaded</span>
                <p className="text-xs text-white/50">
                  Periodically generates audio to keep model in memory (prevents unload lag)
                </p>
              </div>
              <Toggle
                checked={config.keepModelLoaded !== false}
                onChange={(checked) => handleChange('keepModelLoaded', checked)}
              />
            </label>
          </div>
        </div>
      </details>

      {/* Initialization & Status */}
      {kokoroStatus && onInitialize && (
        <div className="space-y-3 pt-2 border-t border-white/10">
          {isSetupMode && !kokoroStatus.initialized && (
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-400/30">
              <div className="flex items-start gap-2">
                <Icon name="download" size={18} className="text-purple-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-purple-100">
                  <p className="font-semibold mb-1">Step 4: Download the Model</p>
                  <p className="text-purple-200/90">
                    Click the "Initialize Model" button below to download Kokoro TTS. 
                    Download size: <strong>~86MB for WASM</strong> or <strong>~350MB for WebGPU</strong> (Auto chooses best for your device). 
                    This only happens once - the model is saved on your device for offline use. 
                    The download may take a few minutes depending on your internet speed.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between gap-3">
            <button 
              onClick={onInitialize}
              disabled={kokoroStatus.downloading || kokoroStatus.initialized || kokoroStatus.checking}
              className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                isSetupMode && !kokoroStatus.initialized ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-transparent animate-pulse' : ''
              }`}
            >
              {kokoroStatus.checking ? (
                <>
                  <span className="animate-spin"><Icon name="spinner" size={16} /></span>
                  <span>Loading...</span>
                </>
              ) : kokoroStatus.downloading ? (
                <>
                  <span className="animate-spin"><Icon name="spinner" size={16} /></span>
                  <span>Downloading...</span>
                </>
              ) : kokoroStatus.initialized ? (
                <>
                  <span><Icon name="check-circle" size={16} /></span>
                  <span>Model Ready</span>
                </>
              ) : (
                <>
                  <Icon name="download" size={16} />
                  <span>Initialize Model</span>
                </>
              )}
            </button>

            {onCheckStatus && (
              <button 
                onClick={onCheckStatus}
                disabled={kokoroStatus.checking}
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-2 text-sm rounded-lg disabled:opacity-50`}
                title="Check model status"
              >
                <Icon name="refresh" size={16} />
              </button>
            )}
          </div>

          {/* Progress Bar */}
          {kokoroStatus.downloading && (
            <div className="space-y-1">
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${kokoroStatus.progress}%` }}
                />
              </div>
              <p className="text-xs text-white/60 text-center">
                {kokoroStatus.progress.toFixed(1)}% - {kokoroStatus.details}
              </p>
            </div>
          )}

          {/* Status Message */}
          {kokoroStatus.message && !kokoroStatus.downloading && (
            <StatusMessage 
              message={kokoroStatus.message}
              isLightBackground={isLightBackground}
            />
          )}
        </div>
      )}

      {/* Test Voice Button */}
      {showTestButton && onTestVoice && kokoroStatus?.initialized && (
        <>
          {isSetupMode && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-400/30">
              <div className="flex items-start gap-2">
                <Icon name="volume" size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-100">
                  <p className="font-semibold mb-1">Step 5: Test Your Voice</p>
                  <p className="text-green-200/90">
                    Click "Test Voice" below to hear a sample with your selected voice and speed. 
                    This helps you confirm everything is working before continuing. You can change the voice 
                    or speed and test again until you find your perfect settings!
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <button
            onClick={onTestVoice}
            disabled={testingVoice}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-full py-2 text-sm font-medium rounded-lg ${
              isSetupMode ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-transparent' : ''
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="flex items-center justify-center gap-2">
              {testingVoice ? (
                <>
                  <span className="animate-spin"><Icon name="spinner" size={16} /></span>
                  <span>Testing Voice...</span>
                </>
              ) : (
                <>
                  <Icon name="volume" size={16} />
                  <span>Test Voice</span>
                </>
              )}
            </div>
          </button>
        </>
      )}
    </div>
  );
};

export default KokoroTTSConfig;
