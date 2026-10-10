export type DesktopMode = "floating-app" | "app" | "live-wallpaper";

export type LiveWallpaperInteraction = "non-interactive" | "interactive";
export type DesktopControlPlacement = "attached" | "detached";

export type DesktopModeRequest = {
  mode: DesktopMode;
  liveWallpaperInteraction?: LiveWallpaperInteraction;
  controlPlacement?: DesktopControlPlacement;
};

export function isLiveWallpaperInteraction(
  value: unknown,
): value is LiveWallpaperInteraction {
  return value === "non-interactive" || value === "interactive";
}

export function isDesktopMode(value: unknown): value is DesktopMode {
  return (
    value === "floating-app" || value === "app" || value === "live-wallpaper"
  );
}

export function isDesktopControlPlacement(
  value: unknown,
): value is DesktopControlPlacement {
  return value === "attached" || value === "detached";
}
