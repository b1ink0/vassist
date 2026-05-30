/**
 * @fileoverview Individual chat message component with editing, TTS, and multimedia attachment support.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ChangeEvent,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { cn } from "../../utils/cn";
import { Icon } from "../icons";
import { Button } from "../ui";
import { TTSServiceProxy } from "../../services/proxies";
import AudioPlayer from "../media/AudioPlayer";
import MarkdownText from "../common/StreamdownMarkdown";
import StreamingContainer from "../common/StreamingContainer";
import Logger from "../../services/LoggerService";

interface MessageBranchInfo {
  currentIndex?: number;
  currentBranch?: number;
  totalBranches?: number;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

interface ChatMessageModel {
  id: string;
  role: string;
  content: string;
  images?: string[];
  audios?: string[];
  branchInfo?: MessageBranchInfo;
}

interface ChatMessageProps {
  message: ChatMessageModel;
  messageIndex: number;
  isLightBackground: boolean;
  ttsEnabled: boolean;
  playingMessageIndex: number | null;
  loadingMessageIndex: number | null;
  copiedMessageIndex: number | null;
  isStreamingMessage: boolean;
  currentSessionRef: MutableRefObject<string | null>;
  smoothStreamingAnimation?: boolean;
  shouldAnimate?: boolean;
  onCopyMessage: (
    messageIndex: number,
    content: string,
  ) => void | Promise<void>;
  onPlayTTS: (messageIndex: number, content: string) => void | Promise<void>;
  onEditUserMessage: (
    messageId: string,
    newContent: string,
    newImages: string[],
    newAudios: string[],
  ) => void | Promise<void>;
  onRewriteMessage: (message: ChatMessageModel) => void | Promise<void>;
  onPreviousBranch: (message: ChatMessageModel) => void;
  onNextBranch: (message: ChatMessageModel) => void;
  setLoadingMessageIndex: Dispatch<SetStateAction<number | null>>;
  setPlayingMessageIndex: Dispatch<SetStateAction<number | null>>;
}

/**
 * Chat message component with editing, streaming, and multimedia features.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.message - Message object
 * @param {number} props.messageIndex - Index of message
 * @param {boolean} props.isLightBackground - Whether background is light
 * @param {boolean} props.ttsEnabled - Whether TTS is enabled
 * @param {number} props.playingMessageIndex - Index of currently playing message
 * @param {number} props.loadingMessageIndex - Index of loading message
 * @param {number} props.copiedMessageIndex - Index of copied message
 * @param {boolean} props.isStreamingMessage - Whether this assistant message is currently streaming
 * @param {Object} props.currentSessionRef - Ref to current session
 * @param {boolean} props.smoothStreamingAnimation - Whether to use smooth streaming
 * @param {boolean} props.shouldAnimate - Whether message should animate
 * @param {Function} props.onCopyMessage - Callback to copy message
 * @param {Function} props.onPlayTTS - Callback to play TTS
 * @param {Function} props.onEditUserMessage - Callback to edit user message
 * @param {Function} props.onRewriteMessage - Callback to rewrite message
 * @param {Function} props.onPreviousBranch - Callback for previous branch
 * @param {Function} props.onNextBranch - Callback for next branch
 * @param {Function} props.setLoadingMessageIndex - Setter for loading message index
 * @param {Function} props.setPlayingMessageIndex - Setter for playing message index
 * @returns {JSX.Element} Chat message component
 */
const ChatMessage = ({
  message,
  messageIndex,
  isLightBackground,
  ttsEnabled,
  playingMessageIndex,
  loadingMessageIndex,
  copiedMessageIndex,
  isStreamingMessage,
  currentSessionRef,
  smoothStreamingAnimation = false,
  shouldAnimate = false, // Only animate if this is the latest message
  onCopyMessage,
  onPlayTTS,
  onEditUserMessage,
  onRewriteMessage,
  onPreviousBranch,
  onNextBranch,
  setLoadingMessageIndex,
  setPlayingMessageIndex,
}: ChatMessageProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingContent, setEditingContent] = useState("");
  const [editingImages, setEditingImages] = useState<string[]>([]);
  const [editingAudios, setEditingAudios] = useState<string[]>([]);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isUser = message.role === "user";
  const isError = message.content.toLowerCase().startsWith("error:");
  const isPlaying = playingMessageIndex === messageIndex;
  const isLoading = loadingMessageIndex === messageIndex;
  const hasAudio = isUser && message.audios && message.audios.length > 0;
  const branchTotal = message.branchInfo?.totalBranches ?? 0;
  const branchIndex =
    message.branchInfo?.currentIndex ?? message.branchInfo?.currentBranch ?? 0;
  const streamingMarkdownAnimation = smoothStreamingAnimation
    ? {
        animation: "fadeIn" as const,
        duration: 140,
        easing: "ease-out",
        sep: "word" as const,
        stagger: 12,
      }
    : false;

  const animationClass = shouldAnimate
    ? isUser
      ? "animate-slide-right-up"
      : "animate-slide-left-up"
    : "";

  /**
   * Starts editing this message.
   */
  const handleStartEdit = useCallback(() => {
    if (message?.id && message?.role === "user") {
      Logger.log("ChatMessage", "Starting edit for message:", message.id);
      setIsEditing(true);
      setEditingContent(message.content);
      setEditingImages(message.images || []);
      setEditingAudios(message.audios || []);
    }
  }, [message]);

  /**
   * Saves edited message.
   */
  const handleSaveEdit = useCallback(async () => {
    if (
      !editingContent.trim() &&
      editingImages.length === 0 &&
      editingAudios.length === 0
    ) {
      setIsEditing(false);
      setEditingContent("");
      setEditingImages([]);
      setEditingAudios([]);
      return;
    }

    try {
      Logger.log("ChatMessage", "Saving edited message:", message.id);
      await onEditUserMessage(
        message.id,
        editingContent.trim(),
        editingImages,
        editingAudios,
      );
      setIsEditing(false);
      setEditingContent("");
      setEditingImages([]);
      setEditingAudios([]);
    } catch (error) {
      Logger.error("ChatMessage", "Failed to save edit:", error);
    }
  }, [
    message.id,
    editingContent,
    editingImages,
    editingAudios,
    onEditUserMessage,
  ]);

  /**
   * Cancels editing mode.
   */
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditingContent("");
    setEditingImages([]);
    setEditingAudios([]);
  }, []);

  /**
   * Auto-resizes edit textarea based on content.
   */
  const adjustEditTextareaHeight = useCallback(() => {
    const textarea = editTextareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 300);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  /**
   * Handles edit textarea content change.
   *
   * @param {Event} e - Change event
   */
  const handleEditContentChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setEditingContent(e.target.value);
      setTimeout(() => adjustEditTextareaHeight(), 0);
    },
    [adjustEditTextareaHeight],
  );

  /**
   * Removes image from editing attachments.
   *
   * @param {number} index - Index of image to remove
   */
  const handleRemoveEditingImage = useCallback((index: number) => {
    setEditingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Removes audio from editing attachments.
   *
   * @param {number} index - Index of audio to remove
   */
  const handleRemoveEditingAudio = useCallback((index: number) => {
    setEditingAudios((prev) => prev.filter((_, i) => i !== index));
  }, []);

  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      editTextareaRef.current.focus();
      editTextareaRef.current.selectionStart =
        editTextareaRef.current.value.length;
      adjustEditTextareaHeight();
    }
  }, [isEditing, adjustEditTextareaHeight]);

  return (
    <div className={cn("flex flex-col gap-3", animationClass)}>
      <div
        className={cn("flex flex-col", isUser ? "items-end" : "items-start")}
      >
        <div
          className={cn(
            "flex items-start gap-2",
            isEditing ? "w-full" : hasAudio ? "w-[80%]" : "max-w-[80%]",
          )}
        >
          {/* Message bubble */}
          <div
            className="flex flex-col gap-1.5"
            style={{ width: !isUser || isEditing ? "100%" : "auto" }}
          >
            <div
              className={cn(
                isError
                  ? "glass-error"
                  : isUser
                    ? "glass-message-user"
                    : "glass-message",
                !isError &&
                  isLightBackground &&
                  (isUser ? "glass-message-user-dark" : "glass-message-dark"),
                "px-2 md:px-3 py-2",
                isError
                  ? "rounded-3xl"
                  : isUser
                    ? "rounded-[20px] rounded-tr-md"
                    : "rounded-[20px] rounded-tl-md",
                (hasAudio || isEditing) && "w-full",
                "break-words",
              )}
              style={{
                minHeight:
                  !isUser && !isError ? "calc(1.5em + 1.5rem)" : undefined,
              }}
            >
              {isUser &&
                message.images &&
                message.images.length > 0 &&
                !isEditing && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {message.images.map((imgUrl, imgIndex) => (
                      <img
                        key={imgIndex}
                        src={imgUrl}
                        alt={`Attachment ${imgIndex + 1}`}
                        className="max-w-[200px] max-h-[200px] object-contain rounded-lg border-2 border-white/30 cursor-pointer hover:border-blue-400/50 transition-all"
                        onClick={() => window.open(imgUrl, "_blank")}
                        title="Click to view full size"
                      />
                    ))}
                  </div>
                )}

              {isUser &&
                message.audios &&
                message.audios.length > 0 &&
                !isEditing && (
                  <div className="mb-3 space-y-2">
                    {message.audios.map((audioUrl, audioIndex) => (
                      <div key={audioIndex} className="w-full">
                        <AudioPlayer
                          audioUrl={audioUrl}
                          isLightBackground={isLightBackground}
                        />
                      </div>
                    ))}
                  </div>
                )}

              {isEditing ? (
                <div className="relative space-y-2">
                  {editingImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {editingImages.map((img, imgIndex) => (
                        <div key={imgIndex} className="relative group">
                          <img
                            src={img}
                            alt={`Edit ${imgIndex + 1}`}
                            className="w-full rounded-lg max-h-[150px] object-cover"
                          />
                          <Button
                            onClick={() => handleRemoveEditingImage(imgIndex)}
                            variant="default"
                            className="absolute top-1 right-1 w-5 h-5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove image"
                          >
                            <span className="text-[11px]">
                              <Icon name="xmark" size={16} />
                            </span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {editingAudios.length > 0 && (
                    <div className="space-y-2">
                      {editingAudios.map((audioUrl, audioIndex) => (
                        <div key={audioIndex} className="relative group">
                          <AudioPlayer
                            audioUrl={audioUrl}
                            isLightBackground={isLightBackground}
                          />
                          <Button
                            onClick={() => handleRemoveEditingAudio(audioIndex)}
                            variant="default"
                            className="absolute top-1 right-1 w-5 h-5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove audio"
                          >
                            <span className="text-[11px]">
                              <Icon name="xmark" size={16} />
                            </span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <textarea
                    ref={editTextareaRef}
                    data-testid={`chat-message-edit-textarea-${messageIndex}`}
                    value={editingContent}
                    onChange={handleEditContentChange}
                    className={cn(
                      "w-full max-h-[300px] overflow-y-auto px-3 py-2.5 rounded-lg resize-none text-[15px] leading-relaxed custom-scrollbar appearance-none bg-transparent border-none shadow-none min-h-[24px] text-inherit placeholder-white/40 caret-current [color-scheme:normal]",
                      "focus:outline-none",
                    )}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.ctrlKey) {
                        handleSaveEdit();
                      } else if (e.key === "Escape") {
                        handleCancelEdit();
                      }
                    }}
                  />
                  <div className="flex gap-1 justify-end mt-1">
                    <Button
                      onClick={handleCancelEdit}
                      data-testid={`chat-message-edit-cancel-${messageIndex}`}
                      variant="ghost"
                      className="w-6 h-6 p-2 rounded flex-shrink-0 opacity-60 hover:opacity-100"
                      title="Cancel (Esc)"
                    >
                      <span
                        className={cn(
                          isLightBackground ? "glass-text" : "glass-text-black",
                          "text-[11px]",
                        )}
                      >
                        <Icon name="xmark" size={16} />
                      </span>
                    </Button>
                    <Button
                      onClick={handleSaveEdit}
                      data-testid={`chat-message-edit-save-${messageIndex}`}
                      disabled={
                        !editingContent.trim() &&
                        editingImages.length === 0 &&
                        editingAudios.length === 0
                      }
                      variant="ghost"
                      className="w-6 h-6 p-2 rounded flex-shrink-0 opacity-60 hover:opacity-100"
                      title="Save (Ctrl+Enter)"
                    >
                      <span
                        className={cn(
                          isLightBackground ? "glass-text" : "glass-text-black",
                          "text-[11px]",
                        )}
                      >
                        <Icon name="check" size={16} />
                      </span>
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {!isUser && !isError ? (
                    isStreamingMessage ? (
                      <StreamingContainer
                        autoActivate={true}
                        speed="normal"
                        disabled={false}
                      >
                        <div className="text-[15px] leading-relaxed max-w-full overflow-hidden">
                          <MarkdownText
                            text={message.content}
                            isStreaming={true}
                            emitProgressEvents={true}
                            animated={streamingMarkdownAnimation}
                          />
                        </div>
                      </StreamingContainer>
                    ) : (
                      <div className="text-[15px] leading-relaxed max-w-full overflow-hidden">
                        <MarkdownText text={message.content} />
                      </div>
                    )
                  ) : (
                    <div className="text-[15px] leading-relaxed max-w-full overflow-hidden">
                      <MarkdownText text={message.content} />
                    </div>
                  )}
                </>
              )}
            </div>

            <div
              className={cn(
                "flex items-center gap-1",
                isUser ? "justify-end" : "justify-start",
                "mt-1",
              )}
            >
              {!isUser &&
                message.branchInfo &&
                branchTotal > 1 &&
                !isEditing && (
                  <>
                    <Button
                      onClick={() => onPreviousBranch(message)}
                      data-testid={`chat-message-assistant-previous-branch-${messageIndex}`}
                      disabled={!message.branchInfo.canGoBack}
                      variant={isLightBackground ? "dark" : "default"}
                      className="w-6 h-6 p-2 rounded flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                      title="Previous variant"
                    >
                      <span
                        className={cn(
                          isLightBackground ? "glass-text" : "glass-text-black",
                          "text-[9px] rotate-180",
                        )}
                      >
                        <Icon name="play" size={16} />
                      </span>
                    </Button>
                    <span
                      className={cn(
                        isLightBackground ? "glass-text" : "glass-text-black",
                        "text-[10px] opacity-70",
                      )}
                    >
                      {branchIndex}/{branchTotal}
                    </span>
                    <Button
                      onClick={() => onNextBranch(message)}
                      data-testid={`chat-message-assistant-next-branch-${messageIndex}`}
                      disabled={!message.branchInfo.canGoForward}
                      variant={isLightBackground ? "dark" : "default"}
                      className="w-6 h-6 p-2 rounded flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                      title="Next variant"
                    >
                      <span
                        className={cn(
                          isLightBackground ? "glass-text" : "glass-text-black",
                          "text-[9px]",
                        )}
                      >
                        <Icon name="play" size={16} />
                      </span>
                    </Button>
                  </>
                )}

              {!isUser && !isError && ttsEnabled && (
                <Button
                  onClick={() => {
                    if (isLoading) {
                      TTSServiceProxy.stopPlayback();
                      setLoadingMessageIndex(null);
                      setPlayingMessageIndex(null);
                      currentSessionRef.current = null;

                      // Dispatch event to abort TTS generation stream
                      const event = new CustomEvent("abortTTSGeneration");
                      window.dispatchEvent(event);
                    } else {
                      // Play or stop TTS
                      onPlayTTS(messageIndex, message.content);
                    }
                  }}
                  variant={isLightBackground ? "dark" : "default"}
                  className="w-6 h-6 p-2 rounded-lg flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                  title={
                    isLoading
                      ? "Cancel TTS generation"
                      : isPlaying
                        ? "Stop audio"
                        : "Play audio"
                  }
                >
                  {isLoading ? (
                    <span
                      className={cn(
                        isLightBackground ? "glass-text" : "glass-text-black",
                        "text-[10px] animate-spin",
                      )}
                    >
                      <Icon name="hourglass" size={16} />
                    </span>
                  ) : isPlaying ? (
                    <span
                      className={cn(
                        isLightBackground ? "glass-text" : "glass-text-black",
                        "text-[10px]",
                      )}
                    >
                      <Icon name="pause" size={16} />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        isLightBackground ? "glass-text" : "glass-text-black",
                        "text-[10px]",
                      )}
                    >
                      <Icon name="speaker" size={16} />
                    </span>
                  )}
                </Button>
              )}

              {!isEditing && (
                <Button
                  onClick={() => onCopyMessage(messageIndex, message.content)}
                  variant={isLightBackground ? "dark" : "default"}
                  className="w-6 h-6 p-2 rounded-lg flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                  title="Copy message"
                >
                  <span
                    className={cn(
                      isLightBackground ? "glass-text" : "glass-text-black",
                      "text-[10px]",
                    )}
                  >
                    <Icon
                      name={
                        copiedMessageIndex === messageIndex
                          ? "check"
                          : "clipboard"
                      }
                      size={12}
                    />
                  </span>
                </Button>
              )}

              {isUser && !isError && !isEditing && (
                <Button
                  onClick={handleStartEdit}
                  data-testid={`chat-message-edit-button-${messageIndex}`}
                  variant={isLightBackground ? "dark" : "default"}
                  className="w-6 h-6 p-2 rounded-lg flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                  title="Edit message"
                >
                  <span
                    className={cn(
                      isLightBackground ? "glass-text" : "glass-text-black",
                      "text-[9px]",
                    )}
                  >
                    <Icon name="edit" size={16} />
                  </span>
                </Button>
              )}

              {isUser &&
                message.branchInfo &&
                branchTotal > 1 &&
                !isEditing && (
                  <>
                    <Button
                      onClick={() => onPreviousBranch(message)}
                      data-testid={`chat-message-user-previous-branch-${messageIndex}`}
                      disabled={!message.branchInfo.canGoBack}
                      variant={isLightBackground ? "dark" : "default"}
                      className="w-6 h-6 p-2 rounded flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                      title="Previous variant"
                    >
                      <span
                        className={cn(
                          isLightBackground ? "glass-text" : "glass-text-black",
                          "text-[9px] rotate-180",
                        )}
                      >
                        <Icon name="play" size={16} />
                      </span>
                    </Button>
                    <span
                      className={cn(
                        isLightBackground ? "glass-text" : "glass-text-black",
                        "text-[10px] opacity-70",
                      )}
                    >
                      {branchIndex}/{branchTotal}
                    </span>
                    <Button
                      onClick={() => onNextBranch(message)}
                      data-testid={`chat-message-user-next-branch-${messageIndex}`}
                      disabled={!message.branchInfo.canGoForward}
                      variant={isLightBackground ? "dark" : "default"}
                      className="w-6 h-6 p-2 rounded flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                      title="Next variant"
                    >
                      <span
                        className={cn(
                          isLightBackground ? "glass-text" : "glass-text-black",
                          "text-[9px]",
                        )}
                      >
                        <Icon name="play" size={16} />
                      </span>
                    </Button>
                  </>
                )}

              {!isUser && !isError && !isEditing && (
                <Button
                  onClick={() => onRewriteMessage(message)}
                  data-testid={`chat-message-regenerate-button-${messageIndex}`}
                  variant={isLightBackground ? "dark" : "default"}
                  className="w-6 h-6 p-2 rounded-lg flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                  title="Regenerate response"
                >
                  <span
                    className={cn(
                      isLightBackground ? "glass-text" : "glass-text-black",
                      "text-[10px]",
                    )}
                  >
                    <Icon name="regenerate" size={16} />
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
