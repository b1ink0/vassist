import { useState, useEffect, useRef } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { AIServiceProxy } from '../../../services/proxies';
import ProviderSelection from '../shared/ProviderSelection';
import DesktopLLMConfig from '../../settings/llm/DesktopLLMConfig';
import Icon from '../../icons/Icon';
import StatusMessage from '../../common/StatusMessage';
import Logger from '../../../services/LoggerService';
import { isAndroid, isDesktop } from '../../../utils/PlatformUtils';
import FlagCopyButton from '../../common/FlagCopyButton';
import { Button, Input } from '../../ui';

const LLMProviderStep = ({ isLightBackground = false }) => {
  const { setupData, updateSetupData } = useSetup();
  const initialLoadRef = useRef(true);
  const isWebMode = !isAndroid && !isDesktop;
  const defaultProvider = isAndroid ? 'android-local' : (isDesktop ? 'desktop-local' : 'chrome-ai');
  const [selectedProvider, setSelectedProvider] = useState(defaultProvider);
  const [apiKey, setApiKey] = useState('');
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama2');
  const [androidEndpoint, setAndroidEndpoint] = useState('http://127.0.0.1:8765');
  const [desktopEndpoint, setDesktopEndpoint] = useState('http://127.0.0.1:11438');
  const [desktopModel, setDesktopModel] = useState('qwen3:0.6b');
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

  useEffect(() => {
    // Check Chrome AI status when component mounts
    if (isWebMode) {
      checkChromeAIStatus();
    }
    
    // Load existing setup data if any (only on first mount)
    const llmData = setupData?.llm;
    if (llmData) {
      if (llmData.provider) {
        const normalizedProvider = (!isWebMode && llmData.provider === 'chrome-ai') ? defaultProvider : llmData.provider;
        setSelectedProvider(normalizedProvider);
      }
      
      // Load provider-specific configs
      if (llmData.openai?.apiKey) setApiKey(llmData.openai.apiKey);
      if (llmData.ollama?.endpoint) setOllamaEndpoint(llmData.ollama.endpoint);
      if (llmData.ollama?.model) setOllamaModel(llmData.ollama.model);
      if (llmData['android-local']?.endpoint) setAndroidEndpoint(llmData['android-local'].endpoint);
      if (llmData['desktop-local']?.endpoint) setDesktopEndpoint(llmData['desktop-local'].endpoint);
      if (llmData['desktop-local']?.model) setDesktopModel(llmData['desktop-local'].model);
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
      'android-local': {
        endpoint: androidEndpoint,
        model: 'qwen3-local',
        temperature: 0.7,
        maxTokens: 2048,
      },
      'desktop-local': {
        endpoint: desktopEndpoint,
        model: desktopModel,
        temperature: 0.7,
        maxTokens: 2048,
        contextSize: 4096,
        gpuLayers: 99,
        threads: 4,
      },
    };
    
    updateSetupData({ llm: llmConfig });
  }, [selectedProvider, apiKey, ollamaEndpoint, ollamaModel, androidEndpoint, desktopEndpoint, desktopModel, updateSetupData]);

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
      const result = await AIServiceProxy.downloadChromeAIModel((progress) => {
        setChromeAIStatus(prev => ({
          ...prev,
          downloadProgress: progress.progress || 0,
          downloadDetails: progress.details || `${(progress.progress || 0).toFixed(1)}%`
        }));
      });
      
      clearTimeout(timeoutId);
      
      Logger.log('LLMProviderStep', 'Download result:', result);

      if (result.success) {
        setChromeAIStatus(prev => ({
          ...prev,
          downloadDetails: result.message || 'Download initiated. Please check chrome://on-device-internals for progress.',
        }));
      }
      
      // Recheck status after download
      await checkChromeAIStatus();
    } catch (error) {
      clearTimeout(timeoutId);
      Logger.error('LLMProviderStep', 'Download error:', error);
      setChromeAIStatus(prev => ({ 
        ...prev, 
        downloading: false,
        downloadTimedOut: false,
        message: error.message || 'Failed to download model',
        downloadDetails: 'Please try manually at chrome://components or check chrome://flags'
      }));
    }
  };

  // Build providers list - Android Local/Desktop Local first if on their respective platforms
  const providers = [
    // Android Local - only shown on Android, always first and recommended
    ...(isAndroid ? [{
      id: 'android-local',
      name: 'Android Local',
      description: 'On-device AI using Qwen3-0.6B',
      iconName: 'cpu',
      available: true,
      recommended: true,
      requirements: 'Ready to use! Pre-installed on device',
      pros: ['100% Free', 'Privacy-focused (local)', 'No internet needed', 'Fast on-device inference'],
      cons: ['Limited model size', 'No image/audio support yet']
    }] : []),
    // Desktop Local - only shown on Desktop, always first and recommended
    ...(isDesktop ? [{
      id: 'desktop-local',
      name: 'Desktop Local',
      description: 'On-device AI using llama.cpp',
      iconName: 'cpu',
      available: true,
      recommended: true,
      requirements: 'Ready to use! llama-server via Electron',
      pros: ['100% Free', 'Privacy-focused (local)', 'No internet needed', 'GPU accelerated', 'Supports large models'],
      cons: ['Requires model download', 'GPU recommended']
    }] : []),
    // Chrome AI - only on non-Android/non-Desktop (web mode)
    ...(isWebMode ? [{
      id: 'chrome-ai',
      name: 'Chrome AI',
      description: 'Free, local AI powered by Google',
      iconName: 'globe',
      available: true,
      recommended: chromeAIStatus.ready,
      requirements: chromeAIStatus.ready ? 'Ready to use!' : chromeAIStatus.available ? 'Setup required' : 'Chrome 138+ required',
      pros: ['100% Free', 'Privacy-focused (local)', 'No API keys needed', 'Fast response'],
      cons: chromeAIStatus.ready ? ['Limited to Chrome browser'] : ['Requires Chrome 138+', 'Needs browser flags', 'Model download required']
    }] : []),
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'Cloud-based AI with GPT models',
      iconName: 'ai',
      available: true,
      recommended: false,
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

      if (selectedProvider === 'android-local') {
        testConfig['android-local'] = {
          endpoint: androidEndpoint,
          model: 'qwen3-local',
          temperature: 0.7,
          maxTokens: 2048
        };
      } else if (selectedProvider === 'desktop-local') {
        testConfig['desktop-local'] = {
          endpoint: desktopEndpoint,
          model: desktopModel,
          temperature: 0.7,
          maxTokens: 2048,
          contextSize: 4096,
          gpuLayers: 99,
          threads: 4
        };
      } else if (selectedProvider === 'chrome-ai') {
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
        <h2 className="text-xl sm:text-2xl font-bold mb-1 bg-gradient-to-r from-white/90 to-white/70 bg-clip-text text-transparent">
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
      {selectedProvider === 'android-local' && (
        <div className="space-y-3">
          {/* Info Banner */}
          <div className="p-3 rounded-lg bg-white/10 border border-white/20">
            <div className="flex items-start gap-2">
              <Icon name="cpu" size={18} className="text-white/80 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-white/70">
                <span className="font-semibold">Android Local AI</span> - On-device language model using Qwen3-0.6B. Runs entirely on your device, no internet needed!
              </p>
            </div>
          </div>

          {/* Status */}
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-white/70"></div>
              <span className="text-sm font-semibold text-white/90">Ready to use!</span>
            </div>
            <p className="text-xs text-white/60">
              Model: Qwen3-0.6B-Q4 (400MB) • Optimized for mobile devices
            </p>
          </div>

          {/* Advanced Config (collapsed by default) */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-white/90 flex items-center justify-between p-2 rounded hover:bg-white/5">
              <span>Advanced Settings</span>
              <Icon name="arrow-down" size={14} className="group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10 space-y-3">
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1">
                  Endpoint URL
                </label>
                <Input
                  type="text"
                  value={androidEndpoint}
                  onChange={(e) => setAndroidEndpoint(e.target.value)}
                  placeholder="http://127.0.0.1:8765"
                  className="w-full text-xs sm:text-sm"
                />
                <p className="text-[10px] text-white/50 mt-1">
                  Local HTTP server running on your Android device
                </p>
              </div>
            </div>
          </details>
        </div>
      )}

      {selectedProvider === 'desktop-local' && (
        <DesktopLLMConfig
          config={{
            endpoint: desktopEndpoint,
            model: desktopModel
          }}
          onChange={(updates) => {
            if (updates.endpoint !== undefined) setDesktopEndpoint(updates.endpoint);
            if (updates.model !== undefined) setDesktopModel(updates.model);
          }}
          isSetupMode={true}
          showTitle={false}
        />
      )}

      {selectedProvider === 'openai' && (
        <div className="rounded-lg p-2 sm:p-3 border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-2">OpenAI Config</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                API Key <span className="text-red-400">*</span>
              </label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full text-xs sm:text-sm"
              />
              <p className="text-[10px] sm:text-xs text-white/70 mt-1">
                Get from{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/80 hover:text-white/70"
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
              <Input
                type="text"
                value={ollamaEndpoint}
                onChange={(e) => setOllamaEndpoint(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full text-xs sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/90 mb-1">
                Model <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="llama2"
                className="w-full text-xs sm:text-sm"
              />
              <p className="text-[10px] sm:text-xs text-white/70 mt-1">
                <a
                  href="https://ollama.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/80 hover:text-white/70"
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
          <div className="p-3 rounded-lg bg-white/10 border border-white/20">
            <div className="flex items-start gap-2">
              <Icon name="ai" size={18} className="text-white/80 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-white/70">
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
                    <div className={cn('w-2 h-2 rounded-full', chromeAIStatus.ready ? 'bg-green-400' : chromeAIStatus.downloading ? 'bg-yellow-400 animate-pulse' : 'bg-red-400')}></div>
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
                        <div className="p-2 rounded bg-white/10 border border-white/20 space-y-2">
                          <p className="text-xs text-white/70">
                            <Icon name="info" size={12} className="inline mr-1" />
                            The download is likely happening in the background. Track real-time progress at:
                          </p>
                          <div className="flex items-start gap-2 p-2 bg-white/5 rounded border border-white/10">
                            <Icon name="globe" size={14} className="text-white/80 mt-1 flex-shrink-0" />
                            <code className="text-xs text-white/70 break-all flex-1">chrome://on-device-internals/</code>
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
                      <Button
                        onClick={handleDownloadModel}
                        className="mt-3 w-full text-xs flex items-center justify-center gap-2"
                      >
                        <Icon name="download" size={14} />
                        <span>Start Model Download</span>
                      </Button>
                      
                      {/* Show message after 3 attempts */}
                      {chromeAIStatus.downloadAttempts >= 3 && (
                        <div className="mt-2 p-2 rounded bg-white/10 border border-white/20">
                          <p className="text-xs text-white/70">
                            <Icon name="info" size={12} className="inline mr-1" />
                            The model may already be downloading in the background. Please wait a few minutes and click "Refresh Status" to check progress.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Refresh Status Button */}
                  <Button
                    onClick={checkChromeAIStatus}
                    disabled={chromeAIStatus.checking}
                    variant="ghost"
                    className="mt-2 text-xs flex items-center gap-1"
                  >
                    <Icon name="refresh" size={12} className={chromeAIStatus.checking ? 'animate-spin' : ''} />
                    <span>{chromeAIStatus.checking ? 'Checking...' : 'Refresh Status'}</span>
                  </Button>
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
                Enable these flags and restart Chrome, then visit <code className="text-white/70">chrome://components</code> to download "Optimization Guide On Device Model"
              </p>
            </div>
          </details>
        </div>
      )}

      {/* Test Connection */}
      {(selectedProvider === 'android-local' || 
        (selectedProvider !== 'chrome-ai' && (selectedProvider === 'openai' ? apiKey.length > 0 : (ollamaEndpoint && ollamaModel)))) && (
        <div>
          <Button
            onClick={testConnection}
            disabled={testing}
            className="w-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-2"
          >
            {testing ? (
              <>
                <Icon name="refresh" size={14} className="animate-spin" />
                <span>Testing...</span>
              </>
            ) : (
              <>
                <Icon name="wrench" size={14} />
                <span>Test Connection</span>
              </>
            )}
          </Button>

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
