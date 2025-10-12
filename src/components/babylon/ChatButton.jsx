import { useState, useEffect } from 'react';

const ChatButton = ({ positionManagerRef, onClick, isVisible = true }) => {
  const [buttonPos, setButtonPos] = useState({ x: -100, y: -100 }); // Start off-screen

  useEffect(() => {
    /**
     * Update button position based on model position
     * Intelligently positions on left or right based on screen bounds
     */
    const updatePosition = () => {
      if (!positionManagerRef?.current) {
        // Try again in a bit if position manager isn't ready
        setTimeout(updatePosition, 100);
        return;
      }
      
      try {
        const modelPos = positionManagerRef.current.getPositionPixels();
        
        const buttonSize = 48;
        const offsetX = 15; // Closer horizontal distance
        const offsetY = 25; // Closer vertical distance from bottom
        
        // Calculate potential positions
        const rightX = modelPos.x + modelPos.width + offsetX;
        const leftX = modelPos.x - buttonSize - offsetX;
        
        // Check boundaries
        const windowWidth = window.innerWidth;
        const wouldOverflowRight = rightX + buttonSize > windowWidth - 10;
        
        // Decide which side (prioritize right unless it overflows)
        const shouldBeOnLeft = wouldOverflowRight || modelPos.x > windowWidth * 0.7;
        
        // Calculate final position
        const buttonX = shouldBeOnLeft ? leftX : rightX;
        const buttonY = modelPos.y + modelPos.height - buttonSize - offsetY;
        
        setButtonPos({ x: buttonX, y: buttonY });
        
        console.log('[ChatButton] Position updated:', { 
          modelPos, 
          buttonPos: { x: buttonX, y: buttonY },
          side: shouldBeOnLeft ? 'left' : 'right'
        });
      } catch (error) {
        console.error('[ChatButton] Failed to update position:', error);
      }
    };

    // Initial position update
    updatePosition();

    // Listen for window resize
    window.addEventListener('resize', updatePosition);
    
    // Listen for model position changes (emitted by PositionManager)
    window.addEventListener('modelPositionChange', updatePosition);

    // Cleanup listeners
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('modelPositionChange', updatePosition);
    };
  }, [positionManagerRef]);

  if (!isVisible) return null;

  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        left: `${buttonPos.x}px`,
        top: `${buttonPos.y}px`,
        zIndex: 999,
        width: '48px',
        height: '48px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.25)',
      }}
      className="rounded-full flex items-center justify-center cursor-pointer border border-white/30 hover:scale-110 active:scale-95 transition-transform backdrop-blur-2xl bg-white/20 hover:bg-white/30"
      title="Chat with assistant"
    >
      <span className="text-white text-2xl drop-shadow-lg">💬</span>
    </button>
  );
};

export default ChatButton;
