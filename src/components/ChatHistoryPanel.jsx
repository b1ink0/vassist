/**
 * ChatHistoryPanel Component
 * 
 * Displays chat history with:
 * - Infinite scroll (loads more as user scrolls)
 * - Search functionality
 * - Delete with confirmation
 * - Sorted by most recent first
 * - Click to load a chat
 */

import { useState, useEffect, useRef, memo } from 'react'
import { Icon } from './icons';;
import chatHistoryService from '../services/ChatHistoryService';

const ChatHistoryPanel = ({
  isLightBackground = false,
  onSelectChat = null, // Callback when user clicks a chat
  onClose = null,
  animationClass = '', // Animation class for entrance/exit
  onRequestEditDialog = null, // Callback to request showing edit dialog
  onRequestDeleteDialog = null, // Callback to request showing delete dialog
}) => {
  const [displayedChats, setDisplayedChats] = useState([]); // Only 20 chats to display at a time
  const [filteredChats, setFilteredChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [topOffset, setTopOffset] = useState(0); // Offset of first chat in displayedChats
  const [hasMoreAbove, setHasMoreAbove] = useState(false); // Can scroll up for more
  const [hasMoreBelow, setHasMoreBelow] = useState(true); // Can scroll down for more
  const [deletingChatId, setDeletingChatId] = useState(null);
  
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const searchInputRef = useRef(null);
  const scrollTimeoutRef = useRef(null); // Throttle scroll events
  const prevScrollHeightRef = useRef(0); // Track scroll height for position preservation
  const WINDOW_SIZE = 30; // Always show 30 chats (increased per request)
  const LOAD_SIZE = 5; // Load 5 at a time when scrolling
  const LOAD_THRESHOLD = 300; // px from edge to start pre-loading

  // Load initial chats
  useEffect(() => {
    loadInitialChats();
  }, []);

  // Initialize scroll height tracking after chats are loaded
  useEffect(() => {
    if (scrollRef.current && displayedChats.length > 0) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight;
    }
  }, [displayedChats.length]);

  const loadInitialChats = async () => {
    try {
      setIsLoading(true);
      const initialChats = await chatHistoryService.getAllChats(WINDOW_SIZE, 0);
      setDisplayedChats(initialChats);
      setFilteredChats(initialChats); // Sync filtered chats on initial load
      setTopOffset(0);
      setHasMoreBelow(initialChats.length === WINDOW_SIZE);
      setHasMoreAbove(false); // No chats above at start
    } catch (error) {
      console.error('[ChatHistoryPanel] Failed to load chats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle search with debouncing
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim() === '') {
        setFilteredChats(displayedChats);
      } else {
        try {
          const results = await chatHistoryService.searchChats(searchQuery);
          setFilteredChats(results);
        } catch (error) {
          console.error('[ChatHistoryPanel] Search failed:', error);
          setFilteredChats([]);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, displayedChats]);

  // Preserve scroll position when prepending items (loading from above)
  useEffect(() => {
    if (!scrollRef.current) return;
    
    const scrollContainer = scrollRef.current;
    const newScrollHeight = scrollContainer.scrollHeight;
    const prevScrollHeight = prevScrollHeightRef.current;
    
    // Only adjust if scroll height increased AND we were just loading
    // This prevents constant adjustments during normal scrolling
    if (newScrollHeight > prevScrollHeight && prevScrollHeight > 0 && !isLoadingMore) {
      const heightDiff = newScrollHeight - prevScrollHeight;
      scrollContainer.scrollTop += heightDiff;
      prevScrollHeightRef.current = newScrollHeight;
    }
  }, [isLoadingMore]); // Only trigger when loading state changes

  // Load more chats from below (when scrolling to bottom)
  const loadMoreBelow = async () => {
    if (isLoadingMore || !hasMoreBelow) return;
    
    try {
      setIsLoadingMore(true);
      // Calculate new offset: current top offset + current window size
      const newOffset = topOffset + displayedChats.length;
      const moreChats = await chatHistoryService.getAllChats(LOAD_SIZE, newOffset);
      
      if (moreChats.length > 0) {
        // Add new chats at bottom, remove from top to keep window size constant
        setDisplayedChats(prev => {
          // Deduplicate: create a set of existing chat IDs
          const existingIds = new Set(prev.map(c => c.chatId));
          // Filter out new chats that already exist
          const uniqueNewChats = moreChats.filter(c => !existingIds.has(c.chatId));
          
          const updated = [...prev, ...uniqueNewChats];
          // If we exceed window size, remove from the beginning
          if (updated.length > WINDOW_SIZE) {
            const removed = updated.length - WINDOW_SIZE;
            setTopOffset(prevOffset => prevOffset + removed);
            const result = updated.slice(removed);
            // Sync filtered chats if search is empty (inline, not in effect)
            if (searchQuery.trim() === '') {
              setFilteredChats(result);
            }
            return result;
          }
          // Sync filtered chats if search is empty (inline, not in effect)
          if (searchQuery.trim() === '') {
            setFilteredChats(updated);
          }
          return updated;
        });
        setHasMoreAbove(true); // Now we can scroll up
        setHasMoreBelow(moreChats.length === LOAD_SIZE); // More below if we got full batch
      } else {
        setHasMoreBelow(false);
      }
    } catch (error) {
      console.error('[ChatHistoryPanel] Failed to load more chats below:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Load more chats from above (when scrolling to top)
  const loadMoreAbove = async () => {
    if (isLoadingMore || !hasMoreAbove || topOffset === 0) return;
    
    try {
      setIsLoadingMore(true);
      // Record current scroll height before state update to preserve position
      if (scrollRef.current) {
        prevScrollHeightRef.current = scrollRef.current.scrollHeight;
      }
      
      // Load chats before the current top offset
      const newOffset = Math.max(0, topOffset - LOAD_SIZE);
      const moreChats = await chatHistoryService.getAllChats(LOAD_SIZE, newOffset);
      
      if (moreChats.length > 0) {
        // Add new chats at top, remove from bottom to keep window size constant
        setDisplayedChats(prev => {
          // Deduplicate: create a set of existing chat IDs
          const existingIds = new Set(prev.map(c => c.chatId));
          // Filter out new chats that already exist
          const uniqueNewChats = moreChats.filter(c => !existingIds.has(c.chatId));
          
          const updated = [...uniqueNewChats, ...prev];
          // If we exceed window size, remove from the end
          if (updated.length > WINDOW_SIZE) {
            const result = updated.slice(0, WINDOW_SIZE);
            // Sync filtered chats if search is empty (inline, not in effect)
            if (searchQuery.trim() === '') {
              setFilteredChats(result);
            }
            return result;
          }
          // Sync filtered chats if search is empty (inline, not in effect)
          if (searchQuery.trim() === '') {
            setFilteredChats(updated);
          }
          return updated;
        });
        setTopOffset(newOffset); // Update the offset to where we loaded from
        setHasMoreBelow(true); // Now we can scroll down again
        setHasMoreAbove(newOffset > 0); // More above if offset > 0
      } else {
        setHasMoreAbove(false);
      }
    } catch (error) {
      console.error('[ChatHistoryPanel] Failed to load more chats above:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Handle scroll to load more (scroll detection)
  const handleScroll = async (e) => {
    // If searching, don't load more
    if (searchQuery.trim() !== '') return;

    // Throttle scroll events to prevent rapid triggers
    if (scrollTimeoutRef.current) return;
    scrollTimeoutRef.current = setTimeout(() => {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }, 150);

    const element = e.target;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const distanceFromTop = scrollTop;

    // If scrolled near bottom (preload earlier), load more chats from below
    if (distanceFromBottom < LOAD_THRESHOLD && hasMoreBelow && !isLoadingMore) {
      await loadMoreBelow();
    }

    // If scrolled near top (preload earlier), load more chats from above
    if (distanceFromTop < LOAD_THRESHOLD && hasMoreAbove && !isLoadingMore) {
      await loadMoreAbove();
    }
  };

  // Handle delete chat
  const handleDeleteClick = (chatId) => {
    if (onRequestDeleteDialog) {
      onRequestDeleteDialog(chatId);
    }
  };

  // Handle edit title
  const handleEditTitle = (chat) => {
    if (onRequestEditDialog) {
      onRequestEditDialog(chat.chatId, chat.title || 'Untitled Chat');
    }
  };

  const formatUrl = (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname.substring(0, 30) : '');
    } catch {
      return url?.substring(0, 50) || 'Unknown';
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getChatPreview = (chat) => {
    if (!chat.messages || chat.messages.length === 0) return 'No messages';
    
    const firstMsg = chat.messages.find(m => m.role === 'user');
    if (firstMsg && firstMsg.content) {
      return firstMsg.content.substring(0, 60) + (firstMsg.content.length > 60 ? '...' : '');
    }
    return 'Chat';
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full rounded-3xl overflow-hidden glass-container ${isLightBackground ? 'glass-container-dark' : ''} ${animationClass}`}
    >
      {/* Header */}
      <div className={`px-6 py-4 border-b ${isLightBackground ? 'border-white/30' : 'border-white/20'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Chat History
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors shrink-0"
              aria-label="Close history"
            ><Icon name="close" size={16} /></button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm transition-all bg-white/10 text-white placeholder-white/50 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/70"
            ><Icon name="close" size={16} /></button>
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
          // Loading state
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white/60">
              <div className="animate-spin text-2xl mb-2"><Icon name="hourglass" size={16} /></div>
              <div className="text-sm">Loading chats...</div>
            </div>
          </div>
        ) : filteredChats.length === 0 ? (
          // Empty state
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white/60">
              <div className="text-3xl mb-2"><Icon name="empty" size={16} /></div>
              <div className="text-sm">
                {searchQuery ? 'No chats match your search' : 'No chat history yet'}
              </div>
            </div>
          </div>
        ) : null}

        {/* Chat items */}
        {filteredChats.map((chat) => (
          <div
            key={chat.chatId}
            className="px-4 py-3 border-b border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-all"
            onClick={() => onSelectChat && onSelectChat(chat)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* Chat title */}
                <div className="font-medium text-sm truncate text-white">
                  {chat.title || 'Untitled Chat'}
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
                  {chat.metadata?.sourceUrl && (
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditTitle(chat);
                  }}
                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-6 w-6 rounded-md flex items-center justify-center transition-opacity`}
                  title="Edit title"
                >
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-xs leading-none`}><Icon name="pencil" size={16} /></span>
                </button>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(chat.chatId);
                  }}
                  disabled={deletingChatId === chat.chatId}
                  className={`flex-shrink-0 glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-6 w-6 rounded-md flex items-center justify-center transition-opacity ${
                    deletingChatId === chat.chatId ? 'opacity-50 cursor-not-allowed' : 'hover:glass-error'
                  }`}
                  title="Delete chat"
                >
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-xs leading-none`}>
                    <Icon name={deletingChatId === chat.chatId ? 'hourglass' : 'delete'} size={14} />
                  </span>
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* End of history indicator */}
        {!hasMoreAbove && filteredChats.length > 0 && (
          <div className="px-4 py-3 text-center text-xs text-white/50">
            ↑ You've reached the beginning of your chat history
          </div>
        )}

        {/* Loading more indicator at bottom */}
        {isLoadingMore && (
          <div className="px-4 py-3 text-center text-xs text-white/50">
            ⏳ Loading more chats...
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ChatHistoryPanel);
