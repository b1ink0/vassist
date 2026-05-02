/**
 * ConfigContext
 * Centralized configuration state management for all settings
 * Provides UI, LLM (AI), TTS, and STT configurations to all components
 * Auto-saves all config changes after a short delay
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { 
  AIServiceProxy, 
  TTSServiceProxy, 
  STTServiceProxy, 
  StorageServiceProxy,
  TranslatorServiceProxy,
  LanguageDetectorServiceProxy,
  SummarizerServiceProxy,
  RewriterServiceProxy,
  WriterServiceProxy
} from '../services/proxies';
import { 
  AIProviders,
  type AIConfig,
  type TTSConfig,
  type STTConfig,
  DefaultAIConfig, 
  DefaultTTSConfig, 
  DefaultSTTConfig, 
  TTSProviders,
  STTProviders,
  validateAIConfig, 
  validateTTSConfig, 
  validateSTTConfig 
} from '../config/aiConfig';
import { DefaultUIConfig, type UIConfig } from '../config/uiConfig';
import Logger from '../services/LoggerService';
import { useDesktop } from './DesktopContext';
import { isDesktop } from '../utils/PlatformUtils';
import { createDebouncedFunction, type DebouncedFunction } from '../utils/debounce';

interface ChromeAiStatus {
  checking: boolean;
  available: boolean;
  state: string | null;
  message: string;
  details: string;
  progress: number;
  downloading: boolean;
  requiresFlags?: boolean;
  flags?: unknown;
}

interface KokoroStatus {
  checking: boolean;
  initialized: boolean;
  preInitializing: boolean;
  state: 'notInitialized' | 'downloading' | 'ready' | 'error';
  message: string;
  details: string;
  progress: number;
  downloading: boolean;
}

interface DesktopBackendStatus {
  success?: boolean;
  selectedInstalled?: boolean;
}

interface DesktopServerStartResult {
  success?: boolean;
  error?: string;
}

interface KokoroServiceStatus {
  initialized?: boolean;
  initializing?: boolean;
  message?: string;
  details?: string;
  config?: {
    device?: string;
  };
}

interface KokoroDownloadProgress {
  percent?: number;
  file?: string;
}

interface ChromeAvailabilityStatus {
  available: boolean;
  state: string;
  message: string;
  details: string;
  progress?: number;
  requiresFlags?: boolean;
  flags?: unknown;
}

interface ChromeDownloadProgress {
  progress?: number;
  details?: string;
}

interface ChromeDownloadResult {
  success?: boolean;
  message?: string;
  details?: string;
}

interface ConfigUpdateOptions {
  debounceMs?: number;
}

interface ConfigPathDebouncer {
  delayMs: number;
  debounced: DebouncedFunction<[unknown]>;
}

interface ConfigContextValue {
  isConfigLoading: boolean;
  uiConfig: UIConfig;
  uiConfigSaved: boolean;
  uiConfigError: string;
  updateUIConfig: (path: string, value: unknown, options?: ConfigUpdateOptions) => void;
  saveUIConfig: () => Promise<void>;
  aiConfig: AIConfig;
  aiConfigSaved: boolean;
  aiConfigError: string;
  aiTesting: boolean;
  updateAIConfig: (path: string, value: unknown, options?: ConfigUpdateOptions) => void;
  saveAIConfig: () => Promise<void>;
  testAIConnection: () => Promise<void>;
  clearAIConfigError: () => void;
  testTranslator: (text: string, sourceLanguage: string, targetLanguage: string) => Promise<unknown>;
  testLanguageDetector: (text: string) => Promise<unknown>;
  testSummarizer: (text: string, options?: Record<string, unknown>) => Promise<unknown>;
  testRewriter: (text: string) => Promise<unknown>;
  testWriter: (prompt: string, options?: Record<string, unknown>) => Promise<unknown>;
  ttsConfig: TTSConfig;
  ttsConfigSaved: boolean;
  ttsConfigError: string;
  ttsTesting: boolean;
  updateTTSConfig: (path: string, value: unknown, options?: ConfigUpdateOptions) => void;
  saveTTSConfig: () => Promise<void>;
  testTTSConnection: (customText?: string | null) => Promise<void>;
  setTtsConfigError: (message: string) => void;
  clearTTSConfigError: () => void;
  sttConfig: STTConfig;
  sttConfigSaved: boolean;
  sttConfigError: string;
  sttTesting: boolean;
  updateSTTConfig: (path: string, value: unknown, options?: ConfigUpdateOptions) => void;
  saveSTTConfig: () => Promise<void>;
  testSTTRecording: (deviceId?: string | null) => Promise<void>;
  clearSTTConfigError: () => void;
  chromeAiStatus: ChromeAiStatus;
  checkChromeAIAvailability: () => Promise<unknown>;
  startChromeAIDownload: () => Promise<void>;
  kokoroStatus: KokoroStatus;
  checkKokoroStatus: (desiredDeviceOverride?: string | null) => Promise<unknown>;
  initializeKokoro: () => Promise<unknown>;
}

interface ConfigProviderProps {
  children: ReactNode;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const setConfigValueAtPath = <T extends object>(config: T, path: string, value: unknown): T => {
  const updated = { ...(config as Record<string, unknown>) };
  const parts = path.split('.');
  let current: Record<string, unknown> = updated;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!key) {
      continue;
    }
    const nextValue = current[key];
    if (nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue)) {
      current[key] = { ...(nextValue as Record<string, unknown>) };
    } else {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1];
  if (lastKey) {
    current[lastKey] = value;
  }
  return updated as T;
};

const normalizeAIConfig = (savedConfig: Partial<AIConfig> | null | undefined): AIConfig => ({
  ...DefaultAIConfig,
  ...(savedConfig ?? {}),
  remoteProfiles: Array.isArray(savedConfig?.remoteProfiles) ? savedConfig.remoteProfiles : DefaultAIConfig.remoteProfiles,
  chromeAi: {
    ...DefaultAIConfig.chromeAi,
    ...(savedConfig?.chromeAi ?? {}),
  },
  openai: {
    ...DefaultAIConfig.openai,
    ...(savedConfig?.openai ?? {}),
    routing: {
      ...DefaultAIConfig.openai.routing,
      ...(savedConfig?.openai?.routing ?? {}),
      visionModel: {
        ...DefaultAIConfig.openai.routing.visionModel,
        ...(savedConfig?.openai?.routing?.visionModel ?? {}),
      },
      routerModel: {
        ...DefaultAIConfig.openai.routing.routerModel,
        ...(savedConfig?.openai?.routing?.routerModel ?? {}),
      },
    },
  },
  ollama: {
    ...DefaultAIConfig.ollama,
    ...(savedConfig?.ollama ?? {}),
    routing: {
      ...DefaultAIConfig.ollama.routing,
      ...(savedConfig?.ollama?.routing ?? {}),
      visionModel: {
        ...DefaultAIConfig.ollama.routing.visionModel,
        ...(savedConfig?.ollama?.routing?.visionModel ?? {}),
      },
      routerModel: {
        ...DefaultAIConfig.ollama.routing.routerModel,
        ...(savedConfig?.ollama?.routing?.routerModel ?? {}),
      },
    },
  },
  'android-local': {
    ...DefaultAIConfig['android-local'],
    ...(savedConfig?.['android-local'] ?? {}),
    routing: {
      ...DefaultAIConfig['android-local'].routing,
      ...(savedConfig?.['android-local']?.routing ?? {}),
      visionModel: {
        ...DefaultAIConfig['android-local'].routing.visionModel,
        ...(savedConfig?.['android-local']?.routing?.visionModel ?? {}),
      },
      routerModel: {
        ...DefaultAIConfig['android-local'].routing.routerModel,
        ...(savedConfig?.['android-local']?.routing?.routerModel ?? {}),
      },
    },
  },
  'desktop-local': {
    ...DefaultAIConfig['desktop-local'],
    ...(savedConfig?.['desktop-local'] ?? {}),
    routing: {
      ...DefaultAIConfig['desktop-local'].routing,
      ...(savedConfig?.['desktop-local']?.routing ?? {}),
      visionModel: {
        ...DefaultAIConfig['desktop-local'].routing.visionModel,
        ...(savedConfig?.['desktop-local']?.routing?.visionModel ?? {}),
      },
      routerModel: {
        ...DefaultAIConfig['desktop-local'].routing.routerModel,
        ...(savedConfig?.['desktop-local']?.routing?.routerModel ?? {}),
      },
    },
  },
  aiFeatures: {
    ...DefaultAIConfig.aiFeatures,
    ...(savedConfig?.aiFeatures ?? {}),
    translator: {
      ...DefaultAIConfig.aiFeatures.translator,
      ...(savedConfig?.aiFeatures?.translator ?? {}),
    },
    languageDetector: {
      ...DefaultAIConfig.aiFeatures.languageDetector,
      ...(savedConfig?.aiFeatures?.languageDetector ?? {}),
    },
    summarizer: {
      ...DefaultAIConfig.aiFeatures.summarizer,
      ...(savedConfig?.aiFeatures?.summarizer ?? {}),
    },
    rewriter: {
      ...DefaultAIConfig.aiFeatures.rewriter,
      ...(savedConfig?.aiFeatures?.rewriter ?? {}),
    },
    writer: {
      ...DefaultAIConfig.aiFeatures.writer,
      ...(savedConfig?.aiFeatures?.writer ?? {}),
    },
  },
});

const normalizeTTSConfig = (savedConfig: Partial<TTSConfig> | null | undefined): TTSConfig => ({
  ...DefaultTTSConfig,
  ...(savedConfig ?? {}),
  remoteProfiles: Array.isArray(savedConfig?.remoteProfiles) ? savedConfig.remoteProfiles : DefaultTTSConfig.remoteProfiles,
  kokoro: {
    ...DefaultTTSConfig.kokoro,
    ...(savedConfig?.kokoro ?? {}),
  },
  openai: {
    ...DefaultTTSConfig.openai,
    ...(savedConfig?.openai ?? {}),
  },
  'openai-compatible': {
    ...DefaultTTSConfig['openai-compatible'],
    ...(savedConfig?.['openai-compatible'] ?? {}),
  },
  'android-local': {
    ...DefaultTTSConfig['android-local'],
    ...(savedConfig?.['android-local'] ?? {}),
  },
  'desktop-local': {
    ...DefaultTTSConfig['desktop-local'],
    ...(savedConfig?.['desktop-local'] ?? {}),
  },
  'gptsovits-remote': {
    ...DefaultTTSConfig['gptsovits-remote'],
    ...(savedConfig?.['gptsovits-remote'] ?? {}),
  },
});

const normalizeSTTConfig = (savedConfig: Partial<STTConfig> | null | undefined): STTConfig => ({
  ...DefaultSTTConfig,
  ...(savedConfig ?? {}),
  remoteProfiles: Array.isArray(savedConfig?.remoteProfiles) ? savedConfig.remoteProfiles : DefaultSTTConfig.remoteProfiles,
  'chrome-ai-multimodal': {
    ...DefaultSTTConfig['chrome-ai-multimodal'],
    ...(savedConfig?.['chrome-ai-multimodal'] ?? {}),
  },
  openai: {
    ...DefaultSTTConfig.openai,
    ...(savedConfig?.openai ?? {}),
  },
  'openai-compatible': {
    ...DefaultSTTConfig['openai-compatible'],
    ...(savedConfig?.['openai-compatible'] ?? {}),
  },
  'android-local': {
    ...DefaultSTTConfig['android-local'],
    ...(savedConfig?.['android-local'] ?? {}),
  },
  'desktop-local': {
    ...DefaultSTTConfig['desktop-local'],
    ...(savedConfig?.['desktop-local'] ?? {}),
  },
});

const ConfigContext = createContext<ConfigContextValue | null>(null);

export const useConfig = (): ConfigContextValue => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within ConfigProvider');
  }
  return context;
};

export const ConfigProvider = ({ children }: ConfigProviderProps) => {
  const { api } = useDesktop();
  const initialLoadRef = useRef(true);
  const [isConfigLoading, setIsConfigLoading] = useState(true);

  // Auto-save timeout refs for debouncing
  const aiSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sttSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiUpdateDebouncersRef = useRef<Record<string, ConfigPathDebouncer>>({});
  const ttsUpdateDebouncersRef = useRef<Record<string, ConfigPathDebouncer>>({});
  const sttUpdateDebouncersRef = useRef<Record<string, ConfigPathDebouncer>>({});
  const uiUpdateDebouncersRef = useRef<Record<string, ConfigPathDebouncer>>({});

  // UI Config
  const [uiConfig, setUiConfig] = useState<UIConfig>(DefaultUIConfig);
  const [uiConfigSaved, setUiConfigSaved] = useState(false);
  const [uiConfigError, setUiConfigError] = useState('');

  // AI (LLM) Config
  const [aiConfig, setAiConfig] = useState<AIConfig>(DefaultAIConfig);
  const [aiConfigSaved, setAiConfigSaved] = useState(false);
  const [aiConfigError, setAiConfigError] = useState('');
  const [aiTesting, setAiTesting] = useState(false);

  // TTS Config
  const [ttsConfig, setTtsConfig] = useState<TTSConfig>(DefaultTTSConfig);
  const [ttsConfigSaved, setTtsConfigSaved] = useState(false);
  const [ttsConfigError, setTtsConfigError] = useState('');
  const [ttsTesting, setTtsTesting] = useState(false);

  // STT Config
  const [sttConfig, setSttConfig] = useState<STTConfig>(DefaultSTTConfig);
  const [sttConfigSaved, setSttConfigSaved] = useState(false);
  const [sttConfigError, setSttConfigError] = useState('');
  const [sttTesting, setSttTesting] = useState(false);

  // Chrome AI Status
  const [chromeAiStatus, setChromeAiStatus] = useState<ChromeAiStatus>({
    checking: false,
    available: false,
    state: null,
    message: '',
    details: '',
    progress: 0,
    downloading: false,
  });

  // Kokoro TTS Status
  const [kokoroStatus, setKokoroStatus] = useState<KokoroStatus>({
    checking: false,
    initialized: false,
    preInitializing: false, // Pre-initialization before scene loads
    state: 'notInitialized', // 'notInitialized' | 'downloading' | 'ready' | 'error'
    message: '',
    details: '',
    progress: 0,
    downloading: false,
  });

  const scheduleConfigPathUpdate = useCallback(<T extends object>(
    setState: React.Dispatch<React.SetStateAction<T>>,
    debouncersRef: React.MutableRefObject<Record<string, ConfigPathDebouncer>>,
    path: string,
    value: unknown,
    options?: ConfigUpdateOptions,
  ) => {
    const debounceMs = Math.max(0, options?.debounceMs ?? 0);
    const existingDebouncer = debouncersRef.current[path];

    if (debounceMs === 0) {
      if (existingDebouncer) {
        existingDebouncer.debounced.cancel();
        delete debouncersRef.current[path];
      }
      setState((prev) => setConfigValueAtPath(prev, path, value));
      return;
    }

    if (existingDebouncer && existingDebouncer.delayMs !== debounceMs) {
      existingDebouncer.debounced.cancel();
      delete debouncersRef.current[path];
    }

    if (!debouncersRef.current[path]) {
      const debounced = createDebouncedFunction((nextValue: unknown) => {
        setState((prev) => setConfigValueAtPath(prev, path, nextValue));
      }, debounceMs);

      debouncersRef.current[path] = {
        delayMs: debounceMs,
        debounced,
      };
    }

    debouncersRef.current[path].debounced(value);
  }, []);

  useEffect(() => {
    return () => {
      [aiUpdateDebouncersRef, ttsUpdateDebouncersRef, sttUpdateDebouncersRef, uiUpdateDebouncersRef].forEach((debouncersRef) => {
        Object.values(debouncersRef.current).forEach((item) => item.debounced.cancel());
        debouncersRef.current = {};
      });
    };
  }, []);

  const syncDesktopServerForProviders = useCallback(async (nextAiConfig: AIConfig, nextTtsConfig: TTSConfig, nextSttConfig: STTConfig) => {
    if (!isDesktop || !api?.server) {
      return;
    }

    const llmUsesDesktopLocal = nextAiConfig?.provider === AIProviders.DESKTOP_LOCAL;
    const ttsUsesDesktopLocal = nextTtsConfig?.provider === TTSProviders.DESKTOP_LOCAL;
    const sttUsesDesktopLocal = nextSttConfig?.provider === STTProviders.DESKTOP_LOCAL;
    const needsDesktopProxy = llmUsesDesktopLocal || ttsUsesDesktopLocal || sttUsesDesktopLocal;

    if (!needsDesktopProxy) {
      try {
        await api.server.stop();
        Logger.log('ConfigContext', 'Desktop proxy server stopped (no desktop-local providers active)');
      } catch (error) {
        Logger.warn('ConfigContext', 'Desktop proxy stop skipped/failed:', error);
      }
      return;
    }

    // Reuse desktop-local config for shared proxy behavior even when LLM provider is not desktop-local.
    const desktopLlmConfig = nextAiConfig?.['desktop-local'] || {};
    const desktopSttConfig = nextSttConfig?.['desktop-local'] || {};

    let canStartServer = true;
    if (llmUsesDesktopLocal && api?.llm?.getBackendStatus && desktopLlmConfig.backend && desktopLlmConfig.backend !== 'auto') {
      try {
        const backendStatus = await api.llm.getBackendStatus(desktopLlmConfig.backend) as DesktopBackendStatus;
        if (backendStatus?.success && !backendStatus.selectedInstalled) {
          canStartServer = false;
          Logger.warn('ConfigContext', `Desktop proxy start deferred: backend ${desktopLlmConfig.backend} is not installed yet`);
        }
      } catch (error) {
        Logger.warn('ConfigContext', 'Failed to verify backend status before desktop proxy start:', error);
      }
    }

    if (!canStartServer) {
      return;
    }

    try {
      const result = await api.server.start({
        ...desktopLlmConfig,
        stt: {
          model: desktopSttConfig.model,
          language: desktopSttConfig.language,
        },
        tts: {
          enabled: Boolean(nextTtsConfig?.enabled && ttsUsesDesktopLocal),
        },
      }) as DesktopServerStartResult;
      if (result?.success) {
        Logger.log('ConfigContext', 'Desktop proxy server started/updated:', {
          llmUsesDesktopLocal,
          ttsUsesDesktopLocal,
          sttUsesDesktopLocal,
        });
      } else {
        Logger.error('ConfigContext', 'Failed to start desktop proxy server:', result?.error || result);
      }
    } catch (error) {
      Logger.error('ConfigContext', 'Error starting desktop proxy server:', error);
    }
  }, [api]);

  // Load all configs on mount
  useEffect(() => {
    const loadConfigs = async () => {
      let savedAiConfig: AIConfig = DefaultAIConfig;
      let savedTtsConfig: TTSConfig = DefaultTTSConfig;
      let savedSttConfig: STTConfig = DefaultSTTConfig;
      try {
        // Load UI config and merge with defaults to ensure all fields exist
        const savedUiConfig = (await StorageServiceProxy.configLoad('uiConfig')) as Partial<UIConfig> | null;
        const mergedUiConfig = { ...DefaultUIConfig, ...(savedUiConfig ?? {}) };
        setUiConfig(mergedUiConfig);
        Logger.log('ConfigContext', 'UI config loaded:', mergedUiConfig);

        // Load AI config
        savedAiConfig = normalizeAIConfig((await StorageServiceProxy.configLoad('aiConfig')) as Partial<AIConfig> | null);
        setAiConfig(savedAiConfig);
        try {
          if (savedAiConfig.provider) {
            await AIServiceProxy.configure(savedAiConfig);
            Logger.log('ConfigContext', 'AI Service configured');
          } else {
            Logger.log('ConfigContext', 'Skipping AI Service configuration - no provider set');
          }
          
          // Configure AI Features services if enabled
          if (savedAiConfig.aiFeatures?.translator?.enabled) {
            await TranslatorServiceProxy.configure(savedAiConfig);
            Logger.log('ConfigContext', 'Translator Service configured');
          }
          if (savedAiConfig.aiFeatures?.languageDetector?.enabled) {
            await LanguageDetectorServiceProxy.configure(savedAiConfig);
            Logger.log('ConfigContext', 'Language Detector Service configured');
          }
          if (savedAiConfig.aiFeatures?.summarizer?.enabled) {
            await SummarizerServiceProxy.configure(savedAiConfig);
            Logger.log('ConfigContext', 'Summarizer Service configured');
          }
          if (savedAiConfig.aiFeatures?.rewriter?.enabled) {
            await RewriterServiceProxy.configure(savedAiConfig);
            Logger.log('ConfigContext', 'Rewriter Service configured');
          }
          if (savedAiConfig.aiFeatures?.writer?.enabled) {
            await WriterServiceProxy.configure(savedAiConfig);
            Logger.log('ConfigContext', 'Writer Service configured');
          }
        } catch (error) {
          Logger.warn('ConfigContext', 'Failed to configure AI Service:', error);
        }

        // Load TTS config
        savedTtsConfig = normalizeTTSConfig((await StorageServiceProxy.configLoad('ttsConfig')) as Partial<TTSConfig> | null);
        
        Logger.log('ConfigContext', 'TTS config loaded from storage');
        setTtsConfig(savedTtsConfig);
        try {
          TTSServiceProxy.configure(savedTtsConfig);
          Logger.log('ConfigContext', 'TTS Service configured');
        } catch (error) {
          Logger.warn('ConfigContext', 'Failed to configure TTS Service:', error);
        }

        // Load STT config
        savedSttConfig = normalizeSTTConfig((await StorageServiceProxy.configLoad('sttConfig')) as Partial<STTConfig> | null);
        setSttConfig(savedSttConfig);
        try {
          STTServiceProxy.configure(savedSttConfig);
          Logger.log('ConfigContext', 'STT Service configured');
        } catch (error) {
          Logger.warn('ConfigContext', 'Failed to configure STT Service:', error);
        }
      } catch (error) {
        Logger.error('ConfigContext', 'Failed to load configs:', error);
      } finally {
        // Mark loading as complete
        setIsConfigLoading(false);
        // Allow auto-save after initial load
        setTimeout(() => {
          initialLoadRef.current = false;
        }, 100);

        await syncDesktopServerForProviders(savedAiConfig, savedTtsConfig, savedSttConfig);
      }
    };

    loadConfigs();
  }, [syncDesktopServerForProviders]);

  useEffect(() => {
    if (initialLoadRef.current) {
      return;
    }

    syncDesktopServerForProviders(aiConfig, ttsConfig, sttConfig);
  }, [aiConfig, ttsConfig, sttConfig, syncDesktopServerForProviders]);

  useEffect(() => {
    const port = Number(aiConfig?.['desktop-local']?.serverPort || 11438);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return;
    }

    const sharedEndpoint = `http://127.0.0.1:${port}`;

    if (aiConfig?.['desktop-local']?.endpoint !== sharedEndpoint) {
      setAiConfig((prev) => ({
        ...prev,
        'desktop-local': {
          ...(prev['desktop-local'] || {}),
          endpoint: sharedEndpoint,
        },
      }));
    }

    if (ttsConfig?.['desktop-local']?.endpoint !== sharedEndpoint) {
      setTtsConfig((prev) => ({
        ...prev,
        'desktop-local': {
          ...(prev['desktop-local'] || {}),
          endpoint: sharedEndpoint,
        },
      }));
    }

    if (sttConfig?.['desktop-local']?.endpoint !== sharedEndpoint) {
      setSttConfig((prev) => ({
        ...prev,
        'desktop-local': {
          ...(prev['desktop-local'] || {}),
          endpoint: sharedEndpoint,
        },
      }));
    }
  }, [aiConfig, ttsConfig, sttConfig]);

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
        await AIServiceProxy.configure(aiConfig);
        
        // Configure AI Features services
        if (aiConfig.aiFeatures?.translator?.enabled) {
          await TranslatorServiceProxy.configure(aiConfig);
        }
        if (aiConfig.aiFeatures?.languageDetector?.enabled) {
          await LanguageDetectorServiceProxy.configure(aiConfig);
        }
        if (aiConfig.aiFeatures?.summarizer?.enabled) {
          await SummarizerServiceProxy.configure(aiConfig);
        }
        if (aiConfig.aiFeatures?.rewriter?.enabled) {
          await RewriterServiceProxy.configure(aiConfig);
        }
        if (aiConfig.aiFeatures?.writer?.enabled) {
          await WriterServiceProxy.configure(aiConfig);
        }
        
        // Notify other contexts about config change
        window.dispatchEvent(new CustomEvent('vassist-config-updated', {
          detail: { type: 'aiConfig', config: aiConfig }
        }));
        
        setTimeout(() => setAiConfigSaved(false), 2000);
        Logger.log('ConfigContext', 'AI config auto-saved');
      } catch (error) {
        Logger.error('ConfigContext', 'AI config auto-save failed:', error);
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
        await StorageServiceProxy.configSave('ttsConfig', ttsConfig);
        setTtsConfigSaved(true);
        TTSServiceProxy.configure(ttsConfig);
        setTimeout(() => setTtsConfigSaved(false), 2000);
        Logger.log('ConfigContext', 'TTS config auto-saved successfully');
      } catch (error) {
        Logger.error('ConfigContext', 'TTS config auto-save failed:', error);
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
      
      try {
        await StorageServiceProxy.configSave('sttConfig', sttConfig);
        setSttConfigSaved(true);
        if (validation.valid) {
          setSttConfigError('');
          STTServiceProxy.configure(sttConfig);
        }
        setTimeout(() => setSttConfigSaved(false), 2000);
        Logger.log('ConfigContext', 'STT config auto-saved');
      } catch (error) {
        Logger.error('ConfigContext', 'STT config auto-save failed:', error);
        return;
      }

      if (!validation.valid) {
        setSttConfigError(validation.errors.join(', '));
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
        Logger.log('ConfigContext', 'UI config auto-saved');
      } catch (error) {
        Logger.error('ConfigContext', 'UI config auto-save failed:', error);
      }
    }, 500);
  }, [uiConfig]);

  // Mark initial load as complete after a short delay
  useEffect(() => {
    const timer = setTimeout(() => {
      initialLoadRef.current = false;
      Logger.log('ConfigContext', 'Initial load complete - auto-save enabled');
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // UI Config handlers
  const updateUIConfig = useCallback((path: string, value: unknown, options?: ConfigUpdateOptions) => {
    scheduleConfigPathUpdate(setUiConfig, uiUpdateDebouncersRef, path, value, options);
  }, [scheduleConfigPathUpdate]);

  const saveUIConfig = useCallback(async () => {
    try {
      await StorageServiceProxy.configSave('uiConfig', uiConfig);
      setUiConfigSaved(true);
      setUiConfigError('');
      
      // Notify other components
      window.dispatchEvent(new CustomEvent('uiConfigUpdated', { detail: uiConfig }));
      
      Logger.log('ConfigContext', 'UI config saved successfully');
      setTimeout(() => setUiConfigSaved(false), 2000);
    } catch (error) {
      setUiConfigError('Failed to save configuration: ' + getErrorMessage(error));
      Logger.error('ConfigContext', 'UI config save error:', error);
    }
  }, [uiConfig]);

  // AI Config handlers
  const updateAIConfig = useCallback((path: string, value: unknown, options?: ConfigUpdateOptions) => {
    scheduleConfigPathUpdate(setAiConfig, aiUpdateDebouncersRef, path, value, options);
  }, [scheduleConfigPathUpdate]);

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
        Logger.log('ConfigContext', 'AI Service configured successfully');
        
        // Configure AI Features services
        if (aiConfig.aiFeatures?.translator?.enabled) {
          await TranslatorServiceProxy.configure(aiConfig);
          Logger.log('ConfigContext', 'Translator Service configured');
        }
        if (aiConfig.aiFeatures?.languageDetector?.enabled) {
          await LanguageDetectorServiceProxy.configure(aiConfig);
          Logger.log('ConfigContext', 'Language Detector Service configured');
        }
        if (aiConfig.aiFeatures?.summarizer?.enabled) {
          await SummarizerServiceProxy.configure(aiConfig);
          Logger.log('ConfigContext', 'Summarizer Service configured');
        }
        if (aiConfig.aiFeatures?.rewriter?.enabled) {
          await RewriterServiceProxy.configure(aiConfig);
          Logger.log('ConfigContext', 'Rewriter Service configured');
        }
        if (aiConfig.aiFeatures?.writer?.enabled) {
          await WriterServiceProxy.configure(aiConfig);
          Logger.log('ConfigContext', 'Writer Service configured');
        }
        
        setTimeout(() => setAiConfigSaved(false), 2000);
      } catch (error) {
        setAiConfigError('Failed to configure AI service: ' + getErrorMessage(error));
        Logger.error('ConfigContext', 'AI configuration failed:', error);
      }
    } catch (error) {
      setAiConfigError('Failed to save configuration: ' + getErrorMessage(error));
      Logger.error('ConfigContext', 'AI config save error:', error);
    }
  }, [aiConfig]);

  const testAIConnection = useCallback(async () => {
    setAiConfigError('');
    setAiTesting(true);
    
    try {
      await AIServiceProxy.configure(aiConfig);
      setAiConfigError('hourglass:Testing connection...');
      await AIServiceProxy.testConnection();
      setAiConfigError('success:Connection successful!');
      setTimeout(() => setAiConfigError(''), 3000);
    } catch (error) {
      setAiConfigError('error-status:Connection failed:' + getErrorMessage(error));
    } finally {
      setAiTesting(false);
    }
  }, [aiConfig]);

  // TTS Config handlers
  const updateTTSConfig = useCallback((path: string, value: unknown, options?: ConfigUpdateOptions) => {
    scheduleConfigPathUpdate(setTtsConfig, ttsUpdateDebouncersRef, path, value, options);
  }, [scheduleConfigPathUpdate]);

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
        Logger.log('ConfigContext', 'TTS Service configured successfully');
        setTimeout(() => setTtsConfigSaved(false), 2000);
      } catch (error) {
        setTtsConfigError('Failed to configure TTS service: ' + getErrorMessage(error));
        Logger.error('ConfigContext', 'TTS configuration failed:', error);
      }
    } catch (error) {
      setTtsConfigError('Failed to save configuration: ' + getErrorMessage(error));
      Logger.error('ConfigContext', 'TTS config save error:', error);
    }
  }, [ttsConfig]);

  // Kokoro TTS Status handlers - Define BEFORE testTTSConnection since it depends on this
  const checkKokoroStatus = useCallback(async (desiredDeviceOverride: string | null = null) => {
    setKokoroStatus(prev => ({ ...prev, checking: true }));
    
    try {
      const status = await TTSServiceProxy.checkKokoroStatus() as KokoroServiceStatus;

      const desiredDevice = desiredDeviceOverride || ttsConfig.kokoro?.device || 'auto';
      const actualDevice = status.config?.device || null;
      const isInitializedWithCorrectDevice = Boolean(status.initialized) && actualDevice === desiredDevice;
      
      setKokoroStatus((prev) => ({
        ...prev,
        checking: false,
        initialized: isInitializedWithCorrectDevice,
        state: isInitializedWithCorrectDevice ? 'ready' : 'notInitialized',
        message: status.message || (isInitializedWithCorrectDevice ? 'Kokoro TTS is ready' : 'Not initialized'),
        details: status.details || '',
        progress: 0,
        downloading: false,
      }));
      
      Logger.log('ConfigContext', 'Kokoro status:', status);
      
      return { ...status, initialized: isInitializedWithCorrectDevice };
    } catch (error) {
      Logger.log('ConfigContext', 'Kokoro status check failed:', error);
      setKokoroStatus((prev) => ({
        ...prev,
        checking: false,
        initialized: false,
        state: 'error',
        message: 'Failed to check status',
        details: getErrorMessage(error),
        progress: 0,
        downloading: false,
      }));
      throw error;
    }
  }, [ttsConfig.kokoro?.device]);

  const initializeKokoro = useCallback(async () => {
    try {
      setKokoroStatus(prev => ({ ...prev, downloading: true, progress: 0, state: 'downloading' }));
      
      // Ensure TTS service is configured with current config before initializing
      Logger.log('ConfigContext', 'Initializing Kokoro with device:', ttsConfig.kokoro?.device, 'Full kokoro config:', ttsConfig.kokoro);
      await TTSServiceProxy.configure(ttsConfig);
      
      // Debounce progress updates to avoid UI thrashing
      let lastUpdateTime = 0;
      const progressDebounceMs = 100; // Update UI max every 100ms
      
      const initializeKokoroWithProgress = TTSServiceProxy.initializeKokoro as unknown as (onProgress: (progress: KokoroDownloadProgress) => void) => Promise<unknown>;
      const initialized = await initializeKokoroWithProgress((progress) => {
        // Handle progress updates with defensive checks for undefined values
        const percent = typeof progress.percent === 'number' ? progress.percent : 0;
        const file = progress.file || 'Downloading model...';
        
        // Debounce updates - only update if enough time has passed or it's 100%
        const now = Date.now();
        const shouldUpdate = (now - lastUpdateTime >= progressDebounceMs) || percent >= 99.9;
        
        if (shouldUpdate) {
          lastUpdateTime = now;
          
          Logger.log('ConfigContext', 'Kokoro download progress:', { 
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
      Logger.error('ConfigContext', 'Kokoro initialization failed:', error);
      setKokoroStatus(prev => ({ 
        ...prev, 
        downloading: false,
        state: 'error',
        message: 'Initialization failed',
        details: getErrorMessage(error),
      }));
      throw error;
    }
  }, [checkKokoroStatus, ttsConfig]);

  const testTTSConnection = useCallback(async (customText: string | null = null) => {
    setTtsConfigError('');
    setTtsTesting(true);
    
    const testText = customText || "Hello, this is a test of the text to speech system.";
    
    try {
      TTSServiceProxy.configure(ttsConfig);
      
      // For Kokoro (browser worker), check if initialized first and auto-initialize if needed
      if (ttsConfig.provider === TTSProviders.KOKORO) {
        setTtsConfigError('hourglass:Checking Kokoro status...');
        
        // Check current status
        const status = await TTSServiceProxy.checkKokoroStatus() as KokoroServiceStatus;
        
        if (!status.initialized) {
          // Auto-initialize if not initialized
          setTtsConfigError('hourglass:Initializing Kokoro model (first time may take a moment)...');
          Logger.log('ConfigContext', 'Auto-initializing Kokoro for test TTS');
          
          try {
            await initializeKokoro();
            // Check status again after initialization
            const newStatus = await TTSServiceProxy.checkKokoroStatus() as KokoroServiceStatus;
            if (!newStatus.initialized) {
              setTtsConfigError('error-status:Failed to initialize Kokoro model');
              setTtsTesting(false);
              return;
            }
          } catch (initError) {
            setTtsConfigError('error-status:Kokoro initialization failed:' + getErrorMessage(initError));
            setTtsTesting(false);
            return;
          }
        }
      }
      
      setTtsConfigError('hourglass:Testing TTS...');
      const startTime = Date.now();
      
      await TTSServiceProxy.testConnection(testText);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (ttsConfig.provider === TTSProviders.KOKORO) {
        setTtsConfigError(`✅ TTS test successful! Generated in ${duration}s using voice: ${ttsConfig.kokoro?.voice || 'default'}`);
      } else if (ttsConfig.provider === TTSProviders.ANDROID_LOCAL) {
        setTtsConfigError(`✅ Android TTS test successful! Generated in ${duration}s using voice: ${ttsConfig['android-local']?.voice || 'default'}`);
      } else {
        setTtsConfigError(`✅ TTS test successful! (${duration}s)`);
      }
      
      setTimeout(() => setTtsConfigError(''), 5000);
    } catch (error) {
      setTtsConfigError('error-status:TTS test failed:' + getErrorMessage(error));
    } finally {
      setTtsTesting(false);
    }
  }, [ttsConfig, initializeKokoro]);

  // STT Config handlers
  const updateSTTConfig = useCallback((path: string, value: unknown, options?: ConfigUpdateOptions) => {
    scheduleConfigPathUpdate(setSttConfig, sttUpdateDebouncersRef, path, value, options);
  }, [scheduleConfigPathUpdate]);

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
        Logger.log('ConfigContext', 'STT Service configured successfully');
        setTimeout(() => setSttConfigSaved(false), 2000);
      } catch (error) {
        setSttConfigError('Failed to configure STT service: ' + getErrorMessage(error));
        Logger.error('ConfigContext', 'STT configuration failed:', error);
      }
    } catch (error) {
      setSttConfigError('Failed to save configuration: ' + getErrorMessage(error));
      Logger.error('ConfigContext', 'STT config save error:', error);
    }
  }, [sttConfig]);

  const testSTTRecording = useCallback(async (deviceId: string | null = null) => {
    setSttConfigError('');
    setSttTesting(true);
    
    try {
      STTServiceProxy.configure(sttConfig);
      setSttConfigError('🎤 Recording for 3 seconds... Speak now!');
      
      const testRecordingWithDevice = STTServiceProxy.testRecording as unknown as (durationSeconds: number, selectedDeviceId?: string | null) => Promise<string>;
      const transcription = await testRecordingWithDevice(3, deviceId);
      
      setSttConfigError(`✅ Transcription: "${transcription}"`);
      setTimeout(() => setSttConfigError(''), 5000);
    } catch (error) {
      setSttConfigError('error-status:STT test failed: ' + getErrorMessage(error));
    } finally {
      setSttTesting(false);
    }
  }, [sttConfig]);

  // Chrome AI Status handlers
  const checkChromeAIAvailability = useCallback(async () => {
    setChromeAiStatus(prev => ({ ...prev, checking: true }));
    
    try {
      const status = await AIServiceProxy.checkChromeAIAvailability() as ChromeAvailabilityStatus;
      
      const nextStatus: ChromeAiStatus = {
        checking: false,
        available: status.available,
        state: status.state,
        message: status.message,
        details: status.details,
        progress: status.progress || 0,
        downloading: status.state === 'downloading',
      };

      if (typeof status.requiresFlags === 'boolean') {
        nextStatus.requiresFlags = status.requiresFlags;
      }

      if (status.flags !== undefined) {
        nextStatus.flags = status.flags;
      }

      setChromeAiStatus(nextStatus);
      
      Logger.log('ConfigContext', 'Chrome AI status:', status);
      
      return status;
    } catch (error) {
      Logger.log('ConfigContext', 'Chrome AI check failed:', error);
      setChromeAiStatus({
        checking: false,
        available: false,
        state: 'unavailable',
        message: 'Failed to check availability',
        details: getErrorMessage(error),
        progress: 0,
        downloading: false,
      });
      throw error;
    }
  }, []);

  const startChromeAIDownload = useCallback(async () => {
    try {
      // First check availability to ensure we're in downloadable state
      const status = await checkChromeAIAvailability() as ChromeAvailabilityStatus;
      
      if (status.state !== 'downloadable' && status.state !== 'after-download') {
        Logger.log('ConfigContext', 'Model not in downloadable state:', status.state);
        setChromeAiStatus(prev => ({ 
          ...prev, 
          message: 'Model is not in a downloadable state',
          details: `Current state: ${status.state}`,
        }));
        return;
      }
      
      // Now start monitoring the download
      setChromeAiStatus(prev => ({ 
        ...prev, 
        downloading: true, 
        progress: 0,
        message: 'Starting download...',
        details: 'Please wait while the model is being downloaded',
      }));
      
      const downloadChromeAIModelWithProgress = AIServiceProxy.downloadChromeAIModel as unknown as (onProgress: (progress: ChromeDownloadProgress) => void) => Promise<ChromeDownloadResult>;
      const result = await downloadChromeAIModelWithProgress((progress) => {
        Logger.log('ConfigContext', `Chrome AI download progress: ${progress.progress?.toFixed(1)}%`);
        setChromeAiStatus(prev => ({ 
          ...prev, 
          progress: progress.progress ?? 0,
          details: progress.details || `${(progress.progress || 0).toFixed(1)}%`
        }));
      });
      
      Logger.log('ConfigContext', 'Download result:', result);
      
      // Update status with the result message
      // Safety check: ensure result exists and has success property
      if (result && result.success) {
        setChromeAiStatus(prev => ({ 
          ...prev, 
          downloading: false,
          message: result.message || 'Download initiated successfully',
          details: 'Please check chrome://on-device-internals for progress, then refresh status',
        }));
      } else if (result && !result.success) {
        // Download initiated but with a non-success status
        setChromeAiStatus(prev => ({ 
          ...prev, 
          downloading: false,
          message: result.message || 'Download completed with warnings',
          details: result.details || 'Please check chrome://on-device-internals for status',
        }));
      } else {
        // Fallback if result is undefined or malformed
        setChromeAiStatus(prev => ({ 
          ...prev, 
          downloading: false,
          message: 'Download process completed',
          details: 'Please check chrome://on-device-internals for status, then refresh',
        }));
      }
      
      Logger.log('ConfigContext', 'Download monitor completed, rechecking availability...');
      
      // Recheck availability after download completes
      await checkChromeAIAvailability();
      
    } catch (error) {
      Logger.error('ConfigContext', 'Chrome AI download failed:', error);
      setChromeAiStatus(prev => ({ 
        ...prev, 
        downloading: false,
        message: 'Download failed',
        details: getErrorMessage(error) || 'Failed to start download. Please try manually at chrome://components',
      }));
      throw error;
    }
  }, [checkChromeAIAvailability]);

  // AI Features Test Functions
  const testTranslator = useCallback(async (text: string, sourceLanguage: string, targetLanguage: string) => {
    if (!aiConfig.aiFeatures?.translator?.enabled) {
      throw new Error('Translator is disabled in settings');
    }
    const result = await TranslatorServiceProxy.translate(text, sourceLanguage, targetLanguage);
    return result;
  }, [aiConfig]);

  const testLanguageDetector = useCallback(async (text: string) => {
    if (!aiConfig.aiFeatures?.languageDetector?.enabled) {
      throw new Error('Language Detector is disabled in settings');
    }
    const results = await LanguageDetectorServiceProxy.detect(text);
    return results;
  }, [aiConfig]);

  const testSummarizer = useCallback(async (text: string, options: Record<string, unknown> = {}) => {
    if (!aiConfig.aiFeatures?.summarizer?.enabled) {
      throw new Error('Summarizer is disabled in settings');
    }
    const summary = await SummarizerServiceProxy.summarize(text, options);
    return summary;
  }, [aiConfig]);

  const testRewriter = useCallback(async (text: string) => {
    if (!aiConfig.aiFeatures?.rewriter?.enabled) {
      throw new Error('Rewriter is disabled in settings');
    }
    // TODO: Implement RewriterServiceProxy
    // For now, return a placeholder message
    return `Rewriter feature coming soon! Input text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`;
  }, [aiConfig]);

  const testWriter = useCallback(async (prompt: string, options: Record<string, unknown> = {}) => {
    if (!aiConfig.aiFeatures?.writer?.enabled) {
      throw new Error('Writer is disabled in settings');
    }
    const content = await WriterServiceProxy.write(prompt, options);
    return content;
  }, [aiConfig]);

  // Auto-check Kokoro status on mount and auto-initialize if model is already downloaded
  // This happens BEFORE the Babylon scene loads (pre-initialization)
  useEffect(() => {
    const checkAndAutoInit = async () => {
      // Only proceed if TTS is enabled AND provider is Kokoro (browser worker) AND keepModelLoaded is enabled
      if (ttsConfig.enabled && ttsConfig.provider === TTSProviders.KOKORO && ttsConfig.kokoro?.keepModelLoaded !== false) {
        try {
          Logger.log('ConfigContext', 'Pre-initializing Kokoro before scene loads...');
          setKokoroStatus(prev => ({ ...prev, preInitializing: true }));
          
          // Check current status
          const status = await TTSServiceProxy.checkKokoroStatus();
          const kokoroStatus = (status && typeof status === 'object')
            ? (status as { initialized?: boolean; initializing?: boolean })
            : {};
          
          if (!kokoroStatus.initialized && !kokoroStatus.initializing) {
            // Model needs initialization - do it now
            Logger.log('ConfigContext', 'Initializing Kokoro model...');
            await initializeKokoro();
            Logger.log('ConfigContext', 'Kokoro initialization complete with warmup');
          } else if (kokoroStatus.initialized) {
            // Model already initialized - just do a warmup ping to ensure it's fully ready
            Logger.log('ConfigContext', 'Kokoro already initialized, doing warmup ping...');
            try {
              await TTSServiceProxy.pingKokoro();
              Logger.log('ConfigContext', 'Kokoro warmup ping complete');
            } catch (pingError) {
              Logger.warn('ConfigContext', 'Warmup ping failed:', pingError);
            }
          }
          
          Logger.log('ConfigContext', 'Kokoro pre-initialization complete');
          setKokoroStatus(prev => ({ ...prev, preInitializing: false }));
        } catch (error) {
          Logger.error('ConfigContext', 'Kokoro pre-initialization failed:', error);
          setKokoroStatus(prev => ({ ...prev, preInitializing: false }));
        }
      }
    };
    
    checkAndAutoInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsConfig.enabled, ttsConfig.provider, ttsConfig.kokoro?.keepModelLoaded]);

  const value = useMemo(() => ({
    // Config loading state
    isConfigLoading,
    
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
    clearAIConfigError: () => setAiConfigError(''),
    
    // AI Features Tests
    testTranslator,
    testLanguageDetector,
    testSummarizer,
    testRewriter,
    testWriter,
    
    // TTS Config
    ttsConfig,
    ttsConfigSaved,
    ttsConfigError,
    ttsTesting,
    updateTTSConfig,
    saveTTSConfig,
    testTTSConnection,
    setTtsConfigError,
    clearTTSConfigError: () => setTtsConfigError(''),
    
    // STT Config
    sttConfig,
    sttConfigSaved,
    sttConfigError,
    sttTesting,
    updateSTTConfig,
    saveSTTConfig,
    testSTTRecording,
    clearSTTConfigError: () => setSttConfigError(''),
    
    // Chrome AI Status
    chromeAiStatus,
    checkChromeAIAvailability,
    startChromeAIDownload,

    // Kokoro TTS Status
    kokoroStatus,
    checkKokoroStatus,
    initializeKokoro,
  }), [isConfigLoading, uiConfig, uiConfigSaved, uiConfigError, updateUIConfig, saveUIConfig, aiConfig, aiConfigSaved, aiConfigError, aiTesting, updateAIConfig, saveAIConfig, testAIConnection, testTranslator, testLanguageDetector, testSummarizer, testRewriter, testWriter, ttsConfig, ttsConfigSaved, ttsConfigError, ttsTesting, updateTTSConfig, saveTTSConfig, testTTSConnection, sttConfig, sttConfigSaved, sttConfigError, sttTesting, updateSTTConfig, saveSTTConfig, testSTTRecording, chromeAiStatus, checkChromeAIAvailability, startChromeAIDownload, kokoroStatus, checkKokoroStatus, initializeKokoro]);

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
};
