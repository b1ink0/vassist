import type { AssistantControlLayout, ButtonPosition } from "./types";

export const ASSISTANT_CONTROL_SIZE = 48;
export const ASSISTANT_CONTROL_EDGE_PADDING = 10;
export const ASSISTANT_CONTROL_PRESET_PADDING = 20;
export const ASSISTANT_CONTROL_PANEL_GAP = 8;
export const ASSISTANT_CONTROL_TOTAL_OFFSET = 224;
export const ASSISTANT_CONTROL_PANEL_WIDTH = 125;
export const ASSISTANT_CONTROL_PANEL_MAX_HEIGHT = 300;
export const ASSISTANT_CONTROL_ROW_HEIGHT = 43;
export const ASSISTANT_CONTROL_CAMERA_OFFSET = 35 * 2 + 4 + 8;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

export const getButtonPositionFromPreset = (
  preset: string,
  viewport: { width: number; height: number },
): ButtonPosition => {
  const { width, height } = viewport;
  const edge = ASSISTANT_CONTROL_PRESET_PADDING;
  const button = ASSISTANT_CONTROL_SIZE;

  switch (preset) {
    case "bottom-left":
      return { x: edge, y: height - button - edge };
    case "bottom-center":
      return { x: (width - button) / 2, y: height - button - edge };
    case "top-right":
      return { x: width - button - edge, y: edge };
    case "top-left":
      return { x: edge, y: edge };
    case "top-center":
      return { x: (width - button) / 2, y: edge };
    case "center":
      return { x: (width - button) / 2, y: (height - button) / 2 };
    case "bottom-right":
    default:
      return { x: width - button - edge, y: height - button - edge };
  }
};

export const clampButtonPosition = (
  position: ButtonPosition,
  viewport: { width: number; height: number },
  bottomInset = 0,
): ButtonPosition => ({
  x: clamp(
    position.x,
    ASSISTANT_CONTROL_EDGE_PADDING,
    viewport.width - ASSISTANT_CONTROL_SIZE - ASSISTANT_CONTROL_EDGE_PADDING,
  ),
  y: clamp(
    position.y,
    ASSISTANT_CONTROL_EDGE_PADDING,
    viewport.height -
      ASSISTANT_CONTROL_SIZE -
      ASSISTANT_CONTROL_EDGE_PADDING -
      bottomInset,
  ),
});

export interface PanelLayoutInput {
  viewport: { width: number; height: number };
  buttonPosition: ButtonPosition;
  emoteHeight: number;
  avatarHeight: number;
  avatarListHeight: number;
  isAndroid: boolean;
  isDesktop: boolean;
  showUtilityButtons: boolean;
}

export const getAssistantControlLayout = ({
  viewport,
  buttonPosition,
  emoteHeight,
  avatarHeight,
  avatarListHeight,
  isAndroid,
  isDesktop,
  showUtilityButtons,
}: PanelLayoutInput): AssistantControlLayout => {
  const isLeftSide = buttonPosition.x < viewport.width / 2;

  if (isAndroid) {
    const buttonX = 20;
    const buttonY = viewport.height - 20 - ASSISTANT_CONTROL_SIZE;
    const androidPanelOffset = ASSISTANT_CONTROL_TOTAL_OFFSET + 56;

    return {
      emote: {
        left: buttonX,
        top:
          buttonY -
          androidPanelOffset -
          emoteHeight -
          ASSISTANT_CONTROL_PANEL_GAP,
      },
      avatar: {
        left: buttonX,
        top:
          buttonY -
          androidPanelOffset -
          avatarHeight -
          ASSISTANT_CONTROL_PANEL_GAP -
          ASSISTANT_CONTROL_CAMERA_OFFSET,
      },
      camera: { left: buttonX, top: 0 },
      button: { left: "20px", bottom: "20px" },
      isLeftSide: true,
    };
  }

  const panelLeft = (width: number) =>
    isDesktop || !isLeftSide
      ? buttonPosition.x - width - ASSISTANT_CONTROL_PANEL_GAP
      : buttonPosition.x;

  const panelTop = (height: number, cameraOffset = 0) =>
    buttonPosition.y -
    ASSISTANT_CONTROL_TOTAL_OFFSET -
    height -
    ASSISTANT_CONTROL_PANEL_GAP -
    cameraOffset;

  const clampPanelTop = (top: number, height: number) => {
    if (!isDesktop) return top;
    const edge = 12;
    const maxTop = Math.max(edge, viewport.height - height - edge);
    return clamp(top, edge, maxTop);
  };

  const emoteTop = clampPanelTop(panelTop(emoteHeight), emoteHeight);
  const avatarTop = clampPanelTop(
    panelTop(avatarHeight, ASSISTANT_CONTROL_CAMERA_OFFSET),
    avatarHeight,
  );

  return {
    emote: {
      left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
      top: emoteTop,
    },
    avatar: {
      left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
      top: avatarTop,
    },
    camera: {
      left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
      top: avatarTop + avatarListHeight + ASSISTANT_CONTROL_PANEL_GAP,
    },
    button: {
      left: `${buttonPosition.x}px`,
      top: `${buttonPosition.y - (showUtilityButtons ? ASSISTANT_CONTROL_TOTAL_OFFSET : 0)}px`,
    },
    isLeftSide,
  };
};
