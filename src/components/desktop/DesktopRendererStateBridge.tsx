import { useEffect, useRef } from "react";
import { useConfigStore } from "../../stores/useConfigStore";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { isDesktop } from "../../utils/PlatformUtils";
import type { UIConfig } from "../../config/uiConfig";

const CONFIG_CHANNEL = "state:desktopUIConfig";

/**
 * Keeps the model/avatar renderer and the chat renderer aligned without
 * creating a second configuration store or persistence path.
 */
export default function DesktopRendererStateBridge() {
  const api = useDesktopApi();
  const uiConfig = useConfigStore((state) => state.uiConfig);
  const hasHydrated = useConfigStore((state) => state.hasHydrated);
  const ignoreNextBroadcastRef = useRef(false);

  useEffect(() => {
    if (!isDesktop || !api?.ipc) return;

    return api.ipc.on(CONFIG_CHANNEL, (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;

      ignoreNextBroadcastRef.current = true;
      useConfigStore.setState({ uiConfig: payload as UIConfig });
    });
  }, [api]);

  useEffect(() => {
    if (!isDesktop || !hasHydrated || !api?.ipc) return;

    if (ignoreNextBroadcastRef.current) {
      ignoreNextBroadcastRef.current = false;
      return;
    }

    api.ipc.send(CONFIG_CHANNEL, uiConfig);
  }, [api, hasHydrated, uiConfig]);

  return null;
}
