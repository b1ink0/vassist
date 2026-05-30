import type { CSSProperties } from "react";
import type { ResolvedVAssistEmbedConfig, VAssistThemeTokens } from "./config";

const DEFAULT_THEME_TOKENS: Required<VAssistThemeTokens> = {
  surfaceBase: "rgba(255, 255, 255, 0.12)",
  surfaceElevated: "rgba(255, 255, 255, 0.18)",
  surfaceInteractive: "rgba(255, 255, 255, 0.22)",
  surfaceOverlay: "rgba(10, 10, 14, 0.62)",
  surfaceHighlight: "rgba(255, 255, 255, 0.16)",
  textPrimary: "rgba(255, 255, 255, 0.96)",
  textSecondary: "rgba(255, 255, 255, 0.78)",
  textMuted: "rgba(255, 255, 255, 0.58)",
  borderColor: "rgba(255, 255, 255, 0.24)",
  borderStrongColor: "rgba(255, 255, 255, 0.34)",
  accentColor: "rgba(96, 165, 250, 0.82)",
  accentTextColor: "#ffffff",
  shadowColor: "rgba(0, 0, 0, 0.35)",
  inputPlaceholderColor: "rgba(255, 255, 255, 0.46)",
  focusRingColor: "rgba(96, 165, 250, 0.45)",
  statusError: "rgba(239, 68, 68, 0.34)",
  statusSuccess: "rgba(34, 197, 94, 0.28)",
  statusWarning: "rgba(251, 191, 36, 0.3)",
};

const DEFAULT_INVERSE_THEME_TOKENS: Required<VAssistThemeTokens> = {
  surfaceBase: "rgba(10, 10, 14, 0.78)",
  surfaceElevated: "rgba(10, 10, 14, 0.86)",
  surfaceInteractive: "rgba(22, 22, 30, 0.9)",
  surfaceOverlay: "rgba(0, 0, 0, 0.58)",
  surfaceHighlight: "rgba(255, 255, 255, 0.12)",
  textPrimary: "rgba(255, 255, 255, 0.98)",
  textSecondary: "rgba(255, 255, 255, 0.82)",
  textMuted: "rgba(255, 255, 255, 0.62)",
  borderColor: "rgba(255, 255, 255, 0.18)",
  borderStrongColor: "rgba(255, 255, 255, 0.28)",
  accentColor: "rgba(96, 165, 250, 0.88)",
  accentTextColor: "#ffffff",
  shadowColor: "rgba(0, 0, 0, 0.5)",
  inputPlaceholderColor: "rgba(255, 255, 255, 0.44)",
  focusRingColor: "rgba(96, 165, 250, 0.5)",
  statusError: "rgba(239, 68, 68, 0.38)",
  statusSuccess: "rgba(34, 197, 94, 0.32)",
  statusWarning: "rgba(251, 191, 36, 0.34)",
};

type ThemeStyleMap = CSSProperties & Record<`--${string}`, string>;

const toResolvedThemeTokens = (
  base: Required<VAssistThemeTokens>,
  override: VAssistThemeTokens,
): Required<VAssistThemeTokens> => ({
  ...base,
  ...override,
});

const applyTokenVariables = (
  style: ThemeStyleMap,
  prefix: string,
  tokens: Required<VAssistThemeTokens>,
) => {
  style[`--vassist-${prefix}surface-base`] = tokens.surfaceBase;
  style[`--vassist-${prefix}surface-elevated`] = tokens.surfaceElevated;
  style[`--vassist-${prefix}surface-interactive`] = tokens.surfaceInteractive;
  style[`--vassist-${prefix}surface-overlay`] = tokens.surfaceOverlay;
  style[`--vassist-${prefix}surface-highlight`] = tokens.surfaceHighlight;
  style[`--vassist-${prefix}text-primary`] = tokens.textPrimary;
  style[`--vassist-${prefix}text-secondary`] = tokens.textSecondary;
  style[`--vassist-${prefix}text-muted`] = tokens.textMuted;
  style[`--vassist-${prefix}border-color`] = tokens.borderColor;
  style[`--vassist-${prefix}border-strong-color`] = tokens.borderStrongColor;
  style[`--vassist-${prefix}accent-color`] = tokens.accentColor;
  style[`--vassist-${prefix}accent-text-color`] = tokens.accentTextColor;
  style[`--vassist-${prefix}shadow-color`] = tokens.shadowColor;
  style[`--vassist-${prefix}input-placeholder-color`] =
    tokens.inputPlaceholderColor;
  style[`--vassist-${prefix}focus-ring-color`] = tokens.focusRingColor;
  style[`--vassist-${prefix}status-error`] = tokens.statusError;
  style[`--vassist-${prefix}status-success`] = tokens.statusSuccess;
  style[`--vassist-${prefix}status-warning`] = tokens.statusWarning;
};

export interface VAssistThemeRootAttributes {
  style: ThemeStyleMap;
  colorScheme: "light" | "dark";
  surfaceStyle: ResolvedVAssistEmbedConfig["theme"]["surfaceStyle"];
  mode: ResolvedVAssistEmbedConfig["theme"]["mode"];
}

export const getVAssistThemeRootAttributes = (
  embedConfig: ResolvedVAssistEmbedConfig,
): VAssistThemeRootAttributes => {
  const { theme } = embedConfig;
  const tokens = toResolvedThemeTokens(DEFAULT_THEME_TOKENS, theme.tokens);
  const inverseTokens = toResolvedThemeTokens(
    DEFAULT_INVERSE_THEME_TOKENS,
    theme.inverseTokens,
  );
  const backdropBlurPx =
    theme.surfaceStyle === "flat" || !theme.effects.enableBackdropBlur
      ? 0
      : theme.effects.backdropBlurPx;

  const style = {
    colorScheme: theme.mode === "light" ? "light" : "dark",
    "--vassist-font-family": theme.fontFamily,
    "--vassist-mono-font-family": theme.monoFontFamily,
    "--vassist-backdrop-blur": `${backdropBlurPx}px`,
    "--vassist-surface-shadow": theme.effects.enableSurfaceShadows
      ? `0 8px 32px 0 ${tokens.shadowColor}`
      : "none",
    "--vassist-surface-shadow-strong": theme.effects.enableSurfaceShadows
      ? `0 12px 40px 0 ${inverseTokens.shadowColor}`
      : "none",
    "--vassist-ambient-overlay-opacity": theme.effects.enableAmbientOverlay
      ? "1"
      : "0",
    "--vassist-modal-backdrop": "rgba(0, 0, 0, 0.54)",
    "--vassist-overlay-scrim": theme.effects.enableAmbientOverlay
      ? tokens.surfaceOverlay
      : "rgba(0, 0, 0, 0.24)",
    "--vassist-panel-radius": "0.75rem",
    "--vassist-panel-radius-large": "1.5rem",
  } as ThemeStyleMap;

  applyTokenVariables(style, "", tokens);
  applyTokenVariables(style, "inverse-", inverseTokens);

  return {
    style,
    colorScheme: theme.mode === "light" ? "light" : "dark",
    surfaceStyle: theme.surfaceStyle,
    mode: theme.mode,
  };
};
