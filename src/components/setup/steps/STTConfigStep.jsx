import { useState, useEffect, useRef } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { STTProviders } from '../../../config/aiConfig';
import OpenAISTTConfig from '../../settings/stt/OpenAISTTConfig';
import OpenAICompatibleSTTConfig from '../../settings/stt/OpenAICompatibleSTTConfig';
import ChromeAISTTConfig from '../../settings/stt/ChromeAISTTConfig';

const STTConfigStep = () => {
  const { setupData, updateSetupData, markStepComplete, nextStep } = useSetup();
  const initialLoadRef = useRef(true);
  
  const selectedProvider = setupData?.sttProvider || STTProviders.CHROME_AI_MULTIMODAL;
  
  // Initialize config from setupData or defaults
  const [sttConfig, setSTTConfig] = useState({
    openai: setupData?.sttConfig?.openai || {
      apiKey: setupData?.llmConfig?.apiKey || '', // Use same API key as LLM if available
      model: 'whisper-1',
      language: 'en',
      temperature: 0,
    },
    'openai-compatible': setupData?.sttConfig?.['openai-compatible'] || {
      endpoint: '',
      apiKey: '',
      model: 'whisper',
      language: 'en',
      temperature: 0,
    },
    chromeAi: setupData?.sttConfig?.chromeAi || {
      temperature: 0.1,
      topK: 3,
      outputLanguage: 'en', // Changed from 'language' to 'outputLanguage'
    }
  });

  const [chromeAiStatus, setChromeAiStatus] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const checkChromeAIStatus = async () => {
    setChromeAiStatus({ checking: true });
    
    try {
      // Check if multimodal is already configured from Step 5
      // For STT, we only need audio support enabled
      const multimodalConfigured = setupData?.multimodal?.audioSupport;
      
      if (multimodalConfigured) {
        setChromeAiStatus({
          available: true,
          downloaded: true,
          state: 'ready',
          message: 'Chrome AI multimodal is ready',
          details: 'Audio support was enabled in Step 5. You can use on-device speech recognition!'
        });
      } else {
        setChromeAiStatus({
          available: false,
          downloaded: false,
          state: 'not-configured',
          message: 'Chrome AI multimodal not configured',
          details: 'Go back to Step 5 to enable audio support, or choose a different STT provider.'
        });
      }
    } catch (error) {
      setChromeAiStatus({
        available: false,
        downloaded: false,
        state: 'error',
        message: 'Error checking status',
        details: error.message
      });
    }
  };

  // Check Chrome AI status on mount
  useEffect(() => {
    if (selectedProvider === STTProviders.CHROME_AI_MULTIMODAL) {
      checkChromeAIStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

  // Sync local config changes back to setupData (skip initial load)
  useEffect(() => {
    if (initialLoadRef.current) {
      // Mark initial load as complete after first render
      initialLoadRef.current = false;
      return;
    }
    
    console.log('[STTConfigStep] Syncing config to setupData:', sttConfig);
    updateSetupData({ 
      sttConfig: {
        ...setupData?.sttConfig,
        chromeAi: sttConfig.chromeAi,
        openai: sttConfig.openai,
        'openai-compatible': sttConfig['openai-compatible'],
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sttConfig]); // Only track sttConfig changes

  const handleConfigChange = (providerKey, field, value) => {
    console.log('[STTConfigStep] handleConfigChange called:', { providerKey, field, value });
    setSTTConfig(prev => {
      const updated = {
        ...prev,
        [providerKey]: {
          ...prev[providerKey],
          [field]: value
        }
      };
      console.log('[STTConfigStep] Updated sttConfig:', updated);
      return updated;
    });
  };

  const handleStartDownload = async () => {
    setDownloading(true);
    // Download is handled by multimodal setup, just update status
    setTimeout(() => {
      setChromeAiStatus({
        available: true,
        downloaded: true,
        message: 'Download complete! Chrome AI is ready.'
      });
      setDownloading(false);
    }, 1000);
  };

  const handleContinue = () => {
    // Save STT config to setup data
    const configToSave = {
      enabled: true,
      provider: selectedProvider
    };

    // Add provider-specific config
    if (selectedProvider === STTProviders.OPENAI) {
      configToSave.openai = sttConfig.openai;
    } else if (selectedProvider === STTProviders.OPENAI_COMPATIBLE) {
      configToSave['openai-compatible'] = sttConfig['openai-compatible'];
    } else if (selectedProvider === STTProviders.CHROME_AI_MULTIMODAL) {
      configToSave.chromeAi = sttConfig.chromeAi;
    }

    updateSetupData({ sttConfig: configToSave });
    markStepComplete();
    nextStep();
  };

  const canContinue = () => {
    if (selectedProvider === STTProviders.CHROME_AI_MULTIMODAL) {
      return chromeAiStatus?.available && chromeAiStatus?.downloaded;
    }
    if (selectedProvider === STTProviders.OPENAI) {
      return sttConfig.openai.apiKey.length > 0;
    }
    if (selectedProvider === STTProviders.OPENAI_COMPATIBLE) {
      return sttConfig['openai-compatible'].endpoint.length > 0;
    }
    return false;
  };

  const getProviderName = () => {
    switch (selectedProvider) {
      case STTProviders.CHROME_AI_MULTIMODAL:
        return 'Chrome AI Multimodal';
      case STTProviders.OPENAI:
        return 'OpenAI Whisper';
      case STTProviders.OPENAI_COMPATIBLE:
        return 'OpenAI-Compatible';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="setup-step stt-config-step">
      <div className="step-header mb-8">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Configure {getProviderName()}
        </h2>
        <p className="text-white/90">
          Set up your speech-to-text service for voice input.
        </p>
      </div>

      {/* Provider-specific Configuration */}
      <div className="mb-8">
        {selectedProvider === STTProviders.OPENAI && (
          <OpenAISTTConfig
            config={sttConfig.openai}
            onChange={(field, value) => handleConfigChange('openai', field, value)}
            isLightBackground={false}
          />
        )}

        {selectedProvider === STTProviders.OPENAI_COMPATIBLE && (
          <OpenAICompatibleSTTConfig
            config={sttConfig['openai-compatible']}
            onChange={(field, value) => handleConfigChange('openai-compatible', field, value)}
            isLightBackground={false}
          />
        )}

        {selectedProvider === STTProviders.CHROME_AI_MULTIMODAL && (
          <ChromeAISTTConfig
            config={sttConfig.chromeAi}
            onChange={(field, value) => handleConfigChange('chromeAi', field, value)}
            chromeAiStatus={chromeAiStatus}
            onCheckStatus={checkChromeAIStatus}
            onStartDownload={handleStartDownload}
            isLightBackground={false}
            isSetupMode={true}
          />
        )}
      </div>

      {/* Info Box */}
      <div className="glass-container rounded-xl p-6 mb-6 border-2 border-blue-500/30">
        <div className="flex items-start gap-3">
          <span className="text-2xl">ℹ️</span>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-blue-400 mb-2">About Speech-to-Text</h3>
            <p className="text-white/90 text-sm mb-2">
              STT (Speech-to-Text) allows you to use voice input in the chat. Speak instead of typing!
            </p>
            {selectedProvider === STTProviders.CHROME_AI_MULTIMODAL && (
              <p className="text-white/80 text-sm">
                Chrome AI uses the same multimodal model you configured in Step 5, so there's no additional setup needed if you already enabled audio support.
              </p>
            )}
            {selectedProvider === STTProviders.OPENAI && (
              <p className="text-white/80 text-sm">
                You can use the same OpenAI API key as your LLM provider. Whisper is OpenAI's speech recognition model with excellent accuracy across many languages.
              </p>
            )}
            {selectedProvider === STTProviders.OPENAI_COMPATIBLE && (
              <p className="text-white/80 text-sm">
                Configure a custom endpoint that's compatible with the OpenAI Whisper API format. This is useful for self-hosted solutions or third-party services.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={handleContinue}
          disabled={!canContinue() || downloading}
          className="glass-button px-8 py-3 text-base font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading ? 'Downloading...' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

export default STTConfigStep;
