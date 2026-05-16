/**
 * @fileoverview Draggable chat button component with positioning logic.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useChatActions } from "../../hooks/app/useChat";
import { useButtonPosition, useDragActions } from "../../hooks/app/useDrag";
import { usePositionManagerRef, useSceneRef } from "../../hooks/app/useScene";
import {
  useConfigUIActions,
  useUIConfig,
} from "../../hooks/config/useConfigUI";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { Icon } from "../icons";
import { Button, Card } from "../ui";
import { cn } from "../../utils/cn";
import Logger from "../../services/LoggerService";
import emoteStorageService from "../../services/EmoteStorageService";
import emotePlayerService from "../../services/EmotePlayerService";
import EmotePlaybackBar from "./EmotePlaybackBar";
import { modelStorageService } from "../../services/ModelStorageService";
import { stageStorageService } from "../../services/StageStorageService";
import ZoomControl from "../common/ZoomControl";
import { isAndroid, isDesktop } from "../../utils/PlatformUtils";
import {
  PositionPresets,
  AndroidPresetOverride,
  DesktopPresetOverride,
} from "../../config/uiConfig";
import type {
  PositionManagerLike,
  PositionPixels,
  PositionPresetLike,
  SceneWithMetadata,
} from "../../babylon/types";

interface ButtonPosition {
  x: number;
  y: number;
}

interface ChatButtonProps {
  onClick?: (event?: ReactMouseEvent<HTMLElement>) => void;
  isVisible?: boolean;
  modelDisabled?: boolean;
  isChatOpen?: boolean;
  chatInputRef?: RefObject<HTMLElement | null>;
}

interface EmoteListItem {
  id: string;
  name: string;
  categories?: string[];
  isVisible: boolean;
  metadata: unknown;
}

interface StoredModelItem {
  id: string;
  name: string;
  isDefault: boolean;
  metadata: unknown;
}

interface StoredStageItem {
  id: string;
  name: string;
  isDefault: boolean;
  metadata: unknown;
}

interface PositionManagerForButton extends PositionManagerLike {
  applyPreset: (
    preset: string,
    options?: { modelSizePx?: { width: number; height: number } },
  ) => void;
}

interface SceneMetadataCameraControls {
  toggleCameraMode?: () => void;
  getCameraMode?: () => "2D" | "3D";
  toggleCameraLock?: () => void;
  isCameraLocked?: () => boolean;
  resetCameraPosition?: () => void;
  toggleCameraSave?: () => void;
  isCameraSaveEnabled?: () => boolean;
}

type SceneWithCameraControls = SceneWithMetadata & {
  metadata?: SceneWithMetadata["metadata"] & SceneMetadataCameraControls;
};

interface DesktopApiForChatButton {
  window?: {
    getSize?: () => Promise<{ width: number; height: number }>;
    updateWindowSizeForZoom?: (width: number, height: number) => Promise<void>;
  };
}

interface DragDropServiceLike {
  attach: (
    element: HTMLElement,
    callbacks: {
      onSetDragOver?: (flag: boolean) => void;
      onShowError?: (error: unknown) => void;
      checkVoiceMode?: (() => boolean) | null;
      getCurrentCounts?: () => { images: number; audios: number };
      onProcessData?: (data: unknown) => void;
    },
  ) => void;
  detach: () => void;
}

type DragDropServiceCtor = new (options: {
  maxImages: number;
  maxAudios: number;
}) => DragDropServiceLike;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

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
 * Draggable chat button component with automatic positioning.
 *
 * @param {Object} props
 * @param {Function} props.onClick - Click handler
 * @param {boolean} props.isVisible - Visibility state
 * @param {boolean} props.modelDisabled - Whether 3D model is disabled
 * @param {boolean} props.isChatOpen - Whether chat is open
 * @param {Object} props.chatInputRef - Reference to chat input
 * @returns {JSX.Element|null}
 */
const ChatButton = ({
  onClick,
  isVisible = true,
  modelDisabled = false,
  isChatOpen = false,
  chatInputRef,
}: ChatButtonProps) => {
  const positionManagerRef = usePositionManagerRef();
  const sceneRef = useSceneRef();
  const buttonPos = useButtonPosition();
  const {
    updateButtonPosition: setButtonPos,
    startButtonDrag,
    endButtonDrag,
  } = useDragActions();
  const { setPendingDropData } = useChatActions();
  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const desktopAPI = useDesktopApi() as DesktopApiForChatButton | null;

  const [isDragging, setIsDragging] = useState(false);
  const [dragVisualPos, setDragVisualPos] = useState<ButtonPosition | null>(
    null,
  );
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartPos = useRef<ButtonPosition>({ x: 0, y: 0 });
  const dragStartButtonPos = useRef<ButtonPosition>({ x: 0, y: 0 });
  const buttonPosRef = useRef<ButtonPosition>({ x: -100, y: -100 });
  const dragVisualPosRef = useRef<ButtonPosition | null>(null);
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
  const dragDropServiceRef = useRef<DragDropServiceLike | null>(null);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const buttonDragAnimationFrameRef = useRef<number | null>(null);

  // Delayed render state for fade animation
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [isAppearing, setIsAppearing] = useState(false);

  // Background detection state
  const [isLightBackground, setIsLightBackground] = useState(false);

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
          Logger.error("ChatButton", "Failed to load emotes:", err);
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
              Logger.error("ChatButton", "Failed to get default model:", err);
            });
        })
        .catch((err) => {
          Logger.error("ChatButton", "Failed to load models:", err);
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
              Logger.error("ChatButton", "Failed to get default stage:", err);
            });
        })
        .catch((err) => {
          Logger.error("ChatButton", "Failed to load stages:", err);
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
   * Detect background color under the button
   */
  useEffect(() => {
    if (!shouldRender || isDragging) return;

    let detectionTimeout: ReturnType<typeof setTimeout> | null = null;
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

    const detectBackgroundColor = () => {
      if (!buttonRef.current) {
        Logger.log("ChatButton", "detectBackgroundColor: no button ref");
        return;
      }

      const mode = uiConfig?.backgroundDetection?.mode || "adaptive";

      if (mode !== "adaptive") {
        if (mode === "light") {
          setIsLightBackground(true);
        } else if (mode === "dark") {
          setIsLightBackground(false);
        }
        return;
      }

      const buttonRect = buttonRef.current.getBoundingClientRect();
      const x = buttonRect.left + buttonRect.width / 2;
      const y = buttonRect.top + buttonRect.height / 2;

      Logger.log("ChatButton", "Detecting background at:", { x, y });

      // Create a temporary invisible sampling element
      const sampler = document.createElement("div");
      sampler.style.position = "fixed";
      sampler.style.left = `${x}px`;
      sampler.style.top = `${y}px`;
      sampler.style.width = "1px";
      sampler.style.height = "1px";
      sampler.style.pointerEvents = "none";
      sampler.style.zIndex = "-1";
      sampler.style.opacity = "0";
      document.body.appendChild(sampler);

      // Use the button's position to find what's underneath
      // We'll lower the button's z-index temporarily
      const originalZIndex = buttonRef.current.style.zIndex;
      buttonRef.current.style.zIndex = "-2";

      // Get element under the sampler position
      const elementBelow = document.elementFromPoint(x, y);

      // Restore button z-index
      buttonRef.current.style.zIndex = originalZIndex;

      // Remove sampler
      document.body.removeChild(sampler);

      if (!elementBelow) {
        Logger.log("ChatButton", "No element found below button");
        return;
      }

      Logger.log(
        "ChatButton",
        "Element below:",
        elementBelow.tagName,
        elementBelow.className,
      );

      // Get computed background color
      const computedStyle = window.getComputedStyle(elementBelow);
      let bgColor = computedStyle.backgroundColor;

      Logger.log("ChatButton", "Initial bgColor:", bgColor);

      // If transparent, check parent elements
      let currentElement: HTMLElement | null =
        elementBelow instanceof HTMLElement ? elementBelow : null;
      let depth = 0;
      while (
        (bgColor === "rgba(0, 0, 0, 0)" || bgColor === "transparent") &&
        depth < 10
      ) {
        if (!currentElement) {
          break;
        }
        currentElement = currentElement.parentElement;
        if (!currentElement) {
          // Check HTML element and document
          const htmlBg = window.getComputedStyle(
            document.documentElement,
          ).backgroundColor;
          Logger.log("ChatButton", "Checking HTML element:", htmlBg);
          if (
            htmlBg &&
            htmlBg !== "rgba(0, 0, 0, 0)" &&
            htmlBg !== "transparent"
          ) {
            bgColor = htmlBg;
            break;
          }
          // Default to white if everything is transparent
          bgColor = "rgb(255, 255, 255)";
          Logger.log(
            "ChatButton",
            "Everything transparent, defaulting to white",
          );
          break;
        }
        bgColor = window.getComputedStyle(currentElement).backgroundColor;
        Logger.log(
          "ChatButton",
          "Checking parent:",
          currentElement.tagName,
          bgColor,
        );
        depth++;
      }

      // Special handling for canvas elements - sample pixel color
      if (elementBelow instanceof HTMLCanvasElement) {
        try {
          const canvas = elementBelow;
          const rect = canvas.getBoundingClientRect();
          const canvasX = x - rect.left;
          const canvasY = y - rect.top;

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            const imageData = ctx.getImageData(canvasX, canvasY, 1, 1);
            const [r = 0, g = 0, b = 0, a = 0] = imageData.data;

            // Only use canvas pixel if it's not fully transparent
            if (a > 0) {
              bgColor = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
              Logger.log("ChatButton", "Sampled canvas pixel:", bgColor);
            }
          }
        } catch (err: unknown) {
          Logger.log(
            "ChatButton",
            "Canvas sampling failed (CORS or context):",
            getErrorMessage(err),
          );
        }
      }

      // Parse RGB values
      const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbMatch) {
        const r = Number(rgbMatch[1] ?? 0);
        const g = Number(rgbMatch[2] ?? 0);
        const b = Number(rgbMatch[3] ?? 0);

        // Calculate perceived brightness (0-255)
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;

        Logger.log("ChatButton", "RGB:", { r, g, b, brightness });

        // If brightness > 128, it's a light background
        const isLight = brightness > 128;
        Logger.log("ChatButton", "Background is:", isLight ? "LIGHT" : "DARK");
        setIsLightBackground(isLight);
      } else {
        Logger.log("ChatButton", "Failed to parse color:", bgColor);
      }
    };

    // Debounced detection - waits until dragging stops
    detectionTimeout = setTimeout(() => {
      detectBackgroundColor();
    }, 500);

    // Re-detect on scroll or position change (debounced)
    const handleUpdate = () => {
      if (isDragging) return;
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      scrollTimeout = setTimeout(() => {
        detectBackgroundColor();
      }, 500);
    };

    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("modelPositionChange", handleUpdate);

    return () => {
      clearTimeout(detectionTimeout);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("modelPositionChange", handleUpdate);
    };
  }, [
    shouldRender,
    buttonPos.x,
    buttonPos.y,
    isDragging,
    uiConfig?.backgroundDetection?.mode,
  ]);

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

  /**
   * Convert preset name to button pixel position
   */
  const getButtonPositionFromPreset = useCallback(
    (preset: string): ButtonPosition => {
      const buttonSize = 48;
      const padding = 20;
      const width = window.innerWidth;
      const height = window.innerHeight;

      switch (preset) {
        case "bottom-right":
          return {
            x: width - buttonSize - padding,
            y: height - buttonSize - padding,
          };
        case "bottom-left":
          return { x: padding, y: height - buttonSize - padding };
        case "bottom-center":
          return {
            x: (width - buttonSize) / 2,
            y: height - buttonSize - padding,
          };
        case "top-right":
          return { x: width - buttonSize - padding, y: padding };
        case "top-left":
          return { x: padding, y: padding };
        case "top-center":
          return { x: (width - buttonSize) / 2, y: padding };
        case "center":
          return { x: (width - buttonSize) / 2, y: (height - buttonSize) / 2 };
        default:
          return {
            x: width - buttonSize - padding,
            y: height - buttonSize - padding,
          };
      }
    },
    [],
  );

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
          Logger.log("ChatButton", "Loading from last location:", targetPos);
        } else if (preset !== "last-location") {
          // Use preset position (convert to button position)
          targetPos = getButtonPositionFromPreset(preset);
          Logger.log("ChatButton", "Loading from preset:", preset, targetPos);
        }

        // Bound check
        const buttonSize = 48;
        const boundedX = Math.max(
          10,
          Math.min(targetPos.x, window.innerWidth - buttonSize - 10),
        );
        const boundedY = Math.max(
          10,
          Math.min(targetPos.y, window.innerHeight - buttonSize - 10),
        );
        const validPos = { x: boundedX, y: boundedY };

        setButtonPos(validPos);
        buttonPosRef.current = validPos;
      } catch (err) {
        Logger.error("ChatButton", "load position failed", err);
        setButtonPos(defaultPos);
        buttonPosRef.current = defaultPos;
      }
    };
    load();
  }, [
    modelDisabled,
    setButtonPos,
    uiConfig.position,
    getButtonPositionFromPreset,
  ]);

  useEffect(() => {
    buttonPosRef.current = buttonPos;
  }, [buttonPos]);

  useEffect(() => {
    if (
      !isDragging &&
      dragVisualPos &&
      dragVisualPos.x === buttonPos.x &&
      dragVisualPos.y === buttonPos.y
    ) {
      setDragVisualPos(null);
      dragVisualPosRef.current = null;
    }
  }, [isDragging, dragVisualPos, buttonPos.x, buttonPos.y]);

  const flushDragVisualPosition = useCallback(() => {
    buttonDragAnimationFrameRef.current = null;

    const latestPos = dragVisualPosRef.current;
    if (!latestPos) {
      return;
    }

    setDragVisualPos(latestPos);

    if (isChatOpen) {
      const event = new CustomEvent("chatButtonMoved", { detail: latestPos });
      window.dispatchEvent(event);
    }
  }, [isChatOpen]);

  const scheduleDragVisualUpdate = useCallback(() => {
    if (buttonDragAnimationFrameRef.current !== null) {
      return;
    }

    buttonDragAnimationFrameRef.current = requestAnimationFrame(() => {
      flushDragVisualPosition();
    });
  }, [flushDragVisualPosition]);

  // Adjust button position when chat opens (if in chat-only mode)
  useEffect(() => {
    if (!modelDisabled || !isChatOpen) return;

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
  }, [modelDisabled, isChatOpen, uiConfig.position?.preset, updateUIConfig]); // chatInputRef is stable, don't include in dependencies

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
          Logger.error("ChatButton", "getPositionPixels failed", err);
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
                  "ChatButton",
                  `Button X clipped, repositioned to: ${buttonX} (window width: ${electronWindowWidth})`,
                );
              }

              // If button's bottom edge exceeds Electron window height, reposition
              if (buttonY + buttonSize > electronWindowHeight - padding) {
                buttonY = electronWindowHeight - buttonSize - padding;
                Logger.log(
                  "ChatButton",
                  `Button Y clipped, repositioned to: ${buttonY} (window height: ${electronWindowHeight})`,
                );
              }

              // If button's top edge is above window, reposition
              if (buttonY < padding) {
                buttonY = padding;
                Logger.log(
                  "ChatButton",
                  `Button Y above window, repositioned to: ${buttonY}`,
                );
              }
            } catch (err) {
              Logger.error(
                "ChatButton",
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
        Logger.error("ChatButton", "updateFromModel failed", err);
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

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      if (!modelDisabled) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      setHasDragged(false);
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      dragStartButtonPos.current = { ...buttonPos };

      // Emit drag start event for ChatContainer border
      const event = new CustomEvent("chatButtonDragStart");
      window.dispatchEvent(event);

      startButtonDrag();
    },
    [modelDisabled, buttonPos, startButtonDrag],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!modelDisabled || !isDragging) return;

      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) setHasDragged(true);

      const newX = dragStartButtonPos.current.x + deltaX;
      const newY = dragStartButtonPos.current.y + deltaY;
      const buttonSize = 48;
      const chatInputHeight = isChatOpen ? 110 : 0;
      const minDistanceFromBottom = chatInputHeight + 15;
      const boundedX = Math.max(
        10,
        Math.min(newX, window.innerWidth - buttonSize - 10),
      );
      let boundedY = Math.max(
        10,
        Math.min(newY, window.innerHeight - buttonSize - 10),
      );
      if (isChatOpen && boundedY > window.innerHeight - minDistanceFromBottom) {
        boundedY = window.innerHeight - minDistanceFromBottom;
      }

      const newPos = { x: boundedX, y: boundedY };
      buttonPosRef.current = newPos;

      dragVisualPosRef.current = newPos;
      scheduleDragVisualUpdate();
    },
    [modelDisabled, isDragging, isChatOpen, scheduleDragVisualUpdate],
  );

  const handleMouseUp = useCallback(() => {
    if (!modelDisabled || !isDragging) return;

    if (buttonDragAnimationFrameRef.current !== null) {
      cancelAnimationFrame(buttonDragAnimationFrameRef.current);
      buttonDragAnimationFrameRef.current = null;
    }

    setIsDragging(false);

    const finalPos = dragVisualPosRef.current ?? buttonPosRef.current;
    setDragVisualPos(finalPos);

    // Update React state to match DOM
    setButtonPos(finalPos);

    // Save position if preset is 'last-location
    if (uiConfig.position?.preset === "last-location") {
      setTimeout(() => {
        Logger.log("ChatButton", "Saving last location:", finalPos);
        updateUIConfig("position.lastLocation", {
          x: finalPos.x,
          y: finalPos.y,
          width: 48,
          height: 48,
        });
      }, 100);
    }

    // Final position update for ChatContainer
    const event = new CustomEvent("chatButtonMoved", { detail: finalPos });
    window.dispatchEvent(event);

    endButtonDrag();
  }, [
    modelDisabled,
    isDragging,
    setButtonPos,
    endButtonDrag,
    uiConfig.position?.preset,
    updateUIConfig,
  ]);

  useEffect(() => {
    return () => {
      if (buttonDragAnimationFrameRef.current !== null) {
        cancelAnimationFrame(buttonDragAnimationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!modelDisabled) return;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [modelDisabled, handleMouseMove, handleMouseUp]);

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
      Logger.log("ChatButton", "Skipping drag-drop setup - not rendered");
      return;
    }

    Logger.log("ChatButton", "Drag-drop setup effect running", {
      hasButton: !!buttonRef.current,
      shouldRender,
    });

    let attached = true;

    // Wait a short moment for the element to be in DOM
    const setupTimeout = setTimeout(() => {
      if (!attached) {
        Logger.log("ChatButton", "Cleanup called before setup completed");
        return;
      }

      if (!buttonRef.current) {
        Logger.log("ChatButton", "Button ref not available");
        return;
      }

      Logger.log("ChatButton", "Setting up drag-drop service");

      import("../../services/DragDropService")
        .then(({ default: DragDropService }) => {
          const DragDropServiceClass =
            DragDropService as unknown as DragDropServiceCtor;
          if (!attached) {
            Logger.log("ChatButton", "Cleanup called during async import");
            return;
          }
          const el = buttonRef.current;
          if (!el) {
            Logger.log("ChatButton", "Button ref lost during async import");
            return;
          }

          dragDropServiceRef.current = new DragDropServiceClass({
            maxImages: 3,
            maxAudios: 1,
          });
          dragDropServiceRef.current.attach(el, {
            onSetDragOver: (flag) => setIsDragOverButton(flag),
            onShowError: (err) =>
              Logger.error("ChatButton", "DragDrop error", err),
            checkVoiceMode: null,
            getCurrentCounts: () => ({ images: 0, audios: 0 }),
            onProcessData: (data) => {
              if (!isChatOpen) handleClick();
              setPendingDropData(data as never);
            },
          });
        })
        .catch((err) =>
          Logger.error("ChatButton", "load DragDropService failed", err),
        );
    }, 50); // Short delay for DOM to be ready

    return () => {
      attached = false;
      clearTimeout(setupTimeout);
      Logger.log("ChatButton", "Cleaning up drag-drop service");
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
            "ChatButton",
            `Zooming in: ${currentSize}px → ${newSize}px`,
          );
          break;
        case "out":
          if (currentSize <= defaultHeight) {
            Logger.log(
              "ChatButton",
              "Already at default size, cannot zoom out",
            );
            return;
          }
          newSize = Math.max(defaultHeight, currentSize - zoomAmount);
          newWidth = Math.max(defaultWidth, newSize * 0.6);
          Logger.log(
            "ChatButton",
            `Zooming out: ${currentSize}px → ${newSize}px`,
          );
          break;
        case "reset":
          newSize = defaultHeight;
          newWidth = defaultWidth;
          Logger.log("ChatButton", "Resetting zoom to default");
          break;
        default:
          Logger.warn("ChatButton", `Unknown zoom type: ${zoomType}`);
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
          "ChatButton",
          `Requesting Electron window resize for model size: ${newWidth}x${newSize}`,
        );
        updateWindowSizeForZoom(newWidth, newSize)
          .then(() => {
            return getWindowSize();
          })
          .then((windowSize) => {
            Logger.log(
              "ChatButton",
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
                Logger.log("ChatButton", "Resetting to preset position");
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
              "ChatButton",
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
    [positionManagerRef, updateUIConfig, desktopAPI, uiConfig.position],
  );

  const isAtDefaultSize = useCallback(() => {
    const positionManager = positionManagerRef.current;
    if (!positionManager) return true;

    if (!uiConfig.modelSizePx) return true;

    const currentPreset = uiConfig.position?.preset || "bottom-right";
    const presetConfig = getPlatformPresetDefaults(currentPreset);
    const defaultHeight = presetConfig?.modelSize?.height || 500;

    const currentSize = positionManager.modelHeightPx || defaultHeight;
    return currentSize <= defaultHeight;
  }, [positionManagerRef, uiConfig.modelSizePx, uiConfig.position]);

  const handleZoomIn = useCallback(() => handleZoom("in"), [handleZoom]);
  const handleZoomOut = useCallback(() => handleZoom("out"), [handleZoom]);
  const handleZoomReset = useCallback(() => handleZoom("reset"), [handleZoom]);

  const handleAutoPlayToggle = useCallback(async () => {
    try {
      if (isAutoPlayActive) {
        emotePlayerService.stopAutoPlay();
        setIsAutoPlayActive(false);
        autoPlaySyncSignatureRef.current = "";
        Logger.log("ChatButton", "Auto-play stopped");
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
            "ChatButton",
            `No emotes found for auto-play category: ${autoPlayCategory}`,
          );
          return;
        }

        autoPlaySyncSignatureRef.current = emoteIds.join("|");
        await emotePlayerService.startAutoPlay(emoteIds);
        setIsAutoPlayActive(true);
        setIsEmotePanelOpen(false);
        Logger.log("ChatButton", "Auto-play started");
      }
    } catch (err) {
      autoPlaySyncSignatureRef.current = "";
      Logger.error("ChatButton", "Failed to toggle auto-play:", err);
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

  const handleModelSelect = useCallback(async (modelId: string | null) => {
    try {
      if (modelId === null) {
        await modelStorageService.clearAllDefaults();
      } else {
        await modelStorageService.setDefaultModel(modelId);
      }
      setSelectedModelId(modelId);
      setIsAvatarPanelOpen(false);
      Logger.log(
        "ChatButton",
        `Model ${modelId || "default"} selected, reloading page...`,
      );
      window.location.reload();
    } catch (err) {
      Logger.error("ChatButton", "Failed to select model:", err);
    }
  }, []);

  const handleStageSelect = useCallback(async (stageId: string | null) => {
    try {
      if (stageId === null) {
        await stageStorageService.clearAllDefaults();
      } else {
        await stageStorageService.setDefaultStage(stageId);
      }
      setSelectedStageId(stageId);
      setIsAvatarPanelOpen(false);
      Logger.log(
        "ChatButton",
        `Stage ${stageId || "none"} selected, reloading page...`,
      );
      window.location.reload();
    } catch (err) {
      Logger.error("ChatButton", "Failed to select stage:", err);
    }
  }, []);

  const [_forceUpdate, setForceUpdate] = useState(0);

  const handle3DToggle = useCallback(() => {
    if (!sceneRef?.current) {
      Logger.warn("ChatButton", "Scene not available yet");
      return;
    }

    const scene = sceneRef.current;
    if (!scene.metadata?.toggleCameraMode) {
      Logger.error("ChatButton", "Camera toggle function not available");
      return;
    }

    scene.metadata.toggleCameraMode();
    setForceUpdate((prev) => prev + 1);
  }, [sceneRef]);

  const handleCameraLockToggle = useCallback(() => {
    if (!sceneRef?.current) {
      Logger.warn("ChatButton", "Scene not available yet");
      return;
    }

    const scene = sceneRef.current;
    if (!scene.metadata?.toggleCameraLock) {
      Logger.error("ChatButton", "Camera lock toggle function not available");
      return;
    }

    scene.metadata.toggleCameraLock();
    setForceUpdate((prev) => prev + 1);
  }, [sceneRef]);

  const handleCameraReset = useCallback(() => {
    if (!sceneRef?.current) {
      Logger.warn("ChatButton", "Scene not available yet");
      return;
    }

    const scene = sceneRef.current;
    if (!scene.metadata?.resetCameraPosition) {
      Logger.error("ChatButton", "Camera reset function not available");
      return;
    }

    scene.metadata.resetCameraPosition();
    setForceUpdate((prev) => prev + 1);
  }, [sceneRef]);

  const handleCameraSaveToggle = useCallback(() => {
    if (!sceneRef?.current) {
      Logger.warn("ChatButton", "Scene not available yet");
      return;
    }

    const scene = sceneRef.current;
    if (!scene.metadata?.toggleCameraSave) {
      Logger.error("ChatButton", "Camera save toggle function not available");
      return;
    }

    scene.metadata.toggleCameraSave();
    setForceUpdate((prev) => prev + 1);
  }, [sceneRef]);

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
        "ChatButton",
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
        "ChatButton",
        "Failed to resync auto-play queue after category change:",
        err,
      );
    });
  }, [isAutoPlayActive, autoPlayEmoteIds]);

  if (!shouldRender) return null;

  const TOTAL_BUTTON_OFFSET = 224;

  const emotePanelWidth = 125;
  const emotePanelHeight = Math.min(
    emotes.length > 0 ? (Math.max(filteredEmotes.length, 1) + 2) * 43 : 86,
    300,
  );
  const emotePanelGap = 8;
  const buttonWidth = 48;

  const avatarPanelWidth = 125;
  const maxListLength = Math.max(models.length, stages.length);
  const avatarPanelHeight = Math.min((maxListLength + 1) * 43, 300);
  const avatarPanelGap = 8;
  const renderedButtonPos = dragVisualPos ?? buttonPos;
  const isLeftSide = renderedButtonPos.x < window.innerWidth / 2;

  const cameraControlsHeight = 35 * 2 + 4;
  const cameraControlsGap = 8;
  const cameraControlsOffset = cameraControlsHeight + cameraControlsGap;

  let emotePanelLeft, emotePanelTop;
  let avatarPanelLeft, avatarPanelTop;

  if (isAndroid) {
    const androidButtonX = 20;
    const androidButtonY = window.innerHeight - 20 - buttonWidth;
    const androidButtonOffset = TOTAL_BUTTON_OFFSET;

    emotePanelLeft = androidButtonX;
    emotePanelTop =
      androidButtonY - androidButtonOffset - emotePanelHeight - emotePanelGap;

    avatarPanelLeft = androidButtonX;
    avatarPanelTop =
      androidButtonY -
      androidButtonOffset -
      avatarPanelHeight -
      avatarPanelGap -
      cameraControlsOffset;
  } else {
    if (isDesktop) {
      emotePanelLeft = renderedButtonPos.x - emotePanelWidth - emotePanelGap;
      avatarPanelLeft = renderedButtonPos.x - avatarPanelWidth - avatarPanelGap;
    } else {
      if (isLeftSide) {
        emotePanelLeft = renderedButtonPos.x;
        avatarPanelLeft = renderedButtonPos.x;
      } else {
        emotePanelLeft = renderedButtonPos.x - emotePanelWidth - emotePanelGap;
        avatarPanelLeft =
          renderedButtonPos.x - avatarPanelWidth - avatarPanelGap;
      }
    }

    emotePanelTop =
      renderedButtonPos.y -
      TOTAL_BUTTON_OFFSET -
      emotePanelHeight -
      emotePanelGap;
    avatarPanelTop =
      renderedButtonPos.y -
      TOTAL_BUTTON_OFFSET -
      avatarPanelHeight -
      avatarPanelGap -
      cameraControlsOffset;
  }

  const showUtilityButtons = !isChatOpen && !modelDisabled;
  const visualButtonOffset = showUtilityButtons ? TOTAL_BUTTON_OFFSET : 0;
  const showEmotePlaybackBar =
    !modelDisabled &&
    uiConfig.emotePlayback?.showDurationBar !== false &&
    isEmotePlaying &&
    emoteDuration > 0;
  const showEmotePlaybackTime = uiConfig.emotePlayback?.showTime !== false;

  const androidPosition = isAndroid
    ? {
        left: "20px",
        bottom: "20px",
        top: "auto",
      }
    : {
        left: `${renderedButtonPos.x}px`,
        top: `${renderedButtonPos.y - visualButtonOffset}px`,
      };

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
        onSeek={handleEmoteSeek}
        onTogglePause={handleEmotePauseToggle}
        onSeekStart={handleEmoteSeekStart}
        onSeekEnd={handleEmoteSeekEnd}
      />

      {/* Emote List */}
      {isEmotePanelOpen && !isChatOpen && !modelDisabled && (
        <Card
          padding="none"
          style={{
            left: `${emotePanelLeft}px`,
            top: `${emotePanelTop}px`,
            zIndex: isAndroid ? 201 : 10001,
            ...(isDesktop && emotes.length > 7
              ? {
                  maskImage:
                    "linear-gradient(to bottom, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)",
                }
              : {}),
          }}
          variant="none"
          className="fixed w-[135px] max-h-[300px] overflow-y-auto px-1 snap-y snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {emotes.length === 0 ? (
            <div
              className={cn(
                "glass-button snap-center flex items-center justify-center px-2 md:px-4 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[12px] rounded-[17.5px] whitespace-nowrap",
                isLightBackground && "glass-button-dark",
                "backdrop-blur-[10px] text-white/50 cursor-default pointer-events-none",
              )}
            >
              <span className="truncate">No emotes</span>
            </div>
          ) : (
            <>
              {/* Auto-play button */}
              <Button
                onClick={handleAutoPlayToggle}
                variant={isLightBackground ? "dark" : "default"}
                className={cn(
                  "snap-center flex items-center justify-center gap-2 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[15px] rounded-[17.5px] whitespace-nowrap backdrop-blur-[10px]",
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
                  onChange={(e) =>
                    updateUIConfig(
                      "emotePlayback.autoPlayCategory",
                      e.target.value,
                    )
                  }
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
                    className={cn(
                      isLightBackground ? "glass-text" : "glass-text-black",
                    )}
                  />
                </span>
              </div>

              {/* Emote list */}
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
                    onClick={async () => {
                      try {
                        // Stop auto-play if active
                        if (isAutoPlayActive) {
                          emotePlayerService.stopAutoPlay();
                          setIsAutoPlayActive(false);
                        }
                        await emotePlayerService.playEmote(emote.id);
                        setIsEmotePanelOpen(false);
                      } catch (err) {
                        Logger.error(
                          "ChatButton",
                          "Failed to play emote:",
                          err,
                        );
                      }
                    }}
                    variant={isLightBackground ? "dark" : "default"}
                    className={cn(
                      "snap-center flex items-center justify-center gap-2 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[15px] rounded-[17.5px] whitespace-nowrap backdrop-blur-[10px]",
                      currentPlayingEmoteId === emote.id &&
                        "ring-2 ring-white/50",
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
      )}

      {/* Avatar/Stage List - Unified Panel */}
      {isAvatarPanelOpen && !isChatOpen && !modelDisabled && (
        <Card
          padding="none"
          style={{
            left: `${avatarPanelLeft}px`,
            top: `${avatarPanelTop}px`,
            zIndex: isAndroid ? 201 : 10001,
            ...(isDesktop &&
            ((panelMode === "avatar" && models.length > 6) ||
              (panelMode === "stage" && stages.length > 6))
              ? {
                  maskImage:
                    "linear-gradient(to bottom, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)",
                }
              : {}),
          }}
          variant="none"
          className="fixed w-[135px] max-h-[300px] overflow-y-auto px-1 snap-y snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {panelMode === "avatar" ? (
            <>
              {/* Default Model */}
              <Button
                onClick={() => handleModelSelect(null)}
                variant={isLightBackground ? "dark" : "default"}
                className={cn(
                  "snap-center flex items-center justify-start gap-2 px-3 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[13px] rounded-[17.5px] whitespace-nowrap backdrop-blur-[10px]",
                  selectedModelId === null && "ring-2 ring-white/50",
                )}
                title="VAssist Default"
              >
                {selectedModelId === null && (
                  <Icon name="check" size={14} className="flex-shrink-0" />
                )}
                <span className="truncate flex-1">VAssist Default</span>
              </Button>

              {/* Custom Models */}
              {models.map((model) => (
                <Button
                  key={model.id}
                  onClick={() => handleModelSelect(model.id)}
                  variant={isLightBackground ? "dark" : "default"}
                  className={cn(
                    "snap-center flex items-center justify-start gap-2 px-3 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[13px] rounded-[17.5px] whitespace-nowrap backdrop-blur-[10px]",
                    selectedModelId === model.id && "ring-2 ring-white/50",
                  )}
                  title={model.name}
                >
                  {selectedModelId === model.id && (
                    <Icon name="check" size={14} className="flex-shrink-0" />
                  )}
                  <span className="truncate flex-1">{model.name}</span>
                </Button>
              ))}
            </>
          ) : (
            <>
              {/* No Stage Option */}
              <Button
                onClick={() => handleStageSelect(null)}
                variant={isLightBackground ? "dark" : "default"}
                className={cn(
                  "snap-center flex items-center justify-start gap-2 px-3 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[13px] rounded-[17.5px] whitespace-nowrap backdrop-blur-[10px]",
                  selectedStageId === null && "ring-2 ring-white/50",
                )}
                title="No Stage"
              >
                {selectedStageId === null && (
                  <Icon name="check" size={14} className="flex-shrink-0" />
                )}
                <span className="truncate flex-1">No Stage</span>
              </Button>

              {/* Stage list */}
              {stages.map((stage) => (
                <Button
                  key={stage.id}
                  onClick={() => handleStageSelect(stage.id)}
                  variant={isLightBackground ? "dark" : "default"}
                  className={cn(
                    "snap-center flex items-center justify-start gap-2 px-3 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[13px] rounded-[17.5px] whitespace-nowrap backdrop-blur-[10px]",
                    selectedStageId === stage.id && "ring-2 ring-white/50",
                  )}
                  title={stage.name}
                >
                  {selectedStageId === stage.id && (
                    <Icon name="check" size={14} className="flex-shrink-0" />
                  )}
                  <span className="truncate flex-1">{stage.name}</span>
                </Button>
              ))}
            </>
          )}
        </Card>
      )}

      {/* Camera Controls - Positioned below Avatar List */}
      {isAvatarPanelOpen && !isChatOpen && !modelDisabled && (
        <Card
          padding="none"
          style={{
            left: `${avatarPanelLeft}px`,
            // Position just below the avatar panel
            top: `${avatarPanelTop + Math.min((models.length + 1) * 43, 300) + 8}px`,
            zIndex: isAndroid ? 201 : 10001,
          }}
          variant="none"
          className="fixed w-[135px] flex flex-col gap-1 p-1"
        >
          <div className="flex gap-1 justify-between">
            {/* 3D/2D Toggle Button */}
            <Button
              onClick={handle3DToggle}
              variant={isLightBackground ? "dark" : "default"}
              className={cn(
                "flex items-center justify-center gap-1 transition-all duration-200 h-[35px] min-h-[35px] w-[35px] text-[13px] rounded-[17.5px] backdrop-blur-[10px]",
                sceneRef?.current?.metadata?.getCameraMode?.() === "3D" &&
                  "ring-2 ring-white/50",
              )}
              title={
                sceneRef?.current?.metadata?.getCameraMode?.() === "3D"
                  ? "Switch to 2D Mode"
                  : "Switch to 3D Mode"
              }
            >
              <span className="font-medium">
                {sceneRef?.current?.metadata?.getCameraMode?.() === "3D"
                  ? "3D"
                  : "2D"}
              </span>
            </Button>

            {/* Reset Camera Button */}
            <Button
              onClick={handleCameraReset}
              variant={isLightBackground ? "dark" : "default"}
              className="flex items-center justify-center gap-1 transition-all duration-200 h-[35px] min-h-[35px] w-[35px] text-[13px] rounded-[17.5px] backdrop-blur-[10px]"
              title="Reset Camera Position"
            >
              <Icon name="refresh-cw" size={16} />
            </Button>

            {/* Camera Lock Toggle Button */}
            <Button
              onClick={handleCameraLockToggle}
              variant={isLightBackground ? "dark" : "default"}
              className={cn(
                "flex items-center justify-center gap-1 transition-all duration-200 h-[35px] min-h-[35px] w-[35px] text-[13px] rounded-[17.5px] backdrop-blur-[10px]",
                !sceneRef?.current?.metadata?.isCameraLocked?.() &&
                  "ring-2 ring-white/50",
              )}
              title={
                sceneRef?.current?.metadata?.isCameraLocked?.()
                  ? "Unlock Camera"
                  : "Lock Camera"
              }
            >
              <Icon
                name={
                  sceneRef?.current?.metadata?.isCameraLocked?.()
                    ? "lock"
                    : "unlock"
                }
                size={16}
              />
            </Button>
          </div>

          <div className="flex gap-1 justify-between">
            {/* Camera Save Toggle Button */}
            <Button
              onClick={handleCameraSaveToggle}
              variant={isLightBackground ? "dark" : "default"}
              className={cn(
                "flex items-center justify-center gap-1 transition-all duration-200 h-[35px] min-h-[35px] w-[35px] text-[13px] rounded-[17.5px] backdrop-blur-[10px]",
                sceneRef?.current?.metadata?.isCameraSaveEnabled?.() &&
                  "ring-2 ring-white/50",
              )}
              title={
                sceneRef?.current?.metadata?.isCameraSaveEnabled?.()
                  ? "Disable Position Saving"
                  : "Enable Position Saving"
              }
            >
              <div className="relative w-4 h-4">
                <Icon name="pin" size={16} />
                {!sceneRef?.current?.metadata?.isCameraSaveEnabled?.() && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-0.5 bg-white/50 -rotate-45" />
                  </div>
                )}
              </div>
            </Button>

            {/* Stage Button */}
            <Button
              onClick={() => {
                if (isEmotePanelOpen) setIsEmotePanelOpen(false);
                if (isAvatarPanelOpen && panelMode === "stage") {
                  setPanelMode("avatar");
                } else if (isAvatarPanelOpen && panelMode === "avatar") {
                  setPanelMode("stage");
                } else {
                  setPanelMode("stage");
                  setIsAvatarPanelOpen(true);
                }
              }}
              variant={isLightBackground ? "dark" : "default"}
              className="flex items-center justify-center gap-1 transition-all duration-200 h-[35px] min-h-[35px] w-[35px] text-[13px] rounded-[17.5px] backdrop-blur-[10px]"
              title={
                isAvatarPanelOpen && panelMode === "stage"
                  ? "Switch to Avatar List"
                  : isAvatarPanelOpen && panelMode === "avatar"
                    ? "Switch to Stage List"
                    : "Select Stage"
              }
            >
              <Icon
                name={
                  isAvatarPanelOpen && panelMode === "avatar" ? "box" : "user"
                }
                size={16}
              />
            </Button>
          </div>
        </Card>
      )}

      <div
        style={{
          ...androidPosition,
          zIndex: isAndroid ? 200 : 10000,
        }}
        className="fixed flex flex-col gap-2 items-center"
      >
        {showUtilityButtons && (
          <>
            {/* Reload Button */}
            <Button
              onClick={() => window.location.reload()}
              variant={isLightBackground ? "dark" : "default"}
              className={cn(
                "w-12 h-12 rounded-full hover:scale-110 active:scale-95 transition-transform",
                isLightBackground ? "hover:bg-black/30" : "hover:bg-white/30",
                isAppearing
                  ? "animate-fade-in"
                  : !isVisible && "animate-fade-out",
              )}
              title="Reload Page"
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

            {/* Emote Button */}
            <Button
              onClick={() => {
                if (isAvatarPanelOpen) setIsAvatarPanelOpen(false);
                setIsEmotePanelOpen(!isEmotePanelOpen);
              }}
              variant={isLightBackground ? "dark" : "default"}
              className={cn(
                "w-12 h-12 rounded-full hover:scale-110 active:scale-95 transition-transform",
                isLightBackground ? "hover:bg-black/30" : "hover:bg-white/30",
                isAppearing
                  ? "animate-fade-in"
                  : !isVisible && "animate-fade-out",
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

            {/* Avatar Button */}
            <Button
              onClick={() => {
                if (isEmotePanelOpen) setIsEmotePanelOpen(false);
                setIsAvatarPanelOpen(!isAvatarPanelOpen);
              }}
              variant={isLightBackground ? "dark" : "default"}
              className={cn(
                "w-12 h-12 rounded-full hover:scale-110 active:scale-95 transition-transform",
                isLightBackground ? "hover:bg-black/30" : "hover:bg-white/30",
                isAppearing
                  ? "animate-fade-in"
                  : !isVisible && "animate-fade-out",
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

            {/* Zoom Control */}
            <ZoomControl
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onReset={handleZoomReset}
              isZoomOutDisabled={isAtDefaultSize()}
              isLeftSide={isLeftSide}
              isLightBackground={isLightBackground}
              isVisible={isVisible}
            />
          </>
        )}

        {/* Chat Button */}
        <div ref={buttonRef}>
          <Button
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            style={{
              cursor: modelDisabled
                ? isDragging
                  ? "grabbing"
                  : "grab"
                : "pointer",
              willChange: isDragging ? "left, top" : "auto",
              transition: isDragging ? "none" : undefined,
            }}
            variant={isLightBackground ? "dark" : "default"}
            className={cn(
              "w-12 h-12 rounded-full",
              !modelDisabled &&
                "hover:scale-110 active:scale-95 transition-transform",
              isDragOverButton && "ring-2 ring-blue-400",
              isAppearing
                ? "animate-fade-in"
                : !isVisible && "animate-fade-out",
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
                isDragOverButton ? "attachment" : isChatOpen ? "close" : "ai"
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
    </>
  );
};

export default ChatButton;
