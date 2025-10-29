/**
 * TTSSettings Component
 * TTS configuration tab for SettingsPanel
 * Handles Text-to-Speech provider selection and configuration
 */

import { useState } from 'react'
import { Icon } from '../icons';
import { useConfig } from '../../contexts/ConfigContext';
import { TTSProviders, OpenAIVoices, KokoroVoices, KokoroQuantization, KokoroDevice } from '../../config/aiConfig';
import TTSServiceProxy from '../../services/proxies/TTSServiceProxy';

const TTSSettings = ({ isLightBackground }) => {
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheSize, setCacheSize] = useState(null);
  
  const {
    // TTS Config
    ttsConfig,
    ttsTesting,
    updateTTSConfig,
    testTTSConnection,
    // Kokoro Status
    kokoroStatus,
    checkKokoroStatus,
    initializeKokoro,
  } = useConfig();

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">TTS Configuration</h3>
      
      {/* Enable TTS Checkbox */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
        <input
          type="checkbox"
          id="enable-tts"
          checked={ttsConfig.enabled}
          onChange={(e) => updateTTSConfig('enabled', e.target.checked)}
          className="w-4 h-4 rounded border-white/20 bg-white/10 checked:bg-blue-500"
        />
        <label htmlFor="enable-tts" className="text-sm font-medium text-white/90 cursor-pointer">
          Enable Text-to-Speech
        </label>
      </div>

      {/* Provider Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Provider</label>
        <select
          value={ttsConfig.provider}
          onChange={(e) => updateTTSConfig('provider', e.target.value)}
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
          disabled={!ttsConfig.enabled}
        >
          {Object.entries(TTSProviders).map(([key, value]) => (
            <option key={value} value={value} className="bg-gray-900">{key}</option>
          ))}
        </select>
      </div>

      {/* Configuration sections - only show when enabled */}
      {ttsConfig.enabled && (
        <>
          {/* Kokoro TTS Configuration */}
          {ttsConfig.provider === TTSProviders.KOKORO && (
            <>
              <div className="space-y-4 p-4 rounded-lg bg-white/5 border border-white/10">
                <h4 className="text-sm font-semibold text-white/90">Kokoro TTS</h4>
                
                {/* Voice Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">Voice</label>
                  <select
                    value={ttsConfig.kokoro?.voice || KokoroVoices.AF_HEART}
                    onChange={(e) => updateTTSConfig('kokoro.voice', e.target.value)}
                    className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                  >
                    {Object.entries(KokoroVoices).map(([key, value]) => (
                      <option key={value} value={value} className="bg-gray-900">{key}</option>
                    ))}
                  </select>
                </div>

                {/* Speed Control */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">
                    Speech Speed: {ttsConfig.kokoro?.speed || 1.0}x
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={ttsConfig.kokoro?.speed || 1.0}
                    onChange={(e) => updateTTSConfig('kokoro.speed', parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider-thumb"
                  />
                  <div className="flex justify-between text-xs text-white/50">
                    <span>0.5x (Slower)</span>
                    <span>1.0x (Normal)</span>
                    <span>2.0x (Faster)</span>
                  </div>
                </div>

                {/* Advanced Settings Collapsible */}
                <details className="space-y-2">
                  <summary className="text-sm font-medium text-white/70 cursor-pointer hover:text-white/90">
                    Advanced Settings
                  </summary>
                  
                  <div className="space-y-4 pt-2">
                    {/* Model ID */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/90">Model ID</label>
                      <input
                        type="text"
                        value={ttsConfig.kokoro?.modelId || ''}
                        onChange={(e) => updateTTSConfig('kokoro.modelId', e.target.value)}
                        placeholder="onnx-community/Kokoro-82M-v1.0-ONNX"
                        className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full text-xs`}
                      />
                      <p className="text-xs text-white/50">
                        HuggingFace model ID (Leave empty to use default: onnx-community/Kokoro-82M-v1.0-ONNX)
                      </p>
                    </div>

                    {/* Device Selection */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-white/90">Device Backend</label>
                      <select
                        value={ttsConfig.kokoro?.device || KokoroDevice.AUTO}
                        onChange={(e) => updateTTSConfig('kokoro.device', e.target.value)}
                        className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                      >
                        {Object.entries(KokoroDevice).map(([key, value]) => (
                          <option key={value} value={value} className="bg-gray-900">{key}</option>
                        ))}
                      </select>
                      <p className="text-xs text-white/50">
                        Quantization is automatic: WebGPU uses fp32, WASM uses q8
                      </p>
                      <div className="mt-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                        <p className="text-xs text-yellow-200/90 leading-relaxed"><Icon name="warning" size={16} /><strong>Performance Note:</strong> If the model or page lags, try switching to WASM backend for better stability. 
                          However, WASM is significantly slower than WebGPU. For optimal performance, consider using different TTS providers 
                          (OpenAI, OpenAI-Compatible) or hosting a TTS service directly on your device.
                        </p>
                      </div>
                    </div>

                    {/* Keep Model Loaded */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ttsConfig.kokoro?.keepModelLoaded !== false}
                          onChange={(e) => updateTTSConfig('kokoro.keepModelLoaded', e.target.checked)}
                          className="w-4 h-4 rounded border-white/20 bg-white/5 checked:bg-blue-500"
                        />
                        <span className="text-sm font-medium text-white/90">Keep Model Loaded</span>
                      </label>
                      <p className="text-xs text-white/50">
                        Periodically generates audio to keep model in memory (prevents unload lag)
                      </p>
                    </div>
                  </div>
                </details>

                {/* Initialization & Status */}
                <div className="space-y-3 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <button 
                      onClick={async () => {
                        try {
                          await initializeKokoro();
                        } catch (error) {
                          console.error('Kokoro initialization failed:', error);
                        }
                      }}
                      disabled={kokoroStatus.downloading || kokoroStatus.initialized}
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                    >
                      {kokoroStatus.downloading ? (
                        <>
                          <span className="animate-spin"><Icon name="hourglass" size={16} /></span>
                          <span>Downloading...</span>
                        </>
                      ) : kokoroStatus.initialized ? (
                        <>
                          <span><Icon name="success" size={16} /></span>
                          <span>Model Ready</span>
                        </>
                      ) : (
                        <>
                          <span>⬇️</span>
                          <span>Initialize Model</span>
                        </>
                      )}
                    </button>

                    <button 
                      onClick={checkKokoroStatus}
                      disabled={kokoroStatus.checking}
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-2 text-sm rounded-lg disabled:opacity-50`}
                      title="Check model status"
                    ><Icon name="refresh" size={16} /></button>
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
                    <div className={`p-2 rounded-lg text-xs ${
                      kokoroStatus.state === 'ready' ? 'bg-emerald-500/20 text-emerald-100' :
                      kokoroStatus.state === 'error' ? 'bg-red-500/20 text-red-100' :
                      'bg-blue-500/20 text-blue-100'
                    }`}>
                      {kokoroStatus.message}
                      {kokoroStatus.details && (
                        <div className="text-white/60 mt-1">{kokoroStatus.details}</div>
                      )}
                    </div>
                  )}

                  {/* Cache Management */}
                  {kokoroStatus.initialized && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                      <div className="flex gap-2">
                        <button 
                          onClick={async () => {
                            try {
                              const size = await TTSServiceProxy.getKokoroCacheSize();
                              setCacheSize(size);
                            } catch (error) {
                              console.error('Failed to get cache size:', error);
                            }
                          }}
                          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1 text-xs rounded-lg`}
                          title="Check cache size"
                        >
                          📊 Check Size
                        </button>
                        <button 
                          onClick={async () => {
                            if (!confirm('Clear Kokoro model cache? You will need to re-download the model (~86MB).')) {
                              return;
                            }
                            try {
                              setClearingCache(true);
                              // Clear cache through proxy (works in both dev and extension mode)
                              await TTSServiceProxy.clearKokoroCache();
                              setCacheSize(null);
                              // Force re-check status after clearing cache
                              await checkKokoroStatus();
                            } catch (error) {
                              console.error('Failed to clear cache:', error);
                              alert('Failed to clear cache: ' + error.message);
                            } finally {
                              setClearingCache(false);
                            }
                          }}
                          disabled={clearingCache}
                          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1 text-xs rounded-lg disabled:opacity-50`}
                          title="Clear model cache"
                        >
                          {clearingCache ? 'hourglass:Clearing...' : 'delete:Clear Cache'}
                        </button>
                      </div>
                      {cacheSize !== null && cacheSize.usage !== undefined && (
                        <div className="text-xs text-white/60">
                          Cache: {(cacheSize.usage / 1024 / 1024).toFixed(1)} MB
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* OpenAI TTS Configuration */}
          {ttsConfig.provider === TTSProviders.OPENAI && (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">API Key</label>
                <input
                  type="password"
                  value={ttsConfig.openai.apiKey}
                  onChange={(e) => updateTTSConfig('openai.apiKey', e.target.value)}
                  placeholder="sk-..."
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Model</label>
                <select
                  value={ttsConfig.openai.model}
                  onChange={(e) => updateTTSConfig('openai.model', e.target.value)}
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                >
                  <option value="tts-1" className="bg-gray-900">tts-1 (Standard)</option>
                  <option value="tts-1-hd" className="bg-gray-900">tts-1-hd (HD)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Voice</label>
                <select
                  value={ttsConfig.openai.voice}
                  onChange={(e) => updateTTSConfig('openai.voice', e.target.value)}
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                >
                  {Object.entries(OpenAIVoices).map(([key, value]) => (
                    <option key={value} value={value} className="bg-gray-900">
                      {key.charAt(0) + key.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* ElevenLabs Configuration */}
          {ttsConfig.provider === TTSProviders.ELEVENLABS && (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">API Key</label>
                <input
                  type="password"
                  value={ttsConfig.elevenlabs?.apiKey || ''}
                  onChange={(e) => updateTTSConfig('elevenlabs.apiKey', e.target.value)}
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Voice ID</label>
                <input
                  type="text"
                  value={ttsConfig.elevenlabs?.voiceId || ''}
                  onChange={(e) => updateTTSConfig('elevenlabs.voiceId', e.target.value)}
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
            </>
          )}

          {/* OpenAI-Compatible TTS Configuration */}
          {ttsConfig.provider === TTSProviders.OPENAI_COMPATIBLE && (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Endpoint URL</label>
                <input
                  type="text"
                  value={ttsConfig['openai-compatible']?.endpoint ?? ''}
                  onChange={(e) => updateTTSConfig('openai-compatible.endpoint', e.target.value)}
                  placeholder="http://localhost:8000"
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
                <p className="text-xs text-white/50">
                  Base URL (will append /v1/audio/speech)
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">API Key (Optional)</label>
                <input
                  type="password"
                  value={ttsConfig['openai-compatible']?.apiKey ?? ''}
                  onChange={(e) => updateTTSConfig('openai-compatible.apiKey', e.target.value)}
                  placeholder="Leave empty if not required"
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Model</label>
                <input
                  type="text"
                  value={ttsConfig['openai-compatible']?.model ?? ''}
                  onChange={(e) => updateTTSConfig('openai-compatible.model', e.target.value)}
                  placeholder="tts"
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Voice</label>
                <input
                  type="text"
                  value={ttsConfig['openai-compatible']?.voice ?? ''}
                  onChange={(e) => updateTTSConfig('openai-compatible.voice', e.target.value)}
                  placeholder="default"
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
            </>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4">
        <button 
          onClick={testTTSConnection}
          disabled={!ttsConfig.enabled || ttsTesting}
          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Test TTS
        </button>
      </div>
    </div>
  );
};

export default TTSSettings;
