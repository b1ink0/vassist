import { useState, useEffect, useRef } from 'react';

const ChatContainer = ({ 
  positionManagerRef, 
  messages = [], // Array of { role: 'user' | 'assistant', content: string }
  isVisible = false
}) => {
  const [containerPos, setContainerPos] = useState({ x: 0, y: 0 });
  const scrollRef = useRef(null);

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
   * Update container position based on model position
   */
  useEffect(() => {
    const updatePosition = () => {
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
        
        console.log('[ChatContainer] Position updated:', {
          modelPos,
          containerPos: { x: containerX, y: containerY },
          side: shouldBeOnLeft ? 'left' : 'right'
        });
      } catch (error) {
        console.error('[ChatContainer] Failed to update position:', error);
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
   * Auto-scroll to bottom when messages change
   */
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      className="flex flex-col-reverse gap-3"
    >
      {/* Action buttons at BOTTOM - closer to container */}
      {messages.length > 0 && (
        <div className="flex items-center justify-end gap-2 px-6 pb-1">
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
          {messages.length === 0 ? null : (
            messages.slice().reverse().map((msg, index) => {
              const isUser = msg.role === 'user';
              const isError = msg.content.toLowerCase().startsWith('error:');
              
              return (
                <div
                  key={messages.length - 1 - index}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-3 border ${
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
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatContainer;
