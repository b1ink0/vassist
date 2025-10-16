import { useState, useEffect, useRef } from 'react';
import { TTSServiceProxy } from '../services/proxies';
import StorageManager from '../managers/StorageManager';
import { DefaultTTSConfig } from '../config/aiConfig';
import { DefaultUIConfig, BackgroundThemeModes } from '../config/uiConfig';

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
  const containerRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [debugMarkers, setDebugMarkers] = useState([]); // Debug markers for sample points

  /**
   * Detect background color brightness behind the container
   * Samples a configurable grid for accurate detection
   */
  useEffect(() => {
    if (!isVisible) return;

    const detectBackgroundBrightness = () => {
      try {
        // Get UI config
        const uiConfig = StorageManager.getConfig('uiConfig', DefaultUIConfig);
        const bgConfig = uiConfig.backgroundDetection || DefaultUIConfig.backgroundDetection;
        
        // Check if detection is disabled
        if (!bgConfig.enabled) return;
        
        // If forced mode, skip detection
        if (bgConfig.mode === BackgroundThemeModes.LIGHT) {
          setIsLightBackground(true);
          return;
        }
        if (bgConfig.mode === BackgroundThemeModes.DARK) {
          setIsLightBackground(false);
          return;
        }
        
        const showDebug = bgConfig.showDebug || false;
        const gridSize = bgConfig.sampleGridSize || 5;
        
        // Temporarily disable pointer events on canvas and container to sample page behind
        const canvas = document.getElementById('vassist-babylon-canvas');
        const container = containerRef.current;
        
        const canvasPointerEvents = canvas?.style.pointerEvents;
        const containerPointerEvents = container?.style.pointerEvents;
        
        if (canvas) canvas.style.pointerEvents = 'none';
        if (container) container.style.pointerEvents = 'none';
        
        // Sample a grid of points
        const containerWidth = 400;
        const containerHeight = 500;
        const cols = gridSize;
        const rows = gridSize;
        const padding = 60; // Sample inward from edges
        
        const samplePoints = [];
        const markers = [];
        
        // Generate grid of sample points
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const x = containerPos.x + padding + (col * (containerWidth - 2 * padding) / (cols - 1));
            const y = containerPos.y + padding + (row * (containerHeight - 2 * padding) / (rows - 1));
            samplePoints.push({ x, y });
          }
        }
        
        const allBrightness = []; // Collect all brightness values
        
        for (const point of samplePoints) {
          let elementBehind = document.elementFromPoint(point.x, point.y);
          if (!elementBehind) continue;
          
          // Traverse up DOM tree to find first element with non-transparent background
          let bgColor = '';
          let attempts = 0;
          const maxAttempts = 10; // Prevent infinite loop
          
          while (elementBehind && attempts < maxAttempts) {
            bgColor = window.getComputedStyle(elementBehind).backgroundColor;
            
            // Check if we got a valid color
            const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (rgbMatch) {
              const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
              // If we found a non-transparent color, use it
              if (a > 0) {
                break;
              }
            }
            
            // Move to parent element
            elementBehind = elementBehind.parentElement;
            attempts++;
          }
          
          const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (!rgbMatch) {
            console.log('[ChatContainer] No valid color found at point', point.x, point.y, 'after', attempts, 'attempts. Last color:', bgColor);
            continue;
          }
          
          const r = parseInt(rgbMatch[1]);
          const g = parseInt(rgbMatch[2]);
          const b = parseInt(rgbMatch[3]);
          const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
          
          // Calculate perceived brightness using luminance formula
          const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
          
          // Collect all brightness values for median calculation
          allBrightness.push(brightness);
          
          // Create debug marker if debug mode is enabled
          if (showDebug) {
            // Color based on brightness: red (dark) -> yellow (medium) -> green (light)
            const hue = (brightness / 255) * 120; // 0 (red) to 120 (green)
            const color = `hsl(${hue}, 100%, 50%)`;
            markers.push({
              x: point.x,
              y: point.y,
              color,
              brightness: Math.round(brightness),
              alpha: a.toFixed(2),
              element: elementBehind?.tagName || 'unknown',
            });
          }
        }
        
        // Update debug markers
        if (showDebug) {
          setDebugMarkers(markers);
        } else {
          setDebugMarkers([]);
        }
        
        // Restore pointer events
        if (canvas) canvas.style.pointerEvents = canvasPointerEvents || 'auto';
        if (container) container.style.pointerEvents = containerPointerEvents || 'auto';
        
        if (allBrightness.length === 0) return; // No valid samples
        
        // Calculate median brightness (more robust than average or max)
        const sortedBrightness = [...allBrightness].sort((a, b) => a - b);
        const medianIndex = Math.floor(sortedBrightness.length / 2);
        const medianBrightness = sortedBrightness.length % 2 === 0
          ? (sortedBrightness[medianIndex - 1] + sortedBrightness[medianIndex]) / 2
          : sortedBrightness[medianIndex];
        
        const minBrightness = Math.min(...allBrightness);
        const maxBrightness = Math.max(...allBrightness);
        const avgBrightness = allBrightness.reduce((sum, b) => sum + b, 0) / allBrightness.length;
        
        console.log(
          '[ChatContainer] Background detection:',
          allBrightness.length, 'samples |',
          'Median:', medianBrightness.toFixed(0),
          '| Min:', minBrightness.toFixed(0),
          '| Max:', maxBrightness.toFixed(0),
          '| Avg:', avgBrightness.toFixed(0)
        );
        
        // Use dark theme if median brightness is above threshold (light background)
        const brightnessThreshold = 127.5;
        const isLight = medianBrightness > brightnessThreshold;
        
        // Only update state if changed to avoid unnecessary re-renders
        setIsLightBackground(prevState => {
          if (prevState !== isLight) {
            // Update classes on messages container
            if (messagesContainerRef.current) {
              if (isLight) {
                messagesContainerRef.current.classList.add('light-bg');
              } else {
                messagesContainerRef.current.classList.remove('light-bg');
              }
            }
            return isLight;
          }
          return prevState;
        });
      } catch (error) {
        console.error('[ChatContainer] Background detection failed:', error);
        // Fallback: assume dark background if detection fails
        setIsLightBackground(false);
      }
    };

    console.log('[ChatContainer] Background detection effect triggered. isVisible:', isVisible, 'pos:', containerPos);
    
    // Initial detection
    detectBackgroundBrightness();
    
    // Re-check on position change (debounced)
    const timeoutId = setTimeout(detectBackgroundBrightness, 100);
    
    // Also re-check periodically in case background changes
    const intervalId = setInterval(detectBackgroundBrightness, 2000); // Every 2 seconds

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [isVisible, containerPos]);

  /**
   * Set up audio start callback for updating UI when audio starts playing
   */
  useEffect(() => {
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

    return () => {
      TTSServiceProxy.setAudioStartCallback(null);
      TTSServiceProxy.setAudioEndCallback(null);
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
    const updatePosition = (event) => {
      // If model is disabled, position relative to chat button
      if (modelDisabled) {
        let buttonPos;
        
        // If event has detail (real-time drag update), use it
        if (event?.detail) {
          buttonPos = event.detail;
        } else {
          // Otherwise, get saved position from localStorage
          buttonPos = StorageManager.getConfig('chatButtonPosition', { x: window.innerWidth - 68, y: window.innerHeight - 68 });
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
        return;
      }
      
      if (!positionManagerRef?.current) return;

      try {
        const modelPos = positionManagerRef.current.getPositionPixels();
        
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
      } catch (error) {
        console.error('[ChatContainer] Failed to update position:', error);
      }
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
    const ttsConfig = StorageManager.getConfig('ttsConfig', DefaultTTSConfig);
    if (!ttsConfig.enabled || !TTSServiceProxy.isConfigured()) {
      console.warn('[ChatContainer] TTS not enabled or configured');
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
      {messages.length > 0 && (
        <div className="relative flex items-center justify-end gap-2 px-6 pb-1">
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
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-dark'} text-lg leading-none flex items-center justify-center ${
              isGenerating || isSpeaking ? '' : 'opacity-50'
            }`}>⏹</span>
          </button>
          
          <button
            onClick={() => {
              const event = new CustomEvent('clearChat');
              window.dispatchEvent(event);
            }}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} h-8 w-8 rounded-lg flex items-center justify-center`}
            title="Start new chat"
          >
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-dark'} text-lg leading-none flex items-center justify-center`}>+</span>
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
              <span className={`${isLightBackground ? 'glass-text' : 'glass-text-dark'} text-sm leading-none flex items-center justify-center`}>✕</span>
            </button>
          )}
        </div>
      )}

      {/* Messages container with MASK for fade */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 relative overflow-hidden"
        style={{
          // Use dark mask on light backgrounds, light mask on dark backgrounds
          WebkitMaskImage: isLightBackground 
            ? 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.3) 4%, black 8%, black 92%, rgba(0,0,0,0.3) 96%, transparent 100%)'
            : 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.3) 4%, white 8%, white 92%, rgba(255,255,255,0.3) 96%, transparent 100%)',
          maskImage: isLightBackground
            ? 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.3) 4%, black 8%, black 92%, rgba(0,0,0,0.3) 96%, transparent 100%)'
            : 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.3) 4%, white 8%, white 92%, rgba(255,255,255,0.3) 96%, transparent 100%)',
          transition: 'mask-image 0.3s ease, -webkit-mask-image 0.3s ease',
        }}
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
            /* Placeholder message when empty */
            <div className="flex items-center justify-center h-full">
              <div className={`glass-message ${isLightBackground ? 'glass-message-dark' : ''} px-6 py-4 rounded-3xl`}>
                <div className={`${isLightBackground ? 'glass-text' : 'glass-text-dark'} text-center text-sm`}>
                  💬 Type a message to start chatting...
                </div>
              </div>
            </div>
          ) : (
            messages.slice().reverse().map((msg, index) => {
              const isUser = msg.role === 'user';
              const isError = msg.content.toLowerCase().startsWith('error:');
              const messageIndex = messages.length - 1 - index;
              const isPlaying = playingMessageIndex === messageIndex;
              const isLoading = loadingMessageIndex === messageIndex;
              
              // Check if TTS is enabled
              const ttsConfig = StorageManager.getConfig('ttsConfig', DefaultTTSConfig);
              const ttsEnabled = ttsConfig.enabled;
              
              return (
                <div
                  key={messageIndex}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="flex items-start gap-2 max-w-[80%]">
                    {/* Speaker icon for assistant messages (only show if TTS is enabled) */}
                    {!isUser && !isError && ttsEnabled && (
                      <button
                        onClick={() => handlePlayTTS(messageIndex, msg.content)}
                        className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} mt-2 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0`}
                        title={isPlaying ? 'Stop audio' : 'Play audio'}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <span className={`${isLightBackground ? 'glass-text' : 'glass-text-dark'} text-xs animate-spin`}>⏳</span>
                        ) : isPlaying ? (
                          <span className={`${isLightBackground ? 'glass-text' : 'glass-text-dark'} text-xs`}>⏸</span>
                        ) : (
                          <span className={`${isLightBackground ? 'glass-text' : 'glass-text-dark'} text-xs`}>🔊</span>
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
                      }`}
                    >
                      <div className={`${isLightBackground ? 'glass-text' : 'glass-text-dark'} text-[15px] leading-relaxed whitespace-pre-wrap break-words`}>
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
    </div>
    </>
  );
};

export default ChatContainer;
