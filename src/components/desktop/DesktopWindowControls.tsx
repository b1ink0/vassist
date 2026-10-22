/**
 * @fileoverview Desktop window controls component for Electron app.
 * Provides minimize, maximize, and close buttons for frameless window.
 */

import { useState } from "react";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { isAppModeWindow } from "../../utils/PlatformUtils";
import Icon from "../icons/Icon";

/**
 * Window controls for Electron desktop app
 * Only rendered when __DESKTOP_MODE__ is true
 */
export default function DesktopWindowControls() {
  const api = useDesktopApi();
  const [electronAvailable] = useState(!!api);

  // Only render in desktop mode
  if (!__DESKTOP_MODE__ || !isAppModeWindow) {
    return null;
  }

  const handleMinimize = () => {
    if (api?.window?.minimize) {
      api.window.minimize();
    } else {
      console.error("Minimize function not available");
    }
  };

  const handleMaximize = () => {
    if (api?.window?.maximize) {
      api.window.maximize();
    } else {
      console.error("Maximize function not available");
    }
  };

  const handleClose = () => {
    if (api?.window?.close) {
      api.window.close();
    } else {
      console.error("Close function not available");
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-[99998] h-8 app-region-drag"
      />
      <div
        data-testid="desktop-window-controls"
        data-electron-interactive="true"
        className="fixed left-1 top-1 z-[99999] flex items-center gap-0.5 app-region-no-drag"
      >
        {!electronAvailable && (
          <span className="text-xs text-red-500 mr-2">
            Electron API not loaded
          </span>
        )}
        <button
          type="button"
          onClick={handleMinimize}
          data-testid="desktop-window-minimize-button"
          aria-label="Minimize window"
          className="flex h-6 w-6 items-center justify-center rounded text-white/90 transition-colors hover:bg-white/15"
          title="Minimize"
        >
          <Icon name="minus" size={12} className="text-white" />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          data-testid="desktop-window-maximize-button"
          aria-label="Maximize or restore window"
          className="flex h-6 w-6 items-center justify-center rounded text-white/90 transition-colors hover:bg-white/15"
          title="Maximize/Restore"
        >
          <Icon name="maximize" size={13} className="text-white" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          data-testid="desktop-window-close-button"
          aria-label="Close window"
          className="flex h-6 w-6 items-center justify-center rounded text-white/90 transition-colors hover:bg-red-500/80"
          title="Close"
        >
          <Icon name="close" size={12} className="text-white" />
        </button>
      </div>
    </>
  );
}
