/**
 * STTSettings Component
 * STT configuration tab for SettingsPanel
 * Handles Speech-to-Text provider selection and configuration
 */

import { useConfig } from '../../contexts/ConfigContext';
import { STTProviders } from '../../config/aiConfig';

const STTSettings = ({ isLightBackground, hasChromeAI }) => {
  const {
    // STT Config
    sttConfig,
    sttConfigSaved,
    sttConfigError,
    sttTesting,
    updateSTTConfig,
    saveSTTConfig,
    testSTTRecording,
    
    // Chrome AI Status
    chromeAiStatus,
    checkChromeAIAvailability,
    startChromeAIDownload,
  } = useConfig();

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">STT Configuration</h3>
      
      {/* Enable STT Checkbox */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
        <input
          type="checkbox"
          id="enable-stt"
          checked={sttConfig.enabled}
          onChange={(e) => updateSTTConfig('enabled', e.target.checked)}
          className="w-4 h-4 rounded border-white/20 bg-white/10 checked:bg-blue-500"
        />
        <label htmlFor="enable-stt" className="text-sm font-medium text-white/90 cursor-pointer">
          Enable Speech-to-Text
        </label>
      </div>

      {/* Provider Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">Provider</label>
        <select
          value={sttConfig.provider}
          onChange={(e) => updateSTTConfig('provider', e.target.value)}
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
          disabled={!sttConfig.enabled}
        >
          {Object.entries(STTProviders).map(([key, value]) => (
            <option key={value} value={value} className="bg-gray-900">{key}</option>
          ))}
        </select>
      </div>

      {sttConfig.provider === 'chrome-ai-multimodal' && !hasChromeAI && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-300">
            Chrome AI requires Chrome 138 or later. Please update your browser.
          </p>
        </div>
      )}

      {/* Configuration sections - only show when enabled */}
      {sttConfig.enabled && (
        <>
          {/* OpenAI Whisper Configuration */}
          {sttConfig.provider === STTProviders.OPENAI && (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">API Key</label>
                <input
                  type="password"
                  value={sttConfig.openai.apiKey}
                  onChange={(e) => updateSTTConfig('openai.apiKey', e.target.value)}
                  placeholder="sk-..."
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Model</label>
                <input
                  type="text"
                  value={sttConfig.openai.model}
                  onChange={(e) => updateSTTConfig('openai.model', e.target.value)}
                  placeholder="whisper-1"
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
            </>
          )}

          {/* OpenAI-Compatible STT Configuration */}
          {sttConfig.provider === STTProviders.OPENAI_COMPATIBLE && (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Endpoint URL</label>
                <input
                  type="text"
                  value={sttConfig['openai-compatible']?.endpoint ?? ''}
                  onChange={(e) => updateSTTConfig('openai-compatible.endpoint', e.target.value)}
                  placeholder="http://localhost:8000"
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
                <p className="text-xs text-white/50">
                  Base URL (will append /v1/audio/transcriptions)
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">API Key (Optional)</label>
                <input
                  type="password"
                  value={sttConfig['openai-compatible']?.apiKey ?? ''}
                  onChange={(e) => updateSTTConfig('openai-compatible.apiKey', e.target.value)}
                  placeholder="Leave empty if not required"
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Model</label>
                <input
                  type="text"
                  value={sttConfig['openai-compatible']?.model ?? ''}
                  onChange={(e) => updateSTTConfig('openai-compatible.model', e.target.value)}
                  placeholder="whisper"
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                />
              </div>
            </>
          )}

          {/* Chrome AI Multimodal STT Configuration */}
          {sttConfig.provider === STTProviders.CHROME_AI_MULTIMODAL && (
            <>
              {/* Info Banner */}
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-blue-300">
                  <span className="font-semibold">Chrome Built-in AI Multimodal</span> - On-device audio transcription using Gemini Nano
                </p>
              </div>

              {/* Availability Status */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Status</label>
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  {chromeAiStatus.checking ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                      <span className="text-xs text-white/70">Checking availability...</span>
                    </div>
                  ) : chromeAiStatus.state ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-2 h-2 rounded-full ${
                          chromeAiStatus.available ? 'bg-green-400' :
                          chromeAiStatus.downloading ? 'bg-yellow-400 animate-pulse' :
                          'bg-red-400'
                        }`}></div>
                        <span className="text-sm font-semibold text-white/90">{chromeAiStatus.message}</span>
                      </div>
                      <p className="text-xs text-white/60">{chromeAiStatus.details}</p>
                      
                      {/* Download Progress */}
                      {chromeAiStatus.downloading && (
                        <div className="mt-3 space-y-2">
                          <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                            <p className="text-xs text-yellow-300">
                              Download in progress. For real-time progress, visit{' '}
                              <a 
                                href="chrome://on-device-internals/" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="underline hover:text-yellow-200"
                              >
                                chrome://on-device-internals/
                              </a>
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Download Button */}
                      {(chromeAiStatus.state === 'downloadable' || chromeAiStatus.state === 'after-download') && !chromeAiStatus.downloading && (
                        <button
                          onClick={startChromeAIDownload}
                          className={`mt-3 glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-xs font-medium rounded-lg w-full`}
                        >
                          Start Model Download
                        </button>
                      )}
                      
                      {/* Refresh Status Button */}
                      <button
                        onClick={checkChromeAIAvailability}
                        className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                      >
                        ↻ Refresh Status
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={checkChromeAIAvailability}
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-xs font-medium rounded-lg w-full`}
                    >
                      Check Status
                    </button>
                  )}
                </div>
              </div>

              {/* Output Language */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Output Language</label>
                <select
                  value={sttConfig['chrome-ai-multimodal']?.outputLanguage || 'en'}
                  onChange={(e) => updateSTTConfig('chrome-ai-multimodal.outputLanguage', e.target.value)}
                  className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                >
                  <option value="en" className="bg-gray-900">English (en)</option>
                  <option value="es" className="bg-gray-900">Spanish (es)</option>
                  <option value="ja" className="bg-gray-900">Japanese (ja)</option>
                </select>
                <p className="text-xs text-white/50">
                  Specifies the output language for transcription
                </p>
              </div>

              {/* Required Flags */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/90">Required Chrome Flags</label>
                <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">optimization-guide-on-device-model</span>
                    <button
                      onClick={() => navigator.clipboard.writeText('chrome://flags/#optimization-guide-on-device-model')}
                      className="text-blue-400 hover:text-blue-300 text-xs"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">prompt-api-for-gemini-nano</span>
                    <button
                      onClick={() => navigator.clipboard.writeText('chrome://flags/#prompt-api-for-gemini-nano')}
                      className="text-blue-400 hover:text-blue-300 text-xs"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">multimodal-input</span>
                    <button
                      onClick={() => navigator.clipboard.writeText('chrome://flags/#multimodal-input')}
                      className="text-blue-400 hover:text-blue-300 text-xs"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-white/50 mt-2">
                    Enable these flags and restart Chrome, then visit <code className="text-blue-300">chrome://components</code> to download Gemini Nano
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4">
        <button 
          onClick={testSTTRecording} 
          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed`}
          disabled={!sttConfig.enabled || sttTesting}
        >
          {sttTesting ? 'Testing...' : 'Test Recording (3s)'}
        </button>
        <button 
          onClick={saveSTTConfig} 
          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg`}
        >
          Save STT Config
        </button>
      </div>
      
      {sttConfigSaved && (
        <span className="text-sm text-green-400">✓ Saved successfully!</span>
      )}
      {sttConfigError && (
        <span className="text-sm text-white/70">{sttConfigError}</span>
      )}
    </div>
  );
};

export default STTSettings;
