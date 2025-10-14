import { useState, useEffect, useRef, useCallback } from 'react';
import StorageManager from '../managers/StorageManager';

const ChatButton = ({ positionManagerRef, onClick, isVisible = true, modelDisabled = false, isChatOpen = false }) => {
  const [buttonPos, setButtonPos] = useState({ x: -100, y: -100 }); // Start off-screen
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false); // Track if user actually dragged
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartButtonPos = useRef({ x: 0, y: 0 });

  // Check if model is disabled on mount and set initial position
  useEffect(() => {
    // If model is disabled, load saved position or use default (bottom-right corner)
    if (modelDisabled) {
      // Default to bottom-right: 20px from edges, 48px is button size
      const defaultPos = { x: window.innerWidth - 68, y: window.innerHeight - 68 };
      const savedPos = StorageManager.getConfig('chatButtonPosition', defaultPos);
      
      // Ensure button is within viewport bounds
      const buttonSize = 48;
      const boundedX = Math.max(10, Math.min(savedPos.x, window.innerWidth - buttonSize - 10));
      const boundedY = Math.max(10, Math.min(savedPos.y, window.innerHeight - buttonSize - 10));
      
      const validPos = { x: boundedX, y: boundedY };
      setButtonPos(validPos);
      
      // Save corrected position if it was out of bounds
      if (boundedX !== savedPos.x || boundedY !== savedPos.y) {
        StorageManager.saveConfig('chatButtonPosition', validPos);
      }
    }
  }, [modelDisabled]);

  // Handle window resize - keep button within bounds
  useEffect(() => {
    if (!modelDisabled) return;

    const handleResize = () => {
      const buttonSize = 48;
      const boundedX = Math.max(10, Math.min(buttonPos.x, window.innerWidth - buttonSize - 10));
      const boundedY = Math.max(10, Math.min(buttonPos.y, window.innerHeight - buttonSize - 10));
      
      if (boundedX !== buttonPos.x || boundedY !== buttonPos.y) {
        const newPos = { x: boundedX, y: boundedY };
        setButtonPos(newPos);
        StorageManager.saveConfig('chatButtonPosition', newPos);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [modelDisabled, buttonPos]);

  // Move button up if it's over the input prompt when chat opens
  useEffect(() => {
    if (!modelDisabled || !isChatOpen) return;

    const chatInputHeight = 110; // Actual height of ChatInput bar
    const minDistanceFromBottom = chatInputHeight + 15; // Input height + gap

    // Check if button is too close to bottom (would overlap input)
    if (buttonPos.y > window.innerHeight - minDistanceFromBottom) {
      const newY = window.innerHeight - minDistanceFromBottom;
      const newPos = { x: buttonPos.x, y: newY };
      setButtonPos(newPos);
      StorageManager.saveConfig('chatButtonPosition', newPos);
      
      // Emit event so container follows
      const event = new CustomEvent('chatButtonMoved', { detail: newPos });
      window.dispatchEvent(event);
    }
  }, [modelDisabled, isChatOpen, buttonPos.x, buttonPos.y]);

  useEffect(() => {
    /**
     * Update button position based on model position
     * Intelligently positions on left or right based on screen bounds
     * ONLY when model is enabled
     */
    const updatePosition = () => {
      // If model is disabled, don't update position automatically - user controls position
      if (modelDisabled) {
        return;
      }
      
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
      } catch (error) {
        console.error('[ChatButton] Failed to update position:', error);
      }
    };

    // Initial position update
    updatePosition();

    // Only listen to events if model is enabled
    if (!modelDisabled) {
      // Listen for window resize
      window.addEventListener('resize', updatePosition);
      
      // Listen for model position changes (emitted by PositionManager)
      window.addEventListener('modelPositionChange', updatePosition);

      // Cleanup listeners
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('modelPositionChange', updatePosition);
      };
    }
  }, [positionManagerRef, modelDisabled]);

  // Drag handlers for when model is disabled
  const handleMouseDown = useCallback((e) => {
    if (!modelDisabled) return; // Only draggable when model is disabled
    
    e.preventDefault();
    e.stopPropagation(); // Prevent click event from firing
    setIsDragging(true);
    setHasDragged(false); // Reset drag flag
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartButtonPos.current = { ...buttonPos };
    
    // Emit drag start event for ChatContainer border
    const event = new CustomEvent('chatButtonDragStart');
    window.dispatchEvent(event);
  }, [modelDisabled, buttonPos]);

  const handleMouseMove = useCallback((e) => {
    if (!modelDisabled || !isDragging) return;
    
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    
    // If moved more than 5 pixels, consider it a drag (not a click)
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      setHasDragged(true);
    }
    
    const newX = dragStartButtonPos.current.x + deltaX;
    const newY = dragStartButtonPos.current.y + deltaY;
    
    // Keep button within viewport bounds
    const buttonSize = 48;
    const chatInputHeight = isChatOpen ? 110 : 0; // Only restrict if input is open
    const minDistanceFromBottom = chatInputHeight + 15;
    
    const boundedX = Math.max(10, Math.min(newX, window.innerWidth - buttonSize - 10));
    let boundedY = Math.max(10, Math.min(newY, window.innerHeight - buttonSize - 10));
    
    // Don't allow dragging over input prompt when it's open
    if (isChatOpen && boundedY > window.innerHeight - minDistanceFromBottom) {
      boundedY = window.innerHeight - minDistanceFromBottom;
    }
    
    setButtonPos({ x: boundedX, y: boundedY });
    
    // Emit event to notify ChatContainer to update its position
    const event = new CustomEvent('chatButtonMoved', { detail: { x: boundedX, y: boundedY } });
    window.dispatchEvent(event);
  }, [modelDisabled, isDragging, isChatOpen]);

  const handleMouseUp = useCallback(() => {
    if (!modelDisabled || !isDragging) return;
    
    setIsDragging(false);
    
    // Save position to localStorage
    StorageManager.saveConfig('chatButtonPosition', buttonPos);
    
    // Emit drag end event for ChatContainer border
    const event = new CustomEvent('chatButtonDragEnd');
    window.dispatchEvent(event);
  }, [modelDisabled, isDragging, buttonPos]);

  // Add global mouse event listeners for dragging
  useEffect(() => {
    if (!modelDisabled) return;
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [modelDisabled, handleMouseMove, handleMouseUp]);

  // Handle click - only fire if not dragged
  const handleClick = useCallback((e) => {
    if (modelDisabled && hasDragged) {
      // User dragged, don't open chat
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // Normal click
    onClick();
  }, [modelDisabled, hasDragged, onClick]);

  // Always visible now (even when chat is open, for dragging purposes)
  if (!isVisible) return null;

  return (
    <button
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        left: `${buttonPos.x}px`,
        top: `${buttonPos.y}px`,
        zIndex: 9999, // Maximum z-index to always be on top
        width: '48px',
        height: '48px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.25)',
        cursor: modelDisabled ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
      }}
      className={`rounded-full flex items-center justify-center border border-white/30 backdrop-blur-2xl bg-white/20 hover:bg-white/30 ${
        modelDisabled ? '' : 'hover:scale-110 active:scale-95 transition-transform'
      }`}
      title={modelDisabled ? (isChatOpen ? 'Click to close chat' : 'Drag to reposition or click to chat') : (isChatOpen ? 'Click to close chat' : 'Chat with assistant')}
    >
      <span className="text-white text-2xl drop-shadow-lg">{isChatOpen ? '✕' : '💬'}</span>
    </button>
  );
};

export default ChatButton;
