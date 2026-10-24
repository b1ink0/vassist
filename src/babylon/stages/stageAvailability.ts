import {
  isAndroid,
  isAppModeWindow,
  isDesktop,
  isLiveWallpaperWindow,
} from "../../utils/PlatformUtils";

/** Environment stages belong to native app and wallpaper surfaces. */
export const canRenderStages =
  isAndroid || (isDesktop && (isAppModeWindow || isLiveWallpaperWindow));

export function canConfigureStages(desktopMode: string): boolean {
  return (
    isAndroid ||
    (isDesktop && (desktopMode === "app" || desktopMode === "live-wallpaper"))
  );
}
