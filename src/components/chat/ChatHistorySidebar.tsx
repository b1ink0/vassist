import { Dialog } from "@base-ui/react/dialog";
import { useMemo, useState, type ReactNode } from "react";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import { resolveConfiguredPortalContainer } from "../../embed/portalContainers";
import { resolvePortalContainer } from "../../utils/resolvePortalContainer";
import { cn } from "../../utils/cn";
import { isAndroid, isAppModeWindow } from "../../utils/PlatformUtils";
import {
  ANDROID_SYSTEM_INSET_TOP,
  HISTORY_SIDEBAR_WIDTH,
} from "./historyLayout";

interface ChatHistorySidebarProps {
  open: boolean;
  isWide: boolean;
  isLightBackground: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  dialogs?: ReactNode;
}

/** Attached-mode history drawer. Narrow layouts are modal; wide desktop is docked. */
export default function ChatHistorySidebar({
  open,
  isWide,
  isLightBackground,
  onOpenChange,
  children,
  dialogs,
}: ChatHistorySidebarProps) {
  const { embedConfig } = useEmbedHost();
  const [portalAnchor, setPortalAnchor] = useState<HTMLDivElement | null>(null);
  const fallbackPortalContainer = useMemo(
    () => resolvePortalContainer(undefined, portalAnchor),
    [portalAnchor],
  );
  const portalContainer = useMemo(
    () =>
      resolveConfiguredPortalContainer(
        embedConfig,
        "overlays",
        fallbackPortalContainer,
      ),
    [embedConfig, fallbackPortalContainer],
  );

  return (
    <div ref={setPortalAnchor} className="contents">
      <Dialog.Root
        open={open}
        modal={!isWide}
        disablePointerDismissal={isWide}
        onOpenChange={onOpenChange}
      >
        <Dialog.Portal container={portalContainer}>
          {!isWide && (
            <Dialog.Backdrop
              data-testid="chat-history-backdrop"
              className="fixed inset-0 z-[10020] bg-black/40 transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none"
            />
          )}
          <Dialog.Popup
            aria-label="Chat history"
            data-testid="chat-history-sidebar"
            initialFocus={isWide ? false : undefined}
            data-electron-interactive="true"
            style={{
              transitionProperty: "translate, transform",
              transitionDuration: "var(--history-transition-duration, 300ms)",
              transitionTimingFunction: "ease-out",
              paddingTop: isAppModeWindow
                ? 32
                : isAndroid
                  ? ANDROID_SYSTEM_INSET_TOP
                  : undefined,
              width: isWide ? HISTORY_SIDEBAR_WIDTH : "min(82vw, 320px)",
            }}
            className={cn(
              "glass-container fixed inset-y-0 left-0 z-[10021] flex h-dvh flex-col overflow-hidden rounded-none border-y-0 border-l-0 outline-none",
              "transition-transform duration-300 ease-out data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full motion-reduce:[--history-transition-duration:0ms]",
              isLightBackground && "glass-container-dark",
            )}
          >
            {children}
            {dialogs}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
