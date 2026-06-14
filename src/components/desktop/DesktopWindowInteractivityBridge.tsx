import { useCallback, useEffect, useRef } from "react";
import { useIsDraggingModel } from "../../hooks/app/useDrag";
import { useSceneRef } from "../../hooks/app/useScene";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import Logger from "../../services/LoggerService";
import { isDesktop, isInputWindow } from "../../utils/PlatformUtils";

const ELECTRON_INTERACTIVE_SELECTOR = [
  '[data-electron-interactive="true"]',
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "a[href]",
  '[role="button"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="switch"]',
  '[role="slider"]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
].join(", ");

type InteractionManagerLike = {
  isInteractiveAtPoint?: (clientX: number, clientY: number) => boolean;
};

function isDomInteractiveTarget(target: Element | null): boolean {
  if (!target) {
    return false;
  }

  return Boolean(target.closest(ELECTRON_INTERACTIVE_SELECTOR));
}

export default function DesktopWindowInteractivityBridge() {
  const api = useDesktopApi();
  const isDraggingModel = useIsDraggingModel();
  const sceneRef = useSceneRef();
  const latestPointRef = useRef<{ x: number; y: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastIgnoreStateRef = useRef<boolean | null>(null);
  const cursorPollInFlightRef = useRef(false);

  const applyIgnoreState = useCallback(
    (ignore: boolean) => {
      if (!api?.window?.setIgnoreMouseEvents) {
        return;
      }

      if (lastIgnoreStateRef.current === ignore) {
        return;
      }

      lastIgnoreStateRef.current = ignore;

      api.window
        .setIgnoreMouseEvents(ignore, { forward: ignore })
        .catch((error) => {
          Logger.error(
            "DesktopWindowInteractivityBridge",
            `Failed to update click-through state (${ignore ? "ignore" : "capture"}):`,
            error,
          );
          lastIgnoreStateRef.current = null;
        });
    },
    [api],
  );

  const isModelInteractiveAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (isInputWindow) {
        return false;
      }

      const interactionManager = sceneRef.current?.metadata
        ?.interactionManager as InteractionManagerLike | undefined;

      return Boolean(
        interactionManager?.isInteractiveAtPoint?.(clientX, clientY),
      );
    },
    [sceneRef],
  );

  const evaluateInteractivity = useCallback(
    (clientX: number, clientY: number) => {
      latestPointRef.current = { x: clientX, y: clientY };

      const hoveredElement = document.elementFromPoint(clientX, clientY);
      const shouldCaptureDom = isDomInteractiveTarget(hoveredElement);
      const shouldCaptureModel =
        !shouldCaptureDom && isModelInteractiveAtPoint(clientX, clientY);
      const shouldCaptureWindow =
        isDraggingModel || shouldCaptureDom || shouldCaptureModel;

      applyIgnoreState(!shouldCaptureWindow);
    },
    [applyIgnoreState, isDraggingModel, isModelInteractiveAtPoint],
  );

  const scheduleEvaluation = useCallback(
    (clientX: number, clientY: number) => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = null;
        evaluateInteractivity(clientX, clientY);
      });
    },
    [evaluateInteractivity],
  );

  const reevaluateLatestPoint = useCallback(() => {
    const latestPoint = latestPointRef.current;

    if (latestPoint) {
      scheduleEvaluation(latestPoint.x, latestPoint.y);
      return;
    }

    if (isInputWindow) {
      applyIgnoreState(false);
      return;
    }

    // When no pointer sample exists yet, prefer interactive mode so the
    // window never gets stuck fully click-through during startup.
    applyIgnoreState(false);
  }, [applyIgnoreState, scheduleEvaluation]);

  const pollCursorInteractivity = useCallback(async () => {
    if (!api?.window?.getCursorScreenPoint) {
      return;
    }

    if (cursorPollInFlightRef.current) {
      return;
    }

    cursorPollInFlightRef.current = true;

    try {
      const point = await api.window.getCursorScreenPoint();
      if (!point) {
        return;
      }

      const windowScreenX = window.screenX ?? window.screenLeft ?? 0;
      const windowScreenY = window.screenY ?? window.screenTop ?? 0;
      const clientX = point.x - windowScreenX;
      const clientY = point.y - windowScreenY;

      evaluateInteractivity(clientX, clientY);
    } catch (error) {
      Logger.warn(
        "DesktopWindowInteractivityBridge",
        "Cursor polling failed:",
        error,
      );
    } finally {
      cursorPollInFlightRef.current = false;
    }
  }, [api, evaluateInteractivity]);

  useEffect(() => {
    if (!isDesktop || !api?.window?.setIgnoreMouseEvents) {
      return;
    }

    const handleMouseEvent = (event: MouseEvent) => {
      scheduleEvaluation(event.clientX, event.clientY);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (
        event.target instanceof Element &&
        isDomInteractiveTarget(event.target)
      ) {
        applyIgnoreState(false);
      }
    };

    const timeoutId = window.setTimeout(() => {
      reevaluateLatestPoint();
    }, 0);
    const cursorPollIntervalId = window.setInterval(() => {
      void pollCursorInteractivity();
    }, 50);

    document.addEventListener("mousemove", handleMouseEvent, true);
    document.addEventListener("mousedown", handleMouseEvent, true);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("resize", reevaluateLatestPoint);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(cursorPollIntervalId);
      document.removeEventListener("mousemove", handleMouseEvent, true);
      document.removeEventListener("mousedown", handleMouseEvent, true);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("resize", reevaluateLatestPoint);

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      cursorPollInFlightRef.current = false;
    };
  }, [
    api,
    applyIgnoreState,
    pollCursorInteractivity,
    reevaluateLatestPoint,
    scheduleEvaluation,
  ]);

  useEffect(() => {
    if (!isDesktop || !api?.window?.setIgnoreMouseEvents) {
      return;
    }

    reevaluateLatestPoint();
    void pollCursorInteractivity();
  }, [api, isDraggingModel, pollCursorInteractivity, reevaluateLatestPoint]);

  return null;
}
