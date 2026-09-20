import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { Button } from "../../../../components/ui";
import { Icon } from "../../../../components/icons";
import ZoomControl from "../../../common/ZoomControl";
import { cn } from "../../../../utils/cn";
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
  isZoomExpanded: boolean;
  isEmotePlaying: boolean;
  isAvatarPanelOpen: boolean;
  panelMode: "avatar" | "stage";
  isARMode: boolean;
  isARToggling: boolean;
  isZoomOutDisabled: boolean;
  onReload: () => void;
  onToggleEmotes: () => void;
  onToggleAvatar: () => void;
  onToggleAR: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomExpandedChange: (expanded: boolean) => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onClick: (event?: ReactMouseEvent<HTMLElement>) => void;
  onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
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
  isZoomExpanded,
  isEmotePlaying,
  isAvatarPanelOpen,
  panelMode,
  isARMode,
  isARToggling,
  isZoomOutDisabled,
  onReload,
  onToggleEmotes,
  onToggleAvatar,
  onToggleAR,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomExpandedChange,
  onRotateLeft,
  onRotateRight,
  onClick,
  onMouseDown,
}: AssistantControlStackProps) {
  const variant = themedVariant(isLightBackground);
  const visibilityClass = isAppearing
    ? "animate-fade-in"
    : !isVisible
      ? "animate-fade-out"
      : null;

  return (
    <div
      style={{
        left: layout.button.left,
        top: layout.button.top,
        bottom: layout.button.bottom,
        zIndex: isAndroid ? 200 : 10000,
      }}
      className="fixed flex flex-col gap-2 items-center"
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
            title="Reload Avatar"
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

          <Button
            onClick={onToggleEmotes}
            variant={variant}
            className={cn(
              utilityButtonClass(isLightBackground),
              visibilityClass,
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
            isLeftSide={layout.isLeftSide}
            isLightBackground={isLightBackground}
            isVisible={isVisible}
            isExpanded={isZoomExpanded}
            onExpandedChange={onZoomExpandedChange}
          />
        </>
      )}

      <div ref={buttonRef}>
        <Button
          onClick={onClick}
          onMouseDown={onMouseDown}
          aria-label={isChatOpen ? "Close chat" : "Open chat"}
          data-testid="chat-button"
          style={{
            cursor: modelDisabled
              ? isDragging
                ? "grabbing"
                : "grab"
              : "pointer",
            willChange: isDragging ? "left, top" : "auto",
            transition: isDragging ? "none" : undefined,
          }}
          variant={variant}
          className={cn(
            "w-12 h-12 rounded-full",
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
