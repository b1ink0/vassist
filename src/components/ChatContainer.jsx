import { useState, useEffect, useRef, useCallback } from 'react';
import { TTSServiceProxy, StorageServiceProxy } from '../services/proxies';
import { DefaultTTSConfig } from '../config/aiConfig';
import BackgroundDetector from '../utils/BackgroundDetector';
import DragDropService from '../services/DragDropService';
import UtilService from '../services/UtilService';
import AudioPlayer from './AudioPlayer';
import SettingsPanel from './SettingsPanel';
import ChatHistoryPanel from './ChatHistoryPanel';
import { useApp } from '../contexts/AppContext';

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
  } = useApp();

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
  const [isContainerHovered, setIsContainerHovered] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingImages, setEditingImages] = useState([]);
  const [editingAudios, setEditingAudios] = useState([]);
  const editTextareaRef = useRef(null);

  // Keep button position ref in sync with context
  useEffect(() => {
    buttonPosRef.current = buttonPosition;
  }, [buttonPosition]);

  const calculateContainerPosition = useCallback(() => {
    const chatInputHeight = chatInputRef?.current?.getBoundingClientRect().height || 140;
    
    if (modelDisabled) {
      const buttonPos = buttonPosRef.current;
      const containerWidth = 400;
      const containerHeight = 500;
      const offsetY = 15;
      const buttonSize = 48;
      
      const containerX = Math.max(10, Math.min(buttonPos.x - (containerWidth - buttonSize) / 2, window.innerWidth - containerWidth - 10));
      let containerY = buttonPos.y - containerHeight - offsetY - chatInputHeight;
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
        console.error('[ChatContainer] Failed to calculate model position:', error);
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
        console.error('[ChatContainer] Failed to load button position:', error);
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
        onShowError: (error) => console.error('[ChatContainer] Drag-drop error:', error),
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
    setIsHistoryPanelOpen(false);
  }, [setIsHistoryPanelOpen]);

  const handleSelectChat = useCallback((chat) => {
    loadChatFromHistory(chat);
    setIsHistoryPanelOpen(false);
  }, [loadChatFromHistory, setIsHistoryPanelOpen]);

  // Load TTS configuration from storage on mount
  useEffect(() => {
    const loadTtsConfig = async () => {
      try {
        const config = await StorageServiceProxy.configLoad('ttsConfig', DefaultTTSConfig);
        setTtsConfig(config);
      } catch (error) {
        console.error('[ChatContainer] Failed to load TTS config:', error);
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
      console.log('[ChatContainer] Audio started playing for session:', sessionId);
      
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
          console.log('[ChatContainer] Starting TTS playback monitoring for voice mode');
          // Import VoiceConversationService dynamically to avoid circular deps
          import('../services/VoiceConversationService').then(({ default: VoiceConversationService }) => {
            VoiceConversationService.monitorTTSPlayback();
          });
        }
      }
    });

    // Set up audio end callback for resetting UI when audio finishes
    TTSServiceProxy.setAudioEndCallback((sessionId) => {
      console.log('[ChatContainer] Audio finished playing for session:', sessionId);
      
      // Only clear if this is still the current session
      if (currentSessionRef.current === sessionId) {
        setPlayingMessageIndex(null);
        currentSessionRef.current = null;
      }
    });

    // Listen for custom events from ChatController (voice mode)
    const handleTTSAudioStart = (event) => {
      const { messageIndex, sessionId } = event.detail
      console.log('[ChatContainer] Custom TTS audio start event:', messageIndex, sessionId)
      setLoadingMessageIndex(null)
      setPlayingMessageIndex(messageIndex)
      currentSessionRef.current = sessionId
    }

    const handleTTSAudioEnd = (event) => {
      const { sessionId } = event.detail
      console.log('[ChatContainer] Custom TTS audio end event:', sessionId)
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
   * Smooth scroll to bottom with proper offset for fade area
   */
  const scrollToBottom = () => {
    if (scrollRef.current) {
      const scrollHeight = scrollRef.current.scrollHeight;
      const height = scrollRef.current.clientHeight;
      const maxScrollTop = scrollHeight - height;
      
      scrollRef.current.scrollTo({
        top: maxScrollTop,
        behavior: 'smooth'
      });
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * Handle copying message content to clipboard
   */
  const handleCopyMessage = async (messageIndex, content) => {
    const success = await UtilService.copyToClipboard(content);
    if (success) {
      setCopiedMessageIndex(messageIndex);
      setTimeout(() => setCopiedMessageIndex(null), 2000);
    }
  };

  /**
   * Handle rewriting/regenerating AI message
   */
  const handleRewriteMessage = async (message) => {
    if (message?.id && message?.role === 'assistant') {
      try {
        console.log('[ChatContainer] Regenerating AI message:', message.id);
        await regenerateAIMessage(message.id);
      } catch (error) {
        console.error('[ChatContainer] Failed to regenerate message:', error);
      }
    }
  };

  /**
   * Handle editing user message
   */
  const handleEditMessage = (message) => {
    if (message?.id && message?.role === 'user') {
      console.log('[ChatContainer] Starting edit for message:', message.id);
      setEditingMessageId(message.id);
      setEditingContent(message.content);
      setEditingImages(message.images || []);
      setEditingAudios(message.audios || []);
    }
  };

  /**
   * Save edited message
   */
  const handleSaveEdit = async (messageId) => {
    if (!editingContent.trim() && editingImages.length === 0 && editingAudios.length === 0) {
      setEditingMessageId(null);
      setEditingContent('');
      setEditingImages([]);
      setEditingAudios([]);
      return;
    }

    try {
      console.log('[ChatContainer] Saving edited message:', messageId);
      // TODO: Need to update editUserMessage in AppContext to accept images/audios
      await editUserMessage(messageId, editingContent.trim(), editingImages, editingAudios);
      setEditingMessageId(null);
      setEditingContent('');
      setEditingImages([]);
      setEditingAudios([]);
    } catch (error) {
      console.error('[ChatContainer] Failed to save edit:', error);
    }
  };

  /**
   * Cancel editing
   */
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent('');
    setEditingImages([]);
    setEditingAudios([]);
  };

  /**
   * Remove image from editing
   */
  const handleRemoveEditingImage = (index) => {
    setEditingImages(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Remove audio from editing
   */
  const handleRemoveEditingAudio = (index) => {
    setEditingAudios(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Handle branch navigation
   */
  const handlePreviousBranch = (message) => {
    if (message?.id && message?.branchInfo?.canGoBack) {
      previousBranch(message.id);
    }
  };

  const handleNextBranch = (message) => {
    if (message?.id && message?.branchInfo?.canGoForward) {
      nextBranch(message.id);
    }
  };

  // Auto-focus edit textarea when editing starts
  useEffect(() => {
    if (editingMessageId && editTextareaRef.current) {
      editTextareaRef.current.focus();
      editTextareaRef.current.selectionStart = editTextareaRef.current.value.length;
    }
  }, [editingMessageId]);

  /**
   * Handle playing TTS for a message
   */
  const handlePlayTTS = async (messageIndex, messageContent) => {
    // Check if TTS is enabled and configured
    let ttsConfig;
    try {
      ttsConfig = await StorageServiceProxy.configLoad('ttsConfig', DefaultTTSConfig);
      if (!ttsConfig.enabled || !TTSServiceProxy.isConfigured()) {
        console.warn('[ChatContainer] TTS not enabled or configured');
        return;
      }
    } catch (error) {
      console.error('[ChatContainer] Failed to load TTS config:', error);
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
        console.warn('[ChatContainer] No audio generated');
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
      console.error('[ChatController] TTS playback failed:', error);
      setLoadingMessageIndex(null);
      setPlayingMessageIndex(null);
      currentSessionRef.current = null;
    }
  };

  if (!isVisible) return null;

  if (modelDisabled && !buttonInitializedRef.current) return null;

  if (!modelDisabled && (containerPos.x === 0 && containerPos.y === 0)) return null;

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
        onMouseEnter={() => setIsContainerHovered(true)}
        onMouseLeave={() => setIsContainerHovered(false)}
        style={{
          position: 'fixed',
          left: `${containerPos.x}px`,
          top: `${containerPos.y}px`,
          zIndex: 998,
          width: '400px',
          height: '500px',
          borderRadius: '24px',
          border: '2px solid',
          borderColor: isDragOver 
            ? 'rgba(59, 130, 246, 0.6)' 
            : (isDraggingButton || isDraggingModel)
            ? 'rgba(255, 255, 255, 0.4)'
            : isContainerHovered
            ? 'rgba(255, 255, 255, 0.2)'
            : 'transparent',
          boxShadow: isDragOver
            ? '0 4px 20px rgba(59, 130, 246, 0.3)'
            : (isDraggingButton || isDraggingModel)
            ? '0 4px 20px rgba(255, 255, 255, 0.2)'
            : isContainerHovered
            ? '0 2px 10px rgba(255, 255, 255, 0.1)'
            : 'none',
        }}
        className="flex flex-col-reverse gap-3"
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
          <p className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg font-medium`}>
            📎 Drop
          </p>
        </div>
      </div>
      
      {/* Action buttons at BOTTOM - closer to container */}
      <div className="relative flex items-center justify-end gap-2 px-6 pb-1">
        {/* Stop, Clear, and Settings buttons - only shown when there are messages */}
        {messages.length > 0 && (
          <>
            <button
              onClick={stopGeneration}
              disabled={!isGenerating && !isSpeaking}
              className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center ${
                isGenerating || isSpeaking
                  ? 'glass-error' 
                  : 'opacity-50 cursor-not-allowed'
              }`}
              title={isGenerating ? 'Stop generation' : isSpeaking ? 'Stop speaking' : 'Nothing to stop'}
            >
              <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg leading-none flex items-center justify-center ${
                isGenerating || isSpeaking ? '' : 'opacity-50'
              }`}>⏹</span>
            </button>
            
            <button
              onClick={() => setIsHistoryPanelOpen(!isHistoryPanelOpen)}
              className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center`}
              title="Chat history"
            >
              <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg leading-none flex items-center justify-center`}>📋</span>
            </button>
            
            <button
              onClick={() => setIsTempChat(!isTempChat)}
              className={`glass-button ${isTempChat ? (isLightBackground ? 'bg-yellow-300/40 border border-yellow-400/60' : 'bg-yellow-500/40 border border-yellow-500/60') : (isLightBackground ? 'glass-button-dark' : '')} h-8 w-8 rounded-lg flex items-center justify-center`}
              title={isTempChat ? 'Disable temp mode - chat will be saved' : 'Enable temp mode - chat won\'t be saved'}
            >
              <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg leading-none flex items-center justify-center`}>{isTempChat ? '💫' : '📌'}</span>
            </button>
            
            <button
              onClick={clearChat}
              className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center`}
              title="Start new chat"
            >
              <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg leading-none flex items-center justify-center`}>+</span>
            </button>
            
            {/* Settings button - only shown when there are messages */}
            <button
              onClick={() => setIsSettingsPanelOpen(!isSettingsPanelOpen)}
              className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center`}
              title="Settings"
            >
              <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-base leading-none flex items-center justify-center`}>⚙</span>
            </button>
            
            {/* Close button only shown when model is loaded (no chat button available) */}
            {!modelDisabled && (
              <button
                onClick={closeChat}
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center`}
                title="Close chat"
              >
                <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-sm leading-none flex items-center justify-center`}>✕</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Messages container with MASK for fade */}
      <div 
        ref={messagesContainerRef}
        className={`flex-1 relative overflow-hidden ${isLightBackground ? 'glass-messages-mask-dark' : 'glass-messages-mask'}`}
      >
        {/* Scrollable messages */}
        <div 
          ref={scrollRef}
          className="absolute inset-0 flex flex-col-reverse gap-3 px-6 overflow-y-auto"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingTop: '50px',
            paddingBottom: '50px',
          }}
        >
          {messages.length === 0 ? (
            /* Placeholder message when empty with settings and history buttons */
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className={`glass-message ${isLightBackground ? 'glass-message-dark' : ''} px-6 py-4 rounded-3xl`}>
                <div className="text-center text-sm">
                  💬 Type a message to start chatting...
                </div>
              </div>
              {/* Buttons when no messages: History, Temp, Settings, and Close */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsHistoryPanelOpen(!isHistoryPanelOpen)}
                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center`}
                  title="Chat history"
                >
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg leading-none flex items-center justify-center`}>📋</span>
                </button>
                <button
                  onClick={() => setIsTempChat(!isTempChat)}
                  className={`glass-button ${isTempChat ? (isLightBackground ? 'bg-yellow-300/40 border border-yellow-400/60' : 'bg-yellow-500/40 border border-yellow-500/60') : (isLightBackground ? 'glass-button-dark' : '')} h-8 w-8 rounded-lg flex items-center justify-center`}
                  title={isTempChat ? 'Disable temp mode - chat will be saved' : 'Enable temp mode - chat won\'t be saved'}
                >
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg leading-none flex items-center justify-center`}>{isTempChat ? '💫' : '📌'}</span>
                </button>
                <button
                  onClick={() => setIsSettingsPanelOpen(!isSettingsPanelOpen)}
                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center`}
                  title="Settings"
                >
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-base leading-none flex items-center justify-center`}>⚙</span>
                </button>
                {/* Close button - always shown when model is loaded (no chat button available) */}
                {!modelDisabled && (
                  <button
                    onClick={closeChat}
                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center`}
                    title="Close chat"
                  >
                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-sm leading-none flex items-center justify-center`}>✕</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {messages.slice().reverse().map((msg, index) => {
                const isUser = msg.role === 'user';
                const isError = msg.content.toLowerCase().startsWith('error:');
                const messageIndex = messages.length - 1 - index;
                const isPlaying = playingMessageIndex === messageIndex;
                const isLoading = loadingMessageIndex === messageIndex;
                const isLastMessage = index === 0; // Last message in reversed order = first message
                
                // Use ttsConfig from state
                const ttsEnabled = ttsConfig.enabled;
                
                // Check if message has audio attachments
                const hasAudio = isUser && msg.audios && msg.audios.length > 0;
                
                return (
                  <div key={`message-wrapper-${messageIndex}`} className="flex flex-col gap-3">
                    <div
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div className={`flex items-start gap-2 ${hasAudio ? 'w-[80%]' : 'max-w-[80%]'}`}>
                        {/* Message bubble */}
                        <div className="flex flex-col gap-1.5">
                          <div
                            className={`${
                              isError
                                ? 'glass-error'
                                : isUser
                                ? `glass-message-user ${isLightBackground ? 'glass-message-user-dark' : ''}`
                                : `glass-message ${isLightBackground ? 'glass-message-dark' : ''}`
                            } px-4 py-3 ${
                              isError
                                ? 'rounded-3xl'
                                : isUser
                                ? 'rounded-[20px] rounded-tr-md'
                                : 'rounded-[20px] rounded-tl-md'
                            } ${hasAudio ? 'w-full' : ''}`}
                          >
                            {/* Image attachments (for user messages) - only show when NOT editing */}
                            {isUser && msg.images && msg.images.length > 0 && editingMessageId !== msg.id && (
                              <div className="mb-3 flex flex-wrap gap-2">
                                {msg.images.map((imgUrl, imgIndex) => (
                                  <img 
                                    key={imgIndex}
                                    src={imgUrl}
                                    alt={`Attachment ${imgIndex + 1}`}
                                    className="max-w-[200px] max-h-[200px] object-contain rounded-lg border-2 border-white/30 cursor-pointer hover:border-blue-400/50 transition-all"
                                    onClick={() => window.open(imgUrl, '_blank')}
                                    title="Click to view full size"
                                  />
                                ))}
                              </div>
                            )}
                            
                            {/* Audio attachments (for user messages) - only show when NOT editing */}
                            {isUser && msg.audios && msg.audios.length > 0 && editingMessageId !== msg.id && (
                              <div className="mb-3 space-y-2">
                                {msg.audios.map((audioUrl, audioIndex) => (
                                  <div key={audioIndex} className="w-full">
                                    <AudioPlayer 
                                      audioUrl={audioUrl} 
                                      isLightBackground={isLightBackground}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* Message content - inline editing for user messages */}
                            {editingMessageId === msg.id ? (
                              <div className="relative space-y-2">
                                {/* Editing images */}
                                {editingImages.length > 0 && (
                                  <div className="grid grid-cols-2 gap-2">
                                    {editingImages.map((img, imgIndex) => (
                                      <div key={imgIndex} className="relative group">
                                        <img 
                                          src={img} 
                                          alt={`Edit ${imgIndex + 1}`}
                                          className="w-full rounded-lg max-h-[150px] object-cover"
                                        />
                                        <button
                                          onClick={() => handleRemoveEditingImage(imgIndex)}
                                          className="absolute top-1 right-1 glass-button w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                          title="Remove image"
                                        >
                                          <span className="text-[11px]">✗</span>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Editing audios */}
                                {editingAudios.length > 0 && (
                                  <div className="space-y-2">
                                    {editingAudios.map((audioUrl, audioIndex) => (
                                      <div key={audioIndex} className="relative group">
                                        <AudioPlayer 
                                          audioUrl={audioUrl} 
                                          isLightBackground={isLightBackground}
                                        />
                                        <button
                                          onClick={() => handleRemoveEditingAudio(audioIndex)}
                                          className="absolute top-1 right-1 glass-button w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                          title="Remove audio"
                                        >
                                          <span className="text-[11px]">✗</span>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                <textarea
                                  ref={editTextareaRef}
                                  value={editingContent}
                                  onChange={(e) => setEditingContent(e.target.value)}
                                  className={`w-full min-h-[80px] px-3 py-2.5 rounded-lg resize-none text-[15px] leading-relaxed ${
                                    isLightBackground
                                      ? 'bg-transparent text-black placeholder-black/40'
                                      : 'bg-transparent text-white placeholder-white/40'
                                  } focus:outline-none`}
                                  style={{ 
                                    background: 'transparent',
                                    border: 'none'
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.ctrlKey) {
                                      handleSaveEdit(msg.id);
                                    } else if (e.key === 'Escape') {
                                      handleCancelEdit();
                                    }
                                  }}
                                />
                                <div className="flex gap-1 justify-end mt-1">
                                  <button
                                    onClick={handleCancelEdit}
                                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100`}
                                    title="Cancel (Esc)"
                                  >
                                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[11px]`}>✗</span>
                                  </button>
                                  <button
                                    onClick={() => handleSaveEdit(msg.id)}
                                    disabled={!editingContent.trim() && editingImages.length === 0 && editingAudios.length === 0}
                                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 disabled:opacity-30`}
                                    title="Save (Ctrl+Enter)"
                                  >
                                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[11px]`}>✓</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                                {msg.content}
                              </div>
                            )}
                          </div>
                          
                          {/* Action buttons and branch navigation on same line */}
                          <div className={`flex items-center gap-1 ${isUser ? 'justify-end' : 'justify-start'} mt-1`}>
                            {/* Branch navigation for AI messages */}
                            {!isUser && msg.branchInfo && msg.branchInfo.totalBranches > 1 && editingMessageId !== msg.id && (
                              <>
                                <button
                                  onClick={() => handlePreviousBranch(msg)}
                                  disabled={!msg.branchInfo.canGoBack}
                                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20`}
                                  title="Previous variant"
                                >
                                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[9px]`}>◀</span>
                                </button>
                                <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px] opacity-70`}>
                                  {msg.branchInfo.currentIndex}/{msg.branchInfo.totalBranches}
                                </span>
                                <button
                                  onClick={() => handleNextBranch(msg)}
                                  disabled={!msg.branchInfo.canGoForward}
                                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20`}
                                  title="Next variant"
                                >
                                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[9px]`}>▶</span>
                                </button>
                              </>
                            )}
                            
                            {/* Speaker button for AI messages (only show if TTS is enabled) */}
                            {!isUser && !isError && ttsEnabled && (
                              <button
                                onClick={() => handlePlayTTS(messageIndex, msg.content)}
                                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`}
                                title={isPlaying ? 'Stop audio' : 'Play audio'}
                                disabled={isLoading}
                              >
                                {isLoading ? (
                                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px] animate-spin`}>⏳</span>
                                ) : isPlaying ? (
                                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px]`}>⏸</span>
                                ) : (
                                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px]`}>🔊</span>
                                )}
                              </button>
                            )}
                            
                            {/* Copy button for all messages */}
                            {editingMessageId !== msg.id && (
                              <button
                                onClick={() => handleCopyMessage(messageIndex, msg.content)}
                                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`}
                                title="Copy message"
                              >
                                <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px]`}>
                                  {copiedMessageIndex === messageIndex ? '✓' : '📋'}
                                </span>
                              </button>
                            )}
                            
                            {/* Edit button for user messages */}
                            {isUser && !isError && editingMessageId !== msg.id && (
                              <button
                                onClick={() => handleEditMessage(msg)}
                                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`}
                                title="Edit message"
                              >
                                <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px]`}>✏️</span>
                              </button>
                            )}
                            
                            {/* Branch navigation */}
                            {isUser && msg.branchInfo && msg.branchInfo.totalBranches > 1 && editingMessageId !== msg.id && (
                              <>
                                <button
                                  onClick={() => handlePreviousBranch(msg)}
                                  disabled={!msg.branchInfo.canGoBack}
                                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20`}
                                  title="Previous variant"
                                >
                                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[9px]`}>◀</span>
                                </button>
                                <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px] opacity-70`}>
                                  {msg.branchInfo.currentIndex}/{msg.branchInfo.totalBranches}
                                </span>
                                <button
                                  onClick={() => handleNextBranch(msg)}
                                  disabled={!msg.branchInfo.canGoForward}
                                  className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-20`}
                                  title="Next variant"
                                >
                                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[9px]`}>▶</span>
                                </button>
                              </>
                            )}
                            
                            {/* Rewrite button for AI messages */}
                            {!isUser && !isError && editingMessageId !== msg.id && (
                              <button
                                onClick={() => handleRewriteMessage(msg)}
                                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity`}
                                title="Regenerate response"
                              >
                                <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-[10px]`}>↻</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                
                {/* Loading indicator after last (first when reversed) user message */}
                {isGenerating && isLastMessage && isUser && (
                  <div className="flex justify-start mb-7">
                    <div className="flex items-start gap-2 max-w-[80%]">
                      <div className={`glass-message ${isLightBackground ? 'glass-message-dark' : ''} px-4 py-3 rounded-[20px] rounded-tl-md flex items-center justify-center`}>
                        <div className="loading-dots">
                          <span className="loading-dot"></span>
                          <span className="loading-dot"></span>
                          <span className="loading-dot"></span>
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
            onClose={() => setIsSettingsPanelOpen(false)} 
            isLightBackground={isLightBackground}
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
          />
        </div>
      )}
    </div>
    </>
  );
};

export default ChatContainer;
