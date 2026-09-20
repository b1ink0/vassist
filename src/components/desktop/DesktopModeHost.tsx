import type { ReactNode } from "react";
import DesktopModeController from "./DesktopModeController";
import DesktopModeSurface from "./DesktopModeSurface";
import DesktopRendererStateBridge from "./DesktopRendererStateBridge";

export default function DesktopModeHost({ children }: { children: ReactNode }) {
  return (
    <>
      <DesktopModeController />
      <DesktopRendererStateBridge />
      <DesktopModeSurface>{children}</DesktopModeSurface>
    </>
  );
}
