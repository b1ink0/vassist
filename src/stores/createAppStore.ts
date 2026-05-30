import type * as React from "react";
import { createStore } from "zustand/vanilla";
import { devtools } from "zustand/middleware";
import defaultChatService, {
  type ChatNode,
  type ChatMessageInput,
  type ChatRole,
  type ChatService,
  type ExportedChatTree,
  type FlatChatMessage,
} from "../services/ChatService";
import defaultChatHistoryService from "../services/ChatHistoryService";
import type { ChatHistoryService } from "../services/ChatHistoryService";
import {
  AIServiceProxy,
  LanguageDetectorServiceProxy,
  SummarizerServiceProxy,
  TranslatorServiceProxy,
  TTSServiceProxy,
} from "../services/proxies";
import VoiceConversationService, {
  ConversationStates,
} from "../services/VoiceConversationService";
import Logger from "../services/LoggerService";
import {
  isDesktop,
  isInputWindow,
  isScreenPicker,
} from "../utils/PlatformUtils";
import type {
  PositionManagerLike,
  SavedModelPositionLike,
  SceneWithMetadata,
} from "../babylon/types";
import type { AssistantHandle } from "../types/assistant";
import { resolveSetStateAction } from "./storeUtils";
import { useConfigStore } from "./useConfigStore";
import { useDesktopStore } from "./useDesktopStore";

export interface ChatMessageItem {
  id: string;
  role: string;
  content: string;
  images?: string[];
  audios?: string[];
  [key: string]: string | number | boolean | null | undefined | object;
}

export interface AppPositionManager extends PositionManagerLike {
  applyPreset: (
    preset: string,
    options?: { modelSizePx?: { width: number; height: number } },
  ) => void;
}

type HistoryMessage = {
  role?: string;
  content?: string;
  images?: Array<string | Blob | File>;
  audios?: Array<string | Blob | File>;
};

export type PendingDropValue =
  | string
  | number
  | boolean
  | Blob
  | File
  | null
  | undefined
  | Array<string | number | boolean | Blob | File | null>;
export type PendingDropData = Record<string, PendingDropValue>;
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

export interface AppStoreState {
  isAssistantReady: boolean;
  isChatUIReady: boolean;
  assistantRef: React.MutableRefObject<AssistantHandle | null>;
  sceneRef: React.MutableRefObject<SceneWithMetadata | null>;
  positionManagerRef: React.MutableRefObject<AppPositionManager | null>;
  isChatInputVisible: boolean;
  isChatContainerVisible: boolean;
  chatMessages: ChatMessageItem[];
  isProcessing: boolean;
  currentChatId: string | null;
  isTempChat: boolean;
  pendingDropData: PendingDropData | null;
  isVoiceMode: boolean;
  isSpeaking: boolean;
  isSettingsPanelOpen: boolean;
  isHistoryPanelOpen: boolean;
  playingMessageIndex: number | null;
  loadingMessageIndex: number | null;
  isDraggingButton: boolean;
  isDraggingModel: boolean;
  isDragOverChat: boolean;
  buttonPosition: { x: number; y: number };
  modelOverlayPos: { x: number; y: number; width: number; height: number };
  showModelLoadingOverlay: boolean;
  savedModelPosition: SavedModelPositionLike | null;
  sceneKey: number;
  regenerateWithStreamingRef: React.MutableRefObject<
    (() => Promise<void>) | null
  >;
  editWithStreamingRef: React.MutableRefObject<
    ((messageId: string) => Promise<void>) | null
  >;
  handleAssistantReady: (payload: {
    animationManager: object | null;
    positionManager: AppPositionManager | null;
    scene: SceneWithMetadata;
  }) => void;
  setIsAssistantReady: React.Dispatch<React.SetStateAction<boolean>>;
  setIsChatUIReady: React.Dispatch<React.SetStateAction<boolean>>;
  setIsChatInputVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setIsChatContainerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessageItem[]>>;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentChatId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsTempChat: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingDropData: React.Dispatch<
    React.SetStateAction<PendingDropData | null>
  >;
  setIsVoiceMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSettingsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsHistoryPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPlayingMessageIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setLoadingMessageIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setIsDraggingButton: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDraggingModel: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDragOverChat: React.Dispatch<React.SetStateAction<boolean>>;
  setButtonPosition: React.Dispatch<
    React.SetStateAction<{ x: number; y: number }>
  >;
  setModelOverlayPos: React.Dispatch<
    React.SetStateAction<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>
  >;
  setShowModelLoadingOverlay: React.Dispatch<React.SetStateAction<boolean>>;
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
  reloadScene: () => void;
  forceChatOnlyMode: (reason?: string) => void;
}

interface AppStoreDependencies {
  chatService?: ChatService;
  chatHistoryService?: ChatHistoryService;
}

const dispatchWindowEvent = (name: string, detail?: unknown) => {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(name, detail === undefined ? undefined : { detail }),
  );
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
    }
  }

  if (Array.isArray(node.audios)) {
    const audios = node.audios.filter(
      (value): value is string | Blob =>
        typeof value === "string" || value instanceof Blob,
    );
    if (audios.length > 0) {
      normalized.audios = audios;
    }
  }

  if (Array.isArray(node.branches)) {
    normalized.branches = node.branches.map((branch) =>
      normalizeHistoryTreeNode(branch),
    );
  }

  return normalized;
};

export const toChatMessageItems = (
  messages: FlatChatMessage[],
): ChatMessageItem[] =>
  messages.map((message, index) => {
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

const toAIConversation = (messages: ChatMessageItem[]) =>
  messages.map((message) => ({
    role: message.role as ChatRole,
    content: message.content,
    ...(message.images && message.images.length > 0
      ? { images: message.images }
      : {}),
    ...(message.audios && message.audios.length > 0
      ? { audios: message.audios }
      : {}),
  }));

const toChatMessageInputsFromHistory = (
  messages: HistoryMessage[],
): ChatMessageInput[] =>
  messages.map((message) => {
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

export const createAppStore = (dependencies: AppStoreDependencies = {}) => {
  const chatService = dependencies.chatService ?? defaultChatService;
  const historyService =
    dependencies.chatHistoryService ?? defaultChatHistoryService;
  let chatAutoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  const assistantRef = {
    current: null,
  } as React.MutableRefObject<AssistantHandle | null>;
  const sceneRef = {
    current: null,
  } as React.MutableRefObject<SceneWithMetadata | null>;
  const positionManagerRef = {
    current: null,
  } as React.MutableRefObject<AppPositionManager | null>;
  const regenerateWithStreamingRef = {
    current: null,
  } as React.MutableRefObject<(() => Promise<void>) | null>;
  const editWithStreamingRef = {
    current: null,
  } as React.MutableRefObject<((messageId: string) => Promise<void>) | null>;

  return createStore<AppStoreState>()(
    devtools(
      (set, get, store) => {
        const scheduleChatAutoSave = () => {
          if (chatAutoSaveTimeout) {
            clearTimeout(chatAutoSaveTimeout);
            chatAutoSaveTimeout = null;
          }

          const state = store.getState();
          if (
            state.chatMessages.length === 0 ||
            state.isTempChat ||
            state.isProcessing
          ) {
            return;
          }

          chatAutoSaveTimeout = setTimeout(async () => {
            const latestState = store.getState();
            if (
              latestState.chatMessages.length === 0 ||
              latestState.isTempChat ||
              latestState.isProcessing
            ) {
              return;
            }

            try {
              let chatId = latestState.currentChatId;
              if (!chatId) {
                chatId = historyService.generateChatId();
                store.setState({ currentChatId: chatId });
                Logger.log(
                  "AppStore",
                  "New chat created for auto-save:",
                  chatId,
                );
              }

              const sourceUrl = window.location.href;
              const chatServiceAdapter = {
                exportTree: () => {
                  const exportedTree: ExportedChatTree =
                    chatService.exportTree();
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
                  chatService.getMessages().map((message) => ({
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

              await historyService.saveChat({
                chatId,
                chatService: chatServiceAdapter,
                messages: latestState.chatMessages,
                isTemp: false,
                metadata: {
                  sourceUrl,
                },
              });

              Logger.log("AppStore", "Chat auto-saved (debounced):", chatId);
            } catch (error) {
              Logger.error(
                "AppStore",
                "Failed to auto-save chat (debounced):",
                error,
              );
            }
          }, 2000);
        };

        const applyChatSchedule = () => {
          scheduleChatAutoSave();
        };

        return {
          isAssistantReady: false,
          isChatUIReady: false,
          assistantRef,
          sceneRef,
          positionManagerRef,
          isChatInputVisible: false,
          isChatContainerVisible: false,
          chatMessages: [],
          isProcessing: false,
          currentChatId: null,
          isTempChat: false,
          pendingDropData: null,
          isVoiceMode: false,
          isSpeaking: false,
          isSettingsPanelOpen: false,
          isHistoryPanelOpen: false,
          playingMessageIndex: null,
          loadingMessageIndex: null,
          isDraggingButton: false,
          isDraggingModel: false,
          isDragOverChat: false,
          buttonPosition: { x: -100, y: -100 },
          modelOverlayPos: { x: 0, y: 0, width: 0, height: 0 },
          showModelLoadingOverlay: false,
          savedModelPosition: null,
          sceneKey: 0,
          regenerateWithStreamingRef,
          editWithStreamingRef,
          handleAssistantReady: ({
            animationManager: _animationManager,
            positionManager,
            scene,
          }) => {
            Logger.log("AppStore", "VirtualAssistant ready!");
            positionManagerRef.current = positionManager;
            sceneRef.current = scene;
            set({
              isAssistantReady: true,
              isChatUIReady: true,
            });
          },
          setIsAssistantReady: (value) => {
            set((state) => ({
              isAssistantReady: resolveSetStateAction(
                value,
                state.isAssistantReady,
              ),
            }));
          },
          setIsChatUIReady: (value) => {
            set((state) => ({
              isChatUIReady: resolveSetStateAction(value, state.isChatUIReady),
            }));
          },
          setIsChatInputVisible: (value) => {
            set((state) => ({
              isChatInputVisible: resolveSetStateAction(
                value,
                state.isChatInputVisible,
              ),
            }));
          },
          setIsChatContainerVisible: (value) => {
            set((state) => ({
              isChatContainerVisible: resolveSetStateAction(
                value,
                state.isChatContainerVisible,
              ),
            }));
          },
          setChatMessages: (value) => {
            set((state) => ({
              chatMessages: resolveSetStateAction(value, state.chatMessages),
            }));
            applyChatSchedule();
          },
          setIsProcessing: (value) => {
            set((state) => ({
              isProcessing: resolveSetStateAction(value, state.isProcessing),
            }));
            applyChatSchedule();
          },
          setCurrentChatId: (value) => {
            set((state) => ({
              currentChatId: resolveSetStateAction(value, state.currentChatId),
            }));
            applyChatSchedule();
          },
          setIsTempChat: (value) => {
            set((state) => ({
              isTempChat: resolveSetStateAction(value, state.isTempChat),
            }));
            applyChatSchedule();
          },
          setPendingDropData: (value) => {
            set((state) => ({
              pendingDropData: resolveSetStateAction(
                value,
                state.pendingDropData,
              ),
            }));
          },
          setIsVoiceMode: (value) => {
            set((state) => ({
              isVoiceMode: resolveSetStateAction(value, state.isVoiceMode),
            }));
          },
          setIsSpeaking: (value) => {
            set((state) => ({
              isSpeaking: resolveSetStateAction(value, state.isSpeaking),
            }));
          },
          setIsSettingsPanelOpen: (value) => {
            set((state) => ({
              isSettingsPanelOpen: resolveSetStateAction(
                value,
                state.isSettingsPanelOpen,
              ),
            }));
          },
          setIsHistoryPanelOpen: (value) => {
            set((state) => ({
              isHistoryPanelOpen: resolveSetStateAction(
                value,
                state.isHistoryPanelOpen,
              ),
            }));
          },
          setPlayingMessageIndex: (value) => {
            set((state) => ({
              playingMessageIndex: resolveSetStateAction(
                value,
                state.playingMessageIndex,
              ),
            }));
          },
          setLoadingMessageIndex: (value) => {
            set((state) => ({
              loadingMessageIndex: resolveSetStateAction(
                value,
                state.loadingMessageIndex,
              ),
            }));
          },
          setIsDraggingButton: (value) => {
            set((state) => ({
              isDraggingButton: resolveSetStateAction(
                value,
                state.isDraggingButton,
              ),
            }));
          },
          setIsDraggingModel: (value) => {
            set((state) => ({
              isDraggingModel: resolveSetStateAction(
                value,
                state.isDraggingModel,
              ),
            }));
          },
          setIsDragOverChat: (value) => {
            set((state) => ({
              isDragOverChat: resolveSetStateAction(
                value,
                state.isDragOverChat,
              ),
            }));
          },
          setButtonPosition: (value) => {
            set((state) => ({
              buttonPosition: resolveSetStateAction(
                value,
                state.buttonPosition,
              ),
            }));
          },
          setModelOverlayPos: (value) => {
            set((state) => ({
              modelOverlayPos: resolveSetStateAction(
                value,
                state.modelOverlayPos,
              ),
            }));
          },
          setShowModelLoadingOverlay: (value) => {
            set((state) => ({
              showModelLoadingOverlay: resolveSetStateAction(
                value,
                state.showModelLoadingOverlay,
              ),
            }));
          },
          setSavedModelPosition: (value) => {
            set((state) => ({
              savedModelPosition: resolveSetStateAction(
                value,
                state.savedModelPosition,
              ),
            }));
          },
          toggleChat: () => {
            Logger.log("AppStore", "Toggle chat");
            const state = get();

            if (state.isChatContainerVisible || state.isChatInputVisible) {
              set({
                isChatInputVisible: false,
                isChatContainerVisible: false,
              });
              TTSServiceProxy.stopPlayback();
              return;
            }

            set({
              isChatInputVisible: true,
              isChatContainerVisible: true,
            });

            setTimeout(() => {
              dispatchWindowEvent("focusChatInput");
            }, 100);
          },
          openChat: () => {
            Logger.log("AppStore", "Open chat");
            set({
              isChatInputVisible: true,
              isChatContainerVisible: true,
            });
            setTimeout(() => {
              dispatchWindowEvent("focusChatInput");
            }, 100);
          },
          closeChat: () => {
            Logger.log("AppStore", "Close chat");
            set({
              isChatInputVisible: false,
              isChatContainerVisible: false,
            });
            TTSServiceProxy.stopPlayback();
            dispatchWindowEvent("abortTTSGeneration");
          },
          clearChat: async () => {
            const state = get();
            Logger.log("AppStore", "Clear chat");

            if (state.isTempChat && state.currentChatId) {
              try {
                await historyService.deleteChat(state.currentChatId);
                Logger.log(
                  "AppStore",
                  "Temp chat deleted:",
                  state.currentChatId,
                );
              } catch (error) {
                Logger.error("AppStore", "Failed to delete temp chat:", error);
              }
            }

            AIServiceProxy.abortRequest();
            TTSServiceProxy.stopPlayback();
            dispatchWindowEvent("abortTTSGeneration");

            const isReady = assistantRef.current?.isReady;
            const idle = assistantRef.current?.idle;
            if (isReady && isReady() && idle) {
              idle();
            }

            chatService.clearMessages();
            set({
              chatMessages: [],
              isProcessing: false,
              currentChatId: null,
              isTempChat: false,
            });
            applyChatSchedule();
          },
          stopGeneration: () => {
            Logger.log("AppStore", "Stop generation");
            AIServiceProxy.abortRequest();
            TTSServiceProxy.stopPlayback();
            dispatchWindowEvent("abortTTSGeneration");

            if (get().isVoiceMode) {
              VoiceConversationService.interrupt();
            }

            const isReady = assistantRef.current?.isReady;
            const idle = assistantRef.current?.idle;
            if (isReady && isReady() && idle) {
              idle();
            }

            set({ isProcessing: false });
            applyChatSchedule();
          },
          loadChatFromHistory: async ({ chatId }) => {
            Logger.log("AppStore", "Loading chat from history:", chatId);

            try {
              AIServiceProxy.abortRequest();
              TTSServiceProxy.stopPlayback();

              const fullChat = await historyService.loadChat(chatId);

              if (fullChat.chatServiceData) {
                chatService.importTree(fullChat.chatServiceData);
                set({
                  chatMessages: toChatMessageItems(chatService.getMessages()),
                });
              } else if (fullChat.messages) {
                chatService.setMessages(
                  toChatMessageInputsFromHistory(
                    fullChat.messages as HistoryMessage[],
                  ),
                );
                set({
                  chatMessages: toChatMessageItems(chatService.getMessages()),
                });
              }

              set({
                currentChatId: fullChat.chatId,
                isTempChat: false,
                isProcessing: false,
              });

              await historyService.markAsTempChat(fullChat.chatId, false);

              if (!get().isChatContainerVisible) {
                set({
                  isChatContainerVisible: true,
                  isChatInputVisible: true,
                });
                setTimeout(() => {
                  dispatchWindowEvent("focusChatInput");
                }, 100);
              }

              applyChatSchedule();
              Logger.log("AppStore", "Chat loaded successfully");
            } catch (error) {
              Logger.error("AppStore", "Failed to load chat:", error);
            }
          },
          updateChatMessages: (messages) => {
            set({ chatMessages: messages });
            applyChatSchedule();
          },
          editUserMessage: async (
            messageId,
            newContent,
            _newImages = null,
            _newAudios = null,
          ) => {
            Logger.log("AppStore", "Editing user message:", messageId);

            try {
              const newMessageId = chatService.editMessage(
                messageId,
                newContent,
                null,
                null,
              );

              const updatedMessages = toChatMessageItems(
                chatService.getMessages(),
              );
              set({ chatMessages: updatedMessages });
              applyChatSchedule();

              if (editWithStreamingRef.current) {
                await editWithStreamingRef.current(newMessageId);
                return;
              }

              Logger.warn(
                "AppStore",
                "Streaming handler not available, using fallback",
              );

              const conversationContext = updatedMessages.slice(
                0,
                updatedMessages.findIndex(
                  (message) => message.id === newMessageId,
                ) + 1,
              );
              const aiResponse = await AIServiceProxy.sendMessage(
                toAIConversation(conversationContext),
              );

              if (aiResponse?.success && aiResponse?.response) {
                chatService.addMessage(
                  "assistant",
                  aiResponse.response,
                  null,
                  null,
                );
                set({
                  chatMessages: toChatMessageItems(chatService.getMessages()),
                });
                applyChatSchedule();
              }
            } catch (error) {
              Logger.error("AppStore", "Failed to edit message:", error);
              set({ isProcessing: false });
              applyChatSchedule();
              throw error;
            }
          },
          regenerateAIMessage: async (messageId) => {
            Logger.log("AppStore", "Regenerating AI message:", messageId);

            try {
              chatService.createRegenerationBranch(messageId);
              const updatedMessages = toChatMessageItems(
                chatService.getMessages(),
              );
              set({ chatMessages: updatedMessages });
              applyChatSchedule();

              if (regenerateWithStreamingRef.current) {
                await regenerateWithStreamingRef.current();
                return;
              }

              Logger.warn(
                "AppStore",
                "Streaming handler not available, using fallback",
              );

              set({ isProcessing: true });
              applyChatSchedule();
              const aiResponse = await AIServiceProxy.sendMessage(
                toAIConversation(updatedMessages),
              );

              if (aiResponse?.success && aiResponse?.response) {
                chatService.addMessage(
                  "assistant",
                  aiResponse.response,
                  null,
                  null,
                );
                set({
                  chatMessages: toChatMessageItems(chatService.getMessages()),
                });
                applyChatSchedule();
              }

              set({ isProcessing: false });
              applyChatSchedule();
            } catch (error) {
              Logger.error("AppStore", "Failed to regenerate message:", error);
              set({ isProcessing: false });
              applyChatSchedule();
              throw error;
            }
          },
          switchToBranch: (parentId, branchIndex) => {
            Logger.log(
              "AppStore",
              "Switching to branch:",
              branchIndex,
              "at parent:",
              parentId,
            );

            try {
              chatService.switchBranch(parentId, branchIndex);
              set({
                chatMessages: toChatMessageItems(chatService.getMessages()),
              });
              applyChatSchedule();
            } catch (error) {
              Logger.error("AppStore", "Failed to switch branch:", error);
              throw error;
            }
          },
          previousBranch: (messageId) => {
            try {
              chatService.previousBranch(messageId);
              set({
                chatMessages: toChatMessageItems(chatService.getMessages()),
              });
              applyChatSchedule();
            } catch (error) {
              Logger.error(
                "AppStore",
                "Failed to navigate to previous branch:",
                error,
              );
            }
          },
          nextBranch: (messageId) => {
            try {
              chatService.nextBranch(messageId);
              set({
                chatMessages: toChatMessageItems(chatService.getMessages()),
              });
              applyChatSchedule();
            } catch (error) {
              Logger.error(
                "AppStore",
                "Failed to navigate to next branch:",
                error,
              );
            }
          },
          startButtonDrag: () => {
            set({ isDraggingButton: true });
          },
          endButtonDrag: () => {
            set({ isDraggingButton: false });
          },
          startModelDrag: () => {
            set({ isDraggingModel: true });
          },
          endModelDrag: () => {
            set({ isDraggingModel: false });
          },
          updateButtonPosition: (value) => {
            set((state) => ({
              buttonPosition: resolveSetStateAction(
                value,
                state.buttonPosition,
              ),
            }));
          },
          toggleSettingsPanel: () => {
            set((state) => ({
              isSettingsPanelOpen: !state.isSettingsPanelOpen,
            }));
          },
          toggleHistoryPanel: () => {
            set((state) => ({ isHistoryPanelOpen: !state.isHistoryPanelOpen }));
          },
          handleSummarize: async (text) => {
            const aiConfig = useConfigStore.getState().aiConfig;
            if (aiConfig?.aiFeatures?.summarizer?.enabled === false) {
              throw new Error("Summarizer is disabled in settings");
            }

            return SummarizerServiceProxy.summarize(text, {
              type: aiConfig?.aiFeatures?.summarizer?.defaultType || "tldr",
              format:
                aiConfig?.aiFeatures?.summarizer?.defaultFormat || "plain-text",
              length:
                aiConfig?.aiFeatures?.summarizer?.defaultLength || "medium",
            });
          },
          handleTranslate: async (
            text,
            sourceLanguage,
            targetLanguageOverride,
          ) => {
            const aiConfig = useConfigStore.getState().aiConfig;
            if (aiConfig?.aiFeatures?.translator?.enabled === false) {
              throw new Error("Translator is disabled in settings");
            }

            const targetLanguage =
              targetLanguageOverride ||
              aiConfig?.aiFeatures?.translator?.defaultTargetLanguage ||
              "en";

            let sourceLang = sourceLanguage;
            if (!sourceLang) {
              try {
                const detectionResults =
                  await LanguageDetectorServiceProxy.detect(text);
                const firstResult = detectionResults?.[0];
                if (firstResult?.detectedLanguage) {
                  sourceLang = firstResult.detectedLanguage;
                }
              } catch (error) {
                Logger.warn("AppStore", "Language detection failed:", error);
                throw new Error("Could not detect source language");
              }
            }

            if (sourceLang === targetLanguage) {
              return text;
            }

            return TranslatorServiceProxy.translate(
              text,
              sourceLang,
              targetLanguage,
            );
          },
          handleAddToChat: (data, autoSend = false) => {
            Logger.log("AppStore", "Add to chat:", data, "autoSend:", autoSend);

            if (!get().isChatContainerVisible || !get().isChatInputVisible) {
              set({
                pendingDropData: data,
                isChatInputVisible: true,
                isChatContainerVisible: true,
              });

              setTimeout(() => {
                dispatchWindowEvent("focusChatInput");
              }, 100);

              if (autoSend) {
                setTimeout(() => {
                  dispatchWindowEvent("chatAutoSend");
                }, 300);
              }
              return;
            }

            dispatchWindowEvent(
              "chatDragDrop",
              data ? { ...data, autoSend } : { autoSend },
            );
          },
          reloadScene: () => {
            Logger.log(
              "AppStore",
              "Reloading 3D scene - clearing saved position",
            );
            set((state) => ({
              savedModelPosition: null,
              sceneKey: state.sceneKey + 1,
            }));
          },
          forceChatOnlyMode: (reason = "3d-scene-error") => {
            Logger.error(
              "AppStore",
              `Forcing chat-only mode due to 3D failure (${reason})`,
            );

            set({
              isAssistantReady: true,
              isChatUIReady: true,
              showModelLoadingOverlay: false,
            });

            const configStore = useConfigStore.getState();
            configStore.updateUIConfig("enableModelLoading", false, {
              debounceMs: 0,
            });
            void configStore.saveUIConfig();
          },
        };
      },
      { name: "app-store" },
    ),
  );
};

export type AppStore = ReturnType<typeof createAppStore>;

export const appStore = createAppStore();

export const syncAppSpeakingFromConversationState = (
  state: string,
  store: AppStore = appStore,
) => {
  store.setState({ isSpeaking: state === ConversationStates.SPEAKING });
};

export const getDesktopApi = () => useDesktopStore.getState().api;

export { ConversationStates, isDesktop, isInputWindow, isScreenPicker };
