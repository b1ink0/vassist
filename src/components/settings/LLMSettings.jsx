/**
 * LLMSettings Component
 * LLM configuration tab for SettingsPanel
 * Handles provider selection and configuration for OpenAI, Ollama, and Chrome AI
 */

import { useConfig } from '../../contexts/ConfigContext';
import { AIProviders } from '../../config/aiConfig';
import { PromptConfig } from '../../config/promptConfig';
import Toggle from '../common/Toggle';

// Reusable Image Support Component
const ImageSupportToggle = ({ providerKey, updateAIConfig, aiConfig, additionalNote = '' }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
      <label htmlFor={`${providerKey}-image-support`} className="text-sm font-medium text-white/90 cursor-pointer flex-1">
        Enable Image Support (Multi-modal)
        <p className="text-xs text-white/50 mt-0.5">
          Allows sending images with text prompts. Enabled by default.{additionalNote && ` ${additionalNote}`}
        </p>
      </label>
      <Toggle
        id={`${providerKey}-image-support`}
        checked={aiConfig[providerKey]?.enableImageSupport !== false}
        onChange={(checked) => updateAIConfig(`${providerKey}.enableImageSupport`, checked)}
      />
    </div>
  </div>
);

// Reusable Audio Support Component
const AudioSupportToggle = ({ providerKey, updateAIConfig, aiConfig, additionalNote = '' }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
      <label htmlFor={`${providerKey}-audio-support`} className="text-sm font-medium text-white/90 cursor-pointer flex-1">
        Enable Audio Support (Multi-modal)
        <p className="text-xs text-white/50 mt-0.5">
          Allows sending audio files with text prompts. Enabled by default.{additionalNote && ` ${additionalNote}`}
        </p>
      </label>
      <Toggle
        id={`${providerKey}-audio-support`}
        checked={aiConfig[providerKey]?.enableAudioSupport !== false}
        onChange={(checked) => updateAIConfig(`${providerKey}.enableAudioSupport`, checked)}
      />
    </div>
  </div>
);

// Reusable System Prompt Section Component
const SystemPromptSection = ({ providerKey, isLightBackground, updateAIConfig, aiConfig }) => {
  const providerConfig = aiConfig[providerKey] || {};
  const currentType = providerConfig.systemPromptType || 'default';
  const currentPrompt = providerConfig.systemPrompt || '';
  
  return (
    <>
      {/* System Prompt Personality */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">System Prompt Personality</label>
        <select
          value={currentType}
          onChange={(e) => {
            const newType = e.target.value;
            updateAIConfig(`${providerKey}.systemPromptType`, newType);
            // If switching to non-custom, clear custom prompt
            if (newType !== 'custom') {
              updateAIConfig(`${providerKey}.systemPrompt`, '');
            }
          }}
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
        >
          {Object.entries(PromptConfig.systemPrompts).map(([key, value]) => (
            <option key={key} value={key} className="bg-gray-900">{value.name}</option>
          ))}
        </select>
        <p className="text-xs text-white/50">
          Choose a personality for the AI assistant
        </p>
      </div>

      {/* Custom System Prompt Editor */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white/90">
          System Prompt
          {currentType !== 'custom' && (
            <span className="ml-2 text-xs text-white/50">(Read-only - Select "Custom" to edit)</span>
          )}
        </label>
        <textarea
          value={
            currentType === 'custom' 
              ? currentPrompt 
              : (PromptConfig.systemPrompts[currentType]?.prompt || '')
          }
          onChange={(e) => {
            const newValue = e.target.value;
            // If user edits a preset prompt, switch to custom
            if (currentType !== 'custom') {
              updateAIConfig(`${providerKey}.systemPromptType`, 'custom');
            }
            updateAIConfig(`${providerKey}.systemPrompt`, newValue);
          }}
          placeholder="Enter custom system prompt..."
          rows="4"
          className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full resize-y`}
        />
        <p className="text-xs text-white/50">
          Instructions that define the AI's behavior and personality. Editing a preset will switch to "Custom" mode.
        </p>
      </div>
    </>
  );
};

const LLMSettings = ({ isLightBackground, hasChromeAI }) => {
  const {
    // AI Config
    aiConfig,
    aiTesting,
    updateAIConfig,
    testAIConnection,
    
    // Chrome AI Status
    chromeAiStatus,
    checkChromeAIAvailability,
    startChromeAIDownload,
  } = useConfig();

  return (
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

          <ImageSupportToggle providerKey="openai" aiConfig={aiConfig} updateAIConfig={updateAIConfig} />
          <AudioSupportToggle providerKey="openai" aiConfig={aiConfig} updateAIConfig={updateAIConfig} />
          <SystemPromptSection providerKey="openai" isLightBackground={isLightBackground} aiConfig={aiConfig} updateAIConfig={updateAIConfig} />
        </>
      )}

      {/* Ollama Configuration */}
      {aiConfig.provider === AIProviders.OLLAMA && (
        <>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Endpoint URL</label>
            <input
              type="text"
              value={aiConfig.ollama?.endpoint ?? ''}
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
              value={aiConfig.ollama?.model ?? ''}
              onChange={(e) => updateAIConfig('ollama.model', e.target.value)}
              placeholder="llama2"
              className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} w-full`}
            />
            <p className="text-xs text-white/50">
              Model name (e.g., llama2, mistral, codellama)
            </p>
          </div>

          <ImageSupportToggle providerKey="ollama" aiConfig={aiConfig} updateAIConfig={updateAIConfig} additionalNote="Requires multi-modal capable model." />
          <AudioSupportToggle providerKey="ollama" aiConfig={aiConfig} updateAIConfig={updateAIConfig} additionalNote="Requires multi-modal capable model." />
          <SystemPromptSection providerKey="ollama" isLightBackground={isLightBackground} aiConfig={aiConfig} updateAIConfig={updateAIConfig} />
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

          {/* Image Support */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
              <label htmlFor="chrome-ai-image-support" className="text-sm font-medium text-white/90 cursor-pointer flex-1">
                Enable Image Support (Multi-modal)
                <p className="text-xs text-white/50 mt-0.5">
                  Allows sending images with text prompts. Enabled by default. Changing this setting will automatically clear the current chat session when you click "Save Settings".
                </p>
              </label>
              <Toggle
                id="chrome-ai-image-support"
                checked={aiConfig.chromeAi?.enableImageSupport !== false}
                onChange={(checked) => updateAIConfig('chromeAi.enableImageSupport', checked)}
              />
            </div>
          </div>

          {/* Audio Support */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
              <label htmlFor="chrome-ai-audio-support" className="text-sm font-medium text-white/90 cursor-pointer flex-1">
                Enable Audio Support (Multi-modal)
                <p className="text-xs text-white/50 mt-0.5">
                  Allows sending audio files with text prompts. Enabled by default. Changing this setting will automatically clear the current chat session when you click "Save Settings".
                </p>
              </label>
              <Toggle
                id="chrome-ai-audio-support"
                checked={aiConfig.chromeAi?.enableAudioSupport !== false}
                onChange={(checked) => updateAIConfig('chromeAi.enableAudioSupport', checked)}
              />
            </div>
          </div>

          {/* System Prompt */}
          <SystemPromptSection providerKey="chromeAi" isLightBackground={isLightBackground} aiConfig={aiConfig} updateAIConfig={updateAIConfig} />

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
          disabled={aiTesting}
          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Test Connection
        </button>
      </div>
    </div>
  );
};

export default LLMSettings;
