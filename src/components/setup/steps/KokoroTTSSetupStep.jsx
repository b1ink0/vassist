import { useState, useEffect } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { TTSProviders, DefaultTTSConfig } from '../../../config/aiConfig';
import TTSServiceProxy from '../../../services/proxies/TTSServiceProxy';
import { Icon } from '../../icons';
import KokoroTTSConfig from '../../settings/tts/KokoroTTSConfig';

const KokoroTTSSetupStep = () => {
  const { setupData, markStepComplete, updateSetupData, nextStep } = useSetup();
  
  // Check if Kokoro was selected in previous step
  const isKokoroSelected = setupData?.ttsProvider === TTSProviders.KOKORO;
  
  // Kokoro configuration (use DefaultTTSConfig as starting point)
  const [kokoroConfig, setKokoroConfig] = useState(DefaultTTSConfig.kokoro);
  
  // Kokoro status
  const [kokoroStatus, setKokoroStatus] = useState({
    checking: false,
    initialized: false,
    downloading: false,
    progress: 0,
    message: '',
    details: '',
    state: ''
  });
  
  // Testing
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // If Kokoro not selected, auto-skip this step
  useEffect(() => {
    if (!isKokoroSelected) {
      markStepComplete();
      nextStep();
    }
  }, [isKokoroSelected, markStepComplete, nextStep]);

  // Check Kokoro status on mount
  useEffect(() => {
    if (isKokoroSelected) {
      checkKokoroStatus();
    }
  }, [isKokoroSelected]);

  const handleConfigChange = (field, value) => {
    setKokoroConfig(prev => ({ ...prev, [field]: value }));
  };

  const checkKokoroStatus = async () => {
    setKokoroStatus(prev => ({ ...prev, checking: true }));
    
    try {
      const status = await TTSServiceProxy.checkKokoroStatus();
      setKokoroStatus({
        checking: false,
        initialized: status.initialized || false,
        downloading: false,
        progress: 0,
        message: status.initialized ? 'Model is ready' : 'Model not initialized',
        details: status.details || '',
        state: status.initialized ? 'ready' : 'not-initialized'
      });
    } catch (error) {
      console.error('Failed to check Kokoro status:', error);
      setKokoroStatus({
        checking: false,
        initialized: false,
        downloading: false,
        progress: 0,
        message: 'Failed to check status',
        details: error.message,
        state: 'error'
      });
    }
  };

  const initializeKokoro = async () => {
    setKokoroStatus(prev => ({ 
      ...prev, 
      downloading: true, 
      progress: 0,
      message: 'Initializing Kokoro...',
      details: 'Starting download...'
    }));

    try {
      // IMPORTANT: Configure Kokoro as the TTS provider before initializing
      // TTSServiceProxy.configure() expects the same format as DefaultTTSConfig
      await TTSServiceProxy.configure({
        enabled: true,
        provider: TTSProviders.KOKORO,
        kokoro: kokoroConfig
      });

      // Debounce progress updates to avoid UI thrashing
      let lastUpdateTime = 0;
      const progressDebounceMs = 100; // Update UI max every 100ms

      // Now initialize the Kokoro model with progress tracking
      const result = await TTSServiceProxy.initializeKokoro((progressData) => {
        // Handle progress updates - progressData has { percent, file, status, etc }
        const percent = typeof progressData.percent === 'number' ? progressData.percent : 0;
        const file = progressData.file || progressData.status || 'Downloading model...';
        
        // Debounce updates - only update if enough time has passed or it's 100%
        const now = Date.now();
        const shouldUpdate = (now - lastUpdateTime >= progressDebounceMs) || percent >= 99.9;
        
        if (shouldUpdate) {
          lastUpdateTime = now;
          
          setKokoroStatus(prev => ({
            ...prev,
            downloading: true,
            progress: percent,
            message: 'Downloading model...',
            details: file
          }));
        }
      });

      if (result) {
        setKokoroStatus({
          checking: false,
          initialized: true,
          downloading: false,
          progress: 100,
          message: 'Model ready!',
          details: 'Kokoro TTS is initialized and ready to use',
          state: 'ready'
        });
      }
    } catch (error) {
      console.error('Kokoro initialization failed:', error);
      setKokoroStatus({
        checking: false,
        initialized: false,
        downloading: false,
        progress: 0,
        message: 'Initialization failed',
        details: error.message,
        state: 'error'
      });
    }
  };

  const testVoice = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // Configure Kokoro TTS with current settings before testing
      await TTSServiceProxy.configure({
        enabled: true,
        provider: TTSProviders.KOKORO,
        kokoro: kokoroConfig
      });

      // Test with sample text
      await TTSServiceProxy.testConnection(
        `Hello, I am your virtual assistant. This is voice ${kokoroConfig.voice} at ${kokoroConfig.speed}x speed.`
      );

      setTestResult({ success: true, message: 'Voice test successful!' });
    } catch (error) {
      console.error('Voice test failed:', error);
      setTestResult({ success: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  const handleContinue = () => {
    // Update the TTS config with Kokoro settings
    const ttsConfig = {
      provider: TTSProviders.KOKORO,
      enabled: true,
      kokoro: kokoroConfig
    };

    updateSetupData({ ttsConfig });
    markStepComplete();
    nextStep();
  };

  const handleSkip = () => {
    // Skip Kokoro setup, keep default config
    markStepComplete();
    nextStep();
  };

  // If Kokoro not selected, show skip message
  if (!isKokoroSelected) {
    return (
      <div className="setup-step kokoro-tts-setup-step">
        <div className="text-center">
          <p className="text-white/90">Kokoro TTS not selected. Skipping configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-step kokoro-tts-setup-step">
      <div className="step-header mb-8">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Configure Kokoro TTS
        </h2>
        <p className="text-white/90">
          Customize your Kokoro text-to-speech settings and download the model.
        </p>
      </div>

      {/* Info Box */}
      <div className="glass-container rounded-xl p-4 mb-6 bg-blue-500/10 border border-blue-400/30">
        <div className="flex items-start gap-3">
          <Icon name="info" size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-100">
            <p className="font-medium mb-1">About Kokoro TTS</p>
            <p className="text-blue-200/80">
              Kokoro is a free, local, high-quality text-to-speech model. 
              The model (~86MB for q8) will be downloaded on first use and cached for offline use.
            </p>
          </div>
        </div>
      </div>

      {/* Use Shared Kokoro Configuration Component */}
      <KokoroTTSConfig
        config={kokoroConfig}
        onChange={handleConfigChange}
        kokoroStatus={kokoroStatus}
        onInitialize={initializeKokoro}
        onCheckStatus={checkKokoroStatus}
        onTestVoice={testVoice}
        isLightBackground={false}
        showTitle={false}
        showTestButton={true}
        isSetupMode={true}
      />

      {/* Test Result */}
      {testResult && (
        <div className={`glass-container rounded-xl p-4 mt-4 ${
          testResult.success 
            ? 'bg-emerald-500/10 border border-emerald-400/30' 
            : 'bg-red-500/10 border border-red-400/30'
        }`}>
          <div className="flex items-start gap-3">
            <Icon 
              name={testResult.success ? 'check-circle' : 'alert-triangle'} 
              size={20} 
              className={`${testResult.success ? 'text-emerald-400' : 'text-red-400'} flex-shrink-0 mt-0.5`} 
            />
            <div className="text-sm">
              <p className={testResult.success ? 'text-emerald-100' : 'text-red-100'}>
                {testResult.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8">
        <button
          onClick={handleSkip}
          className="glass-button rounded-xl px-6 py-3 text-white/70 hover:text-white transition-colors"
        >
          ← Skip for Now
        </button>
        <button
          onClick={handleContinue}
          disabled={!kokoroStatus.initialized && !testing}
          className="glass-button rounded-xl px-8 py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {kokoroStatus.initialized ? 'Continue →' : 'Initialize Model First'}
        </button>
      </div>

      {/* Help Text */}
      <div className="mt-6 text-center text-sm text-white/60">
        <p>You can change these settings later in the Settings panel</p>
      </div>
    </div>
  );
};

export default KokoroTTSSetupStep;
