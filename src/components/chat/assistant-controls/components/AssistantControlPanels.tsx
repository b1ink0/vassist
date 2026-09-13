import { Button, Card } from "../../../../components/ui";
import { Icon } from "../../../../components/icons";
import EmotePlaybackBar from "../../EmotePlaybackBar";
import { cn } from "../../../../utils/cn";
import type {
  AssistantControlActions,
  AssistantControlLayout,
  EmoteListItem,
  StoredModelItem,
  StoredStageItem,
} from "../types";

interface AssistantControlPanelsProps {
  layout: AssistantControlLayout;
  isAndroid: boolean;
  isDesktop: boolean;
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
  isEmotePlaying: boolean;
  emoteProgress: number;
  emoteCurrentTime: number;
  emoteDuration: number;
  isEmotePaused: boolean;
  showEmotePlaybackBar: boolean;
  showEmotePlaybackTime: boolean;
  modelAnchorPos: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  cameraMode: "2D" | "3D";
  cameraLocked: boolean;
  cameraSaveEnabled: boolean;
  actions: AssistantControlActions;
  onSeek: (progress: number) => void;
  onTogglePause: () => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
}

const panelClassName =
  "fixed w-[135px] max-h-[300px] overflow-y-auto px-1 snap-y snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

const itemClassName =
  "snap-center flex items-center gap-2 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 rounded-[17.5px] whitespace-nowrap backdrop-blur-[10px]";

const panelButtonVariant = (isLightBackground: boolean) =>
  isLightBackground ? "dark" : "default";

function EmotePanel({
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
      padding="none"
      style={{
        left: `${layout.emote.left}px`,
        top: `${layout.emote.top}px`,
        zIndex: isAndroid ? 201 : 10001,
      }}
      variant="none"
      className={cn(
        panelClassName,
        isDesktop && emotes.length > 7 && "vassist-scroll-panel-mask",
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
  layout,
  isAndroid,
  isDesktop,
  isLightBackground,
  panelMode,
  models,
  stages,
  selectedModelId,
  selectedStageId,
  actions,
}: Pick<
  AssistantControlPanelsProps,
  | "layout"
  | "isAndroid"
  | "isDesktop"
  | "isLightBackground"
  | "panelMode"
  | "models"
  | "stages"
  | "selectedModelId"
  | "selectedStageId"
  | "actions"
>) {
  const options =
    panelMode === "avatar"
      ? [
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
        ]
      : [
          { id: null, label: "No Stage", selected: selectedStageId === null },
          ...stages.map((stage) => ({
            id: stage.id,
            label: stage.name,
            selected: selectedStageId === stage.id,
          })),
        ];

  return (
    <Card
      padding="none"
      style={{
        left: `${layout.avatar.left}px`,
        top: `${layout.avatar.top}px`,
        zIndex: isAndroid ? 201 : 10001,
      }}
      variant="none"
      className={cn(
        panelClassName,
        isDesktop && options.length > 7 && "vassist-scroll-panel-mask",
      )}
    >
      {options.map((option) => (
        <Button
          key={option.id ?? "default"}
          onClick={() =>
            panelMode === "avatar"
              ? actions.onModelSelect(option.id)
              : actions.onStageSelect(option.id)
          }
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
  layout,
  isAndroid,
  isLightBackground,
  cameraMode,
  cameraLocked,
  cameraSaveEnabled,
  actions,
  isAvatarPanelOpen,
  panelMode,
}: Pick<
  AssistantControlPanelsProps,
  | "layout"
  | "isAndroid"
  | "isLightBackground"
  | "cameraMode"
  | "cameraLocked"
  | "cameraSaveEnabled"
  | "actions"
  | "isAvatarPanelOpen"
  | "panelMode"
>) {
  const variant = panelButtonVariant(isLightBackground);
  const buttonClass =
    "flex items-center justify-center gap-1 transition-all duration-200 h-[35px] min-h-[35px] w-[35px] text-[13px] rounded-[17.5px] backdrop-blur-[10px]";

  return (
    <Card
      padding="none"
      style={{
        left: `${layout.camera.left}px`,
        top: `${layout.camera.top}px`,
        zIndex: isAndroid ? 201 : 10001,
      }}
      variant="none"
      className="fixed w-[135px] flex flex-col gap-1 p-1"
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
          onClick={actions.onToggleStagePanel}
          variant={variant}
          className={buttonClass}
          title={
            isAvatarPanelOpen && panelMode === "stage"
              ? "Switch to Avatar List"
              : isAvatarPanelOpen && panelMode === "avatar"
                ? "Switch to Stage List"
                : "Select Stage"
          }
        >
          <Icon
            name={isAvatarPanelOpen && panelMode === "avatar" ? "box" : "user"}
            size={16}
          />
        </Button>
      </div>
    </Card>
  );
}

export function AssistantControlPanels({
  layout,
  isAndroid,
  isDesktop,
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
  isEmotePaused,
  showEmotePlaybackBar,
  showEmotePlaybackTime,
  modelAnchorPos,
  cameraMode,
  cameraLocked,
  cameraSaveEnabled,
  actions,
  onSeek,
  onTogglePause,
  onSeekStart,
  onSeekEnd,
}: AssistantControlPanelsProps) {
  return (
    <>
      <EmotePlaybackBar
        isVisible={showEmotePlaybackBar}
        progress={emoteProgress}
        currentTime={emoteCurrentTime}
        duration={emoteDuration}
        isPaused={isEmotePaused}
        showTime={showEmotePlaybackTime}
        isLightBackground={isLightBackground}
        isAndroidPlatform={isAndroid}
        isChatOpen={isChatOpen}
        modelAnchor={modelAnchorPos}
        onSeek={onSeek}
        onTogglePause={onTogglePause}
        onSeekStart={onSeekStart}
        onSeekEnd={onSeekEnd}
      />

      {isEmotePanelOpen && !isChatOpen && !modelDisabled && (
        <EmotePanel
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

      {isAvatarPanelOpen && !isChatOpen && !modelDisabled && (
        <>
          <AvatarPanel
            layout={layout}
            isAndroid={isAndroid}
            isDesktop={isDesktop}
            isLightBackground={isLightBackground}
            panelMode={panelMode}
            models={models}
            stages={stages}
            selectedModelId={selectedModelId}
            selectedStageId={selectedStageId}
            actions={actions}
          />
          <CameraControlsPanel
            layout={layout}
            isAndroid={isAndroid}
            isLightBackground={isLightBackground}
            cameraMode={cameraMode}
            cameraLocked={cameraLocked}
            cameraSaveEnabled={cameraSaveEnabled}
            actions={actions}
            isAvatarPanelOpen={isAvatarPanelOpen}
            panelMode={panelMode}
          />
        </>
      )}
    </>
  );
}
