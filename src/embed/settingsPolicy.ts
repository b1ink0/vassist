import type {
  ResolvedVAssistEmbedConfig,
  VAssistSettingsTabId,
  VAssistSettingsTargetId,
} from "./config";

export function isSettingsTargetHidden(
  config: ResolvedVAssistEmbedConfig,
  targetId: VAssistSettingsTargetId,
): boolean {
  return (
    config.settings.policy.hidden.includes(targetId) ||
    config.settings.hiddenTabs.includes(targetId as VAssistSettingsTabId)
  );
}

export function isSettingsTargetReadOnly(
  config: ResolvedVAssistEmbedConfig,
  targetId: VAssistSettingsTargetId,
): boolean {
  return (
    config.settings.policy.readOnly.includes(targetId) ||
    config.settings.readOnlyTabs.includes(targetId as VAssistSettingsTabId)
  );
}
