import { useCallback, useEffect, useRef, useState } from "react";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { isDetachedChatWindow } from "../../utils/PlatformUtils";
import { cn } from "../../utils/cn";

const MIN_WIDTH = 420;
const MIN_HEIGHT = 420;

interface ResizeState {
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A small, explicit resize affordance for the frameless detached chat window.
 * Native resizing remains enabled as well, but this keeps the interaction
 * discoverable and works consistently with the transparent window surface.
 */
export default function DetachedChatResizeHandle() {
  const api = useDesktopApi();
  const resizeStateRef = useRef<ResizeState | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const pointerActiveRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);

  const flushBounds = useCallback(() => {
    animationFrameRef.current = null;
    const bounds = pendingBoundsRef.current;
    pendingBoundsRef.current = null;
    if (!bounds || !api?.window?.setBounds) return;

    void api.window.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  }, [api]);

  const scheduleBounds = useCallback(
    (bounds: { x: number; y: number; width: number; height: number }) => {
      pendingBoundsRef.current = bounds;
      if (animationFrameRef.current !== null) return;
      animationFrameRef.current = requestAnimationFrame(flushBounds);
    },
    [flushBounds],
  );

  useEffect(() => {
    if (!isDetachedChatWindow) return;

    const handlePointerMove = (event: PointerEvent) => {
      const start = resizeStateRef.current;
      if (!start) return;

      scheduleBounds({
        x: start.x,
        y: start.y,
        width: Math.max(
          MIN_WIDTH,
          start.width + event.clientX - start.pointerX,
        ),
        height: Math.max(
          MIN_HEIGHT,
          start.height + event.clientY - start.pointerY,
        ),
      });
    };

    const stopResize = () => {
      if (!pointerActiveRef.current && !resizeStateRef.current) return;

      pointerActiveRef.current = false;
      resizeStateRef.current = null;
      delete document.documentElement.dataset.electronResizeActive;
      window.dispatchEvent(new Event("detachedChatResizeEnd"));
      setIsResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    document.addEventListener("pointerup", stopResize, true);
    window.addEventListener("blur", stopResize);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      document.removeEventListener("pointerup", stopResize, true);
      window.removeEventListener("blur", stopResize);
      delete document.documentElement.dataset.electronResizeActive;
      window.dispatchEvent(new Event("detachedChatResizeEnd"));
    };
  }, [scheduleBounds]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  if (
    !isDetachedChatWindow ||
    !api?.window?.getPosition ||
    !api.window.getSize
  ) {
    return null;
  }

  const handlePointerDown = async (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    pointerActiveRef.current = true;
    document.documentElement.dataset.electronResizeActive = "true";
    window.dispatchEvent(new Event("detachedChatResizeStart"));
    void api.window.setIgnoreMouseEvents(false, { forward: false });
    setIsResizing(true);

    const [position, size] = await Promise.all([
      api.window!.getPosition!(),
      api.window!.getSize!(),
    ]);

    if (!pointerActiveRef.current) return;

    resizeStateRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    };
  };

  return (
    <div
      data-electron-interactive="true"
      role="separator"
      aria-label="Resize detached chat window"
      title="Resize chat window"
      onPointerDown={handlePointerDown}
      className={cn(
        "fixed right-1 bottom-1 z-[100000] flex h-6 w-6 cursor-nwse-resize items-end justify-end rounded-sm bg-black/20 p-1 transition-opacity",
        isResizing ? "opacity-100" : "opacity-70",
      )}
    >
      <span
        aria-hidden="true"
        className="h-3 w-3 rounded-br border-b-2 border-r-2 border-white/70"
      />
    </div>
  );
}
