import { create } from "zustand";
import {
  DEFAULT_VASSIST_EMBED_HOST_ID,
  mergeVAssistEmbedConfig,
  normalizeVAssistEmbedConfig,
  type ResolvedVAssistEmbedConfig,
  type VAssistEmbedConfig,
  type VAssistFeatureName,
  type VAssistMessageEventPayload,
  type VAssistSettingsTabId,
} from "./config";

type EmbedHostEventName =
  | "ready"
  | "open"
  | "close"
  | "require-setup"
  | "message"
  | "message-sent"
  | "message-received";

interface EmbedRuntimeState {
  rawConfig: VAssistEmbedConfig;
  config: ResolvedVAssistEmbedConfig;
  rawConfigsByHostId: Record<string, VAssistEmbedConfig>;
  configsByHostId: Record<string, ResolvedVAssistEmbedConfig>;
  activeHostId: string;
  setConfig: (
    config?: VAssistEmbedConfig,
    hostId?: string,
  ) => ResolvedVAssistEmbedConfig;
  setResolvedConfig: (
    config: ResolvedVAssistEmbedConfig,
    hostId?: string,
  ) => ResolvedVAssistEmbedConfig;
  updateConfig: (
    config: VAssistEmbedConfig,
    hostId?: string,
  ) => ResolvedVAssistEmbedConfig;
  resetConfig: (hostId?: string) => ResolvedVAssistEmbedConfig;
  setActiveHostId: (hostId?: string) => ResolvedVAssistEmbedConfig;
}

const EMPTY_CONFIG: VAssistEmbedConfig = {};
const DEFAULT_RESOLVED_CONFIG = normalizeVAssistEmbedConfig();

const resolveHostId = (
  config: VAssistEmbedConfig | ResolvedVAssistEmbedConfig | undefined,
  fallbackHostId?: string,
) => config?.mount?.hostId ?? fallbackHostId ?? DEFAULT_VASSIST_EMBED_HOST_ID;

export const useEmbedRuntimeStore = create<EmbedRuntimeState>((set, get) => ({
  rawConfig: EMPTY_CONFIG,
  config: DEFAULT_RESOLVED_CONFIG,
  rawConfigsByHostId: {
    [DEFAULT_VASSIST_EMBED_HOST_ID]: EMPTY_CONFIG,
  },
  configsByHostId: {
    [DEFAULT_VASSIST_EMBED_HOST_ID]: DEFAULT_RESOLVED_CONFIG,
  },
  activeHostId: DEFAULT_VASSIST_EMBED_HOST_ID,
  setConfig: (config = {}, hostId) => {
    const resolved = normalizeVAssistEmbedConfig(config);
    const targetHostId = resolveHostId(resolved, hostId);
    set((state) => ({
      rawConfig: config,
      config: resolved,
      rawConfigsByHostId: {
        ...state.rawConfigsByHostId,
        [targetHostId]: config,
      },
      configsByHostId: {
        ...state.configsByHostId,
        [targetHostId]: resolved,
      },
      activeHostId: targetHostId,
    }));
    return resolved;
  },
  setResolvedConfig: (config, hostId) => {
    const targetHostId = resolveHostId(config, hostId);
    set((state) => ({
      config,
      configsByHostId: {
        ...state.configsByHostId,
        [targetHostId]: config,
      },
      activeHostId: targetHostId,
    }));
    return config;
  },
  updateConfig: (config, hostId) => {
    const state = get();
    const targetHostId = resolveHostId(config, hostId ?? state.activeHostId);
    const currentRawConfig =
      state.rawConfigsByHostId[targetHostId] ?? EMPTY_CONFIG;
    const nextRawConfig = mergeVAssistEmbedConfig(currentRawConfig, config);
    const resolved = normalizeVAssistEmbedConfig(nextRawConfig);
    set((currentState) => ({
      rawConfig: nextRawConfig,
      config: resolved,
      rawConfigsByHostId: {
        ...currentState.rawConfigsByHostId,
        [targetHostId]: nextRawConfig,
      },
      configsByHostId: {
        ...currentState.configsByHostId,
        [targetHostId]: resolved,
      },
      activeHostId: targetHostId,
    }));
    return resolved;
  },
  resetConfig: (hostId) => {
    const state = get();
    const targetHostId = hostId ?? state.activeHostId;
    const resolved = normalizeVAssistEmbedConfig({
      mount: { hostId: targetHostId },
    });
    set((currentState) => ({
      rawConfig: EMPTY_CONFIG,
      config: resolved,
      rawConfigsByHostId: {
        ...currentState.rawConfigsByHostId,
        [targetHostId]: EMPTY_CONFIG,
      },
      configsByHostId: {
        ...currentState.configsByHostId,
        [targetHostId]: resolved,
      },
      activeHostId: targetHostId,
    }));
    return resolved;
  },
  setActiveHostId: (hostId) => {
    const state = get();
    const targetHostId = hostId ?? state.activeHostId;
    const resolved =
      state.configsByHostId[targetHostId] ?? DEFAULT_RESOLVED_CONFIG;
    const rawConfig = state.rawConfigsByHostId[targetHostId] ?? EMPTY_CONFIG;
    set({
      activeHostId: targetHostId,
      config: resolved,
      rawConfig,
    });
    return resolved;
  },
}));

export const getEmbedConfig = (hostId?: string): ResolvedVAssistEmbedConfig => {
  const state = useEmbedRuntimeStore.getState();
  const targetHostId = hostId ?? state.activeHostId;
  return state.configsByHostId[targetHostId] ?? state.config;
};

export const getRawEmbedConfig = (hostId?: string): VAssistEmbedConfig => {
  const state = useEmbedRuntimeStore.getState();
  const targetHostId = hostId ?? state.activeHostId;
  return state.rawConfigsByHostId[targetHostId] ?? state.rawConfig;
};

export const setEmbedConfig = (
  config?: VAssistEmbedConfig,
  hostId?: string,
): ResolvedVAssistEmbedConfig =>
  useEmbedRuntimeStore.getState().setConfig(config, hostId);

export const setResolvedEmbedConfig = (
  config: ResolvedVAssistEmbedConfig,
  hostId?: string,
): ResolvedVAssistEmbedConfig =>
  useEmbedRuntimeStore.getState().setResolvedConfig(config, hostId);

export const updateEmbedConfig = (
  config: VAssistEmbedConfig,
  hostId?: string,
): ResolvedVAssistEmbedConfig =>
  useEmbedRuntimeStore.getState().updateConfig(config, hostId);

export const resetEmbedConfig = (hostId?: string): ResolvedVAssistEmbedConfig =>
  useEmbedRuntimeStore.getState().resetConfig(hostId);

export const setActiveEmbedHostId = (
  hostId?: string,
): ResolvedVAssistEmbedConfig =>
  useEmbedRuntimeStore.getState().setActiveHostId(hostId);

export const isEmbedFeatureEnabled = (feature: VAssistFeatureName): boolean =>
  getEmbedConfig().features[feature];

export const isEmbedSettingsTabHidden = (
  tabId: VAssistSettingsTabId,
): boolean => getEmbedConfig().settings.hiddenTabs.includes(tabId);

export const isEmbedSettingsTabReadOnly = (
  tabId: VAssistSettingsTabId,
): boolean => getEmbedConfig().settings.readOnlyTabs.includes(tabId);

export const emitEmbedHostEvent = (
  eventName: EmbedHostEventName,
  detail?: VAssistMessageEventPayload,
  hostId?: string,
): void => {
  const { hooks } = getEmbedConfig(hostId);

  switch (eventName) {
    case "ready":
      hooks.onReady?.();
      break;
    case "open":
      hooks.onOpen?.();
      break;
    case "close":
      hooks.onClose?.();
      break;
    case "require-setup":
      hooks.onRequireSetup?.();
      break;
    case "message":
      if (detail) {
        hooks.onMessage?.(detail);
      }
      break;
    case "message-sent":
      if (detail) {
        hooks.onMessageSent?.(detail);
      }
      break;
    case "message-received":
      if (detail) {
        hooks.onMessageReceived?.(detail);
      }
      break;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(
        `vassist:${eventName}`,
        detail === undefined ? undefined : { detail },
      ),
    );
  }
};
