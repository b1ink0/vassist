/**
 * @fileoverview Manages the input window in desktop mode.
 */

import { useEffect } from "react";
import { useIsChatInputVisible } from "../../hooks/app/useChat";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { isDesktop } from "../../utils/PlatformUtils";
import Logger from "../../services/LoggerService";

export function InputWindowManager() {
  const isChatInputVisible = useIsChatInputVisible();
  const api = useDesktopApi();

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

  return null;
}
