import {
  isAndroid,
  isAppModeWindow,
  isDesktop,
  isLiveWallpaperWindow,
  isXR,
} from "../../utils/PlatformUtils";

/** Environment stages belong to native app and wallpaper surfaces. */
export const canRenderStages =
  isXR ||
  isAndroid ||
  (isDesktop && (isAppModeWindow || isLiveWallpaperWindow));

export function canConfigureStages(desktopMode: string): boolean {
  return (
    isXR ||
    isAndroid ||
    (isDesktop && (desktopMode === "app" || desktopMode === "live-wallpaper"))
  );
}
