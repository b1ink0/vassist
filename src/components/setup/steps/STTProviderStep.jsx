import { useState } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { STTProviders } from '../../../config/aiConfig';
import ProviderSelection from '../shared/ProviderSelection';

const STTProviderStep = () => {
  const { setupData, updateSetupData, markStepComplete, nextStep } = useSetup();
  
  const [selectedProvider, setSelectedProvider] = useState(
    setupData?.sttProvider || STTProviders.CHROME_AI_MULTIMODAL
  );

  // Check if Chrome AI multimodal is available (based on Step 5 multimodal config)
  // For STT, we only need audio support enabled
  const hasMultimodal = setupData?.multimodal?.audioSupport;

  // Provider options with details
  const providers = [
    {
      id: STTProviders.CHROME_AI_MULTIMODAL,
      name: 'Chrome AI Multimodal',
      icon: '🎤',
      description: 'On-device speech recognition using Gemini Nano',
      pros: [
        'Free and offline',
        'No API key needed',
        'Fast and private',
        'Uses same model as LLM'
      ],
      cons: [
        'Requires Chrome 138+',
        'Needs multimodal flag enabled',
        'Model download required (~1.5GB)'
      ],
      requirements: 'Chrome 138+ with multimodal flags enabled',
      recommended: true, // Always recommend Chrome AI for STT
      available: hasMultimodal
    },
    {
      id: STTProviders.OPENAI,
      name: 'OpenAI Whisper',
      icon: '🌐',
      description: 'Cloud-based speech recognition with high accuracy',
      pros: [
        'Very high accuracy',
        'Supports 99+ languages',
        'No local setup needed',
        'Reliable and fast'
      ],
      cons: [
        'Requires API key',
        'Usage costs apply',
        'Needs internet',
        'Privacy: audio sent to OpenAI'
      ],
      requirements: 'OpenAI API key',
      recommended: false,
      available: true
    },
    {
      id: STTProviders.OPENAI_COMPATIBLE,
      name: 'OpenAI-Compatible',
      icon: '⚙️',
      description: 'Self-hosted or third-party STT service',
      pros: [
        'Full control over data',
        'Can be self-hosted',
        'Flexible configuration',
        'No vendor lock-in'
      ],
      cons: [
        'Requires server setup',
        'Technical knowledge needed',
        'Maintain infrastructure',
        'May need API key'
      ],
      requirements: 'Custom endpoint URL',
      recommended: false,
      available: true
    }
  ];

  const handleProviderSelect = (providerId) => {
    setSelectedProvider(providerId);
  };

  const handleContinue = () => {
    updateSetupData({ sttProvider: selectedProvider });
    markStepComplete();
    nextStep();
  };

  const selectedProviderData = providers.find(p => p.id === selectedProvider);

  return (
    <div className="setup-step stt-provider-step">
      <div className="step-header mb-8">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Choose Speech-to-Text Provider
        </h2>
        <p className="text-white/90">
          Select how you want to convert speech to text for voice input.
        </p>
      </div>

      {/* Provider Cards */}
      <div className="mb-8">
        <ProviderSelection
          providers={providers}
          selectedProvider={selectedProvider}
          onProviderSelect={handleProviderSelect}
          isLightBackground={false}
        />
      </div>

      {/* Selected Provider Summary */}
      {selectedProviderData && (
        <div className="glass-container rounded-xl p-6 mb-6 border-2 border-purple-500/30">
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">
              {selectedProviderData.icon}
            </span>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-purple-400 mb-2">
                You selected: {selectedProviderData.name}
              </h3>
              <p className="text-white/90">
                {selectedProviderData.id === STTProviders.CHROME_AI_MULTIMODAL &&
                  (hasMultimodal
                    ? 'Chrome AI multimodal audio support is enabled. You can use on-device speech recognition in the next step!'
                    : 'Note: Audio support is currently disabled. You can still continue and enable it later in settings, or go back to Step 5 to enable it now.'
                  )}
                {selectedProviderData.id === STTProviders.OPENAI &&
                  'You\'ll configure your OpenAI API key and Whisper settings in the next step.'}
                {selectedProviderData.id === STTProviders.OPENAI_COMPATIBLE &&
                  'You\'ll configure your custom endpoint URL and settings in the next step.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleContinue}
          className="glass-button px-8 py-3 text-base font-medium rounded-lg"
        >
          Continue →
        </button>
      </div>
    </div>
  );
};

export default STTProviderStep;
