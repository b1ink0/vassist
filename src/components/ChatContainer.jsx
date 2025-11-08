/**
 * @fileoverview Main chat container component managing chat UI, messages, and positioning.
 * Handles chat display, TTS playback, drag-drop, background detection, and history management.
 */

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
import Logger from '../services/LoggerService';

/**
 * Chat container component.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {boolean} [props.modelDisabled=false] - Whether 3D model is disabled (chat-only mode)
 * @param {Function} props.onDragDrop - Callback to handle dropped content
 * @returns {JSX.Element} Chat container component
 */
const ChatContainer = ({ 
  modelDisabled = false,
  onDragDrop
}) => {
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

  const { updateUIConfig } = useConfig();

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
  const chatInputRef = useRef(null);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState(null);
  const previousMessageCountRef = useRef(0);
  const previousIsGeneratingRef = useRef(false);
  const [shouldForceComplete, setShouldForceComplete] = useState(false);
  const [isWaitingForAnimation, setIsWaitingForAnimation] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSettingsPanelClosing, setIsSettingsPanelClosing] = useState(false);
  const [isHistoryPanelClosing, setIsHistoryPanelClosing] = useState(false);
  
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingChatTitle, setEditingChatTitle] = useState('');
  const [deletingChatId, setDeletingChatId] = useState(null);
  const [isEditDialogClosing, setIsEditDialogClosing] = useState(false);
  const [isDeleteDialogClosing, setIsDeleteDialogClosing] = useState(false);
  
  const streamedMessageIdsRef = useRef(new Set());
  
  const completedMessageIdsRef = useRef(new Set());
  
  const lastAnimatedMessageIdRef = useRef(null);

  useEffect(() => {
    buttonPosRef.current = buttonPosition;
  }, [buttonPosition]);

  /**
   * Detects when to force-complete streaming animation.
   * Triggers when AI generation stops.
   */
  useEffect(() => {
    if (isGenerating && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && !lastMessage.isUser && !streamedMessageIdsRef.current.has(lastMessage.id)) {
        streamedMessageIdsRef.current.add(lastMessage.id);
        Logger.log('ChatContainer', 'Tracking streamed message:', lastMessage.id);
      }
    }
    
    const wasGenerating = previousIsGeneratingRef.current;
    const stoppedGenerating = wasGenerating && !isGenerating;
    
    const messageCountIncreased = messages.length > previousMessageCountRef.current;
    
    if (stoppedGenerating && messageCountIncreased) {
      Logger.log('ChatContainer', 'AI interrupted by user, forcing completion');
      setShouldForceComplete(true);
      setIsWaitingForAnimation(true);
      
      const animationTimer = setTimeout(() => {
        setIsWaitingForAnimation(false);
      }, 200);
      
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
   * Auto-focuses input when chat is cleared (new chat created).
   */
  useEffect(() => {
    if (messages.length === 0 && isVisible) {
      streamedMessageIdsRef.current.clear();
      Logger.log('ChatContainer', 'Cleared streamed message tracking for new chat');
      
      const event = new CustomEvent('focusChatInput');
      window.dispatchEvent(event);
    }
  }, [messages.length, isVisible]);

  /**
   * Listens for voice interrupt events to trigger force-complete.
   */
  useEffect(() => {
    const handleVoiceInterrupt = () => {
      if (isGenerating) {
        Logger.log('ChatContainer', 'Voice interrupt detected, forcing instant completion');
        
        setShouldForceComplete(true);
        
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

  /**
   * Calculates container position based on button or model position.
   */
  const calculateContainerPosition = useCallback(() => {
    const chatInputHeight = chatInputRef?.current?.getBoundingClientRect().height || 140;
    
    if (modelDisabled) {
      const buttonPos = buttonPosRef.current;
      const containerWidth = 400;
      const containerHeight = 400;
      const offsetY = 5;
      const buttonSize = 48;
      
      const containerX = Math.max(10, Math.min(buttonPos.x - (containerWidth - buttonSize) / 2, window.innerWidth - containerWidth - 10));
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
  }, [modelDisabled]);

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

  useEffect(() => {
    if (!isVisible || modelDisabled) return;
    
    const newPos = calculateContainerPosition();
    setContainerPos(newPos);
  }, [isVisible, modelDisabled, calculateContainerPosition]);

  useEffect(() => {
    if (!isVisible) return;
    
    const handleModelPosition = () => {
      // Events are already RAF-throttled by PositionManager, just update directly
      // Use .current to access latest refs without recreating handler
      const chatInputHeight = chatInputRef?.current?.getBoundingClientRect().height || 140;
      
      if (modelDisabled) {
        const buttonPos = buttonPosRef.current;
        const containerWidth = 400;
        const containerHeight = 400;
        const offsetY = 5;
        const buttonSize = 48;
        
        const containerX = Math.max(10, Math.min(buttonPos.x - (containerWidth - buttonSize) / 2, window.innerWidth - containerWidth - 10));
        let containerY = buttonPos.y - containerHeight - chatInputHeight - offsetY;
        containerY = Math.max(10, containerY);
        const maxY = window.innerHeight - containerHeight - chatInputHeight - offsetY;
        containerY = Math.min(containerY, maxY);
        
        setContainerPos({ x: containerX, y: containerY });
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
          
          setContainerPos({ x: containerX, y: containerY });
        } catch (error) {
          Logger.error('ChatContainer', 'Failed to calculate model position:', error);
        }
      }
    };

    if (!modelDisabled) {
      handleModelPosition();
      window.addEventListener('modelPositionChange', handleModelPosition);
      return () => window.removeEventListener('modelPositionChange', handleModelPosition);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, modelDisabled]);

  useEffect(() => {
    if (!isVisible) return;

    const handleResize = () => {
      const newPos = calculateContainerPosition();
      setContainerPos(newPos);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isVisible, calculateContainerPosition]);

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

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const timeoutId = setTimeout(() => {
      if (!messagesContainerRef.current) {
        return;
      }

      dragDropServiceRef.current = new DragDropService({
        maxImages: 3,
        maxAudios: 1
      });

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

    return () => {
      clearTimeout(timeoutId);
      if (dragDropServiceRef.current) {
        dragDropServiceRef.current.detach();
      }
    };
  }, [isVisible, onDragDrop, setIsDragOver]);

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
    streamedMessageIdsRef.current.clear();
    Logger.log('ChatContainer', 'Cleared streamed message tracking for history load');
    
    loadChatFromHistory(chat);
    setIsHistoryPanelClosing(true);
    setTimeout(() => {
      setIsHistoryPanelOpen(false);
      setIsHistoryPanelClosing(false);
    }, 200);
  }, [loadChatFromHistory, setIsHistoryPanelOpen]);

  const handleRequestEditDialog = useCallback((chatId, title) => {
    setEditingChatId(chatId);
    setEditingChatTitle(title);
  }, []);

  const handleEditDialogSave = useCallback(async (chatId, newTitle) => {
    try {
      await chatHistoryService.updateChatTitle(chatId, newTitle);
      Logger.log('ChatContainer', 'Updated chat title:', chatId, newTitle);
      
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

  const handleRequestDeleteDialog = useCallback((chatId) => {
    setDeletingChatId(chatId);
  }, []);

  const handleDeleteDialogConfirm = useCallback(async (chatId) => {
    try {
      await chatHistoryService.deleteChat(chatId);
      Logger.log('ChatContainer', 'Deleted chat:', chatId);
      
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
   * Handles settings panel close with animation.
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
      
      setShouldForceComplete(true);
      
      stopGeneration();
      
      setTimeout(() => {
        setShouldForceComplete(false);
      }, 250);
    } else {
      stopGeneration();
    }
  }, [isGenerating, stopGeneration]);

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
   * Detects background color brightness behind the container.
   * Samples a configurable grid for accurate detection.
   */
  useEffect(() => {
    if (!isVisible) return;

    const isAdaptiveMode = uiConfig?.backgroundDetection?.mode === 'adaptive';
    if (!isAdaptiveMode) {
      const forcedMode = uiConfig?.backgroundDetection?.mode;
      if (forcedMode === 'light') {
        setIsLightBackground(true);
        if (messagesContainerRef.current) {
          messagesContainerRef.current.classList.add('light-bg');
        }
      } else if (forcedMode === 'dark') {
        setIsLightBackground(false);
        if (messagesContainerRef.current) {
          messagesContainerRef.current.classList.remove('light-bg');
        }
      }
      return;
    }
    
    let detectionTimeout = null;
    let scrollTimeout = null;
    let intervalId = null;
    
    const detectBackgroundBrightness = () => {
      if (isDraggingButton || isDraggingModel) return;
      
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
        });
      });
      
      setDebugMarkers(result.debugMarkers || []);
      
      setIsLightBackground(prevState => {
        if (prevState !== result.isLight) {
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
    
    // Initial detection with delay
    detectionTimeout = setTimeout(detectBackgroundBrightness, 400);
    
    // Debounced scroll handler
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(detectBackgroundBrightness, 500);
    };
    
    window.addEventListener('scroll', handleScroll, true);
    
    // Periodic detection (less frequent)
    intervalId = setInterval(detectBackgroundBrightness, 4000);

    return () => {
      clearTimeout(detectionTimeout);
      clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', handleScroll, true);
      clearInterval(intervalId);
    };
  }, [isVisible, containerPos, isDraggingButton, isDraggingModel, uiConfig?.backgroundDetection?.mode]);

  /**
   * Sets up audio start callback for updating UI when audio starts playing.
   */
  useEffect(() => {
    let voiceMonitoringStarted = false;
    
    TTSServiceProxy.setAudioStartCallback((sessionId) => {
      Logger.log('ChatContainer', 'Audio started playing for session:', sessionId);
      
      if (sessionId?.startsWith('manual_')) {
        const parts = sessionId.split('_');
        const messageIndex = parseInt(parts[1]);
        if (!isNaN(messageIndex)) {
          setLoadingMessageIndex(null);
          setPlayingMessageIndex(messageIndex);
          currentSessionRef.current = sessionId;
        }
      }
      else if (sessionId?.startsWith('auto_')) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            setLoadingMessageIndex(null);
            setPlayingMessageIndex(i);
            currentSessionRef.current = sessionId;
            break;
          }
        }
      }
      else if (sessionId?.startsWith('voice_')) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            setLoadingMessageIndex(null);
            setPlayingMessageIndex(i);
            currentSessionRef.current = sessionId;
            break;
          }
        }
        
        if (!voiceMonitoringStarted) {
          voiceMonitoringStarted = true;
          Logger.log('ChatContainer', 'Starting TTS playback monitoring for voice mode');
          import('../services/VoiceConversationService').then(({ default: VoiceConversationService }) => {
            VoiceConversationService.monitorTTSPlayback();
          });
        }
      }
    });

    TTSServiceProxy.setAudioEndCallback((sessionId) => {
      Logger.log('ChatContainer', 'Audio finished playing for session:', sessionId);
      
      if (currentSessionRef.current === sessionId) {
        setPlayingMessageIndex(null);
        currentSessionRef.current = null;
      }
    });

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
   * Scrolls to bottom without checking if user is near bottom.
   * Used for: chat open, user sends message.
   */
  const scrollToBottomImmediate = useCallback(() => {
    if (!scrollRef.current) return;
    
    const container = scrollRef.current;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'instant'
    });
  }, []);

  /**
   * Scrolls to bottom only if user is already near the bottom.
   * Prevents scroll interruption if user scrolled up to read.
   */
  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    
    const container = scrollRef.current;
    const scrollHeight = container.scrollHeight;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const shouldScroll = distanceFromBottom < clientHeight * 3;
    
    if (shouldScroll) {
      container.scrollTo({
        top: scrollHeight,
        behavior: 'smooth'
      });
    }
  }, []);

  useEffect(() => {
    if (!isVisible || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    
    // Auto-scroll when assistant message is being updated (streaming)
    if (lastMessage?.role === 'assistant') {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [messages, isVisible, scrollToBottom]);

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
    
    if (lastMessage?.role === 'user') {
      setTimeout(() => {
        scrollToBottomImmediate();
      }, 0);
    }
  }, [messages, isVisible, scrollToBottomImmediate]);

  /**
   * Handles copying message content to clipboard.
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
    setTimeout(() => {
      closeChat();
      setIsClosing(false);
    }, 200);
  }, [closeChat]);

  useEffect(() => {
    const handleCloseChatEvent = () => {
      handleClose();
    };

    window.addEventListener('closeChat', handleCloseChatEvent);
    return () => window.removeEventListener('closeChat', handleCloseChatEvent);
  }, [handleClose]);

  /**
   * Handles playing TTS for a message.
   */
  const handlePlayTTS = useCallback(async (messageIndex, messageContent) => {
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

    if (playingMessageIndex === messageIndex) {
      TTSServiceProxy.stopPlayback();
      setPlayingMessageIndex(null);
      setLoadingMessageIndex(null);
      currentSessionRef.current = null;
      return;
    }

    const sessionId = `manual_${messageIndex}_${Date.now()}`;

    setPlayingMessageIndex(null);
    setLoadingMessageIndex(messageIndex);

    TTSServiceProxy.resumePlayback();

    try {
      const audioUrls = await TTSServiceProxy.generateChunkedSpeech(
        messageContent,
        null,
        ttsConfig.chunkSize,
        ttsConfig.minChunkSize,
        sessionId
      );

      if (audioUrls.length === 0) {
        Logger.warn('ChatContainer', 'No audio generated');
        setLoadingMessageIndex(null);
        return;
      }

      await TTSServiceProxy.playAudioSequence(audioUrls, sessionId);

      TTSServiceProxy.cleanupBlobUrls(audioUrls);

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
          zIndex: 9999,
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
                <div className="w-full flex justify-center items-center text-6xl mb-4"><Icon name="chat" size={16} /></div>
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
                
                if (isWaitingForAnimation && isLastMessage) {
                  return null;
                }
                
                const isError = msg.content.toLowerCase().startsWith('error:');
                const isLastAIMessage = !isUser && !isError && isLastMessage;
                const shouldForceCompleteThis = shouldForceComplete && isLastAIMessage;
                
                const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
                const isLastUserMessage = isUser && lastUserMessage?.id === msg.id;
                
                const shouldAnimateThis = isLastUserMessage && lastAnimatedMessageIdRef.current !== msg.id;
                
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
