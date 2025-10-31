import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { Icon } from './icons';;
import { TTSServiceProxy, StorageServiceProxy } from '../services/proxies';
import { DefaultTTSConfig } from '../config/aiConfig';
import BackgroundDetector from '../utils/BackgroundDetector';
import DragDropService from '../services/DragDropService';
import UtilService from '../services/UtilService';
import SettingsPanel from './SettingsPanel';
import ChatHistoryPanel from './ChatHistoryPanel';
import ChatEditDialog from './ChatEditDialog';
import ChatDeleteDialog from './ChatDeleteDialog';
import ChatMessage from './ChatMessage';
import chatHistoryService from '../services/ChatHistoryService';
import { useApp } from '../contexts/AppContext';
import { useConfig } from '../contexts/ConfigContext';
import Logger from '../services/Logger';

const ChatContainer = ({ 
  modelDisabled = false,
  onDragDrop // New prop to handle dropped content
}) => {
  // Get shared state from AppContext
  const {
    positionManagerRef,
    chatMessages: messages,
    isChatContainerVisible: isVisible,
    isProcessing: isGenerating,
    isSpeaking,
    playingMessageIndex,
    loadingMessageIndex,
    isDragOverChat: isDragOver,
    isSettingsPanelOpen,
    isHistoryPanelOpen,
    isTempChat,
    buttonPosition,
    isDraggingButton,
    isDraggingModel,
    setPlayingMessageIndex,
    setLoadingMessageIndex,
    setIsDragOverChat: setIsDragOver,
    setIsSettingsPanelOpen,
    setIsHistoryPanelOpen,
    setIsTempChat,
    loadChatFromHistory,
    clearChat,
    stopGeneration,
    closeChat,
    startButtonDrag,
    endButtonDrag,
    startModelDrag,
    endModelDrag,
    editUserMessage,
    regenerateAIMessage,
    previousBranch,
    nextBranch,
    uiConfig,
  } = useApp();

  // Get config for toggling model visibility
  const { updateUIConfig } = useConfig();

  // Local refs and state for internal component logic
  const buttonPosRef = useRef(buttonPosition);
  const buttonInitializedRef = useRef(false);
  const [containerPos, setContainerPos] = useState({ x: 0, y: 0 });
  const scrollRef = useRef(null);
  const dragDropServiceRef = useRef(null);
  const currentSessionRef = useRef(null);
  const [isLightBackground, setIsLightBackground] = useState(false);
  const [ttsConfig, setTtsConfig] = useState(DefaultTTSConfig);
  const containerRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [debugMarkers, setDebugMarkers] = useState([]);
  const chatInputRef = useRef(null); // Get input ref from context when needed
  const [copiedMessageIndex, setCopiedMessageIndex] = useState(null);
  const previousMessageCountRef = useRef(0);
  const previousIsGeneratingRef = useRef(false);
  const [shouldForceComplete, setShouldForceComplete] = useState(false);
  const [isWaitingForAnimation, setIsWaitingForAnimation] = useState(false);
  const [isClosing, setIsClosing] = useState(false); // Track closing animation state
  const [isSettingsPanelClosing, setIsSettingsPanelClosing] = useState(false); // Track settings panel closing
  const [isHistoryPanelClosing, setIsHistoryPanelClosing] = useState(false); // Track history panel closing
  
  // Chat history dialog state (rendered outside ChatHistoryPanel to avoid backdrop-filter issues)
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingChatTitle, setEditingChatTitle] = useState('');
  const [deletingChatId, setDeletingChatId] = useState(null);
  const [isEditDialogClosing, setIsEditDialogClosing] = useState(false);
  const [isDeleteDialogClosing, setIsDeleteDialogClosing] = useState(false);
  
  // Track which message IDs have been streamed in this session (not from history)
  const streamedMessageIdsRef = useRef(new Set());
  
  // Track which message IDs have completed streaming (NEVER cleared - persists across chat open/close)
  const completedMessageIdsRef = useRef(new Set());
  
  // Track the last USER message ID to determine which should animate
  const lastAnimatedMessageIdRef = useRef(null);

  // Keep button position ref in sync with context
  useEffect(() => {
    buttonPosRef.current = buttonPosition;
  }, [buttonPosition]);

  /**
   * Detect when to force-complete streaming animation
   * Triggers when AI generation stops
   */
  useEffect(() => {
    // Track messages that are being generated (streamed) in this session
    if (isGenerating && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && !lastMessage.isUser && !streamedMessageIdsRef.current.has(lastMessage.id)) {
        streamedMessageIdsRef.current.add(lastMessage.id);
        Logger.log('ChatContainer', 'Tracking streamed message:', lastMessage.id);
      }
    }
    
    // Detect when generation stops (was generating, now not generating)
    const wasGenerating = previousIsGeneratingRef.current;
    const stoppedGenerating = wasGenerating && !isGenerating;
    
    // Also check if messages increased (user sent new message)
    const messageCountIncreased = messages.length > previousMessageCountRef.current;
    
    if (stoppedGenerating && messageCountIncreased) {
      // User interrupted AI by sending new message - force complete the streaming animation
      Logger.log('ChatContainer', 'AI interrupted by user, forcing completion');
      setShouldForceComplete(true);
      setIsWaitingForAnimation(true);
      
      // Wait for instant-fade animation to complete (200ms) before showing new message
      const animationTimer = setTimeout(() => {
        setIsWaitingForAnimation(false);
      }, 200); // Match the instant-fade animation duration
      
      // Reset forceComplete flag after StreamingText processes it
      const resetTimer = setTimeout(() => {
        setShouldForceComplete(false);
      }, 250);
      
      return () => {
        clearTimeout(animationTimer);
        clearTimeout(resetTimer);
      };
    }

    previousIsGeneratingRef.current = isGenerating;
    previousMessageCountRef.current = messages.length;
  }, [messages, isGenerating]);

  /**
   * Auto-focus input when chat is cleared (new chat created)
   */
  useEffect(() => {
    if (messages.length === 0 && isVisible) {
      // Clear tracked message IDs when starting a new chat
      streamedMessageIdsRef.current.clear();
      Logger.log('ChatContainer', 'Cleared streamed message tracking for new chat');
      
      // Dispatch event for ChatInput to focus
      const event = new CustomEvent('focusChatInput');
      window.dispatchEvent(event);
    }
  }, [messages.length, isVisible]);

  /**
   * Listen for voice interrupt events to trigger force-complete
   */
  useEffect(() => {
    const handleVoiceInterrupt = () => {
      if (isGenerating) {
        Logger.log('ChatContainer', 'Voice interrupt detected, forcing instant completion');
        
        // Trigger force-complete to instantly show remaining text
        setShouldForceComplete(true);
        
        // Reset forceComplete flag after StreamingText processes it
        setTimeout(() => {
          setShouldForceComplete(false);
        }, 250);
      }
    };

    window.addEventListener('voiceInterrupt', handleVoiceInterrupt);
    
    return () => {
      window.removeEventListener('voiceInterrupt', handleVoiceInterrupt);
    };
  }, [isGenerating]);

  const calculateContainerPosition = useCallback(() => {
    const chatInputHeight = chatInputRef?.current?.getBoundingClientRect().height || 140;
    
    if (modelDisabled) {
      const buttonPos = buttonPosRef.current;
      const containerWidth = 400;
      const containerHeight = 400; // Messages area height
      const offsetY = 5; // Gap between chat bottom and button
      const buttonSize = 48;
      
      const containerX = Math.max(10, Math.min(buttonPos.x - (containerWidth - buttonSize) / 2, window.innerWidth - containerWidth - 10));
      // Position chat so its BOTTOM (including input) is offsetY above the button
      let containerY = buttonPos.y - containerHeight - chatInputHeight - offsetY;
      containerY = Math.max(10, containerY);
      const maxY = window.innerHeight - containerHeight - chatInputHeight - offsetY;
      containerY = Math.min(containerY, maxY);
      
      return { x: containerX, y: containerY };
    } else if (positionManagerRef?.current) {
      try {
        const modelPos = positionManagerRef.current.getPositionPixels();
        const containerWidth = 400;
        const containerHeight = 500;
        const offsetX = 15;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        const rightX = modelPos.x + modelPos.width + offsetX;
        const leftX = modelPos.x - containerWidth - offsetX;
        const wouldOverflowRight = rightX + containerWidth > windowWidth - 10;
        const wouldOverflowLeft = leftX < 10;
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
        containerX = Math.max(10, Math.min(containerX, windowWidth - containerWidth - 10));
        let containerY = modelPos.y;
        containerY = Math.max(10, Math.min(containerY, windowHeight - containerHeight - 10));
        
        return { x: containerX, y: containerY };
      } catch (error) {
        Logger.error('ChatContainer', 'Failed to calculate model position:', error);
        return { x: 0, y: 0 };
      }
    }
    
    return { x: 0, y: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelDisabled]); // Refs are stable, don't include them in dependencies

  // Initialize button position from storage in chat-only mode
  useEffect(() => {
    if (!modelDisabled || buttonInitializedRef.current) return;

    const initButton = async () => {
      try {
        const defaultPos = { x: window.innerWidth - 68, y: window.innerHeight - 68 };
        const savedPos = await StorageServiceProxy.configLoad('chatButtonPosition', defaultPos);
        buttonPosRef.current = savedPos;
        buttonInitializedRef.current = true;
        setContainerPos(calculateContainerPosition());
      } catch (error) {
        Logger.error('ChatContainer', 'Failed to load button position:', error);
        buttonInitializedRef.current = true;
      }
    };

    initButton();
  }, [modelDisabled, calculateContainerPosition]);

  // Recalculate position when visibility changes in model mode
  useEffect(() => {
    if (!isVisible || modelDisabled) return;
    
    const newPos = calculateContainerPosition();
    setContainerPos(newPos);
  }, [isVisible, modelDisabled, calculateContainerPosition]);

  // Listen to model position changes and calculate container position
  useEffect(() => {
    if (!isVisible) return;
    
    const handleModelPosition = () => {
      const newPos = calculateContainerPosition();
      setContainerPos(newPos);
    };

    if (!modelDisabled) {
      handleModelPosition();
      window.addEventListener('modelPositionChange', handleModelPosition);
      return () => window.removeEventListener('modelPositionChange', handleModelPosition);
    }
  }, [isVisible, modelDisabled, calculateContainerPosition]);

  // Update position on window resize
  useEffect(() => {
    if (!isVisible) return;

    const handleResize = () => {
      const newPos = calculateContainerPosition();
      setContainerPos(newPos);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isVisible, calculateContainerPosition]);

  // Listen to button movement in chat-only mode
  useEffect(() => {
    const handleButtonMoved = (event) => {
      buttonPosRef.current = event.detail;
      const newPos = calculateContainerPosition();
      setContainerPos(newPos);
    };

    if (modelDisabled) {
      window.addEventListener('chatButtonMoved', handleButtonMoved);
      return () => window.removeEventListener('chatButtonMoved', handleButtonMoved);
    }
  }, [modelDisabled, calculateContainerPosition]);

  // Initialize drag-drop service for ChatContainer
  useEffect(() => {
    if (!isVisible) {
      return;
    }

    // Wait for next tick to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      if (!messagesContainerRef.current) {
        return;
      }

      // Create service instance
      dragDropServiceRef.current = new DragDropService({
        maxImages: 3,
        maxAudios: 1
      });

      // Attach with simple callbacks that forward to ChatInput
      dragDropServiceRef.current.attach(messagesContainerRef.current, {
        onSetDragOver: (isDragging) => setIsDragOver(isDragging),
        onShowError: (error) => Logger.error('ChatContainer', 'Drag-drop error:', error),
        checkVoiceMode: null,
        getCurrentCounts: () => ({ images: 0, audios: 0 }),
        onProcessData: (data) => {
          if (onDragDrop) onDragDrop(data);
        }
      });
    }, 0);

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      if (dragDropServiceRef.current) {
        dragDropServiceRef.current.detach();
      }
    };
  }, [isVisible, onDragDrop, setIsDragOver]);

  // Listen to drag events to show outline/border around container
  useEffect(() => {
    if (modelDisabled) {
      window.addEventListener('chatButtonDragStart', startButtonDrag);
      window.addEventListener('chatButtonDragEnd', endButtonDrag);
      return () => {
        window.removeEventListener('chatButtonDragStart', startButtonDrag);
        window.removeEventListener('chatButtonDragEnd', endButtonDrag);
      };
    } else {
      window.addEventListener('modelDragStart', startModelDrag);
      window.addEventListener('modelDragEnd', endModelDrag);
      return () => {
        window.removeEventListener('modelDragStart', startModelDrag);
        window.removeEventListener('modelDragEnd', endModelDrag);
      };
    }
  }, [modelDisabled, startButtonDrag, endButtonDrag, startModelDrag, endModelDrag]);

  const handleHistoryClose = useCallback(() => {
    setIsHistoryPanelClosing(true);
    setTimeout(() => {
      setIsHistoryPanelOpen(false);
      setIsHistoryPanelClosing(false);
    }, 200);
  }, [setIsHistoryPanelOpen]);

  const handleSelectChat = useCallback((chat) => {
    // Clear tracked message IDs when loading from history
    streamedMessageIdsRef.current.clear();
    Logger.log('ChatContainer', 'Cleared streamed message tracking for history load');
    
    loadChatFromHistory(chat);
    setIsHistoryPanelClosing(true);
    setTimeout(() => {
      setIsHistoryPanelOpen(false);
      setIsHistoryPanelClosing(false);
    }, 200);
  }, [loadChatFromHistory, setIsHistoryPanelOpen]);

  // Handle edit dialog requests from ChatHistoryPanel
  const handleRequestEditDialog = useCallback((chatId, title) => {
    setEditingChatId(chatId);
    setEditingChatTitle(title);
  }, []);

  const handleEditDialogSave = useCallback(async (chatId, newTitle) => {
    try {
      await chatHistoryService.updateChatTitle(chatId, newTitle);
      Logger.log('ChatContainer', 'Updated chat title:', chatId, newTitle);
      
      // Close dialog with animation
      setIsEditDialogClosing(true);
      setTimeout(() => {
        setEditingChatId(null);
        setEditingChatTitle('');
        setIsEditDialogClosing(false);
      }, 200);
    } catch (error) {
      Logger.error('ChatContainer', 'Failed to update chat title:', error);
    }
  }, []);

  const handleEditDialogCancel = useCallback(() => {
    setIsEditDialogClosing(true);
    setTimeout(() => {
      setEditingChatId(null);
      setEditingChatTitle('');
      setIsEditDialogClosing(false);
    }, 200);
  }, []);

  // Handle delete dialog requests from ChatHistoryPanel
  const handleRequestDeleteDialog = useCallback((chatId) => {
    setDeletingChatId(chatId);
  }, []);

  const handleDeleteDialogConfirm = useCallback(async (chatId) => {
    try {
      await chatHistoryService.deleteChat(chatId);
      Logger.log('ChatContainer', 'Deleted chat:', chatId);
      
      // Close dialog with animation
      setIsDeleteDialogClosing(true);
      setTimeout(() => {
        setDeletingChatId(null);
        setIsDeleteDialogClosing(false);
      }, 200);
    } catch (error) {
      Logger.error('ChatContainer', 'Failed to delete chat:', error);
    }
  }, []);

  const handleDeleteDialogCancel = useCallback(() => {
    setIsDeleteDialogClosing(true);
    setTimeout(() => {
      setDeletingChatId(null);
      setIsDeleteDialogClosing(false);
    }, 200);
  }, []);

  /**
   * Handle settings panel close with animation
   */
  const handleSettingsPanelClose = useCallback(() => {
    setIsSettingsPanelClosing(true);
    setTimeout(() => {
      setIsSettingsPanelOpen(false);
      setIsSettingsPanelClosing(false);
    }, 200);
  }, [setIsSettingsPanelOpen]);

  /**
   * Handle stop generation with force-complete animation
   */
  const handleStopGeneration = useCallback(() => {
    if (isGenerating) {
      Logger.log('ChatContainer', 'Stop button clicked, forcing instant completion');
      
      // Trigger force-complete to instantly show remaining text
      setShouldForceComplete(true);
      
      // Stop the generation
      stopGeneration();
      
      // Reset forceComplete flag after StreamingText processes it
      setTimeout(() => {
        setShouldForceComplete(false);
      }, 250);
    } else {
      // Just stop TTS if playing
      stopGeneration();
    }
  }, [isGenerating, stopGeneration]);

  // Load TTS configuration from storage on mount
  useEffect(() => {
    const loadTtsConfig = async () => {
      try {
        const config = await StorageServiceProxy.configLoad('ttsConfig', DefaultTTSConfig);
        setTtsConfig(config);
      } catch (error) {
        Logger.error('ChatContainer', 'Failed to load TTS config:', error);
        setTtsConfig(DefaultTTSConfig);
      }
    };
    
    loadTtsConfig();
  }, []);

  /**
   * Detect background color brightness behind the container
   * Samples a configurable grid for accurate detection
   */
  useEffect(() => {
    if (!isVisible) return;
    
    const detectBackgroundBrightness = () => {
      const canvas = document.getElementById('vassist-babylon-canvas');
      const container = containerRef.current;
      
      const elementsToDisable = [canvas, container].filter(Boolean);
      
      const result = BackgroundDetector.withDisabledPointerEvents(elementsToDisable, () => {
        return BackgroundDetector.detectBrightness({
          sampleArea: {
            type: 'grid',
            x: containerPos.x,
            y: containerPos.y,
            width: 400,
            height: 500,
            padding: 60,
          },
          elementsToIgnore: [
            canvas,
            container,
          ],
          logPrefix: '[ChatContainer]',
          // Don't override enableDebug - let it use the config setting
        });
      });
      
      // Update debug markers if available
      setDebugMarkers(result.debugMarkers || []);
      
      // Update state if brightness changed
      setIsLightBackground(prevState => {
        if (prevState !== result.isLight) {
          // Update classes on messages container
          if (messagesContainerRef.current) {
            if (result.isLight) {
              messagesContainerRef.current.classList.add('light-bg');
            } else {
              messagesContainerRef.current.classList.remove('light-bg');
            }
          }
          return result.isLight;
        }
        return prevState;
      });
    };
    
    // Initial detection
    detectBackgroundBrightness();
    
    // Re-check on position change (debounced)
    const timeoutId = setTimeout(detectBackgroundBrightness, 400);
    
    // Re-check on scroll (debounced)
    let scrollTimeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(detectBackgroundBrightness, 200);
    };
    
    window.addEventListener('scroll', handleScroll, true);
    
    // Also re-check periodically in case background changes
    const intervalId = setInterval(detectBackgroundBrightness, 4000);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', handleScroll, true);
      clearInterval(intervalId);
    };
  }, [isVisible, containerPos]);

  /**
   * Set up audio start callback for updating UI when audio starts playing
   */
  useEffect(() => {
    // Track if monitoring has started for voice mode
    let voiceMonitoringStarted = false;
    
    TTSServiceProxy.setAudioStartCallback((sessionId) => {
      Logger.log('ChatContainer', 'Audio started playing for session:', sessionId);
      
      // Extract message index from session ID if it's a manual session
      if (sessionId?.startsWith('manual_')) {
        const parts = sessionId.split('_');
        const messageIndex = parseInt(parts[1]);
        if (!isNaN(messageIndex)) {
          setLoadingMessageIndex(null); // Clear loading state
          setPlayingMessageIndex(messageIndex); // Set to playing state
          currentSessionRef.current = sessionId;
        }
      }
      // For auto-TTS sessions, find the last assistant message
      else if (sessionId?.startsWith('auto_')) {
        // Find the last assistant message index
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            setLoadingMessageIndex(null);
            setPlayingMessageIndex(i);
            currentSessionRef.current = sessionId;
            break;
          }
        }
      }
      // For voice mode sessions, find the last assistant message AND start monitoring
      else if (sessionId?.startsWith('voice_')) {
        // Find the last assistant message index
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            setLoadingMessageIndex(null);
            setPlayingMessageIndex(i);
            currentSessionRef.current = sessionId;
            break;
          }
        }
        
        // Start TTS playback monitoring for voice conversation mode
        if (!voiceMonitoringStarted) {
          voiceMonitoringStarted = true;
          Logger.log('ChatContainer', 'Starting TTS playback monitoring for voice mode');
          // Import VoiceConversationService dynamically to avoid circular deps
          import('../services/VoiceConversationService').then(({ default: VoiceConversationService }) => {
            VoiceConversationService.monitorTTSPlayback();
          });
        }
      }
    });

    // Set up audio end callback for resetting UI when audio finishes
    TTSServiceProxy.setAudioEndCallback((sessionId) => {
      Logger.log('ChatContainer', 'Audio finished playing for session:', sessionId);
      
      // Only clear if this is still the current session
      if (currentSessionRef.current === sessionId) {
        setPlayingMessageIndex(null);
        currentSessionRef.current = null;
      }
    });

    // Listen for custom events from ChatController (voice mode)
    const handleTTSAudioStart = (event) => {
      const { messageIndex, sessionId } = event.detail
      Logger.log('ChatContainer', 'Custom TTS audio start event:', messageIndex, sessionId)
      setLoadingMessageIndex(null)
      setPlayingMessageIndex(messageIndex)
      currentSessionRef.current = sessionId
    }

    const handleTTSAudioEnd = (event) => {
      const { sessionId } = event.detail
      Logger.log('ChatContainer', 'Custom TTS audio end event:', sessionId)
      if (currentSessionRef.current === sessionId) {
        setPlayingMessageIndex(null)
        currentSessionRef.current = null
      }
    }

    window.addEventListener('ttsAudioStart', handleTTSAudioStart)
    window.addEventListener('ttsAudioEnd', handleTTSAudioEnd)

    return () => {
      TTSServiceProxy.setAudioStartCallback(null);
      TTSServiceProxy.setAudioEndCallback(null);
      window.removeEventListener('ttsAudioStart', handleTTSAudioStart)
      window.removeEventListener('ttsAudioEnd', handleTTSAudioEnd)
    };
  }, [messages, setLoadingMessageIndex, setPlayingMessageIndex]);

  /**
   * Scroll to bottom without checking if user is near bottom
   * Used for: chat open, user sends message
   */
  const scrollToBottomImmediate = useCallback(() => {
    if (!scrollRef.current) return;
    
    const container = scrollRef.current;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'instant' // Instant for immediate scroll (no animation flash)
    });
  }, []);

  /**
   * Smooth scroll to bottom - ALWAYS scrolls, no tolerance check
   * The tolerance check was causing issues because measurements happen before DOM updates
   */
  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    
    const container = scrollRef.current;
    const scrollHeight = container.scrollHeight;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    
    // Check if user is within one container height of the bottom
    // If user can see the bottom within their viewport, auto-scroll
    const isNearBottom = scrollHeight - scrollTop - clientHeight < clientHeight;
    
    // Only auto-scroll if user is already near the bottom
    // This prevents annoying scroll interruption if user scrolled up to read
    if (isNearBottom) {
      // Smooth scroll to bottom
      container.scrollTo({
        top: scrollHeight,
        behavior: 'smooth'
      });
    }
  }, []);


  // Listen for streaming word updates to trigger scroll
  useEffect(() => {
    let lastScrollTime = 0;
    const THROTTLE_MS = 200; // Only scroll at most once every 200ms
    
    const handleStreamingUpdate = () => {
      const now = Date.now();
      
      // Throttle: skip if we scrolled too recently
      if (now - lastScrollTime < THROTTLE_MS) {
        return;
      }
      
      lastScrollTime = now;
      
      // Use requestAnimationFrame to ensure scroll happens AFTER layout is complete
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    };

    window.addEventListener('streamingWordAdded', handleStreamingUpdate);
    
    return () => {
      window.removeEventListener('streamingWordAdded', handleStreamingUpdate);
    };
  }, [scrollToBottom]);

  /**
   * Scroll to bottom immediately when chat opens (from button or history)
   * Uses useLayoutEffect to scroll BEFORE paint to prevent visible jump
   */
  useLayoutEffect(() => {
    if (isVisible && messages.length > 0) {
      scrollToBottomImmediate();
    }
  }, [isVisible, scrollToBottomImmediate, messages.length]);

  /**
   * Force scroll to bottom when user sends a message
   * Tracks last message to detect when user adds new message
   */
  useEffect(() => {
    if (!isVisible || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    
    // If last message is from user, they just sent it - scroll to bottom immediately
    if (lastMessage?.role === 'user') {
      // Use setTimeout to ensure DOM has updated with new message
      setTimeout(() => {
        scrollToBottomImmediate();
      }, 0);
    }
  }, [messages, isVisible, scrollToBottomImmediate]);

  /**
   * Handle copying message content to clipboard
   */
  const handleCopyMessage = useCallback(async (messageIndex, content) => {
    const success = await UtilService.copyToClipboard(content);
    if (success) {
      setCopiedMessageIndex(messageIndex);
      setTimeout(() => setCopiedMessageIndex(null), 2000);
    }
  }, []);

  /**
   * Handle rewriting/regenerating AI message
   */
  const handleRewriteMessage = useCallback(async (message) => {
    if (message?.id && message?.role === 'assistant') {
      try {
        Logger.log('ChatContainer', 'Regenerating AI message:', message.id);
        await regenerateAIMessage(message.id);
      } catch (error) {
        Logger.error('ChatContainer', 'Failed to regenerate message:', error);
      }
    }
  }, [regenerateAIMessage]);

  /**
   * Handle branch navigation
   */
  const handlePreviousBranch = useCallback((message) => {
    if (message?.id && message?.branchInfo?.canGoBack) {
      previousBranch(message.id);
    }
  }, [previousBranch]);

  const handleNextBranch = useCallback((message) => {
    if (message?.id && message?.branchInfo?.canGoForward) {
      nextBranch(message.id);
    }
  }, [nextBranch]);

  /**
   * Handle close with animation - fade out before actually closing
   */
  const handleClose = useCallback(() => {
    setIsClosing(true);
    // Wait for fade-out animation (200ms) before actually closing
    setTimeout(() => {
      closeChat();
      setIsClosing(false); // Reset for next open
    }, 200);
  }, [closeChat]);

  /**
   * Listen for close chat event (from ChatInput close button)
   */
  useEffect(() => {
    const handleCloseChatEvent = () => {
      handleClose();
    };

    window.addEventListener('closeChat', handleCloseChatEvent);
    return () => window.removeEventListener('closeChat', handleCloseChatEvent);
  }, [handleClose]);

  /**
   * Handle playing TTS for a message
   */
  const handlePlayTTS = useCallback(async (messageIndex, messageContent) => {
    // Check if TTS is enabled and configured
    let ttsConfig;
    try {
      ttsConfig = await StorageServiceProxy.configLoad('ttsConfig', DefaultTTSConfig);
      if (!ttsConfig.enabled || !TTSServiceProxy.isConfigured()) {
        Logger.warn('ChatContainer', 'TTS not enabled or configured');
        return;
      }
    } catch (error) {
      Logger.error('ChatContainer', 'Failed to load TTS config:', error);
      return;
    }

    // If this message is already playing, stop it
    if (playingMessageIndex === messageIndex) {
      TTSServiceProxy.stopPlayback();
      setPlayingMessageIndex(null);
      setLoadingMessageIndex(null);
      currentSessionRef.current = null;
      return;
    }

    // Generate unique session ID for this playback request
    const sessionId = `manual_${messageIndex}_${Date.now()}`;

    // Clear UI state
    setPlayingMessageIndex(null);
    setLoadingMessageIndex(messageIndex);

    // Resume TTS playback (clears stopped flag in both background and main world)
    TTSServiceProxy.resumePlayback();

    try {
      // Generate chunked speech for the message with session ID
      // This will automatically stop any current playback
      const audioUrls = await TTSServiceProxy.generateChunkedSpeech(
        messageContent,
        null, // No chunk callback needed here
        ttsConfig.chunkSize,
        ttsConfig.minChunkSize,
        sessionId // Pass session ID
      );

      if (audioUrls.length === 0) {
        Logger.warn('ChatContainer', 'No audio generated');
        setLoadingMessageIndex(null);
        return;
      }

      // Don't set playing state here - let the audio start callback handle it
      // This ensures UI updates when audio ACTUALLY starts playing

      // Play audio sequence
      await TTSServiceProxy.playAudioSequence(audioUrls, sessionId);

      // Clean up blob URLs after playback
      TTSServiceProxy.cleanupBlobUrls(audioUrls);
      
      // Don't manually clear state here - let audio end callback handle it
      // This ensures proper cleanup even if playback is interrupted

    } catch (error) {
      Logger.error('ChatContainer', 'TTS playback failed:', error);
      setLoadingMessageIndex(null);
      setPlayingMessageIndex(null);
      currentSessionRef.current = null;
    }
  }, [playingMessageIndex, setPlayingMessageIndex, setLoadingMessageIndex]);

  if (!isVisible) return null;

  if (modelDisabled && !buttonInitializedRef.current) return null;

  if (!modelDisabled && (containerPos.x === 0 && containerPos.y === 0)) return null;

  const ttsEnabled = ttsConfig.enabled;

  return (
    <>
      {/* Debug markers for background detection */}
      {debugMarkers.map((marker, index) => (
        <div
          key={index}
          style={{
            position: 'fixed',
            left: `${marker.x - 8}px`,
            top: `${marker.y - 8}px`,
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: marker.color,
            border: '2px solid white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            zIndex: 9999,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '8px',
            fontWeight: 'bold',
            color: 'white',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          }}
          title={`Brightness: ${marker.brightness} | Alpha: ${marker.alpha} | Element: ${marker.element}`}
        >
          {marker.brightness}
        </div>
      ))}
      
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          left: `${containerPos.x}px`,
          top: `${containerPos.y}px`,
          zIndex: 9999, // Same as canvas, but will be above due to DOM order. Below chat button (10000)
          borderColor: isDragOver 
            ? 'rgba(59, 130, 246, 0.6)' 
            : (isDraggingButton || isDraggingModel)
            ? 'rgba(255, 255, 255, 0.4)'
            : 'transparent',
          boxShadow: isDragOver
            ? '0 4px 20px rgba(59, 130, 246, 0.3)'
            : (isDraggingButton || isDraggingModel)
            ? '0 4px 20px rgba(255, 255, 255, 0.2)'
            : 'none',
        }}
        className="flex flex-col-reverse gap-3 w-[400px] h-[500px] rounded-[10px] border-2 p-[5px]"
      >
      {/* Drag overlay indicator - always rendered, visibility controlled by opacity */}
      <div 
        className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center rounded-3xl"
        style={{
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
          opacity: isDragOver ? 1 : 0,
          visibility: isDragOver ? 'visible' : 'hidden',
          transition: 'opacity 200ms ease-in-out, visibility 200ms ease-in-out'
        }}
      >
        <div 
          className={`glass-container ${isLightBackground ? 'glass-container-dark' : ''} px-6 py-4 rounded-xl border-2 border-dashed border-blue-400/50`}
          style={{
            transform: isDragOver ? 'scale(1)' : 'scale(0.95)',
            transition: 'transform 200ms ease-in-out'
          }}
        >
          <p className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg font-medium flex items-center gap-2`}>
            <Icon name="attachment" size={20} /> Drop
          </p>
        </div>
      </div>
      
      {/* Action buttons at BOTTOM - reorganized: left/center/right layout */}
      <div className="relative flex items-center justify-between gap-2 px-6 pb-1">
        {/* LEFT: Settings + History */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSettingsPanelOpen(!isSettingsPanelOpen)}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            title="Settings"
          >
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-base leading-none flex items-center justify-center`}><Icon name="settings" size={16} /></span>
          </button>
          
          <button
            onClick={() => setIsHistoryPanelOpen(!isHistoryPanelOpen)}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            title="Chat history"
          >
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg leading-none flex items-center justify-center`}>
              <Icon name="history" size={16} />
            </span>
          </button>
        </div>
        
        {/* CENTER: Stop + Add Chat + Close (grouped) */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleStopGeneration}
            disabled={!isGenerating && !isSpeaking && loadingMessageIndex === null}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center ${
              isGenerating || isSpeaking || loadingMessageIndex !== null
                ? 'glass-error' 
                : 'opacity-50 cursor-not-allowed'
            } ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            title={isGenerating ? 'Stop generation' : (isSpeaking || loadingMessageIndex !== null) ? 'Stop TTS' : 'Nothing to stop'}
          >
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg leading-none flex items-center justify-center ${
              isGenerating || isSpeaking || loadingMessageIndex !== null ? '' : 'opacity-50'
            }`}><Icon name="stop" size={16} /></span>
          </button>
          
          <button
            onClick={clearChat}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            title="Start new chat"
          >
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg leading-none flex items-center justify-center`}>
              <Icon name="add" size={18} />
            </span>
          </button>
          
          {!modelDisabled && (
            <button
              onClick={handleClose}
              className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
              title="Close chat"
            >
              <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-sm leading-none flex items-center justify-center`}><Icon name="close" size={16} /></span>
            </button>
          )}
        </div>
        
        {/* RIGHT: Temp Chat + Model Visibility Toggle */}
        <div className="flex items-center gap-2">
          {/* Model Visibility Toggle - always visible */}
          <button
            onClick={() => updateUIConfig('enableModelLoading', !uiConfig.enableModelLoading)}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            title={uiConfig.enableModelLoading ? 'Hide character' : 'Show character'}
          >
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg leading-none flex items-center justify-center`}>
              <Icon name={uiConfig.enableModelLoading ? 'eye-off' : 'eye'} size={18} />
            </span>
            </button>
          
          <button
            onClick={() => setIsTempChat(!isTempChat)}
            className={`glass-button ${isTempChat ? (isLightBackground ? 'bg-yellow-300/40 border border-yellow-400/60' : 'bg-yellow-500/40 border border-yellow-500/60') : (isLightBackground ? 'glass-button-dark' : '')} h-8 w-8 rounded-lg flex items-center justify-center ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            title={isTempChat ? 'Disable temp mode - chat will be saved' : 'Enable temp mode - chat won\'t be saved'}
          >
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg leading-none flex items-center justify-center`}>
              <Icon name={isTempChat ? 'star' : 'pin'} size={18} />
            </span>
          </button>
        </div>
      </div>

      {/* Messages container - removed mask to enable backdrop-filter blur */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 relative overflow-hidden"
      >
        {/* Top glass bar - matches message style */}
        <div 
          className={`absolute top-0 left-0 right-0 h-[10px] rounded-t-[10px] rounded-b-[1px] z-10 pointer-events-none glass-message ${isLightBackground ? 'glass-message-dark' : ''} ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
        />
        
        {/* Bottom glass bar - matches message style */}
        <div 
          className={`absolute bottom-0 left-0 right-0 h-[10px] rounded-t-[1px] rounded-b-[10px] z-10 pointer-events-none glass-message ${isLightBackground ? 'glass-message-dark' : ''} ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
        />
        
        {/* Scrollable messages */}
        <div 
          ref={scrollRef}
          className="absolute inset-0 flex flex-col gap-3 px-6 pt-[50px] pb-[50px] overflow-y-auto hover-scrollbar scroll-smooth"
        >
          {messages.length === 0 ? (
            /* Welcome message - improved design */
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <div className={`glass-container ${isLightBackground ? 'glass-container-dark' : ''} px-10 py-8 rounded-3xl max-w-md text-center ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}>
                <div className="text-6xl mb-4"><Icon name="chat" size={16} /></div>
                <h2 className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-xl font-semibold mb-2`}>
                  Start a Conversation
                </h2>
                <p className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-sm opacity-70`}>
                  Type a message below to begin chatting with your AI assistant
                </p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const isLastMessage = index === messages.length - 1;
                
                // Hide the last message while instant-fade animation is completing
                if (isWaitingForAnimation && isLastMessage) {
                  return null;
                }
                
                // Force-complete ONLY the last AI message when interrupted
                const isError = msg.content.toLowerCase().startsWith('error:');
                const isLastAIMessage = !isUser && !isError && isLastMessage;
                const shouldForceCompleteThis = shouldForceComplete && isLastAIMessage;
                
                // Find the last USER message in the entire list
                const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
                const isLastUserMessage = isUser && lastUserMessage?.id === msg.id;
                
                // Determine if this message should animate:
                // 1. ONLY the last USER message animates (never AI messages)
                // 2. Only if it hasn't been animated before (prevents re-animation on reopening)
                const shouldAnimateThis = isLastUserMessage && lastAnimatedMessageIdRef.current !== msg.id;
                
                // Mark this message as animated if it should animate
                if (shouldAnimateThis) {
                  lastAnimatedMessageIdRef.current = msg.id;
                }
                
                return (
                  <div key={msg.id}>
                    <ChatMessage
                      message={msg}
                      messageIndex={index}
                      isLightBackground={isLightBackground}
                      ttsEnabled={ttsEnabled}
                      playingMessageIndex={playingMessageIndex}
                      loadingMessageIndex={loadingMessageIndex}
                      copiedMessageIndex={copiedMessageIndex}
                      streamedMessageIdsRef={streamedMessageIdsRef}
                      completedMessageIdsRef={completedMessageIdsRef}
                      shouldForceComplete={shouldForceCompleteThis}
                      currentSessionRef={currentSessionRef}
                      smoothStreamingAnimation={uiConfig?.smoothStreamingAnimation || false}
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
                    
                    {/* Loading indicator after last user message */}
                    {isGenerating && isLastMessage && isUser && (
                      <div className="flex flex-col gap-3 animate-slide-left-up">
                        <div className="flex flex-col items-start">
                          <div className="flex items-start gap-2 max-w-[80%]">
                            <div className="flex flex-col gap-1.5">
                              <div className={`glass-message ${isLightBackground ? 'glass-message-dark' : ''} px-4 py-3 rounded-[20px] rounded-tl-md flex items-center justify-center`}>
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
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Settings Panel - renders inside ChatContainer */}
      {isSettingsPanelOpen && (
        <div className="absolute inset-0 z-10">
          <SettingsPanel 
            onClose={handleSettingsPanelClose} 
            isLightBackground={isLightBackground}
            animationClass={isSettingsPanelClosing ? 'animate-fade-out' : 'animate-slide-up-fade-in'}
          />
        </div>
      )}

      {/* Chat History Panel - renders inside ChatContainer */}
      {isHistoryPanelOpen && (
        <div className="absolute inset-0 z-10">
          <ChatHistoryPanel
            isLightBackground={isLightBackground}
            onClose={handleHistoryClose}
            onSelectChat={handleSelectChat}
            onRequestEditDialog={handleRequestEditDialog}
            onRequestDeleteDialog={handleRequestDeleteDialog}
            animationClass={isHistoryPanelClosing ? 'animate-fade-out' : 'animate-slide-up-fade-in'}
          />
        </div>
      )}

      {/* Edit Dialog - renders outside ChatHistoryPanel to avoid backdrop-filter issues */}
      {editingChatId && (
        <div className="absolute inset-0 z-20">
          <ChatEditDialog
            chatId={editingChatId}
            initialTitle={editingChatTitle}
            isLightBackground={isLightBackground}
            animationClass={isEditDialogClosing ? 'animate-fade-out' : 'animate-slide-up-fade-in'}
            onSave={handleEditDialogSave}
            onCancel={handleEditDialogCancel}
          />
        </div>
      )}

      {/* Delete Dialog - renders outside ChatHistoryPanel to avoid backdrop-filter issues */}
      {deletingChatId && (
        <div className="absolute inset-0 z-20">
          <ChatDeleteDialog
            chatId={deletingChatId}
            isLightBackground={isLightBackground}
            animationClass={isDeleteDialogClosing ? 'animate-fade-out' : 'animate-slide-up-fade-in'}
            onConfirm={handleDeleteDialogConfirm}
            onCancel={handleDeleteDialogCancel}
          />
        </div>
      )}
    </div>
    </>
  );
};

export default ChatContainer;
