import { useState, useEffect, useRef } from 'react';

const ChatBubble = ({ 
  positionManagerRef, 
  message, 
  type = 'assistant', // 'user' or 'assistant'
  isVisible = false,
  onHide 
}) => {
  const [bubblePos, setBubblePos] = useState({ x: 0, y: 0 });
  const [isOnLeft, setIsOnLeft] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const hideTimeoutRef = useRef(null);
  const typingIntervalRef = useRef(null);

  /**
   * Update bubble position based on model position
   * Similar logic to ChatButton but positioned above model
   */
  useEffect(() => {
    const updatePosition = () => {
      if (!positionManagerRef?.current) return;

      try {
        const modelPos = positionManagerRef.current.getPositionPixels();
        
        const bubbleWidth = 350; // Max bubble width
        const bubbleHeight = 120; // Estimated height
        const offsetX = 20;
        const offsetY = 20; // Distance above model
        
        // Calculate potential positions
        const rightX = modelPos.x + modelPos.width + offsetX;
        const leftX = modelPos.x - bubbleWidth - offsetX;
        
        // Check boundaries
        const windowWidth = window.innerWidth;
        const wouldOverflowRight = rightX + bubbleWidth > windowWidth - 10;
        
        // Decide which side (prioritize right unless it overflows)
        const shouldBeOnLeft = wouldOverflowRight || modelPos.x > windowWidth * 0.7;
        setIsOnLeft(shouldBeOnLeft);
        
        // Calculate final position (above model)
        const bubbleX = shouldBeOnLeft ? leftX : rightX;
        const bubbleY = modelPos.y - bubbleHeight - offsetY;
        
        setBubblePos({ x: bubbleX, y: bubbleY });
        
        console.log('[ChatBubble] Position updated:', {
          modelPos,
          bubblePos: { x: bubbleX, y: bubbleY },
          side: shouldBeOnLeft ? 'left' : 'right'
        });
      } catch (error) {
        console.error('[ChatBubble] Failed to update position:', error);
      }
    };

    if (isVisible) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('modelPositionChange', updatePosition);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('modelPositionChange', updatePosition);
      };
    }
  }, [positionManagerRef, isVisible]);

  /**
   * Typewriter effect for streaming text
   */
  useEffect(() => {
    if (!isVisible || !message) {
      setDisplayText('');
      setIsTyping(false);
      return;
    }

    // If message is the same as display, don't retype
    if (message === displayText) {
      setIsTyping(false);
      return;
    }

    setIsTyping(true);
    setDisplayText('');
    
    let currentIndex = 0;
    
    typingIntervalRef.current = setInterval(() => {
      if (currentIndex < message.length) {
        setDisplayText(message.substring(0, currentIndex + 1));
        currentIndex++;
      } else {
        setIsTyping(false);
        clearInterval(typingIntervalRef.current);
      }
    }, 20); // Fast typewriter effect (20ms per character)

    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, isVisible]);

  /**
   * Auto-hide after delay when typing is complete
   */
  useEffect(() => {
    if (isVisible && !isTyping && displayText && type === 'assistant') {
      // Clear any existing timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }

      // Auto-hide after 10 seconds
      hideTimeoutRef.current = setTimeout(() => {
        console.log('[ChatBubble] Auto-hiding after delay');
        onHide?.();
      }, 10000);

      return () => {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
        }
      };
    }
  }, [isVisible, isTyping, displayText, type, onHide]);

  if (!isVisible || !message) return null;

  // Check if message is an error
  const isError = message.toLowerCase().startsWith('error:');
  const isUser = type === 'user';

  // Different styles for user vs assistant vs error messages
  const bubbleClasses = isError
    ? 'backdrop-blur-md bg-gradient-to-br from-red-500/80 to-orange-600/80 border-red-400/30'
    : isUser
    ? 'backdrop-blur-md bg-gradient-to-br from-green-500/80 to-teal-600/80 border-green-400/30'
    : 'backdrop-blur-md bg-gradient-to-br from-blue-500/80 to-purple-600/80 border-blue-400/30';

  const triangleColor = isError
    ? 'rgba(239, 68, 68, 0.8)'
    : isUser
    ? 'rgba(16, 185, 129, 0.8)'
    : 'rgba(59, 130, 246, 0.8)';

  return (
    <div
      style={{
        position: 'fixed',
        left: `${bubblePos.x}px`,
        top: `${bubblePos.y}px`,
        zIndex: 998,
        maxWidth: '350px',
        minWidth: '200px',
        boxShadow: isOnLeft
          ? '4px 4px 20px rgba(0,0,0,0.4), inset -1px -1px 2px rgba(255,255,255,0.2)'
          : '-4px 4px 20px rgba(0,0,0,0.4), inset 1px -1px 2px rgba(255,255,255,0.2)',
      }}
      className={`${bubbleClasses} rounded-2xl p-4 border shadow-2xl`}
    >
      {/* Message text */}
      <div className="text-white text-sm leading-relaxed">
        {displayText}
        {isTyping && (
          <span className="inline-block w-1 h-4 ml-1 bg-white animate-pulse" />
        )}
      </div>

      {/* Triangle pointer pointing to model */}
      <div
        style={{
          position: 'absolute',
          bottom: '-8px',
          [isOnLeft ? 'right' : 'left']: '30px',
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: `8px solid ${triangleColor}`,
        }}
      />

      {/* Close button (only for assistant messages) */}
      {type === 'assistant' && (
        <button
          onClick={onHide}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          title="Close"
        >
          <span className="text-white text-xs">✕</span>
        </button>
      )}
    </div>
  );
};

export default ChatBubble;
