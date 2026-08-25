import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  AIServiceProxy,
  LanguageDetectorServiceProxy,
  RewriterServiceProxy,
  STTServiceProxy,
  StorageServiceProxy,
  SummarizerServiceProxy,
  TranslatorServiceProxy,
  TTSServiceProxy,
  WriterServiceProxy,
} from "../services/proxies";
import {
  AIProviders,
  type AIConfig,
  DefaultAIConfig,
  DefaultSTTConfig,
  DefaultTTSConfig,
  STTProviders,
  TTSProviders,
  type STTConfig,
  type TTSConfig,
  validateAIConfig,
  validateSTTConfig,
  validateTTSConfig,
} from "../config/aiConfig";
import { DefaultUIConfig, type UIConfig } from "../config/uiConfig";
import { mergeDeep, type ResolvedVAssistEmbedConfig } from "../embed/config";
import { getEmbedConfig } from "../embed/runtimeStore";
import Logger from "../services/LoggerService";
import { isDesktop } from "../utils/PlatformUtils";
import {
  createDebouncedFunction,
  type DebouncedFunction,
} from "../utils/debounce";
import { getErrorMessage, setConfigValueAtPath } from "./storeUtils";
import { useDesktopStore } from "./useDesktopStore";
import type { SetupData } from "./createSetupStore";

export interface ChromeAiStatus {
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

export interface KokoroStatus {
  checking: boolean;
  initialized: boolean;
  preInitializing: boolean;
  state: "notInitialized" | "downloading" | "ready" | "error";
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

export interface ConfigUpdateOptions {
  debounceMs?: number;
}

interface ConfigPathDebouncer {
  delayMs: number;
  debounced: DebouncedFunction<[unknown]>;
}

type ConfigKind = "ui" | "ai" | "tts" | "stt";

export interface ConfigStoreState {
  hasHydrated: boolean;
  isConfigLoading: boolean;
  uiConfig: UIConfig;
  uiConfigSaved: boolean;
  uiConfigError: string;
  aiConfig: AIConfig;
  aiConfigSaved: boolean;
  aiConfigError: string;
  aiTesting: boolean;
  ttsConfig: TTSConfig;
  ttsConfigSaved: boolean;
  ttsConfigError: string;
  ttsTesting: boolean;
  sttConfig: STTConfig;
  sttConfigSaved: boolean;
  sttConfigError: string;
  sttTesting: boolean;
  chromeAiStatus: ChromeAiStatus;
  kokoroStatus: KokoroStatus;
  hydrateConfigStore: (
    embedConfig?: ResolvedVAssistEmbedConfig,
  ) => Promise<void>;
  updateUIConfig: (
    path: string,
    value: unknown,
    options?: ConfigUpdateOptions,
  ) => void;
  saveUIConfig: () => Promise<void>;
  updateAIConfig: (
    path: string,
    value: unknown,
    options?: ConfigUpdateOptions,
  ) => void;
  saveAIConfig: () => Promise<void>;
  testAIConnection: () => Promise<void>;
  clearAIConfigError: () => void;
  testTranslator: (
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ) => Promise<unknown>;
  testLanguageDetector: (text: string) => Promise<unknown>;
  testSummarizer: (
    text: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  testRewriter: (
    text: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  testWriter: (
    prompt: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  updateTTSConfig: (
    path: string,
    value: unknown,
    options?: ConfigUpdateOptions,
  ) => void;
  saveTTSConfig: () => Promise<void>;
  testTTSConnection: (customText?: string | null) => Promise<void>;
  setTtsConfigError: (message: string) => void;
  clearTTSConfigError: () => void;
  updateSTTConfig: (
    path: string,
    value: unknown,
    options?: ConfigUpdateOptions,
  ) => void;
  saveSTTConfig: () => Promise<void>;
  testSTTRecording: (deviceId?: string | null) => Promise<void>;
  clearSTTConfigError: () => void;
  checkChromeAIAvailability: () => Promise<unknown>;
  startChromeAIDownload: () => Promise<void>;
  checkKokoroStatus: (
    desiredDeviceOverride?: string | null,
  ) => Promise<unknown>;
  initializeKokoro: () => Promise<unknown>;
  applySetupData: (setupData: SetupData) => Promise<void>;
}

const saveTimeouts: Record<ConfigKind, ReturnType<typeof setTimeout> | null> = {
  ui: null,
  ai: null,
  tts: null,
  stt: null,
};

const pathDebouncers: Record<
  ConfigKind,
  Record<string, ConfigPathDebouncer>
> = {
  ui: {},
  ai: {},
  tts: {},
  stt: {},
};

const normalizeAIConfig = (
  savedConfig: Partial<AIConfig> | null | undefined,
): AIConfig => ({
  ...DefaultAIConfig,
  ...(savedConfig ?? {}),
  remoteProfiles: Array.isArray(savedConfig?.remoteProfiles)
    ? savedConfig.remoteProfiles
    : DefaultAIConfig.remoteProfiles,
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
  "android-local": {
    ...DefaultAIConfig["android-local"],
    ...(savedConfig?.["android-local"] ?? {}),
    routing: {
      ...DefaultAIConfig["android-local"].routing,
      ...(savedConfig?.["android-local"]?.routing ?? {}),
      visionModel: {
        ...DefaultAIConfig["android-local"].routing.visionModel,
        ...(savedConfig?.["android-local"]?.routing?.visionModel ?? {}),
      },
      routerModel: {
        ...DefaultAIConfig["android-local"].routing.routerModel,
        ...(savedConfig?.["android-local"]?.routing?.routerModel ?? {}),
      },
    },
  },
  "desktop-local": {
    ...DefaultAIConfig["desktop-local"],
    ...(savedConfig?.["desktop-local"] ?? {}),
    routing: {
      ...DefaultAIConfig["desktop-local"].routing,
      ...(savedConfig?.["desktop-local"]?.routing ?? {}),
      visionModel: {
        ...DefaultAIConfig["desktop-local"].routing.visionModel,
        ...(savedConfig?.["desktop-local"]?.routing?.visionModel ?? {}),
      },
      routerModel: {
        ...DefaultAIConfig["desktop-local"].routing.routerModel,
        ...(savedConfig?.["desktop-local"]?.routing?.routerModel ?? {}),
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

const normalizeTTSConfig = (
  savedConfig: Partial<TTSConfig> | null | undefined,
): TTSConfig => ({
  ...DefaultTTSConfig,
  ...(savedConfig ?? {}),
  remoteProfiles: Array.isArray(savedConfig?.remoteProfiles)
    ? savedConfig.remoteProfiles
    : DefaultTTSConfig.remoteProfiles,
  kokoro: {
    ...DefaultTTSConfig.kokoro,
    ...(savedConfig?.kokoro ?? {}),
  },
  openai: {
    ...DefaultTTSConfig.openai,
    ...(savedConfig?.openai ?? {}),
  },
  "openai-compatible": {
    ...DefaultTTSConfig["openai-compatible"],
    ...(savedConfig?.["openai-compatible"] ?? {}),
  },
  "android-local": {
    ...DefaultTTSConfig["android-local"],
    ...(savedConfig?.["android-local"] ?? {}),
  },
  "desktop-local": {
    ...DefaultTTSConfig["desktop-local"],
    ...(savedConfig?.["desktop-local"] ?? {}),
  },
  "gptsovits-remote": {
    ...DefaultTTSConfig["gptsovits-remote"],
    ...(savedConfig?.["gptsovits-remote"] ?? {}),
  },
});

const normalizeSTTConfig = (
  savedConfig: Partial<STTConfig> | null | undefined,
): STTConfig => ({
  ...DefaultSTTConfig,
  ...(savedConfig ?? {}),
  remoteProfiles: Array.isArray(savedConfig?.remoteProfiles)
    ? savedConfig.remoteProfiles
    : DefaultSTTConfig.remoteProfiles,
  "chrome-ai-multimodal": {
    ...DefaultSTTConfig["chrome-ai-multimodal"],
    ...(savedConfig?.["chrome-ai-multimodal"] ?? {}),
  },
  openai: {
    ...DefaultSTTConfig.openai,
    ...(savedConfig?.openai ?? {}),
  },
  "openai-compatible": {
    ...DefaultSTTConfig["openai-compatible"],
    ...(savedConfig?.["openai-compatible"] ?? {}),
  },
  "android-local": {
    ...DefaultSTTConfig["android-local"],
    ...(savedConfig?.["android-local"] ?? {}),
  },
  "desktop-local": {
    ...DefaultSTTConfig["desktop-local"],
    ...(savedConfig?.["desktop-local"] ?? {}),
  },
});

const defaultChromeAiStatus = (): ChromeAiStatus => ({
  checking: false,
  available: false,
  state: null,
  message: "",
  details: "",
  progress: 0,
  downloading: false,
});

const defaultKokoroStatus = (): KokoroStatus => ({
  checking: false,
  initialized: false,
  preInitializing: false,
  state: "notInitialized",
  message: "",
  details: "",
  progress: 0,
  downloading: false,
});

const clearSaveTimeout = (kind: ConfigKind) => {
  if (saveTimeouts[kind]) {
    clearTimeout(saveTimeouts[kind]);
    saveTimeouts[kind] = null;
  }
};

const clearAllConfigPathDebouncers = () => {
  Object.values(pathDebouncers).forEach((debouncers) => {
    Object.values(debouncers).forEach((item) => item.debounced.cancel());
    Object.keys(debouncers).forEach((key) => {
      delete debouncers[key];
    });
  });
};

const buildConfigsFromSetupData = (setupData: SetupData) => {
  const aiFeatureOverrides = setupData.aiFeatures;
  const aiConfig = normalizeAIConfig({
    ...DefaultAIConfig,
    provider: setupData.llm?.provider || DefaultAIConfig.provider,
    chromeAi: {
      ...DefaultAIConfig.chromeAi,
      enableImageSupport: setupData.llm?.chromeAi?.enableImageSupport ?? true,
      enableAudioSupport: setupData.llm?.chromeAi?.enableAudioSupport ?? true,
    },
    openai: {
      ...DefaultAIConfig.openai,
      apiKey: setupData.llm?.openai?.apiKey || "",
      model: setupData.llm?.openai?.model || "gpt-4o-mini",
    },
    ollama: {
      ...DefaultAIConfig.ollama,
      endpoint: setupData.llm?.ollama?.endpoint || "http://localhost:11434",
      model: setupData.llm?.ollama?.model || "llama3.2",
    },
    aiFeatures: {
      ...DefaultAIConfig.aiFeatures,
      translator: {
        ...DefaultAIConfig.aiFeatures.translator,
        ...(aiFeatureOverrides?.translator ?? {}),
      },
      languageDetector: {
        ...DefaultAIConfig.aiFeatures.languageDetector,
        ...(aiFeatureOverrides?.languageDetector ?? {}),
      },
      summarizer: {
        ...DefaultAIConfig.aiFeatures.summarizer,
        ...(aiFeatureOverrides?.summarizer ?? {}),
      },
      rewriter: {
        ...DefaultAIConfig.aiFeatures.rewriter,
        ...(aiFeatureOverrides?.rewriter ?? {}),
      },
      writer: {
        ...DefaultAIConfig.aiFeatures.writer,
        ...(aiFeatureOverrides?.writer ?? {}),
      },
    },
  });

  const ttsConfig = normalizeTTSConfig({
    ...DefaultTTSConfig,
    enabled: setupData.tts?.enabled ?? DefaultTTSConfig.enabled,
    provider: setupData.tts?.provider || DefaultTTSConfig.provider,
    kokoro: {
      ...DefaultTTSConfig.kokoro,
      voice: setupData.tts?.kokoro?.voice || "af_heart",
      speed: setupData.tts?.kokoro?.speed || 1.0,
      device: setupData.tts?.kokoro?.device || "auto",
    },
    openai: {
      ...DefaultTTSConfig.openai,
      apiKey: setupData.tts?.openai?.apiKey || "",
      voice: setupData.tts?.openai?.voice || "nova",
    },
    "openai-compatible": {
      ...DefaultTTSConfig["openai-compatible"],
      endpoint:
        setupData.tts?.["openai-compatible"]?.endpoint ||
        "http://localhost:8000",
      apiKey: setupData.tts?.["openai-compatible"]?.apiKey || "",
      model: setupData.tts?.["openai-compatible"]?.model || "tts",
      voice: setupData.tts?.["openai-compatible"]?.voice || "default",
      speed: setupData.tts?.["openai-compatible"]?.speed || 1.0,
    },
  });

  const sttConfig = normalizeSTTConfig({
    ...DefaultSTTConfig,
    enabled: setupData.stt?.enabled ?? DefaultSTTConfig.enabled,
    provider: setupData.stt?.provider || DefaultSTTConfig.provider,
    "chrome-ai-multimodal": {
      ...DefaultSTTConfig["chrome-ai-multimodal"],
      temperature: setupData.sttConfig?.chromeAi?.temperature || 0.1,
      topK: setupData.sttConfig?.chromeAi?.topK || 3,
      outputLanguage: setupData.sttConfig?.chromeAi?.outputLanguage || "en",
    },
    openai: {
      ...DefaultSTTConfig.openai,
      apiKey: setupData.sttConfig?.openai?.apiKey || "",
      language: setupData.sttConfig?.openai?.language || "en",
    },
    "openai-compatible": {
      ...DefaultSTTConfig["openai-compatible"],
      endpoint:
        setupData.sttConfig?.["openai-compatible"]?.endpoint ||
        "http://localhost:8000",
      apiKey: setupData.sttConfig?.["openai-compatible"]?.apiKey || "",
      model: "whisper",
      language: setupData.sttConfig?.["openai-compatible"]?.language || "en",
    },
  });

  const uiConfig: UIConfig = {
    ...DefaultUIConfig,
    enableModelLoading: setupData.ui?.enableModelLoading ?? true,
    enablePortraitMode: setupData.ui?.enablePortraitMode ?? false,
    position: {
      ...DefaultUIConfig.position,
      preset: setupData.ui?.position || "bottom-right",
      lastLocation: null,
    },
    enableAIToolbar: setupData.ui?.enableAIToolbar ?? true,
    emotePlayback: {
      ...DefaultUIConfig.emotePlayback,
      showDurationBar: true,
      showTime: true,
      autoPlayCategory: "all",
    },
    shortcuts: {
      ...DefaultUIConfig.shortcuts,
      ...(setupData.ui?.shortcuts || {}),
    },
  };

  return {
    aiConfig,
    ttsConfig,
    sttConfig,
    uiConfig,
  };
};

const applyEmbedUiPolicy = (
  uiConfig: UIConfig,
  embedConfig?: ResolvedVAssistEmbedConfig,
): UIConfig => {
  if (!embedConfig) {
    return uiConfig;
  }

  const nextUiConfig = mergeDeep(uiConfig, {});

  if (!embedConfig.features.liveAssistant3d) {
    nextUiConfig.enableModelLoading = false;
  }

  if (!embedConfig.features.aiToolbar) {
    nextUiConfig.enableAIToolbar = false;
  }

  nextUiConfig.aiToolbar = {
    ...nextUiConfig.aiToolbar,
    showOnInputFocus: embedConfig.aiToolbar.showOnInputFocus,
    showOnImageHover: embedConfig.aiToolbar.showOnImageHover,
  };

  if (!embedConfig.features.chat) {
    nextUiConfig.shortcuts.enabled = false;
  }

  if (embedConfig.theme.mode !== "adaptive") {
    nextUiConfig.backgroundDetection.mode = embedConfig.theme.mode;
    nextUiConfig.backgroundDetection.showDebug = false;
  }

  return nextUiConfig;
};

const applyEmbedConfigToConfigs = (
  configs: {
    uiConfig: UIConfig;
    aiConfig: AIConfig;
    ttsConfig: TTSConfig;
    sttConfig: STTConfig;
  },
  embedConfig?: ResolvedVAssistEmbedConfig,
) => {
  if (!embedConfig) {
    return configs;
  }

  let nextAiConfig = configs.aiConfig;
  let nextTtsConfig = configs.ttsConfig;
  let nextSttConfig = configs.sttConfig;

  if (embedConfig.providers.ai) {
    nextAiConfig = normalizeAIConfig(
      mergeDeep(
        configs.aiConfig,
        embedConfig.providers.ai,
      ) as Partial<AIConfig>,
    );
  }

  if (embedConfig.providers.tts) {
    nextTtsConfig = normalizeTTSConfig(
      mergeDeep(
        configs.ttsConfig,
        embedConfig.providers.tts,
      ) as Partial<TTSConfig>,
    );
  }

  if (embedConfig.providers.stt) {
    nextSttConfig = normalizeSTTConfig(
      mergeDeep(
        configs.sttConfig,
        embedConfig.providers.stt,
      ) as Partial<STTConfig>,
    );
  }

  if (!embedConfig.features.voiceOutput) {
    nextTtsConfig = {
      ...nextTtsConfig,
      enabled: false,
    };
  }

  if (!embedConfig.features.voiceInput && !embedConfig.features.voiceCall) {
    nextSttConfig = {
      ...nextSttConfig,
      enabled: false,
    };
  }

  const synced = syncDesktopLocalEndpoints(
    nextAiConfig,
    nextTtsConfig,
    nextSttConfig,
  );

  return {
    uiConfig: applyEmbedUiPolicy(configs.uiConfig, embedConfig),
    aiConfig: synced.aiConfig,
    ttsConfig: synced.ttsConfig,
    sttConfig: synced.sttConfig,
  };
};

const syncDesktopLocalEndpoints = (
  aiConfig: AIConfig,
  ttsConfig: TTSConfig,
  sttConfig: STTConfig,
) => {
  const port = Number(aiConfig?.["desktop-local"]?.serverPort || 11438);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      aiConfig,
      ttsConfig,
      sttConfig,
      changed: { ai: false, tts: false, stt: false },
    };
  }

  const sharedEndpoint = `http://127.0.0.1:${port}`;
  let nextAiConfig = aiConfig;
  let nextTtsConfig = ttsConfig;
  let nextSttConfig = sttConfig;
  let aiChanged = false;
  let ttsChanged = false;
  let sttChanged = false;

  if (aiConfig?.["desktop-local"]?.endpoint !== sharedEndpoint) {
    nextAiConfig = {
      ...aiConfig,
      "desktop-local": {
        ...(aiConfig["desktop-local"] || {}),
        endpoint: sharedEndpoint,
      },
    };
    aiChanged = true;
  }

  if (ttsConfig?.["desktop-local"]?.endpoint !== sharedEndpoint) {
    nextTtsConfig = {
      ...ttsConfig,
      "desktop-local": {
        ...(ttsConfig["desktop-local"] || {}),
        endpoint: sharedEndpoint,
      },
    };
    ttsChanged = true;
  }

  if (sttConfig?.["desktop-local"]?.endpoint !== sharedEndpoint) {
    nextSttConfig = {
      ...sttConfig,
      "desktop-local": {
        ...(sttConfig["desktop-local"] || {}),
        endpoint: sharedEndpoint,
      },
    };
    sttChanged = true;
  }

  return {
    aiConfig: nextAiConfig,
    ttsConfig: nextTtsConfig,
    sttConfig: nextSttConfig,
    changed: {
      ai: aiChanged,
      tts: ttsChanged,
      stt: sttChanged,
    },
  };
};

const configureAIAndFeatureServices = async (aiConfig: AIConfig) => {
  if (aiConfig.provider) {
    await AIServiceProxy.configure(aiConfig);
  }

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
};

const syncDesktopServerForProviders = async (
  aiConfig: AIConfig,
  ttsConfig: TTSConfig,
  sttConfig: STTConfig,
) => {
  const api = useDesktopStore.getState().api;
  if (!isDesktop || !api?.server) {
    return;
  }

  const llmUsesDesktopLocal = aiConfig?.provider === AIProviders.DESKTOP_LOCAL;
  const ttsUsesDesktopLocal =
    ttsConfig?.provider === TTSProviders.DESKTOP_LOCAL;
  const sttUsesDesktopLocal =
    sttConfig?.provider === STTProviders.DESKTOP_LOCAL;
  const needsDesktopProxy =
    llmUsesDesktopLocal || ttsUsesDesktopLocal || sttUsesDesktopLocal;

  if (!needsDesktopProxy) {
    try {
      await api.server.stop();
      Logger.log(
        "ConfigStore",
        "Desktop proxy server stopped (no desktop-local providers active)",
      );
    } catch (error) {
      Logger.warn("ConfigStore", "Desktop proxy stop skipped/failed:", error);
    }
    return;
  }

  const desktopLlmConfig = aiConfig?.["desktop-local"] || {};
  const desktopSttConfig = sttConfig?.["desktop-local"] || {};
  const desktopTtsConfig = ttsConfig?.["desktop-local"] || {};

  let canStartServer = true;
  if (
    llmUsesDesktopLocal &&
    api?.llm?.getBackendStatus &&
    desktopLlmConfig.backend &&
    desktopLlmConfig.backend !== "auto"
  ) {
    try {
      const backendStatus = (await api.llm.getBackendStatus(
        desktopLlmConfig.backend,
      )) as DesktopBackendStatus;
      if (backendStatus?.success && !backendStatus.selectedInstalled) {
        canStartServer = false;
        Logger.warn(
          "ConfigStore",
          `Desktop proxy start deferred: backend ${desktopLlmConfig.backend} is not installed yet`,
        );
      }
    } catch (error) {
      Logger.warn(
        "ConfigStore",
        "Failed to verify backend status before desktop proxy start:",
        error,
      );
    }
  }

  if (!canStartServer) {
    return;
  }

  try {
    const result = (await api.server.start({
      ...desktopLlmConfig,
      stt: {
        model: desktopSttConfig.model,
        language: desktopSttConfig.language,
        engine: desktopSttConfig.engine,
      },
      tts: {
        enabled: Boolean(ttsConfig?.enabled && ttsUsesDesktopLocal),
        pytorchBackend: desktopTtsConfig.pytorchBackend || "auto",
        engine:
          desktopTtsConfig.engine === "supertonic"
            ? "supertonic"
            : "gpt-sovits",
      },
    })) as DesktopServerStartResult;

    if (result?.success) {
      Logger.log("ConfigStore", "Desktop proxy server started/updated:", {
        llmUsesDesktopLocal,
        ttsUsesDesktopLocal,
        sttUsesDesktopLocal,
      });
    } else {
      Logger.error(
        "ConfigStore",
        "Failed to start desktop proxy server:",
        result?.error || result,
      );
    }
  } catch (error) {
    Logger.error("ConfigStore", "Error starting desktop proxy server:", error);
  }
};

const scheduleConfigSave = (kind: ConfigKind) => {
  if (!useConfigStore.getState().hasHydrated) {
    return;
  }

  clearSaveTimeout(kind);
  saveTimeouts[kind] = setTimeout(async () => {
    switch (kind) {
      case "ui":
        await saveUIConfigInternal(true);
        break;
      case "ai":
        await saveAIConfigInternal(true);
        break;
      case "tts":
        await saveTTSConfigInternal(true);
        break;
      case "stt":
        await saveSTTConfigInternal(true);
        break;
    }
  }, 500);
};

const markSavedFlag = (
  kind: Extract<ConfigKind, "ui" | "ai" | "tts" | "stt">,
) => {
  switch (kind) {
    case "ui":
      useConfigStore.setState({ uiConfigSaved: true, uiConfigError: "" });
      setTimeout(() => useConfigStore.setState({ uiConfigSaved: false }), 2000);
      return;
    case "ai":
      useConfigStore.setState({ aiConfigSaved: true, aiConfigError: "" });
      setTimeout(() => useConfigStore.setState({ aiConfigSaved: false }), 2000);
      return;
    case "tts":
      useConfigStore.setState({ ttsConfigSaved: true, ttsConfigError: "" });
      setTimeout(
        () => useConfigStore.setState({ ttsConfigSaved: false }),
        2000,
      );
      return;
    case "stt":
      useConfigStore.setState({ sttConfigSaved: true, sttConfigError: "" });
      setTimeout(
        () => useConfigStore.setState({ sttConfigSaved: false }),
        2000,
      );
      return;
  }
};

const applyPathUpdate = (kind: ConfigKind, path: string, value: unknown) => {
  const state = useConfigStore.getState();

  if (kind === "ui") {
    useConfigStore.setState({
      uiConfig: setConfigValueAtPath(state.uiConfig, path, value),
    });
    scheduleConfigSave("ui");
    return;
  }

  if (kind === "ai") {
    const nextAiConfig = setConfigValueAtPath(state.aiConfig, path, value);
    const synced = syncDesktopLocalEndpoints(
      nextAiConfig,
      state.ttsConfig,
      state.sttConfig,
    );
    useConfigStore.setState({
      aiConfig: synced.aiConfig,
      ttsConfig: synced.ttsConfig,
      sttConfig: synced.sttConfig,
    });
    scheduleConfigSave("ai");
    if (synced.changed.tts) {
      scheduleConfigSave("tts");
    }
    if (synced.changed.stt) {
      scheduleConfigSave("stt");
    }
    void syncDesktopServerForProviders(
      synced.aiConfig,
      synced.ttsConfig,
      synced.sttConfig,
    );
    return;
  }

  if (kind === "tts") {
    const nextTtsConfig = setConfigValueAtPath(state.ttsConfig, path, value);
    useConfigStore.setState({ ttsConfig: nextTtsConfig });
    scheduleConfigSave("tts");
    void syncDesktopServerForProviders(
      state.aiConfig,
      nextTtsConfig,
      state.sttConfig,
    );
    return;
  }

  const nextSttConfig = setConfigValueAtPath(state.sttConfig, path, value);
  useConfigStore.setState({ sttConfig: nextSttConfig });
  scheduleConfigSave("stt");
  void syncDesktopServerForProviders(
    state.aiConfig,
    state.ttsConfig,
    nextSttConfig,
  );
};

const scheduleConfigPathUpdate = (
  kind: ConfigKind,
  path: string,
  value: unknown,
  options?: ConfigUpdateOptions,
) => {
  const debounceMs = Math.max(0, options?.debounceMs ?? 0);
  const debouncers = pathDebouncers[kind];
  const existingDebouncer = debouncers[path];

  if (debounceMs === 0) {
    if (existingDebouncer) {
      existingDebouncer.debounced.cancel();
      delete debouncers[path];
    }
    applyPathUpdate(kind, path, value);
    return;
  }

  if (existingDebouncer && existingDebouncer.delayMs !== debounceMs) {
    existingDebouncer.debounced.cancel();
    delete debouncers[path];
  }

  if (!debouncers[path]) {
    debouncers[path] = {
      delayMs: debounceMs,
      debounced: createDebouncedFunction((nextValue: unknown) => {
        applyPathUpdate(kind, path, nextValue);
      }, debounceMs),
    };
  }

  debouncers[path].debounced(value);
};

const saveUIConfigInternal = async (_fromAutoSave = false) => {
  const { uiConfig } = useConfigStore.getState();
  try {
    await StorageServiceProxy.configSave("uiConfig", uiConfig);
    markSavedFlag("ui");
    Logger.log("ConfigStore", "UI config saved successfully");
  } catch (error) {
    useConfigStore.setState({
      uiConfigError: "Failed to save configuration: " + getErrorMessage(error),
    });
    Logger.error("ConfigStore", "UI config save error:", error);
  }
};

const saveAIConfigInternal = async (fromAutoSave = false) => {
  const { aiConfig } = useConfigStore.getState();
  const validation = validateAIConfig(aiConfig);

  if (!validation.valid) {
    if (!fromAutoSave) {
      useConfigStore.setState({ aiConfigError: validation.errors.join(", ") });
    }
    return;
  }

  try {
    await StorageServiceProxy.configSave("aiConfig", aiConfig);
    await configureAIAndFeatureServices(aiConfig);
    markSavedFlag("ai");
    Logger.log("ConfigStore", "AI config saved successfully");
  } catch (error) {
    useConfigStore.setState({
      aiConfigError:
        "Failed to save or configure AI service: " + getErrorMessage(error),
    });
    Logger.error("ConfigStore", "AI config save error:", error);
  }
};

const saveTTSConfigInternal = async (fromAutoSave = false) => {
  const { ttsConfig } = useConfigStore.getState();
  const validation = validateTTSConfig(ttsConfig);

  if (!validation.valid) {
    if (!fromAutoSave) {
      useConfigStore.setState({ ttsConfigError: validation.errors.join(", ") });
    }
    return;
  }

  try {
    await StorageServiceProxy.configSave("ttsConfig", ttsConfig);
    TTSServiceProxy.configure(ttsConfig);
    markSavedFlag("tts");
    Logger.log("ConfigStore", "TTS config saved successfully");
  } catch (error) {
    useConfigStore.setState({
      ttsConfigError:
        "Failed to save or configure TTS service: " + getErrorMessage(error),
    });
    Logger.error("ConfigStore", "TTS config save error:", error);
  }
};

const saveSTTConfigInternal = async (fromAutoSave = false) => {
  const { sttConfig } = useConfigStore.getState();
  const validation = validateSTTConfig(sttConfig);

  try {
    await StorageServiceProxy.configSave("sttConfig", sttConfig);
    if (validation.valid) {
      STTServiceProxy.configure(sttConfig);
      useConfigStore.setState({ sttConfigError: "" });
    } else if (!fromAutoSave) {
      useConfigStore.setState({ sttConfigError: validation.errors.join(", ") });
    }
    markSavedFlag("stt");
    Logger.log("ConfigStore", "STT config saved successfully");
  } catch (error) {
    useConfigStore.setState({
      sttConfigError:
        "Failed to save or configure STT service: " + getErrorMessage(error),
    });
    Logger.error("ConfigStore", "STT config save error:", error);
  }
};

export const useConfigStore = create<ConfigStoreState>()(
  devtools(
    immer((set, get) => ({
      hasHydrated: false,
      isConfigLoading: true,
      uiConfig: DefaultUIConfig,
      uiConfigSaved: false,
      uiConfigError: "",
      aiConfig: DefaultAIConfig,
      aiConfigSaved: false,
      aiConfigError: "",
      aiTesting: false,
      ttsConfig: DefaultTTSConfig,
      ttsConfigSaved: false,
      ttsConfigError: "",
      ttsTesting: false,
      sttConfig: DefaultSTTConfig,
      sttConfigSaved: false,
      sttConfigError: "",
      sttTesting: false,
      chromeAiStatus: defaultChromeAiStatus(),
      kokoroStatus: defaultKokoroStatus(),
      hydrateConfigStore: async (embedConfigOverride) => {
        if (get().hasHydrated && !get().isConfigLoading) {
          return;
        }

        const effectiveEmbedConfig = embedConfigOverride ?? getEmbedConfig();

        set((state) => {
          state.isConfigLoading = true;
        });

        let savedAiConfig = DefaultAIConfig;
        let savedTtsConfig = DefaultTTSConfig;
        let savedSttConfig = DefaultSTTConfig;

        try {
          const savedUiConfig = (await StorageServiceProxy.configLoad(
            "uiConfig",
          )) as Partial<UIConfig> | null;
          const mergedUiConfig = {
            ...DefaultUIConfig,
            ...(savedUiConfig ?? {}),
          };

          savedAiConfig = normalizeAIConfig(
            (await StorageServiceProxy.configLoad(
              "aiConfig",
            )) as Partial<AIConfig> | null,
          );
          savedTtsConfig = normalizeTTSConfig(
            (await StorageServiceProxy.configLoad(
              "ttsConfig",
            )) as Partial<TTSConfig> | null,
          );
          savedSttConfig = normalizeSTTConfig(
            (await StorageServiceProxy.configLoad(
              "sttConfig",
            )) as Partial<STTConfig> | null,
          );

          const appliedConfigs = applyEmbedConfigToConfigs(
            {
              uiConfig: mergedUiConfig,
              aiConfig: savedAiConfig,
              ttsConfig: savedTtsConfig,
              sttConfig: savedSttConfig,
            },
            effectiveEmbedConfig,
          );
          savedAiConfig = appliedConfigs.aiConfig;
          savedTtsConfig = appliedConfigs.ttsConfig;
          savedSttConfig = appliedConfigs.sttConfig;

          set((state) => {
            state.uiConfig = appliedConfigs.uiConfig;
            state.aiConfig = savedAiConfig;
            state.ttsConfig = savedTtsConfig;
            state.sttConfig = savedSttConfig;
          });

          Logger.log(
            "ConfigStore",
            "UI config loaded:",
            appliedConfigs.uiConfig,
          );

          try {
            await configureAIAndFeatureServices(savedAiConfig);
            Logger.log("ConfigStore", "AI services configured");
          } catch (error) {
            Logger.warn(
              "ConfigStore",
              "Failed to configure AI services:",
              error,
            );
          }

          try {
            TTSServiceProxy.configure(savedTtsConfig);
            Logger.log("ConfigStore", "TTS service configured");
          } catch (error) {
            Logger.warn(
              "ConfigStore",
              "Failed to configure TTS service:",
              error,
            );
          }

          try {
            STTServiceProxy.configure(savedSttConfig);
            Logger.log("ConfigStore", "STT service configured");
          } catch (error) {
            Logger.warn(
              "ConfigStore",
              "Failed to configure STT service:",
              error,
            );
          }
        } catch (error) {
          Logger.error("ConfigStore", "Failed to load configs:", error);
        } finally {
          set((state) => {
            state.hasHydrated = true;
            state.isConfigLoading = false;
          });
          await syncDesktopServerForProviders(
            savedAiConfig,
            savedTtsConfig,
            savedSttConfig,
          );
        }
      },
      updateUIConfig: (path, value, options) => {
        scheduleConfigPathUpdate("ui", path, value, options);
      },
      saveUIConfig: async () => {
        clearSaveTimeout("ui");
        await saveUIConfigInternal(false);
      },
      updateAIConfig: (path, value, options) => {
        scheduleConfigPathUpdate("ai", path, value, options);
      },
      saveAIConfig: async () => {
        clearSaveTimeout("ai");
        await saveAIConfigInternal(false);
      },
      testAIConnection: async () => {
        set((state) => {
          state.aiConfigError = "";
          state.aiTesting = true;
        });

        try {
          await AIServiceProxy.configure(get().aiConfig);
          set((state) => {
            state.aiConfigError = "hourglass:Testing connection...";
          });
          await AIServiceProxy.testConnection();
          set((state) => {
            state.aiConfigError = "success:Connection successful!";
          });
          setTimeout(() => {
            useConfigStore.setState({ aiConfigError: "" });
          }, 3000);
        } catch (error) {
          set((state) => {
            state.aiConfigError =
              "error-status:Connection failed:" + getErrorMessage(error);
          });
        } finally {
          set((state) => {
            state.aiTesting = false;
          });
        }
      },
      clearAIConfigError: () => {
        set((state) => {
          state.aiConfigError = "";
        });
      },
      testTranslator: async (text, sourceLanguage, targetLanguage) => {
        if (!get().aiConfig.aiFeatures?.translator?.enabled) {
          throw new Error("Translator is disabled in settings");
        }
        return TranslatorServiceProxy.translate(
          text,
          sourceLanguage,
          targetLanguage,
        );
      },
      testLanguageDetector: async (text) => {
        if (!get().aiConfig.aiFeatures?.languageDetector?.enabled) {
          throw new Error("Language Detector is disabled in settings");
        }
        return LanguageDetectorServiceProxy.detect(text);
      },
      testSummarizer: async (text, options = {}) => {
        if (!get().aiConfig.aiFeatures?.summarizer?.enabled) {
          throw new Error("Summarizer is disabled in settings");
        }
        return SummarizerServiceProxy.summarize(text, options);
      },
      testRewriter: async (text, options = {}) => {
        if (!get().aiConfig.aiFeatures?.rewriter?.enabled) {
          throw new Error("Rewriter is disabled in settings");
        }
        return RewriterServiceProxy.rewrite(text, options);
      },
      testWriter: async (prompt, options = {}) => {
        if (!get().aiConfig.aiFeatures?.writer?.enabled) {
          throw new Error("Writer is disabled in settings");
        }
        return WriterServiceProxy.write(prompt, options);
      },
      updateTTSConfig: (path, value, options) => {
        scheduleConfigPathUpdate("tts", path, value, options);
      },
      saveTTSConfig: async () => {
        clearSaveTimeout("tts");
        await saveTTSConfigInternal(false);
      },
      testTTSConnection: async (customText = null) => {
        const ttsConfig = get().ttsConfig;
        set((state) => {
          state.ttsConfigError = "";
          state.ttsTesting = true;
        });

        const testText =
          customText || "Hello, this is a test of the text to speech system.";

        try {
          TTSServiceProxy.configure(ttsConfig);

          if (ttsConfig.provider === TTSProviders.KOKORO) {
            set((state) => {
              state.ttsConfigError = "hourglass:Checking Kokoro status...";
            });

            const status =
              (await TTSServiceProxy.checkKokoroStatus()) as KokoroServiceStatus;

            if (!status.initialized) {
              set((state) => {
                state.ttsConfigError =
                  "hourglass:Initializing Kokoro model (first time may take a moment)...";
              });
              try {
                await get().initializeKokoro();
                const newStatus =
                  (await TTSServiceProxy.checkKokoroStatus()) as KokoroServiceStatus;
                if (!newStatus.initialized) {
                  set((state) => {
                    state.ttsConfigError =
                      "error-status:Failed to initialize Kokoro model";
                  });
                  return;
                }
              } catch (initError) {
                set((state) => {
                  state.ttsConfigError =
                    "error-status:Kokoro initialization failed:" +
                    getErrorMessage(initError);
                });
                return;
              }
            }
          }

          set((state) => {
            state.ttsConfigError = "hourglass:Testing TTS...";
          });

          const startTime = Date.now();
          await TTSServiceProxy.testConnection(testText);
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);

          if (ttsConfig.provider === TTSProviders.KOKORO) {
            set((state) => {
              state.ttsConfigError = `✅ TTS test successful! Generated in ${duration}s using voice: ${ttsConfig.kokoro?.voice || "default"}`;
            });
          } else if (ttsConfig.provider === TTSProviders.ANDROID_LOCAL) {
            set((state) => {
              state.ttsConfigError = `✅ Android TTS test successful! Generated in ${duration}s using voice: ${ttsConfig["android-local"]?.voice || "default"}`;
            });
          } else {
            set((state) => {
              state.ttsConfigError = `✅ TTS test successful! (${duration}s)`;
            });
          }

          setTimeout(() => {
            useConfigStore.setState({ ttsConfigError: "" });
          }, 5000);
        } catch (error) {
          set((state) => {
            state.ttsConfigError =
              "error-status:TTS test failed:" + getErrorMessage(error);
          });
        } finally {
          set((state) => {
            state.ttsTesting = false;
          });
        }
      },
      setTtsConfigError: (message) => {
        set((state) => {
          state.ttsConfigError = message;
        });
      },
      clearTTSConfigError: () => {
        set((state) => {
          state.ttsConfigError = "";
        });
      },
      updateSTTConfig: (path, value, options) => {
        scheduleConfigPathUpdate("stt", path, value, options);
      },
      saveSTTConfig: async () => {
        clearSaveTimeout("stt");
        await saveSTTConfigInternal(false);
      },
      testSTTRecording: async (deviceId = null) => {
        set((state) => {
          state.sttConfigError = "";
          state.sttTesting = true;
        });

        try {
          await STTServiceProxy.configure(get().sttConfig);
          set((state) => {
            state.sttConfigError = "🎤 Recording for 3 seconds... Speak now!";
          });
          const transcription = await STTServiceProxy.testRecording(
            3,
            deviceId,
          );
          set((state) => {
            state.sttConfigError = `✅ Transcription: "${transcription}"`;
          });
          setTimeout(() => {
            useConfigStore.setState({ sttConfigError: "" });
          }, 5000);
        } catch (error) {
          set((state) => {
            state.sttConfigError =
              "error-status:STT test failed: " + getErrorMessage(error);
          });
        } finally {
          set((state) => {
            state.sttTesting = false;
          });
        }
      },
      clearSTTConfigError: () => {
        set((state) => {
          state.sttConfigError = "";
        });
      },
      applySetupData: async (setupData) => {
        const appliedConfigs = applyEmbedConfigToConfigs(
          buildConfigsFromSetupData(setupData),
          getEmbedConfig(),
        );

        clearSaveTimeout("ui");
        clearSaveTimeout("ai");
        clearSaveTimeout("tts");
        clearSaveTimeout("stt");
        clearAllConfigPathDebouncers();

        set((state) => {
          state.uiConfig = appliedConfigs.uiConfig;
          state.aiConfig = appliedConfigs.aiConfig;
          state.ttsConfig = appliedConfigs.ttsConfig;
          state.sttConfig = appliedConfigs.sttConfig;
          state.uiConfigError = "";
          state.aiConfigError = "";
          state.ttsConfigError = "";
          state.sttConfigError = "";
        });

        await saveUIConfigInternal(false);
        await saveAIConfigInternal(false);
        await saveTTSConfigInternal(false);
        await saveSTTConfigInternal(false);
        await syncDesktopServerForProviders(
          appliedConfigs.aiConfig,
          appliedConfigs.ttsConfig,
          appliedConfigs.sttConfig,
        );
      },
      checkChromeAIAvailability: async () => {
        set((state) => {
          state.chromeAiStatus.checking = true;
        });

        try {
          const status =
            (await AIServiceProxy.checkChromeAIAvailability()) as ChromeAvailabilityStatus;

          set((state) => {
            state.chromeAiStatus = {
              checking: false,
              available: status.available,
              state: status.state,
              message: status.message,
              details: status.details,
              progress: status.progress || 0,
              downloading: status.state === "downloading",
              ...(typeof status.requiresFlags === "boolean"
                ? { requiresFlags: status.requiresFlags }
                : {}),
              ...(status.flags !== undefined ? { flags: status.flags } : {}),
            };
          });

          Logger.log("ConfigStore", "Chrome AI status:", status);
          return status;
        } catch (error) {
          Logger.log("ConfigStore", "Chrome AI check failed:", error);
          set((state) => {
            state.chromeAiStatus = {
              checking: false,
              available: false,
              state: "unavailable",
              message: "Failed to check availability",
              details: getErrorMessage(error),
              progress: 0,
              downloading: false,
            };
          });
          throw error;
        }
      },
      startChromeAIDownload: async () => {
        try {
          const status =
            (await get().checkChromeAIAvailability()) as ChromeAvailabilityStatus;

          if (
            status.state !== "downloadable" &&
            status.state !== "after-download"
          ) {
            set((state) => {
              state.chromeAiStatus.message =
                "Model is not in a downloadable state";
              state.chromeAiStatus.details = `Current state: ${status.state}`;
            });
            return;
          }

          set((state) => {
            state.chromeAiStatus.downloading = true;
            state.chromeAiStatus.progress = 0;
            state.chromeAiStatus.message = "Starting download...";
            state.chromeAiStatus.details =
              "Please wait while the model is being downloaded";
          });

          const downloadChromeAIModelWithProgress =
            AIServiceProxy.downloadChromeAIModel as unknown as (
              onProgress: (progress: ChromeDownloadProgress) => void,
            ) => Promise<ChromeDownloadResult>;

          const result = await downloadChromeAIModelWithProgress((progress) => {
            set((state) => {
              state.chromeAiStatus.progress = progress.progress ?? 0;
              state.chromeAiStatus.details =
                progress.details || `${(progress.progress || 0).toFixed(1)}%`;
            });
          });

          set((state) => {
            state.chromeAiStatus.downloading = false;
            state.chromeAiStatus.message =
              result?.message || "Download process completed";
            state.chromeAiStatus.details =
              result?.details ||
              "Please check chrome://on-device-internals for status, then refresh";
          });

          await get().checkChromeAIAvailability();
        } catch (error) {
          Logger.error("ConfigStore", "Chrome AI download failed:", error);
          set((state) => {
            state.chromeAiStatus.downloading = false;
            state.chromeAiStatus.message = "Download failed";
            state.chromeAiStatus.details =
              getErrorMessage(error) ||
              "Failed to start download. Please try manually at chrome://components";
          });
          throw error;
        }
      },
      checkKokoroStatus: async (desiredDeviceOverride = null) => {
        set((state) => {
          state.kokoroStatus.checking = true;
        });

        try {
          const status =
            (await TTSServiceProxy.checkKokoroStatus()) as KokoroServiceStatus;
          const desiredDevice =
            desiredDeviceOverride || get().ttsConfig.kokoro?.device || "auto";
          const actualDevice = status.config?.device || null;
          const isInitializedWithCorrectDevice =
            Boolean(status.initialized) && actualDevice === desiredDevice;

          set((state) => {
            state.kokoroStatus.checking = false;
            state.kokoroStatus.initialized = isInitializedWithCorrectDevice;
            state.kokoroStatus.state = isInitializedWithCorrectDevice
              ? "ready"
              : "notInitialized";
            state.kokoroStatus.message =
              status.message ||
              (isInitializedWithCorrectDevice
                ? "Kokoro TTS is ready"
                : "Not initialized");
            state.kokoroStatus.details = status.details || "";
            state.kokoroStatus.progress = 0;
            state.kokoroStatus.downloading = false;
          });

          Logger.log("ConfigStore", "Kokoro status:", status);
          return { ...status, initialized: isInitializedWithCorrectDevice };
        } catch (error) {
          Logger.log("ConfigStore", "Kokoro status check failed:", error);
          set((state) => {
            state.kokoroStatus.checking = false;
            state.kokoroStatus.initialized = false;
            state.kokoroStatus.state = "error";
            state.kokoroStatus.message = "Failed to check status";
            state.kokoroStatus.details = getErrorMessage(error);
            state.kokoroStatus.progress = 0;
            state.kokoroStatus.downloading = false;
          });
          throw error;
        }
      },
      initializeKokoro: async () => {
        try {
          set((state) => {
            state.kokoroStatus.downloading = true;
            state.kokoroStatus.progress = 0;
            state.kokoroStatus.state = "downloading";
          });

          const ttsConfig = get().ttsConfig;
          await TTSServiceProxy.configure(ttsConfig);

          let lastUpdateTime = 0;
          const progressDebounceMs = 100;

          const initialized = await TTSServiceProxy.initializeKokoro(
            (progressValue) => {
              const progress = progressValue as KokoroDownloadProgress;
              const percent =
                typeof progress.percent === "number" ? progress.percent : 0;
              const file = progress.file || "Downloading model...";
              const now = Date.now();
              const shouldUpdate =
                now - lastUpdateTime >= progressDebounceMs || percent >= 99.9;

              if (shouldUpdate) {
                lastUpdateTime = now;
                set((state) => {
                  state.kokoroStatus.progress = percent;
                  state.kokoroStatus.details = file;
                });
              }
            },
          );

          await get().checkKokoroStatus();
          return initialized;
        } catch (error) {
          Logger.error("ConfigStore", "Kokoro initialization failed:", error);
          set((state) => {
            state.kokoroStatus.downloading = false;
            state.kokoroStatus.state = "error";
            state.kokoroStatus.message = "Initialization failed";
            state.kokoroStatus.details = getErrorMessage(error);
          });
          throw error;
        }
      },
    })),
    { name: "config-store" },
  ),
);
