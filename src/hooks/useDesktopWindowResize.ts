/**
 * @fileoverview Hook to resize desktop window based on container size
 */

import { useEffect, useRef, type RefObject } from "react";
import { useDesktop } from "../contexts/DesktopContext";
import { useChat } from "./app/useChat";
import { useScene } from "./app/useScene";
import { isDesktop, isInputWindow } from "../utils/PlatformUtils";

interface DesktopResizeOptions {
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
  const { isChatContainerVisible } = useChat();
  const { positionManagerRef } = useScene();
  const { api } = useDesktop();
  const observerRef = useRef<ResizeObserver | null>(null);
  const DEFAULT_MAIN_WINDOW_WIDTH = 400;
  const DEFAULT_MAIN_WINDOW_HEIGHT = 525;

  const {
    minWidth = 400,
    minHeight = 400,
    maxWidth = 800,
    maxHeight = 600,
    padding = 10,
    windowPadding = 16,
  } = options;

  useEffect(() => {
    if (!isDesktop || !api) return;

    if (!isInputWindow) {
      const canvasWidth =
        positionManagerRef?.current?.canvasWidth ||
        window.innerWidth ||
        DEFAULT_MAIN_WINDOW_WIDTH;
      const canvasHeight =
        positionManagerRef?.current?.canvasHeight ||
        window.innerHeight ||
        DEFAULT_MAIN_WINDOW_HEIGHT;

      const chatContainerWidth = isChatContainerVisible ? 400 : 0;

      const width =
        canvasWidth +
        chatContainerWidth +
        (isChatContainerVisible ? windowPadding : 0);
      const height =
        canvasHeight + (isChatContainerVisible ? windowPadding : 0);

      void api.window.setSize(width, height);
      return;
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
  ]);
}
