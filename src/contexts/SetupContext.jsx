/**
 * SetupContext - Manages first-time setup wizard state
 * 
 * Handles setup flow progression, data persistence, and step completion tracking.
 * Setup state persists in storage so users can resume after page refresh.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import StorageServiceProxy from '../services/proxies/StorageServiceProxy';
import Logger from '../services/LoggerService';

const SetupContext = createContext(null);

export const useSetup = () => {
  const context = useContext(SetupContext);
  if (!context) {
    throw new Error('useSetup must be used within a SetupProvider');
  }
  return context;
};

/**
 * Total number of setup steps
 */
const TOTAL_STEPS = 5; // Reduced from 6 - Tutorial step disabled (no GIFs yet)

/**
 * Default setup state
 */
const DEFAULT_SETUP_STATE = {
  setupCompleted: false,
  currentStep: 1,
  completedSteps: [],
  setupData: {
    llm: {
      provider: 'chrome-ai',
      chromeAi: {
        enableImageSupport: true,
        enableAudioSupport: true,
      },
      openai: {
        apiKey: '',
        model: 'gpt-4o-mini',
      },
      ollama: {
        endpoint: 'http://localhost:11434',
        model: 'llama3.2',
      },
    },
    
    tts: {
      enabled: false,
      provider: 'kokoro',
      kokoro: {
        voice: 'af_heart',
        speed: 1.0,
        device: 'auto',
      },
      openai: {
        apiKey: '',
        voice: 'nova',
      },
      'openai-compatible': {
        endpoint: 'http://localhost:8000',
        apiKey: '',
        model: 'tts',
        voice: 'default',
        speed: 1.0,
      },
    },
    
    sttConfig: {
      chromeAi: {
        temperature: 0.1,
        topK: 3,
        outputLanguage: 'en',
      },
      openai: {
        apiKey: '',
        model: 'whisper-1',
        language: 'en',
        temperature: 0,
      },
      'openai-compatible': {
        endpoint: 'http://localhost:8000',
        apiKey: '',
        model: 'whisper',
        language: 'en',
        temperature: 0,
      },
    },
    
    stt: {
      enabled: false,
      provider: 'chrome-ai-multimodal',
    },
    
    aiFeatures: {
      translator: { enabled: true },
      languageDetector: { enabled: true },
      summarizer: { enabled: true },
      rewriter: { enabled: true },
      writer: { enabled: true },
    },
    
    ui: {
      enableModelLoading: true,
      enablePortraitMode: false,
      position: 'bottom-right',
      enableAIToolbar: true,
    },
  },
};

export function SetupProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true);
  const [setupState, setSetupState] = useState({
    ...DEFAULT_SETUP_STATE,
    setupCompleted: true, // Default to true - will be overridden by actual loaded state
  });
  const initialLoadRef = useRef(false);

  useEffect(() => {
    const loadSetupState = async () => {
      try {
        // Retry logic for extension mode where bridge might not be ready immediately
        let retries = 0;
        const maxRetries = 3;
        let savedState = null;
        
        while (retries < maxRetries) {
          try {
            savedState = await StorageServiceProxy.configLoad('setupState', DEFAULT_SETUP_STATE);
            
            // Validate loaded state - if it looks corrupted, reject it
            if (savedState && typeof savedState === 'object') {
              const hasSetupFields = 'setupCompleted' in savedState && 'currentStep' in savedState;
              const hasUIConfigFields = 'theme' in savedState || 'position' in savedState || 'enableModelLoading' in savedState;
              
              if (hasUIConfigFields && !hasSetupFields) {
                Logger.error('SetupContext', 'CORRUPTED DATA DETECTED: setupState contains uiConfig fields!', savedState);
                savedState = { ...DEFAULT_SETUP_STATE, setupCompleted: true };
              }
            }
            
            Logger.log('SetupContext', 'Loaded setup state from storage:', savedState);
            break; // Success - exit retry loop
          } catch (error) {
            retries++;
            if (retries < maxRetries) {
              Logger.warn('SetupContext', `Failed to load setup state (attempt ${retries}/${maxRetries}), retrying...`, error.message);
              // Wait before retrying (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retries - 1)));
            } else {
              Logger.error('SetupContext', 'Failed to load setup state after all retries:', error);
              // If loading fails, assume setup is complete (safer than forcing re-setup)
              savedState = { ...DEFAULT_SETUP_STATE, setupCompleted: true };
            }
          }
        }
        
        setSetupState(savedState);
      } catch (error) {
        Logger.error('SetupContext', 'Unexpected error in loadSetupState:', error);
        // If loading fails, assume setup is complete (safer than forcing re-setup)
        setSetupState({ ...DEFAULT_SETUP_STATE, setupCompleted: true });
      } finally {
        setIsLoading(false);
        initialLoadRef.current = true;
      }
    };

    loadSetupState();
  }, []);

  useEffect(() => {
    if (!initialLoadRef.current) return;

    const timeoutId = setTimeout(async () => {
      try {
        Logger.log('SetupContext', 'Saving setup state to storage:', setupState);
        await StorageServiceProxy.configSave('setupState', setupState);
        Logger.log('SetupContext', 'Setup state saved successfully');
      } catch (error) {
        Logger.error('SetupContext', 'Failed to save setup state:', error);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [setupState]);

  /**
   * Navigate to a specific step
   */
  const goToStep = useCallback((step) => {
    if (step >= 1 && step <= TOTAL_STEPS) {
      setSetupState(prev => ({
        ...prev,
        currentStep: step,
      }));
    }
  }, []);

  /**
   * Go to next step
   */
  const nextStep = useCallback(() => {
    setSetupState(prev => {
      const currentStep = prev?.currentStep ?? 1;
      Logger.log('SetupContext', 'nextStep called - current:', currentStep, 'going to:', currentStep + 1);
      if (currentStep < TOTAL_STEPS) {
        return {
          ...prev,
          currentStep: currentStep + 1,
        };
      }
      return prev;
    });
  }, []);

  /**
   * Go to previous step
   */
  const previousStep = useCallback(() => {
    setSetupState(prev => {
      const currentStep = prev?.currentStep ?? 1;
      Logger.log('SetupContext', 'previousStep called - current:', currentStep, 'going to:', currentStep - 1);
      if (currentStep > 1) {
        return {
          ...prev,
          currentStep: currentStep - 1,
        };
      }
      return prev;
    });
  }, []);

  /**
   * Mark current step as completed
   */
  const markStepComplete = useCallback(() => {
    setSetupState(prev => {
      const step = prev.currentStep;
      if (!prev.completedSteps.includes(step)) {
        return {
          ...prev,
          completedSteps: [...prev.completedSteps, step].sort((a, b) => a - b),
        };
      }
      return prev;
    });
  }, []);

  /**
   * Update setup data and save to storage
   */
  const updateSetupData = useCallback(async (pathOrData, value) => {
    setSetupState(prev => {
      const updated = { ...prev };
      
      if (typeof pathOrData === 'object' && pathOrData !== null && value === undefined) {
        updated.setupData = {
          ...updated.setupData,
          ...pathOrData
        };
      } else {
        const parts = pathOrData.split('.');
        let current = updated.setupData;
        
        for (let i = 0; i < parts.length - 1; i++) {
          current[parts[i]] = { ...current[parts[i]] };
          current = current[parts[i]];
        }
        
        current[parts[parts.length - 1]] = value;
      }
      
      StorageServiceProxy.configSave('setupState', updated).catch(err => {
        Logger.error('SetupContext', 'Failed to save setupState:', err);
      });
      
      return updated;
    });
  }, []);

  /**
   * Complete setup and save all configurations
   */
  const completeSetup = useCallback(async () => {
    try {
      Logger.log('SetupContext', 'Completing setup with data:', setupState.setupData);
      
      const aiConfig = {
        provider: setupState.setupData.llm?.provider || 'chrome-ai',
        chromeAi: {
          temperature: 1.0,
          topK: 3,
          outputLanguage: 'en',
          enableImageSupport: setupState.setupData.llm?.chromeAi?.enableImageSupport ?? true,
          enableAudioSupport: setupState.setupData.llm?.chromeAi?.enableAudioSupport ?? true,
          systemPromptType: 'default',
          systemPrompt: '',
        },
        openai: {
          apiKey: setupState.setupData.llm?.openai?.apiKey || '',
          model: setupState.setupData.llm?.openai?.model || 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 2000,
          enableImageSupport: true,
          enableAudioSupport: true,
          systemPromptType: 'default',
          systemPrompt: '',
        },
        ollama: {
          endpoint: setupState.setupData.llm?.ollama?.endpoint || 'http://localhost:11434',
          model: setupState.setupData.llm?.ollama?.model || 'llama3.2',
          temperature: 0.7,
          maxTokens: 2000,
          enableImageSupport: true,
          enableAudioSupport: true,
          systemPromptType: 'default',
          systemPrompt: '',
        },
        aiFeatures: setupState.setupData.aiFeatures || {
          translator: { enabled: true, defaultTargetLanguage: 'en' },
          languageDetector: { enabled: true },
          summarizer: { enabled: true, defaultType: 'tldr', defaultFormat: 'plain-text', defaultLength: 'medium' },
          rewriter: { enabled: true, defaultTone: 'as-is', defaultFormat: 'as-is', defaultLength: 'as-is' },
          writer: { enabled: true, defaultTone: 'neutral', defaultFormat: 'plain-text', defaultLength: 'medium' },
        },
      };
      Logger.log('SetupContext', 'Saving aiConfig:', aiConfig);
      await StorageServiceProxy.configSave('aiConfig', aiConfig);
      
      const ttsConfig = {
        enabled: setupState.setupData.tts?.enabled ?? false,
        provider: setupState.setupData.tts?.provider || 'kokoro',
        kokoro: {
          modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
          voice: setupState.setupData.tts?.kokoro?.voice || 'af_heart',
          speed: setupState.setupData.tts?.kokoro?.speed || 1.0,
          device: setupState.setupData.tts?.kokoro?.device || 'auto',
          keepModelLoaded: true,
        },
        openai: {
          apiKey: setupState.setupData.tts?.openai?.apiKey || '',
          model: 'tts-1',
          voice: setupState.setupData.tts?.openai?.voice || 'nova',
          speed: 1.0,
        },
        'openai-compatible': {
          endpoint: setupState.setupData.tts?.['openai-compatible']?.endpoint || 'http://localhost:8000',
          apiKey: setupState.setupData.tts?.['openai-compatible']?.apiKey || '',
          model: setupState.setupData.tts?.['openai-compatible']?.model || 'tts',
          voice: setupState.setupData.tts?.['openai-compatible']?.voice || 'default',
          speed: setupState.setupData.tts?.['openai-compatible']?.speed || 1.0,
        },
        chunkSize: 500,
        minChunkSize: 100,
      };
      Logger.log('SetupContext', 'Saving ttsConfig:', ttsConfig);
      await StorageServiceProxy.configSave('ttsConfig', ttsConfig);
      
      const sttConfig = {
        enabled: setupState.setupData.stt?.enabled ?? false,
        provider: setupState.setupData.stt?.provider || 'chrome-ai-multimodal',
        'chrome-ai-multimodal': {
          temperature: setupState.setupData.sttConfig?.chromeAi?.temperature || 0.1,
          topK: setupState.setupData.sttConfig?.chromeAi?.topK || 3,
          outputLanguage: setupState.setupData.sttConfig?.chromeAi?.outputLanguage || 'en',
        },
        openai: {
          apiKey: setupState.setupData.sttConfig?.openai?.apiKey || '',
          model: 'whisper-1',
          language: setupState.setupData.sttConfig?.openai?.language || 'en',
          temperature: 0,
        },
        'openai-compatible': {
          endpoint: setupState.setupData.sttConfig?.['openai-compatible']?.endpoint || 'http://localhost:8000',
          apiKey: setupState.setupData.sttConfig?.['openai-compatible']?.apiKey || '',
          model: 'whisper',
          language: setupState.setupData.sttConfig?.['openai-compatible']?.language || 'en',
          temperature: 0,
        },
        recordingFormat: 'webm',
        maxRecordingDuration: 60,
        audioDeviceSwitchDelay: 300,
      };
      Logger.log('SetupContext', 'Saving sttConfig:', sttConfig);
      await StorageServiceProxy.configSave('sttConfig', sttConfig);
      
      const uiConfig = {
        enableModelLoading: setupState.setupData.ui?.enableModelLoading ?? true,
        enablePortraitMode: setupState.setupData.ui?.enablePortraitMode ?? false,
        enablePhysics: true,
        fpsLimit: 60,
        position: {
          preset: setupState.setupData.ui?.position || 'bottom-right',
          custom: { x: 0, y: 0 },
        },
        enableAIToolbar: setupState.setupData.ui?.enableAIToolbar ?? true,
        enableChatHistory: true,
        enableVoiceInput: false,
        theme: 'dark',
      };
      Logger.log('SetupContext', 'Saving uiConfig:', uiConfig);
      await StorageServiceProxy.configSave('uiConfig', uiConfig);
      
      // Create proper setup state structure (not corrupted with uiConfig!)
      const completedState = {
        setupCompleted: true,
        currentStep: TOTAL_STEPS,
        completedSteps: Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1),
        setupData: setupState.setupData, // Keep the actual setup data
      };
      setSetupState(completedState);
      
      Logger.log('SetupContext', 'Setup completed successfully - waiting for auto-save before reload...');
      
      // Wait for auto-save to complete (auto-save has 500ms debounce + save time)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      window.location.reload();
      
    } catch (error) {
      Logger.error('SetupContext', 'Failed to complete setup:', error);
      throw error;
    }
  }, [setupState]);

  /**
   * Reset setup and start over
   */
  const resetSetup = useCallback(async () => {
    try {
      Logger.log('SetupContext', 'Resetting setup...');
      
      setSetupState(DEFAULT_SETUP_STATE);
      await StorageServiceProxy.configSave('setupState', DEFAULT_SETUP_STATE);
      
      Logger.log('SetupContext', 'Setup reset complete');
    } catch (error) {
      Logger.error('SetupContext', 'Failed to reset setup:', error);
      throw error;
    }
  }, []);

  const value = {
    isLoading,
    setupCompleted: setupState.setupCompleted,
    currentStep: setupState.currentStep,
    completedSteps: setupState.completedSteps,
    setupData: setupState.setupData,
    totalSteps: TOTAL_STEPS,
    
    goToStep,
    nextStep,
    previousStep,
    markStepComplete,
    updateSetupData,
    completeSetup,
    resetSetup,
  };

  return (
    <SetupContext.Provider value={value}>
      {children}
    </SetupContext.Provider>
  );
}

export default SetupContext;
