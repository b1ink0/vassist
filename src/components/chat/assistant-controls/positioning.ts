import type { AssistantControlLayout, ButtonPosition } from "./types";

export const ASSISTANT_CONTROL_SIZE = 48;
export const ASSISTANT_CONTROL_EDGE_PADDING = 10;
export const ASSISTANT_CONTROL_PRESET_PADDING = 20;
export const ASSISTANT_CONTROL_PANEL_GAP = 8;
export const ASSISTANT_CONTROL_PANEL_WIDTH = 135;
export const ASSISTANT_CONTROL_PANEL_MAX_HEIGHT = 300;
export const ASSISTANT_CONTROL_CAMERA_PANEL_HEIGHT = 86;
export const ASSISTANT_CONTROL_ROW_HEIGHT = 43;
export const ASSISTANT_CONTROL_CHAT_GUTTER =
  ASSISTANT_CONTROL_SIZE + ASSISTANT_CONTROL_PANEL_GAP * 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

const clampPanelCoordinate = (
  coordinate: number,
  panelSize: number,
  viewportSize: number,
  startInset = 0,
  endInset = 0,
): number => {
  const min = ASSISTANT_CONTROL_EDGE_PADDING + startInset;
  const max = Math.max(
    min,
    viewportSize - panelSize - ASSISTANT_CONTROL_EDGE_PADDING - endInset,
  );
  return clamp(coordinate, min, max);
};

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
  stageHeight?: number;
  stageControlsHeight?: number;
  isAndroid: boolean;
  isDesktop: boolean;
  isNormalDesktop?: boolean;
  showUtilityButtons: boolean;
  showStageButton?: boolean;
  showXrButton?: boolean;
  showCollapseButton?: boolean;
  insets?: { top: number; right: number; bottom: number; left: number };
  /** Keep desktop panels on the outside/left of the control dock when chat is open. */
  forcePanelToLeft?: boolean;
}

export const getAssistantControlLayout = ({
  viewport,
  buttonPosition,
  emoteHeight,
  avatarHeight: requestedAvatarHeight,
  stageHeight: requestedStageHeight = 300,
  stageControlsHeight = 160,
  isAndroid,
  isNormalDesktop = false,
  showUtilityButtons,
  showStageButton = false,
  showXrButton = false,
  showCollapseButton = false,
  insets = { top: 0, right: 0, bottom: 0, left: 0 },
  forcePanelToLeft = false,
}: PanelLayoutInput): AssistantControlLayout => {
  const avatarHeight = Math.min(
    requestedAvatarHeight,
    Math.max(
      43,
      viewport.height -
        insets.top -
        insets.bottom -
        ASSISTANT_CONTROL_CAMERA_PANEL_HEIGHT -
        ASSISTANT_CONTROL_PANEL_GAP -
        20,
    ),
  );
  const stageHeight = Math.min(
    requestedStageHeight,
    Math.max(
      43,
      viewport.height -
        insets.top -
        insets.bottom -
        stageControlsHeight -
        ASSISTANT_CONTROL_PANEL_GAP -
        20,
    ),
  );
  const normalControlPosition = {
    x: 16 + insets.left,
    y: viewport.height / 2 - ASSISTANT_CONTROL_SIZE / 2,
  };
  const effectiveButtonPosition = isNormalDesktop
    ? normalControlPosition
    : {
        ...buttonPosition,
        x: clamp(
          buttonPosition.x,
          10 + insets.left,
          Math.max(10 + insets.left, viewport.width - 58 - insets.right),
        ),
      };
  const availableLeft =
    effectiveButtonPosition.x - ASSISTANT_CONTROL_EDGE_PADDING;
  const availableRight =
    viewport.width -
    (effectiveButtonPosition.x + ASSISTANT_CONTROL_SIZE) -
    ASSISTANT_CONTROL_EDGE_PADDING;
  const panelWidthWithGap =
    ASSISTANT_CONTROL_PANEL_WIDTH + ASSISTANT_CONTROL_PANEL_GAP;
  const calculatedIsLeftSide =
    availableRight >= panelWidthWithGap
      ? true
      : availableLeft >= panelWidthWithGap
        ? false
        : availableRight >= availableLeft;
  const isLeftSide = forcePanelToLeft ? false : calculatedIsLeftSide;
  const utilityCount = 4 + Number(isAndroid) + Number(showStageButton);
  const step = ASSISTANT_CONTROL_SIZE + ASSISTANT_CONTROL_PANEL_GAP;
  const totalOffset =
    ((showUtilityButtons ? utilityCount : 0) +
      Number(showXrButton) +
      Number(showCollapseButton)) *
    step;
  const dockScale = Math.min(
    1,
    Math.max(
      0.1,
      (viewport.height - 40 - insets.top - insets.bottom) / (totalOffset + 48),
    ),
  );
  const rowStep = step * dockScale;

  if (isAndroid) {
    const buttonX = 20 + insets.left;
    const stackTop =
      viewport.height - 20 - insets.bottom - (totalOffset + 48) * dockScale;
    const panelLeft = (width: number) =>
      clampPanelCoordinate(
        buttonX +
          ASSISTANT_CONTROL_SIZE * dockScale +
          ASSISTANT_CONTROL_PANEL_GAP,
        width,
        viewport.width,

        insets.left,

        insets.right,
      );
    const panelTop = (anchorTop: number, height: number) =>
      clampPanelCoordinate(
        anchorTop + (ASSISTANT_CONTROL_SIZE * dockScale) / 2 - height / 2,
        height,
        viewport.height,

        insets.top,

        insets.bottom,
      );
    const emoteAnchorTop = stackTop + rowStep;
    const avatarAnchorTop = emoteAnchorTop + rowStep;
    const avatarTop = clampPanelCoordinate(
      avatarAnchorTop +
        (ASSISTANT_CONTROL_SIZE * dockScale) / 2 -
        avatarHeight / 2,
      avatarHeight +
        ASSISTANT_CONTROL_PANEL_GAP +
        ASSISTANT_CONTROL_CAMERA_PANEL_HEIGHT,
      viewport.height,

      insets.top,

      insets.bottom,
    );
    const cameraTop = avatarTop + avatarHeight + ASSISTANT_CONTROL_PANEL_GAP;
    const stageTop = clampPanelCoordinate(
      avatarAnchorTop +
        rowStep +
        (ASSISTANT_CONTROL_SIZE * dockScale) / 2 -
        stageHeight / 2,
      stageHeight + ASSISTANT_CONTROL_PANEL_GAP + stageControlsHeight,
      viewport.height,

      insets.top,

      insets.bottom,
    );

    return {
      emote: {
        left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
        top: panelTop(emoteAnchorTop, emoteHeight),
      },
      avatar: {
        left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
        top: avatarTop,
      },
      camera: {
        left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
        top: cameraTop,
      },
      stage: {
        left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
        top: stageTop,
      },
      stageControls: {
        left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
        top: stageTop + stageHeight + ASSISTANT_CONTROL_PANEL_GAP,
      },
      xr: {
        left: panelLeft(135),
        top: panelTop(
          stackTop + (showUtilityButtons ? utilityCount : 0) * rowStep,
          43,
        ),
      },
      stageMaxHeight: stageHeight,
      button: { left: `${buttonX}px`, bottom: `${20 + insets.bottom}px` },
      isLeftSide: true,
      dockScale,
      avatarMaxHeight: avatarHeight,
    };
  }

  const stackTop = isNormalDesktop
    ? clamp(
        insets.top +
          (viewport.height -
            insets.top -
            insets.bottom -
            (totalOffset + 48) * dockScale) /
            2,
        10 + insets.top,
        Math.max(
          10 + insets.top,
          viewport.height - (totalOffset + 48) * dockScale - 10 - insets.bottom,
        ),
      )
    : clamp(
        effectiveButtonPosition.y - totalOffset * dockScale,
        10 + insets.top,
        Math.max(
          10 + insets.top,
          viewport.height - (totalOffset + 48) * dockScale - 10 - insets.bottom,
        ),
      );
  const emoteAnchorTop = stackTop + rowStep;
  const avatarAnchorTop = emoteAnchorTop + rowStep;

  const panelLeft = (width: number) =>
    clampPanelCoordinate(
      (
        width > ASSISTANT_CONTROL_PANEL_WIDTH && !forcePanelToLeft
          ? availableRight >= width + ASSISTANT_CONTROL_PANEL_GAP ||
            availableRight >= availableLeft
          : isLeftSide
      )
        ? effectiveButtonPosition.x +
            ASSISTANT_CONTROL_SIZE * dockScale +
            ASSISTANT_CONTROL_PANEL_GAP
        : effectiveButtonPosition.x - width - ASSISTANT_CONTROL_PANEL_GAP,
      width,
      viewport.width,

      insets.left,

      insets.right,
    );

  const panelTop = (anchorTop: number, height: number) =>
    clampPanelCoordinate(
      anchorTop + (ASSISTANT_CONTROL_SIZE * dockScale) / 2 - height / 2,
      height,
      viewport.height,

      insets.top,

      insets.bottom,
    );

  const emoteTop = panelTop(emoteAnchorTop, emoteHeight);
  const avatarTop = clampPanelCoordinate(
    avatarAnchorTop +
      (ASSISTANT_CONTROL_SIZE * dockScale) / 2 -
      avatarHeight / 2,
    avatarHeight +
      ASSISTANT_CONTROL_PANEL_GAP +
      ASSISTANT_CONTROL_CAMERA_PANEL_HEIGHT,
    viewport.height,

    insets.top,

    insets.bottom,
  );
  const cameraTop = avatarTop + avatarHeight + ASSISTANT_CONTROL_PANEL_GAP;
  const stageTop = clampPanelCoordinate(
    avatarAnchorTop +
      rowStep +
      (ASSISTANT_CONTROL_SIZE * dockScale) / 2 -
      stageHeight / 2,
    stageHeight + ASSISTANT_CONTROL_PANEL_GAP + stageControlsHeight,
    viewport.height,

    insets.top,

    insets.bottom,
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
      top: cameraTop,
    },
    stage: {
      left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
      top: stageTop,
    },
    stageControls: {
      left: panelLeft(ASSISTANT_CONTROL_PANEL_WIDTH),
      top: stageTop + stageHeight + ASSISTANT_CONTROL_PANEL_GAP,
    },
    xr: {
      left: panelLeft(135),
      top: panelTop(
        stackTop + (showUtilityButtons ? utilityCount : 0) * rowStep,
        43,
      ),
    },
    stageMaxHeight: stageHeight,
    button: {
      left: isNormalDesktop ? "16px" : `${effectiveButtonPosition.x}px`,
      top: `${stackTop}px`,
    },
    isLeftSide,
    dockScale,
    avatarMaxHeight: avatarHeight,
  };
};
