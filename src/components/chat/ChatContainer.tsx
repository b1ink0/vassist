/**
 * @fileoverview Main chat container component managing chat UI, messages, and positioning.
 * Handles chat display, TTS playback, drag-drop, background detection, and history management.
 */

import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ResolvedVAssistEmbedConfig,
  VAssistOpenSettingsOptions,
  VAssistSettingsTargetId,
} from "../../embed/config";
import { getBrandedLabel } from "../../embed/branding";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import { getHostCommandEventName } from "../../embed/hostCommands";
import { useVAssistReactCustomizations } from "../../embed/reactHostCustomizations";
import { useAppRuntimeServices } from "../../contexts/AppRuntimeContext";
import { Icon } from "../icons";
import { Button } from "../ui";
import { cn } from "../../utils/cn";
import { TTSServiceProxy, StorageServiceProxy } from "../../services/proxies";
import { DefaultTTSConfig } from "../../config/aiConfig";
import BackgroundDetector from "../../utils/BackgroundDetector";
import DragDropService from "../../services/DragDropService";
import UtilService from "../../services/UtilService";
import SettingsPanel from "../SettingsPanel";
import QuickAccessPanel from "../QuickAccessPanel";
import ChatHistoryPanel from "./ChatHistoryPanel";
import Dialog from "../common/Dialog";
import ChatMessage from "./ChatMessage";
import { modelStorageService } from "../../services/ModelStorageService";
import { motionStorageService } from "../../services/MotionStorageService";
import { stageStorageService } from "../../services/StageStorageService";
import emoteStorageService from "../../services/EmoteStorageService";
import { useDesktopWindowResize } from "../../hooks/useDesktopWindowResize";
import {
  useChatActions,
  useCurrentChatId,
  useChatMessages,
  useIsChatContainerVisible,
  useIsProcessing,
  useIsTempChat,
} from "../../hooks/app/useChat";
import {
  useButtonPosition,
  useDragActions,
  useIsDragOverChat,
  useIsDraggingButton,
  useIsDraggingModel,
} from "../../hooks/app/useDrag";
import {
  useIsSpeaking,
  useIsVoiceMode,
  useLoadingMessageIndex,
  usePlaybackActions,
  usePlayingMessageIndex,
} from "../../hooks/app/usePlayback";
import { usePositionManagerRef } from "../../hooks/app/useScene";
import {
  useIsHistoryPanelOpen,
  useIsQuickPanelOpen,
  useIsSettingsPanelOpen,
  useToolingActions,
} from "../../hooks/app/useTooling";
import { useAIConfig } from "../../hooks/config/useConfigAI";
import { useConfigTTSActions } from "../../hooks/config/useConfigTTS";
import {
  useConfigUIActions,
  useUIConfig,
} from "../../hooks/config/useConfigUI";
import { useAndroidApi } from "../../hooks/useAndroidStore";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import Logger from "../../services/LoggerService";
import { isDesktop, isAndroid } from "../../utils/PlatformUtils";
import type { PositionManagerLike } from "../../babylon/types";
import type { ComponentType } from "react";

interface ChatContainerProps {
  modelDisabled?: boolean;
  embedConfig: ResolvedVAssistEmbedConfig;
  onDragDrop?: (data: {
    text?: string;
    images?: string[];
    audios?: string[];
    errors?: string[];
  }) => void;
}

type ChatHistorySelection = { chatId: string };
type ChatDragDropData = {
  text?: string;
  images?: string[];
  audios?: string[];
  errors?: string[];
};

interface ButtonPosition {
  x: number;
  y: number;
}

interface ContainerPosition {
  x: number;
  y: number;
}

interface ChatMessageLike {
  id: string;
  role: string;
  isUser?: boolean;
  content: string;
  images?: string[];
  audios?: string[];
  branchInfo?: {
    totalBranches?: number;
    currentBranch?: number;
    canGoBack?: boolean;
    canGoForward?: boolean;
  };
}

type ChatRenderableItem =
  | {
      kind: "message";
      key: string;
      message: ChatMessageLike;
      messageIndex: number;
      isLastAIMessage: boolean;
      isLastUserMessage: boolean;
    }
  | {
      kind: "loading";
      key: string;
    };

const CHAT_MESSAGE_GAP = 12;
const CHAT_LIST_PADDING = 50;
const CHAT_SCROLL_END_THRESHOLD = 120;
const CHAT_ESTIMATED_ROW_HEIGHT = 128;

interface ChatHistoryPanelPropsLike {
  isLightBackground: boolean;
  onClose: () => void;
  onSelectChat: (chat: ChatHistorySelection) => void;
  onRequestEditDialog: (chatId: string, title: string) => void;
  onRequestDeleteDialog: (chatId: string) => void;
  refreshTrigger: number;
  animationClass: string;
}

interface DialogPropsLike {
  type: string;
  title: string;
  message: string;
  itemId: string;
  initialValue?: string;
  inputPlaceholder?: string;
  inputMaxLength?: number;
  isLightBackground?: boolean;
  animationClass?: string;
  confirmLabel?: string;
  confirmStyle?: string;
  onConfirm: (...args: string[]) => void | Promise<void>;
  onCancel: () => void;
}

interface DragDropServiceLike {
  attach: (
    element: HTMLElement,
    callbacks: {
      onSetDragOver?: (isDragging: boolean) => void;
      onShowError?: (error: Error | string) => void;
      checkVoiceMode?: (() => boolean) | null;
      getCurrentCounts?: () => { images: number; audios: number };
      onProcessData?: (data: ChatDragDropData) => void;
    },
  ) => void;
  detach: () => void;
}

interface StorageServiceLike {
  configLoad: <T>(key: string, defaultValue?: T) => Promise<T>;
}

interface TTSServiceLike {
  isConfigured: () => boolean;
  addEventListener: (event: string, callback: (event: Event) => void) => void;
  removeEventListener: (
    event: string,
    callback: (event: Event) => void,
  ) => void;
  stopPlayback: () => void;
  stopGeneration: () => void;
  resumePlayback: () => void;
  generateSpeech: (
    text: string,
    withLipSync?: boolean,
  ) => Promise<{ audio?: Blob | ArrayBuffer; bvmdUrl?: string } | null>;
  generateChunkedSpeech: (
    text: string,
    prefix?: string | null,
    chunkSize?: number,
    minChunkSize?: number,
    sessionId?: string,
  ) => Promise<string[]>;
  queueAudio: (
    text: string,
    audioUrl: string,
    bvmdUrl?: string,
    sessionId?: string,
  ) => void;
  playAudioSequence: (audioUrls: string[], sessionId?: string) => Promise<void>;
  cleanupBlobUrls: (audioUrls: string[]) => void;
}

interface DebugMarker {
  x: number;
  y: number;
  color: string;
  brightness: number;
  alpha: number;
  element: string;
}

type RawDebugMarker = {
  x?: number;
  y?: number;
  color?: string;
  brightness?: number;
  alpha?: number | string;
  element?: string;
};

const isHTMLElement = (value: unknown): value is HTMLElement =>
  value instanceof HTMLElement;

const toDebugMarkers = (
  markers: RawDebugMarker[] | null | undefined,
): DebugMarker[] => {
  if (!Array.isArray(markers)) {
    return [];
  }

  return markers
    .filter(
      (marker): marker is RawDebugMarker =>
        !!marker && typeof marker === "object",
    )
    .map((marker) => ({
      x: typeof marker.x === "number" ? marker.x : 0,
      y: typeof marker.y === "number" ? marker.y : 0,
      color: typeof marker.color === "string" ? marker.color : "#ffffff",
      brightness: typeof marker.brightness === "number" ? marker.brightness : 0,
      alpha:
        typeof marker.alpha === "number"
          ? marker.alpha
          : Number.parseFloat(String(marker.alpha ?? "1")) || 1,
      element: typeof marker.element === "string" ? marker.element : "unknown",
    }));
};

type TTSConfigLike = typeof DefaultTTSConfig & {
  gptsovits?: {
    referenceVoiceId?: string | null;
    referenceText?: string;
  };
};

interface DesktopLlmApiLike {
  deleteModel?: (
    filename: string,
    customPath?: string | null,
  ) => Promise<{ success?: boolean; error?: string }>;
}

interface DesktopApiLike {
  llm?: DesktopLlmApiLike;
  whisperCpp?: {
    deleteModel?: (options: { modelId: string }) => Promise<unknown>;
  };
}

interface AndroidApiLike {
  deleteLLMModel?: (filename: string) => string;
  deleteWhisperVariant?: (variantId: string) => string;
  deleteSenseVoiceModel?: () => string;
  deleteSenseVoiceQnnModel?: () => string;
  deleteDolphinModel?: (variantId: string) => string;
  deleteVitsModel?: () => string;
  deleteTtsPack?: (packId: string) => string;
}

const storageService = StorageServiceProxy as StorageServiceLike;
const ttsService = TTSServiceProxy as unknown as TTSServiceLike;
const dragDropCtor = DragDropService as unknown as new (options: {
  maxImages: number;
  maxAudios: number;
}) => DragDropServiceLike;
const TypedChatHistoryPanel =
  ChatHistoryPanel as ComponentType<ChatHistoryPanelPropsLike>;
const TypedDialog = Dialog as ComponentType<DialogPropsLike>;

const ANDROID_CHAT_TOP_OFFSET = 32;

/**
 * Chat container component.
 *
 * @component
 * @param {Object} props - Component props
 * @param {boolean} [props.modelDisabled=false] - Whether 3D model is disabled (chat-only mode)
 * @param {Function} props.onDragDrop - Callback to handle dropped content
 * @returns {JSX.Element} Chat container component
 */
const ChatContainer = ({
  modelDisabled = false,
  embedConfig,
  onDragDrop,
}: ChatContainerProps) => {
  const { hostId } = useEmbedHost();
  const reactCustomizations = useVAssistReactCustomizations(hostId);
  const { chatHistoryService } = useAppRuntimeServices();
  const positionManagerRef = usePositionManagerRef();
  const messages = useChatMessages();
  const currentChatId = useCurrentChatId();
  const isVisible = useIsChatContainerVisible();
  const isGenerating = useIsProcessing();
  const isTempChat = useIsTempChat();
  const {
    setIsTempChat,
    loadChatFromHistory,
    clearChat,
    stopGeneration,
    closeChat,
  } = useChatActions();
  const isVoiceMode = useIsVoiceMode();
  const isSpeaking = useIsSpeaking();
  const playingMessageIndex = usePlayingMessageIndex();
  const loadingMessageIndex = useLoadingMessageIndex();
  const { setPlayingMessageIndex, setLoadingMessageIndex } =
    usePlaybackActions();
  const isDragOver = useIsDragOverChat();
  const buttonPosition = useButtonPosition();
  const isDraggingButton = useIsDraggingButton();
  const isDraggingModel = useIsDraggingModel();
  const {
    setIsDragOverChat: setIsDragOver,
    startButtonDrag,
    endButtonDrag,
    startModelDrag,
    endModelDrag,
  } = useDragActions();
  const isSettingsPanelOpen = useIsSettingsPanelOpen();
  const isQuickPanelOpen = useIsQuickPanelOpen();
  const isHistoryPanelOpen = useIsHistoryPanelOpen();
  const {
    setIsSettingsPanelOpen,
    setIsQuickPanelOpen,
    setIsHistoryPanelOpen,
    editUserMessage,
    regenerateAIMessage,
    previousBranch,
    nextBranch,
  } = useToolingActions();

  const uiConfig = useUIConfig();
  const { updateUIConfig } = useConfigUIActions();
  const { updateTTSConfig } = useConfigTTSActions();
  const aiConfig = useAIConfig();
  const api = useDesktopApi() as DesktopApiLike | null;
  const androidAPI = useAndroidApi() as AndroidApiLike | null;

  const buttonPosRef = useRef<ButtonPosition>(buttonPosition);
  const buttonInitializedRef = useRef(false);
  const [containerPos, setContainerPos] = useState<ContainerPosition>({
    x: 0,
    y: 0,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragDropServiceRef = useRef<DragDropServiceLike | null>(null);
  const currentSessionRef = useRef<string | null>(null);
  const [isLightBackground, setIsLightBackground] = useState(false);
  const [ttsConfig, setTtsConfig] = useState<TTSConfigLike>(
    DefaultTTSConfig as TTSConfigLike,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [debugMarkers, setDebugMarkers] = useState<DebugMarker[]>([]);
  const chatInputRef = useRef<HTMLDivElement | null>(null);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(
    null,
  );
  const [isClosing, setIsClosing] = useState(false);
  const [isSettingsPanelClosing, setIsSettingsPanelClosing] = useState(false);
  const [isQuickPanelClosing, setIsQuickPanelClosing] = useState(false);
  const [isHistoryPanelClosing, setIsHistoryPanelClosing] = useState(false);

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatTitle, setEditingChatTitle] = useState("");
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [isEditDialogClosing, setIsEditDialogClosing] = useState(false);
  const [isDeleteDialogClosing, setIsDeleteDialogClosing] = useState(false);

  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [deletingMotionId, setDeletingMotionId] = useState<string | null>(null);
  const [deletingStageId, setDeletingStageId] = useState<string | null>(null);
  const [deletingEmoteId, setDeletingEmoteId] = useState<string | null>(null);
  const [deletingEmoteCategory, setDeletingEmoteCategory] = useState<
    string | null
  >(null);
  const [deletingVoiceId, setDeletingVoiceId] = useState<string | null>(null);
  const [deletingLLMModel, setDeletingLLMModel] = useState<string | null>(null);
  const [deletingSttModelId, setDeletingSttModelId] = useState<string | null>(
    null,
  );
  const [deletingTtsPackId, setDeletingTtsPackId] = useState<string | null>(
    null,
  );
  const [sttExternalDeleteTick, setSttExternalDeleteTick] = useState(0);
  const [ttsExternalDeleteTick, setTtsExternalDeleteTick] = useState(0);
  const [settingsErrorMessage, setSettingsErrorMessage] = useState<
    string | null
  >(null);
  const [pendingSettingsConfirmAction, setPendingSettingsConfirmAction] =
    useState<(() => Promise<void> | void) | null>(null);
  const [isDeleteModelDialogClosing, setIsDeleteModelDialogClosing] =
    useState(false);
  const [isDeleteMotionDialogClosing, setIsDeleteMotionDialogClosing] =
    useState(false);
  const [isDeleteStageDialogClosing, setIsDeleteStageDialogClosing] =
    useState(false);
  const [isDeleteEmoteDialogClosing, setIsDeleteEmoteDialogClosing] =
    useState(false);
  const [isDeleteVoiceDialogClosing, setIsDeleteVoiceDialogClosing] =
    useState(false);
  const [isDeleteLLMModelDialogClosing, setIsDeleteLLMModelDialogClosing] =
    useState(false);
  const [isDeleteSttModelDialogClosing, setIsDeleteSttModelDialogClosing] =
    useState(false);
  const [isDeleteTtsPackDialogClosing, setIsDeleteTtsPackDialogClosing] =
    useState(false);
  const [isSettingsConfirmDialogClosing, setIsSettingsConfirmDialogClosing] =
    useState(false);
  const [isSettingsErrorDialogClosing, setIsSettingsErrorDialogClosing] =
    useState(false);
  const [settingsRefreshTrigger, setSettingsRefreshTrigger] = useState(0);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [requestedSettingsView, setRequestedSettingsView] =
    useState<VAssistOpenSettingsOptions | null>(null);
  const [, setActiveSettingsTarget] = useState<VAssistSettingsTargetId | null>(
    null,
  );
  const settingsEnabled = embedConfig.features.settings;
  const historyEnabled = embedConfig.features.history;
  const liveAssistantEnabled = embedConfig.features.liveAssistant3d;

  const lastAnimatedMessageIdRef = useRef<string | null>(null);
  const wasVisibleRef = useRef(isVisible);
  const pendingHistoryScrollToEndRef = useRef(false);
  const wasAtChatEndRef = useRef(true);
  const pendingStreamingScrollFrameRef = useRef<number | null>(null);

  const lastUserMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "user") {
        return messages[index]?.id ?? null;
      }
    }

    return null;
  }, [messages]);

  const chatItems = useMemo<ChatRenderableItem[]>(() => {
    const items: ChatRenderableItem[] = [];

    for (const [index, message] of messages.entries()) {
      const isLastMessage = index === messages.length - 1;

      const isUser = message.role === "user";
      const isError = message.content.toLowerCase().startsWith("error:");

      items.push({
        kind: "message",
        key: message.id,
        message,
        messageIndex: index,
        isLastAIMessage: !isUser && !isError && isLastMessage,
        isLastUserMessage: isUser && lastUserMessageId === message.id,
      });
    }

    const lastMessage = messages[messages.length - 1];

    if (isGenerating && lastMessage?.role === "user") {
      items.push({
        kind: "loading",
        key: `loading-${lastMessage.id}`,
      });
    }

    return items;
  }, [isGenerating, lastUserMessageId, messages]);

  const chatVirtualizer = useVirtualizer({
    count: chatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CHAT_ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => chatItems[index]?.key ?? `chat-item-${index}`,
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: CHAT_SCROLL_END_THRESHOLD,
    overscan: 8,
    paddingStart: CHAT_LIST_PADDING,
    paddingEnd: CHAT_LIST_PADDING,
    gap: CHAT_MESSAGE_GAP,
    enabled: chatItems.length > 0,
  });

  const virtualChatItems = chatVirtualizer.getVirtualItems();

  useEffect(() => {
    buttonPosRef.current = buttonPosition;
  }, [buttonPosition]);

  useEffect(() => {
    if (!settingsEnabled && isSettingsPanelOpen) {
      setIsSettingsPanelOpen(false);
    }
  }, [isSettingsPanelOpen, setIsSettingsPanelOpen, settingsEnabled]);

  useEffect(() => {
    if (!settingsEnabled && isQuickPanelOpen) {
      setIsQuickPanelOpen(false);
    }
  }, [isQuickPanelOpen, setIsQuickPanelOpen, settingsEnabled]);

  useEffect(() => {
    if (!historyEnabled && isHistoryPanelOpen) {
      setIsHistoryPanelOpen(false);
    }
  }, [historyEnabled, isHistoryPanelOpen, setIsHistoryPanelOpen]);

  useEffect(() => {
    const handleOpenSettings = (event: Event) => {
      if (!(event instanceof CustomEvent) || !settingsEnabled) {
        return;
      }

      setRequestedSettingsView(
        (event.detail as VAssistOpenSettingsOptions | null | undefined) ?? {},
      );
      setIsQuickPanelOpen(false);
      setIsHistoryPanelOpen(false);
      setIsSettingsPanelOpen(true);
    };

    window.addEventListener(
      getHostCommandEventName(hostId, "open-settings"),
      handleOpenSettings,
    );

    return () => {
      window.removeEventListener(
        getHostCommandEventName(hostId, "open-settings"),
        handleOpenSettings,
      );
    };
  }, [
    hostId,
    setIsHistoryPanelOpen,
    setIsQuickPanelOpen,
    setIsSettingsPanelOpen,
    settingsEnabled,
  ]);

  useDesktopWindowResize();

  /**
   * Auto-focuses input when chat is cleared (new chat created).
   */
  useEffect(() => {
    if (messages.length === 0 && isVisible) {
      const event = new CustomEvent("focusChatInput");
      window.dispatchEvent(event);
    }
  }, [messages.length, isVisible]);

  /**
   * Calculates container position based on button or model position.
   */
  const calculateContainerPosition = useCallback(() => {
    const chatInputHeight =
      chatInputRef?.current?.getBoundingClientRect().height || 140;
    const isSmallScreen = window.innerWidth <= 768;

    if (isAndroid) {
      return { x: 8, y: ANDROID_CHAT_TOP_OFFSET };
    }

    if (isSmallScreen) {
      const containerWidth = Math.min(400, window.innerWidth - 16);
      const containerHeight = modelDisabled ? 400 : 500;
      const availableHeight = window.innerHeight - chatInputHeight;

      const containerX = Math.max(
        8,
        Math.min(
          (window.innerWidth - containerWidth) / 2,
          window.innerWidth - containerWidth - 8,
        ),
      );
      const containerY = Math.max(
        10,
        Math.min(
          (availableHeight - containerHeight) / 2,
          availableHeight - containerHeight - 10,
        ),
      );

      return { x: containerX, y: containerY };
    }

    if (modelDisabled) {
      const buttonPos = buttonPosRef.current;
      const containerWidth = Math.min(400, window.innerWidth - 16);
      const containerHeight = 400;
      const offsetY = 5;
      const buttonSize = 48;

      const containerX = Math.max(
        8,
        Math.min(
          buttonPos.x - (containerWidth - buttonSize) / 2,
          window.innerWidth - containerWidth - 8,
        ),
      );
      let containerY =
        buttonPos.y - containerHeight - chatInputHeight - offsetY;
      containerY = Math.max(10, containerY);
      const maxY =
        window.innerHeight - containerHeight - chatInputHeight - offsetY;
      containerY = Math.min(containerY, maxY);

      return { x: containerX, y: containerY };
    } else if (positionManagerRef?.current) {
      try {
        const modelPos = positionManagerRef.current.getPositionPixels();
        const containerWidth = Math.min(400, window.innerWidth - 16);
        const containerHeight = 500;
        const offsetX = 15;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const availableHeight = windowHeight - chatInputHeight;

        const rightX = modelPos.x + modelPos.width + offsetX;
        const leftX = modelPos.x - containerWidth - offsetX;
        const wouldOverflowRight = rightX + containerWidth > windowWidth - 8;
        const wouldOverflowLeft = leftX < 8;
        const modelRightEdge = modelPos.x + modelPos.width;
        const wouldOverlapRight = modelRightEdge > rightX;

        // Always place on right side in desktop mode
        let shouldBeOnLeft = false;
        if (!isDesktop) {
          if (wouldOverflowRight) {
            shouldBeOnLeft = true;
          } else if (wouldOverlapRight && !wouldOverflowLeft) {
            shouldBeOnLeft = true;
          } else if (modelPos.x > windowWidth * 0.7) {
            shouldBeOnLeft = true;
          }
        }

        let containerX = shouldBeOnLeft ? leftX : rightX;
        containerX = Math.max(
          8,
          Math.min(containerX, windowWidth - containerWidth - 8),
        );
        let containerY = modelPos.y;
        containerY = Math.max(
          10,
          Math.min(containerY, availableHeight - containerHeight - 10),
        );

        return { x: containerX, y: containerY };
      } catch (error) {
        Logger.error(
          "ChatContainer",
          "Failed to calculate model position:",
          error,
        );
        return { x: 0, y: 0 };
      }
    }

    return { x: 0, y: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelDisabled]);

  useEffect(() => {
    if (!modelDisabled || buttonInitializedRef.current) return;

    const initButton = async () => {
      try {
        const defaultPos = {
          x: window.innerWidth - 68,
          y: window.innerHeight - 68,
        };
        const savedPos = await storageService.configLoad(
          "chatButtonPosition",
          defaultPos,
        );
        buttonPosRef.current = savedPos;
        buttonInitializedRef.current = true;
        setContainerPos(calculateContainerPosition());
      } catch (error) {
        Logger.error("ChatContainer", "Failed to load button position:", error);
        buttonInitializedRef.current = true;
      }
    };

    initButton();
  }, [modelDisabled, calculateContainerPosition]);

  useEffect(() => {
    if (!isVisible || modelDisabled) return;

    const newPos = calculateContainerPosition();
    setContainerPos(newPos);
  }, [isVisible, modelDisabled, calculateContainerPosition]);

  useEffect(() => {
    if (!isVisible) return;

    const handleModelPosition = () => {
      if (isAndroid) {
        setContainerPos(calculateContainerPosition());
        return;
      }

      if (window.innerWidth <= 768) {
        setContainerPos(calculateContainerPosition());
        return;
      }

      // Events are already RAF-throttled by PositionManager, just update directly
      // Use .current to access latest refs without recreating handler
      const chatInputHeight =
        chatInputRef?.current?.getBoundingClientRect().height || 140;

      if (modelDisabled) {
        const buttonPos = buttonPosRef.current;
        const containerWidth = Math.min(400, window.innerWidth - 16);
        const containerHeight = 400;
        const offsetY = 5;
        const buttonSize = 48;

        const containerX = Math.max(
          8,
          Math.min(
            buttonPos.x - (containerWidth - buttonSize) / 2,
            window.innerWidth - containerWidth - 8,
          ),
        );
        let containerY =
          buttonPos.y - containerHeight - chatInputHeight - offsetY;
        containerY = Math.max(10, containerY);
        const maxY =
          window.innerHeight - containerHeight - chatInputHeight - offsetY;
        containerY = Math.min(containerY, maxY);

        setContainerPos({ x: containerX, y: containerY });
      } else if (positionManagerRef?.current) {
        try {
          const modelPos = positionManagerRef.current.getPositionPixels();
          const containerWidth = Math.min(400, window.innerWidth - 16);
          const containerHeight = 500;
          const offsetX = 15;
          const windowWidth = window.innerWidth;
          const windowHeight = window.innerHeight;
          const availableHeight = windowHeight - chatInputHeight;

          const rightX = modelPos.x + modelPos.width + offsetX;
          const leftX = modelPos.x - containerWidth - offsetX;
          const wouldOverflowRight = rightX + containerWidth > windowWidth - 8;
          const wouldOverflowLeft = leftX < 8;
          const modelRightEdge = modelPos.x + modelPos.width;
          const wouldOverlapRight = modelRightEdge > rightX;

          let shouldBeOnLeft = false;
          if (wouldOverflowRight) {
            shouldBeOnLeft = true;
          } else if (wouldOverlapRight && !wouldOverflowLeft) {
            shouldBeOnLeft = true;
          } else if (modelPos.x > windowWidth * 0.7) {
            shouldBeOnLeft = true;
          }

          let containerX = shouldBeOnLeft ? leftX : rightX;
          containerX = Math.max(
            8,
            Math.min(containerX, windowWidth - containerWidth - 8),
          );
          let containerY = modelPos.y;
          containerY = Math.max(
            10,
            Math.min(containerY, availableHeight - containerHeight - 10),
          );

          setContainerPos({ x: containerX, y: containerY });
        } catch (error) {
          Logger.error(
            "ChatContainer",
            "Failed to calculate model position:",
            error,
          );
        }
      }
    };

    if (!modelDisabled) {
      handleModelPosition();
      window.addEventListener("modelPositionChange", handleModelPosition);
      return () =>
        window.removeEventListener("modelPositionChange", handleModelPosition);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, modelDisabled]);

  useEffect(() => {
    if (!isVisible) return;

    const handleResize = () => {
      const newPos = calculateContainerPosition();
      setContainerPos(newPos);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isVisible, calculateContainerPosition]);

  useEffect(() => {
    const handleButtonMoved = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      buttonPosRef.current = event.detail;
      const newPos = calculateContainerPosition();
      setContainerPos(newPos);
    };

    if (modelDisabled) {
      window.addEventListener("chatButtonMoved", handleButtonMoved);
      return () =>
        window.removeEventListener("chatButtonMoved", handleButtonMoved);
    }
  }, [modelDisabled, calculateContainerPosition]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const timeoutId = setTimeout(() => {
      if (!messagesContainerRef.current) {
        return;
      }

      dragDropServiceRef.current = new dragDropCtor({
        maxImages: 3,
        maxAudios: 1,
      });

      dragDropServiceRef.current.attach(messagesContainerRef.current, {
        onSetDragOver: (isDragging: boolean) => setIsDragOver(isDragging),
        onShowError: (error: Error | string) =>
          Logger.error("ChatContainer", "Drag-drop error:", error),
        checkVoiceMode: null,
        getCurrentCounts: () => ({ images: 0, audios: 0 }),
        onProcessData: (data: ChatDragDropData) => {
          if (onDragDrop) {
            onDragDrop(data);
          }
        },
      });
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (dragDropServiceRef.current) {
        dragDropServiceRef.current.detach();
      }
    };
  }, [isVisible, onDragDrop, setIsDragOver]);

  useEffect(() => {
    if (modelDisabled) {
      window.addEventListener("chatButtonDragStart", startButtonDrag);
      window.addEventListener("chatButtonDragEnd", endButtonDrag);
      return () => {
        window.removeEventListener("chatButtonDragStart", startButtonDrag);
        window.removeEventListener("chatButtonDragEnd", endButtonDrag);
      };
    } else {
      window.addEventListener("modelDragStart", startModelDrag);
      window.addEventListener("modelDragEnd", endModelDrag);
      return () => {
        window.removeEventListener("modelDragStart", startModelDrag);
        window.removeEventListener("modelDragEnd", endModelDrag);
      };
    }
  }, [
    modelDisabled,
    startButtonDrag,
    endButtonDrag,
    startModelDrag,
    endModelDrag,
  ]);

  const handleHistoryClose = useCallback(() => {
    setIsHistoryPanelClosing(true);
    setTimeout(() => {
      setIsHistoryPanelOpen(false);
      setIsHistoryPanelClosing(false);
    }, 200);
  }, [setIsHistoryPanelOpen]);

  const handleSelectChat = useCallback(
    (chat: ChatHistorySelection) => {
      pendingHistoryScrollToEndRef.current = true;

      loadChatFromHistory(chat);
      setIsHistoryPanelClosing(true);
      setTimeout(() => {
        setIsHistoryPanelOpen(false);
        setIsHistoryPanelClosing(false);
      }, 200);
    },
    [loadChatFromHistory, setIsHistoryPanelOpen],
  );

  const handleRequestEditDialog = useCallback(
    (chatId: string, title: string) => {
      setEditingChatId(chatId);
      setEditingChatTitle(title);
    },
    [],
  );

  const handleEditDialogSave = useCallback(
    async (chatId: string, newTitle: string) => {
      try {
        await chatHistoryService.updateChatTitle(chatId, newTitle);
        Logger.log("ChatContainer", "Updated chat title:", chatId, newTitle);

        // Trigger chat history panel refresh
        setHistoryRefreshTrigger((prev) => prev + 1);

        setIsEditDialogClosing(true);
        setTimeout(() => {
          setEditingChatId(null);
          setEditingChatTitle("");
          setIsEditDialogClosing(false);
        }, 200);
      } catch (error) {
        Logger.error("ChatContainer", "Failed to update chat title:", error);
      }
    },
    [chatHistoryService],
  );

  const handleEditDialogCancel = useCallback(() => {
    setIsEditDialogClosing(true);
    setTimeout(() => {
      setEditingChatId(null);
      setEditingChatTitle("");
      setIsEditDialogClosing(false);
    }, 200);
  }, []);

  const handleRequestDeleteDialog = useCallback((chatId: string) => {
    setDeletingChatId(chatId);
  }, []);

  const handleDeleteDialogConfirm = useCallback(
    async (chatId: string) => {
      try {
        await chatHistoryService.deleteChat(chatId);
        Logger.log("ChatContainer", "Deleted chat:", chatId);

        // Trigger chat history panel refresh
        setHistoryRefreshTrigger((prev) => prev + 1);

        setIsDeleteDialogClosing(true);
        setTimeout(() => {
          setDeletingChatId(null);
          setIsDeleteDialogClosing(false);
        }, 200);
      } catch (error) {
        Logger.error("ChatContainer", "Failed to delete chat:", error);
      }
    },
    [chatHistoryService],
  );

  const handleDeleteDialogCancel = useCallback(() => {
    setIsDeleteDialogClosing(true);
    setTimeout(() => {
      setDeletingChatId(null);
      setIsDeleteDialogClosing(false);
    }, 200);
  }, []);

  const handleRequestDeleteModelDialog = useCallback((modelId: string) => {
    setDeletingModelId(modelId);
  }, []);

  const handleDeleteModelConfirm = useCallback(async (modelId: string) => {
    try {
      await modelStorageService.deleteModel(modelId);
      Logger.log("ChatContainer", "Deleted model:", modelId);

      setIsDeleteModelDialogClosing(true);
      setTimeout(() => {
        setDeletingModelId(null);
        setIsDeleteModelDialogClosing(false);
        setSettingsRefreshTrigger((prev) => prev + 1); // Trigger refresh
      }, 200);
    } catch (error) {
      Logger.error("ChatContainer", "Failed to delete model:", error);
    }
  }, []);

  const handleDeleteModelCancel = useCallback(() => {
    setIsDeleteModelDialogClosing(true);
    setTimeout(() => {
      setDeletingModelId(null);
      setIsDeleteModelDialogClosing(false);
    }, 200);
  }, []);

  const handleRequestDeleteMotionDialog = useCallback((motionId: string) => {
    setDeletingMotionId(motionId);
  }, []);

  const handleRequestDeleteStageDialog = useCallback((stageId: string) => {
    setDeletingStageId(stageId);
  }, []);

  const handleDeleteStageConfirm = useCallback(async (stageId: string) => {
    try {
      await stageStorageService.deleteStage(stageId);
      Logger.log("ChatContainer", "Deleted stage:", stageId);

      setIsDeleteStageDialogClosing(true);
      setTimeout(() => {
        setDeletingStageId(null);
        setIsDeleteStageDialogClosing(false);
        setSettingsRefreshTrigger((prev) => prev + 1);
      }, 200);
    } catch (error) {
      Logger.error("ChatContainer", "Failed to delete stage:", error);
      setSettingsErrorMessage("Failed to delete stage.");
    }
  }, []);

  const handleDeleteStageCancel = useCallback(() => {
    setIsDeleteStageDialogClosing(true);
    setTimeout(() => {
      setDeletingStageId(null);
      setIsDeleteStageDialogClosing(false);
    }, 200);
  }, []);

  const handleRequestDeleteEmoteDialog = useCallback(
    (payload: { emoteId?: string; category?: string }) => {
      setDeletingEmoteId(payload.emoteId || null);
      setDeletingEmoteCategory(payload.category || null);
    },
    [],
  );

  const handleDeleteEmoteConfirm = useCallback(async () => {
    try {
      if (deletingEmoteCategory) {
        const emotes = await emoteStorageService.getEmotesList();
        const toDelete = emotes.filter((emote) => {
          if (deletingEmoteCategory === "all") {
            return true;
          }
          const categories = Array.isArray(emote.categories)
            ? emote.categories
            : ["general"];
          return categories.includes(deletingEmoteCategory);
        });

        await Promise.all(
          toDelete.map((emote) => emoteStorageService.deleteEmote(emote.id)),
        );
        Logger.log(
          "ChatContainer",
          "Deleted filtered emotes count:",
          toDelete.length,
        );
      } else if (deletingEmoteId) {
        await emoteStorageService.deleteEmote(deletingEmoteId);
        Logger.log("ChatContainer", "Deleted emote:", deletingEmoteId);
      } else {
        return;
      }

      setIsDeleteEmoteDialogClosing(true);
      setTimeout(() => {
        setDeletingEmoteId(null);
        setDeletingEmoteCategory(null);
        setIsDeleteEmoteDialogClosing(false);
        setSettingsRefreshTrigger((prev) => prev + 1);
      }, 200);
    } catch (error) {
      Logger.error("ChatContainer", "Failed to delete emote(s):", error);
      setSettingsErrorMessage("Failed to delete emote(s).");
    }
  }, [deletingEmoteCategory, deletingEmoteId]);

  const handleDeleteEmoteCancel = useCallback(() => {
    setIsDeleteEmoteDialogClosing(true);
    setTimeout(() => {
      setDeletingEmoteId(null);
      setDeletingEmoteCategory(null);
      setIsDeleteEmoteDialogClosing(false);
    }, 200);
  }, []);

  const handleDeleteMotionConfirm = useCallback(async (motionId: string) => {
    try {
      await motionStorageService.deleteMotion(motionId);
      Logger.log("ChatContainer", "Deleted motion:", motionId);

      setIsDeleteMotionDialogClosing(true);
      setTimeout(() => {
        setDeletingMotionId(null);
        setIsDeleteMotionDialogClosing(false);
        setSettingsRefreshTrigger((prev) => prev + 1); // Trigger refresh
      }, 200);
    } catch (error) {
      Logger.error("ChatContainer", "Failed to delete motion:", error);
    }
  }, []);

  const handleDeleteMotionCancel = useCallback(() => {
    setIsDeleteMotionDialogClosing(true);
    setTimeout(() => {
      setDeletingMotionId(null);
      setIsDeleteMotionDialogClosing(false);
    }, 200);
  }, []);

  const handleRequestDeleteVoiceDialog = useCallback((voiceId: string) => {
    setDeletingVoiceId(voiceId);
  }, []);

  const handleDeleteVoiceConfirm = useCallback(
    async (voiceId: string) => {
      try {
        const { default: voiceStorageService } =
          await import("../../services/VoiceStorageService");
        await voiceStorageService.deleteVoice(voiceId);
        Logger.log("ChatContainer", "Deleted voice:", voiceId);

        if (ttsConfig?.gptsovits?.referenceVoiceId === voiceId) {
          updateTTSConfig("gptsovits.referenceVoiceId", null);
          updateTTSConfig("gptsovits.referenceText", "");
        }

        setSettingsRefreshTrigger((prev) => {
          const newValue = prev + 1;
          return newValue;
        });

        setIsDeleteVoiceDialogClosing(true);
        setTimeout(() => {
          setDeletingVoiceId(null);
          setIsDeleteVoiceDialogClosing(false);
        }, 200);
      } catch (error) {
        Logger.error("ChatContainer", "Failed to delete voice:", error);
      }
    },
    [ttsConfig, updateTTSConfig],
  );

  const handleDeleteVoiceCancel = useCallback(() => {
    setIsDeleteVoiceDialogClosing(true);
    setTimeout(() => {
      setDeletingVoiceId(null);
      setIsDeleteVoiceDialogClosing(false);
    }, 200);
  }, []);

  const handleRequestDeleteLLMModel = useCallback((filename: string) => {
    setDeletingLLMModel(filename);
  }, []);

  const handleDeleteLLMModelConfirm = useCallback(
    async (filename: string) => {
      try {
        let result;

        if (isDesktop && api?.llm) {
          // Get custom models path from aiConfig
          const customPath =
            (
              aiConfig as unknown as {
                ["desktop-local"]?: { customModelsPath?: string };
              } | null
            )?.["desktop-local"]?.customModelsPath || null;
          const deleteModel = api.llm.deleteModel;
          if (!deleteModel) {
            Logger.error(
              "ChatContainer",
              "Desktop LLM deleteModel API is unavailable",
            );
            return;
          }
          result = await deleteModel(filename, customPath);
        } else if (isAndroid && androidAPI?.deleteLLMModel) {
          const resultJson = androidAPI.deleteLLMModel(filename);
          result = JSON.parse(resultJson);
        } else {
          Logger.error("ChatContainer", "No deletion API available");
          return;
        }

        if (result?.success) {
          Logger.log("ChatContainer", "Deleted LLM model:", filename);

          // Trigger refresh
          setSettingsRefreshTrigger((prev) => prev + 1);
        } else {
          Logger.error("ChatContainer", "Delete failed:", result?.error);
        }

        setIsDeleteLLMModelDialogClosing(true);
        setTimeout(() => {
          setDeletingLLMModel(null);
          setIsDeleteLLMModelDialogClosing(false);
        }, 200);
      } catch (error) {
        Logger.error("ChatContainer", "Failed to delete LLM model:", error);
        setIsDeleteLLMModelDialogClosing(true);
        setTimeout(() => {
          setDeletingLLMModel(null);
          setIsDeleteLLMModelDialogClosing(false);
        }, 200);
      }
    },
    [aiConfig, api, androidAPI],
  );

  const handleDeleteLLMModelCancel = useCallback(() => {
    setIsDeleteLLMModelDialogClosing(true);
    setTimeout(() => {
      setDeletingLLMModel(null);
      setIsDeleteLLMModelDialogClosing(false);
    }, 200);
  }, []);

  const handleRequestDeleteSttModel = useCallback((variantId: string) => {
    setDeletingSttModelId(variantId);
  }, []);

  const handleDeleteSttModelConfirm = useCallback(
    async (variantId: string) => {
      try {
        let resultJson: string | undefined;
        if (variantId.startsWith("whispercpp:")) {
          // Desktop whisper.cpp GGML model (async IPC, no JSON envelope)
          const modelId = variantId.slice("whispercpp:".length);
          await api?.whisperCpp
            ?.deleteModel?.({ modelId })
            .catch((error: unknown) => {
              Logger.error(
                "ChatContainer",
                "whisper.cpp model delete failed:",
                error,
              );
            });
          setSttExternalDeleteTick((prev) => prev + 1);
          setIsDeleteSttModelDialogClosing(true);
          setTimeout(() => {
            setDeletingSttModelId(null);
            setIsDeleteSttModelDialogClosing(false);
          }, 200);
          return;
        }
        if (variantId === "sensevoice-qnn") {
          resultJson = androidAPI?.deleteSenseVoiceQnnModel?.();
        } else if (variantId === "sensevoice") {
          resultJson = androidAPI?.deleteSenseVoiceModel?.();
        } else if (variantId.startsWith("dolphin-")) {
          resultJson = androidAPI?.deleteDolphinModel?.(variantId);
        } else {
          resultJson = androidAPI?.deleteWhisperVariant?.(variantId);
        }

        if (!resultJson) {
          Logger.error("ChatContainer", "No STT deletion API available");
          return;
        }

        const result = JSON.parse(resultJson) as {
          success?: boolean;
          error?: string;
        };

        if (result?.success) {
          Logger.log("ChatContainer", "Deleted STT model:", variantId);

          // Trigger refresh inside the downloader components
          setSttExternalDeleteTick((prev) => prev + 1);
        } else {
          Logger.error("ChatContainer", "Delete failed:", result?.error);
        }

        setIsDeleteSttModelDialogClosing(true);
        setTimeout(() => {
          setDeletingSttModelId(null);
          setIsDeleteSttModelDialogClosing(false);
        }, 200);
      } catch (error) {
        Logger.error("ChatContainer", "Failed to delete STT model:", error);
        setIsDeleteSttModelDialogClosing(true);
        setTimeout(() => {
          setDeletingSttModelId(null);
          setIsDeleteSttModelDialogClosing(false);
        }, 200);
      }
    },
    [androidAPI, api?.whisperCpp],
  );

  const handleDeleteSttModelCancel = useCallback(() => {
    setIsDeleteSttModelDialogClosing(true);
    setTimeout(() => {
      setDeletingSttModelId(null);
      setIsDeleteSttModelDialogClosing(false);
    }, 200);
  }, []);

  const handleRequestDeleteTtsPack = useCallback((packId: string) => {
    setDeletingTtsPackId(packId);
  }, []);

  const handleDeleteTtsPackConfirm = useCallback(
    async (packId: string) => {
      try {
        const resultJson =
          packId === "vits-vctk"
            ? androidAPI?.deleteVitsModel?.()
            : androidAPI?.deleteTtsPack?.(packId);

        if (!resultJson) {
          Logger.error("ChatContainer", "No TTS deletion API available");
          return;
        }

        const result = JSON.parse(resultJson) as {
          success?: boolean;
          error?: string;
        };

        if (result?.success) {
          Logger.log("ChatContainer", "Deleted TTS voice pack:", packId);

          // Trigger refresh inside the downloader components
          setTtsExternalDeleteTick((prev) => prev + 1);
        } else {
          Logger.error("ChatContainer", "Delete failed:", result?.error);
        }

        setIsDeleteTtsPackDialogClosing(true);
        setTimeout(() => {
          setDeletingTtsPackId(null);
          setIsDeleteTtsPackDialogClosing(false);
        }, 200);
      } catch (error) {
        Logger.error(
          "ChatContainer",
          "Failed to delete TTS voice pack:",
          error,
        );
        setIsDeleteTtsPackDialogClosing(true);
        setTimeout(() => {
          setDeletingTtsPackId(null);
          setIsDeleteTtsPackDialogClosing(false);
        }, 200);
      }
    },
    [androidAPI],
  );

  const handleDeleteTtsPackCancel = useCallback(() => {
    setIsDeleteTtsPackDialogClosing(true);
    setTimeout(() => {
      setDeletingTtsPackId(null);
      setIsDeleteTtsPackDialogClosing(false);
    }, 200);
  }, []);

  const handleRequestResetSetupDialog = useCallback(
    (onConfirm: () => Promise<void> | void) => {
      setPendingSettingsConfirmAction(() => onConfirm);
    },
    [],
  );

  const handleSettingsConfirmCancel = useCallback(() => {
    setIsSettingsConfirmDialogClosing(true);
    setTimeout(() => {
      setPendingSettingsConfirmAction(null);
      setIsSettingsConfirmDialogClosing(false);
    }, 200);
  }, []);

  const handleSettingsConfirmConfirm = useCallback(async () => {
    if (!pendingSettingsConfirmAction) {
      return;
    }

    try {
      setPendingSettingsConfirmAction(null);
      await pendingSettingsConfirmAction();
    } catch (error) {
      Logger.error("ChatContainer", "Settings confirm action failed:", error);
      setSettingsErrorMessage("Action failed. Please try again.");
    }
  }, [pendingSettingsConfirmAction]);

  const handleRequestSettingsErrorDialog = useCallback((message: string) => {
    setSettingsErrorMessage(message);
  }, []);

  const handleSettingsErrorClose = useCallback(() => {
    setIsSettingsErrorDialogClosing(true);
    setTimeout(() => {
      setSettingsErrorMessage(null);
      setIsSettingsErrorDialogClosing(false);
    }, 200);
  }, []);

  /**
   * Handles settings panel close with animation.
   */
  const handleSettingsPanelClose = useCallback(() => {
    setIsSettingsPanelClosing(true);
    setTimeout(() => {
      setIsSettingsPanelOpen(false);
      setIsSettingsPanelClosing(false);
      setRequestedSettingsView(null);
    }, 200);
  }, [setIsSettingsPanelOpen]);

  const handleQuickPanelClose = useCallback(() => {
    setIsQuickPanelClosing(true);
    setTimeout(() => {
      setIsQuickPanelOpen(false);
      setIsQuickPanelClosing(false);
    }, 200);
  }, [setIsQuickPanelOpen]);

  /**
   * Handle stop generation.
   */
  const handleStopGeneration = useCallback(() => {
    if (isGenerating) {
      Logger.log("ChatContainer", "Stop button clicked");
      stopGeneration();
    } else {
      stopGeneration();
    }
  }, [isGenerating, stopGeneration]);

  useEffect(() => {
    const loadTtsConfig = async () => {
      try {
        const config = await storageService.configLoad(
          "ttsConfig",
          DefaultTTSConfig as TTSConfigLike,
        );
        setTtsConfig(config);
      } catch (error) {
        Logger.error("ChatContainer", "Failed to load TTS config:", error);
        setTtsConfig(DefaultTTSConfig);
      }
    };

    loadTtsConfig();
  }, []);

  /**
   * Detects background color brightness behind the container.
   * Samples a configurable grid for accurate detection.
   */
  useEffect(() => {
    if (!isVisible) return;

    const isAdaptiveMode =
      (uiConfig?.backgroundDetection?.mode || "adaptive") === "adaptive";

    if (!isAdaptiveMode) {
      const forcedMode = uiConfig?.backgroundDetection?.mode;
      if (forcedMode === "light") {
        setIsLightBackground(true);
        if (messagesContainerRef.current) {
          messagesContainerRef.current.classList.add("light-bg");
        }
      } else if (forcedMode === "dark") {
        setIsLightBackground(false);
        if (messagesContainerRef.current) {
          messagesContainerRef.current.classList.remove("light-bg");
        }
      }
      return;
    }

    let detectionTimeout: ReturnType<typeof setTimeout> | null = null;
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
    let intervalId = null;

    const detectBackgroundBrightness = () => {
      const canvas = document.getElementById("vassist-babylon-canvas");
      const container = containerRef.current;

      const elementsToDisable = [canvas, container].filter(isHTMLElement);
      const elementsToIgnore = [canvas, container].filter(isHTMLElement);

      const result = BackgroundDetector.withDisabledPointerEvents(
        elementsToDisable,
        () => {
          return BackgroundDetector.detectBrightness({
            sampleArea: {
              type: "grid",
              x: containerPos.x,
              y: containerPos.y,
              width: 400,
              height: 500,
              padding: 60,
            },
            elementsToIgnore: [...elementsToIgnore],
            logPrefix: "[ChatContainer]",
          });
        },
      );

      setDebugMarkers(toDebugMarkers(result.debugMarkers));

      setIsLightBackground((prevState) => {
        if (prevState !== result.isLight) {
          if (messagesContainerRef.current) {
            if (result.isLight) {
              messagesContainerRef.current.classList.add("light-bg");
            } else {
              messagesContainerRef.current.classList.remove("light-bg");
            }
          }
          return result.isLight;
        }
        return prevState;
      });
    };

    // Initial detection with delay
    detectionTimeout = setTimeout(detectBackgroundBrightness, 400);

    // Debounced scroll handler
    const handleScroll = () => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      scrollTimeout = setTimeout(detectBackgroundBrightness, 500);
    };

    window.addEventListener("scroll", handleScroll, true);

    // Periodic detection (less frequent)
    intervalId = setInterval(detectBackgroundBrightness, 4000);

    return () => {
      if (detectionTimeout) {
        clearTimeout(detectionTimeout);
      }
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      window.removeEventListener("scroll", handleScroll, true);
      clearInterval(intervalId);
    };
  }, [
    isVisible,
    containerPos,
    isDraggingButton,
    isDraggingModel,
    uiConfig?.backgroundDetection?.mode,
  ]);

  /**
   * Sets up audio start callback for updating UI when audio starts playing.
   * SKIP in voice mode - VoiceConversationService owns the callbacks
   */
  useEffect(() => {
    if (isVoiceMode) {
      Logger.log(
        "ChatContainer",
        "Voice mode - skipping TTS event listener setup (VoiceConversationService owns events)",
      );
      return;
    }

    let voiceMonitoringStarted = false;

    const handleAudioStart = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      const { sessionId } = event.detail;
      Logger.log(
        "ChatContainer",
        "Audio started playing for session:",
        sessionId,
      );

      if (sessionId?.startsWith("manual_")) {
        const parts = sessionId.split("_");
        const messageIndex = parseInt(parts[1]);
        if (!isNaN(messageIndex)) {
          setLoadingMessageIndex(null);
          setPlayingMessageIndex(messageIndex);
          currentSessionRef.current = sessionId;
        }
      } else if (sessionId?.startsWith("auto_")) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const messageAtIndex = messages[i];
          if (messageAtIndex?.role === "assistant") {
            setLoadingMessageIndex(null);
            setPlayingMessageIndex(i);
            currentSessionRef.current = sessionId;
            break;
          }
        }
      } else if (sessionId?.startsWith("voice_")) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const messageAtIndex = messages[i];
          if (messageAtIndex?.role === "assistant") {
            setLoadingMessageIndex(null);
            setPlayingMessageIndex(i);
            currentSessionRef.current = sessionId;
            break;
          }
        }

        if (!voiceMonitoringStarted) {
          voiceMonitoringStarted = true;
          Logger.log(
            "ChatContainer",
            "Voice mode detected, VoiceConversationService will handle state",
          );
          // VoiceConversationService handles state transitions via events
        }
      }
    };

    const handleAudioEnd = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      const { sessionId } = event.detail;
      Logger.log(
        "ChatContainer",
        "Audio finished playing for session:",
        sessionId,
      );

      // Always clear playing state when audioEnd fires - it only fires when truly done
      setPlayingMessageIndex(null);
      currentSessionRef.current = null;
    };

    const handleTTSAudioStart = (event: Event) => {
      if (
        !(event instanceof CustomEvent) ||
        !event.detail ||
        typeof event.detail !== "object"
      ) {
        return;
      }
      const detail = event.detail as {
        messageIndex?: number;
        sessionId?: string;
      };
      const { messageIndex, sessionId } = detail;
      if (typeof messageIndex !== "number" || typeof sessionId !== "string") {
        return;
      }
      Logger.log(
        "ChatContainer",
        "Custom TTS audio start event:",
        messageIndex,
        sessionId,
      );
      setLoadingMessageIndex(null);
      setPlayingMessageIndex(messageIndex);
      currentSessionRef.current = sessionId;
    };

    const handleTTSAudioEnd = (event: Event) => {
      if (
        !(event instanceof CustomEvent) ||
        !event.detail ||
        typeof event.detail !== "object"
      ) {
        return;
      }
      const detail = event.detail as { sessionId?: string };
      const { sessionId } = detail;
      if (typeof sessionId !== "string") {
        return;
      }
      Logger.log("ChatContainer", "Custom TTS audio end event:", sessionId);
      if (currentSessionRef.current === sessionId) {
        setPlayingMessageIndex(null);
        currentSessionRef.current = null;
      }
    };

    window.addEventListener("ttsAudioStart", handleTTSAudioStart);
    window.addEventListener("ttsAudioEnd", handleTTSAudioEnd);
    ttsService.addEventListener("audioStart", handleAudioStart);
    ttsService.addEventListener("audioEnd", handleAudioEnd);

    return () => {
      if (!isVoiceMode) {
        ttsService.removeEventListener("audioStart", handleAudioStart);
        ttsService.removeEventListener("audioEnd", handleAudioEnd);
      }
      window.removeEventListener("ttsAudioStart", handleTTSAudioStart);
      window.removeEventListener("ttsAudioEnd", handleTTSAudioEnd);
    };
  }, [messages, setLoadingMessageIndex, setPlayingMessageIndex, isVoiceMode]);

  /**
   * Scrolls to bottom without checking if user is near bottom.
   * Used for: chat open, user sends message.
   */
  const scrollToBottomImmediate = useCallback(() => {
    wasAtChatEndRef.current = true;
    chatVirtualizer.scrollToEnd({ behavior: "instant" });
  }, [chatVirtualizer]);

  /**
   * Keeps the chat pinned to the bottom only when the user was already near the end.
   */
  const scrollToBottomIfPinned = useCallback(() => {
    if (!isVisible || chatItems.length === 0 || !wasAtChatEndRef.current) {
      return;
    }

    chatVirtualizer.scrollToEnd({ behavior: "instant" });
    wasAtChatEndRef.current = true;
  }, [chatItems.length, chatVirtualizer, isVisible]);

  useEffect(() => {
    const scrollElement = scrollRef.current;

    if (!scrollElement) {
      return;
    }

    const updatePinnedState = () => {
      wasAtChatEndRef.current = chatVirtualizer.isAtEnd(
        CHAT_SCROLL_END_THRESHOLD,
      );
    };

    updatePinnedState();
    scrollElement.addEventListener("scroll", updatePinnedState, {
      passive: true,
    });

    return () => {
      scrollElement.removeEventListener("scroll", updatePinnedState);
    };
  }, [chatVirtualizer, currentChatId, isVisible]);

  /**
   * Scroll to bottom immediately when chat opens (from button or history)
   * Uses useLayoutEffect to scroll BEFORE paint to prevent visible jump
   */
  useLayoutEffect(() => {
    if (isVisible && !wasVisibleRef.current && chatItems.length > 0) {
      scrollToBottomImmediate();
    }

    wasVisibleRef.current = isVisible;
  }, [chatItems.length, isVisible, scrollToBottomImmediate]);

  useLayoutEffect(() => {
    if (
      pendingHistoryScrollToEndRef.current &&
      isVisible &&
      chatItems.length > 0
    ) {
      pendingHistoryScrollToEndRef.current = false;
      scrollToBottomImmediate();
    }
  }, [chatItems.length, currentChatId, isVisible, scrollToBottomImmediate]);

  useEffect(() => {
    if (!isVisible || messages.length === 0) {
      return;
    }

    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.role !== "assistant") {
      return;
    }

    const frame = requestAnimationFrame(() => {
      scrollToBottomIfPinned();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [messages, isVisible, scrollToBottomIfPinned]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const handleStreamingWordAdded = () => {
      if (
        !wasAtChatEndRef.current ||
        pendingStreamingScrollFrameRef.current !== null
      ) {
        return;
      }

      pendingStreamingScrollFrameRef.current = requestAnimationFrame(() => {
        pendingStreamingScrollFrameRef.current = null;
        scrollToBottomIfPinned();
      });
    };

    window.addEventListener("streamingWordAdded", handleStreamingWordAdded);

    return () => {
      window.removeEventListener(
        "streamingWordAdded",
        handleStreamingWordAdded,
      );

      if (pendingStreamingScrollFrameRef.current !== null) {
        cancelAnimationFrame(pendingStreamingScrollFrameRef.current);
        pendingStreamingScrollFrameRef.current = null;
      }
    };
  }, [isVisible, scrollToBottomIfPinned]);

  /**
   * Force scroll to bottom when user sends a message
   * Tracks last message to detect when user adds new message
   */
  useEffect(() => {
    if (!isVisible || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.role === "user") {
      setTimeout(() => {
        scrollToBottomImmediate();
      }, 0);
    }
  }, [messages, isVisible, scrollToBottomImmediate]);

  /**
   * Handles copying message content to clipboard.
   */
  const handleCopyMessage = useCallback(
    async (messageIndex: number, content: string) => {
      const success = await UtilService.copyToClipboard(content);
      if (success) {
        setCopiedMessageIndex(messageIndex);
        setTimeout(() => setCopiedMessageIndex(null), 2000);
      }
    },
    [],
  );

  /**
   * Handle rewriting/regenerating AI message
   */
  const handleRewriteMessage = useCallback(
    async (message: ChatMessageLike) => {
      if (message?.id && message?.role === "assistant") {
        try {
          Logger.log("ChatContainer", "Regenerating AI message:", message.id);
          await regenerateAIMessage(message.id);
        } catch (error) {
          Logger.error("ChatContainer", "Failed to regenerate message:", error);
        }
      }
    },
    [regenerateAIMessage],
  );

  /**
   * Handle branch navigation
   */
  const handlePreviousBranch = useCallback(
    (message: ChatMessageLike) => {
      if (message?.id && message?.branchInfo?.canGoBack) {
        previousBranch(message.id);
      }
    },
    [previousBranch],
  );

  const handleNextBranch = useCallback(
    (message: ChatMessageLike) => {
      if (message?.id && message?.branchInfo?.canGoForward) {
        nextBranch(message.id);
      }
    },
    [nextBranch],
  );

  /**
   * Handle close with animation - fade out before actually closing
   */
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      closeChat();
      setIsClosing(false);
    }, 200);
  }, [closeChat]);

  useEffect(() => {
    const handleCloseChatEvent = () => {
      handleClose();
    };

    window.addEventListener("closeChat", handleCloseChatEvent);
    return () => window.removeEventListener("closeChat", handleCloseChatEvent);
  }, [handleClose]);

  /**
   * Handles playing TTS for a message.
   */
  const handlePlayTTS = useCallback(
    async (messageIndex: number, messageContent: string) => {
      let ttsConfig;
      try {
        ttsConfig = await storageService.configLoad(
          "ttsConfig",
          DefaultTTSConfig as TTSConfigLike,
        );
        if (!ttsConfig.enabled || !ttsService.isConfigured()) {
          Logger.warn("ChatContainer", "TTS not enabled or configured");
          return;
        }
      } catch (error) {
        Logger.error("ChatContainer", "Failed to load TTS config:", error);
        return;
      }

      if (playingMessageIndex === messageIndex) {
        ttsService.stopPlayback();
        setPlayingMessageIndex(null);
        setLoadingMessageIndex(null);
        currentSessionRef.current = null;
        return;
      }

      const sessionId = `manual_${messageIndex}_${Date.now()}`;

      setPlayingMessageIndex(null);
      setLoadingMessageIndex(messageIndex);

      ttsService.resumePlayback();

      try {
        const audioUrls = await ttsService.generateChunkedSpeech(
          messageContent,
          null,
          ttsConfig.chunkSize,
          ttsConfig.minChunkSize,
          sessionId,
        );

        if (audioUrls.length === 0) {
          Logger.warn("ChatContainer", "No audio generated");
          setLoadingMessageIndex(null);
          return;
        }

        await ttsService.playAudioSequence(audioUrls, sessionId);

        ttsService.cleanupBlobUrls(audioUrls);
      } catch (error) {
        Logger.error("ChatContainer", "TTS playback failed:", error);
        setLoadingMessageIndex(null);
        setPlayingMessageIndex(null);
        currentSessionRef.current = null;
      }
    },
    [playingMessageIndex, setPlayingMessageIndex, setLoadingMessageIndex],
  );

  if (!isVisible) return null;

  if (modelDisabled && !buttonInitializedRef.current) return null;

  if (!modelDisabled && containerPos.x === 0 && containerPos.y === 0)
    return null;

  const ttsEnabled = ttsConfig.enabled;
  const customHeaderActions = reactCustomizations.renderHeaderActions?.({
    hostId,
  });
  const customFooterContent = reactCustomizations.renderFooterContent?.({
    hostId,
  });
  const customEmptyState = reactCustomizations.renderEmptyState?.({
    hostId,
  });
  const settingsLabel = getBrandedLabel(
    embedConfig,
    "chat.action.settings",
    "Settings",
  );
  const historyLabel = getBrandedLabel(
    embedConfig,
    "chat.action.history",
    "Chat history",
  );
  const stopLabel = getBrandedLabel(
    embedConfig,
    "chat.action.stop",
    "Stop generation",
  );
  const newChatLabel = getBrandedLabel(
    embedConfig,
    "chat.action.new",
    "Start new chat",
  );
  const closeLabel = getBrandedLabel(
    embedConfig,
    "chat.action.close",
    "Close chat",
  );
  const showCharacterLabel = getBrandedLabel(
    embedConfig,
    "chat.action.showCharacter",
    "Show character",
  );
  const hideCharacterLabel = getBrandedLabel(
    embedConfig,
    "chat.action.hideCharacter",
    "Hide character",
  );
  const tempEnabledLabel = getBrandedLabel(
    embedConfig,
    "chat.action.tempEnable",
    "Enable temp mode - chat won't be saved",
  );
  const tempDisabledLabel = getBrandedLabel(
    embedConfig,
    "chat.action.tempDisable",
    "Disable temp mode - chat will be saved",
  );
  const emptyStateDescription = getBrandedLabel(
    embedConfig,
    "chat.emptyState.description",
    "Type a message below to begin chatting with your AI assistant",
  );
  const androidChatInputHeight =
    chatInputRef?.current?.getBoundingClientRect().height || 140;
  const androidContainerHeight = Math.max(
    320,
    window.innerHeight - ANDROID_CHAT_TOP_OFFSET - androidChatInputHeight + 40,
  );

  return (
    <>
      {/* Debug markers for background detection */}
      {debugMarkers.map((marker, index) => (
        <div
          key={index}
          style={{
            position: "fixed",
            left: `${marker.x - 8}px`,
            top: `${marker.y - 8}px`,
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            backgroundColor: marker.color,
            border: "2px solid white",
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
            zIndex: 9999,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "8px",
            fontWeight: "bold",
            color: "white",
            textShadow: "0 1px 2px rgba(0,0,0,0.8)",
          }}
          title={`Brightness: ${marker.brightness} | Alpha: ${marker.alpha} | Element: ${marker.element}`}
        >
          {marker.brightness}
        </div>
      ))}

      <div
        ref={containerRef}
        data-electron-interactive="true"
        style={{
          position: "fixed",
          left: `${containerPos.x}px`,
          top: isAndroid
            ? `${ANDROID_CHAT_TOP_OFFSET}px`
            : `${containerPos.y}px`,
          height: isAndroid ? `${androidContainerHeight}px` : undefined,
          maxHeight: isAndroid ? `${androidContainerHeight}px` : undefined,
          zIndex: 9999,
          borderColor: isDragOver
            ? "rgba(59, 130, 246, 0.6)"
            : isDraggingButton || isDraggingModel
              ? "rgba(255, 255, 255, 0.4)"
              : "transparent",
          boxShadow: isDragOver
            ? "0 4px 20px rgba(59, 130, 246, 0.3)"
            : isDraggingButton || isDraggingModel
              ? "0 4px 20px rgba(255, 255, 255, 0.2)"
              : "none",
        }}
        className="flex flex-col-reverse gap-3 w-[calc(100vw-16px)] max-w-[400px] h-[500px] rounded-[10px] border-2 p-[5px]"
      >
        {/* Drag overlay indicator - always rendered, visibility controlled by opacity */}
        <div
          className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center rounded-3xl"
          style={{
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            backgroundColor: "rgba(0, 0, 0, 0.1)",
            opacity: isDragOver ? 1 : 0,
            visibility: isDragOver ? "visible" : "hidden",
            transition:
              "opacity 200ms ease-in-out, visibility 200ms ease-in-out",
          }}
        >
          <div
            className={cn(
              "glass-container",
              isLightBackground && "glass-container-dark",
              "px-6 py-2 md:py-4 rounded-xl border-2 border-dashed border-blue-400/50",
            )}
            style={{
              transform: isDragOver ? "scale(1)" : "scale(0.95)",
              transition: "transform 200ms ease-in-out",
            }}
          >
            <p
              className={cn(
                isLightBackground ? "glass-text" : "glass-text-black",
                "text-lg font-medium flex items-center gap-2",
              )}
            >
              <Icon name="attachment" size={20} /> Drop
            </p>
          </div>
        </div>

        {customHeaderActions ? (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
            {customHeaderActions}
          </div>
        ) : null}

        {/* Action buttons at BOTTOM - reorganized: left/center/right layout */}
        <div className="relative flex items-center justify-between gap-2 pb-1">
          {/* LEFT: Settings + History */}
          <div className="flex items-center gap-2">
            {settingsEnabled ? (
              <Button
                onClick={() => {
                  setIsQuickPanelOpen(false);
                  setIsHistoryPanelOpen(false);
                  setIsSettingsPanelOpen(!isSettingsPanelOpen);
                }}
                size="icon"
                variant={isLightBackground ? "dark" : "default"}
                className={isClosing ? "animate-fade-out" : "animate-fade-in"}
                title={settingsLabel}
                aria-label="Settings"
                data-testid="settings-toggle-button"
              >
                <span
                  className={cn(
                    isLightBackground ? "glass-text" : "glass-text-black",
                    "text-base leading-none flex items-center justify-center",
                  )}
                >
                  <Icon name="settings" size={16} />
                </span>
              </Button>
            ) : null}

            {historyEnabled ? (
              <Button
                onClick={() => {
                  setIsQuickPanelOpen(false);
                  setIsSettingsPanelOpen(false);
                  setIsHistoryPanelOpen(!isHistoryPanelOpen);
                }}
                size="icon"
                variant={isLightBackground ? "dark" : "default"}
                className={isClosing ? "animate-fade-out" : "animate-fade-in"}
                title={historyLabel}
                aria-label="Chat history"
              >
                <span
                  className={cn(
                    isLightBackground ? "glass-text" : "glass-text-black",
                    "text-lg leading-none flex items-center justify-center",
                  )}
                >
                  <Icon name="history" size={16} />
                </span>
              </Button>
            ) : null}
          </div>

          {/* CENTER: Stop + Add Chat + Close (grouped) */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleStopGeneration}
              disabled={
                !isGenerating && !isSpeaking && loadingMessageIndex === null
              }
              size="icon"
              variant={
                isGenerating || isSpeaking || loadingMessageIndex !== null
                  ? "error"
                  : isLightBackground
                    ? "dark"
                    : "default"
              }
              className={isClosing ? "animate-fade-out" : "animate-fade-in"}
              title={
                isGenerating
                  ? stopLabel
                  : isSpeaking || loadingMessageIndex !== null
                    ? "Stop TTS"
                    : "Nothing to stop"
              }
            >
              <span
                className={cn(
                  isLightBackground ? "glass-text" : "glass-text-black",
                  "text-lg leading-none flex items-center justify-center",
                )}
              >
                <Icon name="stop" size={16} />
              </span>
            </Button>

            <Button
              onClick={clearChat}
              size="icon"
              variant={isLightBackground ? "dark" : "default"}
              className={isClosing ? "animate-fade-out" : "animate-fade-in"}
              title={newChatLabel}
            >
              <span
                className={cn(
                  isLightBackground ? "glass-text" : "glass-text-black",
                  "text-lg leading-none flex items-center justify-center",
                )}
              >
                <Icon name="add" size={18} />
              </span>
            </Button>

            {!modelDisabled && (
              <Button
                onClick={handleClose}
                size="icon"
                variant={isLightBackground ? "dark" : "default"}
                className={isClosing ? "animate-fade-out" : "animate-fade-in"}
                title={closeLabel}
              >
                <span
                  className={cn(
                    isLightBackground ? "glass-text" : "glass-text-black",
                    "text-sm leading-none flex items-center justify-center",
                  )}
                >
                  <Icon name="close" size={16} />
                </span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {liveAssistantEnabled ? (
              <Button
                onClick={() =>
                  updateUIConfig(
                    "enableModelLoading",
                    !uiConfig.enableModelLoading,
                  )
                }
                size="icon"
                variant={isLightBackground ? "dark" : "default"}
                className={isClosing ? "animate-fade-out" : "animate-fade-in"}
                title={
                  uiConfig.enableModelLoading
                    ? hideCharacterLabel
                    : showCharacterLabel
                }
              >
                <span
                  className={cn(
                    isLightBackground ? "glass-text" : "glass-text-black",
                    "text-lg leading-none flex items-center justify-center",
                  )}
                >
                  <Icon
                    name={uiConfig.enableModelLoading ? "eye-off" : "eye"}
                    size={18}
                  />
                </span>
              </Button>
            ) : null}

            {historyEnabled ? (
              <Button
                onClick={() => setIsTempChat(!isTempChat)}
                size="icon"
                variant={
                  isTempChat
                    ? "default"
                    : isLightBackground
                      ? "dark"
                      : "default"
                }
                className={cn(
                  isTempChat &&
                    (isLightBackground
                      ? "bg-yellow-300/40 border-yellow-400/60"
                      : "bg-yellow-500/40 border-yellow-500/60"),
                  isClosing ? "animate-fade-out" : "animate-fade-in",
                )}
                title={isTempChat ? tempDisabledLabel : tempEnabledLabel}
              >
                <span
                  className={cn(
                    isLightBackground ? "glass-text" : "glass-text-black",
                    "text-lg leading-none flex items-center justify-center",
                  )}
                >
                  <Icon name={isTempChat ? "star" : "pin"} size={18} />
                </span>
              </Button>
            ) : null}
          </div>
        </div>

        {customFooterContent ? (
          <div className="relative z-10 px-1">{customFooterContent}</div>
        ) : null}

        {/* Messages container */}
        <div
          ref={messagesContainerRef}
          className="flex-1 relative overflow-hidden"
          style={
            isDesktop
              ? {
                  maskImage:
                    "linear-gradient(to bottom, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)",
                }
              : undefined
          }
        >
          {!(isDesktop || isAndroid) && (
            <div
              className={cn(
                "absolute top-0 left-0 right-0 h-[10px] rounded-t-[10px] rounded-b-[1px] z-10 pointer-events-none glass-message",
                isLightBackground && "glass-message-dark",
                isClosing ? "animate-fade-out" : "animate-fade-in",
              )}
            />
          )}

          {!(isDesktop || isAndroid) && (
            <div
              className={cn(
                "absolute bottom-0 left-0 right-0 h-[10px] rounded-t-[1px] rounded-b-[10px] z-10 pointer-events-none glass-message",
                isLightBackground && "glass-message-dark",
                isClosing ? "animate-fade-out" : "animate-fade-in",
              )}
            />
          )}

          {/* Scrollable messages */}
          <div
            ref={scrollRef}
            className="absolute inset-0 overflow-y-auto scrollbar-glass hover-scrollbar scroll-smooth"
          >
            {messages.length === 0 ? (
              customEmptyState ? (
                <div className="flex flex-col items-center justify-center h-full gap-6">
                  {customEmptyState}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-6">
                  <div
                    className={cn(
                      "glass-container",
                      isLightBackground && "glass-container-dark",
                      "px-10 py-8 rounded-3xl max-w-md flex flex-col justify-center items-center text-center",
                      isClosing ? "animate-fade-out" : "animate-fade-in",
                    )}
                  >
                    <div className="w-full flex justify-center items-center text-6xl mb-4">
                      <Icon name="chat" size={18} />
                    </div>
                    <p
                      className={cn(
                        isLightBackground ? "glass-text" : "glass-text-black",
                        "text-sm opacity-70",
                      )}
                    >
                      {emptyStateDescription}
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div
                style={{
                  height: `${chatVirtualizer.getTotalSize()}px`,
                  position: "relative",
                  width: "100%",
                }}
              >
                {virtualChatItems.map((virtualItem) => {
                  const item = chatItems[virtualItem.index];

                  if (!item) {
                    return null;
                  }

                  if (item.kind === "loading") {
                    return (
                      <div
                        key={virtualItem.key}
                        ref={chatVirtualizer.measureElement}
                        data-index={virtualItem.index}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <div className="flex flex-col gap-3 animate-slide-left-up">
                          <div className="flex flex-col items-start">
                            <div className="flex items-start gap-2 max-w-[80%]">
                              <div className="flex flex-col gap-1.5">
                                <div
                                  className={cn(
                                    "glass-message",
                                    isLightBackground && "glass-message-dark",
                                    "px-2 md:px-4 py-2 md:py-3 rounded-[20px] rounded-tl-md flex items-center justify-center",
                                  )}
                                >
                                  <div className="loading-dots">
                                    <span className="loading-dot"></span>
                                    <span className="loading-dot"></span>
                                    <span className="loading-dot"></span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const shouldAnimateThis =
                    item.isLastUserMessage &&
                    lastAnimatedMessageIdRef.current !== item.message.id;

                  if (shouldAnimateThis) {
                    lastAnimatedMessageIdRef.current = item.message.id;
                  }

                  return (
                    <div
                      key={virtualItem.key}
                      ref={chatVirtualizer.measureElement}
                      data-index={virtualItem.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <ChatMessage
                        message={item.message}
                        messageIndex={item.messageIndex}
                        isLightBackground={isLightBackground}
                        ttsEnabled={ttsEnabled}
                        playingMessageIndex={playingMessageIndex}
                        loadingMessageIndex={loadingMessageIndex}
                        copiedMessageIndex={copiedMessageIndex}
                        isStreamingMessage={
                          isGenerating && item.isLastAIMessage
                        }
                        currentSessionRef={currentSessionRef}
                        smoothStreamingAnimation={
                          uiConfig?.smoothStreamingAnimation || false
                        }
                        shouldAnimate={shouldAnimateThis}
                        onCopyMessage={handleCopyMessage}
                        onPlayTTS={handlePlayTTS}
                        onEditUserMessage={editUserMessage}
                        onRewriteMessage={handleRewriteMessage}
                        onPreviousBranch={handlePreviousBranch}
                        onNextBranch={handleNextBranch}
                        setLoadingMessageIndex={setLoadingMessageIndex}
                        setPlayingMessageIndex={setPlayingMessageIndex}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Settings Panel - renders inside ChatContainer */}
        {settingsEnabled && isQuickPanelOpen && (
          <div className="absolute inset-0 z-10">
            <QuickAccessPanel
              onClose={handleQuickPanelClose}
              isLightBackground={isLightBackground}
              embedConfig={embedConfig}
              animationClass={
                isQuickPanelClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              onOpenSettings={(options) => {
                setRequestedSettingsView(options ?? {});
                setIsQuickPanelOpen(false);
                setIsHistoryPanelOpen(false);
                setIsSettingsPanelOpen(true);
              }}
            />
          </div>
        )}

        {/* Settings Panel - renders inside ChatContainer */}
        {settingsEnabled && isSettingsPanelOpen && (
          <div className="absolute inset-0 z-10">
            <SettingsPanel
              onClose={handleSettingsPanelClose}
              isLightBackground={isLightBackground}
              embedConfig={embedConfig}
              requestedView={requestedSettingsView}
              onActiveTargetChange={setActiveSettingsTarget}
              animationClass={
                isSettingsPanelClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              onRequestDeleteModelDialog={handleRequestDeleteModelDialog}
              onRequestDeleteMotionDialog={handleRequestDeleteMotionDialog}
              onRequestDeleteStageDialog={handleRequestDeleteStageDialog}
              onRequestDeleteEmoteDialog={handleRequestDeleteEmoteDialog}
              onRequestDeleteVoiceDialog={handleRequestDeleteVoiceDialog}
              onRequestDeleteLLMModel={handleRequestDeleteLLMModel}
              onRequestDeleteSttModel={handleRequestDeleteSttModel}
              onRequestDeleteTtsPack={handleRequestDeleteTtsPack}
              sttExternalDeleteTick={sttExternalDeleteTick}
              ttsExternalDeleteTick={ttsExternalDeleteTick}
              onRequestResetSetupDialog={handleRequestResetSetupDialog}
              onRequestSettingsErrorDialog={handleRequestSettingsErrorDialog}
              refreshTrigger={settingsRefreshTrigger}
            />
          </div>
        )}

        {/* Chat History Panel - renders inside ChatContainer */}
        {historyEnabled && isHistoryPanelOpen && (
          <div className="absolute inset-0 z-10">
            <TypedChatHistoryPanel
              isLightBackground={isLightBackground}
              onClose={handleHistoryClose}
              onSelectChat={handleSelectChat}
              onRequestEditDialog={handleRequestEditDialog}
              onRequestDeleteDialog={handleRequestDeleteDialog}
              refreshTrigger={historyRefreshTrigger}
              animationClass={
                isHistoryPanelClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
            />
          </div>
        )}

        {/* Edit Dialog - renders outside ChatHistoryPanel to avoid backdrop-filter issues */}
        {editingChatId && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="edit"
              title="Edit Chat Title"
              message=""
              itemId={editingChatId}
              initialValue={editingChatTitle}
              inputPlaceholder="Enter new title..."
              inputMaxLength={100}
              isLightBackground={isLightBackground}
              animationClass={
                isEditDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="Save"
              onConfirm={handleEditDialogSave}
              onCancel={handleEditDialogCancel}
            />
          </div>
        )}

        {/* Delete Dialog - renders outside ChatHistoryPanel to avoid backdrop-filter issues */}
        {deletingChatId && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="delete"
              title="Delete Chat?"
              message="This will permanently delete this chat and all associated messages, images, and audio files. This cannot be undone."
              itemId={deletingChatId}
              isLightBackground={isLightBackground}
              animationClass={
                isDeleteDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="Delete"
              confirmStyle="error"
              onConfirm={handleDeleteDialogConfirm}
              onCancel={handleDeleteDialogCancel}
            />
          </div>
        )}

        {/* Model Delete Dialog - renders outside SettingsPanel */}
        {deletingModelId && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="delete"
              title="Delete Model?"
              message="This will permanently delete this custom model. This cannot be undone."
              itemId={deletingModelId}
              isLightBackground={isLightBackground}
              animationClass={
                isDeleteModelDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="Delete"
              confirmStyle="error"
              onConfirm={handleDeleteModelConfirm}
              onCancel={handleDeleteModelCancel}
            />
          </div>
        )}

        {/* Motion Delete Dialog - renders outside SettingsPanel */}
        {deletingMotionId && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="delete"
              title="Delete Animation?"
              message="This will permanently delete this custom animation. This cannot be undone."
              itemId={deletingMotionId}
              isLightBackground={isLightBackground}
              animationClass={
                isDeleteMotionDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="Delete"
              confirmStyle="error"
              onConfirm={handleDeleteMotionConfirm}
              onCancel={handleDeleteMotionCancel}
            />
          </div>
        )}

        {/* Stage Delete Dialog - renders outside SettingsPanel */}
        {deletingStageId && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="delete"
              title="Delete Stage?"
              message="This will permanently delete this stage. This cannot be undone."
              itemId={deletingStageId}
              isLightBackground={isLightBackground}
              animationClass={
                isDeleteStageDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="Delete"
              confirmStyle="error"
              onConfirm={handleDeleteStageConfirm}
              onCancel={handleDeleteStageCancel}
            />
          </div>
        )}

        {/* Emote Delete Dialog - renders outside SettingsPanel */}
        {(deletingEmoteId || deletingEmoteCategory) && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="delete"
              title={deletingEmoteCategory ? "Delete Emotes?" : "Delete Emote?"}
              message={
                deletingEmoteCategory
                  ? deletingEmoteCategory === "all"
                    ? "Delete all emotes? This cannot be undone."
                    : `Delete all emotes in category "${deletingEmoteCategory}"? This cannot be undone.`
                  : "This will permanently delete this emote. This cannot be undone."
              }
              itemId={deletingEmoteId || deletingEmoteCategory || "emotes"}
              isLightBackground={isLightBackground}
              animationClass={
                isDeleteEmoteDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="Delete"
              confirmStyle="error"
              onConfirm={handleDeleteEmoteConfirm}
              onCancel={handleDeleteEmoteCancel}
            />
          </div>
        )}

        {/* Voice Delete Dialog - renders outside SettingsPanel */}
        {deletingVoiceId && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="delete"
              title="Delete Voice?"
              message="This will permanently delete this reference voice. This cannot be undone."
              itemId={deletingVoiceId}
              isLightBackground={isLightBackground}
              animationClass={
                isDeleteVoiceDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="Delete"
              confirmStyle="error"
              onConfirm={handleDeleteVoiceConfirm}
              onCancel={handleDeleteVoiceCancel}
            />
          </div>
        )}

        {/* LLM Model Delete Dialog - renders outside SettingsPanel */}
        {deletingLLMModel && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="delete"
              title="Delete Model?"
              message={`This will permanently delete "${deletingLLMModel}". This cannot be undone.`}
              itemId={deletingLLMModel}
              isLightBackground={isLightBackground}
              animationClass={
                isDeleteLLMModelDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="Delete"
              confirmStyle="error"
              onConfirm={handleDeleteLLMModelConfirm}
              onCancel={handleDeleteLLMModelCancel}
            />
          </div>
        )}

        {/* STT Model Delete Dialog - renders outside SettingsPanel */}
        {deletingSttModelId && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="delete"
              title="Delete Model?"
              message="This will delete this STT model and free up storage on your device. The model can be re-downloaded later if needed."
              itemId={deletingSttModelId}
              isLightBackground={isLightBackground}
              animationClass={
                isDeleteSttModelDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="Delete"
              confirmStyle="error"
              onConfirm={handleDeleteSttModelConfirm}
              onCancel={handleDeleteSttModelCancel}
            />
          </div>
        )}

        {/* TTS Voice Pack Delete Dialog - renders outside SettingsPanel */}
        {deletingTtsPackId && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="delete"
              title="Delete Voice Pack?"
              message="This will delete this voice pack and free up storage on your device. The voice pack can be re-downloaded later if needed."
              itemId={deletingTtsPackId}
              isLightBackground={isLightBackground}
              animationClass={
                isDeleteTtsPackDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="Delete"
              confirmStyle="error"
              onConfirm={handleDeleteTtsPackConfirm}
              onCancel={handleDeleteTtsPackCancel}
            />
          </div>
        )}

        {/* Settings Confirm Dialog - renders outside SettingsPanel */}
        {pendingSettingsConfirmAction && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="confirm"
              title="Reset Setup Wizard?"
              message="This will reset the setup wizard and take you back to the beginning."
              itemId="settings-reset-setup"
              isLightBackground={isLightBackground}
              animationClass={
                isSettingsConfirmDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="Reset"
              confirmStyle="error"
              onConfirm={handleSettingsConfirmConfirm}
              onCancel={handleSettingsConfirmCancel}
            />
          </div>
        )}

        {/* Settings Error Dialog - renders outside SettingsPanel */}
        {settingsErrorMessage && (
          <div className="absolute inset-0 z-20">
            <TypedDialog
              type="confirm"
              title="Error"
              message={settingsErrorMessage}
              itemId="settings-error"
              isLightBackground={isLightBackground}
              animationClass={
                isSettingsErrorDialogClosing
                  ? "animate-fade-out"
                  : "animate-slide-up-fade-in"
              }
              confirmLabel="OK"
              onConfirm={handleSettingsErrorClose}
              onCancel={handleSettingsErrorClose}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default ChatContainer;
