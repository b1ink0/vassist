import type { ReactNode } from "react";
import DesktopWindowControls from "./DesktopWindowControls";
import DesktopWindowInteractivityBridge from "./DesktopWindowInteractivityBridge";
import {
  isDesktopWallpaperRendererWindow,
  isAppModeWindow,
} from "../../utils/PlatformUtils";

export default function DesktopModeSurface({
  children,
}: {
  children: ReactNode;
}) {
  const isAppMode = isAppModeWindow;
  const isWallpaper = isDesktopWallpaperRendererWindow;

  return (
    <>
      {!isAppMode && !isWallpaper && <DesktopWindowInteractivityBridge />}
      <div
        className={
          isAppMode
            ? "vassist-app-mode-window relative w-full h-screen overflow-hidden"
            : isWallpaper
              ? "vassist-live-wallpaper relative w-full h-screen overflow-hidden"
              : "relative w-full h-screen overflow-hidden"
        }
      >
        {isAppMode && <DesktopWindowControls />}
        {children}
      </div>
    </>
  );
}
