import { useEffect, useRef, useState } from "react";
import {
  useConfigUIActions,
  useUIConfig,
} from "../../hooks/config/useConfigUI";
import {
  useIsChatContainerVisible,
  useIsChatInputVisible,
} from "../../hooks/app/useChat";
import { isAppModeWindow } from "../../utils/PlatformUtils";

const MIN_CHAT_PERCENT = 28;
const MAX_CHAT_PERCENT = 60;

export default function AppModeSplitter() {
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const isChatContainerVisible = useIsChatContainerVisible();
  const isChatInputVisible = useIsChatInputVisible();
  const isChatOpen = isChatContainerVisible || isChatInputVisible;
  const draggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const pendingPercentRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const chatSplitPercent = Math.min(
    MAX_CHAT_PERCENT,
    Math.max(MIN_CHAT_PERCENT, uiConfig.desktopMode.appMode.chatSplitPercent),
  );

  useEffect(() => {
    if (!isAppModeWindow || !isChatOpen) return;

    const applyPendingPercent = () => {
      animationFrameRef.current = null;
      const pendingPercent = pendingPercentRef.current;

      if (pendingPercent === null) return;

      pendingPercentRef.current = null;
      updateUIConfig("desktopMode.appMode.chatSplitPercent", pendingPercent);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || window.innerWidth <= 0) return;

      const modelPercent = (event.clientX / window.innerWidth) * 100;
      const nextChatPercent = Math.min(
        MAX_CHAT_PERCENT,
        Math.max(MIN_CHAT_PERCENT, 100 - modelPercent),
      );

      // Keep sub-percent precision so the divider does not jump by several
      // pixels at a time on normal-sized desktop windows.
      pendingPercentRef.current = Math.round(nextChatPercent * 10) / 10;

      if (animationFrameRef.current === null) {
        animationFrameRef.current =
          window.requestAnimationFrame(applyPendingPercent);
      }
    };

    const handlePointerUp = () => {
      draggingRef.current = false;
      setIsDragging(false);

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      applyPendingPercent();

      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      handlePointerUp();
      pendingPercentRef.current = null;
    };
  }, [isChatOpen, updateUIConfig]);

  if (!isAppModeWindow || !isChatOpen) return null;

  return (
    <div
      aria-label="Resize chat panel"
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={MIN_CHAT_PERCENT}
      aria-valuemax={MAX_CHAT_PERCENT}
      aria-valuenow={chatSplitPercent}
      data-electron-interactive="true"
      className={`fixed top-0 bottom-0 z-[10000] w-2 -translate-x-1/2 cursor-col-resize group transition-colors duration-150 ${isDragging ? "bg-white/10" : "hover:bg-white/10"}`}
      style={{ left: `${100 - chatSplitPercent}%` }}
      onPointerDown={(event) => {
        event.preventDefault();
        draggingRef.current = true;
        setIsDragging(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
    >
      <span
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/60 transition-opacity duration-150 ${isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      />
    </div>
  );
}
