import type { ReactNode } from "react";
import DesktopWindowControls from "./DesktopWindowControls";
import DesktopWindowInteractivityBridge from "./DesktopWindowInteractivityBridge";
import DesktopBackground from "./DesktopBackground";
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
        <DesktopBackground />
        {isAppMode && <DesktopWindowControls />}
        {children}
      </div>
    </>
  );
}
