import { ASSISTANT_CONTROL_CHAT_GUTTER } from "./assistant-controls/positioning";

export interface FloatingChatSize {
  width: number;
  height: number;
}

let size: FloatingChatSize = { width: 400, height: 500 };
let fallbackCanvasSize: FloatingChatSize | undefined;

export function getFloatingCanvasSize(
  width: number,
  height: number,
): FloatingChatSize {
  fallbackCanvasSize ??= { width, height };
  return fallbackCanvasSize;
}

export function getFloatingChatSize(): FloatingChatSize {
  return size;
}

export function setFloatingChatSize(next: FloatingChatSize): void {
  size = {
    width: Math.max(280, Math.min(900, Math.round(next.width))),
    height: Math.max(200, Math.min(900, Math.round(next.height))),
  };
  window.dispatchEvent(new Event("floatingChatSizeChange"));
}

export function getFloatingWindowSize(
  canvasWidth: number,
  canvasHeight: number,
  chatVisible: boolean,
): FloatingChatSize {
  return {
    width:
      canvasWidth +
      (chatVisible ? size.width + ASSISTANT_CONTROL_CHAT_GUTTER + 16 : 0),
    height: chatVisible
      ? Math.max(canvasHeight + 16, size.height + 80)
      : canvasHeight,
  };
}
