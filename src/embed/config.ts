import type { AIConfig, STTConfig, TTSConfig } from "../config/aiConfig";
import type { UIConfig } from "../config/uiConfig";
import type { StorageAdapterSelection } from "../storage/StorageAdapterRegistry";
import type { ResourceLoaderSelection } from "../utils/resource-loader/types";

export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export type VAssistMountTarget = string | HTMLElement | null;
export type VAssistRuntimeIsolationMode = "shadow-root" | "iframe";
export type VAssistShellMode =
  | "full"
  | "chat-only"
  | "toolbar-only"
  | "chat-toolbar";
export type VAssistSetupMode = "full" | "deferred" | "hidden" | "custom";
export type VAssistProviderMode =
  | "user-configurable"
  | "preconfigured"
  | "host-managed";
export type VAssistStorageMode = "default" | "namespaced" | "memory" | "host";
export type VAssistAssetPreset = "default" | "none" | "host";
export type VAssistTransportMode =
  | "builtin"
  | "openai-compatible"
  | "custom"
  | "host-bridge";
export type VAssistThemeMode = "adaptive" | "light" | "dark";
export type VAssistThemeSurfaceStyle = "glass" | "flat";
export type VAssistStorageAdapter = StorageAdapterSelection;
export type VAssistResourceLoader = ResourceLoaderSelection;
export type VAssistPortalContainerId = "overlays" | "popovers" | "canvas";
export type VAssistPortalContainerTarget =
  | string
  | HTMLElement
  | ShadowRoot
  | null;
export type VAssistSettingsTabId =
  | "ui"
  | "3d"
  | "llm"
  | "tts"
  | "stt"
  | "ai-plus";
export type VAssistFeatureName =
  | "chat"
  | "history"
  | "settings"
  | "voiceInput"
  | "voiceCall"
  | "voiceOutput"
  | "aiToolbar"
  | "liveAssistant3d"
  | "camera"
  | "screenShare";

export type VAssistSettingsSubTabId =
  | "llm.provider"
  | "llm.routing"
  | "llm.profiles";

export type VAssistSettingsSectionId =
  | "ui.appearance"
  | "ui.aiToolbar"
  | "ui.storage"
  | "ui.developer"
  | "llm.provider"
  | "llm.routing"
  | "llm.profiles"
  | "tts.provider"
  | "tts.remoteProfiles"
  | "stt.provider"
  | "stt.remoteProfiles"
  | "ai-plus.translator"
  | "ai-plus.languageDetector"
  | "ai-plus.summarizer"
  | "ai-plus.rewriter"
  | "ai-plus.writer";

export type VAssistSettingsFieldId =
  | "ui.aiToolbar.enabled"
  | "ui.aiToolbar.showOnInputFocus"
  | "ui.aiToolbar.showOnImageHover"
  | "llm.provider.select"
  | "llm.openai.apiKey"
  | "llm.openai.model"
  | "llm.ollama.endpoint"
  | "llm.ollama.apiKey"
  | "llm.ollama.model"
  | "llm.routing.visionModel"
  | "llm.routing.routerModel"
  | "tts.enabled"
  | "tts.accurateLipSync"
  | "tts.legacyLipSync"
  | "tts.provider.select"
  | "tts.openai.apiKey"
  | "tts.openai.model"
  | "tts.openaiCompatible.endpoint"
  | "tts.openaiCompatible.apiKey"
  | "tts.openaiCompatible.model"
  | "tts.gptsovitsRemote.endpoint"
  | "tts.gptsovitsRemote.model"
  | "stt.enabled"
  | "stt.provider.select"
  | "stt.openai.apiKey"
  | "stt.openai.model"
  | "stt.openaiCompatible.endpoint"
  | "stt.openaiCompatible.apiKey"
  | "stt.openaiCompatible.model";

export type VAssistSettingsTargetId =
  | VAssistSettingsTabId
  | VAssistSettingsSubTabId
  | VAssistSettingsSectionId
  | VAssistSettingsFieldId;

export type VAssistToolbarActionId =
  | "dictionary-define"
  | "dictionary-synonyms"
  | "dictionary-antonyms"
  | "dictionary-pronunciation"
  | "dictionary-examples"
  | "rewrite-grammar"
  | "rewrite-spelling"
  | "rewrite-moreFormal"
  | "rewrite-moreCasual"
  | "rewrite-professional"
  | "rewrite-shorter"
  | "rewrite-longer"
  | "rewrite-simplify"
  | "rewrite-concise"
  | "rewrite-clarity"
  | "rewrite-custom"
  | "write"
  | "dictation"
  | "summarize-tldr"
  | "summarize-headline"
  | "summarize-key-points"
  | "summarize-teaser"
  | "translate"
  | "detect-language"
  | "image-describe"
  | "image-extract-text"
  | "image-identify-objects"
  | "add-to-chat";

export type VAssistToolbarItemId =
  | VAssistToolbarActionId
  | "insert"
  | "undo"
  | "redo";

export type VAssistLabelId =
  | "chat.emptyState.title"
  | "chat.emptyState.description"
  | "chat.action.settings"
  | "chat.action.history"
  | "chat.action.stop"
  | "chat.action.new"
  | "chat.action.close"
  | "chat.action.hideCharacter"
  | "chat.action.showCharacter"
  | "chat.action.tempEnable"
  | "chat.action.tempDisable"
  | "chat.input.placeholder"
  | "chat.input.send"
  | "chat.input.close"
  | "chat.input.closeVoiceMode"
  | "history.title"
  | "history.searchPlaceholder"
  | "history.emptyState"
  | "settings.title"
  | "settings.managedByHost"
  | "toolbar.dictionary"
  | "toolbar.rewrite"
  | "toolbar.write"
  | "toolbar.dictate"
  | "toolbar.summarize"
  | "toolbar.translate"
  | "toolbar.imageDescribe"
  | "toolbar.addToChat"
  | "toolbar.insert";

export type VAssistBinaryLike = Blob | ArrayBuffer | Uint8Array | number[];

export interface VAssistSettingsPolicy {
  hidden?: VAssistSettingsTargetId[];
  readOnly?: VAssistSettingsTargetId[];
}

export interface VAssistPortalContainersConfig {
  overlays?: VAssistPortalContainerTarget;
  popovers?: VAssistPortalContainerTarget;
  canvas?: VAssistPortalContainerTarget;
}

export interface VAssistBrandingConfig {
  appName?: string;
  labelOverrides?: Partial<Record<VAssistLabelId, string>>;
  iconOverrides?: Record<string, string>;
}

export interface VAssistAIToolbarConfig {
  showOnInputFocus?: boolean;
  showOnImageHover?: boolean;
  visibleItems?: VAssistToolbarItemId[];
  hiddenItems?: VAssistToolbarItemId[];
  itemOrder?: VAssistToolbarItemId[];
}

export interface ResolvedVAssistAIToolbarConfig {
  showOnInputFocus: boolean;
  showOnImageHover: boolean;
  visibleItems: VAssistToolbarItemId[] | null;
  hiddenItems: VAssistToolbarItemId[];
  itemOrder: VAssistToolbarItemId[];
}

export interface VAssistBridgeAIMessage {
  role: string;
  content: unknown;
  [key: string]: unknown;
}

export interface VAssistBridgeAIResult {
  success: boolean;
  response: string | null;
  cancelled?: boolean;
  error?: unknown;
}

export interface VAssistProviderBridgeAI {
  configure?: (config: Record<string, unknown>) => Promise<unknown> | unknown;
  isConfigured?: () => Promise<boolean> | boolean;
  getCurrentProvider?: () => Promise<string | null> | string | null;
  sendMessage: (request: {
    messages: VAssistBridgeAIMessage[];
    options?: Record<string, unknown>;
    signal?: AbortSignal | null;
    onStream?: ((chunk: string) => void) | null;
  }) => Promise<VAssistBridgeAIResult>;
  listModels?: (config: {
    provider: "openai" | "ollama" | "android-local" | "desktop-local";
    endpoint?: string;
    apiKey?: string;
  }) => Promise<{ models: string[]; error?: string }>;
  testConnection?: () => Promise<boolean> | boolean;
  abortRequest?: () => Promise<boolean> | boolean;
}

export interface VAssistProviderBridgeTTS {
  configure?: (config: Record<string, unknown>) => Promise<unknown> | unknown;
  isConfigured?: () => Promise<boolean> | boolean;
  getCurrentProvider?: () => Promise<string | null> | string | null;
  generateSpeech: (request: {
    text: string;
    generateLipSync?: boolean;
  }) => Promise<{
    audio: VAssistBinaryLike;
    mimeType?: string;
    bvmdUrl?: string | null;
  } | null>;
  testConnection?: (request?: { text?: string }) => Promise<boolean> | boolean;
}

export interface VAssistProviderBridgeSTT {
  configure?: (config: Record<string, unknown>) => Promise<unknown> | unknown;
  isConfigured?: () => Promise<boolean> | boolean;
  transcribeAudio: (request: {
    audio: VAssistBinaryLike;
    mimeType?: string;
  }) => Promise<string>;
  testRecording?: (request?: {
    duration?: number;
    deviceId?: string | null;
  }) => Promise<string | boolean> | string | boolean;
}

export interface VAssistProviderBridge {
  ai?: VAssistProviderBridgeAI;
  tts?: VAssistProviderBridgeTTS;
  stt?: VAssistProviderBridgeSTT;
}

export interface VAssistOpenSettingsOptions {
  tab?: VAssistSettingsTabId;
  subTab?: VAssistSettingsSubTabId;
  target?: VAssistSettingsTargetId;
}

export interface VAssistSetDraftOptions {
  append?: boolean;
  focus?: boolean;
}

export interface VAssistSendMessageInput {
  content: string;
  images?: string[];
  audios?: string[];
}

export interface VAssistTriggerToolbarActionOptions {
  prompt?: string;
  targetLanguage?: string | null;
  autoDetectSourceLanguage?: boolean;
}

export interface VAssistRuntimeSnapshotMessage {
  id: string;
  role: string;
  content: string;
  images?: string[];
  audios?: string[];
}

export interface VAssistRuntimeSnapshot {
  hostId: string;
  shellMode: VAssistShellMode;
  draft: string;
  currentChatId: string | null;
  isTempChat: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  isVoiceMode: boolean;
  pendingDropData: boolean;
  panels: {
    chatInputOpen: boolean;
    chatContainerOpen: boolean;
    settingsOpen: boolean;
    historyOpen: boolean;
  };
  messages: VAssistRuntimeSnapshotMessage[];
  embedConfig: ResolvedVAssistEmbedConfig;
  uiConfig: UIConfig;
  aiConfig: AIConfig;
  ttsConfig: TTSConfig;
  sttConfig: STTConfig;
}

export interface VAssistMessageEventPayload {
  messageId: string;
  role: string;
  content: string;
  images?: string[];
  audios?: string[];
}

export interface VAssistEmbedHooks {
  onReady?: () => void;
  onOpen?: () => void;
  onClose?: () => void;
  onRequireSetup?: () => void;
  onMessage?: (payload: VAssistMessageEventPayload) => void;
  onMessageSent?: (payload: VAssistMessageEventPayload) => void;
  onMessageReceived?: (payload: VAssistMessageEventPayload) => void;
}

export interface VAssistThemeTokens {
  surfaceBase?: string;
  surfaceElevated?: string;
  surfaceInteractive?: string;
  surfaceOverlay?: string;
  surfaceHighlight?: string;
  textPrimary?: string;
  textSecondary?: string;
  textMuted?: string;
  borderColor?: string;
  borderStrongColor?: string;
  accentColor?: string;
  accentTextColor?: string;
  shadowColor?: string;
  inputPlaceholderColor?: string;
  focusRingColor?: string;
  statusError?: string;
  statusSuccess?: string;
  statusWarning?: string;
}

export interface VAssistThemeEffects {
  enableBackdropBlur?: boolean;
  enableSurfaceShadows?: boolean;
  enableAmbientOverlay?: boolean;
  backdropBlurPx?: number;
}

export interface VAssistThemeConfig {
  mode?: VAssistThemeMode;
  surfaceStyle?: VAssistThemeSurfaceStyle;
  fontFamily?: string;
  monoFontFamily?: string;
  tokens?: VAssistThemeTokens;
  inverseTokens?: VAssistThemeTokens;
  effects?: VAssistThemeEffects;
}

export interface VAssistEmbedConfig {
  mount?: {
    target?: VAssistMountTarget;
    hostId?: string;
    shadowRoot?: "open" | "closed" | false;
    autoInject?: boolean;
    runtimeIsolation?: VAssistRuntimeIsolationMode;
    portalContainers?: VAssistPortalContainersConfig;
  };
  shell?: {
    mode?: VAssistShellMode;
    deferSetupUntilStarted?: boolean;
    forcePortraitMode?: boolean;
  };
  features?: Partial<Record<VAssistFeatureName, boolean>>;
  settings?: {
    hiddenTabs?: VAssistSettingsTabId[];
    readOnlyTabs?: VAssistSettingsTabId[];
    hiddenFields?: string[];
    policy?: VAssistSettingsPolicy;
  };
  aiToolbar?: VAssistAIToolbarConfig;
  setup?: {
    mode?: VAssistSetupMode;
    allowedSteps?: string[];
  };
  providers?: {
    mode?: VAssistProviderMode;
    ai?: DeepPartial<AIConfig> | null;
    tts?: DeepPartial<TTSConfig> | null;
    stt?: DeepPartial<STTConfig> | null;
    lockProviderSelection?: boolean;
  };
  assets?: {
    preset?: VAssistAssetPreset;
    assetBaseUrl?: string;
    modelUrl?: string | null;
    stageUrl?: string | null;
    motionPack?: string | null;
    resourceLoader?: VAssistResourceLoader;
  };
  storage?: {
    mode?: VAssistStorageMode;
    namespace?: string;
    adapter?: VAssistStorageAdapter;
  };
  theme?: VAssistThemeConfig;
  transport?: {
    mode?: VAssistTransportMode;
    bridge?: VAssistProviderBridge;
  };
  branding?: VAssistBrandingConfig;
  hooks?: VAssistEmbedHooks;
}

export interface ResolvedVAssistEmbedConfig {
  mount: {
    target?: VAssistMountTarget;
    hostId: string;
    shadowRoot: "open" | "closed" | false;
    autoInject: boolean;
    runtimeIsolation: VAssistRuntimeIsolationMode;
    portalContainers: VAssistPortalContainersConfig;
  };
  shell: {
    mode: VAssistShellMode;
    deferSetupUntilStarted: boolean;
    forcePortraitMode: boolean;
  };
  features: Record<VAssistFeatureName, boolean>;
  settings: {
    hiddenTabs: VAssistSettingsTabId[];
    readOnlyTabs: VAssistSettingsTabId[];
    hiddenFields: string[];
    policy: {
      hidden: VAssistSettingsTargetId[];
      readOnly: VAssistSettingsTargetId[];
    };
  };
  aiToolbar: ResolvedVAssistAIToolbarConfig;
  setup: {
    mode: VAssistSetupMode;
    allowedSteps: string[];
  };
  providers: {
    mode: VAssistProviderMode;
    ai: DeepPartial<AIConfig> | null;
    tts: DeepPartial<TTSConfig> | null;
    stt: DeepPartial<STTConfig> | null;
    lockProviderSelection: boolean;
  };
  assets: {
    preset: VAssistAssetPreset;
    assetBaseUrl?: string;
    modelUrl?: string | null;
    stageUrl?: string | null;
    motionPack?: string | null;
    resourceLoader?: VAssistResourceLoader;
  };
  storage: {
    mode: VAssistStorageMode;
    namespace?: string;
    adapter?: VAssistStorageAdapter;
  };
  theme: {
    mode: VAssistThemeMode;
    surfaceStyle: VAssistThemeSurfaceStyle;
    fontFamily: string;
    monoFontFamily: string;
    tokens: VAssistThemeTokens;
    inverseTokens: VAssistThemeTokens;
    effects: {
      enableBackdropBlur: boolean;
      enableSurfaceShadows: boolean;
      enableAmbientOverlay: boolean;
      backdropBlurPx: number;
    };
  };
  transport: {
    mode: VAssistTransportMode;
    bridge?: VAssistProviderBridge;
  };
  branding: VAssistBrandingConfig;
  hooks: VAssistEmbedHooks;
}

export interface VAssistEmbedInjectOptions {
  target?: VAssistMountTarget;
  hostId?: string;
  deferSetupUntilStarted?: boolean;
  config?: VAssistEmbedConfig;
}

export interface VAssistEmbedApi {
  inject: (options?: VAssistEmbedInjectOptions) => HTMLElement;
  remove: (hostId?: string) => void;
  updateConfig: (
    config: VAssistEmbedConfig,
    hostId?: string,
  ) => HTMLElement | null;
  openChat: () => void;
  openSettings: (options?: VAssistOpenSettingsOptions) => void;
  openHistory: () => void;
  setDraftInput: (value: string, options?: VAssistSetDraftOptions) => void;
  sendMessage: (input: VAssistSendMessageInput) => void;
  triggerToolbarAction: (
    action: VAssistToolbarActionId,
    options?: VAssistTriggerToolbarActionOptions,
  ) => void;
  getRuntimeSnapshot: () => VAssistRuntimeSnapshot | null;
  closeChat: () => void;
  toggleVisibility: () => void;
  resetSession: () => void;
}

export interface VAssistEmbedElementHandle extends HTMLElement {
  setConfig: (config: VAssistEmbedConfig) => void;
  getConfig: () => ResolvedVAssistEmbedConfig;
  openChat: () => void;
  openSettings: (options?: VAssistOpenSettingsOptions) => void;
  openHistory: () => void;
  setDraftInput: (value: string, options?: VAssistSetDraftOptions) => void;
  sendMessage: (input: VAssistSendMessageInput) => void;
  triggerToolbarAction: (
    action: VAssistToolbarActionId,
    options?: VAssistTriggerToolbarActionOptions,
  ) => void;
  getRuntimeSnapshot: () => VAssistRuntimeSnapshot | null;
  closeChat: () => void;
  toggleVisibility: () => void;
  resetSession: () => void;
}

export const DEFAULT_VASSIST_EMBED_HOST_ID = "vassist-embed-root";
export const VASSIST_TOOLBAR_ACTIONS: readonly VAssistToolbarActionId[] = [
  "dictionary-define",
  "dictionary-synonyms",
  "dictionary-antonyms",
  "dictionary-pronunciation",
  "dictionary-examples",
  "rewrite-grammar",
  "rewrite-spelling",
  "rewrite-moreFormal",
  "rewrite-moreCasual",
  "rewrite-professional",
  "rewrite-shorter",
  "rewrite-longer",
  "rewrite-simplify",
  "rewrite-concise",
  "rewrite-clarity",
  "rewrite-custom",
  "write",
  "dictation",
  "summarize-tldr",
  "summarize-headline",
  "summarize-key-points",
  "summarize-teaser",
  "translate",
  "detect-language",
  "image-describe",
  "image-extract-text",
  "image-identify-objects",
  "add-to-chat",
];
export const VASSIST_TOOLBAR_ITEMS: readonly VAssistToolbarItemId[] = [
  ...VASSIST_TOOLBAR_ACTIONS,
  "insert",
  "undo",
  "redo",
];
export const VASSIST_SETTINGS_TABS: readonly VAssistSettingsTabId[] = [
  "ui",
  "3d",
  "llm",
  "tts",
  "stt",
  "ai-plus",
];

export const VASSIST_SETTINGS_SUB_TABS: readonly VAssistSettingsSubTabId[] = [
  "llm.provider",
  "llm.routing",
  "llm.profiles",
];

export const VASSIST_SETTINGS_SECTIONS: readonly VAssistSettingsSectionId[] = [
  "ui.appearance",
  "ui.aiToolbar",
  "ui.storage",
  "ui.developer",
  "llm.provider",
  "llm.routing",
  "llm.profiles",
  "tts.provider",
  "tts.remoteProfiles",
  "stt.provider",
  "stt.remoteProfiles",
  "ai-plus.translator",
  "ai-plus.languageDetector",
  "ai-plus.summarizer",
  "ai-plus.rewriter",
  "ai-plus.writer",
];

export const VASSIST_SETTINGS_FIELDS: readonly VAssistSettingsFieldId[] = [
  "ui.aiToolbar.enabled",
  "ui.aiToolbar.showOnInputFocus",
  "ui.aiToolbar.showOnImageHover",
  "llm.provider.select",
  "llm.openai.apiKey",
  "llm.openai.model",
  "llm.ollama.endpoint",
  "llm.ollama.apiKey",
  "llm.ollama.model",
  "llm.routing.visionModel",
  "llm.routing.routerModel",
  "tts.enabled",
  "tts.accurateLipSync",
  "tts.legacyLipSync",
  "tts.provider.select",
  "tts.openai.apiKey",
  "tts.openai.model",
  "tts.openaiCompatible.endpoint",
  "tts.openaiCompatible.apiKey",
  "tts.openaiCompatible.model",
  "tts.gptsovitsRemote.endpoint",
  "tts.gptsovitsRemote.model",
  "stt.enabled",
  "stt.provider.select",
  "stt.openai.apiKey",
  "stt.openai.model",
  "stt.openaiCompatible.endpoint",
  "stt.openaiCompatible.apiKey",
  "stt.openaiCompatible.model",
];

export const VASSIST_SETTINGS_TARGETS: readonly VAssistSettingsTargetId[] = [
  ...VASSIST_SETTINGS_TABS,
  ...VASSIST_SETTINGS_SUB_TABS,
  ...VASSIST_SETTINGS_SECTIONS,
  ...VASSIST_SETTINGS_FIELDS,
];

const SHELL_FEATURE_DEFAULTS: Record<
  VAssistShellMode,
  Record<VAssistFeatureName, boolean>
> = {
  full: {
    chat: true,
    history: true,
    settings: true,
    voiceInput: true,
    voiceCall: true,
    voiceOutput: true,
    aiToolbar: true,
    liveAssistant3d: true,
    camera: true,
    screenShare: true,
  },
  "chat-only": {
    chat: true,
    history: true,
    settings: true,
    voiceInput: true,
    voiceCall: true,
    voiceOutput: true,
    aiToolbar: false,
    liveAssistant3d: false,
    camera: true,
    screenShare: true,
  },
  "chat-toolbar": {
    chat: true,
    history: true,
    settings: true,
    voiceInput: true,
    voiceCall: true,
    voiceOutput: true,
    aiToolbar: true,
    liveAssistant3d: false,
    camera: true,
    screenShare: true,
  },
  "toolbar-only": {
    chat: false,
    history: false,
    settings: false,
    voiceInput: false,
    voiceCall: false,
    voiceOutput: false,
    aiToolbar: true,
    liveAssistant3d: false,
    camera: false,
    screenShare: false,
  },
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const cloneConfigValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneConfigValue(item)) as T;
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};

    for (const [key, entryValue] of Object.entries(value)) {
      result[key] = cloneConfigValue(entryValue);
    }

    return result as T;
  }

  return value;
};

export function normalizeOptionalEmbedAssetValue(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return undefined;
  }

  const normalizedLowerValue = normalizedValue.toLowerCase();
  if (normalizedLowerValue === "undefined") {
    return undefined;
  }

  if (normalizedLowerValue === "null") {
    return null;
  }

  return normalizedValue;
}

export function normalizeOptionalEmbedAssetBaseUrl(
  value: string | undefined,
): string | undefined {
  const normalizedValue = normalizeOptionalEmbedAssetValue(value);
  return typeof normalizedValue === "string" ? normalizedValue : undefined;
}

const uniqueStrings = <T extends string>(
  values: T[] | undefined,
  allowed?: readonly T[],
): T[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  const allowedSet = allowed ? new Set(allowed) : null;
  const seen = new Set<T>();
  const nextValues: T[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    if (allowedSet && !allowedSet.has(value)) {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    nextValues.push(value);
  }

  return nextValues;
};

const DEFAULT_VASSIST_FONT_FAMILY =
  "system-ui, Avenir, Helvetica, Arial, sans-serif";
const DEFAULT_VASSIST_MONO_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const normalizeOptionalFontFamily = (
  value: string | undefined,
): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

export function mergeDeep<T>(base: T, override?: DeepPartial<T> | null): T {
  if (override === undefined || override === null) {
    return cloneConfigValue(base);
  }

  if (Array.isArray(base)) {
    return cloneConfigValue((override as T) ?? base);
  }

  if (!isPlainObject(base) || !isPlainObject(override)) {
    return cloneConfigValue((override as T) ?? base);
  }

  const result: Record<string, unknown> = cloneConfigValue(base);

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }

    const currentValue = result[key];

    if (Array.isArray(value)) {
      result[key] = cloneConfigValue(value);
      continue;
    }

    if (isPlainObject(currentValue) && isPlainObject(value)) {
      result[key] = mergeDeep(currentValue, value);
      continue;
    }

    result[key] = cloneConfigValue(value);
  }

  return result as T;
}

export function getShellFeatureDefaults(
  mode: VAssistShellMode,
): Record<VAssistFeatureName, boolean> {
  return cloneConfigValue(SHELL_FEATURE_DEFAULTS[mode]);
}

export function mergeVAssistEmbedConfig(
  base: VAssistEmbedConfig = {},
  override: VAssistEmbedConfig = {},
): VAssistEmbedConfig {
  return mergeDeep(base, override);
}

export function normalizeVAssistEmbedConfig(
  config: VAssistEmbedConfig = {},
): ResolvedVAssistEmbedConfig {
  const shellMode = config.shell?.mode ?? "full";
  const setupMode =
    config.setup?.mode ??
    (config.shell?.deferSetupUntilStarted ? "deferred" : "full");
  const baseFeatures = getShellFeatureDefaults(shellMode);
  const features: Record<VAssistFeatureName, boolean> = {
    ...baseFeatures,
    ...(config.features ?? {}),
  };

  if (!features.voiceCall) {
    features.camera = false;
    features.screenShare = false;
  }

  if (!features.chat) {
    features.history = false;
    features.settings = false;
  }

  const hiddenTabs = uniqueStrings(
    config.settings?.hiddenTabs,
    VASSIST_SETTINGS_TABS,
  );
  const readOnlyTabs = uniqueStrings(
    config.settings?.readOnlyTabs,
    VASSIST_SETTINGS_TABS,
  );
  const hiddenFields = uniqueStrings(config.settings?.hiddenFields);
  const policyHidden = uniqueStrings(
    config.settings?.policy?.hidden,
    VASSIST_SETTINGS_TARGETS,
  );
  const policyReadOnly = uniqueStrings(
    config.settings?.policy?.readOnly,
    VASSIST_SETTINGS_TARGETS,
  );
  const assetBaseUrl = normalizeOptionalEmbedAssetBaseUrl(
    config.assets?.assetBaseUrl,
  );
  const modelUrl = normalizeOptionalEmbedAssetValue(config.assets?.modelUrl);
  const stageUrl = normalizeOptionalEmbedAssetValue(config.assets?.stageUrl);
  const motionPack = normalizeOptionalEmbedAssetValue(
    config.assets?.motionPack,
  );
  const hasVisibleToolbarItems = Array.isArray(config.aiToolbar?.visibleItems);
  const visibleToolbarItems = hasVisibleToolbarItems
    ? uniqueStrings(config.aiToolbar?.visibleItems, VASSIST_TOOLBAR_ITEMS)
    : null;
  const hiddenToolbarItems = uniqueStrings(
    config.aiToolbar?.hiddenItems,
    VASSIST_TOOLBAR_ITEMS,
  );
  const configuredToolbarItemOrder = uniqueStrings(
    config.aiToolbar?.itemOrder,
    VASSIST_TOOLBAR_ITEMS,
  );
  const toolbarItemOrder: VAssistToolbarItemId[] = [
    ...configuredToolbarItemOrder,
    ...VASSIST_TOOLBAR_ITEMS.filter(
      (itemId) => !configuredToolbarItemOrder.includes(itemId),
    ),
  ];
  const fontFamily =
    normalizeOptionalFontFamily(config.theme?.fontFamily) ??
    DEFAULT_VASSIST_FONT_FAMILY;
  const monoFontFamily =
    normalizeOptionalFontFamily(config.theme?.monoFontFamily) ??
    DEFAULT_VASSIST_MONO_FONT_FAMILY;

  if (!features.liveAssistant3d && !hiddenTabs.includes("3d")) {
    hiddenTabs.push("3d");
  }

  const providerMode = config.providers?.mode ?? "user-configurable";
  const lockProviderSelection =
    config.providers?.lockProviderSelection ??
    providerMode !== "user-configurable";
  const transportMode =
    config.transport?.mode ??
    (config.transport?.bridge ? "host-bridge" : "builtin");

  if (lockProviderSelection) {
    for (const tabId of ["llm", "tts", "stt"] as const) {
      if (!hiddenTabs.includes(tabId) && !readOnlyTabs.includes(tabId)) {
        readOnlyTabs.push(tabId);
      }
    }
  }

  for (const legacyFieldId of hiddenFields) {
    const typedFieldId = legacyFieldId as VAssistSettingsTargetId;
    if (
      VASSIST_SETTINGS_TARGETS.includes(typedFieldId) &&
      !policyHidden.includes(typedFieldId)
    ) {
      policyHidden.push(typedFieldId);
    }
  }

  return {
    mount: {
      ...(config.mount?.target !== undefined
        ? { target: config.mount.target }
        : {}),
      hostId: config.mount?.hostId ?? DEFAULT_VASSIST_EMBED_HOST_ID,
      shadowRoot: config.mount?.shadowRoot ?? "open",
      autoInject: config.mount?.autoInject ?? true,
      runtimeIsolation: config.mount?.runtimeIsolation ?? "shadow-root",
      portalContainers: cloneConfigValue(config.mount?.portalContainers ?? {}),
    },
    shell: {
      mode: shellMode,
      deferSetupUntilStarted:
        config.shell?.deferSetupUntilStarted ?? setupMode === "deferred",
      forcePortraitMode: config.shell?.forcePortraitMode ?? false,
    },
    features,
    settings: {
      hiddenTabs,
      readOnlyTabs,
      hiddenFields,
      policy: {
        hidden: policyHidden,
        readOnly: policyReadOnly,
      },
    },
    aiToolbar: {
      showOnInputFocus: config.aiToolbar?.showOnInputFocus ?? true,
      showOnImageHover: config.aiToolbar?.showOnImageHover ?? true,
      visibleItems: visibleToolbarItems,
      hiddenItems: hiddenToolbarItems,
      itemOrder: toolbarItemOrder,
    },
    setup: {
      mode: setupMode,
      allowedSteps: uniqueStrings(config.setup?.allowedSteps),
    },
    providers: {
      mode: providerMode,
      ai: config.providers?.ai ?? null,
      tts: config.providers?.tts ?? null,
      stt: config.providers?.stt ?? null,
      lockProviderSelection,
    },
    assets: {
      preset:
        config.assets?.preset ??
        (features.liveAssistant3d ? "default" : "none"),
      ...(assetBaseUrl ? { assetBaseUrl } : {}),
      ...(modelUrl !== undefined ? { modelUrl } : {}),
      ...(stageUrl !== undefined ? { stageUrl } : {}),
      ...(motionPack !== undefined ? { motionPack } : {}),
      ...(config.assets?.resourceLoader !== undefined
        ? { resourceLoader: config.assets.resourceLoader }
        : {}),
    },
    storage: {
      mode: config.storage?.mode ?? "default",
      ...(config.storage?.namespace
        ? { namespace: config.storage.namespace }
        : {}),
      ...(config.storage?.adapter !== undefined
        ? { adapter: config.storage.adapter }
        : {}),
    },
    theme: {
      mode: config.theme?.mode ?? "adaptive",
      surfaceStyle: config.theme?.surfaceStyle ?? "glass",
      fontFamily,
      monoFontFamily,
      tokens: cloneConfigValue(config.theme?.tokens ?? {}),
      inverseTokens: cloneConfigValue(config.theme?.inverseTokens ?? {}),
      effects: {
        enableBackdropBlur: config.theme?.effects?.enableBackdropBlur ?? true,
        enableSurfaceShadows:
          config.theme?.effects?.enableSurfaceShadows ?? true,
        enableAmbientOverlay:
          config.theme?.effects?.enableAmbientOverlay ?? true,
        backdropBlurPx: Math.max(
          0,
          config.theme?.effects?.backdropBlurPx ?? 16,
        ),
      },
    },
    transport: {
      mode: transportMode,
      ...(config.transport?.bridge !== undefined
        ? { bridge: config.transport.bridge }
        : {}),
    },
    branding: cloneConfigValue(config.branding ?? {}),
    hooks: config.hooks ?? {},
  };
}

export function shouldSkipSetupForEmbed(
  config: ResolvedVAssistEmbedConfig,
): boolean {
  if (config.setup.mode === "hidden" || config.setup.mode === "custom") {
    return true;
  }

  if (config.transport.mode === "host-bridge" && config.transport.bridge) {
    return true;
  }

  return (
    config.providers.mode !== "user-configurable" &&
    !!(config.providers.ai || config.providers.tts || config.providers.stt)
  );
}

export function hasManagedProviderConfig(
  config: ResolvedVAssistEmbedConfig,
): boolean {
  return !!(
    config.providers.ai ||
    config.providers.tts ||
    config.providers.stt ||
    config.transport.bridge
  );
}
