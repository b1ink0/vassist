import { useState, useEffect, useRef } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { AIServiceProxy } from '../../../services/proxies';
import ProviderSelection from '../shared/ProviderSelection';
import Icon from '../../icons/Icon';
import StatusMessage from '../../common/StatusMessage';
import Logger from '../../../services/LoggerService';

// Copy button component for Chrome flags
const FlagCopyButton = ({ flagUrl, flagValue }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(flagUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-start gap-2 p-2 bg-white/5 rounded border border-white/10">
      <Icon name="flag" size={14} className="text-purple-400 mt-1 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <code className="text-xs text-blue-300 break-all block">{flagUrl}</code>
        <p className="text-[10px] text-white/60 mt-1">Set to: <span className="text-yellow-300">{flagValue}</span></p>
      </div>
      <button
        onClick={handleCopy}
        className="flex-shrink-0 px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors border border-white/20"
      >
        <Icon name={copied ? "check" : "copy"} size={14} className={copied ? "text-green-400" : "text-white/80"} />
      </button>
    </div>
  );
};

const LLMProviderStep = ({ isLightBackground = false }) => {
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
    downloadProgress: 0,
    downloadDetails: '',
    downloadTimedOut: false,
    downloadAttempts: 0,
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
    
    Logger.log('LLMProviderStep', 'Saving provider config:', selectedProvider);
    
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
      
      setChromeAIStatus(prev => ({
        ...prev, // PRESERVE downloadAttempts!
        checking: false,
        available: result.available || false,
        ready: isReady,
        message: result.message || (isReady ? 'Chrome AI is ready!' : 'Setup required'),
        needsFlags: needsFlags,
        needsDownload: needsDownload && !needsFlags,
        downloading: isDownloading,
        downloadProgress: isDownloading ? prev.downloadProgress : 0,
        downloadDetails: isDownloading ? prev.downloadDetails : '',
        downloadAttempts: (isReady || isDownloading) ? 0 : prev.downloadAttempts, // Reset only if ready or downloading
        flags: result.flags || [],
        state: result.state,
      }));
    } catch (error) {
      setChromeAIStatus(prev => ({
        ...prev, // PRESERVE downloadAttempts!
        checking: false,
        available: false,
        ready: false,
        message: error.message || 'Failed to check Chrome AI availability',
        needsFlags: false,
        needsDownload: false,
        downloading: false,
      }));
    }
  };

  const handleDownloadModel = async () => {
    const newAttempts = chromeAIStatus.downloadAttempts + 1;
    
    Logger.log('LLMProviderStep', 'Download attempt:', newAttempts);
    
    setChromeAIStatus(prev => ({ 
      ...prev, 
      downloading: true, 
      downloadProgress: 0,
      downloadDetails: 'Initializing download...',
      downloadTimedOut: false,
      downloadAttempts: newAttempts
    }));
    
    // Set timeout to show the chrome:// link after 30 seconds
    const timeoutId = setTimeout(() => {
      setChromeAIStatus(prev => ({
        ...prev,
        downloadTimedOut: true
      }));
    }, 30000);
    
    try {
      // Trigger model download with progress callback
      await AIServiceProxy.downloadChromeAIModel((progress) => {
        setChromeAIStatus(prev => ({
          ...prev,
          downloadProgress: progress.progress || 0,
          downloadDetails: progress.details || `${(progress.progress || 0).toFixed(1)}%`
        }));
      });
      
      clearTimeout(timeoutId);
      
      // Recheck status after download
      await checkChromeAIStatus();
    } catch (error) {
      clearTimeout(timeoutId);
      setChromeAIStatus(prev => ({ 
        ...prev, 
        downloading: false,
        downloadTimedOut: false,
        message: error.message || 'Failed to download model'
      }));
    }
  };

  const providers = [
    {
      id: 'chrome-ai',
      name: 'Chrome AI',
      description: 'Free, local AI powered by Google',
      iconName: 'globe',
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
      iconName: 'ai',
      available: true,
      recommended: false, // Recommend if Chrome AI not available
      requirements: 'API key required (paid service)',
      pros: ['Most capable models', 'Works on any browser', 'Regular updates', 'Reliable'],
      cons: ['Requires API key', 'Costs money per request', 'Needs internet', 'Data sent to OpenAI']
    },
    {
      id: 'ollama',
      name: 'Ollama',
      description: 'Run large language models locally',
      iconName: 'cpu',
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
        <div className="space-y-4">
          {/* Info Banner */}
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-start gap-2">
              <Icon name="ai" size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300">
                <span className="font-semibold">Chrome Built-in AI</span> - On-device language model using Gemini Nano. No API key needed, works offline!
              </p>
            </div>
          </div>

          {/* Availability Status */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/90">Status</label>
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              {chromeAIStatus.checking ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-white/70">
                    {chromeAIStatus.checking ? 'Rechecking...' : 'Checking availability...'}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${
                      chromeAIStatus.ready ? 'bg-green-400' :
                      chromeAIStatus.downloading ? 'bg-yellow-400 animate-pulse' :
                      'bg-red-400'
                    }`}></div>
                    <span className="text-sm font-semibold text-white/90">{chromeAIStatus.message}</span>
                  </div>
                  
                  {/* Download Progress */}
                  {chromeAIStatus.downloading && (
                    <div className="mt-3 space-y-2">
                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-white/70">Downloading model...</span>
                          <span className="text-yellow-300 font-semibold">{chromeAIStatus.downloadProgress.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 transition-all duration-300 rounded-full"
                            style={{ width: `${chromeAIStatus.downloadProgress}%` }}
                          />
                        </div>
                        {chromeAIStatus.downloadDetails && (
                          <p className="text-xs text-white/50">{chromeAIStatus.downloadDetails}</p>
                        )}
                      </div>
                      
                      {/* Timeout Message */}
                      {chromeAIStatus.downloadTimedOut && (
                        <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 space-y-2">
                          <p className="text-xs text-blue-300">
                            <Icon name="info" size={12} className="inline mr-1" />
                            The download is likely happening in the background. Track real-time progress at:
                          </p>
                          <div className="flex items-start gap-2 p-2 bg-white/5 rounded border border-white/10">
                            <Icon name="globe" size={14} className="text-blue-400 mt-1 flex-shrink-0" />
                            <code className="text-xs text-blue-300 break-all flex-1">chrome://on-device-internals/</code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText('chrome://on-device-internals/');
                              }}
                              className="flex-shrink-0 px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors border border-white/20"
                              title="Copy to clipboard"
                            >
                              <Icon name="copy" size={14} className="text-white/80" />
                            </button>
                          </div>
                          <p className="text-xs text-white/50">
                            Copy the URL above and paste it into your browser's address bar.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Download Button */}
                  {chromeAIStatus.needsDownload && !chromeAIStatus.needsFlags && !chromeAIStatus.downloading && (
                    <>
                      <button
                        onClick={handleDownloadModel}
                        className="mt-3 glass-button px-4 py-2 text-xs font-medium rounded-lg w-full flex items-center justify-center gap-2"
                      >
                        <Icon name="download" size={14} />
                        <span>Start Model Download</span>
                      </button>
                      
                      {/* Show message after 3 attempts */}
                      {chromeAIStatus.downloadAttempts >= 3 && (
                        <div className="mt-2 p-2 rounded bg-blue-500/10 border border-blue-500/20">
                          <p className="text-xs text-blue-300">
                            <Icon name="info" size={12} className="inline mr-1" />
                            The model may already be downloading in the background. Please wait a few minutes and click "Refresh Status" to check progress.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Refresh Status Button */}
                  <button
                    onClick={checkChromeAIStatus}
                    disabled={chromeAIStatus.checking}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    <Icon name="refresh" size={12} className={chromeAIStatus.checking ? 'animate-spin' : ''} />
                    <span>{chromeAIStatus.checking ? 'Checking...' : 'Refresh Status'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Required Flags - Always visible */}
          <details className="group" open>
            <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-between p-2 rounded hover:bg-white/5">
              <span>Required Chrome Flags</span>
              <Icon name="arrow-down" size={14} className="group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10 space-y-2 text-xs">
              <FlagCopyButton
                flagUrl="chrome://flags/#optimization-guide-on-device-model"
                flagValue="Enabled BypassPerfRequirement"
              />
              <FlagCopyButton
                flagUrl="chrome://flags/#prompt-api-for-gemini-nano"
                flagValue="Enabled"
              />
              <FlagCopyButton
                flagUrl="chrome://flags/#prompt-api-for-gemini-nano-multimodal-input"
                flagValue="Enabled"
              />
              <p className="text-white/50 mt-2">
                Enable these flags and restart Chrome, then visit <code className="text-blue-300">chrome://components</code> to download "Optimization Guide On Device Model"
              </p>
            </div>
          </details>
        </div>
      )}

      {/* Test Connection */}
      {selectedProvider !== 'chrome-ai' && (selectedProvider === 'openai' ? apiKey.length > 0 : (ollamaEndpoint && ollamaModel)) && (
        <div>
          <button
            onClick={testConnection}
            disabled={testing}
            className="glass-button rounded-lg px-4 py-2 text-xs sm:text-sm w-full font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {testing ? (
              <>
                <Icon name="refresh" size={14} className="animate-spin" />
                <span>Testing...</span>
              </>
            ) : (
              <>
                <Icon name="wrench" size={14} />
                <span>Test</span>
              </>
            )}
          </button>

          {testResult && (
            <StatusMessage 
              message={testResult.success ? `success:${testResult.message}` : `error:${testResult.message}`}
              isLightBackground={isLightBackground}
              className="mt-2"
            />
          )}
        </div>
      )}

    </div>
  );
};

export default LLMProviderStep;
