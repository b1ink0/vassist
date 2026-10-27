import {
  useDockPanelTransition,
  type DockPanelTransitionProps,
} from "../hooks/useDockPanelTransition";
import { canRenderStages } from "../../../../babylon/stages/stageAvailability";
import { useXrRuntime } from "../../../../contexts/XrRuntimeContext";
import { XrSurface } from "../../../xr/XrSurface";
import { StageControlPanel } from "./StageControlPanel";
import {
  panelClassName,
  itemClassName,
  iconButtonClassName,
  panelButtonVariant,
} from "../panelStyles";
import { Button, Card } from "../../../../components/ui";
import { Icon } from "../../../../components/icons";
import EmotePlaybackBar from "../../EmotePlaybackBar";
import { cn } from "../../../../utils/cn";
import { isDesktopAttachedModeWindow } from "../../../../utils/PlatformUtils";
import { ASSISTANT_CONTROL_ROW_HEIGHT } from "../positioning";
import type {
  AssistantControlActions,
  AssistantControlLayout,
  EmoteListItem,
  StoredModelItem,
  StoredStageItem,
} from "../types";

interface AssistantControlPanelsProps {
  transitionProps?: DockPanelTransitionProps;
  layout: AssistantControlLayout;
  isAndroid: boolean;
  isDesktop: boolean;
  isNormalDesktop: boolean;
  isLightBackground: boolean;
  isChatOpen: boolean;
  modelDisabled: boolean;
  isEmotePanelOpen: boolean;
  isAvatarPanelOpen: boolean;
  panelMode: "avatar" | "stage";
  emotes: EmoteListItem[];
  filteredEmotes: EmoteListItem[];
  models: StoredModelItem[];
  stages: StoredStageItem[];
  selectedModelId: string | null;
  selectedStageId: string | null;
  selectedAutoPlayCategory: string;
  autoPlayCategoryOptions: Array<{ value: string; label: string }>;
  isAutoPlayActive: boolean;
  currentPlayingEmoteId: string | null;
  emoteProgress: number;
  emoteCurrentTime: number;
  emoteDuration: number;
  showEmotePlaybackTime: boolean;
  showEmotePlaybackBar: boolean;
  cameraMode: "2D" | "3D";
  cameraLocked: boolean;
  cameraSaveEnabled: boolean;
  stickerBorderEnabled: boolean;
  actions: AssistantControlActions;
  onSeek: (progress: number) => void;
}

function EmotePanel({
  transitionProps,
  layout,
  isAndroid,
  isDesktop,
  isLightBackground,
  emotes,
  filteredEmotes,
  selectedAutoPlayCategory,
  autoPlayCategoryOptions,
  isAutoPlayActive,
  currentPlayingEmoteId,
  actions,
}: Pick<
  AssistantControlPanelsProps,
  | "transitionProps"
  | "layout"
  | "isAndroid"
  | "isDesktop"
  | "isLightBackground"
  | "emotes"
  | "filteredEmotes"
  | "selectedAutoPlayCategory"
  | "autoPlayCategoryOptions"
  | "isAutoPlayActive"
  | "currentPlayingEmoteId"
  | "actions"
>) {
  return (
    <Card
      {...transitionProps}
      padding="none"
      style={{
        left: `${layout.emote.left}px`,
        top: `${layout.emote.top}px`,
        zIndex: isAndroid ? 201 : 10001,
        maxHeight: "min(300px, calc(100vh - 20px))",
      }}
      variant="none"
      className={cn(
        panelClassName,
        transitionProps?.className,
        isDesktop &&
          !isDesktopAttachedModeWindow &&
          emotes.length > 7 &&
          "vassist-scroll-panel-fade",
      )}
    >
      {emotes.length === 0 ? (
        <>
          <Button
            onClick={actions.onToggleAutoPlay}
            variant={panelButtonVariant(isLightBackground)}
            className={cn(
              `${itemClassName} justify-center text-[15px]`,
              isAutoPlayActive && "ring-2 ring-white/50",
            )}
            title={isAutoPlayActive ? "Stop auto-play" : "Start auto-play"}
          >
            <Icon
              name="refresh"
              size={14}
              className={cn(
                isAutoPlayActive && "animate-[spin_2s_linear_infinite]",
              )}
            />
            <span className="truncate">Auto</span>
          </Button>

          <div
            className={cn(
              "glass-button snap-center flex items-center justify-center px-2 md:px-4 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[12px] rounded-[17.5px] whitespace-nowrap",
              isLightBackground && "glass-button-dark",
              "backdrop-blur-[10px] text-white/50 cursor-default pointer-events-none",
            )}
          >
            <span className="truncate">No emotes</span>
          </div>
        </>
      ) : (
        <>
          <Button
            onClick={actions.onToggleAutoPlay}
            variant={panelButtonVariant(isLightBackground)}
            className={cn(
              `${itemClassName} justify-center text-[15px]`,
              isAutoPlayActive && "ring-2 ring-white/50",
            )}
            title={isAutoPlayActive ? "Stop auto-play" : "Start auto-play"}
          >
            <Icon
              name="refresh"
              size={14}
              className={cn(
                isAutoPlayActive && "animate-[spin_2s_linear_infinite]",
              )}
            />
            <span className="truncate">Auto</span>
          </Button>

          <div
            className={cn(
              "glass-button snap-center relative h-[35px] min-h-[35px] w-[125px] mb-2 rounded-[17.5px] backdrop-blur-[10px]",
              isLightBackground && "glass-button-dark",
            )}
            title="Emote category"
          >
            <select
              value={selectedAutoPlayCategory}
              onChange={(event) => actions.onCategoryChange(event.target.value)}
              className={cn(
                "h-full w-full appearance-none bg-transparent border-none outline-none text-[15px] pl-3 pr-7",
                isLightBackground ? "glass-text" : "glass-text-black",
              )}
            >
              {autoPlayCategoryOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-gray-900"
                >
                  {option.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <Icon
                name="chevron-down"
                size={12}
                className={
                  isLightBackground ? "glass-text" : "glass-text-black"
                }
              />
            </span>
          </div>

          {filteredEmotes.length === 0 ? (
            <div
              className={cn(
                "glass-button snap-center flex items-center justify-center px-2 md:px-4 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[12px] rounded-[17.5px] whitespace-nowrap",
                isLightBackground && "glass-button-dark",
                "backdrop-blur-[10px] text-white/70 cursor-default pointer-events-none",
              )}
              title="No emotes in this category"
            >
              <span className="truncate">No emotes in category</span>
            </div>
          ) : (
            filteredEmotes.map((emote) => (
              <Button
                key={emote.id}
                onClick={() => actions.onPlayEmote(emote.id)}
                variant={panelButtonVariant(isLightBackground)}
                className={cn(
                  `${itemClassName} justify-center gap-2 text-[15px]`,
                  currentPlayingEmoteId === emote.id && "ring-2 ring-white/50",
                )}
                title={emote.name}
              >
                {currentPlayingEmoteId === emote.id && (
                  <Icon
                    name="refresh"
                    size={14}
                    className="animate-[spin_2s_linear_infinite] flex-shrink-0"
                  />
                )}
                <span className="truncate">{emote.name}</span>
              </Button>
            ))
          )}
        </>
      )}
    </Card>
  );
}

function AvatarPanel({
  transitionProps,
  layout,
  isAndroid,
  isDesktop,
  isLightBackground,
  models,
  selectedModelId,
  actions,
}: Pick<
  AssistantControlPanelsProps,
  | "transitionProps"
  | "layout"
  | "isAndroid"
  | "isDesktop"
  | "isLightBackground"
  | "models"
  | "selectedModelId"
  | "actions"
>) {
  const options = [
    {
      id: null,
      label: "VAssist Default",
      selected: selectedModelId === null,
    },
    ...models.map((model) => ({
      id: model.id,
      label: model.name,
      selected: selectedModelId === model.id,
    })),
  ];

  return (
    <Card
      {...transitionProps}
      padding="none"
      style={{
        left: `${layout.avatar.left}px`,
        top: `${layout.avatar.top}px`,
        zIndex: isAndroid ? 201 : 10001,
        maxHeight: layout.avatarMaxHeight ?? "min(300px, calc(100vh - 20px))",
      }}
      variant="none"
      className={cn(
        panelClassName,
        transitionProps?.className,
        isDesktop &&
          !isDesktopAttachedModeWindow &&
          options.length * ASSISTANT_CONTROL_ROW_HEIGHT >
            (layout.avatarMaxHeight ?? 300) &&
          "vassist-scroll-panel-fade",
      )}
    >
      {options.map((option) => (
        <Button
          key={option.id ?? "default"}
          onClick={() => actions.onModelSelect(option.id)}
          variant={panelButtonVariant(isLightBackground)}
          className={cn(
            `${itemClassName} justify-start px-3 text-[13px]`,
            option.selected && "ring-2 ring-white/50",
          )}
          title={option.label}
        >
          {option.selected && (
            <Icon name="check" size={14} className="flex-shrink-0" />
          )}
          <span className="truncate flex-1">{option.label}</span>
        </Button>
      ))}
    </Card>
  );
}

function CameraControlsPanel({
  transitionProps,
  layout,
  isAndroid,
  isLightBackground,
  cameraMode,
  cameraLocked,
  cameraSaveEnabled,
  stickerBorderEnabled,
  actions,
}: Pick<
  AssistantControlPanelsProps,
  | "transitionProps"
  | "layout"
  | "isAndroid"
  | "isLightBackground"
  | "cameraMode"
  | "cameraLocked"
  | "cameraSaveEnabled"
  | "stickerBorderEnabled"
  | "actions"
>) {
  const variant = panelButtonVariant(isLightBackground);
  const buttonClass = iconButtonClassName;

  return (
    <Card
      {...transitionProps}
      padding="none"
      style={{
        left: `${layout.camera.left}px`,
        top: `${layout.camera.top}px`,
        zIndex: isAndroid ? 201 : 10001,
      }}
      variant="none"
      className={cn(
        "fixed w-[135px] flex flex-col gap-1 p-1",
        transitionProps?.className,
      )}
    >
      <div className="flex w-[125px] gap-1 justify-between">
        <Button
          onClick={actions.onToggle3D}
          variant={variant}
          className={cn(
            buttonClass,
            cameraMode === "3D" && "ring-2 ring-white/50",
          )}
          title={
            cameraMode === "3D" ? "Switch to 2D Mode" : "Switch to 3D Mode"
          }
        >
          <span className="font-medium">
            {cameraMode === "3D" ? "3D" : "2D"}
          </span>
        </Button>
        <Button
          onClick={actions.onCameraReset}
          variant={variant}
          className={buttonClass}
          title="Reset Camera Position"
        >
          <Icon name="refresh-cw" size={16} />
        </Button>
        <Button
          onClick={actions.onCameraLockToggle}
          variant={variant}
          className={cn(buttonClass, !cameraLocked && "ring-2 ring-white/50")}
          title={cameraLocked ? "Unlock Camera" : "Lock Camera"}
        >
          <Icon name={cameraLocked ? "lock" : "unlock"} size={16} />
        </Button>
      </div>

      <div className="flex w-[125px] gap-1 justify-between">
        <Button
          onClick={actions.onCameraSaveToggle}
          variant={variant}
          className={cn(
            buttonClass,
            cameraSaveEnabled && "ring-2 ring-white/50",
          )}
          title={
            cameraSaveEnabled
              ? "Disable Position Saving"
              : "Enable Position Saving"
          }
        >
          <div className="relative w-4 h-4">
            <Icon name="pin" size={16} />
            {!cameraSaveEnabled && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-0.5 bg-white/50 -rotate-45" />
              </div>
            )}
          </div>
        </Button>
        <Button
          onClick={actions.onStickerBorderToggle}
          variant={variant}
          className={cn(
            buttonClass,
            stickerBorderEnabled && "ring-2 ring-white/50",
          )}
          title={
            stickerBorderEnabled
              ? "Disable Sticker Border"
              : "Enable Sticker Border"
          }
          aria-label={
            stickerBorderEnabled
              ? "Disable Sticker Border"
              : "Enable Sticker Border"
          }
          aria-pressed={stickerBorderEnabled}
        >
          <Icon name="sticker-border" size={16} />
        </Button>
      </div>
    </Card>
  );
}

export function AssistantControlPanels({
  layout: domLayout,
  isAndroid,
  isDesktop,
  isNormalDesktop,
  isLightBackground,
  isChatOpen,
  modelDisabled,
  isEmotePanelOpen,
  isAvatarPanelOpen,
  panelMode,
  emotes,
  filteredEmotes,
  models,
  stages,
  selectedModelId,
  selectedStageId,
  selectedAutoPlayCategory,
  autoPlayCategoryOptions,
  isAutoPlayActive,
  currentPlayingEmoteId,
  emoteProgress,
  emoteCurrentTime,
  emoteDuration,
  showEmotePlaybackTime,
  showEmotePlaybackBar,
  cameraMode,
  cameraLocked,
  cameraSaveEnabled,
  stickerBorderEnabled,
  actions,
  onSeek,
}: AssistantControlPanelsProps) {
  const xr = useXrRuntime();
  const canShowPanels =
    xr.active || !isChatOpen || isDesktop || isNormalDesktop;
  const layout = xr.active
    ? {
        ...domLayout,
        emote: { left: 88, top: 48 },
        avatar: { left: 88, top: 48 },
        camera: { left: 237, top: 48 },
        stage: { left: 88, top: 48 },
        stageControls: { left: 237, top: 48 },
        stageMaxHeight: 560,
        avatarMaxHeight: 560,
      }
    : domLayout;

  const panelsAvailable = canShowPanels && !modelDisabled;
  const emoteMotion = useDockPanelTransition(
    panelsAvailable && isEmotePanelOpen && !isAvatarPanelOpen,
  );
  const stageOpen =
    panelsAvailable &&
    isAvatarPanelOpen &&
    !isEmotePanelOpen &&
    panelMode === "stage" &&
    (canRenderStages || xr.enabled);
  const stageMotion = useDockPanelTransition(stageOpen);
  const avatarMotion = useDockPanelTransition(
    panelsAvailable && isAvatarPanelOpen && !isEmotePanelOpen && !stageOpen,
  );

  return (
    <>
      <XrSurface
        id="emote-playback"
        widthMeters={0.85}
        heightMeters={0.09}
        widthPixels={850}
        heightPixels={90}
        visible={showEmotePlaybackBar}
        offsetMeters={[0, -0.65, -0.1]}
      >
        <EmotePlaybackBar
          isVisible={showEmotePlaybackBar}
          progress={emoteProgress}
          currentTime={emoteCurrentTime}
          duration={emoteDuration}
          showTime={showEmotePlaybackTime}
          onSeek={onSeek}
        />
      </XrSurface>

      {emoteMotion.isMounted && (
        <EmotePanel
          transitionProps={emoteMotion.transitionProps}
          layout={layout}
          isAndroid={isAndroid}
          isDesktop={isDesktop}
          isLightBackground={isLightBackground}
          emotes={emotes}
          filteredEmotes={filteredEmotes}
          selectedAutoPlayCategory={selectedAutoPlayCategory}
          autoPlayCategoryOptions={autoPlayCategoryOptions}
          isAutoPlayActive={isAutoPlayActive}
          currentPlayingEmoteId={currentPlayingEmoteId}
          actions={actions}
        />
      )}

      {stageMotion.isMounted && (
        <StageControlPanel
          transitionProps={stageMotion.transitionProps}
          key={selectedStageId ?? "none"}
          layout={layout}
          stages={stages}
          selectedStageId={selectedStageId}
          isLightBackground={isLightBackground}
          actions={actions}
        />
      )}
      {avatarMotion.isMounted && (
        <>
          <AvatarPanel
            transitionProps={avatarMotion.transitionProps}
            layout={layout}
            isAndroid={isAndroid}
            isDesktop={isDesktop}
            isLightBackground={isLightBackground}
            models={models}
            selectedModelId={selectedModelId}
            actions={actions}
          />
          <CameraControlsPanel
            transitionProps={avatarMotion.transitionProps}
            layout={layout}
            isAndroid={isAndroid}
            isLightBackground={isLightBackground}
            cameraMode={cameraMode}
            cameraLocked={cameraLocked}
            cameraSaveEnabled={cameraSaveEnabled}
            stickerBorderEnabled={stickerBorderEnabled}
            actions={actions}
          />
        </>
      )}
    </>
  );
}
