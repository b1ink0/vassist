import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { isDesktop } from "../../../../utils/PlatformUtils";
import Logger from "../../../../services/common/LoggerService";
import type { ButtonPosition, DesktopApiForAssistantControls } from "../types";

interface UseAssistantControlDragOptions {
  modelDisabled: boolean;
  isChatOpen: boolean;
  desktopAPI: DesktopApiForAssistantControls | null;
  buttonPos: ButtonPosition;
  setButtonPos: (position: ButtonPosition) => void;
  startButtonDrag: () => void;
  endButtonDrag: () => void;
  onPositionCommitted?: (position: ButtonPosition) => void;
}

export function useAssistantControlDrag({
  modelDisabled,
  isChatOpen,
  desktopAPI,
  buttonPos,
  setButtonPos,
  startButtonDrag,
  endButtonDrag,
  onPositionCommitted,
}: UseAssistantControlDragOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragVisualPos, setDragVisualPos] = useState<ButtonPosition | null>(
    null,
  );
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartPos = useRef<ButtonPosition>({ x: 0, y: 0 });
  const dragStartButtonPos = useRef<ButtonPosition>({ x: 0, y: 0 });
  const dragStartWindowPos = useRef<ButtonPosition>({ x: 0, y: 0 });
  const buttonPosRef = useRef<ButtonPosition>({ x: -100, y: -100 });
  const dragVisualPosRef = useRef<ButtonPosition | null>(null);
  const buttonDragAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    buttonPosRef.current = buttonPos;
  }, [buttonPos]);

  useEffect(() => {
    if (
      !isDragging &&
      dragVisualPos &&
      dragVisualPos.x === buttonPos.x &&
      dragVisualPos.y === buttonPos.y
    ) {
      setDragVisualPos(null);
      dragVisualPosRef.current = null;
    }
  }, [isDragging, dragVisualPos, buttonPos.x, buttonPos.y]);

  const flushDragVisualPosition = useCallback(() => {
    buttonDragAnimationFrameRef.current = null;

    const latestPos = dragVisualPosRef.current;
    if (!latestPos) return;

    setDragVisualPos(latestPos);
    if (isChatOpen) {
      window.dispatchEvent(
        new CustomEvent("chatButtonMoved", { detail: latestPos }),
      );
    }
  }, [isChatOpen]);

  const scheduleDragVisualUpdate = useCallback(() => {
    if (buttonDragAnimationFrameRef.current !== null) return;

    buttonDragAnimationFrameRef.current = requestAnimationFrame(
      flushDragVisualPosition,
    );
  }, [flushDragVisualPosition]);

  const handleMouseDown = useCallback(
    async (event: ReactMouseEvent<HTMLElement>) => {
      if (!modelDisabled || event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      const canDragDesktopWindow = Boolean(
        isDesktop &&
        desktopAPI?.window?.getPosition &&
        desktopAPI?.window?.setPosition,
      );

      if (canDragDesktopWindow) {
        try {
          dragStartWindowPos.current = await desktopAPI!.window!.getPosition!();
        } catch (error) {
          Logger.error(
            "AssistantControlDock",
            "Failed to get desktop window position before drag:",
            error,
          );
          return;
        }
      }

      setIsDragging(true);
      setHasDragged(false);
      dragStartPos.current = {
        x: canDragDesktopWindow ? event.screenX : event.clientX,
        y: canDragDesktopWindow ? event.screenY : event.clientY,
      };
      dragStartButtonPos.current = { ...buttonPos };
      window.dispatchEvent(new CustomEvent("chatButtonDragStart"));
      startButtonDrag();
    },
    [modelDisabled, buttonPos, desktopAPI, startButtonDrag],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!modelDisabled || !isDragging) return;

      const canDragDesktopWindow = Boolean(
        isDesktop && desktopAPI?.window?.setPosition,
      );
      const pointerX = canDragDesktopWindow ? event.screenX : event.clientX;
      const pointerY = canDragDesktopWindow ? event.screenY : event.clientY;
      const deltaX = pointerX - dragStartPos.current.x;
      const deltaY = pointerY - dragStartPos.current.y;

      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) setHasDragged(true);

      if (canDragDesktopWindow) {
        const nextWindowX = dragStartWindowPos.current.x + deltaX;
        const nextWindowY = dragStartWindowPos.current.y + deltaY;
        void desktopAPI!.window!.setPosition!(
          Math.floor(nextWindowX),
          Math.floor(nextWindowY),
        ).catch((error) => {
          Logger.error(
            "AssistantControlDock",
            "Failed to move desktop window:",
            error,
          );
        });
        return;
      }

      const buttonSize = 48;
      const newX = dragStartButtonPos.current.x + deltaX;
      const newY = dragStartButtonPos.current.y + deltaY;
      const boundedX = Math.max(
        10,
        Math.min(newX, window.innerWidth - buttonSize - 10),
      );
      let boundedY = Math.max(
        10,
        Math.min(newY, window.innerHeight - buttonSize - 10),
      );
      if (isChatOpen && boundedY > window.innerHeight - 125) {
        boundedY = window.innerHeight - 125;
      }

      const nextPosition = { x: boundedX, y: boundedY };
      buttonPosRef.current = nextPosition;
      dragVisualPosRef.current = nextPosition;
      scheduleDragVisualUpdate();
    },
    [
      modelDisabled,
      isDragging,
      isChatOpen,
      desktopAPI,
      scheduleDragVisualUpdate,
    ],
  );

  const handleMouseUp = useCallback(() => {
    if (!modelDisabled || !isDragging) return;

    if (buttonDragAnimationFrameRef.current !== null) {
      cancelAnimationFrame(buttonDragAnimationFrameRef.current);
      buttonDragAnimationFrameRef.current = null;
    }

    setIsDragging(false);
    const canDragDesktopWindow = Boolean(
      isDesktop && desktopAPI?.window?.setPosition,
    );
    if (canDragDesktopWindow) {
      endButtonDrag();
      return;
    }

    const finalPosition = dragVisualPosRef.current ?? buttonPosRef.current;
    setDragVisualPos(finalPosition);
    setButtonPos(finalPosition);
    onPositionCommitted?.(finalPosition);
    window.dispatchEvent(
      new CustomEvent("chatButtonMoved", { detail: finalPosition }),
    );
    endButtonDrag();
  }, [
    modelDisabled,
    isDragging,
    desktopAPI,
    setButtonPos,
    endButtonDrag,
    onPositionCommitted,
  ]);

  useEffect(() => {
    return () => {
      if (buttonDragAnimationFrameRef.current !== null) {
        cancelAnimationFrame(buttonDragAnimationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!modelDisabled) return;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [modelDisabled, handleMouseMove, handleMouseUp]);

  return {
    isDragging,
    dragVisualPos,
    hasDragged,
    buttonPosRef,
    handleMouseDown,
  };
}
