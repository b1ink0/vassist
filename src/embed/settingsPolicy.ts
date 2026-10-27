import type {
  ResolvedVAssistEmbedConfig,
  VAssistSettingsTabId,
  VAssistSettingsTargetId,
} from "./config";
import { VASSIST_SETTINGS_TABS } from "./config";

const getOwningTab = (
  targetId: VAssistSettingsTargetId,
): VAssistSettingsTabId | undefined => {
  const root = targetId.split(".")[0] as VAssistSettingsTabId;
  return VASSIST_SETTINGS_TABS.includes(root) ? root : undefined;
};

export function isSettingsTargetHidden(
  config: ResolvedVAssistEmbedConfig,
  targetId: VAssistSettingsTargetId,
): boolean {
  const owningTab = getOwningTab(targetId);
  return (
    config.settings.policy.hidden.includes(targetId) ||
    (owningTab !== undefined && config.settings.hiddenTabs.includes(owningTab))
  );
}

export function isSettingsTargetReadOnly(
  config: ResolvedVAssistEmbedConfig,
  targetId: VAssistSettingsTargetId,
): boolean {
  const owningTab = getOwningTab(targetId);
  return (
    config.settings.policy.readOnly.includes(targetId) ||
    (owningTab !== undefined &&
      config.settings.readOnlyTabs.includes(owningTab))
  );
}
