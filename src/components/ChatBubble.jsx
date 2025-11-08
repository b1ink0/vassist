/**
 * @fileoverview Chat bubble component for displaying messages near the assistant.
 */

import { useState, useEffect, useRef } from 'react';
import { Icon } from './icons';
import Logger from '../services/LoggerService';

/**
 * Chat bubble component for displaying messages near the virtual assistant.
 * 
 * @param {Object} props
 * @param {Object} props.positionManagerRef - Reference to position manager
 * @param {string} props.message - Message text to display
 * @param {string} props.type - Message type ('user'|'assistant')
 * @param {boolean} props.isVisible - Visibility state
 * @param {Function} props.onHide - Hide callback
 * @returns {JSX.Element|null}
 */
const ChatBubble = ({ 
  positionManagerRef, 
  message, 
  type = 'assistant',
  isVisible = false,
  onHide 
}) => {
  const [bubblePos, setBubblePos] = useState({ x: 0, y: 0 });
  const [isOnLeft, setIsOnLeft] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const hideTimeoutRef = useRef(null);
  const typingIntervalRef = useRef(null);

  useEffect(() => {
    const updatePosition = () => {
      if (!positionManagerRef?.current) return;

      try {
        const modelPos = positionManagerRef.current.getPositionPixels();
        
        const bubbleWidth = 350;
        const bubbleHeight = 120;
        const offsetX = 20;
        const offsetY = 20;
        
        const rightX = modelPos.x + modelPos.width + offsetX;
        const leftX = modelPos.x - bubbleWidth - offsetX;
        
        const windowWidth = window.innerWidth;
        const wouldOverflowRight = rightX + bubbleWidth > windowWidth - 10;
        
        const shouldBeOnLeft = wouldOverflowRight || modelPos.x > windowWidth * 0.7;
        setIsOnLeft(shouldBeOnLeft);
        
        const bubbleX = shouldBeOnLeft ? leftX : rightX;
        const bubbleY = modelPos.y - bubbleHeight - offsetY;
        
        setBubblePos({ x: bubbleX, y: bubbleY });
        
        Logger.log('ChatBubble', 'Position updated:', {
          modelPos,
          bubblePos: { x: bubbleX, y: bubbleY },
          side: shouldBeOnLeft ? 'left' : 'right'
        });
      } catch (error) {
        Logger.error('ChatBubble', 'Failed to update position:', error);
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

  useEffect(() => {
    if (!isVisible || !message) {
      setDisplayText('');
      setIsTyping(false);
      return;
    }

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
    }, 20);

    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, [message, isVisible, displayText]);

  useEffect(() => {
    if (isVisible && !isTyping && displayText && type === 'assistant') {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }

      hideTimeoutRef.current = setTimeout(() => {
        Logger.log('ChatBubble', 'Auto-hiding after delay');
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

  const isError = message.toLowerCase().startsWith('error:');
  const isUser = type === 'user';

  const bubbleClasses = isError
    ? 'glass-error'
    : isUser
    ? 'glass-success'
    : 'glass-message';

  const triangleColor = isError
    ? 'rgba(239, 68, 68, 0.3)'
    : isUser
    ? 'rgba(34, 197, 94, 0.3)'
    : 'rgba(255, 255, 255, 0.25)';

  return (
    <div
      style={{
        position: 'fixed',
        left: `${bubblePos.x}px`,
        top: `${bubblePos.y}px`,
        zIndex: 998,
        maxWidth: '350px',
        minWidth: '200px',
      }}
      className={`${bubbleClasses} glass-accelerated rounded-2xl p-4 shadow-2xl`}
    >
      <div className="glass-text text-sm leading-relaxed">
        {displayText}
        {isTyping && (
          <span className="inline-block w-1 h-4 ml-1 bg-white animate-pulse" />
        )}
      </div>

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

      {type === 'assistant' && (
        <button
          onClick={onHide}
          className="glass-button absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          title="Close"
        >
          <Icon name="close" size={12} className="glass-text" />
        </button>
      )}
    </div>
  );
};

export default ChatBubble;
