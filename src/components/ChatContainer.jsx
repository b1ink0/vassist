import { useState, useEffect, useRef, useCallback } from 'react';
import { TTSServiceProxy, StorageServiceProxy } from '../services/proxies';
import { DefaultTTSConfig } from '../config/aiConfig';
import BackgroundDetector from '../utils/BackgroundDetector';
import AudioPlayer from './AudioPlayer';
import SettingsPanel from './SettingsPanel';
import ChatHistoryPanel from './ChatHistoryPanel';

const ChatContainer = ({ 
  positionManagerRef, 
  messages = [], // Array of { role: 'user' | 'assistant', content: string }
  isVisible = false,
  isGenerating = false, // Whether AI is currently generating a response
  isSpeaking = false, // Whether TTS is currently playing
  modelDisabled = false
}) => {
  const [containerPos, setContainerPos] = useState({ x: 0, y: 0 });
  const scrollRef = useRef(null);
  const [playingMessageIndex, setPlayingMessageIndex] = useState(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(null);
  const [isDragging, setIsDragging] = useState(false); // Track if button is being dragged
  const currentSessionRef = useRef(null); // Track current TTS session
  const [isLightBackground, setIsLightBackground] = useState(false); // Track background brightness
  const [ttsConfig, setTtsConfig] = useState(DefaultTTSConfig); // TTS configuration
  const containerRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [debugMarkers, setDebugMarkers] = useState([]); // Debug markers for sample points
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false); // Settings panel visibility
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false); // Chat history panel visibility
  const [isTempChat, setIsTempChat] = useState(false); // Temporary chat mode

  // Memoized callbacks for ChatHistoryPanel to prevent unnecessary re-renders
  const handleHistoryClose = useCallback(() => {
    setIsHistoryPanelOpen(false);
  }, []);

  const handleSelectChat = useCallback((chat) => {
    // Dispatch event to load selected chat
    window.dispatchEvent(new CustomEvent('loadChatFromHistory', {
      detail: { chatData: chat }
    }));
    setIsHistoryPanelOpen(false);
  }, []);

  /**
   * Load TTS configuration from storage
   */
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
  }, [messages]);

  /**
   * Smooth scroll to bottom with proper offset for fade area
   */
  const scrollToBottom = () => {
    if (scrollRef.current) {
      const scrollHeight = scrollRef.current.scrollHeight;
      const height = scrollRef.current.clientHeight;
      const maxScrollTop = scrollHeight - height;
      
      // Smooth scroll animation
      scrollRef.current.scrollTo({
        top: maxScrollTop,
        behavior: 'smooth'
      });
    }
  };

  /**
   * Update container position based on model position or chat button position
   */
  useEffect(() => {
    const updatePosition = async (event) => {
      // If model is disabled, position relative to chat button
      if (modelDisabled) {
        let buttonPos;
        
        // If event has detail (real-time drag update), use it
        if (event?.detail) {
          buttonPos = event.detail;
        } else {
          // Otherwise, get saved position from storage
          try {
            buttonPos = await StorageServiceProxy.configLoad('chatButtonPosition', { x: window.innerWidth - 68, y: window.innerHeight - 68 });
          } catch (error) {
            console.error('[ChatContainer] Failed to load button position:', error);
            buttonPos = { x: window.innerWidth - 68, y: window.innerHeight - 68 };
          }
        }
        
        const containerWidth = 400;
        const containerHeight = 500;
        const offsetY = 15; // Space between container and button
        const buttonSize = 48;
        const chatInputHeight = 110; // Actual height of ChatInput bar at bottom
        
        // Position container ABOVE the button (centered horizontally with button)
        const containerX = Math.max(10, Math.min(buttonPos.x - (containerWidth - buttonSize) / 2, window.innerWidth - containerWidth - 10));
        
        // Start position above button, but shift up by input bar height by default
        let containerY = buttonPos.y - containerHeight - offsetY - chatInputHeight;
        
        // Make sure it doesn't go off-screen at the top
        containerY = Math.max(10, containerY);
        
        // Make sure it doesn't overlap the input bar at bottom
        const maxY = window.innerHeight - containerHeight - chatInputHeight - offsetY;
        containerY = Math.min(containerY, maxY);
        
        setContainerPos({ x: containerX, y: containerY });
        console.log('[ChatContainer] Updated position based on button:', { buttonPos, containerPos: { x: containerX, y: containerY } });
        return;
      }

      // Model is enabled - position relative to model
      let modelPos;
      
      // If event has detail (from modelPositionChange event), use it
      if (event?.detail) {
        modelPos = event.detail;
      } else if (positionManagerRef?.current) {
        // Otherwise, get from position manager
        try {
          modelPos = positionManagerRef.current.getPositionPixels();
        } catch (error) {
          console.error('[ChatContainer] Failed to get model position:', error);
          return;
        }
      } else {
        return;
      }
        
      const containerWidth = 400;
      const containerHeight = 500;
      const offsetX = 15;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // Calculate potential positions
      const rightX = modelPos.x + modelPos.width + offsetX;
      const leftX = modelPos.x - containerWidth - offsetX;
      
      // Check if right position would go off-screen
      const wouldOverflowRight = rightX + containerWidth > windowWidth - 10;
      
      // Check if left position would go off-screen
      const wouldOverflowLeft = leftX < 10;
      
      // Check if model would overlap container on right side
      const modelRightEdge = modelPos.x + modelPos.width;
      const wouldOverlapRight = modelRightEdge > rightX; // Model extends into where container would be
      
      // Decide which side to prefer
      // Priority:
      // 1. Avoid going off-screen (critical)
      // 2. Avoid overlap with model (important)
      // 3. Prefer right side (default)
      let shouldBeOnLeft = false;
      
      if (wouldOverflowRight) {
        // Right side would go off-screen, must use left
        shouldBeOnLeft = true;
      } else if (wouldOverlapRight && !wouldOverflowLeft) {
        // Right side would overlap AND left side is available
        shouldBeOnLeft = true;
      } else if (modelPos.x > windowWidth * 0.7) {
        // Model is far right, use left side
        shouldBeOnLeft = true;
      }
      
      // Calculate final position
      let containerX = shouldBeOnLeft ? leftX : rightX;
      
      // Ensure container stays within horizontal bounds (CRITICAL - never go off-screen)
      containerX = Math.max(10, Math.min(containerX, windowWidth - containerWidth - 10));
      
      // Align with model top, but ensure it stays within vertical bounds
      let containerY = modelPos.y;
      containerY = Math.max(10, Math.min(containerY, windowHeight - containerHeight - 10));
      
      setContainerPos({ x: containerX, y: containerY });
    };

    if (isVisible) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      
      // Listen to different events based on model state
      if (modelDisabled) {
        // In chat-only mode, listen for button position changes
        window.addEventListener('chatButtonMoved', updatePosition);
      } else {
        // In model mode, listen for model position changes
        window.addEventListener('modelPositionChange', updatePosition);
      }

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('modelPositionChange', updatePosition);
        window.removeEventListener('chatButtonMoved', updatePosition);
      };
    }
  }, [positionManagerRef, isVisible, modelDisabled]);

  /**
   * Listen for drag events to show border
   */
  useEffect(() => {
    if (!modelDisabled) return;

    const handleDragStart = () => setIsDragging(true);
    const handleDragEnd = () => setIsDragging(false);

    window.addEventListener('chatButtonDragStart', handleDragStart);
    window.addEventListener('chatButtonDragEnd', handleDragEnd);

    return () => {
      window.removeEventListener('chatButtonDragStart', handleDragStart);
      window.removeEventListener('chatButtonDragEnd', handleDragEnd);
    };
  }, [modelDisabled]);

  /**
   * Auto-scroll to bottom when messages change
   */
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
          zIndex: 998,
          width: '400px',
          height: '500px',
        }}
        className={`flex flex-col-reverse gap-3 ${isDragging ? 'border-2 border-white/40 rounded-3xl' : ''}`}
      >
      {/* Action buttons at BOTTOM - closer to container */}
      <div className="relative flex items-center justify-end gap-2 px-6 pb-1">
        {/* Stop, Clear, and Close buttons - only shown when there are messages */}
        {messages.length > 0 && (
          <>
            <button
              onClick={() => {
                const event = new CustomEvent('stopGeneration');
                window.dispatchEvent(event);
              }}
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
              onClick={() => {
                const event = new CustomEvent('clearChat');
                window.dispatchEvent(event);
              }}
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
                onClick={() => {
                  const event = new CustomEvent('closeChat');
                  window.dispatchEvent(event);
                }}
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
              {/* Buttons when no messages: History, Temp, and Settings */}
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
              </div>
            </div>
          ) : (
            messages.slice().reverse().map((msg, index) => {
              const isUser = msg.role === 'user';
              const isError = msg.content.toLowerCase().startsWith('error:');
              const messageIndex = messages.length - 1 - index;
              const isPlaying = playingMessageIndex === messageIndex;
              const isLoading = loadingMessageIndex === messageIndex;
              
              // Use ttsConfig from state
              const ttsEnabled = ttsConfig.enabled;
              
              // Check if message has audio attachments
              const hasAudio = isUser && msg.audios && msg.audios.length > 0;
              
              return (
                <div
                  key={messageIndex}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-start gap-2 ${hasAudio ? 'w-[80%]' : 'max-w-[80%]'}`}>
                    {/* Speaker icon for assistant messages (only show if TTS is enabled) */}
                    {!isUser && !isError && ttsEnabled && (
                      <button
                        onClick={() => handlePlayTTS(messageIndex, msg.content)}
                        className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} mt-2 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0`}
                        title={isPlaying ? 'Stop audio' : 'Play audio'}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-xs animate-spin`}>⏳</span>
                        ) : isPlaying ? (
                          <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-xs`}>⏸</span>
                        ) : (
                          <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-xs`}>🔊</span>
                        )}
                      </button>
                    )}
                    
                    {/* Message bubble */}
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
                      {/* Image attachments (for user messages) */}
                      {isUser && msg.images && msg.images.length > 0 && (
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
                      
                      {/* Audio attachments (for user messages) */}
                      {isUser && msg.audios && msg.audios.length > 0 && (
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
                      
                      <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
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
