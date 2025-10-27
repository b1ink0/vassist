import { useState, useEffect, useRef, useCallback } from 'react';
import { StorageServiceProxy } from '../services/proxies';
import { useApp } from '../contexts/AppContext';
import { useConfig } from '../contexts/ConfigContext';

const ChatButton = ({ onClick, isVisible = true, modelDisabled = false, isChatOpen = false, chatInputRef }) => {
  const {
    positionManagerRef,
    buttonPosition: buttonPos,
    updateButtonPosition: setButtonPos,
    startButtonDrag,
    endButtonDrag,
    setPendingDropData,
  } = useApp();
  
  const { uiConfig, updateUIConfig } = useConfig();

  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartButtonPos = useRef({ x: 0, y: 0 });
  const buttonPosRef = useRef({ x: -100, y: -100 });
  const lastSetPosition = useRef({ x: -100, y: -100 });
  const [isDragOverButton, setIsDragOverButton] = useState(false);
  const dragDropServiceRef = useRef(null);
  const buttonRef = useRef(null);

  /**
   * Convert preset name to button pixel position
   */
  const getButtonPositionFromPreset = useCallback((preset) => {
    const buttonSize = 48;
    const padding = 20;
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    switch (preset) {
      case 'bottom-right':
        return { x: width - buttonSize - padding, y: height - buttonSize - padding };
      case 'bottom-left':
        return { x: padding, y: height - buttonSize - padding };
      case 'bottom-center':
        return { x: (width - buttonSize) / 2, y: height - buttonSize - padding };
      case 'top-right':
        return { x: width - buttonSize - padding, y: padding };
      case 'top-left':
        return { x: padding, y: padding };
      case 'top-center':
        return { x: (width - buttonSize) / 2, y: padding };
      case 'center':
        return { x: (width - buttonSize) / 2, y: (height - buttonSize) / 2 };
      default:
        return { x: width - buttonSize - padding, y: height - buttonSize - padding };
    }
  }, []);

  // Load saved position when model is disabled (chat-only mode)
  useEffect(() => {
    if (!modelDisabled) return;
    const load = async () => {
      const defaultPos = { x: window.innerWidth - 68, y: window.innerHeight - 68 };
      
      try {
        const positionConfig = uiConfig.position || { preset: 'bottom-right' };
        const preset = positionConfig.preset || 'bottom-right';
        
        let targetPos = defaultPos;
        
        // If preset is 'last-location' and we have saved coordinates
        if (preset === 'last-location' && positionConfig.lastLocation) {
          const { x, y } = positionConfig.lastLocation;
          targetPos = { x, y };
          console.log('[ChatButton] Loading from last location:', targetPos);
        } else if (preset !== 'last-location') {
          // Use preset position (convert to button position)
          targetPos = getButtonPositionFromPreset(preset);
          console.log('[ChatButton] Loading from preset:', preset, targetPos);
        }
        
        // Bound check
        const buttonSize = 48;
        const boundedX = Math.max(10, Math.min(targetPos.x, window.innerWidth - buttonSize - 10));
        const boundedY = Math.max(10, Math.min(targetPos.y, window.innerHeight - buttonSize - 10));
        const validPos = { x: boundedX, y: boundedY };
        
        setButtonPos(validPos);
        buttonPosRef.current = validPos;
      } catch (err) {
        console.error('[ChatButton] load position failed', err);
        setButtonPos(defaultPos);
        buttonPosRef.current = defaultPos;
      }
    };
    load();
  }, [modelDisabled, setButtonPos, uiConfig.position, getButtonPositionFromPreset]);

  useEffect(() => {
    buttonPosRef.current = buttonPos;
  }, [buttonPos]);

  // Adjust button position when chat opens (if in chat-only mode)
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
      
      // Save if using last-location
      if (uiConfig.position?.preset === 'last-location') {
        updateUIConfig('position.lastLocation', { 
          x: newPos.x, 
          y: newPos.y,
          width: 48,
          height: 48
        });
      }

      const event = new CustomEvent('chatButtonMoved', { detail: newPos });
      window.dispatchEvent(event);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelDisabled, isChatOpen, uiConfig.position?.preset, updateUIConfig]); // chatInputRef is stable, don't include in dependencies

  // Handle window resize - keep button within bounds when in chat-only mode
  const handleResize = useCallback(async () => {
    const buttonSize = 48;
    const boundedX = Math.max(10, Math.min(buttonPos.x, window.innerWidth - buttonSize - 10));
    const boundedY = Math.max(10, Math.min(buttonPos.y, window.innerHeight - buttonSize - 10));
    if (boundedX !== buttonPos.x || boundedY !== buttonPos.y) {
      const newPos = { x: boundedX, y: boundedY };
      setButtonPos(newPos);
      
      // Save if using last-location
      if (uiConfig.position?.preset === 'last-location') {
        updateUIConfig('position.lastLocation', { 
          x: newPos.x, 
          y: newPos.y,
          width: 48,
          height: 48
        });
      }
    }
  }, [buttonPos.x, buttonPos.y, setButtonPos, uiConfig.position?.preset, updateUIConfig]);

  useEffect(() => {
    if (!modelDisabled) return;
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [modelDisabled, handleResize]);

  // When model is enabled, follow the model position (throttled events come from PositionManager)
  useEffect(() => {
    if (modelDisabled) return;
    const updateFromModel = (ev) => {
      let modelPos = null;
      if (ev && ev.detail) modelPos = ev.detail;
      else if (positionManagerRef?.current) {
        try {
          modelPos = positionManagerRef.current.getPositionPixels();
        } catch (err) {
          console.error('[ChatButton] getPositionPixels failed', err);
          return;
        }
      } else return;

      try {
        const buttonSize = 48;
        const offsetX = 15;
        
        // Chat icon positioning - at bottom of effectiveHeight (visible area)
        const buttonY = modelPos.y + modelPos.height - buttonSize;
        
        const rightX = modelPos.x + modelPos.width + offsetX;
        const leftX = modelPos.x - buttonSize - offsetX;
        const windowWidth = window.innerWidth;
        const wouldOverflowRight = rightX + buttonSize > windowWidth - 10;
        const shouldBeOnLeft = wouldOverflowRight || modelPos.x > windowWidth * 0.7;
        const buttonX = shouldBeOnLeft ? leftX : rightX;
        const newX = Math.round(buttonX);
        const newY = Math.round(buttonY);
        if (newX === lastSetPosition.current.x && newY === lastSetPosition.current.y) return;
        lastSetPosition.current = { x: newX, y: newY };
  setButtonPos({ x: newX, y: newY });
      } catch (err) {
        console.error('[ChatButton] updateFromModel failed', err);
      }
    };

    window.addEventListener('modelPositionChange', updateFromModel);
    window.addEventListener('resize', updateFromModel);
    return () => {
      window.removeEventListener('modelPositionChange', updateFromModel);
      window.removeEventListener('resize', updateFromModel);
    };
  }, [modelDisabled, positionManagerRef, setButtonPos]);

  const handleMouseDown = useCallback((e) => {
    if (!modelDisabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setHasDragged(false);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartButtonPos.current = { ...buttonPos };
    
    // Emit drag start event for ChatContainer border
    const event = new CustomEvent('chatButtonDragStart');
    window.dispatchEvent(event);
    
    startButtonDrag();
  }, [modelDisabled, buttonPos, startButtonDrag]);

  const handleMouseMove = useCallback((e) => {
    if (!modelDisabled || !isDragging) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) setHasDragged(true);
    const newX = dragStartButtonPos.current.x + deltaX;
    const newY = dragStartButtonPos.current.y + deltaY;
    const buttonSize = 48;
    const chatInputHeight = isChatOpen ? 110 : 0;
    const minDistanceFromBottom = chatInputHeight + 15;
    const boundedX = Math.max(10, Math.min(newX, window.innerWidth - buttonSize - 10));
    let boundedY = Math.max(10, Math.min(newY, window.innerHeight - buttonSize - 10));
    if (isChatOpen && boundedY > window.innerHeight - minDistanceFromBottom) boundedY = window.innerHeight - minDistanceFromBottom;
    
    const newPos = { x: boundedX, y: boundedY };
    setButtonPos(newPos);
    
    // Dispatch event so ChatContainer follows in real-time while dragging
    const event = new CustomEvent('chatButtonMoved', { detail: newPos });
    window.dispatchEvent(event);
  }, [modelDisabled, isDragging, isChatOpen, setButtonPos]);

  const handleMouseUp = useCallback(() => {
    if (!modelDisabled || !isDragging) return;
    setIsDragging(false);
    
    // Save position if preset is 'last-location'
    if (uiConfig.position?.preset === 'last-location') {
      console.log('[ChatButton] Saving last location:', buttonPos);
      updateUIConfig('position.lastLocation', { 
        x: buttonPos.x, 
        y: buttonPos.y,
        width: 48, // Button size
        height: 48
      });
    }
    
    // Emit chatButtonMoved event for ChatContainer to follow
    const event = new CustomEvent('chatButtonMoved', { detail: buttonPos });
    window.dispatchEvent(event);
    
    endButtonDrag();
  }, [modelDisabled, isDragging, buttonPos, endButtonDrag, uiConfig.position?.preset, updateUIConfig]);

  useEffect(() => {
    if (!modelDisabled) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [modelDisabled, handleMouseMove, handleMouseUp]);

  const handleClick = useCallback((e) => {
    if (modelDisabled && hasDragged) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (typeof onClick === 'function') onClick(e);
  }, [modelDisabled, hasDragged, onClick]);

  // Attach drag-drop service to button so drops set pending data in AppContext
  useEffect(() => {
    if (!buttonRef.current) return;
    let attached = true;
    import('../services/DragDropService').then(({ default: DragDropService }) => {
      if (!attached) return;
      const el = buttonRef.current;
      if (!el) return;
      dragDropServiceRef.current = new DragDropService({ maxImages: 3, maxAudios: 1 });
      dragDropServiceRef.current.attach(el, {
        onSetDragOver: (flag) => setIsDragOverButton(flag),
        onShowError: (err) => console.error('[ChatButton] DragDrop error', err),
        checkVoiceMode: null,
        getCurrentCounts: () => ({ images: 0, audios: 0 }),
        onProcessData: (data) => {
          if (!isChatOpen) handleClick();
          setPendingDropData(data);
        }
      });
    }).catch(err => console.error('[ChatButton] load DragDropService failed', err));
    return () => { attached = false; if (dragDropServiceRef.current) dragDropServiceRef.current.detach(); };
  }, [buttonPos.x, buttonPos.y, isChatOpen, handleClick, setPendingDropData]);

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
        zIndex: 10000, // Higher than canvas (9999) to ensure clickability
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
