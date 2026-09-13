/**
 * @fileoverview Floating assistant control dock with positioning logic.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type SetStateAction,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useChatActions } from "../../hooks/app/useChat";
import { useButtonPosition, useDragActions } from "../../hooks/app/useDrag";
import {
  usePositionManagerRef,
  useSceneActions,
  useSceneRef,
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
import { ARPlacementGuide } from "../ar/ARPlacementGuide";
import { isAndroid, isDesktop } from "../../utils/PlatformUtils";
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
  const { reloadScene, recreateScene } = useSceneActions();
  const buttonPos = useButtonPosition();
  const {
    updateButtonPosition: setButtonPos,
    startButtonDrag,
    endButtonDrag,
  } = useDragActions();
  const { setPendingDropData } = useChatActions();
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const desktopAPI = useDesktopApi() as DesktopApiForAssistantControls | null;

  const lastSetPosition = useRef<ButtonPosition>({ x: -100, y: -100 });
  const [isDragOverButton, setIsDragOverButton] = useState(false);
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
  const [isEmotePaused, setIsEmotePaused] = useState(false);
  const [modelAnchorPos, setModelAnchorPos] = useState<PositionPixels | null>(
    null,
  );
  const wasPausedBeforeSeekRef = useRef(false);
  const autoPlaySyncSignatureRef = useRef("");
  const [isAvatarPanelOpen, setIsAvatarPanelOpen] = useState(false);
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
              setSelectedStageId(defaultStage?.id || null);
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
  }, [isAvatarPanelOpen, panelMode]);

  useEffect(() => {
    if (isChatOpen || modelDisabled) {
      setIsEmotePanelOpen(false);
      setIsAvatarPanelOpen(false);
    }
  }, [isChatOpen, modelDisabled]);

  // Track emote playing state
  useEffect(() => {
    const checkPlayingState = setInterval(() => {
      const isPlaying = emotePlayerService.isEmotePlaying();
      setIsEmotePlaying(isPlaying);

      // Update current playing emote ID
      const currentEmoteId = emotePlayerService.getCurrentEmoteId();
      setCurrentPlayingEmoteId(currentEmoteId);

      const currentTime = emotePlayerService.getPlaybackCurrentTime();
      const duration = emotePlayerService.getPlaybackDuration();
      const progress = emotePlayerService.getPlaybackProgress();
      const isPaused = emotePlayerService.isPlaybackPaused();
      setEmoteCurrentTime(currentTime);
      setEmoteDuration(duration);
      setEmoteProgress(progress);
      setIsEmotePaused(isPaused);

      // Update auto-play active state
      const autoPlayActive = emotePlayerService.isAutoPlayActive();
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

        // If preset is 'last-location' and we have saved coordinates
        if (preset === "last-location" && positionConfig.lastLocation) {
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

      setModelAnchorPos(modelPos);

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

    window.addEventListener("modelPositionChange", updateFromModel);
    window.addEventListener("resize", updateFromModel);
    return () => {
      window.removeEventListener("modelPositionChange", updateFromModel);
      window.removeEventListener("resize", updateFromModel);
    };
  }, [modelDisabled, positionManagerRef, setButtonPos, desktopAPI]);

  useEffect(() => {
    if (modelDisabled) {
      setModelAnchorPos(null);
    }
  }, [modelDisabled]);

  const handleClick = useCallback(
    (e?: ReactMouseEvent<HTMLElement>) => {
      if (modelDisabled && hasDragged) {
        e?.preventDefault();
        e?.stopPropagation();
        return;
      }
      if (typeof onClick === "function") onClick(e);
    },
    [modelDisabled, hasDragged, onClick],
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
        emotePlayerService.stopAutoPlay();
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
        await emotePlayerService.startAutoPlay(emoteIds);
        setIsAutoPlayActive(true);
        setIsEmotePanelOpen(false);
        Logger.log("AssistantControlDock", "Auto-play started");
      }
    } catch (err) {
      autoPlaySyncSignatureRef.current = "";
      Logger.error("AssistantControlDock", "Failed to toggle auto-play:", err);
    }
  }, [isAutoPlayActive, emotes, uiConfig.emotePlayback?.autoPlayCategory]);

  const handleEmoteSeek = useCallback(
    (nextProgress: number) => {
      emotePlayerService.seekToProgress(nextProgress);
      setEmoteProgress(nextProgress);
      setEmoteCurrentTime(nextProgress * emoteDuration);
    },
    [emoteDuration],
  );

  const handleEmoteSeekStart = useCallback(() => {
    wasPausedBeforeSeekRef.current = emotePlayerService.isPlaybackPaused();
    if (!wasPausedBeforeSeekRef.current) {
      emotePlayerService.pausePlayback();
    }
  }, []);

  const handleEmoteSeekEnd = useCallback(() => {
    if (!wasPausedBeforeSeekRef.current) {
      emotePlayerService.resumePlayback();
    }
    wasPausedBeforeSeekRef.current = false;
  }, []);

  const handleEmotePauseToggle = useCallback(() => {
    emotePlayerService.togglePlayback();
  }, []);

  const handleModelSelect = useCallback(
    async (modelId: string | null) => {
      try {
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
    [reloadScene],
  );

  const handleStageSelect = useCallback(
    async (stageId: string | null) => {
      try {
        if (stageId === null) {
          await stageStorageService.clearAllDefaults();
        } else {
          await stageStorageService.setDefaultStage(stageId);
        }
        setSelectedStageId(stageId);
        setIsAvatarPanelOpen(false);
        Logger.log(
          "AssistantControlDock",
          `Stage ${stageId || "none"} selected, reloading scene...`,
        );
        reloadScene();
      } catch (err) {
        Logger.error("AssistantControlDock", "Failed to select stage:", err);
      }
    },
    [reloadScene],
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
    emotePlayerService.startAutoPlay(autoPlayEmoteIds).catch((err) => {
      autoPlaySyncSignatureRef.current = "";
      Logger.error(
        "AssistantControlDock",
        "Failed to resync auto-play queue after category change:",
        err,
      );
    });
  }, [isAutoPlayActive, autoPlayEmoteIds]);

  if (!shouldRender) return null;

  const renderedButtonPos = dragVisualPos ?? buttonPos;
  const emotePanelHeight = Math.min(
    emotes.length > 0
      ? (Math.max(filteredEmotes.length, 1) + 2) * ASSISTANT_CONTROL_ROW_HEIGHT
      : 86,
    ASSISTANT_CONTROL_PANEL_MAX_HEIGHT,
  );
  const maxListLength = Math.max(models.length, stages.length);
  const avatarPanelHeight = Math.min(
    (maxListLength + 1) * ASSISTANT_CONTROL_ROW_HEIGHT,
    ASSISTANT_CONTROL_PANEL_MAX_HEIGHT,
  );
  const avatarListHeight = Math.min(
    (models.length + 1) * ASSISTANT_CONTROL_ROW_HEIGHT,
    ASSISTANT_CONTROL_PANEL_MAX_HEIGHT,
  );
  const showUtilityButtons = !isChatOpen && !modelDisabled;
  const layout = getAssistantControlLayout({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    buttonPosition: renderedButtonPos,
    emoteHeight: emotePanelHeight,
    avatarHeight: avatarPanelHeight,
    avatarListHeight,
    isAndroid,
    isDesktop,
    showUtilityButtons,
  });

  const showEmotePlaybackBar =
    !modelDisabled &&
    uiConfig.emotePlayback?.showDurationBar !== false &&
    isEmotePlaying &&
    emoteDuration > 0;
  const showEmotePlaybackTime = uiConfig.emotePlayback?.showTime !== false;

  const assistantControlActions = {
    onModelSelect: handleModelSelect,
    onStageSelect: handleStageSelect,
    onPlayEmote: async (emoteId: string) => {
      try {
        if (isAutoPlayActive) {
          emotePlayerService.stopAutoPlay();
          setIsAutoPlayActive(false);
        }
        await emotePlayerService.playEmote(emoteId);
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
    onToggleStagePanel: () => {
      if (isEmotePanelOpen) setIsEmotePanelOpen(false);
      if (isAvatarPanelOpen && panelMode === "stage") {
        setPanelMode("avatar");
      } else if (isAvatarPanelOpen && panelMode === "avatar") {
        setPanelMode("stage");
      } else {
        setPanelMode("stage");
        setIsAvatarPanelOpen(true);
      }
    },
  };

  return (
    <>
      {isAndroid && <ARPlacementGuide />}

      <AssistantControlPanels
        layout={layout}
        isAndroid={isAndroid}
        isDesktop={isDesktop}
        isLightBackground={isLightBackground}
        isChatOpen={isChatOpen}
        modelDisabled={modelDisabled}
        isEmotePanelOpen={isEmotePanelOpen}
        isAvatarPanelOpen={isAvatarPanelOpen}
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
        isEmotePlaying={isEmotePlaying}
        emoteProgress={emoteProgress}
        emoteCurrentTime={emoteCurrentTime}
        emoteDuration={emoteDuration}
        isEmotePaused={isEmotePaused}
        showEmotePlaybackBar={showEmotePlaybackBar}
        showEmotePlaybackTime={showEmotePlaybackTime}
        modelAnchorPos={modelAnchorPos}
        cameraMode={sceneRef.current?.metadata?.getCameraMode?.() ?? "2D"}
        cameraLocked={sceneRef.current?.metadata?.isCameraLocked?.() ?? false}
        cameraSaveEnabled={
          sceneRef.current?.metadata?.isCameraSaveEnabled?.() ?? false
        }
        actions={assistantControlActions}
        onSeek={handleEmoteSeek}
        onTogglePause={handleEmotePauseToggle}
        onSeekStart={handleEmoteSeekStart}
        onSeekEnd={handleEmoteSeekEnd}
      />

      <AssistantControlStack
        layout={layout}
        buttonRef={buttonRef}
        isAndroid={isAndroid}
        isLightBackground={isLightBackground}
        isChatOpen={isChatOpen}
        modelDisabled={modelDisabled}
        isVisible={isVisible}
        isAppearing={isAppearing}
        isDragging={isDragging}
        isDragOverButton={isDragOverButton}
        showUtilityButtons={showUtilityButtons}
        isEmotePlaying={isEmotePlaying}
        isAvatarPanelOpen={isAvatarPanelOpen}
        panelMode={panelMode as "avatar" | "stage"}
        isARMode={isARMode}
        isARToggling={isARToggling}
        isZoomOutDisabled={isAtDefaultSize()}
        onReload={reloadScene}
        onToggleEmotes={() => {
          if (isAvatarPanelOpen) setIsAvatarPanelOpen(false);
          setIsEmotePanelOpen((open) => !open);
        }}
        onToggleAvatar={() => {
          if (isEmotePanelOpen) setIsEmotePanelOpen(false);
          setIsAvatarPanelOpen((open) => !open);
        }}
        onToggleAR={handleARToggle}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        onRotateLeft={handleRotateLeft}
        onRotateRight={handleRotateRight}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
      />
    </>
  );
};

export default AssistantControlDock;
