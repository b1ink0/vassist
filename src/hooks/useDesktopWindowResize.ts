/**
 * @fileoverview Hook to resize desktop window based on container size
 */

import { useEffect, useRef, type RefObject } from "react";
import { useIsChatContainerVisible } from "./app/useChat";
import { useIsVoiceMode } from "./app/usePlayback";
import { useUIConfig } from "./config/useConfigUI";
import { usePositionManagerRef } from "./app/useScene";
import { useDesktopApi } from "./useDesktopStore";
import {
  isDesktop,
  isDetachedChatWindow,
  isInputWindow,
  isDesktopAttachedModeWindow,
} from "../utils/PlatformUtils";
import {
  getFloatingCanvasSize,
  getFloatingWindowSize,
} from "../components/chat/floatingChatSize";

interface DesktopResizeOptions {
  disabled?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  padding?: number;
  windowPadding?: number;
}

interface PositionManagerRefValue {
  canvasWidth?: number;
  canvasHeight?: number;
}

export function useDesktopWindowResize(
  containerRef: RefObject<HTMLElement | null> | null = null,
  options: DesktopResizeOptions = {},
): void {
  const chatContainerVisible = useIsChatContainerVisible();
  const isVoiceMode = useIsVoiceMode();
  const uiConfig = useUIConfig();
  const isChatContainerVisible =
    chatContainerVisible || (isVoiceMode && uiConfig.enableModelLoading);
  const positionManagerRef = usePositionManagerRef();
  const api = useDesktopApi();
  const observerRef = useRef<ResizeObserver | null>(null);
  const DEFAULT_MAIN_WINDOW_WIDTH = 400;
  const DEFAULT_MAIN_WINDOW_HEIGHT = 525;

  const {
    disabled = false,
    minWidth = 400,
    minHeight = 400,
    maxWidth = 800,
    maxHeight = 600,
    padding = 10,
    windowPadding = 16,
  } = options;

  useEffect(() => {
    // Normal mode owns a user-resizable BrowserWindow. Its layout adapts to
    // the current bounds; it must never resize the window in response to chat
    // or canvas content changes.
    if (
      disabled ||
      !isDesktop ||
      isDesktopAttachedModeWindow ||
      isDetachedChatWindow ||
      !api
    )
      return;

    if (!isInputWindow) {
      const canvasWidth =
        positionManagerRef?.current?.canvasWidth ||
        window.innerWidth ||
        DEFAULT_MAIN_WINDOW_WIDTH;
      const canvasHeight =
        positionManagerRef?.current?.canvasHeight ||
        window.innerHeight ||
        DEFAULT_MAIN_WINDOW_HEIGHT;
      const fallbackCanvas = getFloatingCanvasSize(canvasWidth, canvasHeight);

      const resize = () => {
        const size = getFloatingWindowSize(
          positionManagerRef?.current?.canvasWidth || fallbackCanvas.width,
          positionManagerRef?.current?.canvasHeight || fallbackCanvas.height,
          isChatContainerVisible,
        );
        void api.window.setSize(size.width, size.height);
      };
      resize();
      window.addEventListener("floatingChatSizeChange", resize);
      return () => window.removeEventListener("floatingChatSizeChange", resize);
    }

    if (!containerRef?.current) return;

    const resizeWindow = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      let width = Math.ceil(rect.width + padding * 2 + windowPadding);
      let height = Math.ceil(rect.height + padding * 2 + windowPadding);

      width = Math.max(minWidth, Math.min(maxWidth, width));
      height = Math.max(minHeight, Math.min(maxHeight, height));

      void api.window.setSize(width, height);
    };

    resizeWindow();

    observerRef.current = new ResizeObserver(resizeWindow);
    observerRef.current.observe(containerRef.current);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [
    isChatContainerVisible,
    api,
    containerRef,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    padding,
    windowPadding,
    disabled,
  ]);
}
