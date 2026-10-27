/**
 * @fileoverview Floating assistant control dock with positioning logic.
 */

import { useDockPanelTransition } from "./assistant-controls/hooks/useDockPanelTransition";
import { useIsAssistantReady } from "../../hooks/app/useAssistant";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import { getAvatarScreenBounds } from "../../babylon/camera/getAvatarScreenBounds";
import { XrControlPanel } from "../xr/XrControlPanel";
import { canRenderStages } from "../../babylon/stages/stageAvailability";
import { useXrRuntime } from "../../contexts/XrRuntimeContext";
import { XrSurface } from "../xr/XrSurface";
import { getXrClientRuntime } from "../../services/xr/XrClientRuntime";
import { BUILT_IN_STAGES, getBuiltInStage } from "../../config/stageConfig";
import type { StageSelection } from "../../config/stageConfig";
import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type SetStateAction,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useChatActions, useIsTempChat } from "../../hooks/app/useChat";
import { useToolingActions } from "../../hooks/app/useTooling";
import { ComposerMenu } from "./ComposerMenu";
import { getFloatingWindowSize } from "./floatingChatSize";
import DesktopModeSettings from "../settings/DesktopModeSettings";
import { Icon } from "../icons";
import { Button } from "../ui";
import { cn } from "../../utils/cn";
import { useButtonPosition, useDragActions } from "../../hooks/app/useDrag";
import {
  usePositionManagerRef,
  useSceneActions,
  useSceneRef,
  useSceneKey,
} from "../../hooks/app/useScene";
import {
  useConfigUIActions,
  useUIConfig,
} from "../../hooks/config/useConfigUI";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import Logger from "../../services/common/LoggerService";
import emoteStorageService from "../../services/storage/EmoteStorageService";
import emotePlayerService from "../../services/mmd/EmotePlayerService";
import { modelStorageService } from "../../services/storage/ModelStorageService";
import { stageStorageService } from "../../services/storage/StageStorageService";
const ARPlacementGuide = lazy(async () => {
  const module = await import("../ar/ARPlacementGuide");
  return { default: module.ARPlacementGuide };
});
import {
  isAndroid,
  isDesktop,
  isDesktopAttachedModeWindow,
  isDetachedDesktopWindow,
  isDetachedAvatarWindow,
  isDetachedChatWindow,
} from "../../utils/PlatformUtils";
import {
  PositionPresets,
  AndroidPresetOverride,
  DesktopPresetOverride,
} from "../../config/uiConfig";
import type { PositionPixels, PositionPresetLike } from "../../babylon/types";
import {
  isARModeRequested,
  onARModeStateChanged,
  setARModeRequested,
} from "../../babylon/ar/ARModeLifecycle";
import type {
  ButtonPosition,
  AssistantControlDockProps,
  DesktopApiForAssistantControls,
  DragDropServiceCtor,
  DragDropServiceLike,
  EmoteListItem,
  StoredModelItem,
  StoredStageItem,
} from "./assistant-controls/types";
import { AssistantControlPanels } from "./assistant-controls/components/AssistantControlPanels";
import { AssistantControlStack } from "./assistant-controls/components/AssistantControlStack";
import { useAssistantControlDrag } from "./assistant-controls/hooks/useAssistantControlDrag";
import { useAssistantControlTheme } from "./assistant-controls/hooks/useAssistantControlTheme";
import {
  ASSISTANT_CONTROL_PANEL_MAX_HEIGHT,
  ASSISTANT_CONTROL_ROW_HEIGHT,
  clampButtonPosition,
  getButtonPositionFromPreset as calculatePresetPosition,
  getAssistantControlLayout,
} from "./assistant-controls/positioning";

const isPositionPixels = (value: unknown): value is PositionPixels => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PositionPixels>;
  return (
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number"
  );
};

function getPlatformPresetDefaults(preset: string): PositionPresetLike {
  const presetMap = PositionPresets as Record<string, PositionPresetLike>;
  const basePreset = presetMap[preset] ?? presetMap["bottom-right"];

  if (!basePreset) {
    return {
      name: "Bottom Right",
      modelSize: { width: 300, height: 500 },
      padding: 0,
    };
  }

  if (isAndroid) {
    return { ...basePreset, ...AndroidPresetOverride };
  }

  if (isDesktop) {
    return { ...basePreset, ...DesktopPresetOverride };
  }

  return basePreset;
}

/**
 * Floating assistant control dock with automatic positioning.
 *
 * @param {Object} props
 * @param {Function} props.onClick - Click handler
 * @param {boolean} props.isVisible - Visibility state
 * @param {boolean} props.modelDisabled - Whether 3D model is disabled
 * @param {boolean} props.isChatOpen - Whether chat is open
 * @param {Object} props.chatInputRef - Reference to chat input
 * @returns {JSX.Element|null}
 */
const AssistantControlDock = ({
  onClick,
  isVisible = true,
  modelDisabled = false,
  isChatOpen = false,
  chatInputRef,
}: AssistantControlDockProps) => {
  const positionManagerRef = usePositionManagerRef();
  const sceneRef = useSceneRef();
  const sceneKey = useSceneKey();
  const assistantReady = useIsAssistantReady();
  const { embedConfig } = useEmbedHost();
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }));
  useEffect(() => {
    const resize = () =>
      setViewport({
        width: window.innerWidth,
        height: Math.min(
          window.innerHeight,
          window.visualViewport?.height ?? window.innerHeight,
        ),
      });
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, []);
  const xr = useXrRuntime();
  const stagesAvailable = canRenderStages || xr.enabled;
  const { reloadScene, recreateScene } = useSceneActions();
  const buttonPos = useButtonPosition();
  const {
    updateButtonPosition: setButtonPos,
    startButtonDrag,
    endButtonDrag,
  } = useDragActions();
  const {
    setPendingDropData,
    setIsChatContainerVisible,
    setIsChatInputVisible,
    setIsTempChat,
    clearChat,
  } = useChatActions();
  const { setIsHistoryPanelOpen, setIsSettingsPanelOpen, setIsQuickPanelOpen } =
    useToolingActions();
  const isTempChat = useIsTempChat();
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const desktopApi = useDesktopApi();
  const desktopAPI = desktopApi as DesktopApiForAssistantControls | null;
  const xrAvailable = xr.enabled || (isDesktop && Boolean(desktopApi?.xr));
  const showXrButton = xrAvailable && !modelDisabled;
  const controlsCollapsed = uiConfig.assistantControlsCollapsed === true;
  const allowFloatingDockDrag =
    isDesktop &&
    !isDesktopAttachedModeWindow &&
    !isDetachedDesktopWindow &&
    !xr.active;

  const lastSetPosition = useRef<ButtonPosition>({ x: -100, y: -100 });
  const [isDragOverButton, setIsDragOverButton] = useState(false);
  const [isXrPanelOpen, setIsXrPanelOpen] = useState(false);
  const xrPanelMotion = useDockPanelTransition(
    !controlsCollapsed && xrAvailable && isXrPanelOpen,
  );
  const [isEmotePanelOpen, setIsEmotePanelOpen] = useState(false);
  const [emotes, setEmotes] = useState<EmoteListItem[]>([]);
  const [isAutoPlayActive, setIsAutoPlayActive] = useState(false);
  const [isEmotePlaying, setIsEmotePlaying] = useState(false);
  const [currentPlayingEmoteId, setCurrentPlayingEmoteId] = useState<
    string | null
  >(null);
  const [emoteCurrentTime, setEmoteCurrentTime] = useState(0);
  const [emoteDuration, setEmoteDuration] = useState(0);
  const [emoteProgress, setEmoteProgress] = useState(0);
  const autoPlaySyncSignatureRef = useRef("");
  const [isAvatarPanelOpen, setIsAvatarPanelOpen] = useState(false);
  const [isZoomExpanded, setIsZoomExpanded] = useState(false);
  const [models, setModels] = useState<StoredModelItem[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState("avatar"); // 'avatar' or 'stage'
  const [stages, setStages] = useState<StoredStageItem[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [isARMode, setIsARMode] = useState(isARModeRequested);
  const [isARToggling, setIsARToggling] = useState(false);
  const dragDropServiceRef = useRef<DragDropServiceLike | null>(null);
  const buttonRef = useRef<HTMLDivElement | null>(null);

  const saveCommittedPosition = useCallback(
    (position: ButtonPosition) => {
      if (uiConfig.position?.preset !== "last-location") return;
      setTimeout(() => {
        Logger.log("AssistantControlDock", "Saving last location:", position);
        updateUIConfig("position.lastLocation", {
          x: position.x,
          y: position.y,
          width: 48,
          height: 48,
        });
      }, 100);
    },
    [uiConfig.position?.preset, updateUIConfig],
  );

  const {
    isDragging,
    dragVisualPos,
    hasDragged,
    buttonPosRef,
    handleMouseDown,
  } = useAssistantControlDrag({
    modelDisabled,
    allowWindowDrag: allowFloatingDockDrag,
    isChatOpen,
    desktopAPI,
    buttonPos,
    setButtonPos,
    startButtonDrag,
    endButtonDrag,
    onPositionCommitted: saveCommittedPosition,
  });

  // Delayed render state for fade animation
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [isAppearing, setIsAppearing] = useState(false);

  const isLightBackground = useAssistantControlTheme({
    buttonRef,
    shouldRender,
    isDragging,
    mode: uiConfig?.backgroundDetection?.mode,
  });

  useEffect(
    () =>
      onARModeStateChanged(({ requested, active }) => {
        setIsARMode(active ?? requested);
        if (!requested || typeof active === "boolean") {
          setIsARToggling(false);
        }
      }),
    [],
  );

  useEffect(() => {
    if (isEmotePanelOpen) {
      emoteStorageService
        .getEmotesList()
        .then((allEmotes) => {
          const visibleEmotes = allEmotes.filter(
            (emote) => emote.isVisible !== false,
          );
          setEmotes(visibleEmotes);
        })
        .catch((err) => {
          Logger.error("AssistantControlDock", "Failed to load emotes:", err);
        });
    }
  }, [isEmotePanelOpen]);

  useEffect(() => {
    if (isAvatarPanelOpen && panelMode === "avatar") {
      modelStorageService
        .getModelsList()
        .then((modelsList) => {
          // Filter out Unknown Model (default model without data)
          const filteredModels = modelsList.filter(
            (model) => model.name !== "Unknown Model",
          );
          setModels(filteredModels);
          // Get current default model
          modelStorageService
            .getDefaultModel()
            .then((defaultModel) => {
              setSelectedModelId(defaultModel?.id || null);
            })
            .catch((err) => {
              Logger.error(
                "AssistantControlDock",
                "Failed to get default model:",
                err,
              );
            });
        })
        .catch((err) => {
          Logger.error("AssistantControlDock", "Failed to load models:", err);
        });
    }
  }, [isAvatarPanelOpen, panelMode]);

  useEffect(() => {
    if (isAvatarPanelOpen && panelMode === "stage") {
      stageStorageService
        .getStagesList()
        .then((stagesList) => {
          setStages(stagesList);
          stageStorageService
            .getDefaultStage()
            .then((defaultStage) => {
              const selection = uiConfig.stage?.selection;
              setSelectedStageId(
                selection?.kind === "builtin"
                  ? `builtin:${selection.id}`
                  : selection?.kind === "custom"
                    ? selection.id
                    : selection?.kind === "none"
                      ? null
                      : defaultStage?.id || null,
              );
            })
            .catch((err) => {
              Logger.error(
                "AssistantControlDock",
                "Failed to get default stage:",
                err,
              );
            });
        })
        .catch((err) => {
          Logger.error("AssistantControlDock", "Failed to load stages:", err);
        });
    }
  }, [isAvatarPanelOpen, panelMode, uiConfig.stage?.selection]);

  useEffect(() => {
    if ((isChatOpen && !isDesktop && !xr.active) || modelDisabled) {
      setIsEmotePanelOpen(false);
      setIsAvatarPanelOpen(false);
      setIsZoomExpanded(false);
    }
  }, [isChatOpen, modelDisabled, xr.active]);

  // Track emote playing state
  useEffect(() => {
    const checkPlayingState = setInterval(() => {
      const isPlaying = emotePlayerService.isEmotePlaying();
      setIsEmotePlaying(isPlaying);

      // Update current playing emote ID
      const currentEmoteId = emotePlayerService.getCurrentEmoteId();
      setCurrentPlayingEmoteId(currentEmoteId);

      const duration = emotePlayerService.getPlaybackDuration();
      const currentTime = emotePlayerService.getPlaybackCurrentTime();
      const progress = emotePlayerService.getPlaybackProgress();
      setEmoteCurrentTime(currentTime);
      setEmoteDuration(duration);
      setEmoteProgress(progress);

      // Update auto-play active state
      const autoPlayActive =
        getXrClientRuntime()?.getPlaybackState().autoPlay ??
        emotePlayerService.isAutoPlayActive();
      setIsAutoPlayActive(autoPlayActive);
    }, 100);

    return () => clearInterval(checkPlayingState);
  }, []);

  /**
   * Handle delayed unmount for fade animation
   */
  useEffect(() => {
    if (isVisible && !shouldRender) {
      // Transitioning to visible - mount and trigger fade-in
      setShouldRender(true);
      setIsAppearing(true);
      // Remove appearing class after animation completes
      const timeout = setTimeout(() => setIsAppearing(false), 300);
      return () => clearTimeout(timeout);
    } else if (!isVisible && shouldRender) {
      // Transitioning to hidden - trigger fade-out then unmount
      setIsAppearing(false);
      const timeout = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timeout);
    }
    // No state change if already in correct state
  }, [isVisible, shouldRender]);

  // Load saved position when model is disabled (chat-only mode)
  useEffect(() => {
    if (!modelDisabled) return;
    const load = async () => {
      const defaultPos = {
        x: window.innerWidth - 68,
        y: window.innerHeight - 68,
      };

      try {
        const positionConfig = uiConfig.position || { preset: "bottom-right" };
        const preset = positionConfig.preset || "bottom-right";

        let targetPos = defaultPos;

        if (isDetachedChatWindow) {
          targetPos = calculatePresetPosition("bottom-center", {
            width: window.innerWidth,
            height: window.innerHeight,
          });
        } else if (preset === "last-location" && positionConfig.lastLocation) {
          const { x, y } = positionConfig.lastLocation;
          targetPos = { x, y };
          Logger.log(
            "AssistantControlDock",
            "Loading from last location:",
            targetPos,
          );
        } else if (preset !== "last-location") {
          // Use preset position (convert to button position)
          targetPos = calculatePresetPosition(preset, {
            width: window.innerWidth,
            height: window.innerHeight,
          });
          Logger.log(
            "AssistantControlDock",
            "Loading from preset:",
            preset,
            targetPos,
          );
        }

        // Bound check
        const validPos = clampButtonPosition(targetPos, {
          width: window.innerWidth,
          height: window.innerHeight,
        });

        setButtonPos(validPos);
        buttonPosRef.current = validPos;
      } catch (err) {
        Logger.error("AssistantControlDock", "load position failed", err);
        setButtonPos(defaultPos);
        buttonPosRef.current = defaultPos;
      }
    };
    load();
  }, [modelDisabled, setButtonPos, uiConfig.position, buttonPosRef]);

  // Adjust button position when chat opens (if in chat-only mode)
  useEffect(() => {
    if (!modelDisabled || !isChatOpen || isDesktop) return;

    const chatInputHeight =
      chatInputRef?.current?.getBoundingClientRect().height || 140;
    const minDistanceFromBottom = chatInputHeight + 15;

    const currentPos = buttonPosRef.current;
    if (currentPos.y > window.innerHeight - minDistanceFromBottom) {
      const newY = window.innerHeight - minDistanceFromBottom;
      const newPos = { x: currentPos.x, y: newY };
      setButtonPos(newPos);
      buttonPosRef.current = newPos;

      // Save if using last-location
      if (uiConfig.position?.preset === "last-location") {
        updateUIConfig("position.lastLocation", {
          x: newPos.x,
          y: newPos.y,
          width: 48,
          height: 48,
        });
      }

      const event = new CustomEvent("chatButtonMoved", { detail: newPos });
      window.dispatchEvent(event);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    modelDisabled,
    isChatOpen,
    uiConfig.position?.preset,
    updateUIConfig,
    buttonPosRef,
  ]); // chatInputRef is stable, don't include in dependencies

  // Handle window resize - keep button within bounds when in chat-only mode
  const handleResize = useCallback(async () => {
    const buttonSize = 48;

    if (isDetachedChatWindow) {
      const centeredPosition = calculatePresetPosition("bottom-center", {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setButtonPos(centeredPosition);
      buttonPosRef.current = centeredPosition;
      return;
    }

    const boundedX = Math.max(
      10,
      Math.min(buttonPos.x, window.innerWidth - buttonSize - 10),
    );
    const boundedY = Math.max(
      10,
      Math.min(buttonPos.y, window.innerHeight - buttonSize - 10),
    );
    if (boundedX !== buttonPos.x || boundedY !== buttonPos.y) {
      const newPos = { x: boundedX, y: boundedY };
      setButtonPos(newPos);

      // Save if using last-location
      if (uiConfig.position?.preset === "last-location") {
        updateUIConfig("position.lastLocation", {
          x: newPos.x,
          y: newPos.y,
          width: 48,
          height: 48,
        });
      }
    }
  }, [
    buttonPos.x,
    buttonPos.y,
    setButtonPos,
    uiConfig.position?.preset,
    updateUIConfig,
    buttonPosRef,
  ]);

  useEffect(() => {
    if (!modelDisabled) return;
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [modelDisabled, handleResize]);

  // When model is enabled, follow the model position (throttled events come from PositionManager)
  useEffect(() => {
    if (modelDisabled) return;
    const updateFromModel = async (ev?: Event): Promise<void> => {
      let modelPos: PositionPixels | null = null;
      if (ev instanceof CustomEvent && isPositionPixels(ev.detail)) {
        modelPos = ev.detail;
      } else if (positionManagerRef?.current) {
        try {
          modelPos = positionManagerRef.current.getPositionPixels();
        } catch (err) {
          Logger.error("AssistantControlDock", "getPositionPixels failed", err);
          return;
        }
      } else return;

      const scene = sceneRef.current;
      if (
        !isDesktop &&
        !xr.active &&
        scene?.metadata?.getCameraMode?.() === "3D"
      ) {
        modelPos = getAvatarScreenBounds(scene) ?? modelPos;
      }

      // Attached app/live-wallpaper windows use the fixed full-window dock.
      // Do not move the dock with the avatar in those layouts.
      if (isDesktopAttachedModeWindow) return;

      try {
        const buttonSize = 48;
        const offsetX = 15;
        const padding = 10;

        // Chat icon positioning - at bottom of effectiveHeight (visible area)
        let buttonY = modelPos.y + modelPos.height - buttonSize;

        // Desktop mode: Position on right side, but use Electron window bounds
        // Browser mode: Dynamic positioning based on available space
        let buttonX;
        if (isDesktop) {
          buttonX = modelPos.x + modelPos.width + offsetX;

          if (desktopAPI?.window?.getSize) {
            try {
              const electronWindow = await desktopAPI.window.getSize();
              const electronWindowWidth = electronWindow.width;
              const electronWindowHeight = electronWindow.height;

              // If button's right edge exceeds Electron window width, reposition
              if (buttonX + buttonSize > electronWindowWidth - padding) {
                buttonX = electronWindowWidth - buttonSize - padding;
                Logger.log(
                  "AssistantControlDock",
                  `Button X clipped, repositioned to: ${buttonX} (window width: ${electronWindowWidth})`,
                );
              }

              // If button's bottom edge exceeds Electron window height, reposition
              if (buttonY + buttonSize > electronWindowHeight - padding) {
                buttonY = electronWindowHeight - buttonSize - padding;
                Logger.log(
                  "AssistantControlDock",
                  `Button Y clipped, repositioned to: ${buttonY} (window height: ${electronWindowHeight})`,
                );
              }

              // If button's top edge is above window, reposition
              if (buttonY < padding) {
                buttonY = padding;
                Logger.log(
                  "AssistantControlDock",
                  `Button Y above window, repositioned to: ${buttonY}`,
                );
              }
            } catch (err) {
              Logger.error(
                "AssistantControlDock",
                "Failed to get Electron window size:",
                err,
              );
            }
          }
        } else {
          // Browser: Check for overflow and position dynamically
          const rightX = modelPos.x + modelPos.width + offsetX;
          const leftX = modelPos.x - buttonSize - offsetX;
          const windowWidth = window.innerWidth;
          const wouldOverflowRight = rightX + buttonSize > windowWidth - 10;
          const shouldBeOnLeft =
            wouldOverflowRight || modelPos.x > windowWidth * 0.7;
          buttonX = shouldBeOnLeft ? leftX : rightX;
        }

        const newX = Math.round(buttonX);
        const newY = Math.round(buttonY);

        if (
          newX === lastSetPosition.current.x &&
          newY === lastSetPosition.current.y
        )
          return;

        lastSetPosition.current = { x: newX, y: newY };
        setButtonPos({ x: newX, y: newY });
      } catch (err) {
        Logger.error("AssistantControlDock", "updateFromModel failed", err);
      }
    };

    void updateFromModel();
    let lastProjection = 0;
    const scene = sceneRef.current;
    const observer =
      !isDesktop &&
      scene?.onAfterRenderObservable.add(() => {
        if (performance.now() - lastProjection > 250) {
          lastProjection = performance.now();
          void updateFromModel();
        }
      });
    window.addEventListener("modelPositionChange", updateFromModel);
    window.addEventListener("resize", updateFromModel);
    return () => {
      if (observer) scene?.onAfterRenderObservable.remove(observer);
      window.removeEventListener("modelPositionChange", updateFromModel);
      window.removeEventListener("resize", updateFromModel);
    };
  }, [
    modelDisabled,
    positionManagerRef,
    setButtonPos,
    desktopAPI,
    sceneRef,
    sceneKey,
    assistantReady,
    xr.active,
  ]);

  const handleClick = useCallback(
    (e?: ReactMouseEvent<HTMLElement>) => {
      if ((modelDisabled || allowFloatingDockDrag) && hasDragged) {
        e?.preventDefault();
        e?.stopPropagation();
        return;
      }
      if (typeof onClick === "function") onClick(e);
    },
    [modelDisabled, allowFloatingDockDrag, hasDragged, onClick],
  );

  // Attach drag-drop service to button so drops set pending data in AppContext
  useEffect(() => {
    if (!shouldRender) {
      Logger.log(
        "AssistantControlDock",
        "Skipping drag-drop setup - not rendered",
      );
      return;
    }

    Logger.log("AssistantControlDock", "Drag-drop setup effect running", {
      hasButton: !!buttonRef.current,
      shouldRender,
    });

    let attached = true;

    // Wait a short moment for the element to be in DOM
    const setupTimeout = setTimeout(() => {
      if (!attached) {
        Logger.log(
          "AssistantControlDock",
          "Cleanup called before setup completed",
        );
        return;
      }

      if (!buttonRef.current) {
        Logger.log("AssistantControlDock", "Button ref not available");
        return;
      }

      Logger.log("AssistantControlDock", "Setting up drag-drop service");

      import("../../services/media/DragDropService")
        .then(({ default: DragDropService }) => {
          const DragDropServiceClass =
            DragDropService as unknown as DragDropServiceCtor;
          if (!attached) {
            Logger.log(
              "AssistantControlDock",
              "Cleanup called during async import",
            );
            return;
          }
          const el = buttonRef.current;
          if (!el) {
            Logger.log(
              "AssistantControlDock",
              "Button ref lost during async import",
            );
            return;
          }

          dragDropServiceRef.current = new DragDropServiceClass({
            maxImages: 3,
            maxAudios: 1,
          });
          dragDropServiceRef.current.attach(el, {
            onSetDragOver: (flag) => setIsDragOverButton(flag),
            onShowError: (err) =>
              Logger.error("AssistantControlDock", "DragDrop error", err),
            checkVoiceMode: null,
            getCurrentCounts: () => ({ images: 0, audios: 0 }),
            onProcessData: (data) => {
              if (!isChatOpen) handleClick();
              setPendingDropData(data as never);
            },
          });
        })
        .catch((err) =>
          Logger.error(
            "AssistantControlDock",
            "load DragDropService failed",
            err,
          ),
        );
    }, 50); // Short delay for DOM to be ready

    return () => {
      attached = false;
      clearTimeout(setupTimeout);
      Logger.log("AssistantControlDock", "Cleaning up drag-drop service");
      if (dragDropServiceRef.current) {
        dragDropServiceRef.current.detach();
        dragDropServiceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender]); // Trigger when button actually renders

  /**
   * Unified zoom handler
   * @param {'in' | 'out' | 'reset'} zoomType - Type of zoom operation
   */
  const handleZoom = useCallback(
    (zoomType: "in" | "out" | "reset") => {
      const arController = sceneRef.current?.metadata?.arController;
      if (arController?.isActive()) {
        arController.resizeModel(zoomType);
        return;
      }
      if (zoomType === "reset") {
        sceneRef.current?.metadata?.resetCameraRotation?.();
      }
      const positionManager = positionManagerRef.current;
      if (!positionManager) return;

      const currentSize = positionManager.modelHeightPx || 600;
      const zoomAmount = 50;

      // Get preset default size from PositionPresets
      const currentPreset = uiConfig.position?.preset || "bottom-right";
      const presetConfig = getPlatformPresetDefaults(currentPreset);
      const defaultHeight = presetConfig?.modelSize?.height || 500;
      const defaultWidth = presetConfig?.modelSize?.width || 300;

      let newSize, newWidth;

      switch (zoomType) {
        case "in":
          newSize = currentSize + zoomAmount;
          newWidth = newSize * 0.6;
          Logger.log(
            "AssistantControlDock",
            `Zooming in: ${currentSize}px Ã¢â€ â€™ ${newSize}px`,
          );
          break;
        case "out":
          if (currentSize <= defaultHeight) {
            Logger.log(
              "AssistantControlDock",
              "Already at default size, cannot zoom out",
            );
            return;
          }
          newSize = Math.max(defaultHeight, currentSize - zoomAmount);
          newWidth = Math.max(defaultWidth, newSize * 0.6);
          Logger.log(
            "AssistantControlDock",
            `Zooming out: ${currentSize}px Ã¢â€ â€™ ${newSize}px`,
          );
          break;
        case "reset":
          newSize = defaultHeight;
          newWidth = defaultWidth;
          Logger.log("AssistantControlDock", "Resetting zoom to default");
          break;
        default:
          Logger.warn("AssistantControlDock", `Unknown zoom type: ${zoomType}`);
          return;
      }

      updateUIConfig(
        "modelSizePx",
        zoomType === "reset"
          ? null
          : {
              width: newWidth,
              height: newSize,
            },
      );

      const updateWindowSizeForZoom =
        desktopAPI?.window?.updateWindowSizeForZoom;
      const getWindowSize = desktopAPI?.window?.getSize;

      if (isDesktop && updateWindowSizeForZoom && getWindowSize) {
        Logger.log(
          "AssistantControlDock",
          `Requesting Electron window resize for model size: ${newWidth}x${newSize}`,
        );
        updateWindowSizeForZoom(newWidth, newSize)
          .then(() => {
            return getWindowSize();
          })
          .then((windowSize) => {
            Logger.log(
              "AssistantControlDock",
              `Window resized to: ${windowSize.width}x${windowSize.height}`,
            );

            const event = new CustomEvent("updateCanvasSize", {
              detail: {
                width: windowSize.width,
                height: windowSize.height,
                modelWidth: newWidth,
                modelHeight: newSize,
              },
            });
            window.dispatchEvent(event);

            if (
              !isDesktopAttachedModeWindow &&
              !isDetachedDesktopWindow &&
              isChatOpen &&
              desktopApi?.window?.setSize
            ) {
              const size = getFloatingWindowSize(
                windowSize.width,
                windowSize.height,
                true,
              );
              void desktopApi.window.setSize(size.width, size.height);
            }

            setTimeout(() => {
              if (!positionManager) return;

              const oldCanvasWidth = positionManager.canvasWidth;
              const oldCanvasHeight = positionManager.canvasHeight;
              const oldPosX = positionManager.positionX;
              const oldPosY = positionManager.positionY;
              const oldModelHeight = positionManager.effectiveHeightPx;

              positionManager.updateCanvasDimensions();

              if (zoomType === "reset") {
                Logger.log(
                  "AssistantControlDock",
                  "Resetting to preset position",
                );
                positionManager.applyPreset(currentPreset, {
                  modelSizePx: { width: newWidth, height: newSize },
                });
              } else {
                const canvasWidthDelta =
                  positionManager.canvasWidth - oldCanvasWidth;
                const canvasHeightDelta =
                  positionManager.canvasHeight - oldCanvasHeight;

                const modelHeightDelta = newSize - oldModelHeight;

                const scaleFactorHeight = 0.75;
                const compensationMultiplier = (1 - scaleFactorHeight) * 100;

                const newPosX = oldPosX + canvasWidthDelta;
                const newPosY =
                  oldPosY +
                  canvasHeightDelta -
                  modelHeightDelta * compensationMultiplier;

                positionManager.positionX = newPosX;
                positionManager.positionY = newPosY;
                positionManager.modelHeightPx = newSize;
                positionManager.modelWidthPx = newWidth;
                positionManager.effectiveHeightPx = newSize;

                positionManager.updateCameraFrustum();
              }
            }, 300);
          })
          .catch((err) => {
            Logger.warn(
              "AssistantControlDock",
              "Failed to update window/canvas size:",
              err,
            );
          });
      } else {
        if (zoomType === "reset") {
          positionManager.applyPreset(currentPreset, {
            modelSizePx: { width: newWidth, height: newSize },
          });
        } else {
          const oldPosX = positionManager.positionX;
          const oldPosY = positionManager.positionY;
          const oldModelWidth = positionManager.modelWidthPx;
          const oldModelHeight = positionManager.modelHeightPx;

          const widthDelta = newWidth - oldModelWidth;
          const heightDelta = newSize - oldModelHeight;

          const newPosX = oldPosX - widthDelta / 2;
          const newPosY = oldPosY - heightDelta / 2;

          positionManager.positionX = newPosX;
          positionManager.positionY = newPosY;
          positionManager.modelHeightPx = newSize;
          positionManager.modelWidthPx = newWidth;
          positionManager.effectiveHeightPx = newSize;
        }

        positionManager.updateCameraFrustum();
      }
    },
    [
      sceneRef,
      positionManagerRef,
      updateUIConfig,
      desktopAPI,
      desktopApi,
      isChatOpen,
      uiConfig.position,
    ],
  );

  const isAtDefaultSize = useCallback(() => {
    if (sceneRef.current?.metadata?.arController?.isActive()) return false;
    const positionManager = positionManagerRef.current;
    if (!positionManager) return true;

    if (!uiConfig.modelSizePx) return true;

    const currentPreset = uiConfig.position?.preset || "bottom-right";
    const presetConfig = getPlatformPresetDefaults(currentPreset);
    const defaultHeight = presetConfig?.modelSize?.height || 500;

    const currentSize = positionManager.modelHeightPx || defaultHeight;
    return currentSize <= defaultHeight;
  }, [sceneRef, positionManagerRef, uiConfig.modelSizePx, uiConfig.position]);

  const handleZoomIn = useCallback(() => handleZoom("in"), [handleZoom]);
  const handleZoomOut = useCallback(() => handleZoom("out"), [handleZoom]);
  const handleZoomReset = useCallback(() => handleZoom("reset"), [handleZoom]);
  const handleRotate = useCallback(
    (degrees: number) => {
      const scene = sceneRef.current;
      const arController = scene?.metadata?.arController;
      if (arController?.isActive()) {
        arController.rotateModel(degrees);
        return;
      }
      scene?.metadata?.rotateCameraBy?.(degrees);
    },
    [sceneRef],
  );
  const handleRotateLeft = useCallback(() => handleRotate(-10), [handleRotate]);
  const handleRotateRight = useCallback(() => handleRotate(10), [handleRotate]);

  const handleAutoPlayToggle = useCallback(async () => {
    try {
      if (isAutoPlayActive) {
        const connected = getXrClientRuntime();
        if (connected) await connected.action("emote.autoplay.stop", []);
        else emotePlayerService.stopAutoPlay();
        setIsAutoPlayActive(false);
        autoPlaySyncSignatureRef.current = "";
        Logger.log("AssistantControlDock", "Auto-play stopped");
      } else {
        const autoPlayCategory = (
          uiConfig.emotePlayback?.autoPlayCategory || "all"
        )
          .trim()
          .toLowerCase();
        const emoteIds = emotes
          .filter((emote) => {
            if (autoPlayCategory === "all") {
              return true;
            }
            return (emote.categories || []).includes(autoPlayCategory);
          })
          .map((e) => e.id);

        if (emoteIds.length === 0) {
          Logger.warn(
            "AssistantControlDock",
            `No emotes found for auto-play category: ${autoPlayCategory}`,
          );
          return;
        }

        autoPlaySyncSignatureRef.current = emoteIds.join("|");
        const connected = getXrClientRuntime();
        if (connected)
          await connected.action("emote.autoplay.start", [emoteIds]);
        else await emotePlayerService.startAutoPlay(emoteIds);
        setIsAutoPlayActive(true);
        setIsEmotePanelOpen(false);
        Logger.log("AssistantControlDock", "Auto-play started");
      }
    } catch (err) {
      autoPlaySyncSignatureRef.current = "";
      Logger.error("AssistantControlDock", "Failed to toggle auto-play:", err);
    }
  }, [isAutoPlayActive, emotes, uiConfig.emotePlayback?.autoPlayCategory]);

  const handleEmoteSeek = useCallback((nextProgress: number) => {
    emotePlayerService.seekToProgress(nextProgress);
    void getXrClientRuntime()
      ?.action("emote.seek", [nextProgress])
      .catch((error: unknown) => Logger.error("XR", "Seek failed", error));
  }, []);

  const handleModelSelect = useCallback(
    async (modelId: string | null) => {
      try {
        if (xr.active) await xr.controller?.exit();
        const connected = getXrClientRuntime();
        if (connected) {
          await connected.action("model.select", [modelId]);
          setSelectedModelId(modelId);
          setIsAvatarPanelOpen(false);
          return;
        }
        if (modelId === null) {
          await modelStorageService.clearAllDefaults();
        } else {
          await modelStorageService.setDefaultModel(modelId);
        }
        setSelectedModelId(modelId);
        setIsAvatarPanelOpen(false);
        Logger.log(
          "AssistantControlDock",
          `Model ${modelId || "default"} selected, reloading scene...`,
        );
        reloadScene();
      } catch (err) {
        Logger.error("AssistantControlDock", "Failed to select model:", err);
      }
    },
    [reloadScene, xr.active, xr.controller],
  );

  const handleStageSelect = useCallback(
    async (stageId: string | null) => {
      try {
        if (!stagesAvailable) return;
        const builtin = stageId?.startsWith("builtin:")
          ? getBuiltInStage(stageId.slice(8))
          : undefined;
        if (stageId && !builtin)
          await stageStorageService.setDefaultStage(stageId);
        const selection: StageSelection = builtin
          ? { kind: "builtin", id: builtin.id }
          : stageId
            ? { kind: "custom", id: stageId }
            : { kind: "none" };
        updateUIConfig("stage.selection", selection);
        setSelectedStageId(stageId);
        Logger.log(
          "AssistantControlDock",
          `Stage ${stageId || "none"} selected, reloading scene...`,
        );
        const replace = sceneRef.current?.metadata?.replaceXrStage;
        if (xr.enabled && replace) {
          await replace({
            ...uiConfig.stage,
            selection,
          });
        } else requestAnimationFrame(recreateScene);
      } catch (err) {
        Logger.error("AssistantControlDock", "Failed to select stage:", err);
      }
    },
    [
      recreateScene,
      sceneRef,
      uiConfig.stage,
      updateUIConfig,
      stagesAvailable,
      xr.enabled,
    ],
  );

  const [_forceUpdate, setForceUpdate] = useState(0);

  const handle3DToggle = useCallback(() => {
    if (!sceneRef?.current) {
      Logger.warn("AssistantControlDock", "Scene not available yet");
      return;
    }

    const scene = sceneRef.current;
    if (!scene.metadata?.toggleCameraMode) {
      Logger.error(
        "AssistantControlDock",
        "Camera toggle function not available",
      );
      return;
    }

    scene.metadata.toggleCameraMode();
    setForceUpdate((prev) => prev + 1);
  }, [sceneRef]);

  const handleCameraLockToggle = useCallback(() => {
    if (!sceneRef?.current) {
      Logger.warn("AssistantControlDock", "Scene not available yet");
      return;
    }

    const scene = sceneRef.current;
    if (!scene.metadata?.toggleCameraLock) {
      Logger.error(
        "AssistantControlDock",
        "Camera lock toggle function not available",
      );
      return;
    }

    scene.metadata.toggleCameraLock();
    setForceUpdate((prev) => prev + 1);
  }, [sceneRef]);

  const handleCameraReset = useCallback(() => {
    if (!sceneRef?.current) {
      Logger.warn("AssistantControlDock", "Scene not available yet");
      return;
    }

    const scene = sceneRef.current;
    if (!scene.metadata?.resetCameraPosition) {
      Logger.error(
        "AssistantControlDock",
        "Camera reset function not available",
      );
      return;
    }

    scene.metadata.resetCameraPosition();
    setForceUpdate((prev) => prev + 1);
  }, [sceneRef]);

  const handleCameraSaveToggle = useCallback(() => {
    if (!sceneRef?.current) {
      Logger.warn("AssistantControlDock", "Scene not available yet");
      return;
    }

    const scene = sceneRef.current;
    if (!scene.metadata?.toggleCameraSave) {
      Logger.error(
        "AssistantControlDock",
        "Camera save toggle function not available",
      );
      return;
    }

    scene.metadata.toggleCameraSave();
    setForceUpdate((prev) => prev + 1);
  }, [sceneRef]);

  const handleARToggle = useCallback(async () => {
    if (!sceneRef?.current || isARToggling) return;
    const arController = sceneRef.current.metadata?.arController;

    setIsAvatarPanelOpen(false);
    setIsEmotePanelOpen(false);
    setIsARToggling(true);
    try {
      if (isARModeRequested()) {
        setARModeRequested(false);
        if (arController?.isActive()) await arController.exitAR();
        setIsARMode(false);
        recreateScene();
      } else {
        setARModeRequested(true);
        setIsARMode(true);
        recreateScene();
      }
    } catch (error) {
      Logger.error("AssistantControlDock", "Failed to toggle AR mode", error);
      setARModeRequested(false);
      setIsARMode(false);
    } finally {
      if (!isARModeRequested()) setIsARToggling(false);
    }
  }, [sceneRef, isARToggling, recreateScene]);

  const selectedAutoPlayCategory =
    uiConfig.emotePlayback?.autoPlayCategory || "all";
  const autoPlayCategoryOptions = useMemo(() => {
    const categorySet = new Set<string>();
    emotes.forEach((emote) => {
      (emote.categories || []).forEach((category) => {
        if (typeof category === "string" && category.trim()) {
          categorySet.add(category.trim().toLowerCase());
        }
      });
    });

    if (categorySet.size === 0) {
      categorySet.add("general");
    }

    return [
      { value: "all", label: "All Categories" },
      ...Array.from(categorySet).map((category) => ({
        value: category,
        label: category.charAt(0).toUpperCase() + category.slice(1),
      })),
    ];
  }, [emotes]);

  const filteredEmotes = useMemo(() => {
    const normalizedCategory = selectedAutoPlayCategory.trim().toLowerCase();
    if (normalizedCategory === "all") {
      return emotes;
    }

    return emotes.filter((emote) =>
      (emote.categories || []).includes(normalizedCategory),
    );
  }, [emotes, selectedAutoPlayCategory]);

  const autoPlayEmoteIds = useMemo(
    () => filteredEmotes.map((emote) => emote.id),
    [filteredEmotes],
  );

  useEffect(() => {
    const hasSelectedCategory = autoPlayCategoryOptions.some(
      (option) => option.value === selectedAutoPlayCategory,
    );
    if (!hasSelectedCategory) {
      updateUIConfig("emotePlayback.autoPlayCategory", "all");
    }
  }, [autoPlayCategoryOptions, selectedAutoPlayCategory, updateUIConfig]);

  useEffect(() => {
    if (!isAutoPlayActive) {
      autoPlaySyncSignatureRef.current = "";
      return;
    }
    // Paired views observe the owner's queue. They must not restart it on snapshot updates.
    if (getXrClientRuntime()) return;

    if (autoPlayEmoteIds.length === 0) {
      emotePlayerService.stopAutoPlay();
      setIsAutoPlayActive(false);
      autoPlaySyncSignatureRef.current = "";
      Logger.warn(
        "AssistantControlDock",
        "Auto-play stopped because selected category has no emotes",
      );
      return;
    }

    const nextSignature = autoPlayEmoteIds.join("|");
    if (autoPlaySyncSignatureRef.current === nextSignature) {
      return;
    }

    autoPlaySyncSignatureRef.current = nextSignature;
    emotePlayerService.updateAutoPlayQueue(autoPlayEmoteIds);
  }, [isAutoPlayActive, autoPlayEmoteIds]);

  const dockBoundaryRef = useRef<HTMLDivElement>(null);
  const pointerInsideDock = useRef(false);
  useEffect(() => {
    if (
      !isXrPanelOpen &&
      !isEmotePanelOpen &&
      !isAvatarPanelOpen &&
      !isZoomExpanded
    )
      return;
    const boundary = dockBoundaryRef.current;
    if (!boundary) return;
    const document = boundary.ownerDocument;
    const closePanels = () => {
      setIsXrPanelOpen(false);
      setIsEmotePanelOpen(false);
      setIsAvatarPanelOpen(false);
      setIsZoomExpanded(false);
    };
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    const onPointerDown = (event: PointerEvent) => {
      clearTimeout(dismissTimer);
      pointerInsideDock.current = event.composedPath().includes(boundary);
      // React capture also includes controls rendered in child portals.
      dismissTimer = setTimeout(() => {
        if (!pointerInsideDock.current) closePanels();
        pointerInsideDock.current = false;
      }, 0);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closePanels();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(dismissTimer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isXrPanelOpen, isEmotePanelOpen, isAvatarPanelOpen, isZoomExpanded]);

  if (!shouldRender && !xrAvailable) return null;

  const renderedButtonPos = dragVisualPos ?? buttonPos;
  const emotePanelHeight = Math.min(
    emotes.length > 0
      ? (Math.max(filteredEmotes.length, 1) + 2) * ASSISTANT_CONTROL_ROW_HEIGHT
      : 86,
    ASSISTANT_CONTROL_PANEL_MAX_HEIGHT,
  );
  const avatarPanelHeight = Math.min(
    (models.length + 1) * ASSISTANT_CONTROL_ROW_HEIGHT,
    ASSISTANT_CONTROL_PANEL_MAX_HEIGHT,
  );
  const stageDefinition = selectedStageId?.startsWith("builtin:")
    ? getBuiltInStage(selectedStageId.slice(8))
    : undefined;
  const stageControlCount =
    (stageDefinition?.time ? 2 : 0) +
    2 +
    (selectedStageId && stageDefinition?.seasonalEffects !== false ? 1 : 0) +
    (stageDefinition?.animated ? 1 : 0) +
    (selectedStageId ? 1 : 0) +
    (stageDefinition?.moods ? 1 : 0);
  const stageControlsHeight =
    8 + (selectedStageId ? 39 : 0) + Math.ceil(stageControlCount / 3) * 39 - 4;
  const showUtilityButtons =
    (xr.active || !isChatOpen || isDesktopAttachedModeWindow || isDesktop) &&
    !modelDisabled;
  const canOpenControlPanels = xr.active || !isChatOpen || isDesktop;
  const layout = getAssistantControlLayout({
    viewport,
    insets: xr.active
      ? { top: 0, right: 0, bottom: 0, left: 0 }
      : embedConfig.shell.controlDockInsets,
    buttonPosition: renderedButtonPos,
    emoteHeight: emotePanelHeight,
    avatarHeight: avatarPanelHeight,
    stageHeight: Math.min(
      (stages.length + BUILT_IN_STAGES.length + 1) *
        ASSISTANT_CONTROL_ROW_HEIGHT,
      ASSISTANT_CONTROL_PANEL_MAX_HEIGHT,
    ),
    stageControlsHeight,
    isAndroid,
    isDesktop,
    isNormalDesktop:
      isDesktopAttachedModeWindow || (xr.enabled && !xr.active && !isAndroid),
    showUtilityButtons,
    showStageButton: stagesAvailable && !isARMode,
    showXrButton,
    showCollapseButton: !modelDisabled,
    forcePanelToLeft:
      isChatOpen && isDesktop && !isAndroid && !isDesktopAttachedModeWindow,
  });

  const showEmotePlaybackBar =
    !modelDisabled &&
    uiConfig.emotePlayback?.showDurationBar !== false &&
    isEmotePlaying &&
    emoteDuration > 0 &&
    uiConfig.emotePlayback?.buttonProgress !== "ring";
  const showEmotePlaybackTime = uiConfig.emotePlayback?.showTime !== false;
  const emoteButtonProgressMode =
    uiConfig.emotePlayback?.buttonProgress ?? "none";

  const assistantControlActions = {
    onModelSelect: handleModelSelect,
    onStageSelect: handleStageSelect,
    onPlayEmote: async (emoteId: string) => {
      try {
        if (isAutoPlayActive) {
          emotePlayerService.stopAutoPlay();
          setIsAutoPlayActive(false);
        }
        const connected = getXrClientRuntime();
        if (connected) await connected.action("emote.play", [emoteId]);
        else await emotePlayerService.playEmote(emoteId);
        setIsEmotePanelOpen(false);
      } catch (error) {
        Logger.error("AssistantControlDock", "Failed to play emote:", error);
      }
    },
    onToggleAutoPlay: handleAutoPlayToggle,
    onCategoryChange: (category: string) =>
      updateUIConfig("emotePlayback.autoPlayCategory", category),
    onToggle3D: handle3DToggle,
    onCameraReset: handleCameraReset,
    onCameraLockToggle: handleCameraLockToggle,
    onCameraSaveToggle: handleCameraSaveToggle,
    onStickerBorderToggle: () =>
      updateUIConfig("stickerBorder.enabled", !uiConfig.stickerBorder?.enabled),
    onToggleStagePanel: () => {
      setIsZoomExpanded(false);
      if (isEmotePanelOpen) setIsEmotePanelOpen(false);
      setIsXrPanelOpen(false);
      if (!canOpenControlPanels) return;
      setIsAvatarPanelOpen(!(isAvatarPanelOpen && panelMode === "stage"));
      setPanelMode("stage");
    },
  };

  return (
    <>
      {isAndroid && (
        <Suspense fallback={null}>
          <ARPlacementGuide />
        </Suspense>
      )}

      <XrSurface
        id="tool-dock"
        widthMeters={
          isXrPanelOpen ||
          isEmotePanelOpen ||
          isAvatarPanelOpen ||
          isZoomExpanded
            ? 0.65
            : 0.15
        }
        heightMeters={0.8}
        widthPixels={
          isXrPanelOpen ||
          isEmotePanelOpen ||
          isAvatarPanelOpen ||
          isZoomExpanded
            ? 520
            : 120
        }
        heightPixels={640}
        offsetMeters={[
          isXrPanelOpen ||
          isEmotePanelOpen ||
          isAvatarPanelOpen ||
          isZoomExpanded
            ? -0.5
            : -0.75,
          -0.45,
          0,
        ]}
      >
        <div
          ref={dockBoundaryRef}
          className="contents"
          onPointerDownCapture={() => {
            pointerInsideDock.current = true;
          }}
        >
          <AssistantControlPanels
            layout={layout}
            isAndroid={isAndroid}
            isDesktop={isDesktop}
            isNormalDesktop={isDesktopAttachedModeWindow}
            isLightBackground={isLightBackground}
            isChatOpen={isChatOpen}
            modelDisabled={modelDisabled}
            isEmotePanelOpen={!controlsCollapsed && isEmotePanelOpen}
            isAvatarPanelOpen={!controlsCollapsed && isAvatarPanelOpen}
            panelMode={panelMode as "avatar" | "stage"}
            emotes={emotes}
            filteredEmotes={filteredEmotes}
            models={models}
            stages={stages}
            selectedModelId={selectedModelId}
            selectedStageId={selectedStageId}
            selectedAutoPlayCategory={selectedAutoPlayCategory}
            autoPlayCategoryOptions={autoPlayCategoryOptions}
            isAutoPlayActive={isAutoPlayActive}
            currentPlayingEmoteId={currentPlayingEmoteId}
            emoteProgress={emoteProgress}
            emoteCurrentTime={emoteCurrentTime}
            emoteDuration={emoteDuration}
            showEmotePlaybackTime={showEmotePlaybackTime}
            showEmotePlaybackBar={showEmotePlaybackBar}
            cameraMode={sceneRef.current?.metadata?.getCameraMode?.() ?? "2D"}
            cameraLocked={
              sceneRef.current?.metadata?.isCameraLocked?.() ?? false
            }
            cameraSaveEnabled={
              sceneRef.current?.metadata?.isCameraSaveEnabled?.() ?? false
            }
            stickerBorderEnabled={uiConfig.stickerBorder?.enabled === true}
            actions={assistantControlActions}
            onSeek={handleEmoteSeek}
          />
          {xrPanelMotion.isMounted && (
            <XrControlPanel
              transitionProps={xrPanelMotion.transitionProps}
              position={
                xr.active
                  ? {
                      left: 88,
                      top:
                        48 +
                        (showUtilityButtons
                          ? 4 +
                            Number(stagesAvailable && !isARMode) +
                            Number(isAndroid)
                          : 0) *
                          56,
                    }
                  : layout.xr
              }
              isLightBackground={isLightBackground}
            />
          )}
          <AssistantControlStack
            layout={
              xr.active
                ? {
                    ...layout,
                    button: { left: "16px", top: "48px" },
                    dockScale: 1,
                  }
                : layout
            }
            buttonRef={buttonRef}
            isAndroid={isAndroid}
            isLightBackground={isLightBackground}
            isChatOpen={isChatOpen}
            modelDisabled={modelDisabled}
            isVisible={xrAvailable || isVisible}
            isAppearing={isAppearing}
            isDragging={isDragging}
            isDragOverButton={isDragOverButton}
            showXrButton={showXrButton}
            controlsCollapsed={controlsCollapsed}
            onToggleControls={() => {
              updateUIConfig("assistantControlsCollapsed", !controlsCollapsed);
              setIsXrPanelOpen(false);
              setIsEmotePanelOpen(false);
              setIsAvatarPanelOpen(false);
              setIsZoomExpanded(false);
            }}
            isXrPanelOpen={isXrPanelOpen}
            onToggleXr={() => {
              setIsEmotePanelOpen(false);
              setIsAvatarPanelOpen(false);
              setIsZoomExpanded(false);
              setIsXrPanelOpen((open) => !open);
            }}
            showUtilityButtons={showUtilityButtons}
            isZoomExpanded={!controlsCollapsed && isZoomExpanded}
            isEmotePlaying={isEmotePlaying}
            emoteProgress={emoteProgress}
            emoteButtonProgressMode={emoteButtonProgressMode}
            isAvatarPanelOpen={isAvatarPanelOpen}
            panelMode={panelMode as "avatar" | "stage"}
            isARMode={isARMode}
            isARToggling={isARToggling}
            isZoomOutDisabled={isAtDefaultSize()}
            onReload={xr.active ? () => xr.controller?.recenter() : reloadScene}
            reloadTitle={xr.active ? "Recenter view" : "Reload Avatar"}
            onToggleEmotes={() => {
              setIsXrPanelOpen(false);
              if (!canOpenControlPanels) return;
              setIsZoomExpanded(false);
              if (isAvatarPanelOpen) setIsAvatarPanelOpen(false);
              setIsEmotePanelOpen((open) => !open);
            }}
            onToggleAvatar={() => {
              setIsXrPanelOpen(false);
              if (!canOpenControlPanels) return;
              setIsZoomExpanded(false);
              if (isEmotePanelOpen) setIsEmotePanelOpen(false);
              setIsAvatarPanelOpen(
                !(isAvatarPanelOpen && panelMode === "avatar"),
              );
              setPanelMode("avatar");
            }}
            showStageButton={stagesAvailable && !isARMode}
            onToggleStage={assistantControlActions.onToggleStagePanel}
            onToggleAR={handleARToggle}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomReset={handleZoomReset}
            onZoomExpandedChange={(expanded) => {
              if (expanded) {
                setIsXrPanelOpen(false);
                setIsEmotePanelOpen(false);
                setIsAvatarPanelOpen(false);
              }
              setIsZoomExpanded(expanded);
            }}
            onRotateLeft={handleRotateLeft}
            onRotateRight={handleRotateRight}
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            hasDragged={hasDragged}
            draggable={modelDisabled || allowFloatingDockDrag}
            chatControlsWidth={isTempChat ? 100 : 48}
            chatControls={
              isDesktop && !isDesktopAttachedModeWindow && !xr.active ? (
                <div className="flex items-center gap-1">
                  {isTempChat && (
                    <Button
                      variant="unstyled"
                      className={cn(
                        "h-12 w-12 rounded-full hover:bg-white/10",
                        isLightBackground ? "glass-text" : "glass-text-black",
                      )}
                      onClick={() => {
                        if (isDetachedAvatarWindow)
                          desktopApi?.ipc?.send(
                            "desktop:chat-command",
                            "temporary",
                          );
                        else setIsTempChat(false);
                      }}
                      title="Disable temporary chat"
                      aria-label="Disable temporary chat"
                      aria-pressed="true"
                    >
                      <Icon name="temporary-chat" size={20} />
                    </Button>
                  )}
                  <ComposerMenu
                    isLightBackground={isLightBackground}
                    triggerIcon="chat-controls"
                    triggerLabel="Chat controls"
                    triggerTestId="dock-chat-controls"
                    triggerClassName={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full hover:bg-white/10",
                      isLightBackground ? "glass-text" : "glass-text-black",
                      modelDisabled &&
                        (isDragging ? "cursor-grabbing" : "cursor-grab"),
                    )}
                    side="top"
                    align="end"
                    compact
                    items={[
                      {
                        label: "New chat",
                        icon: "add",
                        onClick: () => {
                          if (isDetachedAvatarWindow) {
                            desktopApi?.ipc?.send(
                              "desktop:chat-command",
                              "new",
                            );
                            return;
                          }
                          void clearChat();
                          setIsHistoryPanelOpen(false);
                          setIsSettingsPanelOpen(false);
                          setIsQuickPanelOpen(false);
                          setIsChatContainerVisible(true);
                          setIsChatInputVisible(true);
                        },
                      },
                      {
                        label: uiConfig.fadeChatMessages
                          ? "Show full chat"
                          : "Fade messages",
                        icon: "chat",
                        onClick: () =>
                          updateUIConfig(
                            "fadeChatMessages",
                            !uiConfig.fadeChatMessages,
                          ),
                      },
                      ...(embedConfig.features.history
                        ? [
                            {
                              label: "Chat history",
                              icon: "history",
                              onClick: () => {
                                if (isDetachedAvatarWindow) {
                                  desktopApi?.ipc?.send(
                                    "desktop:chat-command",
                                    "history",
                                  );
                                  return;
                                }
                                setIsChatContainerVisible(true);
                                setIsChatInputVisible(true);
                                setIsSettingsPanelOpen(false);
                                setIsQuickPanelOpen(false);
                                setIsHistoryPanelOpen(true);
                              },
                            },
                            {
                              label: "Temporary",
                              icon: "temporary-chat",
                              active: isTempChat,
                              onClick: () => {
                                if (isDetachedAvatarWindow)
                                  desktopApi?.ipc?.send(
                                    "desktop:chat-command",
                                    "temporary",
                                  );
                                else setIsTempChat(!isTempChat);
                              },
                            },
                          ]
                        : []),
                      ...(embedConfig.features.liveAssistant3d
                        ? [
                            {
                              label: uiConfig.enableModelLoading
                                ? "Hide character"
                                : "Show character",
                              icon: uiConfig.enableModelLoading
                                ? "eye-off"
                                : "eye",
                              onClick: () =>
                                updateUIConfig(
                                  "enableModelLoading",
                                  !uiConfig.enableModelLoading,
                                ),
                            },
                          ]
                        : []),
                      ...(embedConfig.features.settings
                        ? [
                            {
                              label: "Settings",
                              icon: "settings",
                              onClick: () => {
                                if (isDetachedAvatarWindow) {
                                  desktopApi?.ipc?.send(
                                    "desktop:chat-command",
                                    "settings",
                                  );
                                  return;
                                }
                                setIsChatContainerVisible(true);
                                setIsHistoryPanelOpen(false);
                                setIsQuickPanelOpen(false);
                                setIsSettingsPanelOpen(true);
                              },
                            },
                          ]
                        : []),
                    ]}
                  >
                    <DesktopModeSettings
                      isLightBackground={isLightBackground}
                      menu
                    />
                  </ComposerMenu>
                </div>
              ) : undefined
            }
          />
        </div>
      </XrSurface>
    </>
  );
};

export default AssistantControlDock;
