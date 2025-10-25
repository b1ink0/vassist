/**
 * ConfigContext
 * Centralized configuration state management for all settings
 * Provides UI, LLM (AI), TTS, and STT configurations to all components
 * Auto-saves all config changes after a short delay
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  AIServiceProxy, 
  TTSServiceProxy, 
  STTServiceProxy, 
  StorageServiceProxy,
  TranslatorServiceProxy,
  LanguageDetectorServiceProxy,
  SummarizerServiceProxy
} from '../services/proxies';
import ChromeAIValidator from '../services/ChromeAIValidator';
import { 
  DefaultAIConfig, 
  DefaultTTSConfig, 
  DefaultSTTConfig, 
  validateAIConfig, 
  validateTTSConfig, 
  validateSTTConfig 
} from '../config/aiConfig';
import { DefaultUIConfig } from '../config/uiConfig';

const ConfigContext = createContext(null);

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within ConfigProvider');
  }
  return context;
};

export const ConfigProvider = ({ children }) => {
  // Track if initial load is complete to prevent auto-save during load
  const initialLoadRef = useRef(true);

  // Auto-save timeout refs for debouncing
  const aiSaveTimeoutRef = useRef(null);
  const ttsSaveTimeoutRef = useRef(null);
  const sttSaveTimeoutRef = useRef(null);
  const uiSaveTimeoutRef = useRef(null);

  // UI Config
  const [uiConfig, setUiConfig] = useState(DefaultUIConfig);
  const [uiConfigSaved, setUiConfigSaved] = useState(false);
  const [uiConfigError, setUiConfigError] = useState('');

  // AI (LLM) Config
  const [aiConfig, setAiConfig] = useState(DefaultAIConfig);
  const [aiConfigSaved, setAiConfigSaved] = useState(false);
  const [aiConfigError, setAiConfigError] = useState('');
  const [aiTesting, setAiTesting] = useState(false);

  // TTS Config
  const [ttsConfig, setTtsConfig] = useState(DefaultTTSConfig);
  const [ttsConfigSaved, setTtsConfigSaved] = useState(false);
  const [ttsConfigError, setTtsConfigError] = useState('');
  const [ttsTesting, setTtsTesting] = useState(false);

  // STT Config
  const [sttConfig, setSttConfig] = useState(DefaultSTTConfig);
  const [sttConfigSaved, setSttConfigSaved] = useState(false);
  const [sttConfigError, setSttConfigError] = useState('');
  const [sttTesting, setSttTesting] = useState(false);

  // Chrome AI Status
  const [chromeAiStatus, setChromeAiStatus] = useState({
    checking: false,
    available: false,
    state: null,
    message: '',
    details: '',
    progress: 0,
    downloading: false,
  });

  // Kokoro TTS Status
  const [kokoroStatus, setKokoroStatus] = useState({
    checking: false,
    initialized: false,
    state: 'notInitialized', // 'notInitialized' | 'downloading' | 'ready' | 'error'
    message: '',
    details: '',
    progress: 0,
    downloading: false,
  });

  // Load all configs on mount
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        // Load UI config
        const savedUiConfig = await StorageServiceProxy.configLoad('uiConfig', DefaultUIConfig);
        setUiConfig(savedUiConfig);
        console.log('[ConfigContext] UI config loaded:', savedUiConfig);

        // Load AI config
        const savedAiConfig = await StorageServiceProxy.configLoad('aiConfig', DefaultAIConfig);
        setAiConfig(savedAiConfig);
        try {
          AIServiceProxy.configure(savedAiConfig);
          console.log('[ConfigContext] AI Service configured');
          
          // Configure AI Features services if enabled
          if (savedAiConfig.aiFeatures?.translator?.enabled) {
            TranslatorServiceProxy.configure(savedAiConfig);
            console.log('[ConfigContext] Translator Service configured');
          }
          if (savedAiConfig.aiFeatures?.languageDetector?.enabled) {
            LanguageDetectorServiceProxy.configure(savedAiConfig);
            console.log('[ConfigContext] Language Detector Service configured');
          }
          if (savedAiConfig.aiFeatures?.summarizer?.enabled) {
            SummarizerServiceProxy.configure(savedAiConfig);
            console.log('[ConfigContext] Summarizer Service configured');
          }
        } catch (error) {
          console.warn('[ConfigContext] Failed to configure AI Service:', error);
        }

        // Load TTS config
        const savedTtsConfig = await StorageServiceProxy.configLoad('ttsConfig', DefaultTTSConfig);
        console.log('[ConfigContext] TTS config loaded from storage:', JSON.stringify(savedTtsConfig.kokoro, null, 2));
        setTtsConfig(savedTtsConfig);
        try {
          TTSServiceProxy.configure(savedTtsConfig);
          console.log('[ConfigContext] TTS Service configured');
        } catch (error) {
          console.warn('[ConfigContext] Failed to configure TTS Service:', error);
        }

        // Load STT config
        const savedSttConfig = await StorageServiceProxy.configLoad('sttConfig', DefaultSTTConfig);
        setSttConfig(savedSttConfig);
        try {
          STTServiceProxy.configure(savedSttConfig);
          console.log('[ConfigContext] STT Service configured');
        } catch (error) {
          console.warn('[ConfigContext] Failed to configure STT Service:', error);
        }
      } catch (error) {
        console.error('[ConfigContext] Failed to load configs:', error);
      }
    };

    loadConfigs();
  }, []);

  // Auto-save AI config when it changes (after initial load)
  useEffect(() => {
    if (initialLoadRef.current) return; // Skip during initial load
    
    if (aiSaveTimeoutRef.current) {
      clearTimeout(aiSaveTimeoutRef.current);
    }
    
    aiSaveTimeoutRef.current = setTimeout(async () => {
      const validation = validateAIConfig(aiConfig);
      if (!validation.valid) return;
      
      try {
        await StorageServiceProxy.configSave('aiConfig', aiConfig);
        setAiConfigSaved(true);
        AIServiceProxy.configure(aiConfig);
        
        // Configure AI Features services
        if (aiConfig.aiFeatures?.translator?.enabled) {
          TranslatorServiceProxy.configure(aiConfig);
        }
        if (aiConfig.aiFeatures?.languageDetector?.enabled) {
          LanguageDetectorServiceProxy.configure(aiConfig);
        }
        if (aiConfig.aiFeatures?.summarizer?.enabled) {
          SummarizerServiceProxy.configure(aiConfig);
        }
        
        // Notify other contexts about config change
        window.dispatchEvent(new CustomEvent('vassist-config-updated', {
          detail: { type: 'aiConfig', config: aiConfig }
        }));
        
        setTimeout(() => setAiConfigSaved(false), 2000);
        console.log('[ConfigContext] AI config auto-saved');
      } catch (error) {
        console.error('[ConfigContext] AI config auto-save failed:', error);
      }
    }, 500);
  }, [aiConfig]);

  // Auto-save TTS config when it changes (after initial load)
  useEffect(() => {
    if (initialLoadRef.current) return; // Skip during initial load
    
    if (ttsSaveTimeoutRef.current) {
      clearTimeout(ttsSaveTimeoutRef.current);
    }
    
    ttsSaveTimeoutRef.current = setTimeout(async () => {
      const validation = validateTTSConfig(ttsConfig);
      if (!validation.valid) return;
      
      try {
        console.log('[ConfigContext] Auto-saving TTS config, device:', ttsConfig.kokoro?.device);
        await StorageServiceProxy.configSave('ttsConfig', ttsConfig);
        setTtsConfigSaved(true);
        TTSServiceProxy.configure(ttsConfig);
        setTimeout(() => setTtsConfigSaved(false), 2000);
        console.log('[ConfigContext] TTS config auto-saved successfully');
      } catch (error) {
        console.error('[ConfigContext] TTS config auto-save failed:', error);
      }
    }, 500);
  }, [ttsConfig]);

  // Auto-save STT config when it changes (after initial load)
  useEffect(() => {
    if (initialLoadRef.current) return; // Skip during initial load
    
    if (sttSaveTimeoutRef.current) {
      clearTimeout(sttSaveTimeoutRef.current);
    }
    
    sttSaveTimeoutRef.current = setTimeout(async () => {
      const validation = validateSTTConfig(sttConfig);
      if (!validation.valid) return;
      
      try {
        await StorageServiceProxy.configSave('sttConfig', sttConfig);
        setSttConfigSaved(true);
        STTServiceProxy.configure(sttConfig);
        setTimeout(() => setSttConfigSaved(false), 2000);
        console.log('[ConfigContext] STT config auto-saved');
      } catch (error) {
        console.error('[ConfigContext] STT config auto-save failed:', error);
      }
    }, 500);
  }, [sttConfig]);

  // Auto-save UI config when it changes (after initial load)
  useEffect(() => {
    if (initialLoadRef.current) return; // Skip during initial load
    
    if (uiSaveTimeoutRef.current) {
      clearTimeout(uiSaveTimeoutRef.current);
    }
    
    uiSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await StorageServiceProxy.configSave('uiConfig', uiConfig);
        setUiConfigSaved(true);
        
        // Notify other contexts about config change
        window.dispatchEvent(new CustomEvent('vassist-config-updated', {
          detail: { type: 'uiConfig', config: uiConfig }
        }));
        
        setTimeout(() => setUiConfigSaved(false), 2000);
        console.log('[ConfigContext] UI config auto-saved');
      } catch (error) {
        console.error('[ConfigContext] UI config auto-save failed:', error);
      }
    }, 500);
  }, [uiConfig]);

  // Mark initial load as complete after a short delay
  useEffect(() => {
    const timer = setTimeout(() => {
      initialLoadRef.current = false;
      console.log('[ConfigContext] Initial load complete - auto-save enabled');
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // UI Config handlers
  const updateUIConfig = useCallback((path, value) => {
    setUiConfig(prev => {
      const updated = { ...prev };
      const parts = path.split('.');
      let current = updated;
      
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }
      
      current[parts[parts.length - 1]] = value;
      return updated;
    });
  }, []);

  const saveUIConfig = useCallback(async () => {
    try {
      await StorageServiceProxy.configSave('uiConfig', uiConfig);
      setUiConfigSaved(true);
      setUiConfigError('');
      
      // Notify other components
      window.dispatchEvent(new CustomEvent('uiConfigUpdated', { detail: uiConfig }));
      
      console.log('[ConfigContext] UI config saved successfully');
      setTimeout(() => setUiConfigSaved(false), 2000);
    } catch (error) {
      setUiConfigError('Failed to save configuration: ' + error.message);
      console.error('[ConfigContext] UI config save error:', error);
    }
  }, [uiConfig]);

  // AI Config handlers
  const updateAIConfig = useCallback((path, value) => {
    setAiConfig(prev => {
      const updated = { ...prev };
      const parts = path.split('.');
      let current = updated;
      
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }
      
      current[parts[parts.length - 1]] = value;
      return updated;
    });
  }, []);

  const saveAIConfig = useCallback(async () => {
    const validation = validateAIConfig(aiConfig);
    
    if (!validation.valid) {
      setAiConfigError(validation.errors.join(', '));
      return;
    }
    
    try {
      await StorageServiceProxy.configSave('aiConfig', aiConfig);
      setAiConfigSaved(true);
      setAiConfigError('');
      
      try {
        AIServiceProxy.configure(aiConfig);
        console.log('[ConfigContext] AI Service configured successfully');
        
        // Configure AI Features services
        if (aiConfig.aiFeatures?.translator?.enabled) {
          TranslatorServiceProxy.configure(aiConfig);
          console.log('[ConfigContext] Translator Service configured');
        }
        if (aiConfig.aiFeatures?.languageDetector?.enabled) {
          LanguageDetectorServiceProxy.configure(aiConfig);
          console.log('[ConfigContext] Language Detector Service configured');
        }
        if (aiConfig.aiFeatures?.summarizer?.enabled) {
          SummarizerServiceProxy.configure(aiConfig);
          console.log('[ConfigContext] Summarizer Service configured');
        }
        
        setTimeout(() => setAiConfigSaved(false), 2000);
      } catch (error) {
        setAiConfigError('Failed to configure AI service: ' + error.message);
        console.error('[ConfigContext] AI configuration failed:', error);
      }
    } catch (error) {
      setAiConfigError('Failed to save configuration: ' + error.message);
      console.error('[ConfigContext] AI config save error:', error);
    }
  }, [aiConfig]);

  const testAIConnection = useCallback(async () => {
    setAiConfigError('');
    setAiTesting(true);
    
    try {
      AIServiceProxy.configure(aiConfig);
      setAiConfigError('⏳ Testing connection...');
      await AIServiceProxy.testConnection();
      setAiConfigError('✅ Connection successful!');
      setTimeout(() => setAiConfigError(''), 3000);
    } catch (error) {
      setAiConfigError('❌ Connection failed: ' + error.message);
    } finally {
      setAiTesting(false);
    }
  }, [aiConfig]);

  // TTS Config handlers
  const updateTTSConfig = useCallback((path, value) => {
    setTtsConfig(prev => {
      const updated = { ...prev };
      const parts = path.split('.');
      let current = updated;
      
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }
      
      current[parts[parts.length - 1]] = value;
      return updated;
    });
  }, []);

  const saveTTSConfig = useCallback(async () => {
    const validation = validateTTSConfig(ttsConfig);
    
    if (!validation.valid) {
      setTtsConfigError(validation.errors.join(', '));
      return;
    }
    
    try {
      await StorageServiceProxy.configSave('ttsConfig', ttsConfig);
      setTtsConfigSaved(true);
      setTtsConfigError('');
      
      try {
        TTSServiceProxy.configure(ttsConfig);
        console.log('[ConfigContext] TTS Service configured successfully');
        setTimeout(() => setTtsConfigSaved(false), 2000);
      } catch (error) {
        setTtsConfigError('Failed to configure TTS service: ' + error.message);
        console.error('[ConfigContext] TTS configuration failed:', error);
      }
    } catch (error) {
      setTtsConfigError('Failed to save configuration: ' + error.message);
      console.error('[ConfigContext] TTS config save error:', error);
    }
  }, [ttsConfig]);

  // Kokoro TTS Status handlers - Define BEFORE testTTSConnection since it depends on this
  const checkKokoroStatus = useCallback(async () => {
    setKokoroStatus(prev => ({ ...prev, checking: true }));
    
    try {
      const status = await TTSServiceProxy.checkKokoroStatus();
      
      setKokoroStatus({
        checking: false,
        initialized: status.initialized,
        state: status.initialized ? 'ready' : 'notInitialized',
        message: status.message || (status.initialized ? 'Kokoro TTS is ready' : 'Not initialized'),
        details: status.details || '',
        progress: 0,
        downloading: false,
      });
      
      console.log('[ConfigContext] Kokoro status:', status);
      
      return status;
    } catch (error) {
      console.log('[ConfigContext] Kokoro status check failed:', error);
      setKokoroStatus({
        checking: false,
        initialized: false,
        state: 'error',
        message: 'Failed to check status',
        details: error.message,
        progress: 0,
        downloading: false,
      });
      throw error;
    }
  }, []);

  const initializeKokoro = useCallback(async () => {
    try {
      setKokoroStatus(prev => ({ ...prev, downloading: true, progress: 0, state: 'downloading' }));
      
      // Ensure TTS service is configured with current config before initializing
      console.log('[ConfigContext] Initializing Kokoro with device:', ttsConfig.kokoro?.device, 'Full kokoro config:', ttsConfig.kokoro);
      await TTSServiceProxy.configure(ttsConfig);
      
      // Debounce progress updates to avoid UI thrashing
      let lastUpdateTime = 0;
      const progressDebounceMs = 100; // Update UI max every 100ms
      
      const initialized = await TTSServiceProxy.initializeKokoro((progress) => {
        // Handle progress updates with defensive checks for undefined values
        const percent = typeof progress.percent === 'number' ? progress.percent : 0;
        const file = progress.file || 'Downloading model...';
        
        // Debounce updates - only update if enough time has passed or it's 100%
        const now = Date.now();
        const shouldUpdate = (now - lastUpdateTime >= progressDebounceMs) || percent >= 99.9;
        
        if (shouldUpdate) {
          lastUpdateTime = now;
          
          console.log(`[ConfigContext] Kokoro download progress:`, { 
            percent: percent.toFixed(2) + '%', 
            file 
          });
          
          setKokoroStatus(prev => ({ 
            ...prev, 
            progress: percent,
            details: file
          }));
        }
      });
      
      // Check status after initialization
      await checkKokoroStatus();
      
      return initialized;
    } catch (error) {
      console.error('[ConfigContext] Kokoro initialization failed:', error);
      setKokoroStatus(prev => ({ 
        ...prev, 
        downloading: false,
        state: 'error',
        message: 'Initialization failed',
        details: error.message,
      }));
      throw error;
    }
  }, [checkKokoroStatus, ttsConfig]);

  const testTTSConnection = useCallback(async () => {
    setTtsConfigError('');
    setTtsTesting(true);
    
    try {
      TTSServiceProxy.configure(ttsConfig);
      
      // For Kokoro, check if initialized first and auto-initialize if needed
      if (ttsConfig.provider === 'kokoro') {
        setTtsConfigError('⏳ Checking Kokoro status...');
        
        // Check current status
        const status = await TTSServiceProxy.checkKokoroStatus();
        
        if (!status.initialized) {
          // Auto-initialize if not initialized
          setTtsConfigError('⏳ Initializing Kokoro model (first time may take a moment)...');
          console.log('[ConfigContext] Auto-initializing Kokoro for test TTS');
          
          try {
            await initializeKokoro();
            // Check status again after initialization
            const newStatus = await TTSServiceProxy.checkKokoroStatus();
            if (!newStatus.initialized) {
              setTtsConfigError('❌ Failed to initialize Kokoro model');
              setTtsTesting(false);
              return;
            }
          } catch (initError) {
            setTtsConfigError('❌ Kokoro initialization failed: ' + initError.message);
            setTtsTesting(false);
            return;
          }
        }
      }
      
      setTtsConfigError('⏳ Testing TTS...');
      const startTime = Date.now();
      
      await TTSServiceProxy.testConnection("Hello, this is a test of the text to speech system.");
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (ttsConfig.provider === 'kokoro') {
        setTtsConfigError(`✅ TTS test successful! Generated in ${duration}s using voice: ${ttsConfig.kokoro?.voice || 'default'}`);
      } else {
        setTtsConfigError(`✅ TTS test successful! (${duration}s)`);
      }
      
      setTimeout(() => setTtsConfigError(''), 5000);
    } catch (error) {
      setTtsConfigError('❌ TTS test failed: ' + error.message);
    } finally {
      setTtsTesting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsConfig, initializeKokoro]);

  // STT Config handlers
  const updateSTTConfig = useCallback((path, value) => {
    setSttConfig(prev => {
      const updated = { ...prev };
      const parts = path.split('.');
      let current = updated;
      
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }
      
      current[parts[parts.length - 1]] = value;
      return updated;
    });
  }, []);

  const saveSTTConfig = useCallback(async () => {
    const validation = validateSTTConfig(sttConfig);
    
    if (!validation.valid) {
      setSttConfigError(validation.errors.join(', '));
      return;
    }
    
    try {
      await StorageServiceProxy.configSave('sttConfig', sttConfig);
      setSttConfigSaved(true);
      setSttConfigError('');
      
      try {
        STTServiceProxy.configure(sttConfig);
        console.log('[ConfigContext] STT Service configured successfully');
        setTimeout(() => setSttConfigSaved(false), 2000);
      } catch (error) {
        setSttConfigError('Failed to configure STT service: ' + error.message);
        console.error('[ConfigContext] STT configuration failed:', error);
      }
    } catch (error) {
      setSttConfigError('Failed to save configuration: ' + error.message);
      console.error('[ConfigContext] STT config save error:', error);
    }
  }, [sttConfig]);

  const testSTTRecording = useCallback(async () => {
    setSttConfigError('');
    setSttTesting(true);
    
    try {
      STTServiceProxy.configure(sttConfig);
      setSttConfigError('🎤 Recording for 3 seconds... Speak now!');
      
      const transcription = await STTServiceProxy.testRecording(3);
      
      setSttConfigError(`✅ Transcription: "${transcription}"`);
      setTimeout(() => setSttConfigError(''), 5000);
    } catch (error) {
      setSttConfigError('❌ STT test failed: ' + error.message);
    } finally {
      setSttTesting(false);
    }
  }, [sttConfig]);

  // Chrome AI Status handlers
  const checkChromeAIAvailability = useCallback(async () => {
    setChromeAiStatus(prev => ({ ...prev, checking: true }));
    
    try {
      const status = await ChromeAIValidator.checkAvailability();
      
      setChromeAiStatus({
        checking: false,
        available: status.available,
        state: status.state,
        message: status.message,
        details: status.details,
        progress: status.progress || 0,
        downloading: status.state === 'downloading',
        requiresFlags: status.requiresFlags,
        flags: status.flags,
      });
      
      console.log('[ConfigContext] Chrome AI status:', status);
      
      return status;
    } catch (error) {
      console.log('[ConfigContext] Chrome AI check failed:', error);
      setChromeAiStatus({
        checking: false,
        available: false,
        state: 'unavailable',
        message: 'Failed to check availability',
        details: error.message,
        progress: 0,
        downloading: false,
      });
      throw error;
    }
  }, []);

  const startChromeAIDownload = useCallback(async () => {
    try {
      // First check availability to ensure we're in downloadable state
      const status = await checkChromeAIAvailability();
      
      if (status.state !== 'downloadable' && status.state !== 'after-download') {
        console.log('[ConfigContext] Model not in downloadable state:', status.state);
        return;
      }
      
      // Now start monitoring the download
      setChromeAiStatus(prev => ({ ...prev, downloading: true, progress: 0 }));
      
      await ChromeAIValidator.monitorDownload((progress) => {
        console.log(`[ConfigContext] Chrome AI download progress: ${progress.toFixed(1)}%`);
        setChromeAiStatus(prev => ({ ...prev, progress }));
      });
      
      // Recheck availability after download completes
      await checkChromeAIAvailability();
      
    } catch (error) {
      console.error('[ConfigContext] Chrome AI download failed:', error);
      setChromeAiStatus(prev => ({ 
        ...prev, 
        downloading: false,
        message: 'Download monitoring failed',
        details: error.message,
      }));
      throw error;
    }
  }, [checkChromeAIAvailability]);

  // AI Features Test Functions
  const testTranslator = useCallback(async (text, sourceLanguage, targetLanguage) => {
    if (!aiConfig.aiFeatures?.translator?.enabled) {
      throw new Error('Translator is disabled in settings');
    }
    const result = await TranslatorServiceProxy.translate(text, sourceLanguage, targetLanguage);
    return result;
  }, [aiConfig]);

  const testLanguageDetector = useCallback(async (text) => {
    if (!aiConfig.aiFeatures?.languageDetector?.enabled) {
      throw new Error('Language Detector is disabled in settings');
    }
    const results = await LanguageDetectorServiceProxy.detect(text);
    return results;
  }, [aiConfig]);

  const testSummarizer = useCallback(async (text, options = {}) => {
    if (!aiConfig.aiFeatures?.summarizer?.enabled) {
      throw new Error('Summarizer is disabled in settings');
    }
    const summary = await SummarizerServiceProxy.summarize(text, options);
    return summary;
  }, [aiConfig]);

  // Auto-check Kokoro status on mount and auto-initialize if model is already downloaded
  useEffect(() => {
    const checkAndAutoInit = async () => {
      // Only proceed if TTS is enabled AND provider is Kokoro
      if (ttsConfig.enabled && ttsConfig.provider === 'kokoro') {
        try {
          console.log('[ConfigContext] Checking Kokoro status on mount...');
          await checkKokoroStatus();
          
          // If model is already downloaded but not initialized, auto-initialize
          // This happens when the model was downloaded in a previous session
          const status = await TTSServiceProxy.checkKokoroStatus();
          if (!status.initialized && !status.initializing) {
            console.log('[ConfigContext] Model downloaded but not initialized, auto-initializing...');
            await initializeKokoro();
          }
        } catch (error) {
          console.error('[ConfigContext] Auto-init check failed:', error);
        }
      }
    };
    
    checkAndAutoInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const value = useMemo(() => ({
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
    aiTesting,
    updateAIConfig,
    saveAIConfig,
    testAIConnection,
    
    // AI Features Tests
    testTranslator,
    testLanguageDetector,
    testSummarizer,
    
    // TTS Config
    ttsConfig,
    ttsConfigSaved,
    ttsConfigError,
    ttsTesting,
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
    
    // Chrome AI Status
    chromeAiStatus,
    checkChromeAIAvailability,
    startChromeAIDownload,

    // Kokoro TTS Status
    kokoroStatus,
    checkKokoroStatus,
    initializeKokoro,
  }), [uiConfig, uiConfigSaved, uiConfigError, updateUIConfig, saveUIConfig, aiConfig, aiConfigSaved, aiConfigError, aiTesting, updateAIConfig, saveAIConfig, testAIConnection, testTranslator, testLanguageDetector, testSummarizer, ttsConfig, ttsConfigSaved, ttsConfigError, ttsTesting, updateTTSConfig, saveTTSConfig, testTTSConnection, sttConfig, sttConfigSaved, sttConfigError, sttTesting, updateSTTConfig, saveSTTConfig, testSTTRecording, chromeAiStatus, checkChromeAIAvailability, startChromeAIDownload, kokoroStatus, checkKokoroStatus, initializeKokoro]);

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
};
