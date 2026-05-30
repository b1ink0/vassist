import type { AIConfig, STTConfig, TTSConfig } from "../config/aiConfig";
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
export type VAssistTransportMode = "builtin" | "openai-compatible" | "custom";
export type VAssistThemeMode = "adaptive" | "light" | "dark";
export type VAssistThemeSurfaceStyle = "glass" | "flat";
export type VAssistStorageAdapter = StorageAdapterSelection;
export type VAssistResourceLoader = ResourceLoaderSelection;
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
  };
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
  };
  hooks?: VAssistEmbedHooks;
}

export interface ResolvedVAssistEmbedConfig {
  mount: {
    target?: VAssistMountTarget;
    hostId: string;
    shadowRoot: "open" | "closed" | false;
    autoInject: boolean;
    runtimeIsolation: VAssistRuntimeIsolationMode;
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
  };
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
  };
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
  closeChat: () => void;
  toggleVisibility: () => void;
  resetSession: () => void;
}

export interface VAssistEmbedElementHandle extends HTMLElement {
  setConfig: (config: VAssistEmbedConfig) => void;
  getConfig: () => ResolvedVAssistEmbedConfig;
  openChat: () => void;
  closeChat: () => void;
  toggleVisibility: () => void;
  resetSession: () => void;
}

export const DEFAULT_VASSIST_EMBED_HOST_ID = "vassist-embed-root";
export const VASSIST_SETTINGS_TABS: readonly VAssistSettingsTabId[] = [
  "ui",
  "3d",
  "llm",
  "tts",
  "stt",
  "ai-plus",
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
  const assetBaseUrl = normalizeOptionalEmbedAssetBaseUrl(
    config.assets?.assetBaseUrl,
  );
  const modelUrl = normalizeOptionalEmbedAssetValue(config.assets?.modelUrl);
  const stageUrl = normalizeOptionalEmbedAssetValue(config.assets?.stageUrl);
  const motionPack = normalizeOptionalEmbedAssetValue(
    config.assets?.motionPack,
  );

  if (!features.liveAssistant3d && !hiddenTabs.includes("3d")) {
    hiddenTabs.push("3d");
  }

  const providerMode = config.providers?.mode ?? "user-configurable";
  const lockProviderSelection =
    config.providers?.lockProviderSelection ??
    providerMode !== "user-configurable";

  if (lockProviderSelection) {
    for (const tabId of ["llm", "tts", "stt"] as const) {
      if (!hiddenTabs.includes(tabId) && !readOnlyTabs.includes(tabId)) {
        readOnlyTabs.push(tabId);
      }
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
      mode: config.transport?.mode ?? "builtin",
    },
    hooks: config.hooks ?? {},
  };
}

export function shouldSkipSetupForEmbed(
  config: ResolvedVAssistEmbedConfig,
): boolean {
  if (config.setup.mode === "hidden" || config.setup.mode === "custom") {
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
    config.providers.stt
  );
}
