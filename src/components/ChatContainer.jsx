import { useState, useEffect, useRef } from 'react';
import TTSService from '../services/TTSService';
import StorageManager from '../managers/StorageManager';
import { DefaultTTSConfig } from '../config/aiConfig';

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
        
        // Calculate potential positions
        const rightX = modelPos.x + modelPos.width + offsetX;
        const leftX = modelPos.x - containerWidth - offsetX;
        
        // Check boundaries
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const wouldOverflowRight = rightX + containerWidth > windowWidth - 10;
        
        // Decide which side
        const shouldBeOnLeft = wouldOverflowRight || modelPos.x > windowWidth * 0.7;
        
        // Calculate final position - align with model top
        const containerX = shouldBeOnLeft ? leftX : rightX;
        const containerY = Math.max(10, Math.min(modelPos.y, windowHeight - containerHeight - 10));
        
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
    if (!ttsConfig.enabled || !TTSService.isConfigured()) {
      console.warn('[ChatContainer] TTS not enabled or configured');
      return;
    }

    // If this message is already playing, stop it
    if (playingMessageIndex === messageIndex) {
      TTSService.stopPlayback();
      setPlayingMessageIndex(null);
      return;
    }

    // Stop any currently playing audio
    TTSService.stopPlayback();
    setPlayingMessageIndex(null);
    setLoadingMessageIndex(messageIndex);

    try {
      console.log(`[ChatContainer] Generating TTS for message ${messageIndex}`);
      
      // Clear stopped flag before starting new generation
      TTSService.resumePlayback();
      
      // Generate chunked speech for the message
      const audioUrls = await TTSService.generateChunkedSpeech(
        messageContent,
        null, // No chunk callback needed here
        ttsConfig.chunkSize,
        ttsConfig.minChunkSize
      );

      if (audioUrls.length === 0) {
        console.warn('[ChatContainer] No audio generated');
        setLoadingMessageIndex(null);
        return;
      }

      setLoadingMessageIndex(null);
      setPlayingMessageIndex(messageIndex);

      // Play audio sequence
      await TTSService.playAudioSequence(audioUrls);

      // Clean up after playback
      TTSService.cleanupBlobUrls(audioUrls);
      setPlayingMessageIndex(null);

    } catch (error) {
      console.error('[ChatContainer] TTS playback failed:', error);
      setLoadingMessageIndex(null);
      setPlayingMessageIndex(null);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: `${containerPos.x}px`,
        top: `${containerPos.y}px`,
        zIndex: 998,
        width: '400px',
        height: '500px',
      }}
      className={`flex flex-col-reverse gap-3 border-2 rounded-3xl ${isDragging ? 'border-white/40' : 'border-transparent'}`}
    >
      {/* Action buttons at BOTTOM - closer to container */}
      {messages.length > 0 && (
        <div className="flex items-center justify-end gap-2 px-6 pb-1">
          <button
            onClick={() => {
              const event = new CustomEvent('stopGeneration');
              window.dispatchEvent(event);
            }}
            disabled={!isGenerating && !isSpeaking}
            className={`h-8 w-8 rounded-lg transition-all flex items-center justify-center shadow-sm ${
              isGenerating || isSpeaking
                ? 'bg-red-500/20 border border-red-500/40 hover:bg-red-500/30 cursor-pointer' 
                : 'bg-white/5 border border-white/10 cursor-not-allowed opacity-50'
            }`}
            style={{
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
            title={isGenerating ? 'Stop generation' : isSpeaking ? 'Stop speaking' : 'Nothing to stop'}
          >
            <span className={`text-lg leading-none flex items-center justify-center ${
              isGenerating || isSpeaking ? 'text-red-300' : 'text-gray-500'
            }`}>⏹</span>
          </button>
          
          <button
            onClick={() => {
              const event = new CustomEvent('clearChat');
              window.dispatchEvent(event);
            }}
            className="h-8 w-8 rounded-lg bg-white/10 border border-white/15 hover:bg-white/20 transition-all flex items-center justify-center shadow-sm"
            style={{
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
            title="Start new chat"
          >
            <span className="text-white text-lg leading-none flex items-center justify-center">+</span>
          </button>
          
          {/* Close button only shown when model is loaded (no chat button available) */}
          {!modelDisabled && (
            <button
              onClick={() => {
                const event = new CustomEvent('closeChat');
                window.dispatchEvent(event);
              }}
              className="h-8 w-8 rounded-lg bg-white/10 border border-white/15 hover:bg-white/20 transition-all flex items-center justify-center shadow-sm"
              style={{
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
              title="Close chat"
            >
              <span className="text-white text-sm leading-none flex items-center justify-center">✕</span>
            </button>
          )}
        </div>
      )}

      {/* Messages container with proper fade using mask */}
      <div 
        className="flex-1 relative overflow-hidden"
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
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
              <div 
                className="px-6 py-4 bg-white/5 border border-white/10 rounded-3xl"
                style={{
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }}
              >
                <div className="text-white/60 text-center text-sm">
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
                        className="mt-2 w-7 h-7 rounded-full bg-white/10 border border-white/15 hover:bg-white/20 transition-all flex items-center justify-center shadow-sm flex-shrink-0"
                        style={{
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)',
                        }}
                        title={isPlaying ? 'Stop audio' : 'Play audio'}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <span className="text-white text-xs animate-spin">⏳</span>
                        ) : isPlaying ? (
                          <span className="text-white text-xs">⏸</span>
                        ) : (
                          <span className="text-white text-xs">🔊</span>
                        )}
                      </button>
                    )}
                    
                    {/* Message bubble */}
                    <div
                      className={`px-4 py-3 border ${
                        isError
                          ? 'bg-red-500/10 border-red-400/20 rounded-3xl'
                          : isUser
                          ? 'bg-white/8 border-white/15 rounded-[20px] rounded-tr-md'
                          : 'bg-white/5 border-white/10 rounded-[20px] rounded-tl-md'
                      }`}
                      style={{
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                      }}
                    >
                      <div className="text-white text-[15px] leading-relaxed whitespace-pre-wrap break-words">
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
  );
};

export default ChatContainer;
