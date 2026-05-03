/**
 * AppContext
 * Centralized application state management
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import type * as React from "react";
import ChatService from "../services/ChatService";
import type {
  ChatNode,
  FlatChatMessage,
  ChatMessageInput,
  ChatRole,
  ExportedChatTree,
} from "../services/ChatService";
import {
  AIServiceProxy,
  TTSServiceProxy,
  StorageServiceProxy,
  SummarizerServiceProxy,
  TranslatorServiceProxy,
  LanguageDetectorServiceProxy,
  RewriterServiceProxy,
  WriterServiceProxy,
} from "../services/proxies";
import VoiceConversationService, {
  ConversationStates,
} from "../services/VoiceConversationService";
import chatHistoryService from "../services/ChatHistoryService";
import Logger from "../services/LoggerService";
import { useDesktop } from "./DesktopContext";
import { isDesktop, isInputWindow } from "../utils/PlatformUtils";
import type {
  PositionManagerLike,
  SavedModelPositionLike,
  SceneWithMetadata,
} from "../babylon/types";
import type { AssistantHandle } from "../types/assistant";

interface ChatMessageItem {
  id: string;
  role: string;
  content: string;
  images?: string[];
  audios?: string[];
  [key: string]: string | number | boolean | null | undefined | object;
}

interface AppPositionManager extends PositionManagerLike {
  applyPreset: (
    preset: string,
    options?: { modelSizePx?: { width: number; height: number } },
  ) => void;
}

interface UIConfigState {
  [key: string]: string | number | boolean | null | undefined | object;
  enableModelLoading?: boolean;
  shortcuts?: {
    enabled?: boolean;
    openChat?: string;
    toggleMode?: string;
    toggleVisibility?: string;
  };
}

interface AIConfigState {
  [key: string]: string | number | boolean | null | undefined | object;
  provider?: string;
  aiFeatures?: {
    translator?: { enabled?: boolean; defaultTargetLanguage?: string };
    languageDetector?: { enabled?: boolean };
    summarizer?: {
      enabled?: boolean;
      defaultType?: string;
      defaultFormat?: string;
      defaultLength?: string;
    };
    rewriter?: { enabled?: boolean };
    writer?: { enabled?: boolean };
  };
}

type HistoryMessage = {
  role?: string;
  content?: string;
  images?: Array<string | Blob | File>;
  audios?: Array<string | Blob | File>;
};

type PendingDropValue =
  | string
  | number
  | boolean
  | Blob
  | File
  | null
  | undefined
  | Array<string | number | boolean | Blob | File | null>;
type PendingDropData = Record<string, PendingDropValue>;
type ChatHistorySelection = { chatId: string };

type HistoryTreePrimitive = string | number | boolean | null | Blob | File;
type HistoryTreeValue =
  | HistoryTreePrimitive
  | HistoryTreePrimitive[]
  | HistoryTreeNode
  | HistoryTreeNode[]
  | { [key: string]: HistoryTreeValue };

type HistoryTreeNode = {
  branches?: HistoryTreeNode[];
  images?: Array<string | Blob>;
  audios?: Array<string | Blob>;
  [key: string]: HistoryTreeValue;
};

type HistoryTreeData = {
  tree?: HistoryTreeNode;
  [key: string]: HistoryTreeValue;
};

const normalizeHistoryTreeNode = (node: ChatNode): HistoryTreeNode => {
  const normalized: HistoryTreeNode = {};

  for (const [key, value] of Object.entries(node)) {
    if (
      key === "images" ||
      key === "audios" ||
      key === "branches" ||
      value === undefined
    ) {
      continue;
    }
    normalized[key] = value;
  }

  if (Array.isArray(node.images)) {
    const images = node.images.filter(
      (value): value is string | Blob =>
        typeof value === "string" || value instanceof Blob,
    );
    if (images.length > 0) {
      normalized.images = images;
    } else {
      delete normalized.images;
    }
  }

  if (Array.isArray(node.audios)) {
    const audios = node.audios.filter(
      (value): value is string | Blob =>
        typeof value === "string" || value instanceof Blob,
    );
    if (audios.length > 0) {
      normalized.audios = audios;
    } else {
      delete normalized.audios;
    }
  }

  if (Array.isArray(node.branches)) {
    normalized.branches = node.branches.map((branch) =>
      normalizeHistoryTreeNode(branch),
    );
  }

  return normalized;
};

const toChatMessageItems = (messages: FlatChatMessage[]): ChatMessageItem[] => {
  return messages.map((message, index) => {
    const images = Array.isArray(message.images)
      ? message.images.filter(
          (value): value is string => typeof value === "string",
        )
      : undefined;
    const audios = Array.isArray(message.audios)
      ? message.audios.filter(
          (value): value is string => typeof value === "string",
        )
      : undefined;

    const base: ChatMessageItem = {
      id: message.id || `msg_${index}`,
      role: message.role || "user",
      content: message.content || "",
      timestamp: message.timestamp,
      parentId: message.parentId,
      branchInfo: message.branchInfo,
      imageFileIds: message.imageFileIds,
      audioFileIds: message.audioFileIds,
    };

    if (images && images.length > 0) {
      base.images = images;
    }
    if (audios && audios.length > 0) {
      base.audios = audios;
    }

    return base;
  });
};

const toAIConversation = (messages: ChatMessageItem[]) => {
  return messages.map((message) => ({
    role: message.role as ChatRole,
    content: message.content,
    ...(message.images && message.images.length > 0
      ? { images: message.images }
      : {}),
    ...(message.audios && message.audios.length > 0
      ? { audios: message.audios }
      : {}),
  }));
};

const toChatMessageInputsFromHistory = (
  messages: HistoryMessage[],
): ChatMessageInput[] => {
  return messages.map((message) => {
    const roleValue = message.role;
    const role: ChatRole =
      roleValue === "assistant" || roleValue === "system" ? roleValue : "user";
    return {
      role,
      content: message.content || "",
      ...(Array.isArray(message.images) ? { images: message.images } : {}),
      ...(Array.isArray(message.audios) ? { audios: message.audios } : {}),
    };
  });
};

interface AppContextValue {
  isAssistantReady: boolean;
  isChatUIReady: boolean;
  enableModelLoading: boolean | null;
  assistantRef: React.MutableRefObject<AssistantHandle | null>;
  sceneRef: React.MutableRefObject<SceneWithMetadata | null>;
  positionManagerRef: React.MutableRefObject<AppPositionManager | null>;
  handleAssistantReady: (payload: {
    animationManager: object | null;
    positionManager: AppPositionManager | null;
    scene: SceneWithMetadata;
  }) => void;
  setIsAssistantReady: React.Dispatch<React.SetStateAction<boolean>>;
  setIsChatUIReady: React.Dispatch<React.SetStateAction<boolean>>;

  isChatInputVisible: boolean;
  isChatContainerVisible: boolean;
  chatMessages: ChatMessageItem[];
  isProcessing: boolean;
  currentChatId: string | null;
  isTempChat: boolean;
  pendingDropData: PendingDropData | null;

  setIsChatInputVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setIsChatContainerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessageItem[]>>;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentChatId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsTempChat: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingDropData: React.Dispatch<
    React.SetStateAction<PendingDropData | null>
  >;

  isVoiceMode: boolean;
  isSpeaking: boolean;
  setIsVoiceMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;

  isSettingsPanelOpen: boolean;
  isHistoryPanelOpen: boolean;
  setIsSettingsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsHistoryPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;

  playingMessageIndex: number | null;
  loadingMessageIndex: number | null;
  setPlayingMessageIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setLoadingMessageIndex: React.Dispatch<React.SetStateAction<number | null>>;

  isDraggingButton: boolean;
  isDraggingModel: boolean;
  isDragOverChat: boolean;
  setIsDraggingButton: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDraggingModel: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDragOverChat: React.Dispatch<React.SetStateAction<boolean>>;

  buttonPosition: { x: number; y: number };
  setButtonPosition: React.Dispatch<
    React.SetStateAction<{ x: number; y: number }>
  >;

  modelOverlayPos: { x: number; y: number; width: number; height: number };
  setModelOverlayPos: React.Dispatch<
    React.SetStateAction<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>
  >;
  showModelLoadingOverlay: boolean;
  setShowModelLoadingOverlay: React.Dispatch<React.SetStateAction<boolean>>;

  savedModelPosition: SavedModelPositionLike | null;
  setSavedModelPosition: React.Dispatch<
    React.SetStateAction<SavedModelPositionLike | null>
  >;

  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  clearChat: () => Promise<void>;
  stopGeneration: () => void;
  loadChatFromHistory: (chatData: ChatHistorySelection) => Promise<void>;
  updateChatMessages: (messages: ChatMessageItem[]) => void;

  editUserMessage: (
    messageId: string,
    newContent: string,
    newImages?: string[] | null,
    newAudios?: string[] | null,
  ) => Promise<void>;
  regenerateAIMessage: (messageId: string) => Promise<void>;
  switchToBranch: (parentId: string, branchIndex: number) => void;
  previousBranch: (messageId: string) => void;
  nextBranch: (messageId: string) => void;
  regenerateWithStreamingRef: React.MutableRefObject<
    (() => Promise<void>) | null
  >;
  editWithStreamingRef: React.MutableRefObject<
    ((messageId: string) => Promise<void>) | null
  >;

  startButtonDrag: () => void;
  endButtonDrag: () => void;
  startModelDrag: () => void;
  endModelDrag: () => void;
  updateButtonPosition: React.Dispatch<
    React.SetStateAction<{ x: number; y: number }>
  >;

  toggleSettingsPanel: () => void;
  toggleHistoryPanel: () => void;

  handleSummarize: (text: string) => Promise<string>;
  handleTranslate: (
    text: string,
    sourceLanguage: string,
    targetLanguageOverride?: string,
  ) => Promise<string>;
  handleAddToChat: (data: PendingDropData | null, autoSend?: boolean) => void;

  sceneKey: number;
  reloadScene: () => void;
  forceChatOnlyMode: (reason?: string) => void;

  uiConfig: UIConfigState | null;
  aiConfig: AIConfigState | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
};

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const { api } = useDesktop();
  const hasNotifiedFrontendReadyRef = useRef(false);

  // ========================================
  // ASSISTANT STATE
  // ========================================
  const [isAssistantReady, setIsAssistantReady] = useState(false);
  const [isChatUIReady, setIsChatUIReady] = useState(false);
  const [enableModelLoading, setEnableModelLoading] = useState<boolean | null>(
    null,
  );
  const assistantRef = useRef<AssistantHandle | null>(null);
  const sceneRef = useRef<SceneWithMetadata | null>(null);
  const positionManagerRef = useRef<AppPositionManager | null>(null);

  // ========================================
  // CONFIG STATE
  // ========================================
  const [uiConfig, setUIConfig] = useState<UIConfigState | null>(null);
  const [aiConfig, setAIConfig] = useState<AIConfigState | null>(null);

  // ========================================
  // CHAT UI STATE
  // ========================================
  const [isChatInputVisible, setIsChatInputVisible] = useState(false);
  const [isChatContainerVisible, setIsChatContainerVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isTempChat, setIsTempChat] = useState(false);
  const [pendingDropData, setPendingDropData] =
    useState<PendingDropData | null>(null);

  // ========================================
  // VOICE & TTS STATE
  // ========================================
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ========================================
  // PANEL STATE
  // ========================================
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);

  // ========================================
  // MESSAGE PLAYBACK STATE
  // ========================================
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(
    null,
  );
  const [loadingMessageIndex, setLoadingMessageIndex] = useState<number | null>(
    null,
  );

  // ========================================
  // DRAG STATE
  // ========================================
  const [isDraggingButton, setIsDraggingButton] = useState(false);
  const [isDraggingModel, setIsDraggingModel] = useState(false);
  const [isDragOverChat, setIsDragOverChat] = useState(false);

  // ========================================
  // POSITION STATE (for chat-only mode)
  // ========================================
  const [buttonPosition, setButtonPosition] = useState({ x: -100, y: -100 });

  // ========================================
  // MODEL OVERLAY STATE
  // ========================================
  const [modelOverlayPos, setModelOverlayPos] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [showModelLoadingOverlay, setShowModelLoadingOverlay] = useState(false);

  // ========================================
  // SAVED MODEL POSITION (for tab visibility unmount/remount)
  // ========================================
  const [savedModelPosition, setSavedModelPosition] =
    useState<SavedModelPositionLike | null>(null);

  // ========================================
  // SCENE RELOAD STATE
  // ========================================
  const [sceneKey, setSceneKey] = useState(0);

  // ========================================
  // ASSISTANT INITIALIZATION
  // ========================================

  // Load configs on mount
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        // Load UI config
        const loadedUIConfigRaw =
          await StorageServiceProxy.configLoad("uiConfig");
        const loadedUIConfig =
          loadedUIConfigRaw && typeof loadedUIConfigRaw === "object"
            ? (loadedUIConfigRaw as UIConfigState)
            : { enableModelLoading: true };
        Logger.log("AppContext", "UI Config loaded:", loadedUIConfig);
        setUIConfig(loadedUIConfig);
        setEnableModelLoading(loadedUIConfig.enableModelLoading ?? true);

        // Load AI config
        const loadedAIConfigRaw =
          await StorageServiceProxy.configLoad("aiConfig");
        const loadedAIConfig =
          loadedAIConfigRaw && typeof loadedAIConfigRaw === "object"
            ? (loadedAIConfigRaw as AIConfigState)
            : {};
        Logger.log("AppContext", "AI Config loaded:", loadedAIConfig);
        setAIConfig(loadedAIConfig);

        // Configure services (only if provider is set)
        try {
          if (loadedAIConfig.provider) {
            await AIServiceProxy.configure(loadedAIConfig);
            Logger.log("AppContext", "AI Service configured");
          } else {
            Logger.log(
              "AppContext",
              "Skipping AI Service configuration - no provider set",
            );
          }

          // Configure AI Features services if enabled (only if we have a provider)
          if (loadedAIConfig.provider) {
            if (loadedAIConfig.aiFeatures?.translator?.enabled !== false) {
              await TranslatorServiceProxy.configure(loadedAIConfig);
              Logger.log("AppContext", "Translator Service configured");
            }
            if (
              loadedAIConfig.aiFeatures?.languageDetector?.enabled !== false
            ) {
              await LanguageDetectorServiceProxy.configure(loadedAIConfig);
              Logger.log("AppContext", "Language Detector Service configured");
            }
            if (loadedAIConfig.aiFeatures?.summarizer?.enabled !== false) {
              await SummarizerServiceProxy.configure(loadedAIConfig);
              Logger.log("AppContext", "Summarizer Service configured");
            }
          }
          if (loadedAIConfig.aiFeatures?.rewriter?.enabled !== false) {
            await RewriterServiceProxy.configure(loadedAIConfig);
            Logger.log("AppContext", "Rewriter Service configured");
          }
          if (loadedAIConfig.aiFeatures?.writer?.enabled !== false) {
            await WriterServiceProxy.configure(loadedAIConfig);
            Logger.log("AppContext", "Writer Service configured");
          }
        } catch (error) {
          Logger.warn("AppContext", "Failed to configure services:", error);
        }
      } catch (error) {
        Logger.error("AppContext", "Failed to load configs:", error);
        setEnableModelLoading(true);
      }
    };

    loadConfigs();

    // Listen for config changes (when saved in ConfigContext)
    const handleConfigChange = async (event: Event) => {
      if (
        !(event instanceof CustomEvent) ||
        !event.detail ||
        typeof event.detail !== "object"
      ) {
        return;
      }
      const detail = event.detail as {
        type?: string;
        config?: UIConfigState | AIConfigState;
      };
      if (detail.type === "aiConfig") {
        const updatedConfig = detail.config as AIConfigState;
        Logger.log(
          "AppContext",
          "AI Config updated from settings:",
          updatedConfig,
        );
        setAIConfig(updatedConfig);
      } else if (detail.type === "uiConfig") {
        const updatedConfig = detail.config as UIConfigState;
        Logger.log(
          "AppContext",
          "UI Config updated from settings:",
          updatedConfig,
        );
        setUIConfig(updatedConfig);
        setEnableModelLoading(updatedConfig.enableModelLoading ?? true);
      }
    };

    window.addEventListener("vassist-config-updated", handleConfigChange);

    return () => {
      window.removeEventListener("vassist-config-updated", handleConfigChange);
    };
  }, []);

  // Set assistant ready if model is disabled
  useEffect(() => {
    if (enableModelLoading === false) {
      const timer = setTimeout(() => {
        setIsAssistantReady(true);
        setIsChatUIReady(true);
        Logger.log("AppContext", "Running in chat-only mode (no 3D model)");
      }, 800);

      return () => clearTimeout(timer);
    }
  }, [enableModelLoading]);

  const notifyFrontendReady = useCallback(
    (reason: string) => {
      if (!__DESKTOP_MODE__ || isInputWindow || !api?.window?.frontendReady) {
        return;
      }

      if (hasNotifiedFrontendReadyRef.current) {
        return;
      }

      api.window
        .frontendReady()
        .then(() => {
          hasNotifiedFrontendReadyRef.current = true;
          Logger.log(
            "AppContext",
            `Notified Electron that frontend is ready (${reason})`,
          );
        })
        .catch((err) => {
          Logger.error(
            "AppContext",
            `Failed to notify Electron frontend ready (${reason}):`,
            err,
          );
        });
    },
    [api],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      notifyFrontendReady("startup");
    }, 300);

    return () => clearTimeout(timer);
  }, [notifyFrontendReady]);

  /**
   * Handle assistant ready callback
   */
  const handleAssistantReady = useCallback(
    ({
      animationManager: _animationManager,
      positionManager,
      scene,
    }: {
      animationManager: object | null;
      positionManager: AppPositionManager | null;
      scene: SceneWithMetadata;
    }) => {
      Logger.log("AppContext", "VirtualAssistant ready!");
      setIsAssistantReady(true);
      setIsChatUIReady(true);

      positionManagerRef.current = positionManager;
      sceneRef.current = scene;

      Logger.log(
        "AppContext",
        "Position manager ref set, ready for position tracking",
      );

      notifyFrontendReady("assistant-ready");
    },
    [notifyFrontendReady],
  );

  // ========================================
  // VOICE & TTS TRACKING
  // ========================================

  // Track voice conversation state
  // Skip in input window as ChatInput handles it there
  useEffect(() => {
    if (isInputWindow) return;

    const handleStateChange = (state: string) => {
      setIsSpeaking(state === ConversationStates.SPEAKING);
    };

    VoiceConversationService.setStateChangeCallback(handleStateChange);

    return () => {
      VoiceConversationService.setStateChangeCallback(null);
    };
  }, []);

  // Register TTS callbacks for centralized playback state
  // Poll isCurrentlyPlaying which now checks currentAudio !== null (actual playback)
  useEffect(() => {
    // Only poll when NOT in voice mode
    if (isVoiceMode) return;

    const interval = setInterval(() => {
      // isCurrentlyPlaying now correctly returns true only when audio is actually playing
      const isPlaying = TTSServiceProxy.isCurrentlyPlaying();
      setIsSpeaking((prev) => {
        // Only update state if value actually changed to prevent unnecessary re-renders
        if (prev !== isPlaying) {
          return isPlaying;
        }
        return prev;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isVoiceMode]);

  // ========================================
  // AI TOOLBAR ACTIONS
  // ========================================

  /**
   * Summarize text using configured AI service
   */
  const handleSummarize = useCallback(
    async (text: string) => {
      // Check if explicitly disabled (undefined/null means enabled by default)
      if (aiConfig?.aiFeatures?.summarizer?.enabled === false) {
        throw new Error("Summarizer is disabled in settings");
      }

      const options = {
        type: aiConfig?.aiFeatures?.summarizer?.defaultType || "tldr",
        format: aiConfig?.aiFeatures?.summarizer?.defaultFormat || "plain-text",
        length: aiConfig?.aiFeatures?.summarizer?.defaultLength || "medium",
      };

      return await SummarizerServiceProxy.summarize(text, options);
    },
    [aiConfig],
  );

  /**
   * Translate text using configured AI service
   */
  const handleTranslate = useCallback(
    async (
      text: string,
      sourceLanguage: string,
      targetLanguageOverride?: string,
    ) => {
      // Check if explicitly disabled (undefined/null means enabled by default)
      if (aiConfig?.aiFeatures?.translator?.enabled === false) {
        throw new Error("Translator is disabled in settings");
      }

      const targetLanguage =
        targetLanguageOverride ||
        aiConfig?.aiFeatures?.translator?.defaultTargetLanguage ||
        "en";

      // Auto-detect source language if not provided
      let sourceLang = sourceLanguage;
      if (!sourceLang) {
        try {
          const detectionResults =
            await LanguageDetectorServiceProxy.detect(text);
          const firstResult = detectionResults?.[0];
          if (firstResult?.detectedLanguage) {
            sourceLang = firstResult.detectedLanguage;
          }
        } catch (err) {
          Logger.warn("AppContext", "Language detection failed:", err);
          throw new Error("Could not detect source language");
        }
      }

      // Don't translate if source and target are the same
      if (sourceLang === targetLanguage) {
        return text;
      }

      return await TranslatorServiceProxy.translate(
        text,
        sourceLang,
        targetLanguage,
      );
    },
    [aiConfig],
  );

  /**
   * Add content to chat (using existing drag-drop flow)
   * @param {Object} data - The data to add to chat
   * @param {boolean} autoSend - Whether to automatically send the message (default: false)
   */
  const handleAddToChat = useCallback(
    (data: PendingDropData | null, autoSend = false) => {
      Logger.log("AppContext", "Add to chat:", data, "autoSend:", autoSend);

      // Open chat if closed
      if (!isChatContainerVisible || !isChatInputVisible) {
        setPendingDropData(data);
        setIsChatInputVisible(true);
        setIsChatContainerVisible(true);

        // Focus input after chat opens
        setTimeout(() => {
          const event = new CustomEvent("focusChatInput");
          window.dispatchEvent(event);
        }, 100);

        // If auto-send, trigger send after chat opens and content is added
        if (autoSend) {
          setTimeout(() => {
            const sendEvent = new CustomEvent("chatAutoSend");
            window.dispatchEvent(sendEvent);
          }, 300);
        }
      } else {
        // Dispatch event for ChatInput to handle
        const safeDetail = data ? { ...data, autoSend } : { autoSend };
        const event = new CustomEvent("chatDragDrop", {
          detail: safeDetail,
          bubbles: true,
          composed: true,
        });
        window.dispatchEvent(event);
      }
    },
    [isChatContainerVisible, isChatInputVisible],
  );

  // ========================================
  // CHAT ACTIONS
  // ========================================

  /**
   * Toggle chat visibility
   */
  const toggleChat = useCallback(() => {
    Logger.log("AppContext", "Toggle chat");

    if (isChatContainerVisible || isChatInputVisible) {
      setIsChatInputVisible(false);
      setIsChatContainerVisible(false);
      TTSServiceProxy.stopPlayback();
    } else {
      setIsChatInputVisible(true);
      setIsChatContainerVisible(true);

      // Focus input after chat opens
      setTimeout(() => {
        const event = new CustomEvent("focusChatInput");
        window.dispatchEvent(event);
      }, 100);
    }
  }, [isChatContainerVisible, isChatInputVisible]);

  /**
   * Open chat (without toggle)
   */
  const openChat = useCallback(() => {
    Logger.log("AppContext", "Open chat");
    setIsChatInputVisible(true);
    setIsChatContainerVisible(true);

    // Focus input after chat opens
    setTimeout(() => {
      const event = new CustomEvent("focusChatInput");
      window.dispatchEvent(event);
    }, 100);
  }, []);

  /**
   * Close chat
   */
  const closeChat = useCallback(() => {
    Logger.log("AppContext", "Close chat");
    setIsChatInputVisible(false);
    setIsChatContainerVisible(false);

    // Stop playback and abort TTS generation
    TTSServiceProxy.stopPlayback();

    // Dispatch event to abort TTS generation stream in ChatController
    const event = new CustomEvent("abortTTSGeneration");
    window.dispatchEvent(event);
  }, []);

  /**
   * Clear chat
   */
  const clearChat = useCallback(async () => {
    Logger.log("AppContext", "Clear chat");

    // If temp, delete from history
    if (isTempChat && currentChatId) {
      try {
        await chatHistoryService.deleteChat(currentChatId);
        Logger.log("AppContext", "Temp chat deleted:", currentChatId);
      } catch (error) {
        Logger.error("AppContext", "Failed to delete temp chat:", error);
      }
    }

    // Stop AI generation
    AIServiceProxy.abortRequest();

    // Stop TTS
    TTSServiceProxy.stopPlayback();

    // Dispatch event to abort TTS generation stream in ChatController
    const event = new CustomEvent("abortTTSGeneration");
    window.dispatchEvent(event);

    // Return assistant to idle
    const isReady = assistantRef.current?.isReady;
    const idle = assistantRef.current?.idle;
    if (isReady && isReady() && idle) {
      idle();
    }

    // Clear messages and tree
    ChatService.clearMessages();
    setChatMessages([]);

    // Reset state
    setIsProcessing(false);
    setCurrentChatId(null);
    setIsTempChat(false);
  }, [isTempChat, currentChatId]);

  /**
   * Stop generation/TTS
   */
  const stopGeneration = useCallback(() => {
    Logger.log("AppContext", "Stop generation");

    AIServiceProxy.abortRequest();
    TTSServiceProxy.stopPlayback();

    // Dispatch event to abort TTS generation stream in ChatController
    const event = new CustomEvent("abortTTSGeneration");
    window.dispatchEvent(event);

    if (isVoiceMode) {
      VoiceConversationService.interrupt();
    }

    const isReady = assistantRef.current?.isReady;
    const idle = assistantRef.current?.idle;
    if (isReady && isReady() && idle) {
      idle();
    }

    setIsProcessing(false);
  }, [isVoiceMode]);

  /**
   * Load chat from history
   */
  const loadChatFromHistory = useCallback(
    async (chatData: ChatHistorySelection) => {
      const { chatId } = chatData;
      Logger.log("AppContext", "Loading chat from history:", chatId);

      try {
        // Stop ongoing operations
        AIServiceProxy.abortRequest();
        TTSServiceProxy.stopPlayback();

        // Load full chat
        const fullChat = await chatHistoryService.loadChat(chatId);

        // Load tree if available, otherwise set flat messages
        if (fullChat.chatServiceData) {
          ChatService.importTree(fullChat.chatServiceData);
          const messages = toChatMessageItems(ChatService.getMessages());
          setChatMessages(messages);
          Logger.log("AppContext", "Loaded chat with tree structure");
        } else if (fullChat.messages) {
          // Backward compatibility: set flat messages
          const historyMessages = fullChat.messages as HistoryMessage[];
          ChatService.setMessages(
            toChatMessageInputsFromHistory(historyMessages),
          );
          const normalizedMessages = toChatMessageItems(
            ChatService.getMessages(),
          );
          setChatMessages(normalizedMessages);
          Logger.log("AppContext", "Loaded flat messages");
        }

        // Set current chat ID
        setCurrentChatId(fullChat.chatId);
        setIsTempChat(false);

        // Mark as not temp
        await chatHistoryService.markAsTempChat(fullChat.chatId, false);

        // Make sure chat UI is visible
        if (!isChatContainerVisible) {
          setIsChatContainerVisible(true);
          setIsChatInputVisible(true);

          // Focus input after chat opens
          setTimeout(() => {
            const event = new CustomEvent("focusChatInput");
            window.dispatchEvent(event);
          }, 100);
        }

        // Reset processing state
        setIsProcessing(false);

        Logger.log("AppContext", "Chat loaded successfully");
      } catch (error) {
        Logger.error("AppContext", "Failed to load chat:", error);
      }
    },
    [isChatContainerVisible],
  );

  /**
   * Update chat messages (typically called by ChatController)
   */
  const updateChatMessages = useCallback((messages: ChatMessageItem[]) => {
    setChatMessages(messages);
  }, []);

  // Callback refs for streaming regeneration (populated by ChatController)
  const regenerateWithStreamingRef = useRef<(() => Promise<void>) | null>(null);
  const editWithStreamingRef = useRef<
    ((messageId: string) => Promise<void>) | null
  >(null);

  /**
   * Edit a user message (creates new branch, regenerates AI response with streaming)
   */
  const editUserMessage = useCallback(
    async (
      messageId: string,
      newContent: string,
      _newImages: string[] | null = null,
      _newAudios: string[] | null = null,
    ) => {
      Logger.log("AppContext", "Editing user message:", messageId);

      try {
        // Edit in tree (creates new branch)
        const newMessageId = ChatService.editMessage(
          messageId,
          newContent,
          null,
          null,
        );

        // Update UI with new active path (without AI response yet)
        const updatedMessages = toChatMessageItems(ChatService.getMessages());
        setChatMessages(updatedMessages);

        // Use streaming regeneration if available
        if (editWithStreamingRef.current) {
          await editWithStreamingRef.current(newMessageId);
        } else {
          Logger.warn(
            "AppContext",
            "Streaming handler not available, using fallback",
          );
          // Fallback to non-streaming
          const conversationContext = updatedMessages.slice(
            0,
            updatedMessages.findIndex((m) => m.id === newMessageId) + 1,
          );
          const aiResponse = await AIServiceProxy.sendMessage(
            toAIConversation(conversationContext),
          );

          if (aiResponse?.success && aiResponse?.response) {
            ChatService.addMessage(
              "assistant",
              aiResponse.response,
              null,
              null,
            );
            setChatMessages(toChatMessageItems(ChatService.getMessages()));
          }
        }

        return;
      } catch (error) {
        Logger.error("AppContext", "Failed to edit message:", error);
        setIsProcessing(false);
        throw error;
      }
    },
    [],
  );

  /**
   * Regenerate AI response
   */
  const regenerateAIMessage = useCallback(async (messageId: string) => {
    Logger.log("AppContext", "Regenerating AI message:", messageId);

    try {
      // Create regeneration point (removes this AI message and everything after)
      ChatService.createRegenerationBranch(messageId);

      // Update UI (show conversation up to parent)
      const updatedMessages = toChatMessageItems(ChatService.getMessages());
      setChatMessages(updatedMessages);

      // Use streaming regeneration if available
      if (regenerateWithStreamingRef.current) {
        await regenerateWithStreamingRef.current();
      } else {
        Logger.warn(
          "AppContext",
          "Streaming handler not available, using fallback",
        );
        // Fallback to non-streaming
        setIsProcessing(true);
        const aiResponse = await AIServiceProxy.sendMessage(
          toAIConversation(updatedMessages),
        );

        if (aiResponse?.success && aiResponse?.response) {
          ChatService.addMessage("assistant", aiResponse.response, null, null);
          setChatMessages(toChatMessageItems(ChatService.getMessages()));
        }
        setIsProcessing(false);
      }
    } catch (error) {
      Logger.error("AppContext", "Failed to regenerate message:", error);
      setIsProcessing(false);
      throw error;
    }
  }, []);

  /**
   * Switch to a different branch
   */
  const switchToBranch = useCallback(
    (parentId: string, branchIndex: number) => {
      Logger.log(
        "AppContext",
        "Switching to branch:",
        branchIndex,
        "at parent:",
        parentId,
      );

      try {
        ChatService.switchBranch(parentId, branchIndex);

        // Update UI
        const updatedMessages = toChatMessageItems(ChatService.getMessages());
        setChatMessages(updatedMessages);

        Logger.log("AppContext", "Branch switched successfully");
      } catch (error) {
        Logger.error("AppContext", "Failed to switch branch:", error);
        throw error;
      }
    },
    [],
  );

  /**
   * Navigate to previous branch
   */
  const previousBranch = useCallback((messageId: string) => {
    Logger.log("AppContext", "Navigating to previous branch");

    try {
      ChatService.previousBranch(messageId);

      // Update UI
      const updatedMessages = toChatMessageItems(ChatService.getMessages());
      setChatMessages(updatedMessages);
    } catch (error) {
      Logger.error(
        "AppContext",
        "Failed to navigate to previous branch:",
        error,
      );
    }
  }, []);

  /**
   * Navigate to next branch
   */
  const nextBranch = useCallback((messageId: string) => {
    Logger.log("AppContext", "Navigating to next branch");

    try {
      ChatService.nextBranch(messageId);

      // Update UI
      const updatedMessages = toChatMessageItems(ChatService.getMessages());
      setChatMessages(updatedMessages);
    } catch (error) {
      Logger.error("AppContext", "Failed to navigate to next branch:", error);
    }
  }, []);

  // ========================================
  // DRAG ACTIONS
  // ========================================

  /**
   * Handle button drag start
   */
  const startButtonDrag = useCallback(() => {
    setIsDraggingButton(true);
  }, []);

  /**
   * Handle button drag end
   */
  const endButtonDrag = useCallback(() => {
    setIsDraggingButton(false);
  }, []);

  /**
   * Handle model drag start
   */
  const startModelDrag = useCallback(() => {
    setIsDraggingModel(true);
  }, []);

  /**
   * Handle model drag end
   */
  const endModelDrag = useCallback(() => {
    setIsDraggingModel(false);
  }, []);

  /**
   * Update button position
   */
  const updateButtonPosition = useCallback(
    (pos: React.SetStateAction<{ x: number; y: number }>) => {
      setButtonPosition(pos);
    },
    [],
  );

  // ========================================
  // PANEL ACTIONS
  // ========================================

  /**
   * Toggle settings panel
   */
  const toggleSettingsPanel = useCallback(() => {
    setIsSettingsPanelOpen((prev) => !prev);
  }, []);

  /**
   * Toggle history panel
   */
  const toggleHistoryPanel = useCallback(() => {
    setIsHistoryPanelOpen((prev) => !prev);
  }, []);

  // ========================================
  // AUTO-SAVE CHAT
  // ========================================

  useEffect(() => {
    if (chatMessages.length === 0 || isTempChat || isProcessing) {
      return;
    }

    const autoSaveTimer = setTimeout(async () => {
      try {
        if (isTempChat) {
          Logger.log("AppContext", "Skipping save - temp mode enabled");
          return;
        }

        let chatId: string | null = currentChatId;
        if (!chatId) {
          chatId = chatHistoryService.generateChatId();
          setCurrentChatId(chatId);
          Logger.log("AppContext", "New chat created for auto-save:", chatId);
        }

        const sourceUrl = window.location.href;

        const chatServiceAdapter = {
          exportTree: () => {
            const exportedTree: ExportedChatTree = ChatService.exportTree();
            const rawTree = exportedTree.tree;
            const normalizedTree =
              rawTree && typeof rawTree === "object"
                ? normalizeHistoryTreeNode(rawTree)
                : undefined;
            return {
              ...exportedTree,
              ...(normalizedTree ? { tree: normalizedTree } : {}),
            } as HistoryTreeData;
          },
          getMessages: () =>
            ChatService.getMessages().map((message) => ({
              role: message.role,
              content: message.content,
              images: message.images.filter(
                (value): value is string | Blob =>
                  typeof value === "string" || value instanceof Blob,
              ),
              audios: message.audios.filter(
                (value): value is string | Blob =>
                  typeof value === "string" || value instanceof Blob,
              ),
            })),
        };

        await chatHistoryService.saveChat({
          chatId,
          chatService: chatServiceAdapter, // NEW: Save tree
          messages: chatMessages, // DEPRECATED: Backward compatibility
          isTemp: false,
          metadata: {
            sourceUrl,
          },
        });

        Logger.log("AppContext", "Chat auto-saved (debounced):", chatId);
      } catch (error) {
        Logger.error(
          "AppContext",
          "Failed to auto-save chat (debounced):",
          error,
        );
      }
    }, 2000);

    return () => clearTimeout(autoSaveTimer);
  }, [chatMessages, currentChatId, isTempChat, isProcessing]);

  // ========================================
  // KEYBOARD SHORTCUTS
  // ========================================

  /**
   * Parse keyboard event into key combination string
   */
  const parseKeyEvent = useCallback((event: KeyboardEvent): string | null => {
    const modifiers = [];
    let mainKey = event.key;

    // Ignore modifier-only presses
    if (["Control", "Alt", "Shift", "Meta"].includes(mainKey)) {
      return null;
    }

    // Collect modifiers
    if (event.ctrlKey) modifiers.push("Ctrl");
    if (event.altKey) modifiers.push("Alt");
    if (event.shiftKey) modifiers.push("Shift");
    if (event.metaKey) modifiers.push("Meta");

    // Normalize key name
    if (mainKey.length === 1) {
      mainKey = mainKey.toUpperCase();
    }

    return [...modifiers, mainKey].join("+");
  }, []);

  /**
   * Global keyboard shortcut listener
   */
  useEffect(() => {
    if (isDesktop) return;

    if (!uiConfig?.shortcuts?.enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const combo = parseKeyEvent(event);
      if (!combo) return;

      const shortcuts = uiConfig?.shortcuts;
      if (!shortcuts) {
        return;
      }

      // Check for Open Chat shortcut
      if (shortcuts.openChat && combo === shortcuts.openChat) {
        event.preventDefault();
        event.stopPropagation();
        Logger.log("AppContext", "Toggle Chat shortcut triggered:", combo);
        toggleChat();
        return;
      }

      // Check for Toggle Avatar shortcut
      if (shortcuts.toggleMode && combo === shortcuts.toggleMode) {
        event.preventDefault();
        event.stopPropagation();
        Logger.log("AppContext", "Toggle Avatar shortcut triggered:", combo);

        const newValue = !uiConfig.enableModelLoading;

        setUIConfig((prev) => ({ ...prev, enableModelLoading: newValue }));
        setEnableModelLoading(newValue);

        // Create updated config and notify listeners
        const updatedConfig = { ...uiConfig, enableModelLoading: newValue };
        window.dispatchEvent(
          new CustomEvent("uiConfigUpdated", { detail: updatedConfig }),
        );

        StorageServiceProxy.configSave("uiConfig", updatedConfig)
          .then(() => {
            Logger.log(
              "AppContext",
              "Avatar visibility toggled via shortcut:",
              newValue,
            );
          })
          .catch((err) => {
            Logger.error(
              "AppContext",
              "Failed to toggle avatar via shortcut:",
              err,
            );
          });
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [uiConfig, parseKeyEvent, toggleChat]);

  /**
   * Register global shortcuts in Electron and listen for shortcut events
   */
  useEffect(() => {
    // Only in desktop main window (not input window)
    if (!isDesktop || !api?.shortcuts || isInputWindow) return;

    // Register shortcuts when config changes
    if (uiConfig?.shortcuts) {
      api.shortcuts
        .register(uiConfig.shortcuts)
        .then(() => {
          Logger.log("AppContext", "Global shortcuts registered in Electron");
        })
        .catch((err) => {
          Logger.error("AppContext", "Failed to register shortcuts:", err);
        });
    }

    // Listen for shortcut events from main process
    const cleanupOpenChat = api.shortcuts.onOpenChat(() => {
      Logger.log("AppContext", "Open Chat shortcut triggered from Electron");
      toggleChat();
    });

    const cleanupToggleModel = api.shortcuts.onToggleModel(() => {
      Logger.log("AppContext", "Toggle Model shortcut triggered from Electron");

      const newValue = !(uiConfig?.enableModelLoading ?? true);

      setUIConfig((prev) => ({ ...prev, enableModelLoading: newValue }));
      setEnableModelLoading(newValue);

      // Create updated config and notify listeners
      const updatedConfig = { ...uiConfig, enableModelLoading: newValue };
      window.dispatchEvent(
        new CustomEvent("uiConfigUpdated", { detail: updatedConfig }),
      );

      StorageServiceProxy.configSave("uiConfig", updatedConfig)
        .then(() => {
          Logger.log(
            "AppContext",
            "Avatar visibility toggled via Electron shortcut:",
            newValue,
          );
        })
        .catch((err) => {
          Logger.error(
            "AppContext",
            "Failed to toggle avatar via Electron shortcut:",
            err,
          );
        });
    });

    return () => {
      cleanupOpenChat?.();
      cleanupToggleModel?.();
    };
  }, [uiConfig, toggleChat, api]);

  // ========================================
  // SCENE RELOAD
  // ========================================
  const reloadScene = useCallback(() => {
    Logger.log("AppContext", "Reloading 3D scene - clearing saved position");
    setSavedModelPosition(null);
    setSceneKey((prev) => prev + 1);
  }, []);

  const forceChatOnlyMode = useCallback(
    (reason = "3d-scene-error") => {
      Logger.error(
        "AppContext",
        `Forcing chat-only mode due to 3D failure (${reason})`,
      );

      setEnableModelLoading(false);
      setIsAssistantReady(true);
      setIsChatUIReady(true);
      setShowModelLoadingOverlay(false);

      const nextUIConfig: UIConfigState = {
        ...(uiConfig ?? {}),
        enableModelLoading: false,
      };

      setUIConfig(nextUIConfig);
      window.dispatchEvent(
        new CustomEvent("vassist-config-updated", {
          detail: { type: "uiConfig", config: nextUIConfig },
        }),
      );

      StorageServiceProxy.configSave("uiConfig", nextUIConfig)
        .then(() => {
          Logger.log(
            "AppContext",
            "Persisted chat-only fallback config after 3D failure",
          );
        })
        .catch((error) => {
          Logger.error(
            "AppContext",
            "Failed to persist chat-only fallback config:",
            error,
          );
        });
    },
    [uiConfig],
  );

  // ========================================
  // CONTEXT VALUE
  // ========================================

  const value = {
    // Assistant state
    isAssistantReady,
    isChatUIReady,
    enableModelLoading,
    assistantRef,
    sceneRef,
    positionManagerRef,
    handleAssistantReady,
    setIsAssistantReady,
    setIsChatUIReady,

    // Chat UI state
    isChatInputVisible,
    isChatContainerVisible,
    chatMessages,
    isProcessing,
    currentChatId,
    isTempChat,
    pendingDropData,

    // Chat UI setters
    setIsChatInputVisible,
    setIsChatContainerVisible,
    setChatMessages,
    setIsProcessing,
    setCurrentChatId,
    setIsTempChat,
    setPendingDropData,

    // Voice & TTS state
    isVoiceMode,
    isSpeaking,
    setIsVoiceMode,
    setIsSpeaking,

    // Panel state
    isSettingsPanelOpen,
    isHistoryPanelOpen,
    setIsSettingsPanelOpen,
    setIsHistoryPanelOpen,

    // Message playback state
    playingMessageIndex,
    loadingMessageIndex,
    setPlayingMessageIndex,
    setLoadingMessageIndex,

    // Drag state
    isDraggingButton,
    isDraggingModel,
    isDragOverChat,
    setIsDraggingButton,
    setIsDraggingModel,
    setIsDragOverChat,

    // Position state
    buttonPosition,
    setButtonPosition,

    // Model overlay state
    modelOverlayPos,
    setModelOverlayPos,
    showModelLoadingOverlay,
    setShowModelLoadingOverlay,

    // Saved model position (persists across unmount/remount)
    savedModelPosition,
    setSavedModelPosition,

    // Chat actions
    toggleChat,
    openChat,
    closeChat,
    clearChat,
    stopGeneration,
    loadChatFromHistory,
    updateChatMessages,

    // Message branching actions
    editUserMessage,
    regenerateAIMessage,
    switchToBranch,
    previousBranch,
    nextBranch,

    // Branching callback refs (for ChatController to populate)
    regenerateWithStreamingRef,
    editWithStreamingRef,

    // Drag actions
    startButtonDrag,
    endButtonDrag,
    startModelDrag,
    endModelDrag,
    updateButtonPosition,

    // Panel actions
    toggleSettingsPanel,
    toggleHistoryPanel,

    // AI Toolbar actions
    handleSummarize,
    handleTranslate,
    handleAddToChat,

    // Scene actions
    sceneKey,
    reloadScene,
    forceChatOnlyMode,

    // Config state
    uiConfig,
    aiConfig,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
