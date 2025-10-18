/**
 * SettingsPanel Component
 * User-facing settings panel that lives inside ChatContainer
 * Contains UI, LLM, TTS, STT configurations with test buttons
 * Uses ConfigContext for state management
 */

import { useState, useEffect } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { AIProviders, TTSProviders, STTProviders, OpenAIVoices } from '../config/aiConfig';
import { BackgroundThemeModes } from '../config/uiConfig';
import ChromeAIValidator from '../services/ChromeAIValidator';

const SettingsPanel = ({ onClose, isLightBackground }) => {
  const [activeTab, setActiveTab] = useState('ui');
  const [hasChromeAI, setHasChromeAI] = useState(false);
  
  // Check Chrome version on mount
  useEffect(() => {
    const validator = ChromeAIValidator;
    const hasMinVersion = validator.hasMinimumChromeVersion();
    setHasChromeAI(hasMinVersion);
    
    if (!hasMinVersion) {
      const version = validator.getChromeVersion();
      console.log(`[SettingsPanel] Chrome ${version} detected - Chrome AI requires Chrome 138+`);
    }
  }, []);
  
  const {
    // UI Config
    uiConfig,
    uiConfigSaved,
    uiConfigError,
    updateUIConfig,
    saveUIConfig,
    
    // AI Config
    aiConfig,
    aiConfigSaved,
    aiConfigError,
    updateAIConfig,
    saveAIConfig,
    testAIConnection,
    
    // TTS Config
    ttsConfig,
    ttsConfigSaved,
    ttsConfigError,
    updateTTSConfig,
    saveTTSConfig,
    testTTSConnection,
    
    // STT Config
    sttConfig,
    sttConfigSaved,
    sttConfigError,
    sttTesting,
    updateSTTConfig,
    saveSTTConfig,
    testSTTRecording,
    
    // General Config
    generalConfig,
    generalConfigError,
    updateGeneralConfig,
    saveGeneralConfig,
    
    // Chrome AI Status
    chromeAiStatus,
    checkChromeAIAvailability,
    startChromeAIDownload,
  } = useConfig();

  return (
    <div className={`absolute inset-0 flex flex-col glass-container ${isLightBackground ? 'glass-container-dark' : ''} rounded-2xl overflow-hidden`}>
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-white/20">
        <h2 className="text-lg font-semibold text-white">Settings</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/20 px-6">
        <button
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'ui' 
              ? 'border-white text-white' 
              : 'border-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('ui')}
        >
          UI
        </button>
        <button
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'llm' 
              ? 'border-white text-white' 
              : 'border-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('llm')}
        >
          LLM
        </button>
        <button
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'tts' 
              ? 'border-white text-white' 
              : 'border-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('tts')}
        >
          TTS
        </button>
        <button
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'stt' 
              ? 'border-white text-white' 
              : 'border-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActiveTab('stt')}
        >
          STT
        </button>
      </div>

      {/* Tab Content - Scrollable with custom scrollbar */}
      <div 
        className="flex-1 overflow-y-auto px-6 py-4"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* UI Tab */}
        {activeTab === 'ui' && (
          <div className="space-y-6">
            <h3 className="text-base font-semibold text-white mb-4">UI Configuration</h3>
            
            {/* Model Loading Toggle */}
            <div className="space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generalConfig.enableModelLoading}
                  onChange={(e) => updateGeneralConfig('enableModelLoading', e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-sm text-white">Enable 3D Model Loading</span>
              </label>
              <p className="text-xs text-white/50 ml-7">
                {generalConfig.enableModelLoading 
                  ? 'Virtual assistant with 3D avatar' 
                  : 'Chat-only mode (no 3D model)'}
              </p>
            </div>

            {/* Enable Developer Tools Toggle */}
            <div className="space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generalConfig.enableDebugPanel || false}
                  onChange={(e) => updateGeneralConfig('enableDebugPanel', e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-sm text-white">Enable Developer Tools</span>
              </label>
              <p className="text-xs text-white/50 ml-7">
                Show draggable debug panel for testing animations and positions
              </p>
            </div>

            {/* Save General Config Button */}
            <div className="flex items-center gap-3 pt-4">
              <button 
                onClick={saveGeneralConfig} 
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg`}
              >
                Save General Config
              </button>
              {generalConfigError && (
                <span className="text-sm text-red-400">{generalConfigError}</span>
              )}
            </div>

            {/* Theme Mode */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/90">Theme Mode</label>
              <select
                value={uiConfig.backgroundDetection?.mode || BackgroundThemeModes.ADAPTIVE}
                onChange={(e) => updateUIConfig('backgroundDetection.mode', e.target.value)}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
              >
                {Object.entries(BackgroundThemeModes).map(([key, value]) => (
                  <option key={value} value={value} className="bg-gray-900">
                    {key.charAt(0) + key.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              <p className="text-xs text-white/50">
                Adaptive: Detects background brightness automatically
              </p>
            </div>

            {/* Adaptive Settings - Only show when mode is ADAPTIVE */}
            {(uiConfig.backgroundDetection?.mode || BackgroundThemeModes.ADAPTIVE) === BackgroundThemeModes.ADAPTIVE && (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">Sample Grid Size</label>
                  <input
                    type="number"
                    min="3"
                    max="10"
                    value={uiConfig.backgroundDetection?.sampleGridSize || 5}
                    onChange={(e) => updateUIConfig('backgroundDetection.sampleGridSize', parseInt(e.target.value))}
                    className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                  />
                  <p className="text-xs text-white/50">
                    Number of sample points (grid size x grid size). Default: 5 (25 points)
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={uiConfig.backgroundDetection?.showDebug || false}
                      onChange={(e) => updateUIConfig('backgroundDetection.showDebug', e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-white">Show Debug Markers</span>
                  </label>
                  <p className="text-xs text-white/50 ml-7">
                    Display sample points and brightness values on screen
                  </p>
                </div>
              </>
            )}

            {/* Chat Position */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/90">Chat Position</label>
              <select
                value={uiConfig.chatPosition}
                onChange={(e) => updateUIConfig('chatPosition', e.target.value)}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
              >
                <option value="bottom-right" className="bg-gray-900">Bottom Right</option>
                <option value="bottom-left" className="bg-gray-900">Bottom Left</option>
                <option value="top-right" className="bg-gray-900">Top Right</option>
                <option value="top-left" className="bg-gray-900">Top Left</option>
              </select>
            </div>

            {/* Save Button */}
            <div className="flex items-center gap-3 pt-4">
              <button 
                onClick={saveUIConfig} 
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg`}
              >
                Save UI Config
              </button>
              {uiConfigSaved && (
                <span className="text-sm text-green-400">✓ Saved successfully!</span>
              )}
              {uiConfigError && (
                <span className="text-sm text-red-400">{uiConfigError}</span>
              )}
            </div>
          </div>
        )}

        {/* LLM Tab */}
        {activeTab === 'llm' && (
          <div className="space-y-6">
            <h3 className="text-base font-semibold text-white mb-4">LLM Configuration</h3>
            
            {/* Provider Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/90">Provider</label>
              <select
                value={aiConfig.provider}
                onChange={(e) => updateAIConfig('provider', e.target.value)}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
              >
                {Object.entries(AIProviders).map(([key, value]) => (
                  <option key={value} value={value} className="bg-gray-900">{key}</option>
                ))}
              </select>
            </div>

            {aiConfig.provider === 'chrome-ai' && !hasChromeAI && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-300">
                  Chrome AI requires Chrome 138 or later. Please update your browser.
                </p>
              </div>
            )}

            {/* OpenAI Configuration */}
            {aiConfig.provider === AIProviders.OPENAI && (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">API Key</label>
                  <input
                    type="password"
                    value={aiConfig.openai.apiKey}
                    onChange={(e) => updateAIConfig('openai.apiKey', e.target.value)}
                    placeholder="sk-..."
                    className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">Model</label>
                  <input
                    type="text"
                    value={aiConfig.openai.model}
                    onChange={(e) => updateAIConfig('openai.model', e.target.value)}
                    placeholder="gpt-4o"
                    className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                  />
                </div>
              </>
            )}

            {/* Ollama Configuration */}
            {aiConfig.provider === AIProviders.OLLAMA && (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">Endpoint URL</label>
                  <input
                    type="text"
                    value={aiConfig.ollama?.endpoint || 'http://localhost:11434'}
                    onChange={(e) => updateAIConfig('ollama.endpoint', e.target.value)}
                    placeholder="http://localhost:11434"
                    className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                  />
                  <p className="text-xs text-white/50">
                    URL of your local Ollama server
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">Model</label>
                  <input
                    type="text"
                    value={aiConfig.ollama?.model || 'llama2'}
                    onChange={(e) => updateAIConfig('ollama.model', e.target.value)}
                    placeholder="llama2"
                    className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                  />
                  <p className="text-xs text-white/50">
                    Model name (e.g., llama2, mistral, codellama)
                  </p>
                </div>
              </>
            )}

            {/* Chrome AI Configuration */}
            {aiConfig.provider === AIProviders.CHROME_AI && (
              <>
                {/* Info Banner */}
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-300">
                    <span className="font-semibold">Chrome Built-in AI (Gemini Nano)</span> - On-device AI running locally
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

                {/* Temperature Slider */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">
                    Temperature: {aiConfig.chromeAi?.temperature || 1.0}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={aiConfig.chromeAi?.temperature || 1.0}
                    onChange={(e) => updateAIConfig('chromeAi.temperature', parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-white/50">
                    Controls randomness (0 = deterministic, 2 = very creative)
                  </p>
                </div>

                {/* Top-K Slider */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">
                    Top-K: {aiConfig.chromeAi?.topK || 3}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={aiConfig.chromeAi?.topK || 3}
                    onChange={(e) => updateAIConfig('chromeAi.topK', parseInt(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-white/50">
                    Limits token choices for more focused responses
                  </p>
                </div>

                {/* Output Language */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">Output Language</label>
                  <select
                    value={aiConfig.chromeAi?.outputLanguage || 'en'}
                    onChange={(e) => updateAIConfig('chromeAi.outputLanguage', e.target.value)}
                    className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                  >
                    <option value="en" className="bg-gray-900">English (en)</option>
                    <option value="es" className="bg-gray-900">Spanish (es)</option>
                    <option value="ja" className="bg-gray-900">Japanese (ja)</option>
                  </select>
                  <p className="text-xs text-white/50">
                    Specifies the output language for optimal quality and safety
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
                    <p className="text-white/50 mt-2">
                      Enable these flags and restart Chrome, then visit <code className="text-blue-300">chrome://components</code> to download Gemini Nano
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4">
              <button 
                onClick={testAIConnection} 
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg`}
              >
                Test Connection
              </button>
              <button 
                onClick={saveAIConfig} 
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg`}
              >
                Save LLM Config
              </button>
            </div>
            
            {aiConfigSaved && (
              <span className="text-sm text-green-400">✓ Saved successfully!</span>
            )}
            {aiConfigError && (
              <span className="text-sm text-white/70">{aiConfigError}</span>
            )}
          </div>
        )}

        {/* TTS Tab */}
        {activeTab === 'tts' && (
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
        )}

        {/* STT Tab */}
        {activeTab === 'stt' && (
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
                    value={sttConfig['openai-compatible']?.endpoint || 'http://localhost:8000'}
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
                    value={sttConfig['openai-compatible']?.apiKey || ''}
                    onChange={(e) => updateSTTConfig('openai-compatible.apiKey', e.target.value)}
                    placeholder="Leave empty if not required"
                    className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white/90">Model</label>
                  <input
                    type="text"
                    value={sttConfig['openai-compatible']?.model || 'whisper'}
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
        )}
      </div>
    </div>
  );
};

export default SettingsPanel;
