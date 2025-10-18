/**
 * TTSSettings Component
 * TTS configuration tab for SettingsPanel
 * Handles Text-to-Speech provider selection and configuration
 */

import { useConfig } from '../../contexts/ConfigContext';
import { TTSProviders, OpenAIVoices } from '../../config/aiConfig';

const TTSSettings = ({ isLightBackground }) => {
  const {
    // TTS Config
    ttsConfig,
    ttsConfigSaved,
    ttsConfigError,
    updateTTSConfig,
    saveTTSConfig,
    testTTSConnection,
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
                  value={ttsConfig['openai-compatible']?.endpoint || 'http://localhost:8000'}
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
                  value={ttsConfig['openai-compatible']?.apiKey || ''}
                  onChange={(e) => updateTTSConfig('openai-compatible.apiKey', e.target.value)}
                  placeholder="Leave empty if not required"
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Model</label>
                <input
                  type="text"
                  value={ttsConfig['openai-compatible']?.model || 'tts'}
                  onChange={(e) => updateTTSConfig('openai-compatible.model', e.target.value)}
                  placeholder="tts"
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Voice</label>
                <input
                  type="text"
                  value={ttsConfig['openai-compatible']?.voice || 'default'}
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
          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg`}
          disabled={!ttsConfig.enabled}
        >
          Test TTS
        </button>
        <button 
          onClick={saveTTSConfig} 
          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg`}
        >
          Save TTS Config
        </button>
      </div>
      
      {ttsConfigSaved && (
        <span className="text-sm text-green-400">✓ Saved successfully!</span>
      )}
      {ttsConfigError && (
        <span className="text-sm text-white/70">{ttsConfigError}</span>
      )}
    </div>
  );
};

export default TTSSettings;
