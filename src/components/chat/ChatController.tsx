/**
 * @fileoverview Main chat controller managing chat UI, streaming, and voice conversation.
 */

import {
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
import ChatButton from "./ChatButton";
import ChatInput from "./ChatInput";
import ChatContainer from "./ChatContainer";
import AIToolbar from "../toolbar/AIToolbar";
import { InputWindowManager } from "../desktop/InputWindowManager";
import {
  type ResolvedVAssistEmbedConfig,
  type VAssistMessageEventPayload,
} from "../../embed/config";
import { useAppRuntimeServices } from "../../contexts/AppRuntimeContext";
import { emitEmbedHostEvent } from "../../embed/runtimeStore";
import { toChatMessageItems } from "../../stores/createAppStore";
import {
  AIServiceProxy,
  TTSServiceProxy,
  STTServiceProxy,
  StorageServiceProxy,
} from "../../services/proxies";
import DocumentInteractionService from "../../services/DocumentInteractionService";
import VoiceConversationService, {
  ConversationStates,
} from "../../services/VoiceConversationService";
import { DefaultAIConfig, DefaultTTSConfig } from "../../config/aiConfig";
import { PromptConfig } from "../../config/promptConfig";
import {
  useAssistantRef,
  useIsAssistantReady,
} from "../../hooks/app/useAssistant";
import {
  useChatActions,
  useChatMessages,
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
import Logger from "../../services/LoggerService";
import { isAndroid, isDesktop, isInputWindow } from "../../utils/PlatformUtils";
import MicrophoneService from "../../services/MicrophoneService";
import CameraService from "../../services/CameraService";
import ScreenShareService from "../../services/ScreenShareService";

type ConversationState =
  (typeof ConversationStates)[keyof typeof ConversationStates];

interface ChatControllerProps {
  modelDisabled?: boolean;
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

interface ChatServiceLike {
  addMessage: (
    role: string,
    content: string,
    images?: string[] | null,
    audios?: string[] | null,
  ) => void;
  getMessages: () => ChatMessageLike[];
  getFormattedMessages: (systemPrompt: string) => AIMessage[];
  getLastUserMessage: () => ChatMessageLike | null;
  updateLastMessage: (content: string) => void;
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

interface AIMessage {
  role: string;
  content: string;
  images?: string[];
  audios?: string[];
}

interface AIResult {
  success: boolean;
  cancelled?: boolean;
  error?: { message?: string } | unknown;
}

interface AIServiceLike {
  isConfigured: () => boolean;
  sendMessage: (
    messages: AIMessage[],
    onStream?: (chunk: string) => void | Promise<void>,
    options?: unknown,
  ) => Promise<AIResult>;
  isGenerating: () => boolean;
  abortRequest: () => void;
}

interface TTSGenerateResult {
  audio?: Blob | ArrayBuffer;
  bvmdUrl?: string;
}

interface TTSServiceLike {
  isConfigured: () => boolean;
  resumePlayback: () => void;
  stopPlayback: () => void;
  generateSpeech: (
    text: string,
    withLipSync?: boolean,
  ) => Promise<TTSGenerateResult | null>;
  queueAudio: (
    text: string,
    audioUrl: string,
    bvmdUrl?: string,
    sessionId?: string,
  ) => void;
  getQueueLength: () => number;
  addEventListener: (eventName: string, callback: () => void) => void;
  removeEventListener: (eventName: string, callback: () => void) => void;
  resetSessionFlags: () => void;
  markSessionComplete: (sessionId: string) => void;
  isStopped?: boolean;
}

interface STTServiceLike {
  isConfigured: () => boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  setTranscriptionCallback: (callback: ((text: string) => void) | null) => void;
  setErrorCallback: (callback: ((error: unknown) => void) | null) => void;
  setRecordingStartCallback: (callback: (() => void) | null) => void;
  setRecordingStopCallback: (callback: (() => void) | null) => void;
}

interface StorageServiceLike {
  configLoad: <T>(key: string, defaultValue?: T) => Promise<T>;
}

interface VoiceConversationServiceLike {
  start: () => Promise<void>;
  stop: () => void;
  interrupt: () => void;
  changeState: (state: ConversationState) => void;
  setStateChangeCallback: (
    callback: ((state: ConversationState) => void) | null,
  ) => void;
  setTranscriptionCallback: (
    callback: ((text: string, images?: string[] | null) => void) | null,
  ) => void;
  isConversationActive: () => boolean;
  getState: () => ConversationState;
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

interface DocumentInteractionServiceLike {
  getContextForQuery: (
    query: string,
    aiSendMessage: (
      messages: AIMessage[],
      onStream?: (chunk: string) => void | Promise<void>,
      options?: unknown,
    ) => Promise<AIResult>,
    abortSignal?: AbortSignal,
  ) => Promise<string | null>;
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
  requireSetupOnChatClick = false,
  onRequireSetup,
  embedConfig,
}: ChatControllerProps) => {
  const { chatService, chatHistoryService } = useAppRuntimeServices();
  const api = useDesktopApi() as DesktopApiForChatController | null;
  const chatInputRef = useRef<HTMLElement | null>(null);
  const streamAbortControllerRef = useRef<AbortController | null>(null); // Track current stream to allow cancellation
  const hasAutoOpenedAndroidChatRef = useRef(false);
  const inputWindowSttRecordingRef = useRef(false);
  const inputWindowSttProcessingRef = useRef(false);
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
    setCurrentChatId,
    setPendingDropData,
    closeChat,
  } = useChatActions();
  const _isVoiceMode = useIsVoiceMode();
  const { setIsVoiceMode, setIsSpeaking } = usePlaybackActions();
  const { regenerateWithStreamingRef, editWithStreamingRef } =
    useToolingActions();
  const previousChatOpenRef = useRef(false);
  const seenMessageIdsRef = useRef<Set<string>>(
    new Set(chatMessages.map((message) => message.id)),
  );
  const chatEnabled = embedConfig.features.chat;
  const toolbarEnabled = embedConfig.features.aiToolbar;

  const assistantRef =
    appAssistantRef as MutableRefObject<AssistantHandle | null>;

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
    return assistantRef.current?.isReady?.() === true;
  }, [assistantRef]);

  useDesktopWindowResize();

  /**
   * Handles AI response in voice mode.
   * Gets AI response and speaks it through VoiceConversationService.
   */
  const handleVoiceAIResponse = useCallback(async () => {
    const abortController = new AbortController();
    streamAbortControllerRef.current = abortController;

    setIsProcessing(true);

    if (!aiService.isConfigured()) {
      chatService.addMessage(
        "assistant",
        "Error: AI not configured. Please configure in Control Panel.",
      );
      setChatMessages(toChatMessageItems(chatService.getMessages()));
      streamAbortControllerRef.current = null;
      setIsProcessing(false);
      voiceConversationService.changeState(ConversationStates.LISTENING);
      return;
    }

    Logger.log("ChatController", "[Voice] Checking assistant ready state:", {
      hasRef: !!assistantRef.current,
      isReady: assistantRef.current?.isReady?.(),
    });

    if (canUseAssistant()) {
      Logger.log(
        "ChatController",
        "[Voice] Starting BUSY state (thinking animation)",
      );
      await assistantRef.current?.setState("BUSY");
      Logger.log("ChatController", "[Voice] BUSY state set successfully");
    } else {
      Logger.warn(
        "ChatController",
        "[Voice] Assistant not ready, skipping BUSY state",
      );
    }

    let voiceAIConfig = DefaultAIConfig;
    let voiceTTSConfig = DefaultTTSConfig;
    try {
      voiceAIConfig = await storageService.configLoad(
        "aiConfig",
        DefaultAIConfig,
      );
      voiceTTSConfig = await storageService.configLoad(
        "ttsConfig",
        DefaultTTSConfig,
      );
    } catch (error) {
      Logger.error(
        "ChatController",
        "Failed to load configs in handleVoiceAIResponse:",
        error,
      );
    }

    const systemPrompt = getSystemPromptFromConfig(voiceAIConfig);
    const ttsEnabled = voiceTTSConfig.enabled && ttsService.isConfigured();

    const messages = chatService.getFormattedMessages(systemPrompt);

    const lastUserMessage = chatService.getLastUserMessage();
    const hasAttachments =
      lastUserMessage &&
      ((lastUserMessage.images && lastUserMessage.images.length > 0) ||
        (lastUserMessage.audios && lastUserMessage.audios.length > 0));

    if (
      lastUserMessage &&
      lastUserMessage.content &&
      !hasAttachments &&
      !isAndroid &&
      !isDesktop
    ) {
      if (abortController.signal.aborted) {
        Logger.log(
          "ChatController",
          "[Voice] Document interaction cancelled before starting",
        );
        streamAbortControllerRef.current = null;
        return;
      }

      try {
        const aiSendMessage = async (
          aiMessages: AIMessage[],
          onStream?: (chunk: string) => void | Promise<void>,
          options?: unknown,
        ): Promise<AIResult> => {
          return await aiService.sendMessage(aiMessages, onStream, options);
        };

        const pageContext = await documentInteractionService.getContextForQuery(
          lastUserMessage.content,
          aiSendMessage,
          abortController.signal,
        );

        if (abortController.signal.aborted) {
          Logger.log(
            "ChatController",
            "[Voice] Stream cancelled after document interaction",
          );
          streamAbortControllerRef.current = null;
          return;
        }

        if (pageContext) {
          Logger.log(
            "ChatController",
            "[Voice] Injecting page context into AI prompt",
          );
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === "user") {
            lastMessage.content = pageContext + lastMessage.content;
          }
        }
      } catch (error) {
        Logger.warn(
          "ChatController",
          "[Voice] Failed to extract page context:",
          error,
        );
      }
    } else if (hasAttachments) {
      Logger.log(
        "ChatController",
        "[Voice] Skipping document interaction - user has attachments (images/audios)",
      );
    }

    if (ttsEnabled) {
      ttsService.resumePlayback();
    }

    let fullResponse = "";
    let fullResponseRaw = "";
    let previousDisplayLength = 0;
    let hasSwitchedToSpeaking = false;
    let textBuffer = "";
    const allChunks: string[] = [];
    let nextChunkToGenerate = 0;
    const MAX_QUEUED_AUDIO = 3;
    let isGeneratingChunk = false;

    const voiceTTSSessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const generateTTSChunk = async (chunkIndex: number) => {
      if (chunkIndex >= allChunks.length) return;

      const chunkText = allChunks[chunkIndex];
      if (!chunkText) {
        return;
      }

      try {
        const queueLength = ttsService.getQueueLength();
        Logger.log(
          "ChatController",
          `[Voice] Generating TTS+lip sync chunk ${chunkIndex}: "${chunkText.substring(0, 50)}..." (queue: ${queueLength})`,
        );

        const result = await ttsService.generateSpeech(chunkText, true);

        if (!result || !result.audio) {
          Logger.warn(
            "ChatController",
            `[Voice] TTS generation returned null for chunk ${chunkIndex}`,
          );
          return;
        }

        const { audio, bvmdUrl } = result;

        const audioBlob =
          audio instanceof Blob
            ? audio
            : new Blob([audio], { type: "audio/mp3" });
        const audioUrl = URL.createObjectURL(audioBlob);

        ttsService.queueAudio(chunkText, audioUrl, bvmdUrl, voiceTTSSessionId);

        Logger.log(
          "ChatController",
          `[Voice] TTS chunk ${chunkIndex} queued${bvmdUrl ? " with lip sync" : ""} (queue now: ${ttsService.getQueueLength()})`,
        );
      } catch (error) {
        Logger.error(
          "ChatController",
          "[Voice] TTS chunk ${chunkIndex} failed:",
          error,
        );
      }
    };

    const tryGenerateNextChunk = async () => {
      if (isGeneratingChunk) {
        return;
      }

      const queueLength = ttsService.getQueueLength();
      if (
        queueLength < MAX_QUEUED_AUDIO &&
        nextChunkToGenerate < allChunks.length
      ) {
        isGeneratingChunk = true;
        await generateTTSChunk(nextChunkToGenerate++);
        isGeneratingChunk = false;

        tryGenerateNextChunk();
      }
    };

    const handleAudioFinished = () => {
      tryGenerateNextChunk();
    };
    ttsService.addEventListener("audioFinished", handleAudioFinished);

    if (ttsEnabled) {
      Logger.log(
        "ChatController",
        `[Voice] Starting TTS session ${voiceTTSSessionId} (not marking complete until LLM done)`,
      );
    }

    const result = await aiService.sendMessage(
      messages as AIMessage[],
      async (chunk: string) => {
        if (abortController.signal.aborted) {
          Logger.log(
            "ChatController",
            "[Voice] Streaming callback aborted, ignoring chunk",
          );
          return;
        }

        fullResponseRaw += chunk;

        let displayResponse = fullResponseRaw.replace(
          /<think>[\s\S]*?<\/think>/g,
          "",
        );
        displayResponse = displayResponse.replace(/<think>.*$/s, "");
        displayResponse = displayResponse.replace(/^\s+/, "");

        fullResponse = displayResponse;

        const newContent = displayResponse.slice(previousDisplayLength);
        textBuffer += newContent;
        previousDisplayLength = displayResponse.length;

        const currentMessages = chatService.getMessages();
        if (
          currentMessages.length > 0 &&
          currentMessages[currentMessages.length - 1]?.role === "assistant"
        ) {
          chatService.updateLastMessage(fullResponse);
        } else {
          chatService.addMessage("assistant", fullResponse);
        }
        setChatMessages(toChatMessageItems(chatService.getMessages()));

        if (
          !ttsEnabled &&
          !hasSwitchedToSpeaking &&
          fullResponse.length > 10 &&
          canUseAssistant()
        ) {
          Logger.log(
            "ChatController",
            "[Voice] Starting speaking animation (no TTS)",
          );
          assistantRef.current?.triggerAction("speak");
          hasSwitchedToSpeaking = true;
        }

        if (ttsEnabled) {
          const sentenceEnd = /[.!?:]\s|[.!?:]\n|\n/.exec(textBuffer);

          if (sentenceEnd) {
            const chunkToSpeak = textBuffer
              .substring(0, sentenceEnd.index + sentenceEnd[0].length)
              .trim();
            textBuffer = textBuffer.substring(
              sentenceEnd.index + sentenceEnd[0].length,
            );

            if (
              chunkToSpeak &&
              chunkToSpeak.length >= 3 &&
              chunkToSpeak.trim().length >= 3
            ) {
              allChunks.push(chunkToSpeak);
              tryGenerateNextChunk();
            }
          }
        }
      },
    );

    if (result.cancelled) {
      Logger.log("ChatController", "Voice generation cancelled by user");
      voiceConversationService.changeState(ConversationStates.LISTENING);
      if (canUseAssistant()) {
        assistantRef.current?.idle();
      }
      streamAbortControllerRef.current = null;
      setIsProcessing(false);
      return;
    }

    if (!result.success) {
      Logger.error("ChatController", "Voice AI error:", result.error);
      const voiceErrorMessage = getErrorMessage(result.error);
      chatService.addMessage("assistant", `Error: ${voiceErrorMessage}`);
      setChatMessages(toChatMessageItems(chatService.getMessages()));
      voiceConversationService.changeState(ConversationStates.LISTENING);
      if (canUseAssistant()) {
        assistantRef.current?.idle();
      }
      streamAbortControllerRef.current = null;
      setIsProcessing(false);
      return;
    }

    Logger.log("ChatController", "[Voice] AI response complete:", fullResponse);

    if (ttsEnabled && textBuffer.trim().length > 0) {
      const finalChunk = textBuffer.trim();
      allChunks.push(finalChunk);
      tryGenerateNextChunk();
    }

    if (ttsEnabled && allChunks.length > 0) {
      voiceConversationService.changeState(ConversationStates.GENERATING_VOICE);
      Logger.log(
        "ChatController",
        `[Voice] Transitioning to GENERATING_VOICE state (${allChunks.length} TTS chunks to generate)`,
      );

      ttsService.resetSessionFlags();

      Logger.log(
        "ChatController",
        `[Voice] Waiting for ${allChunks.length} TTS chunks to generate and queue...`,
      );

      while (nextChunkToGenerate < allChunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      Logger.log(
        "ChatController",
        "[Voice] All TTS chunks generated and queued",
      );

      ttsService.markSessionComplete(voiceTTSSessionId);
      Logger.log(
        "ChatController",
        `[Voice] Session ${voiceTTSSessionId} marked complete`,
      );
    } else {
      Logger.warn(
        "ChatController",
        "[Voice] No TTS generated, returning to listening",
      );
      voiceConversationService.changeState(ConversationStates.LISTENING);
    }

    ttsService.removeEventListener("audioFinished", handleAudioFinished);

    streamAbortControllerRef.current = null;
    setIsProcessing(false);
  }, [
    setIsProcessing,
    setChatMessages,
    assistantRef,
    canUseAssistant,
    chatService,
  ]);

  const handleVoiceTranscription = useCallback(
    async (
      text: string,
      images: string[] | null = null,
      skipForward = false,
    ) => {
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
      if (!skipForward && isDesktop && !isInputWindow && api?.ipc) {
        Logger.log(
          "ChatController",
          "Forwarding transcription to input window for image attachment",
        );
        api.ipc.send("voice:transcriptionReceived", text);
        // Input window will send back via chatInput:voiceTranscription with images array
        return;
      }

      // Add message and process
      chatService.addMessage("user", text, images, null);
      setChatMessages(toChatMessageItems(chatService.getMessages()));

      await handleVoiceAIResponse();
    },
    [setChatMessages, handleVoiceAIResponse, api, chatService],
  );

  const handleVoiceModeChange = useCallback(
    async (active: boolean) => {
      Logger.log("ChatController", "Voice mode changed:", active);
      setIsVoiceMode(active);

      if (isDesktop && !isInputWindow) {
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
        }
      }
    },
    [setIsVoiceMode],
  );

  /**
   * Track voice conversation state to update isSpeaking
   * Web/Android: ChatInput registers callback directly, don't register here to avoid overwriting
   */
  useEffect(() => {
    // Only register in desktop main window
    // Web/Android: ChatInput handles state callback to avoid overwriting
    if (isInputWindow || !isDesktop) return;

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
  }, [setIsSpeaking, api]);

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
  const getSystemPromptFromConfig = (
    aiConfig: Record<string, unknown> | null | undefined,
  ): string => {
    if (!aiConfig || !aiConfig.provider) {
      return PromptConfig.systemPrompts.default.prompt;
    }

    const provider =
      typeof aiConfig.provider === "string" ? aiConfig.provider : "";
    const providerKey = provider === "chrome-ai" ? "chromeAi" : provider;
    const providerConfig = aiConfig[providerKey] as
      | {
          selectedSystemPromptProfileId?: string;
          systemPromptProfiles?: Array<{ id?: string; prompt?: string }>;
        }
      | undefined;

    if (!providerConfig) {
      return PromptConfig.systemPrompts.default.prompt;
    }

    const profiles = Array.isArray(providerConfig.systemPromptProfiles)
      ? providerConfig.systemPromptProfiles
      : [];
    const selectedProfileId =
      typeof providerConfig.selectedSystemPromptProfileId === "string"
        ? providerConfig.selectedSystemPromptProfileId
        : "";
    const selectedProfile = profiles.find(
      (profile) => profile?.id === selectedProfileId,
    );
    if (
      typeof selectedProfile?.prompt === "string" &&
      selectedProfile.prompt.trim().length > 0
    ) {
      return selectedProfile.prompt;
    }

    return PromptConfig.systemPrompts.default.prompt;
  };

  /**
   * Handles chat button click to toggle chat visibility.
   */
  const handleChatButtonClick = useCallback(() => {
    if (!chatEnabled) {
      return;
    }

    Logger.log("ChatController", "Chat button clicked");
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
  ]);

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

  /**
   * Streams AI response with TTS generation.
   */
  const streamAIResponse = async () => {
    // Create abort controller for this stream
    const abortController = new AbortController();
    streamAbortControllerRef.current = abortController;

    const autoTTSSessionId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let savedConfig = DefaultAIConfig;
    let ttsConfig = DefaultTTSConfig;
    try {
      savedConfig = await storageService.configLoad(
        "aiConfig",
        DefaultAIConfig,
      );
      ttsConfig = await storageService.configLoad(
        "ttsConfig",
        DefaultTTSConfig,
      );
    } catch (configError) {
      Logger.warn("ChatController", "Failed to load config:", configError);
    }

    const systemPrompt = getSystemPromptFromConfig(savedConfig);
    const messages = chatService.getFormattedMessages(systemPrompt);

    // DOCUMENT INTERACTION: Extract page context based on user query
    // SKIP if user has attachments (images/audios) or on Android/Desktop platforms
    const lastUserMessage = chatService.getLastUserMessage();
    const hasAttachments =
      lastUserMessage &&
      ((lastUserMessage.images && lastUserMessage.images.length > 0) ||
        (lastUserMessage.audios && lastUserMessage.audios.length > 0));

    if (
      lastUserMessage &&
      lastUserMessage.content &&
      !hasAttachments &&
      !isAndroid &&
      !isDesktop
    ) {
      Logger.log("ChatController", "Starting document interaction analysis...");

      // Check if aborted before starting
      if (abortController.signal.aborted) {
        Logger.log(
          "ChatController",
          "Document interaction cancelled before starting",
        );
        return { success: false, cancelled: true };
      }

      try {
        // Create AI send function for the analyzer (with utility session option)
        const aiSendMessage = async (
          aiMessages: AIMessage[],
          onStream?: (chunk: string) => void | Promise<void>,
          options?: unknown,
        ): Promise<AIResult> => {
          return await aiService.sendMessage(aiMessages, onStream, options);
        };

        const pageContext = await documentInteractionService.getContextForQuery(
          lastUserMessage.content,
          aiSendMessage,
          abortController.signal,
        );

        // Check if aborted after document interaction
        if (abortController.signal.aborted) {
          Logger.log(
            "ChatController",
            "Stream cancelled after document interaction",
          );
          return { success: false, cancelled: true };
        }

        Logger.log(
          "ChatController",
          "Document interaction complete, message count:",
          chatService.getMessages().length,
        );

        if (pageContext) {
          Logger.log("ChatController", "Injecting page context into AI prompt");
          // Add context to the last user message
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === "user") {
            lastMessage.content = pageContext + lastMessage.content;
          }
        }
      } catch (error) {
        Logger.warn("ChatController", "Failed to extract page context:", error);
        // Continue without context - non-critical error
      }
    } else if (hasAttachments) {
      Logger.log(
        "ChatController",
        "Skipping document interaction - user has attachments (images/audios)",
      );
    }

    const ttsEnabled = ttsConfig.enabled && ttsService.isConfigured();

    Logger.log("ChatController", "System prompt:", systemPrompt);
    Logger.log("ChatController", "Messages to AI:", messages);

    if (ttsEnabled) {
      ttsService.resumePlayback();
    }

    let fullResponse = "";
    let fullResponseRaw = ""; // Raw response with <think> tags (for tracking)
    let previousDisplayLength = 0; // Track how much we've already processed for TTS
    let hasSwitchedToSpeaking = false;
    let textBuffer = "";
    const allChunks: string[] = [];
    let nextChunkToGenerate = 0;
    const MAX_QUEUED_AUDIO = 3;
    let isGeneratingChunk = false;

    /**
     * Generates TTS for a text chunk with lip sync.
     *
     * @param {number} chunkIndex - Index of chunk to generate
     */
    const generateTTSChunk = async (chunkIndex: number) => {
      // Check if aborted (stop button pressed, chat closed, etc.)
      if (abortController.signal.aborted) {
        Logger.log(
          "ChatController",
          "TTS generation aborted, stopping chunk generation",
        );
        return;
      }

      if (chunkIndex >= allChunks.length) return;

      const chunkText = allChunks[chunkIndex];

      if (
        !chunkText ||
        typeof chunkText !== "string" ||
        chunkText.trim().length === 0
      ) {
        Logger.warn(
          "ChatController",
          "Skipping empty/invalid chunk ${chunkIndex}:",
          chunkText,
        );
        return;
      }

      Logger.log(
        "ChatController",
        `Generating TTS for chunk ${chunkIndex}: "${chunkText.substring(0, 100)}..." (type: ${typeof chunkText}, length: ${chunkText.length})`,
      );

      if (ttsService.isStopped) {
        return;
      }

      try {
        const result = await ttsService.generateSpeech(chunkText, true);

        // Check again after async operation
        if (abortController.signal.aborted || !result || !result.audio) {
          if (abortController.signal.aborted) {
            Logger.log(
              "ChatController",
              "TTS generation aborted after speech generation",
            );
          } else {
            Logger.warn(
              "ChatController",
              `TTS generation returned null for chunk ${chunkIndex}`,
            );
          }
          return;
        }

        const { audio, bvmdUrl } = result;

        if (ttsService.isStopped || abortController.signal.aborted) {
          return;
        }

        const audioBlob =
          audio instanceof Blob
            ? audio
            : new Blob([audio], { type: "audio/mp3" });
        const audioUrl = URL.createObjectURL(audioBlob);

        ttsService.queueAudio(chunkText, audioUrl, bvmdUrl, autoTTSSessionId);
      } catch (ttsError) {
        Logger.warn(
          "ChatController",
          "TTS generation failed for chunk ${chunkIndex}:",
          ttsError,
        );
      }
    };

    /**
     * Generates next chunk if queue has space.
     */
    const tryGenerateNextChunk = async () => {
      // Check if aborted before generating
      if (abortController.signal.aborted) {
        Logger.log("ChatController", "TTS chunk generation stopped (aborted)");
        return;
      }

      if (isGeneratingChunk) {
        return;
      }

      const queueLength = ttsService.getQueueLength();

      if (
        queueLength < MAX_QUEUED_AUDIO &&
        nextChunkToGenerate < allChunks.length
      ) {
        isGeneratingChunk = true;
        await generateTTSChunk(nextChunkToGenerate++);
        isGeneratingChunk = false;

        // Check if aborted before scheduling next
        if (
          !abortController.signal.aborted &&
          nextChunkToGenerate < allChunks.length
        ) {
          setTimeout(() => tryGenerateNextChunk(), 0);
        }
      }
    };

    const handleAudioFinished = () => {
      // Only continue generating if not aborted
      if (!abortController.signal.aborted) {
        tryGenerateNextChunk();
      } else {
        Logger.log(
          "ChatController",
          "Audio finished but generation aborted, not generating next chunk",
        );
      }
    };
    ttsService.addEventListener("audioFinished", handleAudioFinished);

    const result = await aiService.sendMessage(
      messages as AIMessage[],
      async (chunk: string) => {
        if (abortController.signal.aborted) {
          Logger.log(
            "ChatController",
            "Streaming callback aborted, ignoring chunk",
          );
          return;
        }

        // Add chunk to raw response
        fullResponseRaw += chunk;

        // Remove all <think>...</think> blocks (including incomplete ones at the end)
        // This regex handles complete think blocks
        let displayResponse = fullResponseRaw.replace(
          /<think>[\s\S]*?<\/think>/g,
          "",
        );

        // Remove incomplete opening <think> tag at the end (if chunk ended mid-tag)
        displayResponse = displayResponse.replace(/<think>.*$/s, "");

        // Remove leading newlines/whitespace from the response
        displayResponse = displayResponse.replace(/^\s+/, "");

        // Update fullResponse with filtered content
        fullResponse = displayResponse;

        // Get only the new content since last update for TTS
        const newContent = displayResponse.slice(previousDisplayLength);
        textBuffer += newContent;
        previousDisplayLength = displayResponse.length;

        const currentMessages = chatService.getMessages();
        Logger.log(
          "ChatController",
          "Streaming chunk received, current message count:",
          currentMessages.length,
        );
        if (
          currentMessages.length > 0 &&
          currentMessages[currentMessages.length - 1]?.role === "assistant"
        ) {
          Logger.log("ChatController", "Updating existing assistant message");
          chatService.updateLastMessage(fullResponse);
        } else {
          Logger.log(
            "ChatController",
            "Adding new assistant message (no existing one found!)",
          );
          chatService.addMessage("assistant", fullResponse);
        }
        setChatMessages(toChatMessageItems(chatService.getMessages()));

        if (
          !ttsEnabled &&
          !hasSwitchedToSpeaking &&
          fullResponse.length > 10 &&
          canUseAssistant()
        ) {
          assistantRef.current?.triggerAction("speak");
          hasSwitchedToSpeaking = true;
        }

        if (ttsEnabled) {
          const sentenceEnd = /[.!?:]\s|[.!?:]\n|\n/.exec(textBuffer);

          if (sentenceEnd) {
            const chunkToSpeak = textBuffer
              .substring(0, sentenceEnd.index + sentenceEnd[0].length)
              .trim();
            textBuffer = textBuffer.substring(
              sentenceEnd.index + sentenceEnd[0].length,
            );

            if (
              chunkToSpeak &&
              chunkToSpeak.length >= 3 &&
              chunkToSpeak.trim().length >= 3
            ) {
              allChunks.push(chunkToSpeak);

              if (
                !isGeneratingChunk &&
                ttsService.getQueueLength() < MAX_QUEUED_AUDIO
              ) {
                tryGenerateNextChunk();
              }
            }
          }
        }
      },
    );

    if (result.cancelled) {
      Logger.log("ChatController", "Generation cancelled by user");
      ttsService.stopPlayback();
      ttsService.removeEventListener("audioFinished", handleAudioFinished);
      if (canUseAssistant()) {
        assistantRef.current?.idle();
      }
      streamAbortControllerRef.current = null;
      setIsProcessing(false);
      return { success: false, cancelled: true };
    }

    if (!result.success) {
      const errorMessage =
        getErrorMessage(result.error) || "Unknown error occurred";
      Logger.error("ChatController", "AI error:", result.error);

      // Add error message to chat
      chatService.addMessage("assistant", `Error: ${errorMessage}`);
      setChatMessages(toChatMessageItems(chatService.getMessages()));

      // Clean up TTS and event listeners
      ttsService.stopPlayback();
      ttsService.removeEventListener("audioFinished", handleAudioFinished);

      // Reset assistant animation
      if (canUseAssistant()) {
        assistantRef.current?.idle();
      }

      streamAbortControllerRef.current = null;
      setIsProcessing(false);
      return { success: false, error: errorMessage };
    }

    if (ttsEnabled && textBuffer.trim().length > 0) {
      const finalChunk = textBuffer.trim();
      allChunks.push(finalChunk);
      tryGenerateNextChunk();
    }

    if (ttsEnabled && allChunks.length > 0) {
      // Wait for all chunks to be generated, but abort if cancelled
      while (
        nextChunkToGenerate < allChunks.length &&
        !abortController.signal.aborted
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (abortController.signal.aborted) {
        Logger.log(
          "ChatController",
          "TTS chunk generation aborted while waiting for completion",
        );
      }
    }

    ttsService.removeEventListener("audioFinished", handleAudioFinished);

    // Clear abort controller on successful completion
    streamAbortControllerRef.current = null;

    return { success: true, fullResponse };
  };

  /**
   * Handles text message submission.
   *
   * @param {string} message - User message
   * @param {Array} images - Image attachments
   * @param {Array} audios - Audio attachments
   */
  const handleMessageSend = async (
    message: string,
    images: string[] | null = null,
    audios: string[] | null = null,
  ) => {
    const attachmentInfo = [];
    if (images && images.length > 0)
      attachmentInfo.push(`${images.length} image(s)`);
    if (audios && audios.length > 0)
      attachmentInfo.push(`${audios.length} audio(s)`);
    const attachmentStr =
      attachmentInfo.length > 0 ? ` with ${attachmentInfo.join(" and ")}` : "";
    Logger.log("ChatController", "Message sent:", message, attachmentStr);

    // Cancel any ongoing stream (including document interaction)
    if (streamAbortControllerRef.current) {
      Logger.log(
        "ChatController",
        "Aborting ongoing stream (including document interaction)",
      );
      streamAbortControllerRef.current.abort();
      streamAbortControllerRef.current = null;
    }

    // Also abort AI generation if it's running
    if (aiService.isGenerating()) {
      Logger.log("ChatController", "Aborting ongoing AI generation");
      aiService.abortRequest();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    chatService.addMessage("user", message, images, audios);
    setChatMessages(toChatMessageItems(chatService.getMessages()));

    setIsProcessing(true);

    ttsService.stopPlayback();

    if (!aiService.isConfigured()) {
      chatService.addMessage(
        "assistant",
        "Error: AI not configured. Please configure in Control Panel.",
      );
      setChatMessages(toChatMessageItems(chatService.getMessages()));
      setIsProcessing(false);
      return;
    }

    Logger.log("ChatController", "Checking assistant ready state:", {
      hasRef: !!assistantRef.current,
      isReady: assistantRef.current?.isReady?.(),
    });

    if (canUseAssistant()) {
      Logger.log("ChatController", "Starting BUSY state (thinking animation)");
      await assistantRef.current?.setState("BUSY");
      Logger.log("ChatController", "BUSY state set successfully");
    } else {
      Logger.warn("ChatController", "Assistant not ready, skipping BUSY state");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const result = await streamAIResponse();

    if (!result.success) {
      return;
    }

    setIsProcessing(false);

    const messagesToPersist = chatService.getMessages();

    if (!isTempChat && messagesToPersist.length > 0) {
      try {
        let chatId = currentChatId;
        if (!chatId) {
          chatId = historyService.generateChatId();
          setCurrentChatId(chatId);
        }

        const sourceUrl = window.location.href;

        await historyService.saveChat({
          chatId,
          chatService,
          messages: toChatMessageItems(messagesToPersist),
          isTemp: false,
          metadata: {
            sourceUrl,
          },
        });

        Logger.log(
          "ChatController",
          "Chat auto-saved after AI response:",
          chatId,
        );
      } catch (error) {
        Logger.error("ChatController", "Failed to auto-save chat:", error);
      }
    }
  };

  /**
   * Register transcription callback with VoiceConversationService
   * Main window only - ChatInput not rendered in desktop main window
   */
  useEffect(() => {
    if (isInputWindow) return;

    voiceConversationService.setTranscriptionCallback(handleVoiceTranscription);

    return () => {
      voiceConversationService.setTranscriptionCallback(null);
    };
  }, [handleVoiceTranscription]);

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

    return () => {
      unsubscribeSend?.();
      unsubscribePendingDrop?.();
      unsubscribeClose?.();
    };
  }, [
    setPendingDropData,
    api,
    handleDesktopChatInputClose,
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
    if (!isDesktop || isInputWindow || !api?.ipc) {
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

    const unsubscribeMicToggle = ipc.on("chatInput:micToggle", async () => {
      ensureSttCallbacks();

      if (!sttService.isConfigured()) {
        sendSttState({
          isRecording: false,
          isProcessing: false,
          error: "STT not configured. Please configure in Control Panel.",
        });
        return;
      }

      if (_isVoiceMode) {
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
          sendSttState({
            isRecording: true,
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
          await sttService.startRecording();
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
      unsubscribeMicToggle?.();
      sttService.setTranscriptionCallback(null);
      sttService.setErrorCallback(null);
      sttService.setRecordingStartCallback(null);
      sttService.setRecordingStopCallback(null);
    };
  }, [api, _isVoiceMode]);

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
  const handleRegenerateWithStreaming = async () => {
    Logger.log("ChatController", "Regenerating with streaming");

    setIsProcessing(true);
    ttsService.stopPlayback();

    if (canUseAssistant()) {
      await assistantRef.current?.setState("BUSY");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    await streamAIResponse();

    setIsProcessing(false);
  };

  useEffect(() => {
    if (regenerateWithStreamingRef) {
      regenerateWithStreamingRef.current = handleRegenerateWithStreaming;
    }
    if (editWithStreamingRef) {
      editWithStreamingRef.current = handleRegenerateWithStreaming;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenerateWithStreamingRef, editWithStreamingRef]);

  return (
    <>
      {/* Desktop input window manager */}
      {isDesktop && <InputWindowManager />}

      {/* AI Toolbar - appears on text/image selection */}
      {toolbarEnabled ? <AIToolbar /> : null}

      {chatEnabled ? (
        <>
          {/* Chat Button visibility logic:
              - Model enabled: visible when model ready, HIDE when chat opens (model is anchor)
              - Model disabled: ALWAYS visible (button is anchor, needed for dragging) */}
          <ChatButton
            onClick={handleChatButtonClick}
            isVisible={
              modelDisabled
                ? true
                : isAssistantReady &&
                  !(isChatContainerVisible || isChatInputVisible)
            }
            modelDisabled={modelDisabled}
            isChatOpen={isChatContainerVisible || isChatInputVisible}
            chatInputRef={chatInputRef}
          />

          {/* Chat Input - bottom screen */}
          {!isDesktop && (
            <ChatInputTyped
              ref={chatInputRef}
              onSend={handleMessageSend}
              onClose={handleChatInputClose}
              onVoiceTranscription={handleVoiceTranscription}
              onVoiceMode={handleVoiceModeChange}
              embedConfig={embedConfig}
            />
          )}

          {/* Chat Container - message bubbles */}
          <ChatContainer
            modelDisabled={modelDisabled}
            onDragDrop={handleDragDrop}
            embedConfig={embedConfig}
          />
        </>
      ) : null}
    </>
  );
};

export default ChatController;
