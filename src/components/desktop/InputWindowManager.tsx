/**
 * @fileoverview Manages the input window in desktop mode.
 */

import { useEffect } from "react";
import { useDesktop } from "../../contexts/DesktopContext";
import { useChat } from "../../hooks/app/useChat";
import { isDesktop } from "../../utils/PlatformUtils";
import Logger from "../../services/LoggerService";

export function InputWindowManager() {
  const { isChatInputVisible } = useChat();
  const { api } = useDesktop();

  useEffect(() => {
    if (!isDesktop || !api?.inputWindow) return;

    const manageInputWindow = async () => {
      try {
        if (isChatInputVisible) {
          await api.inputWindow.open();
        } else {
          const isOpen = await api.inputWindow.isOpen();
          if (isOpen) {
            await api.inputWindow.close();
          }
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
