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
import KokoroTTSConfig from './tts/KokoroTTSConfig';
import Toggle from '../common/Toggle';

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
      
      {/* Enable TTS Toggle */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
        <label htmlFor="enable-tts" className="text-sm font-medium text-white/90 cursor-pointer flex-1">
          Enable Text-to-Speech
        </label>
        <Toggle
          id="enable-tts"
          checked={ttsConfig.enabled}
          onChange={(checked) => updateTTSConfig('enabled', checked)}
        />
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
              <KokoroTTSConfig
                config={ttsConfig.kokoro || {}}
                onChange={(field, value) => updateTTSConfig(`kokoro.${field}`, value)}
                kokoroStatus={kokoroStatus}
                onInitialize={async () => {
                  try {
                    await initializeKokoro();
                  } catch (error) {
                    console.error('Kokoro initialization failed:', error);
                  }
                }}
                onCheckStatus={checkKokoroStatus}
                onTestVoice={null}
                isLightBackground={isLightBackground}
                showTitle={true}
                showTestButton={false}
              />

              {/* Cache Management - Only in Settings */}
              {kokoroStatus.initialized && (
                <div className="space-y-2 p-4 rounded-lg bg-white/5 border border-white/10">
                  <h4 className="text-sm font-semibold text-white/90">Cache Management</h4>
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
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1 text-xs rounded-lg flex items-center gap-1.5`}
                      title="Check cache size"
                    >
                      <Icon name="stats" size={14} /> Check Size
                    </button>
                    <button 
                      onClick={async () => {
                        if (!confirm('Clear Kokoro model cache? You will need to re-download the model (~86MB).')) {
                          return;
                        }
                        try {
                          setClearingCache(true);
                          await TTSServiceProxy.clearKokoroCache();
                          setCacheSize(null);
                          await checkKokoroStatus();
                        } catch (error) {
                          console.error('Failed to clear cache:', error);
                          alert('Failed to clear cache: ' + error.message);
                        } finally {
                          setClearingCache(false);
                        }
                      }}
                      disabled={clearingCache}
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1 text-xs rounded-lg disabled:opacity-50 flex items-center gap-1.5`}
                      title="Clear model cache"
                    >
                      {clearingCache ? (
                        <>
                          <Icon name="loading" size={14} className="animate-spin" /> Clearing...
                        </>
                      ) : (
                        <>
                          <Icon name="delete" size={14} /> Clear Cache
                        </>
                      )}
                    </button>
                  </div>
                  {cacheSize !== null && cacheSize.usage !== undefined && (
                    <div className="text-xs text-white/60">
                      Cache: {(cacheSize.usage / 1024 / 1024).toFixed(1)} MB
                    </div>
                  )}
                </div>
              )}
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
