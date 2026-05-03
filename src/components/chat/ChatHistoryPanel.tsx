/**
 * @fileoverview Chat history panel with infinite scroll, search, and chat management.
 */

import {
  useState,
  useEffect,
  useRef,
  memo,
  type ChangeEvent,
  type UIEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Icon } from "../icons";
import { Button, Input } from "../ui";
import { cn } from "../../utils/cn";
import chatHistoryService from "../../services/ChatHistoryService";
import Logger from "../../services/LoggerService";

interface ChatHistoryMessage {
  role?: string;
  content?: string;
}

interface ChatHistoryItem {
  chatId: string;
  title?: string;
  messages?: ChatHistoryMessage[];
  messageCount?: number;
  updatedAt?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

interface ChatHistoryPanelProps {
  isLightBackground?: boolean;
  onSelectChat?: ((chat: ChatHistoryItem) => void) | null;
  onClose?: (() => void) | null;
  animationClass?: string;
  onRequestEditDialog?: ((chatId: string, title: string) => void) | null;
  onRequestDeleteDialog?: ((chatId: string) => void) | null;
  refreshTrigger?: number;
}

/**
 * Chat history panel component with infinite scroll and search.
 *
 * @component
 * @param {Object} props - Component props
 * @param {boolean} props.isLightBackground - Whether background is light
 * @param {Function} props.onSelectChat - Callback when chat is selected
 * @param {Function} props.onClose - Callback to close panel
 * @param {string} props.animationClass - CSS animation class
 * @param {Function} props.onRequestEditDialog - Callback to show edit dialog
 * @param {Function} props.onRequestDeleteDialog - Callback to show delete dialog
 * @param {number} props.refreshTrigger - Trigger to reload chats when changed
 * @returns {JSX.Element} Chat history panel component
 */
const ChatHistoryPanel = ({
  isLightBackground = false,
  onSelectChat = null,
  onClose = null,
  animationClass = "",
  onRequestEditDialog = null,
  onRequestDeleteDialog = null,
  refreshTrigger = 0,
}: ChatHistoryPanelProps) => {
  const [displayedChats, setDisplayedChats] = useState<ChatHistoryItem[]>([]);
  const [filteredChats, setFilteredChats] = useState<ChatHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [topOffset, setTopOffset] = useState(0);
  const [hasMoreAbove, setHasMoreAbove] = useState(false);
  const [hasMoreBelow, setHasMoreBelow] = useState(true);
  const [deletingChatId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevScrollHeightRef = useRef(0);
  const WINDOW_SIZE = 30;
  const LOAD_SIZE = 5;
  const LOAD_THRESHOLD = 300;

  useEffect(() => {
    loadInitialChats();
  }, []);

  // Reload chats when refreshTrigger changes (after edit/delete operations)
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadInitialChats();
    }
  }, [refreshTrigger]);

  useEffect(() => {
    if (scrollRef.current && displayedChats.length > 0) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight;
    }
  }, [displayedChats.length]);

  /**
   * Loads initial batch of chats.
   */
  const loadInitialChats = async () => {
    try {
      setIsLoading(true);
      const initialChats = await chatHistoryService.getAllChats(WINDOW_SIZE, 0);
      setDisplayedChats(initialChats);
      setFilteredChats(initialChats);
      setTopOffset(0);
      setHasMoreBelow(initialChats.length === WINDOW_SIZE);
      setHasMoreAbove(false);
    } catch (error) {
      Logger.error("ChatHistoryPanel", "Failed to load chats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim() === "") {
        setFilteredChats(displayedChats);
      } else {
        try {
          const results = await chatHistoryService.searchChats(searchQuery);
          setFilteredChats(results);
        } catch (error) {
          Logger.error("ChatHistoryPanel", "Search failed:", error);
          setFilteredChats([]);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, displayedChats]);

  useEffect(() => {
    if (!scrollRef.current) return;

    const scrollContainer = scrollRef.current;
    const newScrollHeight = scrollContainer.scrollHeight;
    const prevScrollHeight = prevScrollHeightRef.current;

    if (
      newScrollHeight > prevScrollHeight &&
      prevScrollHeight > 0 &&
      !isLoadingMore
    ) {
      const heightDiff = newScrollHeight - prevScrollHeight;
      scrollContainer.scrollTop += heightDiff;
      prevScrollHeightRef.current = newScrollHeight;
    }
  }, [isLoadingMore]);

  /**
   * Loads more chats when scrolling to bottom.
   */
  const loadMoreBelow = async () => {
    if (isLoadingMore || !hasMoreBelow) return;

    try {
      setIsLoadingMore(true);
      const newOffset = topOffset + displayedChats.length;
      const moreChats = await chatHistoryService.getAllChats(
        LOAD_SIZE,
        newOffset,
      );

      if (moreChats.length > 0) {
        setDisplayedChats((prev) => {
          const existingIds = new Set(prev.map((c) => c.chatId));
          const uniqueNewChats = moreChats.filter(
            (c) => !existingIds.has(c.chatId),
          );

          const updated = [...prev, ...uniqueNewChats];
          if (updated.length > WINDOW_SIZE) {
            const removed = updated.length - WINDOW_SIZE;
            setTopOffset((prevOffset) => prevOffset + removed);
            const result = updated.slice(removed);
            if (searchQuery.trim() === "") {
              setFilteredChats(result);
            }
            return result;
          }
          if (searchQuery.trim() === "") {
            setFilteredChats(updated);
          }
          return updated;
        });
        setHasMoreAbove(true);
        setHasMoreBelow(moreChats.length === LOAD_SIZE);
      } else {
        setHasMoreBelow(false);
      }
    } catch (error) {
      Logger.error(
        "ChatHistoryPanel",
        "Failed to load more chats below:",
        error,
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  /**
   * Loads more chats when scrolling to top.
   */
  const loadMoreAbove = async () => {
    if (isLoadingMore || !hasMoreAbove || topOffset === 0) return;

    try {
      setIsLoadingMore(true);
      if (scrollRef.current) {
        prevScrollHeightRef.current = scrollRef.current.scrollHeight;
      }

      const newOffset = Math.max(0, topOffset - LOAD_SIZE);
      const moreChats = await chatHistoryService.getAllChats(
        LOAD_SIZE,
        newOffset,
      );

      if (moreChats.length > 0) {
        setDisplayedChats((prev) => {
          const existingIds = new Set(prev.map((c) => c.chatId));
          const uniqueNewChats = moreChats.filter(
            (c) => !existingIds.has(c.chatId),
          );

          const updated = [...uniqueNewChats, ...prev];
          if (updated.length > WINDOW_SIZE) {
            const result = updated.slice(0, WINDOW_SIZE);
            if (searchQuery.trim() === "") {
              setFilteredChats(result);
            }
            return result;
          }
          if (searchQuery.trim() === "") {
            setFilteredChats(updated);
          }
          return updated;
        });
        setTopOffset(newOffset);
        setHasMoreBelow(true);
        setHasMoreAbove(newOffset > 0);
      } else {
        setHasMoreAbove(false);
      }
    } catch (error) {
      Logger.error(
        "ChatHistoryPanel",
        "Failed to load more chats above:",
        error,
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  /**
   * Handles scroll events to trigger infinite loading.
   *
   * @param {Event} e - Scroll event
   */
  const handleScroll = async (e: UIEvent<HTMLDivElement>) => {
    if (searchQuery.trim() !== "") return;

    if (scrollTimeoutRef.current) return;
    scrollTimeoutRef.current = setTimeout(() => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = null;
    }, 150);

    const element = e.currentTarget;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const distanceFromTop = scrollTop;

    if (distanceFromBottom < LOAD_THRESHOLD && hasMoreBelow && !isLoadingMore) {
      await loadMoreBelow();
    }

    if (distanceFromTop < LOAD_THRESHOLD && hasMoreAbove && !isLoadingMore) {
      await loadMoreAbove();
    }
  };

  /**
   * Handles delete chat button click.
   *
   * @param {string} chatId - ID of chat to delete
   */
  const handleDeleteClick = (chatId: string) => {
    if (onRequestDeleteDialog) {
      onRequestDeleteDialog(chatId);
    }
  };

  /**
   * Handles edit title button click.
   *
   * @param {Object} chat - Chat object
   */
  const handleEditTitle = (chat: ChatHistoryItem) => {
    if (onRequestEditDialog) {
      onRequestEditDialog(chat.chatId, chat.title || "Untitled Chat");
    }
  };

  /**
   * Formats URL for display.
   *
   * @param {string} url - URL to format
   * @returns {string} Formatted URL
   */
  const formatUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return (
        urlObj.hostname +
        (urlObj.pathname !== "/" ? urlObj.pathname.substring(0, 30) : "")
      );
    } catch {
      return url?.substring(0, 50) || "Unknown";
    }
  };

  /**
   * Formats date for display.
   *
   * @param {string} isoString - ISO date string
   * @returns {string} Formatted date
   */
  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  /**
   * Gets preview text from first user message.
   *
   * @param {Object} chat - Chat object
   * @returns {string} Preview text
   */
  const getChatPreview = (chat: ChatHistoryItem) => {
    if (!chat.messages || chat.messages.length === 0) return "No messages";

    const firstMsg = chat.messages.find((m) => m.role === "user");
    if (firstMsg && firstMsg.content) {
      return (
        firstMsg.content.substring(0, 60) +
        (firstMsg.content.length > 60 ? "..." : "")
      );
    }
    return "Chat";
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col h-full rounded-3xl overflow-hidden glass-container",
        isLightBackground && "glass-container-dark",
        animationClass,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "px-6 py-2 md:py-4 border-b",
          isLightBackground ? "border-white/30" : "border-white/20",
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Chat History</h2>
          {onClose && (
            <Button
              onClick={onClose}
              variant="default"
              className="w-8 h-8 flex items-center justify-center"
              aria-label="Close history"
            >
              <Icon name="close" size={16} />
            </Button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            className="w-full pr-8"
          />
          {searchQuery && (
            <Button
              onClick={() => {
                setSearchQuery("");
              }}
              variant="default"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 h-auto"
            >
              <Icon name="close" size={16} />
            </Button>
          )}
        </div>
      </div>

      {/* Chats List */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white/60">
              <div className="animate-spin text-2xl mb-2">
                <Icon name="hourglass" size={16} />
              </div>
              <div className="text-sm">Loading chats...</div>
            </div>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white/60">
              <div className="text-3xl mb-2">
                <Icon name="empty" size={16} />
              </div>
              <div className="text-sm">
                {searchQuery
                  ? "No chats match your search"
                  : "No chat history yet"}
              </div>
            </div>
          </div>
        ) : null}

        {/* Chat items */}
        {filteredChats.map((chat) => (
          <div
            key={chat.chatId}
            className="px-2 md:px-4 py-2 md:py-3 border-b border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-all"
            onClick={() => onSelectChat && onSelectChat(chat)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* Chat title */}
                <div className="font-medium text-sm truncate text-white">
                  {chat.title || "Untitled Chat"}
                </div>

                {/* Chat preview */}
                <div className="text-xs truncate mt-1 text-white/50">
                  {getChatPreview(chat)}
                </div>

                {/* Metadata with URL */}
                <div className="text-xs mt-1 flex flex-col gap-1 text-white/40">
                  <div className="flex items-center gap-2">
                    <span>{chat.messageCount || 0} messages</span>
                    <span>•</span>
                    <span>{formatDate(chat.updatedAt || chat.createdAt)}</span>
                  </div>
                  {typeof chat.metadata?.sourceUrl === "string" && (
                    <div className="flex items-center gap-1 text-xs truncate text-white/30">
                      <Icon name="location" size={12} />
                      <span>{formatUrl(chat.metadata.sourceUrl)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex-shrink-0 flex gap-1">
                {/* Edit button */}
                <Button
                  onClick={(e: ReactMouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    handleEditTitle(chat);
                  }}
                  variant={isLightBackground ? "dark" : "default"}
                  className="h-6 w-6 rounded-md"
                  title="Edit title"
                >
                  <span
                    className={cn(
                      isLightBackground ? "glass-text" : "glass-text-black",
                      "text-xs leading-none",
                    )}
                  >
                    <Icon name="pencil" size={16} />
                  </span>
                </Button>

                {/* Delete button */}
                <Button
                  onClick={(e: ReactMouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    handleDeleteClick(chat.chatId);
                  }}
                  disabled={deletingChatId === chat.chatId}
                  variant={isLightBackground ? "dark" : "default"}
                  className={cn(
                    "flex-shrink-0 h-6 w-6 rounded-md",
                    deletingChatId === chat.chatId
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:glass-error",
                  )}
                  title="Delete chat"
                >
                  <span
                    className={cn(
                      isLightBackground ? "glass-text" : "glass-text-black",
                      "text-xs leading-none",
                    )}
                  >
                    <Icon
                      name={
                        deletingChatId === chat.chatId ? "hourglass" : "delete"
                      }
                      size={14}
                    />
                  </span>
                </Button>
              </div>
            </div>
          </div>
        ))}

        {/* End of history indicator */}
        {!hasMoreAbove && filteredChats.length > 0 && (
          <div className="px-2 md:px-4 py-2 md:py-3 text-center text-xs text-white/50">
            ↑ You've reached the beginning of your chat history
          </div>
        )}

        {/* Loading more indicator at bottom */}
        {isLoadingMore && (
          <div className="px-2 md:px-4 py-2 md:py-3 text-center text-xs text-white/50">
            ⏳ Loading more chats...
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ChatHistoryPanel);
