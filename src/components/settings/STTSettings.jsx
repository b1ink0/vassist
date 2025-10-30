/**
 * STTSettings Component
 * STT configuration tab for SettingsPanel
 * Handles Speech-to-Text provider selection and configuration
 */

import { useConfig } from '../../contexts/ConfigContext';
import { STTProviders } from '../../config/aiConfig';
import OpenAISTTConfig from './stt/OpenAISTTConfig';
import OpenAICompatibleSTTConfig from './stt/OpenAICompatibleSTTConfig';
import ChromeAISTTConfig from './stt/ChromeAISTTConfig';
import Toggle from '../common/Toggle';

const STTSettings = ({ isLightBackground, hasChromeAI }) => {
  const {
    // STT Config
    sttConfig,
    sttTesting,
    updateSTTConfig,
    testSTTRecording,
    
    // Chrome AI Status
    chromeAiStatus,
    checkChromeAIAvailability,
    startChromeAIDownload,
  } = useConfig();

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-white mb-4">STT Configuration</h3>
      
      {/* Enable STT Toggle */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
        <label htmlFor="enable-stt" className="text-sm font-medium text-white/90 cursor-pointer flex-1">
          Enable Speech-to-Text
        </label>
        <Toggle
          id="enable-stt"
          checked={sttConfig.enabled}
          onChange={(checked) => updateSTTConfig('enabled', checked)}
        />
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
            <OpenAISTTConfig
              config={sttConfig.openai || {}}
              onChange={(field, value) => updateSTTConfig(`openai.${field}`, value)}
              isLightBackground={isLightBackground}
            />
          )}

          {/* OpenAI-Compatible STT Configuration */}
          {sttConfig.provider === STTProviders.OPENAI_COMPATIBLE && (
            <OpenAICompatibleSTTConfig
              config={sttConfig['openai-compatible'] || {}}
              onChange={(field, value) => updateSTTConfig(`openai-compatible.${field}`, value)}
              isLightBackground={isLightBackground}
            />
          )}

          {/* Chrome AI Multimodal STT Configuration */}
          {sttConfig.provider === STTProviders.CHROME_AI_MULTIMODAL && (
            <ChromeAISTTConfig
              config={sttConfig['chrome-ai-multimodal'] || {}}
              onChange={(field, value) => updateSTTConfig(`chrome-ai-multimodal.${field}`, value)}
              chromeAiStatus={chromeAiStatus}
              onCheckStatus={checkChromeAIAvailability}
              onStartDownload={startChromeAIDownload}
              isLightBackground={isLightBackground}
              isSetupMode={false}
            />
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4">
        <button 
          onClick={testSTTRecording}
          disabled={!sttConfig.enabled || sttTesting}
          className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Test Recording (3s)
        </button>
      </div>
    </div>
  );
};

export default STTSettings;
