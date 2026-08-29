import type {
  ResolvedVAssistEmbedConfig,
  VAssistPortalContainerId,
  VAssistPortalContainerTarget,
} from "./config";

export function resolvePortalContainerTarget(
  target: VAssistPortalContainerTarget | undefined,
): HTMLElement | ShadowRoot | null | undefined {
  if (target === undefined || target === null) {
    return target;
  }

  if (typeof target === "string") {
    if (typeof document === "undefined") {
      return undefined;
    }
    return document.querySelector<HTMLElement>(target) ?? undefined;
  }

  return target;
}

export function resolveConfiguredPortalContainer(
  config: ResolvedVAssistEmbedConfig,
  containerId: VAssistPortalContainerId,
  fallback?: HTMLElement | ShadowRoot | null,
): HTMLElement | ShadowRoot | null | undefined {
  const configuredTarget = config.mount.portalContainers[containerId];
  const resolvedTarget = resolvePortalContainerTarget(configuredTarget);
  return resolvedTarget === undefined ? fallback : resolvedTarget;
}
