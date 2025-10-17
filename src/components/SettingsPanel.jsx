/**
 * SettingsPanel Component
 * User-facing settings panel that lives inside ChatContainer
 * Contains UI, LLM, TTS, STT configurations with test buttons
 * Uses ConfigContext for state management
 */

import { useState } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { AIProviders, TTSProviders, STTProviders, OpenAIVoices } from '../config/aiConfig';
import { BackgroundThemeModes } from '../config/uiConfig';

const SettingsPanel = ({ onClose, isLightBackground }) => {
  const [activeTab, setActiveTab] = useState('ui');
  
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
            
            {/* Provider Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/90">Provider</label>
              <select
                value={ttsConfig.provider}
                onChange={(e) => updateTTSConfig('provider', e.target.value)}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
              >
                {Object.entries(TTSProviders).map(([key, value]) => (
                  <option key={value} value={value} className="bg-gray-900">{key}</option>
                ))}
              </select>
            </div>

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

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4">
              <button 
                onClick={testTTSConnection} 
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg`}
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
            
            {/* Provider Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/90">Provider</label>
              <select
                value={sttConfig.provider}
                onChange={(e) => updateSTTConfig('provider', e.target.value)}
                className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
              >
                {Object.entries(STTProviders).map(([key, value]) => (
                  <option key={value} value={value} className="bg-gray-900">{key}</option>
                ))}
              </select>
            </div>

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

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4">
              <button 
                onClick={testSTTRecording} 
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={sttTesting}
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
