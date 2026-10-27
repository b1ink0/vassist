/**
 * @fileoverview Chat history panel with infinite scroll, search, and chat management.
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
  type ChangeEvent,
  type UIEvent,
} from "react";
import { ScrollArea } from "@base-ui/react/scroll-area";
import ChatHistoryActions from "./ChatHistoryActions";
import { useEmbedHost } from "../../embed/EmbedHostContext";
import { resolveConfiguredPortalContainer } from "../../embed/portalContainers";
import { useSpatialHtmlPanelHost } from "../xr/SpatialHtmlPanelContext";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Icon } from "../icons";
import { Button, Input } from "../ui";
import { cn } from "../../utils/cn";
import { useAppRuntimeServices } from "../../contexts/AppRuntimeContext";
import Logger from "../../services/common/LoggerService";
import { isAndroid, isDesktop } from "../../utils/PlatformUtils";
import { ANDROID_SYSTEM_INSET_BOTTOM } from "./historyLayout";

const HISTORY_PAGE_SIZE = 30;
const HISTORY_LOAD_SIZE = 20;
const HISTORY_LOAD_THRESHOLD = 300;
const HISTORY_ESTIMATED_ROW_HEIGHT = 48;

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
  /** Render without the glass container/border, for embedding inside a sidebar host. */
  embedded?: boolean;
  /** Currently open chat id; its row gets an active highlight. */
  currentChatId?: string | null;
  /** Optional "New chat" action pinned below the list. */
  onNewChat?: (() => void) | null;
  onOpenSettings?: (() => void) | null;
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
  embedded = false,
  currentChatId = null,
  onNewChat = null,
  onOpenSettings = null,
}: ChatHistoryPanelProps) => {
  const { chatHistoryService } = useAppRuntimeServices();
  const [displayedChats, setDisplayedChats] = useState<ChatHistoryItem[]>([]);
  const [filteredChats, setFilteredChats] = useState<ChatHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreBelow, setHasMoreBelow] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { embedConfig } = useEmbedHost();
  const spatialHost = useSpatialHtmlPanelHost();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const historyVirtualizer = useVirtualizer({
    count: filteredChats.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => HISTORY_ESTIMATED_ROW_HEIGHT,
    getItemKey: (index) => filteredChats[index]?.chatId ?? `chat-${index}`,
    overscan: 8,
  });

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus();
  }, [isSearchOpen]);

  const portalContainer =
    spatialHost ??
    resolveConfiguredPortalContainer(
      embedConfig,
      "popovers",
      containerRef.current,
    );
  const shouldShowSourceUrl = !(isDesktop || isAndroid);

  const virtualChatItems = historyVirtualizer.getVirtualItems();

  /**
   * Loads initial batch of chats.
   */
  const loadInitialChats = useCallback(async () => {
    try {
      setIsLoading(true);
      const initialChats = await chatHistoryService.getAllChats(
        HISTORY_PAGE_SIZE,
        0,
      );
      setDisplayedChats(initialChats);
      setFilteredChats(initialChats);
      setHasMoreBelow(initialChats.length === HISTORY_PAGE_SIZE);
    } catch (error) {
      Logger.error("ChatHistoryPanel", "Failed to load chats:", error);
    } finally {
      setIsLoading(false);
    }
  }, [chatHistoryService]);

  useEffect(() => {
    void loadInitialChats();
  }, [loadInitialChats]);

  // Reload chats when refreshTrigger changes (after edit/delete operations)
  useEffect(() => {
    if (refreshTrigger > 0) {
      void loadInitialChats();
    }
  }, [loadInitialChats, refreshTrigger]);

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
  }, [chatHistoryService, displayedChats, searchQuery]);

  const loadMoreBelow = useCallback(async () => {
    if (searchQuery.trim() !== "" || isLoadingMore || !hasMoreBelow) return;

    try {
      setIsLoadingMore(true);
      const moreChats = await chatHistoryService.getAllChats(
        HISTORY_LOAD_SIZE,
        displayedChats.length,
      );

      if (moreChats.length > 0) {
        setDisplayedChats((prev) => {
          const existingIds = new Set(prev.map((chat) => chat.chatId));
          const uniqueNewChats = moreChats.filter(
            (chat) => !existingIds.has(chat.chatId),
          );
          return [...prev, ...uniqueNewChats];
        });
      }

      setHasMoreBelow(moreChats.length === HISTORY_LOAD_SIZE);
    } catch (error) {
      Logger.error(
        "ChatHistoryPanel",
        "Failed to load more chats below:",
        error,
      );
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    chatHistoryService,
    displayedChats.length,
    hasMoreBelow,
    isLoadingMore,
    searchQuery,
  ]);

  useEffect(() => {
    if (
      searchQuery.trim() !== "" ||
      isLoading ||
      isLoadingMore ||
      !hasMoreBelow ||
      !scrollRef.current
    ) {
      return;
    }

    if (
      scrollRef.current.scrollHeight <=
      scrollRef.current.clientHeight + HISTORY_LOAD_THRESHOLD
    ) {
      void loadMoreBelow();
    }
  }, [
    displayedChats.length,
    hasMoreBelow,
    isLoading,
    isLoadingMore,
    loadMoreBelow,
    searchQuery,
  ]);

  /**
   * Loads more chats when scrolling to bottom.
   */
  /**
   * Handles scroll events to trigger infinite loading.
   *
   * @param {Event} e - Scroll event
   */
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    if (searchQuery.trim() !== "") return;

    if (scrollTimeoutRef.current) return;
    scrollTimeoutRef.current = setTimeout(() => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = null;
    }, 150);

    if (
      e.currentTarget.scrollHeight -
        e.currentTarget.scrollTop -
        e.currentTarget.clientHeight <
        HISTORY_LOAD_THRESHOLD &&
      historyVirtualizer.getDistanceFromEnd() < HISTORY_LOAD_THRESHOLD &&
      hasMoreBelow &&
      !isLoadingMore
    ) {
      void loadMoreBelow();
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
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  return (
    <div
      ref={containerRef}
      data-testid="chat-history-panel"
      className={cn(
        "flex flex-col h-full overflow-hidden",
        !embedded && "rounded-3xl glass-container",
        !embedded && isLightBackground && "glass-container-dark",
        animationClass,
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-1 px-3">
        {onClose && (
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            aria-label="Close history"
            title={embedded ? "Close sidebar" : "Close history"}
          >
            <Icon name={embedded ? "sidebar-close" : "close"} size={18} />
          </Button>
        )}
        {isSearchOpen ? (
          <>
            <Input
              ref={searchInputRef}
              variant={isLightBackground ? "dark" : "default"}
              type="search"
              data-testid="chat-history-search-input"
              aria-label="Search chats"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSearchQuery(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }
              }}
              className="h-8 min-w-0 flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close search"
              data-testid="chat-history-search-clear"
              onClick={() => {
                setSearchQuery("");
                setIsSearchOpen(false);
              }}
            >
              <Icon name="close" size={16} />
            </Button>
          </>
        ) : (
          <>
            <h2 className="min-w-0 flex-1 text-sm font-semibold text-white">
              Chats
            </h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search chats"
              title="Search chats"
              data-testid="chat-history-search-toggle"
              onClick={() => setIsSearchOpen(true)}
            >
              <Icon name="search" size={18} />
            </Button>
          </>
        )}
      </div>
      <ScrollArea.Root className="relative min-h-0 flex-1">
        <ScrollArea.Viewport
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full outline-none"
          data-testid="chat-history-scroll-viewport"
        >
          <ScrollArea.Content className="min-h-full pb-2">
            {isLoading ? (
              <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-white/60">
                <Icon name="hourglass" size={16} />
                Loading chats...
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-5 text-center text-sm text-white/60">
                <Icon name="empty" size={20} />
                <span>
                  {searchQuery
                    ? "No chats match your search"
                    : "No chat history yet"}
                </span>
              </div>
            ) : (
              <div
                style={{
                  height: historyVirtualizer.getTotalSize(),
                  position: "relative",
                  width: "100%",
                }}
              >
                {virtualChatItems.map((virtualItem) => {
                  const chat = filteredChats[virtualItem.index];
                  if (!chat) return null;
                  const dateLabel = formatDate(
                    chat.updatedAt || chat.createdAt,
                  );
                  const previous = filteredChats[virtualItem.index - 1];
                  const showDate =
                    !previous ||
                    dateLabel !==
                      formatDate(previous.updatedAt || previous.createdAt);
                  const title = chat.title || "Untitled Chat";
                  const count = chat.messageCount ?? chat.messages?.length ?? 0;
                  return (
                    <div
                      key={virtualItem.key}
                      ref={historyVirtualizer.measureElement}
                      data-index={virtualItem.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      {showDate && dateLabel && (
                        <div className="px-5 pb-1 pt-3 text-xs font-medium text-white/45">
                          {dateLabel}
                        </div>
                      )}
                      <div
                        data-testid={`chat-history-item-${chat.chatId}`}
                        className={cn(
                          "mx-2 flex items-center gap-1 rounded-xl px-2 py-1 transition-colors hover:bg-white/10",
                          currentChatId === chat.chatId && "bg-white/10",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectChat?.(chat)}
                          aria-current={
                            currentChatId === chat.chatId ? "page" : undefined
                          }
                          className="min-w-0 flex-1 cursor-pointer rounded-lg px-1 py-2 text-left text-sm text-white outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60"
                        >
                          <span
                            className={cn(
                              "block truncate",
                              currentChatId === chat.chatId && "font-medium",
                            )}
                          >
                            {title}
                          </span>
                        </button>
                        <ChatHistoryActions
                          chatId={chat.chatId}
                          title={title}
                          details={`${count} ${count === 1 ? "message" : "messages"} · ${formatDate(chat.updatedAt || chat.createdAt)}`}
                          sourceUrl={
                            shouldShowSourceUrl &&
                            typeof chat.metadata?.sourceUrl === "string"
                              ? formatUrl(chat.metadata.sourceUrl)
                              : undefined
                          }
                          portalContainer={portalContainer}
                          isLightBackground={isLightBackground}
                          onRename={() => handleEditTitle(chat)}
                          onDelete={() => handleDeleteClick(chat.chatId)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {isLoadingMore && (
              <div className="py-3 text-center text-xs text-white/50">
                Loading more chats...
              </div>
            )}
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          orientation="vertical"
          data-testid="chat-history-scrollbar"
          className="m-1 flex w-1 rounded-full opacity-0 transition-opacity duration-200 data-[scrolling]:opacity-100 data-[scrolling]:delay-0 motion-reduce:transition-none"
        >
          <ScrollArea.Thumb className="w-full rounded-full bg-white/30" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
      {(onNewChat || onOpenSettings) && (
        <div
          className="flex shrink-0 items-center justify-between px-3 pt-2 pb-3"
          style={
            isAndroid
              ? { paddingBottom: `calc(12px + ${ANDROID_SYSTEM_INSET_BOTTOM})` }
              : undefined
          }
        >
          {onNewChat && (
            <Button
              onClick={onNewChat}
              variant="ghost"
              size="sm"
              data-testid="chat-history-new-chat"
              aria-label="New chat"
              className="h-9 rounded-lg px-2.5"
            >
              <Icon name="add" size={18} />
              <span>New chat</span>
            </Button>
          )}
          {onOpenSettings && (
            <Button
              onClick={onOpenSettings}
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg"
              aria-label="Settings"
              title="Settings"
              tooltipVariant={isLightBackground ? "dark" : "default"}
              data-testid="chat-history-settings"
            >
              <Icon name="settings" size={18} />
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(ChatHistoryPanel);
