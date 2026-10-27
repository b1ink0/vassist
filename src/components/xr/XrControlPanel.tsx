import type { DockPanelTransitionProps } from "../chat/assistant-controls/hooks/useDockPanelTransition";
import { cn } from "../../utils/cn";
import { useState } from "react";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { XrSettings } from "../settings/XrSettings";
import { useXrRuntime } from "../../contexts/XrRuntimeContext";
import {
  useUIConfig,
  useConfigUIActions,
} from "../../hooks/config/useConfigUI";
import { getXrClientRuntime } from "../../services/xr/XrClientRuntime";
import { Button, Card, Input } from "../ui";
import { Icon } from "../icons";
import { XrSceneEditControls } from "./XrSceneEditControls";
import {
  iconButtonClassName,
  panelButtonVariant,
} from "../chat/assistant-controls/panelStyles";

export function XrControlPanel({
  transitionProps,
  position,
  isLightBackground,
}: {
  transitionProps?: DockPanelTransitionProps;
  position: { left: number; top: number };
  isLightBackground: boolean;
}) {
  const xr = useXrRuntime();
  const desktopXr = useDesktopApi()?.xr;
  const { xr: settings } = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [pairingLink, setPairingLink] = useState("");
  const [message, setMessage] = useState("");
  const [showRequirement, setShowRequirement] = useState(false);
  const variant = panelButtonVariant(isLightBackground);
  const connect = async () => {
    try {
      const runtime = getXrClientRuntime();
      if (runtime) {
        await runtime.disconnect();
        return;
      }
      const link = new URL(pairingLink);
      const fragment = new URLSearchParams(link.hash.slice(1));
      if (!fragment.get("ticket") || !fragment.get("xrHost"))
        throw new Error("Use a fresh pairing link from desktop XR settings.");
      const target = new URL(location.href);
      target.hash = fragment.toString();
      location.replace(target.href);
      location.reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <Card
      {...transitionProps}
      variant="none"
      padding="none"
      className={cn(
        "fixed z-[10001] w-[135px] max-w-[calc(100vw-90px)] max-h-[calc(100vh-48px)] overflow-y-auto [scrollbar-width:none] space-y-2 p-1",
        transitionProps?.className,
      )}
      style={{
        left: position.left,
        top: position.top,
        maxHeight: Math.max(
          43,
          (xr.active
            ? 640
            : (window.visualViewport?.height ?? window.innerHeight)) -
            position.top -
            10,
        ),
      }}
    >
      {desktopXr ? (
        <XrSettings compact isLightBackground={isLightBackground} />
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            <Button
              variant={variant}
              className="w-full h-[35px] rounded-full gap-1 px-2"
              disabled={xr.busy}
              title={xr.active ? "Exit VR" : "Enter VR"}
              aria-label={xr.active ? "Exit VR" : "Enter VR"}
              onClick={() => {
                setShowRequirement(true);
                if (xr.active)
                  void xr.controller
                    ?.exit()
                    .catch((reason) => setMessage(String(reason)));
                else xr.enter();
              }}
            >
              <Icon
                name={xr.busy ? "loading" : "vr-headset"}
                size={18}
                className={xr.busy ? "animate-spin" : ""}
              />
              <span>{xr.active ? "Exit VR" : "Enter VR"}</span>
            </Button>
            {!xr.active && (
              <Button
                variant={variant}
                className={`${iconButtonClassName} ${settings.handTracking ? "" : "opacity-50"}`}
                title="Hand tracking"
                aria-label="Hand tracking"
                aria-pressed={settings.handTracking === true}
                onClick={() =>
                  updateUIConfig("xr.handTracking", !settings.handTracking)
                }
              >
                <Icon name="hand-stop" size={18} />
              </Button>
            )}
            {xr.active && (
              <Button
                variant={variant}
                className={iconButtonClassName}
                title="Recenter view"
                aria-label="Recenter view"
                onClick={() => xr.controller?.recenter()}
              >
                <Icon name="target" size={18} />
              </Button>
            )}
            {!xr.active && (
              <Button
                variant={variant}
                className={`${iconButtonClassName} ${xr.connected || connectionOpen ? "" : "opacity-50"}`}
                title={
                  xr.connected ? "Desktop connected" : "Desktop connection"
                }
                aria-label="Desktop connection"
                aria-expanded={connectionOpen}
                onClick={() => setConnectionOpen((open) => !open)}
              >
                <Icon name="link" size={18} />
              </Button>
            )}
          </div>
          <XrSceneEditControls isLightBackground={isLightBackground} />
          {connectionOpen && !xr.active && (
            <div className="space-y-2 rounded-xl bg-black/60 p-2 text-white">
              {getXrClientRuntime() ? (
                <Button
                  variant={variant}
                  className={iconButtonClassName}
                  title="Disconnect desktop"
                  aria-label="Disconnect desktop"
                  onClick={() => void connect()}
                >
                  <Icon name="close" size={18} />
                </Button>
              ) : (
                <div className="flex items-center gap-1">
                  <Input
                    aria-label="Desktop pairing link"
                    placeholder="Desktop pairing link"
                    value={pairingLink}
                    onChange={(event) => setPairingLink(event.target.value)}
                    className="min-w-0"
                  />
                  <Button
                    variant={variant}
                    className={iconButtonClassName}
                    title="Connect desktop"
                    aria-label="Connect desktop"
                    disabled={!pairingLink.trim()}
                    onClick={() => void connect()}
                  >
                    <Icon name="link" size={18} />
                  </Button>
                </div>
              )}
            </div>
          )}
          {(message || (showRequirement && xr.error) || !xr.canInteract) && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl bg-black/75 p-3 text-xs text-white break-words"
            >
              {message ||
                (showRequirement && xr.error) ||
                "Desktop disconnected. Reconnect outside VR to resume shared changes."}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
