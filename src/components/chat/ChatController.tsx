/**
 * @fileoverview Main chat controller managing chat UI, streaming, and voice conversation.
 */

import {
  sendChatMessage,
  regenerateChatResponse,
  sendVoiceChatMessage,
  getSystemPromptFromConfig,
  type AIServiceLike,
  type TTSServiceLike,
  type StorageServiceLike,
  type DocumentInteractionServiceLike,
  type VoiceConversationServiceLike,
} from "../../services/chat/ChatResponseService";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useCallback,
  useEffectEvent,
  type ForwardRefExoticComponent,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type RefAttributes,
  type SetStateAction,
} from "react";
const AssistantControlDock = lazy(() => import("./AssistantControlDock"));
const ChatInput = lazy(() => import("./ChatInput"));
const ChatContainer = lazy(() => import("./ChatContainer"));
const AIToolbar = lazy(() => import("../toolbar/AIToolbar"));
const InputWindowManager = lazy(async () => {
  const module = await import("../desktop/InputWindowManager");
  return { default: module.InputWindowManager };
});
import {
  type ResolvedVAssistEmbedConfig,
  type VAssistMessageEventPayload,
} from "../../embed/config";
import {
  useAppRuntimeServices,
  useAppStoreApi,
} from "../../contexts/AppRuntimeContext";
import { getChatSession } from "../../services/chat/ChatSessionRuntime";
import { playChatMessageSpeech } from "../../services/chat/ChatSpeechService";
import { emitEmbedHostEvent } from "../../embed/runtimeStore";
import { useXrRuntime } from "../../contexts/XrRuntimeContext";
import { XrSurface } from "../xr/XrSurface";
import {
  AIServiceProxy,
  TTSServiceProxy,
  STTServiceProxy,
  StorageServiceProxy,
} from "../../services/proxies";
import DocumentInteractionService from "../../services/chat/DocumentInteractionService";
import VoiceConversationService, {
  ConversationStates,
} from "../../services/audio/VoiceConversationService";

import {
  useAssistantRef,
  useIsAssistantReady,
} from "../../hooks/app/useAssistant";
import {
  useChatActions,
  useChatMessages,
  useIsProcessing,
  useCurrentChatId,
  useIsChatContainerVisible,
  useIsChatInputVisible,
  useIsTempChat,
  usePendingDropData,
} from "../../hooks/app/useChat";
import {
  useIsVoiceMode,
  usePlaybackActions,
} from "../../hooks/app/usePlayback";
import { useToolingActions } from "../../hooks/app/useTooling";
import { useDesktopWindowResize } from "../../hooks/useDesktopWindowResize";
import { useDesktopApi } from "../../hooks/useDesktopStore";
import { useConfigAIActions } from "../../hooks/config/useConfigAI";
import Logger from "../../services/common/LoggerService";
import {
  isAndroid,
  isDesktop,
  isInputWindow,
  isLiveWallpaperWindow,
  isDesktopAttachedModeWindow,
  isDetachedAvatarWindow,
  isDetachedChatWindow,
} from "../../utils/PlatformUtils";
import MicrophoneService from "../../services/audio/MicrophoneService";
import CameraService from "../../services/media/CameraService";
import ScreenShareService from "../../services/media/ScreenShareService";
const DetachedChatResizeHandle = lazy(
  () => import("../desktop/DetachedChatResizeHandle"),
);

type ConversationState =
  (typeof ConversationStates)[keyof typeof ConversationStates];

interface ChatControllerProps {
  modelDisabled?: boolean;
  avatarOnly?: boolean;
  requireSetupOnChatClick?: boolean;
  onRequireSetup?: () => void;
  embedConfig: ResolvedVAssistEmbedConfig;
}

interface AssistantHandle {
  isReady?: () => boolean;
  setState: (state: string) => Promise<void> | void;
  triggerAction: (action: string) => Promise<void> | void;
  idle: () => Promise<void> | void;
}

interface ChatMessageLike {
  id: string;
  role: string;
  content: string;
  images?: string[];
  audios?: string[];
  [key: string]: string | number | boolean | null | undefined | object;
}

interface DesktopApiForChatController {
  ipc?: {
    send: (channel: string, data?: unknown) => void;
    on: (
      channel: string,
      callback: (...args: unknown[]) => void,
    ) => (() => void) | void;
  };
}

type DesktopAssistantRuntimeEvent =
  | { type: "set-state"; state: string }
  | { type: "trigger-action"; action: string }
  | { type: "idle" }
  | {
      type: "speak";
      text: string;
      audioUrl?: string;
      audioData?: ArrayBuffer;
      audioMimeType?: string;
      bvmdUrl?: string;
      sessionId?: string | null;
    }
  | { type: "audio-end"; sessionId?: string | null }
  | { type: "stop" };

interface STTServiceLike {
  isConfigured: () => Promise<boolean>;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  cancelRecording: () => void;
  setTranscriptionCallback: (callback: ((text: string) => void) | null) => void;
  setErrorCallback: (callback: ((error: unknown) => void) | null) => void;
  setRecordingStartCallback: (callback: (() => void) | null) => void;
  setRecordingStopCallback: (callback: (() => void) | null) => void;
}

interface MediaDeviceLike {
  deviceId: string;
  label: string;
  kind: string;
  groupId: string;
}

interface MicrophoneServiceLike {
  subscribe: (
    callback: (state: {
      devices: MediaDeviceLike[];
      selectedDeviceId: string | null;
    }) => void,
  ) => (() => void) | void;
  initialize: () => Promise<void>;
  getDevices: () => MediaDeviceLike[];
  getSelectedDeviceId: () => string | null;
  setSelectedDevice: (deviceId: string | null) => void;
}

interface CameraServiceLike {
  subscribe: (
    callback: (state: {
      devices: MediaDeviceLike[];
      selectedDeviceId: string | null;
      isActive: boolean;
    }) => void,
  ) => (() => void) | void;
  refreshDevices: () => Promise<void>;
  isRunning: () => boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  setSelectedDevice: (deviceId: string) => Promise<void>;
}

interface ScreenShareServiceLike {
  subscribe: (
    callback: (state: { isActive: boolean }) => void,
  ) => (() => void) | void;
  initialize: () => Promise<void>;
  isRunning: () => boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

interface ChatHistoryServiceLike {
  markAsTempChat: (chatId: string, isTemp: boolean) => Promise<void>;
  generateChatId: () => string;
  saveChat: (payload: {
    chatId: string;
    chatService: unknown;
    messages: ChatMessageLike[];
    isTemp: boolean;
    metadata: { sourceUrl: string };
  }) => Promise<void>;
}

interface ChatInputProps {
  onSend: (
    message: string,
    images?: string[] | null,
    audios?: string[] | null,
  ) => Promise<void> | void;
  onClose: () => void;
  onVoiceTranscription: (
    text: string,
    images?: string[] | null,
    skipForward?: boolean,
  ) => Promise<void> | void;
  onVoiceMode: (active: boolean) => Promise<void> | void;
  embedConfig?: ResolvedVAssistEmbedConfig;
}

const aiService = AIServiceProxy as unknown as AIServiceLike;
const ttsService = TTSServiceProxy as unknown as TTSServiceLike;
const sttService = STTServiceProxy as unknown as STTServiceLike;
const storageService = StorageServiceProxy as unknown as StorageServiceLike;
const documentInteractionService =
  DocumentInteractionService as unknown as DocumentInteractionServiceLike;
const voiceConversationService =
  VoiceConversationService as unknown as VoiceConversationServiceLike;
const microphoneService = MicrophoneService as unknown as MicrophoneServiceLike;
const cameraService = CameraService as unknown as CameraServiceLike;
const screenShareService =
  ScreenShareService as unknown as ScreenShareServiceLike;
const ChatInputTyped = ChatInput as unknown as ForwardRefExoticComponent<
  ChatInputProps & RefAttributes<HTMLElement>
>;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const toHostMessagePayload = (
  message: ChatMessageLike,
): VAssistMessageEventPayload => ({
  messageId: message.id,
  role: message.role,
  content: message.content,
  ...(Array.isArray(message.images) && message.images.length > 0
    ? { images: message.images }
    : {}),
  ...(Array.isArray(message.audios) && message.audios.length > 0
    ? { audios: message.audios }
    : {}),
});

/**
 * Main chat controller component.
 *
 * @component
 * @param {Object} props - Component props
 * @param {boolean} props.modelDisabled - Whether model is disabled
 * @returns {JSX.Element} Chat controller component
 */
const ChatController = ({
  modelDisabled = false,
  avatarOnly = false,
  requireSetupOnChatClick = false,
  onRequireSetup,
  embedConfig,
}: ChatControllerProps) => {
  const xr = useXrRuntime();
  const appStore = useAppStoreApi();
  const isGeneratingReply = useIsProcessing();

  const chatSession = getChatSession(appStore);
  useEffect(
    () =>
      chatSession.registerSpeaker((index, text) =>
        playChatMessageSpeech(appStore, index, text),
      ),
    [appStore, chatSession],
  );
  const { chatService, chatHistoryService } = useAppRuntimeServices();
  const api = useDesktopApi() as DesktopApiForChatController | null;
  useEffect(() => {
    if (!isDesktop || isInputWindow || !api?.ipc) return;
    const publish = () =>
      api.ipc?.send("state:chatGeneration", isGeneratingReply);
    publish();
    const unsubscribe = api.ipc.on("chatInput:requestGenerationState", publish);
    const unsubscribeStop = api.ipc.on("chatInput:stop", () => {
      void getChatSession(appStore).execute({ type: "stop" });
    });
    return () => {
      unsubscribe?.();
      unsubscribeStop?.();
    };
  }, [api, appStore, isGeneratingReply]);
  const { updateAIConfig } = useConfigAIActions();
  const chatInputRef = useRef<HTMLElement | null>(null);
  const streamAbortControllerRef = useRef<AbortController | null>(null); // Track current stream to allow cancellation
  const hasAutoOpenedAndroidChatRef = useRef(false);
  const hasAutoOpenedNormalChatRef = useRef(false);
  const inputWindowSttRecordingRef = useRef(false);
  const inputWindowSttProcessingRef = useRef(false);
  const detachedSpeakTransferRef = useRef(Promise.resolve());
  const historyService =
    chatHistoryService as unknown as ChatHistoryServiceLike;

  const appAssistantRef = useAssistantRef();
  const isAssistantReady = useIsAssistantReady();
  const isChatInputVisible = useIsChatInputVisible();
  const isChatContainerVisible = useIsChatContainerVisible();
  const chatMessages = useChatMessages();
  const currentChatId = useCurrentChatId();
  const isTempChat = useIsTempChat();
  const pendingDropData = usePendingDropData();
  const {
    setIsChatInputVisible,
    setIsChatContainerVisible,
    setChatMessages,
    setIsProcessing,
    setPendingDropData,
    setIsTempChat,
    clearChat,
    closeChat,
  } = useChatActions();
  const _isVoiceMode = useIsVoiceMode();
  const { setIsVoiceMode, setIsSpeaking } = usePlaybackActions();
  const {
    setIsSettingsPanelOpen,
    setIsQuickPanelOpen,
    setIsHistoryPanelOpen,
    regenerateWithStreamingRef,
    editWithStreamingRef,
  } = useToolingActions();
  const previousChatOpenRef = useRef(false);
  const seenMessageIdsRef = useRef<Set<string>>(
    new Set(chatMessages.map((message) => message.id)),
  );
  const chatEnabled = embedConfig.features.chat;
  const toolbarEnabled = embedConfig.features.aiToolbar;
  const isNormalDesktop = isDesktopAttachedModeWindow;
  const usesSeparateInputWindow =
    isDesktop &&
    !isNormalDesktop &&
    !(isLiveWallpaperWindow && !isDetachedChatWindow);

  const assistantRef =
    appAssistantRef as MutableRefObject<AssistantHandle | null>;

  const sendAssistantRuntimeEvent = useCallback(
    (event: DesktopAssistantRuntimeEvent) => {
      if (!isDetachedChatWindow || !api?.ipc) {
        return;
      }

      api.ipc.send("desktop:assistant-runtime", event);
    },
    [api],
  );

  useEffect(() => {
    const isChatOpen = isChatContainerVisible || isChatInputVisible;

    if (isChatOpen === previousChatOpenRef.current) {
      return;
    }

    previousChatOpenRef.current = isChatOpen;
    emitEmbedHostEvent(
      isChatOpen ? "open" : "close",
      undefined,
      embedConfig.mount.hostId,
    );
  }, [embedConfig.mount.hostId, isChatContainerVisible, isChatInputVisible]);

  useEffect(() => {
    const seenIds = seenMessageIdsRef.current;
    const newMessages = chatMessages.filter(
      (message) => !seenIds.has(message.id),
    );

    if (newMessages.length === 0) {
      return;
    }

    for (const message of newMessages) {
      seenIds.add(message.id);

      const payload = toHostMessagePayload(message);
      emitEmbedHostEvent("message", payload, embedConfig.mount.hostId);
      emitEmbedHostEvent(
        message.role === "assistant" ? "message-received" : "message-sent",
        payload,
        embedConfig.mount.hostId,
      );
    }
  }, [chatMessages, embedConfig.mount.hostId]);

  const canUseAssistant = useCallback((): boolean => {
    return isDetachedChatWindow || assistantRef.current?.isReady?.() === true;
  }, [assistantRef]);

  const setAssistantState = useCallback(
    async (state: string) => {
      if (isDetachedChatWindow) {
        sendAssistantRuntimeEvent({ type: "set-state", state });
        return;
      }

      await assistantRef.current?.setState(state);
    },
    [assistantRef, sendAssistantRuntimeEvent],
  );

  const triggerAssistantAction = useCallback(
    async (action: string) => {
      if (isDetachedChatWindow) {
        sendAssistantRuntimeEvent({ type: "trigger-action", action });
        return;
      }

      await assistantRef.current?.triggerAction(action);
    },
    [assistantRef, sendAssistantRuntimeEvent],
  );

  const idleAssistant = useCallback(async () => {
    if (isDetachedChatWindow) {
      sendAssistantRuntimeEvent({ type: "idle" });
      return;
    }

    await assistantRef.current?.idle();
  }, [assistantRef, sendAssistantRuntimeEvent]);

  useEffect(() => {
    if (!isDetachedChatWindow || !api?.ipc) {
      return;
    }

    const getEventDetail = (args: unknown[]): Record<string, unknown> => {
      const candidate = args[0];
      if (!candidate || typeof candidate !== "object") {
        return {};
      }

      if (
        "detail" in candidate &&
        typeof candidate.detail === "object" &&
        candidate.detail !== null
      ) {
        return candidate.detail as Record<string, unknown>;
      }

      return candidate as Record<string, unknown>;
    };

    const handleSpeak = (...args: unknown[]) => {
      const detail = getEventDetail(args);
      if (typeof detail.text !== "string") {
        return;
      }

      detachedSpeakTransferRef.current = detachedSpeakTransferRef.current
        .catch(() => undefined)
        .then(async () => {
          const event: DesktopAssistantRuntimeEvent = {
            type: "speak",
            text: detail.text as string,
            ...(typeof detail.bvmdUrl === "string"
              ? { bvmdUrl: detail.bvmdUrl }
              : {}),
            ...(typeof detail.sessionId === "string"
              ? { sessionId: detail.sessionId }
              : {}),
          };

          if (typeof detail.audioUrl === "string" && !event.bvmdUrl) {
            try {
              const response = await fetch(detail.audioUrl);
              if (response.ok) {
                const audioData = await response.arrayBuffer();
                if (audioData.byteLength > 0) {
                  event.audioData = audioData;
                  event.audioMimeType =
                    response.headers.get("content-type") || "audio/mpeg";
                }
              }
            } catch (error) {
              Logger.warn(
                "ChatController",
                "Detached audio transfer failed; falling back to audio URL:",
                error,
              );
            }

            if (!event.audioData) {
              event.audioUrl = detail.audioUrl;
            }
          }

          sendAssistantRuntimeEvent(event);
        });
    };

    const handleStop = () => {
      sendAssistantRuntimeEvent({ type: "stop" });
    };

    const handleAudioEnd = (...args: unknown[]) => {
      const detail = getEventDetail(args);
      sendAssistantRuntimeEvent({
        type: "audio-end",
        ...(typeof detail.sessionId === "string"
          ? { sessionId: detail.sessionId }
          : {}),
      });
    };

    ttsService.addEventListener("speak", handleSpeak);
    ttsService.addEventListener("audioEnd", handleAudioEnd);
    ttsService.addEventListener("stop", handleStop);

    return () => {
      ttsService.removeEventListener("speak", handleSpeak);
      ttsService.removeEventListener("audioEnd", handleAudioEnd);
      ttsService.removeEventListener("stop", handleStop);
    };
  }, [api, sendAssistantRuntimeEvent]);

  useEffect(() => {
    if (!isDetachedChatWindow || !api?.ipc) {
      return;
    }

    api.ipc.send("desktop:chat-visibility", {
      visible: isChatContainerVisible || isChatInputVisible,
      temporary: isTempChat,
    });
  }, [api, isChatContainerVisible, isChatInputVisible, isTempChat]);

  useEffect(() => {
    if (!isDetachedAvatarWindow || !api?.ipc) {
      return;
    }

    return api.ipc.on("desktop:chat-visibility", (payload: unknown) => {
      const visible =
        payload &&
        typeof payload === "object" &&
        "visible" in payload &&
        typeof payload.visible === "boolean"
          ? payload.visible
          : null;

      if (visible === null) {
        return;
      }

      setIsChatInputVisible(visible);
      setIsChatContainerVisible(visible);
      if (
        payload &&
        typeof payload === "object" &&
        "temporary" in payload &&
        typeof payload.temporary === "boolean"
      ) {
        setIsTempChat(payload.temporary);
      }
    });
  }, [api, setIsChatContainerVisible, setIsChatInputVisible, setIsTempChat]);

  useEffect(() => {
    if (!isDetachedChatWindow || !api?.ipc) return;
    return api.ipc.on("desktop:chat-command", (command: unknown) => {
      if (command === "temporary") {
        setIsTempChat((previous) => !previous);
        return;
      }
      if (command !== "new" && command !== "history" && command !== "settings")
        return;
      if (command === "new") void clearChat();
      setIsChatContainerVisible(true);
      setIsChatInputVisible(true);
      setIsQuickPanelOpen(false);
      setIsHistoryPanelOpen(command === "history");
      setIsSettingsPanelOpen(command === "settings");
    });
  }, [
    api,
    clearChat,
    setIsChatContainerVisible,
    setIsChatInputVisible,
    setIsHistoryPanelOpen,
    setIsQuickPanelOpen,
    setIsSettingsPanelOpen,
    setIsTempChat,
  ]);

  useDesktopWindowResize(null, { disabled: avatarOnly });

  /**
   * Handles AI response in voice mode.
   * Gets AI response and speaks it through VoiceConversationService.
   */
  const executeVoiceMessage = useCallback(
    (text: string, images: string[] | null) =>
      sendVoiceChatMessage(
        {
          chatSession,
          chatService,
          streamAbortControllerRef,
          aiService,
          ttsService,
          storageService,
          documentInteractionService,
          getSystemPromptFromConfig,
          canUseAssistant,
          triggerAssistantAction,
          idleAssistant,
          setChatMessages,
          setIsProcessing,
          getErrorMessage,
          voiceConversationService,
          setAssistantState,
          appStore,
          historyService,
        },
        text,
        images,
      ),
    [
      chatSession,
      chatService,
      canUseAssistant,
      triggerAssistantAction,
      idleAssistant,
      setChatMessages,
      setIsProcessing,
      setAssistantState,
      appStore,
      historyService,
    ],
  );
  const handleVoiceTranscription = useCallback(
    async (
      text: string,
      images: string[] | null = null,
      skipForward = false,
    ) => {
      if (chatSession.isRemote) {
        await chatSession.execute({ type: "send", text, images });
        return;
      }
      Logger.log(
        "ChatController",
        "Voice transcription received:",
        text,
        "with images:",
        images?.length || 0,
        "skipForward:",
        skipForward,
      );

      if (!text || !text.trim()) {
        Logger.warn(
          "ChatController",
          "Empty transcription, returning to listening",
        );
        setTimeout(() => {
          if (voiceConversationService.isConversationActive()) {
            voiceConversationService.changeState(ConversationStates.LISTENING);
          }
        }, 500);
        return;
      }

      // Desktop: Forward transcription to input window so it can send back with images
      // Skip if skipForward=true (already from input window)
      if (
        !skipForward &&
        usesSeparateInputWindow &&
        !isInputWindow &&
        api?.ipc
      ) {
        Logger.log(
          "ChatController",
          "Forwarding transcription to input window for image attachment",
        );
        api.ipc.send("voice:transcriptionReceived", text);
        // Input window will send back via chatInput:voiceTranscription with images array
        return;
      }

      await executeVoiceMessage(text, images);
    },
    [executeVoiceMessage, api, chatSession, usesSeparateInputWindow],
  );

  const handleVoiceModeChange = useCallback(
    async (active: boolean) => {
      Logger.log("ChatController", "Voice mode changed:", active);
      setIsVoiceMode(active);

      if (usesSeparateInputWindow && !isInputWindow) {
        try {
          if (active) {
            Logger.log(
              "ChatController",
              "Starting VoiceConversationService in main window",
            );
            await voiceConversationService.start();
          } else {
            Logger.log(
              "ChatController",
              "Stopping VoiceConversationService in main window",
            );
            voiceConversationService.stop();
            if (cameraService.isRunning()) {
              Logger.log(
                "ChatController",
                "Stopping camera after voice call ended",
              );
              await cameraService.stop();
            }
            // Stop screen share when voice mode ends
            if (screenShareService.isRunning()) {
              Logger.log(
                "ChatController",
                "Stopping screen share after voice call ended",
              );
              await screenShareService.stop();
            }
          }
        } catch (error) {
          Logger.error("ChatController", "Voice mode change error:", error);
          setIsVoiceMode(false);
          api?.ipc?.send("state:voiceSession", {
            active: false,
            error: getErrorMessage(error),
          });
        }
      }
    },
    [setIsVoiceMode, usesSeparateInputWindow, api],
  );

  /**
   * Track voice conversation state to update isSpeaking
   * Web/Android: ChatInput registers callback directly, don't register here to avoid overwriting
   */
  useEffect(() => {
    // Only register in desktop main window
    // Web/Android: ChatInput handles state callback to avoid overwriting
    if (isInputWindow || !usesSeparateInputWindow) return;

    const handleStateChange = (state: ConversationState) => {
      setIsSpeaking(state === ConversationStates.SPEAKING);

      // Desktop: Forward voice state to input window via IPC
      if (api?.ipc) {
        api.ipc.send("state:voiceState", state);
      }
    };

    voiceConversationService.setStateChangeCallback(handleStateChange);

    return () => {
      voiceConversationService.setStateChangeCallback(null);
    };
  }, [setIsSpeaking, api, usesSeparateInputWindow]);

  useEffect(() => {
    if (!usesSeparateInputWindow || isInputWindow || !api?.ipc) return;
    const publish = () =>
      api.ipc?.send("state:voiceSession", { active: _isVoiceMode });
    publish();
    const unsubscribe = api.ipc.on("voice:requestSession", publish);
    voiceConversationService.setErrorCallback((error) => {
      api.ipc?.send("state:voiceSession", {
        active: _isVoiceMode,
        error: getErrorMessage(error),
      });
    });
    return () => {
      unsubscribe?.();
      voiceConversationService.setErrorCallback(null);
    };
  }, [api, _isVoiceMode, usesSeparateInputWindow]);

  useEffect(() => {
    if (isTempChat && currentChatId) {
      historyService.markAsTempChat(currentChatId, true).catch((error) => {
        Logger.error("ChatController", "Failed to mark as temp:", error);
      });
    }
  }, [currentChatId, historyService, isTempChat]);

  /**
   * Desktop: Listen for voice events from input window via IPC
   */
  useEffect(() => {
    if (!isDesktop || isInputWindow || !api?.ipc) return;

    const unsubscribeVoiceTranscription = api.ipc.on(
      "chatInput:voiceTranscription",
      (data: unknown) => {
        Logger.log(
          "ChatController",
          "Voice transcription from input window:",
          data,
        );
        if (typeof data === "string") {
          handleVoiceTranscription(data, null, true);
        } else if (data && typeof data === "object") {
          const payload = data as { text?: string; images?: string[] | null };
          handleVoiceTranscription(
            payload.text ?? "",
            payload.images ?? null,
            true,
          );
        } else {
          handleVoiceTranscription("", null, true);
        }
      },
    );

    const unsubscribeVoiceMode = api.ipc.on(
      "chatInput:voiceMode",
      (isActive: unknown) => {
        Logger.log("ChatController", "Voice mode from input window:", isActive);
        handleVoiceModeChange(Boolean(isActive));
      },
    );

    const unsubscribeVoiceInterrupt = api.ipc.on("voice:interrupt", () => {
      Logger.log("ChatController", "Voice interrupt from input window");
      voiceConversationService.interrupt();
    });

    const unsubscribeVadSpeechDetected = api.ipc.on(
      "voice:vadSpeechDetected",
      () => {
        // Check if TTS is currently playing in main window
        if (
          voiceConversationService.getState() === ConversationStates.SPEAKING
        ) {
          Logger.log(
            "ChatController",
            "VAD speech detected while speaking - interrupting TTS",
          );

          // Dispatch event to trigger force-complete animation
          const event = new CustomEvent("voiceInterrupt");
          window.dispatchEvent(event);

          ttsService.stopPlayback();
          voiceConversationService.interrupt();
        }
      },
    );

    return () => {
      unsubscribeVoiceTranscription?.();
      unsubscribeVoiceMode?.();
      unsubscribeVoiceInterrupt?.();
      unsubscribeVadSpeechDetected?.();
    };
  }, [api, handleVoiceTranscription, handleVoiceModeChange]);

  /**
   * Desktop Main Window: Initialize microphone service and share state with input window.
   */
  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    Logger.log(
      "ChatController",
      "Main window: Initializing microphone service...",
    );

    const broadcastMicState = ({
      devices,
      selectedDeviceId,
    }: {
      devices: MediaDeviceLike[];
      selectedDeviceId: string | null;
    }) => {
      if (!api?.ipc) return;

      const serializedDevices = devices.map((device: MediaDeviceLike) => ({
        deviceId: device.deviceId,
        label: device.label,
        kind: device.kind,
        groupId: device.groupId,
      }));

      api.ipc.send("state:micDevices", {
        devices: serializedDevices,
        selectedDeviceId,
      });
    };

    const unsubscribe = microphoneService.subscribe(broadcastMicState);

    const initMic = async () => {
      try {
        await microphoneService.initialize();
        Logger.log(
          "ChatController",
          "Main window: Microphone initialized successfully",
        );
      } catch (error) {
        Logger.error(
          "ChatController",
          "Main window: Microphone initialization failed:",
          error,
        );
      }
    };
    initMic();

    if (api?.ipc) {
      const unsubscribeRequestState = api.ipc.on("mic:requestState", () => {
        broadcastMicState({
          devices: microphoneService.getDevices(),
          selectedDeviceId: microphoneService.getSelectedDeviceId(),
        });
      });

      const unsubscribeSelectDevice = api.ipc.on(
        "state:selectedMicId",
        (deviceId: unknown) => {
          microphoneService.setSelectedDevice(
            typeof deviceId === "string" ? deviceId : null,
          );
        },
      );

      return () => {
        unsubscribe?.();
        unsubscribeRequestState?.();
        unsubscribeSelectDevice?.();
      };
    }

    return () => {
      unsubscribe?.();
    };
  }, [api]);

  /**
   * Desktop Main Window: Initialize camera and listen for IPC commands from input window
   */
  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    Logger.log("ChatController", "Main window: Initializing camera service...");

    // Subscribe to camera state changes
    const unsubscribe = cameraService.subscribe(
      ({
        devices,
        selectedDeviceId,
        isActive,
      }: {
        devices: MediaDeviceLike[];
        selectedDeviceId: string | null;
        isActive: boolean;
      }) => {
        Logger.log("ChatController", "Camera state changed:", {
          devices: devices.length,
          selectedDeviceId,
          isActive,
        });

        if (api?.ipc) {
          const serializedDevices = devices.map((device: MediaDeviceLike) => ({
            deviceId: device.deviceId,
            label: device.label,
            kind: device.kind,
            groupId: device.groupId,
          }));
          api.ipc.send("state:cameraDevices", {
            devices: serializedDevices,
            selectedDeviceId,
            isActive,
          });
        }
      },
    );

    // Only enumerate camera devices on startup. Camera permission should be requested on explicit toggle.
    const initCamera = async () => {
      try {
        await cameraService.refreshDevices();
        Logger.log(
          "ChatController",
          "Camera devices refreshed without permission prompt",
        );
      } catch (error) {
        Logger.error("ChatController", "Camera device refresh failed:", error);
      }
    };
    initCamera();

    if (api?.ipc) {
      const unsubscribeToggle = api.ipc.on("camera:toggle", async () => {
        Logger.log("ChatController", "IPC: Camera toggle received");
        try {
          if (cameraService.isRunning()) {
            await cameraService.stop();
          } else {
            await cameraService.start();
          }
        } catch (error) {
          Logger.error("ChatController", "Camera toggle failed:", error);
        }
      });

      const unsubscribeSelectDevice = api.ipc.on(
        "camera:selectDevice",
        async (deviceId: unknown) => {
          Logger.log("ChatController", "IPC: Camera select device:", deviceId);
          try {
            if (typeof deviceId === "string") {
              await cameraService.setSelectedDevice(deviceId);
            }
          } catch (error) {
            Logger.error(
              "ChatController",
              "Camera select device failed:",
              error,
            );
          }
        },
      );

      return () => {
        unsubscribe?.();
        unsubscribeToggle?.();
        unsubscribeSelectDevice?.();
      };
    }

    return () => {
      unsubscribe?.();
    };
  }, [api]);

  // Initialize screen share service (Desktop main window only for IPC)
  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    Logger.log(
      "ChatController",
      "Main window: Initializing screen share service...",
    );

    // Subscribe to screen share state changes
    const unsubscribe = screenShareService.subscribe(
      ({ isActive }: { isActive: boolean }) => {
        Logger.log("ChatController", "Screen share state changed:", {
          isActive,
        });

        if (api?.ipc) {
          api.ipc.send("state:screenShare", { isActive });
        }
      },
    );

    const initScreenShare = async () => {
      try {
        await screenShareService.initialize();
        Logger.log("ChatController", "Screen share initialized successfully");
      } catch (error) {
        Logger.error(
          "ChatController",
          "Screen share initialization failed:",
          error,
        );
      }
    };
    initScreenShare();

    if (api?.ipc) {
      const unsubscribeToggle = api.ipc.on("screenShare:toggle", async () => {
        Logger.log("ChatController", "IPC: Screen share toggle received");
        try {
          if (screenShareService.isRunning()) {
            await screenShareService.stop();
          } else {
            await screenShareService.start();
          }
        } catch (error) {
          Logger.error("ChatController", "Screen share toggle failed:", error);
        }
      });

      return () => {
        unsubscribe?.();
        unsubscribeToggle?.();
      };
    }

    return () => {
      unsubscribe?.();
    };
  }, [api]);

  /**
   * Abort streaming when chat is closed to stop TTS generation
   */
  useEffect(() => {
    if (!isChatContainerVisible && streamAbortControllerRef.current) {
      Logger.log(
        "ChatController",
        "Chat closed, aborting TTS generation stream",
      );
      streamAbortControllerRef.current.abort();
      streamAbortControllerRef.current = null;
      ttsService.stopPlayback();
    }
  }, [isChatContainerVisible]);

  /**
   * Listen for stop generation event (from stop button, shortcuts, etc.)
   */
  useEffect(() => {
    const handleAbortGeneration = () => {
      if (streamAbortControllerRef.current) {
        Logger.log(
          "ChatController",
          "Stop generation event received, aborting TTS stream",
        );
        streamAbortControllerRef.current.abort();
        streamAbortControllerRef.current = null;
        ttsService.stopPlayback();
      }
    };

    window.addEventListener("abortTTSGeneration", handleAbortGeneration);

    return () => {
      window.removeEventListener("abortTTSGeneration", handleAbortGeneration);
    };
  }, []);

  /**
   * Get system prompt from AI config based on provider and prompt type
   * @param {Object} aiConfig - AI configuration object
   * @returns {string} System prompt text
   */

  /**
   * Handles the assistant control dock click to toggle chat visibility.
   */
  const handleAssistantControlClick = useCallback(() => {
    if (!chatEnabled) {
      return;
    }

    Logger.log("ChatController", "Chat button clicked");
    if (avatarOnly && api?.ipc) {
      api.ipc.send("desktop:toggle-chat-window");
      return;
    }
    if (requireSetupOnChatClick) {
      Logger.log(
        "ChatController",
        "Setup required before chat - opening setup wizard",
      );
      emitEmbedHostEvent("require-setup", undefined, embedConfig.mount.hostId);
      onRequireSetup?.();
      return;
    }

    if (isChatContainerVisible || isChatInputVisible) {
      Logger.log("ChatController", "Closing chat");
      setIsChatInputVisible(false);
      setIsChatContainerVisible(false);
      ttsService.stopPlayback();
    } else {
      Logger.log("ChatController", "Opening chat");
      setIsChatInputVisible(true);
      setIsChatContainerVisible(true);

      // Focus input after chat opens (skip on Android to avoid keyboard popup)
      if (!isAndroid) {
        setTimeout(() => {
          const event = new CustomEvent("focusChatInput");
          window.dispatchEvent(event);
        }, 100);
      }
    }
  }, [
    chatEnabled,
    embedConfig.mount.hostId,
    requireSetupOnChatClick,
    onRequireSetup,
    isChatContainerVisible,
    isChatInputVisible,
    setIsChatInputVisible,
    setIsChatContainerVisible,
    avatarOnly,
    api,
  ]);

  useEffect(() => {
    if (!isDetachedChatWindow || !api?.ipc) return;

    return api.ipc.on("desktop:toggle-chat", () => {
      handleAssistantControlClick();
    });
  }, [api, handleAssistantControlClick]);

  /**
   * Handles chat open from drag-drop.
   */
  const handleChatOpen = useCallback(() => {
    if (!chatEnabled) {
      return;
    }

    if (!isChatInputVisible || !isChatContainerVisible) {
      Logger.log("ChatController", "Opening chat from drag-drop");
      setIsChatInputVisible(true);
      setIsChatContainerVisible(true);

      // Focus input after chat opens (skip on Android to avoid keyboard popup)
      if (!isAndroid) {
        setTimeout(() => {
          const event = new CustomEvent("focusChatInput");
          window.dispatchEvent(event);
        }, 100);
      }
    }
  }, [
    isChatInputVisible,
    isChatContainerVisible,
    setIsChatInputVisible,
    setIsChatContainerVisible,
    chatEnabled,
  ]);

  /**
   * Listens for open chat from drag events.
   */
  useEffect(() => {
    if (!chatEnabled) {
      return;
    }

    const handleOpenChatFromDrag = () => {
      handleChatOpen();
    };

    window.addEventListener("openChatFromDrag", handleOpenChatFromDrag);

    return () => {
      window.removeEventListener("openChatFromDrag", handleOpenChatFromDrag);
    };
  }, [chatEnabled, handleChatOpen]);

  useEffect(() => {
    if (!chatEnabled) return;
    if (!isAndroid || !modelDisabled) return;
    if (!isAssistantReady) return;
    if (hasAutoOpenedAndroidChatRef.current) return;
    if (isChatContainerVisible || isChatInputVisible) return;

    hasAutoOpenedAndroidChatRef.current = true;
    Logger.log(
      "ChatController",
      "Auto-opening chat on Android in chat-only mode",
    );
    setIsChatInputVisible(true);
    setIsChatContainerVisible(true);
  }, [
    modelDisabled,
    isAssistantReady,
    isChatContainerVisible,
    isChatInputVisible,
    setIsChatInputVisible,
    setIsChatContainerVisible,
    chatEnabled,
  ]);

  useEffect(() => {
    if (
      !chatEnabled ||
      !isNormalDesktop ||
      requireSetupOnChatClick ||
      hasAutoOpenedNormalChatRef.current
    ) {
      return;
    }

    if (isChatContainerVisible || isChatInputVisible) {
      hasAutoOpenedNormalChatRef.current = true;
      return;
    }

    hasAutoOpenedNormalChatRef.current = true;
    Logger.log("ChatController", "Auto-opening chat in normal desktop mode");
    setIsChatInputVisible(true);
    setIsChatContainerVisible(true);
  }, [
    chatEnabled,
    isChatContainerVisible,
    isChatInputVisible,
    isNormalDesktop,
    requireSetupOnChatClick,
    setIsChatContainerVisible,
    setIsChatInputVisible,
  ]);

  /**
   * Listens for drag-drop events and stores as pending if chat isn't open yet.
   */
  useEffect(() => {
    const handleChatDragDropEvent = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      Logger.log(
        "ChatController",
        "chatDragDrop event received:",
        event.detail,
      );

      if (!isChatInputVisible) {
        Logger.log(
          "ChatController",
          "Storing drop data as pending (chat not open yet)",
        );
        setPendingDropData(event.detail as never);
      }
    };

    window.addEventListener("chatDragDrop", handleChatDragDropEvent);

    return () => {
      window.removeEventListener("chatDragDrop", handleChatDragDropEvent);
    };
  }, [isChatInputVisible, setPendingDropData]);

  /**
   * Handles chat input close with fade-out animation.
   */
  const handleChatInputClose = () => {
    Logger.log("ChatController", "Chat input closed");

    const event = new CustomEvent("closeChat");
    window.dispatchEvent(event);

    setIsChatInputVisible(false);
  };

  const handleDesktopChatInputSend = useEffectEvent((payload: unknown) => {
    const data =
      payload && typeof payload === "object"
        ? (payload as {
            message?: string;
            images?: string[] | null;
            audios?: string[] | null;
          })
        : {};
    const message = data.message ?? "";
    const images = data.images ?? null;
    const audios = data.audios ?? null;

    Logger.log("ChatController", "Received send from input window via IPC", {
      message,
      images,
      audios,
    });

    void handleMessageSend(message, images, audios);
  });

  const handleDesktopChatInputClose = useEffectEvent(() => {
    Logger.log("ChatController", "Received close from input window via IPC");
    closeChat();
  });

  const handleDesktopQuickPanelToggle = useEffectEvent(() => {
    setIsSettingsPanelOpen(false);
    setIsHistoryPanelOpen(false);
    setIsQuickPanelOpen((previous) => !previous);
  });

  const responseDependencies = {
    chatSession,
    chatService,
    streamAbortControllerRef,
    aiService,
    ttsService,
    storageService,
    documentInteractionService,
    getSystemPromptFromConfig,
    canUseAssistant,
    triggerAssistantAction,
    idleAssistant,
    setChatMessages,
    setIsProcessing,
    getErrorMessage,
    voiceConversationService,
    setAssistantState,
  };

  /**
   * Handles text message submission.
   *
   * @param {string} message - User message
   * @param {Array} images - Image attachments
   * @param {Array} audios - Audio attachments
   */
  const executeMessageSend = (
    message: string,
    images: string[] | null = null,
    audios: string[] | null = null,
  ) =>
    sendChatMessage(
      {
        ...responseDependencies,
        appStore,
        historyService,
        sourceUrl: window.location.href,
      },
      message,
      images,
      audios,
    );
  const latestSender = useRef(executeMessageSend);
  useEffect(() => {
    latestSender.current = executeMessageSend;
  });
  useEffect(
    () =>
      chatSession.registerSender((...args) => latestSender.current(...args)),
    [chatSession],
  );
  const handleMessageSend = (
    message: string,
    images: string[] | null = null,
    audios: string[] | null = null,
  ) => chatSession.execute({ type: "send", text: message, images, audios });

  /**
   * Register transcription callback with VoiceConversationService
   * Main window only - ChatInput not rendered in desktop main window
   */
  useEffect(() => {
    if (isInputWindow || !usesSeparateInputWindow) return;

    voiceConversationService.setTranscriptionCallback(handleVoiceTranscription);

    return () => {
      voiceConversationService.setTranscriptionCallback(null);
    };
  }, [handleVoiceTranscription, usesSeparateInputWindow]);

  /**
   * IPC bridge for desktop mode - listen for events from input window
   */
  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    if (!api?.ipc) return;

    const unsubscribeSend = api.ipc.on("chatInput:send", (payload: unknown) => {
      handleDesktopChatInputSend(payload);
    });

    const unsubscribePendingDrop = api.ipc.on(
      "chatInput:setPendingDropData",
      (data: unknown) => {
        Logger.log(
          "ChatController",
          "Received setPendingDropData from input window via IPC",
          data,
        );
        setPendingDropData(data as never);
      },
    );

    const unsubscribeClose = api.ipc.on("chatInput:close", () => {
      handleDesktopChatInputClose();
    });

    const unsubscribeQuickPanel = api.ipc.on(
      "chatInput:toggleQuickPanel",
      () => {
        handleDesktopQuickPanelToggle();
      },
    );

    const unsubscribeConfig = api.ipc.on(
      "chatInput:thinkingChanged",
      (data: unknown) => {
        if (!data || typeof data !== "object") return;
        const payload = data as { section?: unknown; enabled?: unknown };
        const validSections = new Set([
          "chromeAi",
          "openai",
          "ollama",
          "android-local",
          "desktop-local",
        ]);
        if (
          typeof payload.section !== "string" ||
          !validSections.has(payload.section) ||
          typeof payload.enabled !== "boolean"
        ) {
          Logger.warn("ChatController", "Ignored invalid thinking change");
          return;
        }
        Logger.log(
          "ChatController",
          "Thinking change from input window:",
          payload,
        );
        updateAIConfig(`${payload.section}.thinkingEnabled`, payload.enabled);
      },
    );

    return () => {
      unsubscribeSend?.();
      unsubscribePendingDrop?.();
      unsubscribeClose?.();
      unsubscribeQuickPanel?.();
      unsubscribeConfig?.();
    };
  }, [
    setPendingDropData,
    api,
    updateAIConfig,
    handleDesktopChatInputClose,
    handleDesktopQuickPanelToggle,
    handleDesktopChatInputSend,
  ]);

  /**
   * IPC state broadcast for desktop mode - send state changes to input window
   * This runs only in the main window to broadcast state to input window
   */
  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    if (!api?.ipc) return;

    api.ipc.send("state:isChatInputVisible", isChatInputVisible);
  }, [isChatInputVisible, api]);

  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    if (!api?.ipc) return;

    api.ipc.send("state:pendingDropData", pendingDropData);
  }, [pendingDropData, api]);

  /**
   * Desktop main window: handle input-window STT mic toggle and state relay.
   * ChatInput is not rendered in desktop main window, so this must live here.
   */
  useEffect(() => {
    if (!usesSeparateInputWindow || isInputWindow || !api?.ipc) {
      return;
    }

    const ipc = api.ipc;

    const sendSttState = (payload = {}) => {
      ipc.send("state:sttRecording", payload);
    };

    const ensureSttCallbacks = () => {
      sttService.setTranscriptionCallback((text: string) => {
        inputWindowSttProcessingRef.current = false;
        ipc.send("stt:transcriptionReceived", text);
      });

      sttService.setErrorCallback((error: unknown) => {
        inputWindowSttRecordingRef.current = false;
        inputWindowSttProcessingRef.current = false;
        sendSttState({
          isRecording: false,
          isProcessing: false,
          error: getErrorMessage(error) || "Recording failed",
        });
      });

      sttService.setRecordingStartCallback(() => {
        inputWindowSttRecordingRef.current = true;
        inputWindowSttProcessingRef.current = false;
        sendSttState({
          isRecording: true,
          isProcessing: false,
          error: "",
        });
      });

      sttService.setRecordingStopCallback(() => {
        inputWindowSttRecordingRef.current = false;
        inputWindowSttProcessingRef.current = false;
        sendSttState({
          isRecording: false,
          isProcessing: false,
          error: "",
        });
      });
    };

    ensureSttCallbacks();

    const unsubscribeMicCancel = ipc.on("chatInput:micCancel", () => {
      inputWindowSttRecordingRef.current = false;
      inputWindowSttProcessingRef.current = false;
      sttService.cancelRecording();
      sendSttState({ isRecording: false, isProcessing: false, error: "" });
    });

    const unsubscribeMicToggle = ipc.on("chatInput:micToggle", async () => {
      ensureSttCallbacks();

      if (!(await sttService.isConfigured())) {
        sendSttState({
          isRecording: false,
          isProcessing: false,
          error: "STT not configured. Please configure in Control Panel.",
        });
        return;
      }

      if (_isVoiceMode || voiceConversationService.isConversationActive()) {
        sendSttState({
          isRecording: false,
          isProcessing: false,
          error: "Voice call is active. Stop voice call first.",
        });
        return;
      }

      if (inputWindowSttProcessingRef.current) {
        sendSttState({
          isRecording: inputWindowSttRecordingRef.current,
          isProcessing: true,
          error: "",
        });
        return;
      }

      try {
        if (inputWindowSttRecordingRef.current) {
          inputWindowSttProcessingRef.current = true;
          inputWindowSttRecordingRef.current = false;
          sendSttState({
            isRecording: false,
            isProcessing: true,
            error: "",
          });
          sttService.stopRecording();
        } else {
          inputWindowSttProcessingRef.current = true;
          sendSttState({
            isRecording: false,
            isProcessing: true,
            error: "",
          });
          ttsService.stopPlayback();
          await VoiceConversationService.waitForStop();
          const started = await sttService.startRecording();
          if (!started) {
            inputWindowSttProcessingRef.current = false;
            sendSttState({
              isRecording: inputWindowSttRecordingRef.current,
              isProcessing: false,
            });
          }
        }
      } catch (error) {
        inputWindowSttRecordingRef.current = false;
        inputWindowSttProcessingRef.current = false;
        sendSttState({
          isRecording: false,
          isProcessing: false,
          error: getErrorMessage(error) || "Microphone access denied",
        });
      }
    });

    return () => {
      unsubscribeMicCancel?.();
      unsubscribeMicToggle?.();
      sttService.setTranscriptionCallback(null);
      sttService.setErrorCallback(null);
      sttService.setRecordingStartCallback(null);
      sttService.setRecordingStopCallback(null);
    };
  }, [api, _isVoiceMode, usesSeparateInputWindow]);

  /**
   * Handles drag-drop onto ChatContainer.
   * Forwards dropped content to ChatInput.
   *
   * @param {Object} dropData - Drop data with text/images/audios
   */
  const handleDragDrop = useCallback(
    (dropData: {
      text?: string;
      images?: string[];
      audios?: string[];
      errors?: string[];
    }) => {
      Logger.log("ChatController", "Drag drop received:", dropData);

      const normalizedData = {
        text: dropData.text || "",
        images: dropData.images || [],
        audios: dropData.audios || [],
        errors: dropData.errors || [],
      };

      const event = new CustomEvent("chatDragDrop", {
        detail: normalizedData,
      });
      window.dispatchEvent(event);
    },
    [],
  );

  /**
   * Handles streaming regeneration (called by AppContext).
   */
  const handleRegenerateWithStreaming = () =>
    regenerateChatResponse(responseDependencies);

  useEffect(() => {
    if (regenerateWithStreamingRef) {
      regenerateWithStreamingRef.current = handleRegenerateWithStreaming;
    }
    if (editWithStreamingRef) {
      editWithStreamingRef.current = handleRegenerateWithStreaming;
    }
  });

  return (
    <>
      {/* Desktop input window manager */}
      {!avatarOnly && !isInputWindow && isDesktop && !isNormalDesktop && (
        <Suspense fallback={null}>
          <InputWindowManager />
        </Suspense>
      )}

      {/* AI Toolbar - appears on text/image selection */}
      {toolbarEnabled ? (
        <Suspense fallback={null}>
          <AIToolbar />
        </Suspense>
      ) : null}

      {chatEnabled ? (
        <>
          {/* Assistant control dock visibility logic:
              - Model enabled: visible when model ready, HIDE when chat opens (model is anchor)
              - Model disabled: ALWAYS visible (button is anchor, needed for dragging) */}
          {(!avatarOnly || !modelDisabled) && (
            <Suspense fallback={null}>
              <AssistantControlDock
                onClick={handleAssistantControlClick}
                isVisible={
                  xr.active || modelDisabled
                    ? true
                    : isDesktop || isNormalDesktop
                      ? true
                      : isAssistantReady &&
                        !(isChatContainerVisible || isChatInputVisible)
                }
                modelDisabled={modelDisabled}
                isChatOpen={isChatContainerVisible || isChatInputVisible}
                chatInputRef={chatInputRef}
              />
            </Suspense>
          )}

          {/* Chat Input - bottom screen */}
          {(!isDesktop ||
            isNormalDesktop ||
            (isLiveWallpaperWindow && !isDetachedChatWindow)) &&
            !avatarOnly && (
              <Suspense fallback={null}>
                <XrSurface
                  id="composer"
                  widthMeters={0.85}
                  heightMeters={0.36}
                  widthPixels={850}
                  heightPixels={360}
                  offsetMeters={[0, -0.4, -0.15]}
                >
                  <ChatInputTyped
                    ref={chatInputRef}
                    onSend={handleMessageSend}
                    onClose={handleChatInputClose}
                    onVoiceTranscription={handleVoiceTranscription}
                    onVoiceMode={handleVoiceModeChange}
                    embedConfig={embedConfig}
                  />
                </XrSurface>
              </Suspense>
            )}

          {/* Chat Container - message bubbles */}
          {!avatarOnly && (
            <Suspense fallback={null}>
              <ChatContainer
                modelDisabled={modelDisabled}
                normalDesktop={isNormalDesktop}
                chatInputRef={chatInputRef}
                onDragDrop={handleDragDrop}
                embedConfig={embedConfig}
              />
            </Suspense>
          )}

          {isDetachedChatWindow &&
            !avatarOnly &&
            (isChatContainerVisible || isChatInputVisible) && (
              <Suspense fallback={null}>
                <DetachedChatResizeHandle />
              </Suspense>
            )}
        </>
      ) : null}
    </>
  );
};

export default ChatController;
