import type { ResolvedVAssistEmbedConfig, VAssistLabelId } from "./config";

export function getBrandedLabel(
  config: ResolvedVAssistEmbedConfig,
  labelId: VAssistLabelId,
  fallback: string,
): string {
  const override = config.branding.labelOverrides?.[labelId]?.trim();
  return override || fallback;
}

export function getBrandedIconUrl(
  config: ResolvedVAssistEmbedConfig,
  iconName: string,
): string | null {
  const override = config.branding.iconOverrides?.[iconName];
  return typeof override === "string" && override.trim() ? override : null;
}
