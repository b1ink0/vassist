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
  style?: CSSProperties;
};

export function VAssistEmbed({
  config,
  defaultConfig,
  hostId,
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
      removeVAssistEmbed(resolvedHostId);
    };
  }, [resolvedHostId]);

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
  mergeVAssistEmbedConfig,
  normalizeVAssistEmbedConfig,
  type DeepPartial,
  type ResolvedVAssistEmbedConfig,
  type VAssistEmbedApi,
  type VAssistEmbedConfig,
  type VAssistEmbedElementHandle,
  type VAssistEmbedHooks,
  type VAssistEmbedInjectOptions,
  type VAssistFeatureName,
  type VAssistMessageEventPayload,
  type VAssistProviderMode,
  type VAssistResourceLoader,
  type VAssistRuntimeIsolationMode,
  type VAssistThemeConfig,
  type VAssistThemeEffects,
  type VAssistThemeMode,
  type VAssistSettingsTabId,
  type VAssistShellMode,
  type VAssistStorageAdapter,
  type VAssistStorageMode,
  type VAssistThemeSurfaceStyle,
  type VAssistThemeTokens,
  type VAssistTransportMode,
} from "../../../src/embed/config";

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
