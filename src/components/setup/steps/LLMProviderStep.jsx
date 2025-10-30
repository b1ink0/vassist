import { useState, useEffect, useRef } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { AIServiceProxy } from '../../../services/proxies';
import ProviderSelection from '../shared/ProviderSelection';
import Icon from '../../icons/Icon';

const LLMProviderStep = () => {
  const { setupData, updateSetupData } = useSetup();
  const initialLoadRef = useRef(true);
  const [selectedProvider, setSelectedProvider] = useState('chrome-ai');
  const [apiKey, setApiKey] = useState('');
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama2');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [chromeAIStatus, setChromeAIStatus] = useState({
    checking: false,
    available: false,
    ready: false,
    message: 'Checking...',
    needsFlags: false,
    needsDownload: false,
    downloading: false,
  });

  const chromeAIAvailable = setupData?.chromeAI?.ready || false;

  useEffect(() => {
    // Check Chrome AI status when component mounts
    checkChromeAIStatus();
    
    // Load existing setup data if any (only on first mount)
    const llmData = setupData?.llm;
    if (llmData) {
      if (llmData.provider) setSelectedProvider(llmData.provider);
      
      // Load provider-specific configs
      if (llmData.openai?.apiKey) setApiKey(llmData.openai.apiKey);
      if (llmData.ollama?.endpoint) setOllamaEndpoint(llmData.ollama.endpoint);
      if (llmData.ollama?.model) setOllamaModel(llmData.ollama.model);
    }
    
    // Mark initial load complete after first load
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - we intentionally ignore setupData to prevent re-loading

  // Save data whenever provider or config changes (but skip initial load)
  useEffect(() => {
    if (initialLoadRef.current) return; // Don't save on initial load
    
    console.log('[LLMProviderStep] Saving provider config:', selectedProvider);
    
    const llmConfig = {
      provider: selectedProvider,
      chromeAi: {
        enableImageSupport: true,
        enableAudioSupport: true,
      },
      openai: {
        apiKey: apiKey,
        model: 'gpt-3.5-turbo',
      },
      ollama: {
        endpoint: ollamaEndpoint,
        model: ollamaModel,
      },
    };
    
    updateSetupData({ llm: llmConfig });
  }, [selectedProvider, apiKey, ollamaEndpoint, ollamaModel, updateSetupData]);

  const checkChromeAIStatus = async () => {
    setChromeAIStatus(prev => ({ ...prev, checking: true }));
    
    try {
      const result = await AIServiceProxy.checkChromeAIAvailability();
      
      // ChromeAIValidator returns 'available: true' when ready, not 'ready: true'
      const isReady = result.available === true;
      const needsDownload = result.state === 'after-download' || result.state === 'downloadable';
      const isDownloading = result.state === 'downloading';
      const needsFlags = result.requiresFlags === true;
      
      setChromeAIStatus({
        checking: false,
        available: result.available || false,
        ready: isReady,
        message: result.message || (isReady ? 'Chrome AI is ready!' : 'Setup required'),
        needsFlags: needsFlags,
        needsDownload: needsDownload && !needsFlags,
        downloading: isDownloading,
        flags: result.flags || [],
        state: result.state,
      });
    } catch (error) {
      setChromeAIStatus({
        checking: false,
        available: false,
        ready: false,
        message: error.message || 'Failed to check Chrome AI availability',
        needsFlags: false,
        needsDownload: false,
        downloading: false,
      });
    }
  };

  const handleDownloadModel = async () => {
    setChromeAIStatus(prev => ({ ...prev, downloading: true }));
    
    try {
      // Trigger model download
      await AIServiceProxy.downloadChromeAIModel();
      
      // Recheck status after download
      await checkChromeAIStatus();
    } catch (error) {
      setChromeAIStatus(prev => ({ 
        ...prev, 
        downloading: false,
        message: error.message || 'Failed to download model'
      }));
    }
  };

  const providers = [
    {
      id: 'chrome-ai',
      name: 'Chrome AI',
      description: 'Free, local AI powered by Google',
      icon: '🌐',
      available: true, // Always allow selection
      recommended: chromeAIStatus.ready, // Only recommend if ready
      requirements: chromeAIStatus.ready ? 'Ready to use!' : chromeAIStatus.available ? 'Setup required' : 'Chrome 138+ required',
      pros: ['100% Free', 'Privacy-focused (local)', 'No API keys needed', 'Fast response'],
      cons: chromeAIStatus.ready ? ['Limited to Chrome browser'] : ['Requires Chrome 138+', 'Needs browser flags', 'Model download required']
    },
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'Cloud-based AI with GPT models',
      icon: '🤖',
      available: true,
      recommended: !chromeAIAvailable, // Recommend if Chrome AI not available
      requirements: 'API key required (paid service)',
      pros: ['Most capable models', 'Works on any browser', 'Regular updates', 'Reliable'],
      cons: ['Requires API key', 'Costs money per request', 'Needs internet', 'Data sent to OpenAI']
    },
    {
      id: 'ollama',
      name: 'Ollama',
      description: 'Run large language models locally',
      icon: '🦙',
      available: true,
      recommended: false,
      requirements: 'Local Ollama server required',
      pros: ['100% Free', 'Privacy-focused (local)', 'Many model options', 'Works on any browser'],
      cons: ['Requires local installation', 'Needs powerful hardware', 'Manual setup', 'Slower than cloud']
    }
  ];

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
        provider: selectedProvider
      };

      if (selectedProvider === 'chrome-ai') {
        testConfig.chromeAi = {
          enableImageSupport: true,
          enableAudioSupport: true
        };
      } else if (selectedProvider === 'openai') {
        if (!apiKey) {
          throw new Error('API key is required');
        }
        testConfig.openai = {
          apiKey: apiKey,
          model: 'gpt-3.5-turbo'
        };
      } else if (selectedProvider === 'ollama') {
        if (!ollamaEndpoint) {
          throw new Error('Ollama endpoint is required');
        }
        testConfig.ollama = {
          endpoint: ollamaEndpoint,
          model: ollamaModel
        };
      }

      // Configure AIService with test config
      await AIServiceProxy.configure(testConfig);

      // Test connection (returns true on success, throws on failure)
      await AIServiceProxy.testConnection();
      
      setTestResult({ success: true, message: `${selectedProvider.toUpperCase()} is working!` });
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
          LLM Provider
        </h2>
        <p className="text-xs sm:text-sm text-white/90">
          Select your AI service for conversations
        </p>
      </div>

      {/* Provider Cards */}
      <ProviderSelection
        providers={providers}
        selectedProvider={selectedProvider}
        onProviderSelect={handleProviderSelect}
        isLightBackground={false}
        compact={true}
        showProsCons={false}
      />

      {/* Provider-specific Configuration */}
      {selectedProvider === 'openai' && (
        <div className="rounded-lg p-2 sm:p-3 border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-2">OpenAI Config</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                API Key <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
              />
              <p className="text-[10px] sm:text-xs text-white/70 mt-1">
                Get from{' '}
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
          </div>
        </div>
      )}

      {selectedProvider === 'ollama' && (
        <div className="rounded-lg p-2 sm:p-3 border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-2">Ollama Config</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Endpoint <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={ollamaEndpoint}
                onChange={(e) => setOllamaEndpoint(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Model <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="llama2"
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
              />
              <p className="text-[10px] sm:text-xs text-white/70 mt-1">
                <a
                  href="https://ollama.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  ollama.ai
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {selectedProvider === 'chrome-ai' && (
        <div className={`rounded-lg p-2 sm:p-3 border-2 ${
          chromeAIStatus.ready 
            ? 'border-green-500/30 bg-green-500/5' 
            : chromeAIStatus.available 
              ? 'border-yellow-500/30 bg-yellow-500/5'
              : 'border-red-500/30 bg-red-500/5'
        }`}>
          <div className="space-y-3">
            {/* Status Header */}
            <div className="flex items-start gap-2">
              <span className={`text-lg sm:text-xl ${
                chromeAIStatus.checking 
                  ? 'text-white/50' 
                  : chromeAIStatus.ready 
                    ? 'text-green-400' 
                    : chromeAIStatus.available 
                      ? 'text-yellow-400' 
                      : 'text-red-400'
              }`}>
                {chromeAIStatus.checking ? '⏳' : chromeAIStatus.ready ? '✓' : chromeAIStatus.available ? '⚠️' : '✗'}
              </span>
              <div className="flex-1">
                <h3 className={`text-xs sm:text-sm font-semibold mb-1 ${
                  chromeAIStatus.ready 
                    ? 'text-green-400' 
                    : chromeAIStatus.available 
                      ? 'text-yellow-400' 
                      : 'text-red-400'
                }`}>
                  {chromeAIStatus.checking 
                    ? 'Checking Chrome AI...' 
                    : chromeAIStatus.ready 
                      ? 'Chrome AI Ready' 
                      : chromeAIStatus.available 
                        ? 'Chrome AI Setup Required' 
                        : 'Chrome AI Unavailable'}
                </h3>
                <p className="text-xs text-white/80">{chromeAIStatus.message}</p>
              </div>
              {!chromeAIStatus.checking && (
                <button
                  onClick={checkChromeAIStatus}
                  className="glass-button rounded px-2 py-1 text-xs hover:bg-white/20"
                >
                  <Icon name="refresh" size={14} />
                </button>
              )}
            </div>

            {/* Flags Info */}
            {chromeAIStatus.needsFlags && chromeAIStatus.flags?.length > 0 && (
              <div className="bg-white/5 rounded p-2 space-y-2">
                <p className="text-xs font-medium text-white/90">Required Chrome Flags:</p>
                {chromeAIStatus.flags.map((flag, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Icon name="arrow-right" size={12} className="text-purple-400 mt-0.5" />
                    <div className="flex-1">
                      <a
                        href={flag.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 break-all"
                      >
                        {flag.url}
                      </a>
                      <p className="text-[10px] text-white/70 mt-0.5">Set to: {flag.value}</p>
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-white/60 mt-2">
                  After enabling flags, restart Chrome and click the refresh button above.
                </p>
              </div>
            )}

            {/* Download Button */}
            {chromeAIStatus.needsDownload && !chromeAIStatus.needsFlags && (
              <div className="bg-white/5 rounded p-2">
                <p className="text-xs text-white/80 mb-2">
                  Chrome AI model needs to be downloaded (~22MB)
                </p>
                <button
                  onClick={handleDownloadModel}
                  disabled={chromeAIStatus.downloading}
                  className="glass-button rounded-lg px-4 py-2 text-xs w-full font-semibold disabled:opacity-50"
                >
                  {chromeAIStatus.downloading ? (
                    <>
                      <Icon name="download" size={14} className="inline mr-1" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Icon name="download" size={14} className="inline mr-1" />
                      Download Model
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Success Message */}
            {chromeAIStatus.ready && (
              <div className="bg-white/5 rounded p-2">
                <p className="text-xs text-white/90">
                  No additional setup needed! Chrome AI is ready to use.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Test Connection */}
      {selectedProvider !== 'chrome-ai' && (selectedProvider === 'openai' ? apiKey.length > 0 : (ollamaEndpoint && ollamaModel)) && (
        <div>
          <button
            onClick={testConnection}
            disabled={testing}
            className="glass-button rounded-lg px-4 py-2 text-xs sm:text-sm w-full font-semibold disabled:opacity-50"
          >
            {testing ? '🔄 Testing...' : '🧪 Test'}
          </button>

          {testResult && (
            <div className={`mt-2 p-2 rounded-lg border ${
              testResult.success
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <p className={`text-xs ${testResult.success ? 'text-green-300' : 'text-red-300'}`}>
                {testResult.success ? '✓' : '✗'} {testResult.message}
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default LLMProviderStep;
