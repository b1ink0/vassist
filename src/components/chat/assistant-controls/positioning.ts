import type { AssistantControlLayout, ButtonPosition } from "./types";

export const ASSISTANT_CONTROL_SIZE = 48;
export const ASSISTANT_CONTROL_EDGE_PADDING = 10;
export const ASSISTANT_CONTROL_PRESET_PADDING = 20;
export const ASSISTANT_CONTROL_PANEL_GAP = 8;
export const ASSISTANT_CONTROL_TOTAL_OFFSET = 224;
export const ASSISTANT_CONTROL_PANEL_WIDTH = 125;
export const ASSISTANT_CONTROL_PANEL_MAX_HEIGHT = 300;
export const ASSISTANT_CONTROL_ROW_HEIGHT = 43;
export const ASSISTANT_CONTROL_CHAT_GUTTER =
  ASSISTANT_CONTROL_SIZE + ASSISTANT_CONTROL_PANEL_GAP * 2;

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
  isAndroid: boolean;
  isDesktop: boolean;
  isNormalDesktop?: boolean;
  showUtilityButtons: boolean;
}

export const getAssistantControlLayout = ({
  viewport,
  buttonPosition,
  emoteHeight,
  avatarHeight,
  isAndroid,
  isNormalDesktop = false,
  showUtilityButtons,
}: PanelLayoutInput): AssistantControlLayout => {
  const normalControlPosition = {
    x: 16,
    y: viewport.height / 2 - ASSISTANT_CONTROL_SIZE / 2,
  };
  const effectiveButtonPosition = isNormalDesktop
    ? normalControlPosition
    : buttonPosition;
  const isLeftSide = effectiveButtonPosition.x < viewport.width / 2;

  if (isAndroid) {
    const buttonX = 20;
    const buttonY = viewport.height - 20 - ASSISTANT_CONTROL_SIZE;
    const utilityButtonCount = 4;
    const stackTop =
      buttonY -
      (showUtilityButtons
        ? (utilityButtonCount + 1) *
          (ASSISTANT_CONTROL_SIZE + ASSISTANT_CONTROL_PANEL_GAP)
        : 0);
    const panelLeft = (width: number) =>
      clamp(
        buttonX + ASSISTANT_CONTROL_SIZE + ASSISTANT_CONTROL_PANEL_GAP,
        ASSISTANT_CONTROL_EDGE_PADDING,
        viewport.width - width - ASSISTANT_CONTROL_EDGE_PADDING,
      );
    const panelTop = (anchorTop: number, height: number) =>
      clamp(
        anchorTop + ASSISTANT_CONTROL_SIZE / 2 - height / 2,
        ASSISTANT_CONTROL_EDGE_PADDING,
        viewport.height - height - ASSISTANT_CONTROL_EDGE_PADDING,
      );
    const emoteAnchorTop =
      stackTop + ASSISTANT_CONTROL_SIZE + ASSISTANT_CONTROL_PANEL_GAP;
    const avatarAnchorTop =
      emoteAnchorTop + ASSISTANT_CONTROL_SIZE + ASSISTANT_CONTROL_PANEL_GAP;

    return {
      emote: {
        left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
        top: panelTop(emoteAnchorTop, emoteHeight),
      },
      avatar: {
        left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
        top: panelTop(avatarAnchorTop, avatarHeight),
      },
      camera: {
        left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
        top:
          panelTop(avatarAnchorTop, avatarHeight) +
          avatarHeight +
          ASSISTANT_CONTROL_PANEL_GAP,
      },
      button: { left: "20px", bottom: "20px" },
      isLeftSide: true,
    };
  }

  const stackTop = isNormalDesktop
    ? normalControlPosition.y
    : effectiveButtonPosition.y -
      (showUtilityButtons ? ASSISTANT_CONTROL_TOTAL_OFFSET : 0);
  const emoteAnchorTop =
    stackTop + ASSISTANT_CONTROL_SIZE + ASSISTANT_CONTROL_PANEL_GAP;
  const avatarAnchorTop =
    emoteAnchorTop + ASSISTANT_CONTROL_SIZE + ASSISTANT_CONTROL_PANEL_GAP;

  const panelLeft = (width: number) =>
    clamp(
      isLeftSide
        ? effectiveButtonPosition.x +
            ASSISTANT_CONTROL_SIZE +
            ASSISTANT_CONTROL_PANEL_GAP
        : effectiveButtonPosition.x - width - ASSISTANT_CONTROL_PANEL_GAP,
      ASSISTANT_CONTROL_EDGE_PADDING,
      viewport.width - width - ASSISTANT_CONTROL_EDGE_PADDING,
    );

  const panelTop = (anchorTop: number, height: number) =>
    clamp(
      anchorTop + ASSISTANT_CONTROL_SIZE / 2 - height / 2,
      ASSISTANT_CONTROL_EDGE_PADDING,
      viewport.height - height - ASSISTANT_CONTROL_EDGE_PADDING,
    );

  const emoteTop = panelTop(emoteAnchorTop, emoteHeight);
  const avatarTop = panelTop(avatarAnchorTop, avatarHeight);

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
      top: avatarTop + avatarHeight + ASSISTANT_CONTROL_PANEL_GAP,
    },
    button: {
      left: isNormalDesktop ? "16px" : `${buttonPosition.x}px`,
      top: isNormalDesktop
        ? `calc(50% - ${ASSISTANT_CONTROL_SIZE / 2}px)`
        : `${buttonPosition.y - (showUtilityButtons ? ASSISTANT_CONTROL_TOTAL_OFFSET : 0)}px`,
    },
    isLeftSide,
  };
};
