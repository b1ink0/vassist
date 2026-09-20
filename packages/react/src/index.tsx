import {
  useEffect,
  useId,
  useMemo,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import {
  injectVAssistEmbed,
  removeVAssistEmbed,
  updateVAssistEmbedConfig,
} from "../../../embed/main";
import {
  clearVAssistReactCustomizations,
  registerVAssistReactCustomizations,
  type VAssistReactCustomizations,
} from "../../../src/embed/reactHostCustomizations";
import {
  mergeVAssistEmbedConfig,
  type VAssistEmbedConfig,
} from "../../../src/embed/config";

export type VAssistEmbedProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  config?: VAssistEmbedConfig;
  defaultConfig?: VAssistEmbedConfig;
  hostId?: string;
  customizations?: VAssistReactCustomizations;
  style?: CSSProperties;
};

export function VAssistEmbed({
  config,
  defaultConfig,
  hostId,
  customizations,
  style,
  ...divProps
}: VAssistEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId().replace(/[:]/g, "");
  const resolvedHostId = hostId ?? `vassist-react-${reactId}`;
  const mergedConfig = useMemo(
    () => mergeVAssistEmbedConfig(defaultConfig ?? {}, config ?? {}),
    [config, defaultConfig],
  );

  useEffect(() => {
    return () => {
      clearVAssistReactCustomizations(resolvedHostId);
      removeVAssistEmbed(resolvedHostId);
    };
  }, [resolvedHostId]);

  useEffect(() => {
    if (customizations) {
      registerVAssistReactCustomizations(resolvedHostId, customizations);
      return () => {
        clearVAssistReactCustomizations(resolvedHostId);
      };
    }

    clearVAssistReactCustomizations(resolvedHostId);

    return () => {
      clearVAssistReactCustomizations(resolvedHostId);
    };
  }, [customizations, resolvedHostId]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const instanceConfig = mergeVAssistEmbedConfig(mergedConfig, {
      mount: {
        target: containerRef.current,
        hostId: resolvedHostId,
      },
    });

    const existingHost = updateVAssistEmbedConfig(
      instanceConfig,
      resolvedHostId,
    );

    if (!existingHost) {
      injectVAssistEmbed({
        target: containerRef.current,
        hostId: resolvedHostId,
        config: instanceConfig,
      });
    }
  }, [mergedConfig, resolvedHostId]);

  return <div ref={containerRef} style={style} {...divProps} />;
}

export {
  DEFAULT_VASSIST_EMBED_HOST_ID,
  VASSIST_TOOLBAR_ACTIONS,
  VASSIST_TOOLBAR_ITEMS,
  mergeVAssistEmbedConfig,
  normalizeVAssistEmbedConfig,
  type DeepPartial,
  type ResolvedVAssistAIToolbarConfig,
  type ResolvedVAssistEmbedConfig,
  type VAssistAIToolbarConfig,
  type VAssistBinaryLike,
  type VAssistBrandingConfig,
  type VAssistEmbedApi,
  type VAssistEmbedConfig,
  type VAssistEmbedElementHandle,
  type VAssistEmbedHooks,
  type VAssistEmbedInjectOptions,
  type VAssistFeatureName,
  type VAssistLabelId,
  type VAssistMessageEventPayload,
  type VAssistOpenSettingsOptions,
  type VAssistPortalContainerId,
  type VAssistPortalContainerTarget,
  type VAssistPortalContainersConfig,
  type VAssistProviderBridge,
  type VAssistProviderBridgeAI,
  type VAssistProviderBridgeSTT,
  type VAssistProviderBridgeTTS,
  type VAssistProviderMode,
  type VAssistResourceLoader,
  type VAssistRuntimeIsolationMode,
  type VAssistRuntimeSnapshot,
  type VAssistRuntimeSnapshotMessage,
  type VAssistSendMessageInput,
  type VAssistSetDraftOptions,
  type VAssistSettingsFieldId,
  type VAssistSettingsPolicy,
  type VAssistSettingsSectionId,
  type VAssistSettingsSubTabId,
  type VAssistThemeConfig,
  type VAssistThemeEffects,
  type VAssistThemeMode,
  type VAssistToolbarActionId,
  type VAssistToolbarItemId,
  type VAssistTriggerToolbarActionOptions,
  type VAssistSettingsTabId,
  type VAssistSettingsTargetId,
  type VAssistShellMode,
  type VAssistStorageAdapter,
  type VAssistStorageMode,
  type VAssistThemeSurfaceStyle,
  type VAssistThemeTokens,
  type VAssistTransportMode,
} from "../../../src/embed/config";

export {
  clearVAssistReactCustomizations,
  getVAssistReactCustomizations,
  registerVAssistReactCustomizations,
} from "../../../src/embed/reactHostCustomizations";

export type {
  VAssistReactCustomizations,
  VAssistReactEmptyStateContext,
  VAssistReactFooterContext,
  VAssistReactHeaderActionsContext,
  VAssistReactIconProps,
  VAssistReactSettingsExtensionContext,
  VAssistReactToolbarActionsContext,
} from "../../../src/embed/reactHostCustomizations";

export {
  createStorageManager,
  createMemoryStorageAdapter,
  DexieStorageAdapter,
  MemoryStorageAdapter,
  getDefaultStorageAdapter,
  getRegisteredStorageAdapter,
  listRegisteredStorageAdapters,
  registerStorageAdapter,
  resolveStorageAdapter,
  setDefaultStorageAdapter,
  type StorageAdapterLike,
  type StorageAdapterSelection,
  type StorageMetadata,
  type StorageRecord,
  type StorageStats,
  type StorageTableName,
} from "../../../src/storage";

export {
  DefaultResourceLoader,
  builtinResourceLoader,
  getRegisteredResourceLoader,
  listRegisteredResourceLoaders,
  registerResourceLoader,
  resolveResourceLoader,
  resourceLoader,
  setDefaultResourceLoader,
  type ResourceLoaderAdapterLike,
  type ResourceLoaderSelection,
} from "../../../src/utils/ResourceLoader";
