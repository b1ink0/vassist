import { ConversationStates } from "../audio/VoiceConversationService";
import { PromptConfig } from "../../config/promptConfig";
import type { ChatService } from "./ChatService";
import type { ChatSessionRuntime } from "./ChatSessionRuntime";
import {
  toChatMessageItems,
  type AppStoreState,
} from "../../stores/createAppStore";
import { DefaultAIConfig, DefaultTTSConfig } from "../../config/aiConfig";
import { isAndroid, isDesktop } from "../../utils/PlatformUtils";
import Logger from "../common/LoggerService";
export interface AIMessage {
  role: string;
  content: string;
  images?: string[];
  audios?: string[];
}

export interface AIResult {
  success: boolean;
  cancelled?: boolean;
  error?: { message?: string } | unknown;
}

export interface AIServiceLike {
  isConfigured: () => boolean;
  sendMessage: (
    messages: AIMessage[],
    onStream?: (chunk: string) => void | Promise<void>,
    options?: unknown,
  ) => Promise<AIResult>;
  isGenerating: () => boolean;
  abortRequest: () => void;
}

export interface TTSGenerateResult {
  audio?: Blob | ArrayBuffer;
  bvmdUrl?: string;
}

export interface TTSServiceLike {
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
  addEventListener: (
    eventName: string,
    callback: (...args: unknown[]) => void,
  ) => void;
  removeEventListener: (
    eventName: string,
    callback: (...args: unknown[]) => void,
  ) => void;
  resetSessionFlags: () => void;
  markSessionComplete: (sessionId: string) => void;
  isStopped?: boolean;
}

export interface StorageServiceLike {
  configLoad: <T>(key: string, defaultValue?: T) => Promise<T>;
}

export interface DocumentInteractionServiceLike {
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

interface ChatResponseDependencies {
  chatSession: ChatSessionRuntime;
  chatService: ChatService;
  streamAbortControllerRef: { current: AbortController | null };
  aiService: AIServiceLike;
  ttsService: TTSServiceLike;
  storageService: StorageServiceLike;
  documentInteractionService: DocumentInteractionServiceLike;
  getSystemPromptFromConfig: (config: Record<string, unknown>) => string;
  canUseAssistant: () => boolean;
  triggerAssistantAction: (action: string) => Promise<void>;
  idleAssistant: () => Promise<void>;
  setChatMessages: AppStoreState["setChatMessages"];
  setIsProcessing: AppStoreState["setIsProcessing"];
  getErrorMessage: (error: unknown) => string;
}

/** Streaming, reasoning and speech queues belong to the session, outside React views. */
export async function streamChatResponse({
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
}: ChatResponseDependencies) {
  const generation = chatSession.generation();
  // Create abort controller for this stream
  const abortController = new AbortController();
  streamAbortControllerRef.current = abortController;
  generation.signal.addEventListener("abort", () => abortController.abort(), {
    once: true,
  });

  const autoTTSSessionId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  let savedConfig = DefaultAIConfig;
  let ttsConfig = DefaultTTSConfig;
  try {
    savedConfig = await storageService.configLoad("aiConfig", DefaultAIConfig);
    ttsConfig = await storageService.configLoad("ttsConfig", DefaultTTSConfig);
  } catch (configError) {
    Logger.warn("ChatController", "Failed to load config:", configError);
  }
  if (!generation.isCurrent() || abortController.signal.aborted)
    return { success: false, cancelled: true };

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
  let fullResponseRaw = "";
  let fullThinking = "";
  let previousDisplayLength = 0;

  let thinkingFramePending = false;
  const flushThinkingDelta = () => {
    thinkingFramePending = false;
    if (!generation.isCurrent() || abortController.signal.aborted) return;
    const currentMessages = chatService.getMessages();
    if (
      currentMessages.length > 0 &&
      currentMessages[currentMessages.length - 1]?.role === "assistant"
    ) {
      chatService.updateLastMessage(fullResponse, fullThinking);
    } else {
      chatService.addMessage(
        "assistant",
        fullResponse,
        null,
        null,
        fullThinking,
      );
    }
    setChatMessages(toChatMessageItems(chatService.getMessages()));
  };
  const applyThinkingDelta = (thinkingChunk: string) => {
    if (!generation.isCurrent() || abortController.signal.aborted) return;
    fullThinking += thinkingChunk;
    if (thinkingFramePending) return;
    thinkingFramePending = true;
    requestAnimationFrame(flushThinkingDelta);
  };
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
      if (
        await chatSession.queueSpeech(
          chunkText,
          audioBlob,
          bvmdUrl,
          autoTTSSessionId,
        )
      )
        return;
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
  try {
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
          await triggerAssistantAction("speak");
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
      { onReasoning: (chunk: string) => applyThinkingDelta(chunk) },
    );

    if (!generation.isCurrent() || abortController.signal.aborted) {
      ttsService.removeEventListener("audioFinished", handleAudioFinished);
      return { success: false, cancelled: true };
    }
    if (result.cancelled) {
      Logger.log("ChatController", "Generation cancelled by user");
      ttsService.stopPlayback();
      ttsService.removeEventListener("audioFinished", handleAudioFinished);
      if (canUseAssistant()) {
        await idleAssistant();
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
        await idleAssistant();
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
        (nextChunkToGenerate < allChunks.length || isGeneratingChunk) &&
        !abortController.signal.aborted
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (abortController.signal.aborted) {
        Logger.log(
          "ChatController",
          "TTS chunk generation aborted while waiting for completion",
        );
      } else {
        // The normal text-chat path must explicitly close its TTS session.
        // Without this, the final short clip leaves the animation bridge
        // waiting forever because TTSService intentionally withholds
        // `audioEnd` until every generated chunk is marked complete.
        ttsService.markSessionComplete(autoTTSSessionId);
        chatSession.completeSpeech(autoTTSSessionId);
        Logger.log(
          "ChatController",
          `[TTS] Session ${autoTTSSessionId} marked complete`,
        );
      }
    }

    ttsService.removeEventListener("audioFinished", handleAudioFinished);

    // Clear abort controller on successful completion
    streamAbortControllerRef.current = null;

    return { success: true, fullResponse };
  } finally {
    ttsService.removeEventListener("audioFinished", handleAudioFinished);
    if (streamAbortControllerRef.current === abortController)
      streamAbortControllerRef.current = null;
    if (generation.isCurrent() && abortController.signal.aborted)
      setIsProcessing(false);
  }
}

type ConversationState =
  (typeof ConversationStates)[keyof typeof ConversationStates];
export interface VoiceConversationServiceLike {
  setErrorCallback: (callback: ((error: unknown) => void) | null) => void;
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

export const getSystemPromptFromConfig = (
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

export async function streamVoiceChatResponse({
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
}: VoiceChatResponseDependencies) {
  const generation = chatSession.generation();
  const abortController = new AbortController();
  streamAbortControllerRef.current = abortController;
  generation.signal.addEventListener("abort", () => abortController.abort(), {
    once: true,
  });

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
    isReady: canUseAssistant(),
  });

  if (canUseAssistant()) {
    Logger.log(
      "ChatController",
      "[Voice] Starting BUSY state (thinking animation)",
    );
    await setAssistantState("BUSY");
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
  if (!generation.isCurrent()) return;
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
  let fullThinking = "";
  let previousDisplayLength = 0;
  let hasSwitchedToSpeaking = false;
  let textBuffer = "";
  const allChunks: string[] = [];
  let nextChunkToGenerate = 0;
  const MAX_QUEUED_AUDIO = 3;
  let isGeneratingChunk = false;

  let thinkingFramePending = false;
  const flushThinkingDelta = () => {
    thinkingFramePending = false;
    if (!generation.isCurrent() || abortController.signal.aborted) return;
    const currentMessages = chatService.getMessages();
    if (
      currentMessages.length > 0 &&
      currentMessages[currentMessages.length - 1]?.role === "assistant"
    ) {
      chatService.updateLastMessage(fullResponse, fullThinking);
    } else {
      chatService.addMessage(
        "assistant",
        fullResponse,
        null,
        null,
        fullThinking,
      );
    }
    setChatMessages(toChatMessageItems(chatService.getMessages()));
  };
  const applyThinkingDelta = (thinkingChunk: string) => {
    if (!generation.isCurrent() || abortController.signal.aborted) return;
    fullThinking += thinkingChunk;
    if (thinkingFramePending) return;
    thinkingFramePending = true;
    requestAnimationFrame(flushThinkingDelta);
  };

  const voiceTTSSessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const generateTTSChunk = async (chunkIndex: number) => {
    if (abortController.signal.aborted || chunkIndex >= allChunks.length)
      return;

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

      if (abortController.signal.aborted || !result || !result.audio) {
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
    if (abortController.signal.aborted || isGeneratingChunk) {
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
        await triggerAssistantAction("speak");
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
    { onReasoning: (chunk: string) => applyThinkingDelta(chunk) },
  );

  if (!generation.isCurrent()) {
    ttsService.removeEventListener("audioFinished", handleAudioFinished);
    return;
  }
  if (result.cancelled) {
    Logger.log("ChatController", "Voice generation cancelled by user");
    voiceConversationService.changeState(ConversationStates.LISTENING);
    if (canUseAssistant()) {
      await idleAssistant();
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
      await idleAssistant();
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

    while (
      !abortController.signal.aborted &&
      (nextChunkToGenerate < allChunks.length || isGeneratingChunk)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    Logger.log("ChatController", "[Voice] All TTS chunks generated and queued");

    if (!generation.isCurrent() || abortController.signal.aborted) return;
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
}

type VoiceChatResponseDependencies = ChatResponseDependencies & {
  voiceConversationService: VoiceConversationServiceLike;
  setAssistantState: (state: string) => Promise<void>;
};

export async function sendVoiceChatMessage(
  dependencies: VoiceChatResponseDependencies & {
    appStore: import("../../stores/createAppStore").AppStore;
    historyService: ChatHistoryWriter;
  },
  text: string,
  images: string[] | null,
): Promise<void> {
  dependencies.chatSession.beginVoice();
  dependencies.aiService.abortRequest();
  const state = dependencies.appStore.getState();
  if (!state.currentChatId)
    state.setCurrentChatId(dependencies.historyService.generateChatId());
  dependencies.chatService.addMessage("user", text, images, null);
  state.setChatMessages(
    toChatMessageItems(dependencies.chatService.getMessages()),
  );
  await streamVoiceChatResponse(dependencies);
}

interface ChatHistoryWriter {
  generateChatId: () => string;
  saveChat: (input: {
    chatId: string;
    chatService: unknown;
    messages: import("../../stores/createAppStore").ChatMessageItem[];
    isTemp: boolean;
    metadata: { sourceUrl: string };
  }) => Promise<unknown>;
}

export async function sendChatMessage(
  dependencies: ChatResponseDependencies & {
    appStore: import("../../stores/createAppStore").AppStore;
    historyService: ChatHistoryWriter;
    sourceUrl: string;
    setAssistantState: (state: string) => Promise<void>;
  },
  message: string,
  images: string[] | null = null,
  audios: string[] | null = null,
): Promise<void> {
  const {
    chatSession,
    chatService,
    streamAbortControllerRef,
    aiService,
    ttsService,
    canUseAssistant,
    setAssistantState,
    appStore,
    historyService,
    sourceUrl,
    setChatMessages,
    setIsProcessing,
  } = dependencies;
  const { setCurrentChatId, setIsChatContainerVisible } = appStore.getState();
  const generation = chatSession.generation();
  const initialState = appStore.getState();
  const chatId = initialState.currentChatId ?? historyService.generateChatId();
  if (!initialState.currentChatId) setCurrentChatId(chatId);
  setIsChatContainerVisible(true);
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

  if (!generation.isCurrent()) return;

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
    isReady: canUseAssistant(),
  });

  if (canUseAssistant()) {
    Logger.log("ChatController", "Starting BUSY state (thinking animation)");
    await setAssistantState("BUSY");
    Logger.log("ChatController", "BUSY state set successfully");
  } else {
    Logger.warn("ChatController", "Assistant not ready, skipping BUSY state");
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  if (!generation.isCurrent()) return;

  const result = await streamChatResponse(dependencies);

  if (!result.success || !generation.isCurrent()) {
    return;
  }

  setIsProcessing(false);

  const messagesToPersist = chatService.getMessages();

  if (!appStore.getState().isTempChat && messagesToPersist.length > 0) {
    try {
      void historyService
        .saveChat({
          chatId,
          chatService,
          messages: toChatMessageItems(messagesToPersist),
          isTemp: false,
          metadata: {
            sourceUrl,
          },
        })
        .then(() =>
          Logger.log(
            "ChatController",
            "Chat auto-saved after AI response:",
            chatId,
          ),
        )
        .catch((error: unknown) =>
          Logger.error("ChatController", "Failed to auto-save chat:", error),
        );
    } catch (error) {
      Logger.error("ChatController", "Failed to auto-save chat:", error);
    }
  }
}

export async function regenerateChatResponse(
  dependencies: ChatResponseDependencies & {
    setAssistantState: (state: string) => Promise<void>;
  },
): Promise<void> {
  const {
    chatSession,
    setIsProcessing,
    ttsService,
    canUseAssistant,
    setAssistantState,
  } = dependencies;
  const generation = chatSession.generation();
  Logger.log("ChatController", "Regenerating with streaming");

  setIsProcessing(true);
  ttsService.stopPlayback();

  if (canUseAssistant()) {
    await setAssistantState("BUSY");
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!generation.isCurrent()) return;

  await streamChatResponse(dependencies);

  if (generation.isCurrent()) setIsProcessing(false);
}
