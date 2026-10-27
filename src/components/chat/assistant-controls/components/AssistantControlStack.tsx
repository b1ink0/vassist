import {
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { Button } from "../../../../components/ui";
import { Icon } from "../../../../components/icons";
import ZoomControl, {
  ZOOM_CONTROL_PANEL_OFFSET,
} from "../../../common/ZoomControl";
import { cn } from "../../../../utils/cn";
import { useSpatialHtmlPanelHost } from "../../../xr/SpatialHtmlPanelContext";
import type { EmoteButtonProgressMode } from "../../../../config/uiConfig";
import type { AssistantControlLayout } from "../types";

interface AssistantControlStackProps {
  layout: AssistantControlLayout;
  buttonRef: RefObject<HTMLDivElement | null>;
  isAndroid: boolean;
  isLightBackground: boolean;
  isChatOpen: boolean;
  modelDisabled: boolean;
  isVisible: boolean;
  isAppearing: boolean;
  isDragging: boolean;
  isDragOverButton: boolean;
  showUtilityButtons: boolean;
  showXrButton: boolean;
  controlsCollapsed: boolean;
  onToggleControls: () => void;
  isXrPanelOpen: boolean;
  onToggleXr: () => void;
  isZoomExpanded: boolean;
  isEmotePlaying: boolean;
  emoteProgress: number;
  emoteButtonProgressMode: EmoteButtonProgressMode;
  isAvatarPanelOpen: boolean;
  panelMode: "avatar" | "stage";
  isARMode: boolean;
  isARToggling: boolean;
  isZoomOutDisabled: boolean;
  onReload: () => void;
  reloadTitle?: string;
  onToggleEmotes: () => void;
  onToggleAvatar: () => void;
  showStageButton: boolean;
  onToggleStage: () => void;
  onToggleAR: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomExpandedChange: (expanded: boolean) => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onClick: (event?: ReactMouseEvent<HTMLElement>) => void;
  onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
  chatControls?: ReactNode;
  chatControlsWidth?: number;
  hasDragged?: boolean;
  draggable?: boolean;
}

const themedVariant = (isLightBackground: boolean) =>
  isLightBackground ? "dark" : "default";

const utilityButtonClass = (isLightBackground: boolean) =>
  cn(
    "w-12 h-12 rounded-full hover:scale-110 active:scale-95 transition-transform",
    isLightBackground ? "hover:bg-black/30" : "hover:bg-white/30",
  );

export function AssistantControlStack({
  layout,
  buttonRef,
  isAndroid,
  isLightBackground,
  isChatOpen,
  modelDisabled,
  isVisible,
  isAppearing,
  isDragging,
  isDragOverButton,
  showUtilityButtons,
  showXrButton,
  controlsCollapsed,
  onToggleControls,
  isXrPanelOpen,
  onToggleXr,
  isZoomExpanded,
  isEmotePlaying,
  emoteProgress,
  emoteButtonProgressMode,
  isAvatarPanelOpen,
  panelMode,
  isARMode,
  isARToggling,
  isZoomOutDisabled,
  onReload,
  reloadTitle = "Reload Avatar",
  onToggleEmotes,
  onToggleAvatar,
  showStageButton,
  onToggleStage,
  onToggleAR,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomExpandedChange,
  onRotateLeft,
  onRotateRight,
  onClick,
  onMouseDown,
  chatControls,
  chatControlsWidth = 48,
  hasDragged = false,
  draggable = false,
}: AssistantControlStackProps) {
  const controlsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const updateDistances = () => {
      for (const child of Array.from(controls.children)) {
        if (!(child instanceof HTMLElement)) continue;
        const distance =
          controls.clientHeight + 32 - child.offsetTop - child.offsetHeight / 2;
        child.style.setProperty("--dock-collapse-distance", `${distance}px`);
      }
    };
    updateDistances();
    const observer = new ResizeObserver(updateDistances);
    observer.observe(controls);
    return () => observer.disconnect();
  }, [showUtilityButtons, showStageButton, showXrButton, isAndroid]);
  const variant = themedVariant(isLightBackground);
  const spatialHost = useSpatialHtmlPanelHost();
  const buttonLeft = Number.parseFloat(layout.button.left);
  const availableSpaceLeft = buttonLeft;
  const availableSpaceRight =
    (spatialHost?.clientWidth ?? window.innerWidth) - buttonLeft - 48;
  const chatControlsOnRight = false;
  const chatPillCenterOffset = chatControls
    ? Math.max(
        chatControlsWidth + 10 - buttonLeft,
        Math.min(chatControlsWidth / 2, availableSpaceRight - 10),
      )
    : 0;
  const canOpenZoomControlsOnLeft =
    availableSpaceLeft >= ZOOM_CONTROL_PANEL_OFFSET;
  const canOpenZoomControlsOnRight =
    availableSpaceRight >= ZOOM_CONTROL_PANEL_OFFSET;
  const zoomControlIsOnLeftSide = canOpenZoomControlsOnRight
    ? !canOpenZoomControlsOnLeft || availableSpaceRight >= availableSpaceLeft
    : !canOpenZoomControlsOnLeft && availableSpaceRight >= availableSpaceLeft;
  const visibilityClass = isAppearing
    ? "animate-fade-in"
    : !isVisible
      ? "animate-fade-out"
      : null;

  return (
    <div
      data-assistant-control-dock="true"
      style={{
        left: layout.button.left,
        top: layout.button.top,
        bottom: layout.button.bottom,
        transform: `scale(${layout.dockScale ?? 1})`,
        transformOrigin: layout.button.bottom ? "bottom left" : "top left",
        zIndex: isAndroid ? 200 : 10000,
      }}
      className="fixed flex flex-col gap-2 items-center"
    >
      <div
        ref={controlsRef}
        data-collapsed={controlsCollapsed}
        inert={controlsCollapsed}
        onClickCapture={
          controlsCollapsed ? (event) => event.stopPropagation() : undefined
        }
        onPointerDownCapture={
          controlsCollapsed ? (event) => event.stopPropagation() : undefined
        }
        className={cn(
          "assistant-dock-controls relative z-0 flex-col gap-2 items-center",
          showUtilityButtons || showXrButton ? "flex" : "hidden",
          controlsCollapsed && "pointer-events-none",
        )}
      >
        {showUtilityButtons && (
          <>
            <Button
              onClick={onReload}
              variant={variant}
              className={cn(
                utilityButtonClass(isLightBackground),
                visibilityClass,
              )}
              title={reloadTitle}
            >
              <Icon
                name="refresh"
                size={24}
                className={cn(
                  isLightBackground ? "glass-text" : "glass-text-black",
                  "drop-shadow-lg",
                )}
              />
            </Button>

            <div className="relative flex">
              {isEmotePlaying &&
                (emoteButtonProgressMode === "ring" ||
                  emoteButtonProgressMode === "both") && (
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 z-0 h-14 w-14 -rotate-90"
                    viewBox="0 0 56 56"
                  >
                    <circle
                      cx="28"
                      cy="28"
                      r="25"
                      fill="none"
                      pathLength="1"
                      stroke="currentColor"
                      strokeDasharray="1"
                      strokeDashoffset={
                        1 - Math.min(1, Math.max(0, emoteProgress))
                      }
                      strokeLinecap="round"
                      strokeWidth="2.5"
                      className="text-white"
                    />
                  </svg>
                )}
              <Button
                onClick={onToggleEmotes}
                variant={variant}
                className={cn(
                  utilityButtonClass(isLightBackground),
                  visibilityClass,
                  "relative z-10",
                )}
                title="Emotes"
              >
                <Icon
                  name="music"
                  size={24}
                  className={cn(
                    isLightBackground ? "glass-text" : "glass-text-black",
                    "drop-shadow-lg",
                    isEmotePlaying && "animate-[spin_2s_linear_infinite]",
                  )}
                />
              </Button>
            </div>

            <Button
              onClick={onToggleAvatar}
              variant={variant}
              className={cn(
                utilityButtonClass(isLightBackground),
                visibilityClass,
                isAvatarPanelOpen &&
                  panelMode === "avatar" &&
                  "ring-2 ring-white/50",
              )}
              title="Change Avatar"
            >
              <Icon
                name="user"
                size={24}
                className={cn(
                  isLightBackground ? "glass-text" : "glass-text-black",
                  "drop-shadow-lg",
                )}
              />
            </Button>

            {showStageButton && (
              <Button
                onClick={onToggleStage}
                variant={variant}
                className={cn(
                  utilityButtonClass(isLightBackground),
                  visibilityClass,
                  isAvatarPanelOpen &&
                    panelMode === "stage" &&
                    "ring-2 ring-white/50",
                )}
                title="Stages"
                aria-label="Stages"
                aria-expanded={isAvatarPanelOpen && panelMode === "stage"}
              >
                <Icon
                  name="box"
                  size={24}
                  className={cn(
                    isLightBackground ? "glass-text" : "glass-text-black",
                    "drop-shadow-lg",
                  )}
                />
              </Button>
            )}
            {isAndroid && (
              <Button
                onClick={onToggleAR}
                disabled={isARToggling}
                variant={variant}
                className={cn(
                  utilityButtonClass(isLightBackground),
                  "transition-all duration-200",
                  visibilityClass,
                  isARMode && "ring-2 ring-white/60 bg-white/10",
                  isARToggling && "opacity-60 scale-95",
                )}
                aria-label={isARMode ? "Exit AR mode" : "Enter AR mode"}
                aria-pressed={isARMode}
                title={isARMode ? "Exit AR Mode" : "View Avatar in AR"}
              >
                <Icon
                  name={isARToggling ? "loading" : "view-in-ar"}
                  size={24}
                  className={cn(
                    isLightBackground ? "glass-text" : "glass-text-black",
                    "drop-shadow-lg",
                    isARToggling && "animate-spin",
                    isARMode &&
                      !isARToggling &&
                      "animate-pulse motion-reduce:animate-none",
                  )}
                />
              </Button>
            )}

            <ZoomControl
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
              onReset={onZoomReset}
              onRotateLeft={onRotateLeft}
              onRotateRight={onRotateRight}
              isZoomOutDisabled={isZoomOutDisabled}
              isLeftSide={zoomControlIsOnLeftSide}
              isLightBackground={isLightBackground}
              isVisible={isVisible}
              isExpanded={isZoomExpanded}
              onExpandedChange={onZoomExpandedChange}
            />
          </>
        )}

        {showXrButton && (
          <Button
            variant={variant}
            onClick={onToggleXr}
            title="VR"
            aria-label="VR controls"
            aria-expanded={isXrPanelOpen}
            className={cn(
              utilityButtonClass(isLightBackground),
              isXrPanelOpen && "ring-2 ring-white/50",
            )}
          >
            <Icon name="vr-headset" size={24} />
          </Button>
        )}
      </div>
      {!modelDisabled && (
        <Button
          variant={variant}
          onClick={onToggleControls}
          title={controlsCollapsed ? "Show controls" : "Hide controls"}
          aria-label={controlsCollapsed ? "Show controls" : "Hide controls"}
          aria-expanded={!controlsCollapsed}
          className={cn(utilityButtonClass(isLightBackground), "relative z-10")}
        >
          <Icon
            name="chevron-up"
            size={22}
            className={cn(
              "transition-transform duration-200 motion-reduce:transition-none",
              !controlsCollapsed && "rotate-180",
            )}
          />
        </Button>
      )}
      <div
        ref={buttonRef}
        className="relative flex"
        style={
          chatPillCenterOffset
            ? { transform: `translateX(${chatPillCenterOffset}px)` }
            : undefined
        }
        onMouseDown={(event) => {
          if (event.currentTarget.contains(event.target as Node))
            onMouseDown(event);
        }}
        onClickCapture={(event) => {
          if (
            event.currentTarget.contains(event.target as Node) &&
            draggable &&
            hasDragged &&
            event.detail !== 0
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {chatControls && (
          <div
            aria-hidden="true"
            data-electron-interactive="true"
            className={cn(
              "glass-button absolute top-0 h-12 rounded-full",
              isLightBackground && "glass-button-dark",
              draggable && (isDragging ? "cursor-grabbing" : "cursor-grab"),
            )}
            style={{
              width: `${48 + chatControlsWidth}px`,
              ...(chatControlsOnRight ? { left: 0 } : { right: 0 }),
            }}
          />
        )}
        {chatControls && (
          <div
            className={cn(
              "absolute top-0 overflow-hidden [&_button]:rounded-none",
              chatControlsOnRight ? "rounded-r-full" : "rounded-l-full",
            )}
            style={chatControlsOnRight ? { left: "100%" } : { right: "100%" }}
          >
            {chatControls}
          </div>
        )}
        <Button
          onClick={onClick}
          aria-label={isChatOpen ? "Close chat" : "Open chat"}
          data-testid="chat-button"
          style={{
            cursor: draggable ? (isDragging ? "grabbing" : "grab") : "pointer",
            willChange: isDragging ? "left, top" : "auto",
            transition: isDragging ? "none" : undefined,
          }}
          variant={chatControls ? "unstyled" : variant}
          className={cn(
            "relative w-12 h-12",
            chatControls
              ? chatControlsOnRight
                ? "rounded-l-full border-r border-current/15"
                : "rounded-r-full border-l border-current/15"
              : "rounded-full",
            !modelDisabled &&
              "hover:scale-110 active:scale-95 transition-transform",
            isDragOverButton && "ring-2 ring-blue-400",
            visibilityClass,
            isLightBackground ? "hover:bg-black/30" : "hover:bg-white/30",
          )}
          title={
            modelDisabled
              ? isChatOpen
                ? "Click to close chat"
                : "Drag to reposition or click to chat"
              : isChatOpen
                ? "Click to close chat"
                : "Chat with assistant"
          }
        >
          <Icon
            name={
              isDragOverButton
                ? "attachment"
                : isChatOpen
                  ? "close"
                  : modelDisabled
                    ? "chat"
                    : "ai"
            }
            size={24}
            className={cn(
              isLightBackground ? "glass-text" : "glass-text-black",
              "drop-shadow-lg",
            )}
          />
        </Button>
      </div>
    </div>
  );
}
