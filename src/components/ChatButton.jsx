import { useState, useEffect, useRef, useCallback } from 'react';
import { StorageServiceProxy } from '../services/proxies';

const ChatButton = ({ positionManagerRef, onClick, isVisible = true, modelDisabled = false, isChatOpen = false, chatInputRef }) => {
  const [buttonPos, setButtonPos] = useState({ x: -100, y: -100 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartButtonPos = useRef({ x: 0, y: 0 });
  const buttonPosRef = useRef({ x: -100, y: -100 });
  const lastSetPosition = useRef({ x: -100, y: -100 });
  const [isDragOverButton, setIsDragOverButton] = useState(false);
  const dragDropServiceRef = useRef(null);
  const buttonRef = useRef(null);

  // Check if model is disabled on mount and set initial position
  useEffect(() => {
    // If model is disabled, load saved position or use default (bottom-right corner)
    if (modelDisabled) {
      const loadButtonPosition = async () => {
        const defaultPos = { x: window.innerWidth - 68, y: window.innerHeight - 68 };
        try {
          const savedPos = await StorageServiceProxy.configLoad('chatButtonPosition', defaultPos);
          
          // Ensure button is within viewport bounds
          const buttonSize = 48;
          const boundedX = Math.max(10, Math.min(savedPos.x, window.innerWidth - buttonSize - 10));
          const boundedY = Math.max(10, Math.min(savedPos.y, window.innerHeight - buttonSize - 10));
          
          const validPos = { x: boundedX, y: boundedY };
          setButtonPos(validPos);
          buttonPosRef.current = validPos; // Keep ref in sync
          
          // Save corrected position if it was out of bounds
          if (boundedX !== savedPos.x || boundedY !== savedPos.y) {
            await StorageServiceProxy.configSave('chatButtonPosition', validPos);
          }
        } catch (error) {
          console.error('[ChatButton] Failed to load button position:', error);
          const defaultPos = { x: window.innerWidth - 68, y: window.innerHeight - 68 };
          setButtonPos(defaultPos);
          buttonPosRef.current = defaultPos;
        }
      };
      
      loadButtonPosition();
    }
  }, [modelDisabled]);

  // Keep buttonPosRef in sync with buttonPos state for use in effects without dependencies
  useEffect(() => {
    buttonPosRef.current = buttonPos;
  }, [buttonPos]);

  // Handle window resize - keep button within bounds
  const handleResize = useCallback(async () => {
    const buttonSize = 48;
    const boundedX = Math.max(10, Math.min(buttonPos.x, window.innerWidth - buttonSize - 10));
    const boundedY = Math.max(10, Math.min(buttonPos.y, window.innerHeight - buttonSize - 10));
    
    if (boundedX !== buttonPos.x || boundedY !== buttonPos.y) {
      const newPos = { x: boundedX, y: boundedY };
      setButtonPos(newPos);
      try {
        await StorageServiceProxy.configSave('chatButtonPosition', newPos);
      } catch (error) {
        console.error('[ChatButton] Failed to save position on resize:', error);
      }
    }
  }, [buttonPos.x, buttonPos.y]);

  useEffect(() => {
    if (!modelDisabled) return;

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [modelDisabled, handleResize]);

  useEffect(() => {
    if (!modelDisabled || !isChatOpen) return;

    const chatInputHeight = chatInputRef?.current?.getBoundingClientRect().height || 140;
    const minDistanceFromBottom = chatInputHeight + 15;

    const currentPos = buttonPosRef.current;
    if (currentPos.y > window.innerHeight - minDistanceFromBottom) {
      const newY = window.innerHeight - minDistanceFromBottom;
      const newPos = { x: currentPos.x, y: newY };
      setButtonPos(newPos);
      buttonPosRef.current = newPos;
      StorageServiceProxy.configSave('chatButtonPosition', newPos).catch(error => {
        console.error('[ChatButton] Failed to save position when chat opened:', error);
      });
      
      const event = new CustomEvent('chatButtonMoved', { detail: newPos });
      window.dispatchEvent(event);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelDisabled, isChatOpen]); // chatInputRef is stable, don't include in dependencies

  useEffect(() => {
    /**
     * Update button position based on model position
     * Intelligently positions on left or right based on screen bounds
     * ONLY when model is enabled
     */
    const updatePosition = (eventDetail = null) => {
      // If model is disabled, don't update position automatically - user controls position
      if (modelDisabled) {
        return;
      }
      
      // Try to get position from event detail first, then from ref
      let modelPos = null;
      
      if (eventDetail && eventDetail.detail) {
        // Event was fired with position data
        modelPos = {
          x: eventDetail.detail.x,
          y: eventDetail.detail.y,
          width: eventDetail.detail.width,
          height: eventDetail.detail.height
        };
      } else if (positionManagerRef?.current) {
        // Get from positionManagerRef
        try {
          modelPos = positionManagerRef.current.getPositionPixels();
        } catch (error) {
          console.error('[ChatButton] Failed to get position from ref:', error);
          return;
        }
      } else {
        // PositionManager not ready yet
        console.log('[ChatButton] PositionManager not yet initialized, skipping position update');
        return;
      }
      
      try {
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
        
        // CRITICAL: Only update if position actually changed
        // This prevents infinite re-render loops
        setButtonPos(prev => {
          // Round to prevent floating point precision issues
          const newX = Math.round(buttonX);
          const newY = Math.round(buttonY);
          const prevX = Math.round(prev.x);
          const prevY = Math.round(prev.y);
          
          // Check against lastSetPosition to prevent duplicate updates
          if (newX === lastSetPosition.current.x && newY === lastSetPosition.current.y) {
            console.log('[ChatButton] Skipping - same as last set position');
            return prev;
          }
          
          // DEBUG: Log when position would change
          if (newX !== prevX || newY !== prevY) {
            console.log('[ChatButton] Position changing:', { prev: { x: prevX, y: prevY }, new: { x: newX, y: newY } });
            lastSetPosition.current = { x: newX, y: newY };
          }
          
          if (newX === prevX && newY === prevY) {
            return prev; // No change, don't trigger re-render
          }
          
          return { x: newX, y: newY };
        });
      } catch (error) {
        console.error('[ChatButton] Failed to update position:', error);
      }
    };

    // Only run when model is enabled
    if (modelDisabled) return;

    // Wrap handler to accept event objects
    const eventHandler = (event) => {
      console.log('[ChatButton] modelPositionChange event received');
      updatePosition(event);
    };
    
    // Listen for window resize
    window.addEventListener('resize', updatePosition);
    
    // Listen for model position changes (emitted by PositionManager)
    // The event detail contains position data
    window.addEventListener('modelPositionChange', eventHandler);

    // Cleanup listeners
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('modelPositionChange', eventHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelDisabled]);

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
    
    // Save position to storage
    StorageServiceProxy.configSave('chatButtonPosition', buttonPos).catch(error => {
      console.error('[ChatButton] Failed to save button position:', error);
    });
    
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

  // Setup drag-drop service for chat button (works in both modes)
  useEffect(() => {
    if (!buttonRef.current) {
      console.log('[ChatButton] Button ref not ready');
      return;
    }

    // Import DragDropService dynamically to avoid circular dependencies
    import('../services/DragDropService').then(({ default: DragDropService }) => {
      const buttonElement = buttonRef.current;
      
      if (!buttonElement) {
        console.log('[ChatButton] Button element not found for drag-drop');
        return;
      }

      console.log('[ChatButton] Attaching drag-drop service to button');

      dragDropServiceRef.current = new DragDropService({
        maxImages: 3,
        maxAudios: 1
      });

      dragDropServiceRef.current.attach(buttonElement, {
        onSetDragOver: (isDragging) => {
          setIsDragOverButton(isDragging);
          // DON'T open chat here - only on drop
        },
        onShowError: (error) => console.error('[ChatButton] Drag-drop error:', error),
        checkVoiceMode: null,
        getCurrentCounts: () => ({ images: 0, audios: 0 }),
        onAddText: (text) => {
          // Open chat when content is DROPPED (not just dragged over)
          if (!isChatOpen) {
            console.log('[ChatButton] Opening chat from button drop');
            onClick();
          }
          // Always dispatch event - ChatController will store as pending if needed
          window.dispatchEvent(new CustomEvent('chatDragDrop', {
            detail: { text }
          }));
        },
        onAddImages: (images) => {
          // Open chat when content is DROPPED
          if (!isChatOpen) {
            console.log('[ChatButton] Opening chat from button drop');
            onClick();
          }
          // Always dispatch event - ChatController will store as pending if needed
          window.dispatchEvent(new CustomEvent('chatDragDrop', {
            detail: { images }
          }));
        },
        onAddAudios: (audios) => {
          // Open chat when content is DROPPED
          if (!isChatOpen) {
            console.log('[ChatButton] Opening chat from button drop');
            onClick();
          }
          // Always dispatch event - ChatController will store as pending if needed
          window.dispatchEvent(new CustomEvent('chatDragDrop', {
            detail: { audios }
          }));
        }
      });
    });

    return () => {
      if (dragDropServiceRef.current) {
        dragDropServiceRef.current.detach();
      }
    };
  }, [buttonPos.x, buttonPos.y, isChatOpen, onClick]); // Re-attach when position changes

  // Always visible now (even when chat is open, for dragging purposes)
  if (!isVisible) return null;

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        left: `${buttonPos.x}px`,
        top: `${buttonPos.y}px`,
        zIndex: 9999, // Maximum z-index to always be on top
        width: '48px',
        height: '48px',
        cursor: modelDisabled ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
      }}
      className={`glass-button rounded-full flex items-center justify-center ${
        modelDisabled ? '' : 'hover:scale-110 active:scale-95 transition-transform'
      } ${isDragOverButton ? 'ring-2 ring-blue-400' : ''}`}
      title={modelDisabled ? (isChatOpen ? 'Click to close chat' : 'Drag to reposition or click to chat') : (isChatOpen ? 'Click to close chat' : 'Chat with assistant')}
    >
      <span className="glass-text text-2xl drop-shadow-lg">{isChatOpen ? '✕' : '💬'}</span>
    </button>
  );
};

export default ChatButton;
