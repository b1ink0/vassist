import { useState, useEffect, useRef } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import TTSServiceProxy from '../../../services/proxies/TTSServiceProxy';
import { AIServiceProxy } from '../../../services/proxies';
import ProviderSelection from '../shared/ProviderSelection';
import KokoroTTSConfig from '../../settings/tts/KokoroTTSConfig';
import OpenAISTTConfig from '../../settings/stt/OpenAISTTConfig';
import OpenAICompatibleSTTConfig from '../../settings/stt/OpenAICompatibleSTTConfig';
import ChromeAISTTConfig from '../../settings/stt/ChromeAISTTConfig';
import { TTSProviders, STTProviders, DefaultTTSConfig } from '../../../config/aiConfig';
import StatusMessage from '../../common/StatusMessage';
import Logger from '../../../services/LoggerService';
import { Icon } from '../../icons';

const TTSProviderStep = ({ isLightBackground = false }) => {
  const { setupData, updateSetupData } = useSetup();
  const initialLoadRef = useRef(true);
  
  // TTS state
  const [selectedProvider, setSelectedProvider] = useState('kokoro');
  
  // Kokoro config state
  const [kokoroConfig, setKokoroConfig] = useState(DefaultTTSConfig.kokoro || {});
  const [kokoroStatus, setKokoroStatus] = useState({ 
    initialized: false, 
    loading: false,
    downloading: false,
    progress: 0,
    details: ''
  });
  const [testingVoice, setTestingVoice] = useState(false);
  
  // OpenAI config state
  const [openAIKey, setOpenAIKey] = useState('');
  const [openAIModel, setOpenAIModel] = useState('tts-1');
  const [openAIVoice, setOpenAIVoice] = useState('alloy');
  
  // Custom/Compatible config state
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customModel, setCustomModel] = useState('tts');
  const [customVoice, setCustomVoice] = useState('default');
  
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // STT state  
  const [selectedSTTProvider, setSelectedSTTProvider] = useState(STTProviders.CHROME_AI_MULTIMODAL);
  const [chromeAiSTTStatus, setChromeAiSTTStatus] = useState(null);
  const [sttConfig, setSTTConfig] = useState({
    openai: {
      apiKey: '',
      model: 'whisper-1'
    },
    'openai-compatible': {
      endpoint: '',
      apiKey: '',
      model: 'whisper'
    },
    chromeAi: {
      language: 'en'
    }
  });

  // Check Kokoro status on mount
  useEffect(() => {
    if (selectedProvider === 'kokoro') {
      handleCheckKokoroStatus();
    }
    
    // Load existing setup data (only on first mount)
    const ttsData = setupData?.tts;
    const sttData = setupData?.stt;
    const sttConfigData = setupData?.sttConfig;
    
    if (ttsData) {
      if (ttsData.provider) setSelectedProvider(ttsData.provider);
      if (ttsData.kokoro) setKokoroConfig(ttsData.kokoro);
      if (ttsData.openai?.apiKey) setOpenAIKey(ttsData.openai.apiKey);
      if (ttsData.openai?.model) setOpenAIModel(ttsData.openai.model);
      if (ttsData.openai?.voice) setOpenAIVoice(ttsData.openai.voice);
      if (ttsData['openai-compatible']?.endpoint) setCustomEndpoint(ttsData['openai-compatible'].endpoint);
      if (ttsData['openai-compatible']?.apiKey) setCustomApiKey(ttsData['openai-compatible'].apiKey);
      if (ttsData['openai-compatible']?.model) setCustomModel(ttsData['openai-compatible'].model);
      if (ttsData['openai-compatible']?.voice) setCustomVoice(ttsData['openai-compatible'].voice);
    }
    
    if (sttData?.provider) setSelectedSTTProvider(sttData.provider);
    if (sttConfigData) setSTTConfig(sttConfigData);
    
    // Mark initial load complete
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Save data whenever TTS or STT config changes (but skip initial load)
  useEffect(() => {
    if (initialLoadRef.current) return;
    
    Logger.log('TTSProviderStep', 'Saving TTS/STT config');
    
    const ttsData = {
      enabled: selectedProvider !== 'disabled',
      provider: selectedProvider === 'disabled' ? 'kokoro' : selectedProvider,
      kokoro: kokoroConfig,
      openai: {
        apiKey: openAIKey,
        model: openAIModel,
        voice: openAIVoice,
      },
      'openai-compatible': {
        endpoint: customEndpoint,
        apiKey: customApiKey,
        model: customModel,
        voice: customVoice,
      },
    };
    
    const sttData = {
      enabled: selectedSTTProvider !== 'disabled',
      provider: selectedSTTProvider === 'disabled' ? STTProviders.CHROME_AI_MULTIMODAL : selectedSTTProvider,
    };
    
    updateSetupData({ 
      tts: ttsData,
      stt: sttData,
      sttConfig: sttConfig,
    });
  }, [
    selectedProvider, kokoroConfig, 
    openAIKey, openAIModel, openAIVoice,
    customEndpoint, customApiKey, customModel, customVoice,
    selectedSTTProvider, sttConfig,
    updateSetupData
  ]);

  const providers = [
    {
      id: 'disabled',
      name: 'Disabled',
      description: 'Turn off text-to-speech',
      iconName: 'x',
      recommended: false,
      pros: [
        'No resource usage',
        'Faster performance',
        'Text-only mode'
      ],
      cons: [
        'No voice output',
        'Silent virtual companion'
      ],
      requirements: 'None'
    },
    {
      id: 'kokoro',
      name: 'Kokoro TTS',
      description: 'High-quality local text-to-speech',
      iconName: 'speaker',
      recommended: true,
      pros: [
        '100% Free',
        'Privacy-focused (runs locally)',
        'Natural-sounding voices',
        'Multiple voice options',
        'No API keys needed'
      ],
      cons: [
        'Initial model download (~86MB)',
        'Requires WebGPU or WASM support',
        'First load may be slow'
      ],
      requirements: 'Modern browser with WebGPU or WebAssembly'
    },
    {
      id: 'openai',
      name: 'OpenAI TTS',
      description: 'Cloud-based text-to-speech from OpenAI',
      iconName: 'volume',
      recommended: false,
      pros: [
        'High quality',
        'Fast response',
        'Multiple voices',
        'Works on any device'
      ],
      cons: [
        'Requires API key',
        'Costs money per request',
        'Needs internet connection',
        'Audio data sent to OpenAI'
      ],
      requirements: 'OpenAI API key (paid service)'
    },
    {
      id: 'openai-compatible',
      name: 'OpenAI-Compatible',
      description: 'Custom OpenAI-compatible TTS endpoint',
      iconName: 'link',
      recommended: false,
      pros: [
        'Use your own server',
        'Full control',
        'Privacy options',
        'Custom models'
      ],
      cons: [
        'Requires setup',
        'Manual configuration',
        'Compatibility varies'
      ],
      requirements: 'OpenAI-compatible TTS server'
    }
  ];

  // Handler for Kokoro config changes
  const handleKokoroConfigChange = (field, value) => {
    setKokoroConfig(prev => ({ ...prev, [field]: value }));
    if (field === 'device') {
      setTimeout(() => handleCheckKokoroStatus(value), 100);
    }
  };

  // Initialize Kokoro (simplified - user can fully configure in settings later)
  const handleKokoroInit = async () => {
    setKokoroStatus(prev => ({ ...prev, downloading: true, progress: 0, details: 'Starting download...' }));
    try {
      await TTSServiceProxy.configure({
        enabled: true,
        provider: TTSProviders.KOKORO,
        kokoro: kokoroConfig
      });
      
      await TTSServiceProxy.initializeKokoro((progressData) => {
        const percent = typeof progressData.percent === 'number' ? progressData.percent : 0;
        const details = progressData.file || progressData.status || 'Downloading...';
        setKokoroStatus(prev => ({ ...prev, progress: percent, downloading: true, details }));
      });
      
      setKokoroStatus({ initialized: true, downloading: false, progress: 100, details: 'Complete!' });
    } catch (error) {
      Logger.error('other', 'Kokoro init failed:', error);
      setKokoroStatus({ initialized: false, downloading: false, error: error.message, progress: 0, details: '' });
    }
  };

  // Check Kokoro status
  const handleCheckKokoroStatus = async (desiredDeviceOverride = null) => {
    try {
      const status = await TTSServiceProxy.checkKokoroStatus();

      const desiredDevice = desiredDeviceOverride || kokoroConfig.device || 'auto';
      const actualDevice = status.config?.device || null;
      const isInitializedWithCorrectDevice = status.initialized && actualDevice === desiredDevice;
      
      setKokoroStatus(prev => ({ ...prev, initialized: isInitializedWithCorrectDevice || false }));
    } catch (error) {
      Logger.error('other', 'Check status failed:', error);
    }
  };

  // Test Kokoro voice
  const handleTestKokoroVoice = async () => {
    setTestingVoice(true);
    try {
      // Configure TTS with current Kokoro config
      await TTSServiceProxy.configure({
        provider: 'kokoro',
        enabled: true,
        kokoro: kokoroConfig
      });
      
      // Generate and play test speech
      await TTSServiceProxy.testConnection('Hello! This is a test of the Kokoro voice.');
    } catch (error) {
      Logger.error('other', 'Voice test failed:', error);
    } finally {
      setTestingVoice(false);
    }
  };

  // STT Providers
  const hasMultimodal = setupData?.multimodal?.audioSupport;
  
  const sttProviders = [
    {
      id: 'disabled',
      name: 'Disabled',
      iconName: 'x',
      description: 'Turn off speech recognition',
      recommended: false,
      available: true,
      requirements: 'None - text input only'
    },
    {
      id: STTProviders.CHROME_AI_MULTIMODAL,
      name: 'Chrome AI',
      iconName: 'microphone',
      description: 'On-device speech recognition',
      recommended: true,
      available: hasMultimodal,
      requirements: hasMultimodal ? 'Ready to use!' : 'Requires multimodal audio support'
    },
    {
      id: STTProviders.OPENAI,
      name: 'OpenAI Whisper',
      iconName: 'globe',
      description: 'Cloud-based speech recognition',
      recommended: false,
      available: true,
      requirements: 'OpenAI API key required'
    },
    {
      id: STTProviders.OPENAI_COMPATIBLE,
      name: 'OpenAI-Compatible',
      iconName: 'settings',
      description: 'Custom STT endpoint',
      recommended: false,
      available: true,
      requirements: 'Custom endpoint URL'
    }
  ];

  const handleSTTProviderSelect = (providerId) => {
    setSelectedSTTProvider(providerId);
  };

  const handleSTTConfigChange = (providerKey, newConfig) => {
    setSTTConfig(prev => ({
      ...prev,
      [providerKey]: newConfig
    }));
  };

  // Chrome AI STT Status Check
  const handleCheckChromeAISTTStatus = async () => {
    Logger.log('TTSProviderStep', 'Checking Chrome AI STT status...');
    setChromeAiSTTStatus({ checking: true });
    
    try {
      // Use regular Chrome AI availability check (same API, just with audio support)
      const result = await AIServiceProxy.checkChromeAIAvailability();
      Logger.log('TTSProviderStep', 'Chrome AI STT status result:', result);
      
      setChromeAiSTTStatus({
        checking: false,
        available: result.available || false,
        state: result.state,
        message: result.message || 'Unknown status',
        details: result.details || '',
        downloading: result.state === 'downloading',
      });
    } catch (error) {
      Logger.error('TTSProviderStep', 'Chrome AI STT status check failed:', error);
      setChromeAiSTTStatus({
        checking: false,
        available: false,
        message: error.message || 'Failed to check status',
        details: '',
        downloading: false,
      });
    }
  };

  // Chrome AI STT Download
  const handleStartChromeAISTTDownload = async () => {
    Logger.log('TTSProviderStep', 'Starting Chrome AI model download...');
    setChromeAiSTTStatus(prev => ({ ...prev, downloading: true }));
    
    try {
      await AIServiceProxy.startChromeAIDownload();
      await handleCheckChromeAISTTStatus();
    } catch (error) {
      Logger.error('TTSProviderStep', 'Chrome AI download failed:', error);
      setChromeAiSTTStatus(prev => ({
        ...prev,
        downloading: false,
        message: error.message || 'Download failed'
      }));
    }
  };

  const handleProviderSelect = (providerId) => {
    setSelectedProvider(providerId);
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // Build config based on selected provider
      const testConfig = {
        provider: selectedProvider,
        enabled: true
      };

      if (selectedProvider === 'openai') {
        if (!openAIKey) {
          throw new Error('API key is required');
        }
        testConfig.openai = {
          apiKey: openAIKey,
          model: openAIModel,
          voice: openAIVoice
        };
      } else if (selectedProvider === 'openai-compatible') {
        if (!customEndpoint) {
          throw new Error('Endpoint is required');
        }
        testConfig['openai-compatible'] = {
          endpoint: customEndpoint,
          apiKey: customApiKey,
          model: customModel,
          voice: customVoice
        };
      }

      // Configure TTS service
      await TTSServiceProxy.configure(testConfig);

      // Test with sample text
      await TTSServiceProxy.testConnection('Hello, this is a test.');

      setTestResult({ success: true, message: 'TTS connection successful!' });
    } catch (error) {
      setTestResult({ success: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="setup-step space-y-3 sm:space-y-4">
      <div className="mb-2 sm:mb-3">
        <h2 className="text-xl sm:text-2xl font-bold mb-1 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Voice Provider
        </h2>
        <p className="text-xs sm:text-sm text-white/90">
          Select your text-to-speech service
        </p>
      </div>

      {/* Provider Cards */}
      <ProviderSelection
          providers={providers}
          selectedProvider={selectedProvider}
          onProviderSelect={handleProviderSelect}
          isLightBackground={false}
          compact={true}
        />

      {/* Provider-specific Configuration */}
      {selectedProvider === 'disabled' && (
        <div className="rounded-lg p-3 sm:p-4 border border-white/10 bg-white/5">
          <div className="flex items-start gap-3">
            <Icon name="info" size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm text-white/90">
              <p className="font-semibold">Text-to-Speech Disabled</p>
              <p className="text-white/70">
                The virtual companion will be silent. You can still use all other features, 
                but AI responses won't be spoken aloud. You can enable TTS later in Settings.
              </p>
            </div>
          </div>
        </div>
      )}

      {selectedProvider === 'kokoro' && (
        <KokoroTTSConfig
          config={kokoroConfig}
          onChange={handleKokoroConfigChange}
          kokoroStatus={kokoroStatus}
          onInitialize={handleKokoroInit}
          onCheckStatus={handleCheckKokoroStatus}
          onTestVoice={handleTestKokoroVoice}
          testingVoice={testingVoice}
          isLightBackground={false}
          showTitle={false}
          showTestButton={true}
          isSetupMode={true}
        />
      )}

      {selectedProvider === 'openai' && (
        <div className="rounded-lg p-2 sm:p-3 border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-2">OpenAI TTS Config</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                API Key <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={openAIKey}
                onChange={(e) => setOpenAIKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
              />
              <p className="text-[10px] sm:text-xs text-white/70 mt-1">
                Same API key as LLM provider. Get it from{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  platform.openai.com
                </a>
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Model</label>
              <select
                value={openAIModel}
                onChange={(e) => setOpenAIModel(e.target.value)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400"
              >
                <option value="tts-1" className="bg-gray-900">tts-1 (Standard)</option>
                <option value="tts-1-hd" className="bg-gray-900">tts-1-hd (HD)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Voice</label>
              <select
                value={openAIVoice}
                onChange={(e) => setOpenAIVoice(e.target.value)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400"
              >
                <option value="alloy" className="bg-gray-900">Alloy</option>
                <option value="echo" className="bg-gray-900">Echo</option>
                <option value="fable" className="bg-gray-900">Fable</option>
                <option value="onyx" className="bg-gray-900">Onyx</option>
                <option value="nova" className="bg-gray-900">Nova</option>
                <option value="shimmer" className="bg-gray-900">Shimmer</option>
              </select>
            </div>
            <div className="pt-1">
              <button
                onClick={testConnection}
                disabled={!openAIKey || testing}
                className="glass-button rounded-lg px-4 py-2 text-xs sm:text-sm w-full font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {testing ? (
                  <>
                    <Icon name="refresh" size={14} className="animate-spin" /> Testing...
                  </>
                ) : (
                  <>
                    <Icon name="test" size={14} /> Test
                  </>
                )}
              </button>
            </div>
            {testResult && (
              <StatusMessage 
                message={testResult.success ? `success:${testResult.message}` : `error:${testResult.message}`}
                isLightBackground={isLightBackground}
                className="mt-2"
              />
            )}
          </div>
        </div>
      )}

      {selectedProvider === 'openai-compatible' && (
        <div className="rounded-lg p-2 sm:p-3 border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-2">OpenAI-Compatible Config</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Endpoint URL <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
                placeholder="http://localhost:8000"
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
              />
              <p className="text-[10px] sm:text-xs text-white/70 mt-1">
                Base URL (will append /v1/audio/speech)
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                API Key (Optional)
              </label>
              <input
                type="password"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="Leave empty if not required"
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
              />
              <p className="text-[10px] sm:text-xs text-white/70 mt-1">
                API key for authentication
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Model</label>
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="tts"
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">Voice</label>
              <input
                type="text"
                value={customVoice}
                onChange={(e) => setCustomVoice(e.target.value)}
                placeholder="default"
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
              />
            </div>
            <div className="pt-1">
              <button
                onClick={testConnection}
                disabled={!customEndpoint || testing}
                className="glass-button rounded-lg px-4 py-2 text-xs sm:text-sm w-full font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {testing ? (
                  <>
                    <Icon name="refresh" size={14} className="animate-spin" /> Testing...
                  </>
                ) : (
                  <>
                    <Icon name="test" size={14} /> Test
                  </>
                )}
              </button>
            </div>
            {testResult && (
              <StatusMessage 
                message={testResult.success ? `success:${testResult.message}` : `error:${testResult.message}`}
                isLightBackground={isLightBackground}
                className="mt-2"
              />
            )}
          </div>
        </div>
      )}

      {/* STT Section */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <div className="mb-3">
          <h3 className="text-lg sm:text-xl font-bold mb-1 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Speech-to-Text
          </h3>
          <p className="text-xs sm:text-sm text-white/90">
            Select your speech recognition service
          </p>
        </div>

        {/* STT Provider Cards */}
        <div className="mb-4">
          <ProviderSelection
            providers={sttProviders}
            selectedProvider={selectedSTTProvider}
            onProviderSelect={handleSTTProviderSelect}
            isLightBackground={false}
            compact={true}
            showProsCons={false}
          />
        </div>

        {/* STT Provider-specific Configuration */}
        {selectedSTTProvider === 'disabled' && (
          <div className="rounded-lg p-3 sm:p-4 border border-white/10 bg-white/5">
            <div className="flex items-start gap-3">
              <Icon name="info" size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm text-white/90">
                <p className="font-semibold">Speech-to-Text Disabled</p>
                <p className="text-white/70">
                  Voice input will be unavailable. You'll need to type your messages instead. 
                  You can enable STT later in Settings if you want to use voice input.
                </p>
              </div>
            </div>
          </div>
        )}

        {selectedSTTProvider === STTProviders.CHROME_AI_MULTIMODAL && (
          <ChromeAISTTConfig
            config={sttConfig.chromeAi}
            onChange={(newConfig) => handleSTTConfigChange('chromeAi', newConfig)}
            chromeAiStatus={chromeAiSTTStatus}
            onCheckStatus={handleCheckChromeAISTTStatus}
            onStartDownload={handleStartChromeAISTTDownload}
            isLightBackground={false}
            isSetupMode={true}
          />
        )}

        {selectedSTTProvider === STTProviders.OPENAI && (
          <OpenAISTTConfig
            config={sttConfig.openai}
            onChange={(newConfig) => handleSTTConfigChange('openai', newConfig)}
            isLightBackground={false}
            canReuseAPIKey={selectedProvider === 'openai' && openAIKey}
            llmApiKey={openAIKey}
          />
        )}

        {selectedSTTProvider === STTProviders.OPENAI_COMPATIBLE && (
          <OpenAICompatibleSTTConfig
            config={sttConfig['openai-compatible']}
            onChange={(newConfig) => handleSTTConfigChange('openai-compatible', newConfig)}
            isLightBackground={false}
          />
        )}
      </div>

    </div>
  );
};

export default TTSProviderStep;
