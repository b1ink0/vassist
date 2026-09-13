/**
 * @fileoverview Manages the input window in desktop mode.
 */

import { useEffect } from "react";
import { useIsChatInputVisible } from "../../hooks/app/useChat";
import { useUIConfig } from "../../hooks/config/useConfigUI";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { isDesktop } from "../../utils/PlatformUtils";
import Logger from "../../services/common/LoggerService";

export function InputWindowManager() {
  const isChatInputVisible = useIsChatInputVisible();
  const api = useDesktopApi();
  const uiConfig = useUIConfig();
  const themeMode = uiConfig.backgroundDetection?.mode;

  useEffect(() => {
    if (!isDesktop || !api?.inputWindow) return;

    const manageInputWindow = async () => {
      try {
        if (isChatInputVisible) {
          await api.inputWindow.open();
        } else {
          await api.inputWindow.close();
        }
      } catch (error) {
        Logger.error(
          "InputWindowManager",
          "Failed to manage input window:",
          error,
        );
      }
    };

    manageInputWindow();
  }, [isChatInputVisible, api]);

  useEffect(() => {
    if (!isDesktop || !api?.ipc || !themeMode) return;

    Logger.log("InputWindowManager", "Broadcasting desktop theme mode", {
      mode: themeMode,
    });
    api.ipc.send("state:uiThemeMode", themeMode);
  }, [api, themeMode]);

  return null;
}
