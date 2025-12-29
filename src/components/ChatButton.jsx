/**
 * @fileoverview Draggable chat button component with positioning logic.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { StorageServiceProxy } from '../services/proxies';
import { useApp } from '../contexts/AppContext';
import { useConfig } from '../contexts/ConfigContext';
import { useDesktop } from '../contexts/DesktopContext';
import { Icon } from './icons';
import Logger from '../services/LoggerService';
import emoteStorageService from '../services/EmoteStorageService';
import emotePlayerService from '../services/EmotePlayerService';
import { modelStorageService } from '../services/ModelStorageService';
import ZoomControl from './ZoomControl';
import { isAndroid, isDesktop } from '../utils/PlatformUtils';
import { PositionPresets } from '../config/uiConfig';

/**
 * Draggable chat button component with automatic positioning.
 * 
 * @param {Object} props
 * @param {Function} props.onClick - Click handler
 * @param {boolean} props.isVisible - Visibility state
 * @param {boolean} props.modelDisabled - Whether 3D model is disabled
 * @param {boolean} props.isChatOpen - Whether chat is open
 * @param {Object} props.chatInputRef - Reference to chat input
 * @returns {JSX.Element|null}
 */
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
  const { api: desktopAPI } = useDesktop();

  const isLeftSide = buttonPos.x < window.innerWidth / 2;

  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartButtonPos = useRef({ x: 0, y: 0 });
  const buttonPosRef = useRef({ x: -100, y: -100 });
  const lastSetPosition = useRef({ x: -100, y: -100 });
  const [isDragOverButton, setIsDragOverButton] = useState(false);
  const [isEmotePanelOpen, setIsEmotePanelOpen] = useState(false);
  const [emotes, setEmotes] = useState([]);
  const [isAutoPlayActive, setIsAutoPlayActive] = useState(false);
  const [isEmotePlaying, setIsEmotePlaying] = useState(false);
  const [currentPlayingEmoteId, setCurrentPlayingEmoteId] = useState(null);
  const [isAvatarPanelOpen, setIsAvatarPanelOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState(null);
  const dragDropServiceRef = useRef(null);
  const buttonRef = useRef(null);
  
  // Delayed render state for fade animation
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [isAppearing, setIsAppearing] = useState(false);
  
  // Background detection state
  const [isLightBackground, setIsLightBackground] = useState(false);

  useEffect(() => {
    if (isEmotePanelOpen) {
      emoteStorageService.getEmotesList()
        .then(allEmotes => {
          const visibleEmotes = allEmotes.filter(emote => emote.isVisible !== false);
          setEmotes(visibleEmotes);
        })
        .catch(err => {
          Logger.error('ChatButton', 'Failed to load emotes:', err);
        });
    }
  }, [isEmotePanelOpen]);

  useEffect(() => {
    if (isAvatarPanelOpen) {
      modelStorageService.getModelsList()
        .then(modelsList => {
          // Filter out Unknown Model (default model without data)
          const filteredModels = modelsList.filter(model => model.name !== 'Unknown Model');
          setModels(filteredModels);
          // Get current default model
          modelStorageService.getDefaultModel()
            .then(defaultModel => {
              setSelectedModelId(defaultModel?.id || null);
            })
            .catch(err => {
              Logger.error('ChatButton', 'Failed to get default model:', err);
            });
        })
        .catch(err => {
          Logger.error('ChatButton', 'Failed to load models:', err);
        });
    }
  }, [isAvatarPanelOpen]);

  // Track emote playing state
  useEffect(() => {
    const checkPlayingState = setInterval(() => {
      const isPlaying = emotePlayerService.isEmotePlaying();
      setIsEmotePlaying(isPlaying);
      
      // Update current playing emote ID
      const currentEmoteId = emotePlayerService.getCurrentEmoteId();
      setCurrentPlayingEmoteId(currentEmoteId);
      
      // Update auto-play active state
      const autoPlayActive = emotePlayerService.isAutoPlayActive();
      setIsAutoPlayActive(autoPlayActive);
    }, 100);

    return () => clearInterval(checkPlayingState);
  }, []);

  /**
   * Detect background color under the button
   */
  useEffect(() => {
    if (!shouldRender || isDragging) return;
    
    let detectionTimeout = null;
    let scrollTimeout = null;
    
    const detectBackgroundColor = () => {
      if (!buttonRef.current) {
        Logger.log('ChatButton', 'detectBackgroundColor: no button ref');
        return;
      }
      
      const mode = uiConfig?.backgroundDetection?.mode || 'adaptive';
      
      if (mode !== 'adaptive') {
        if (mode === 'light') {
          setIsLightBackground(true);
        } else if (mode === 'dark') {
          setIsLightBackground(false);
        }
        return;
      }
      
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const x = buttonRect.left + buttonRect.width / 2;
      const y = buttonRect.top + buttonRect.height / 2;
      
      Logger.log('ChatButton', 'Detecting background at:', { x, y });
      
      // Create a temporary invisible sampling element
      const sampler = document.createElement('div');
      sampler.style.position = 'fixed';
      sampler.style.left = `${x}px`;
      sampler.style.top = `${y}px`;
      sampler.style.width = '1px';
      sampler.style.height = '1px';
      sampler.style.pointerEvents = 'none';
      sampler.style.zIndex = '-1';
      sampler.style.opacity = '0';
      document.body.appendChild(sampler);
      
      // Use the button's position to find what's underneath
      // We'll lower the button's z-index temporarily
      const originalZIndex = buttonRef.current.style.zIndex;
      buttonRef.current.style.zIndex = '-2';
      
      // Get element under the sampler position
      const elementBelow = document.elementFromPoint(x, y);
      
      // Restore button z-index
      buttonRef.current.style.zIndex = originalZIndex;
      
      // Remove sampler
      document.body.removeChild(sampler);
      
      if (!elementBelow) {
        Logger.log('ChatButton', 'No element found below button');
        return;
      }
      
      Logger.log('ChatButton', 'Element below:', elementBelow.tagName, elementBelow.className);
      
      // Get computed background color
      const computedStyle = window.getComputedStyle(elementBelow);
      let bgColor = computedStyle.backgroundColor;
      
      Logger.log('ChatButton', 'Initial bgColor:', bgColor);
      
      // If transparent, check parent elements
      let currentElement = elementBelow;
      let depth = 0;
      while ((bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') && depth < 10) {
        currentElement = currentElement.parentElement;
        if (!currentElement) {
          // Check HTML element and document
          const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
          Logger.log('ChatButton', 'Checking HTML element:', htmlBg);
          if (htmlBg && htmlBg !== 'rgba(0, 0, 0, 0)' && htmlBg !== 'transparent') {
            bgColor = htmlBg;
            break;
          }
          // Default to white if everything is transparent
          bgColor = 'rgb(255, 255, 255)';
          Logger.log('ChatButton', 'Everything transparent, defaulting to white');
          break;
        }
        bgColor = window.getComputedStyle(currentElement).backgroundColor;
        Logger.log('ChatButton', 'Checking parent:', currentElement.tagName, bgColor);
        depth++;
      }
      
      // Special handling for canvas elements - sample pixel color
      if (elementBelow.tagName === 'CANVAS') {
        try {
          const canvas = elementBelow;
          const rect = canvas.getBoundingClientRect();
          const canvasX = x - rect.left;
          const canvasY = y - rect.top;
          
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            const imageData = ctx.getImageData(canvasX, canvasY, 1, 1);
            const [r, g, b, a] = imageData.data;
            
            // Only use canvas pixel if it's not fully transparent
            if (a > 0) {
              bgColor = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
              Logger.log('ChatButton', 'Sampled canvas pixel:', bgColor);
            }
          }
        } catch (err) {
          Logger.log('ChatButton', 'Canvas sampling failed (CORS or context):', err.message);
        }
      }
      
      // Parse RGB values
      const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        
        // Calculate perceived brightness (0-255)
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        
        Logger.log('ChatButton', 'RGB:', { r, g, b, brightness });
        
        // If brightness > 128, it's a light background
        const isLight = brightness > 128;
        Logger.log('ChatButton', 'Background is:', isLight ? 'LIGHT' : 'DARK');
        setIsLightBackground(isLight);
      } else {
        Logger.log('ChatButton', 'Failed to parse color:', bgColor);
      }
    };
    
    // Debounced detection - waits until dragging stops
    detectionTimeout = setTimeout(() => {
      detectBackgroundColor();
    }, 500);
    
    // Re-detect on scroll or position change (debounced)
    const handleUpdate = () => {
      if (isDragging) return;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        detectBackgroundColor();
      }, 500);
    };
    
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('modelPositionChange', handleUpdate);
    
    return () => {
      clearTimeout(detectionTimeout);
      clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('modelPositionChange', handleUpdate);
    };
  }, [shouldRender, buttonPos.x, buttonPos.y, isDragging, uiConfig?.backgroundDetection?.mode]);

  /**
   * Handle delayed unmount for fade animation
   */
  useEffect(() => {
    if (isVisible && !shouldRender) {
      // Transitioning to visible - mount and trigger fade-in
      setShouldRender(true);
      setIsAppearing(true);
      // Remove appearing class after animation completes
      const timeout = setTimeout(() => setIsAppearing(false), 300);
      return () => clearTimeout(timeout);
    } else if (!isVisible && shouldRender) {
      // Transitioning to hidden - trigger fade-out then unmount
      setIsAppearing(false);
      const timeout = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timeout);
    }
    // No state change if already in correct state
  }, [isVisible, shouldRender]);

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
          Logger.log('ChatButton', 'Loading from last location:', targetPos);
        } else if (preset !== 'last-location') {
          // Use preset position (convert to button position)
          targetPos = getButtonPositionFromPreset(preset);
          Logger.log('ChatButton', 'Loading from preset:', preset, targetPos);
        }
        
        // Bound check
        const buttonSize = 48;
        const boundedX = Math.max(10, Math.min(targetPos.x, window.innerWidth - buttonSize - 10));
        const boundedY = Math.max(10, Math.min(targetPos.y, window.innerHeight - buttonSize - 10));
        const validPos = { x: boundedX, y: boundedY };
        
        setButtonPos(validPos);
        buttonPosRef.current = validPos;
      } catch (err) {
        Logger.error('ChatButton', 'load position failed', err);
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
    const updateFromModel = async (ev) => {
      let modelPos = null;
      if (ev && ev.detail) modelPos = ev.detail;
      else if (positionManagerRef?.current) {
        try {
          modelPos = positionManagerRef.current.getPositionPixels();
        } catch (err) {
          Logger.error('ChatButton', 'getPositionPixels failed', err);
          return;
        }
      } else return;

      try {
        const buttonSize = 48;
        const offsetX = 15;
        const padding = 10;
        
        // Chat icon positioning - at bottom of effectiveHeight (visible area)
        let buttonY = modelPos.y + modelPos.height - buttonSize;
        
        // Desktop mode: Position on right side, but use Electron window bounds
        // Browser mode: Dynamic positioning based on available space
        let buttonX;
        if (isDesktop) {
          buttonX = modelPos.x + modelPos.width + offsetX;
          
          if (desktopAPI && desktopAPI.window) {
            try {
              const electronWindow = await desktopAPI.window.getSize();
              const electronWindowWidth = electronWindow.width;
              const electronWindowHeight = electronWindow.height;
              
              // If button's right edge exceeds Electron window width, reposition
              if (buttonX + buttonSize > electronWindowWidth - padding) {
                buttonX = electronWindowWidth - buttonSize - padding;
                Logger.log('ChatButton', `Button X clipped, repositioned to: ${buttonX} (window width: ${electronWindowWidth})`);
              }
              
              // If button's bottom edge exceeds Electron window height, reposition
              if (buttonY + buttonSize > electronWindowHeight - padding) {
                buttonY = electronWindowHeight - buttonSize - padding;
                Logger.log('ChatButton', `Button Y clipped, repositioned to: ${buttonY} (window height: ${electronWindowHeight})`);
              }
              
              // If button's top edge is above window, reposition
              if (buttonY < padding) {
                buttonY = padding;
                Logger.log('ChatButton', `Button Y above window, repositioned to: ${buttonY}`);
              }
            } catch (err) {
              Logger.error('ChatButton', 'Failed to get Electron window size:', err);
            }
          }
        } else {
          // Browser: Check for overflow and position dynamically
          const rightX = modelPos.x + modelPos.width + offsetX;
          const leftX = modelPos.x - buttonSize - offsetX;
          const windowWidth = window.innerWidth;
          const wouldOverflowRight = rightX + buttonSize > windowWidth - 10;
          const shouldBeOnLeft = wouldOverflowRight || modelPos.x > windowWidth * 0.7;
          buttonX = shouldBeOnLeft ? leftX : rightX;
        }
        
        const newX = Math.round(buttonX);
        const newY = Math.round(buttonY);
        
        if (newX === lastSetPosition.current.x && newY === lastSetPosition.current.y) return;
        
        lastSetPosition.current = { x: newX, y: newY };
        setButtonPos({ x: newX, y: newY });
      } catch (err) {
        Logger.error('ChatButton', 'updateFromModel failed', err);
      }
    };

    window.addEventListener('modelPositionChange', updateFromModel);
    window.addEventListener('resize', updateFromModel);
    return () => {
      window.removeEventListener('modelPositionChange', updateFromModel);
      window.removeEventListener('resize', updateFromModel);
    };
  }, [modelDisabled, positionManagerRef, setButtonPos, desktopAPI]);

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
    if (isChatOpen && boundedY > window.innerHeight - minDistanceFromBottom) {
      boundedY = window.innerHeight - minDistanceFromBottom;
    }
    
    const newPos = { x: boundedX, y: boundedY };
    buttonPosRef.current = newPos;
    
    if (buttonRef.current) {
      buttonRef.current.style.left = `${boundedX}px`;
      buttonRef.current.style.top = `${boundedY}px`;
    }

    if (isChatOpen && !window.buttonDragEventTimeout) {
      window.buttonDragEventTimeout = setTimeout(() => {
        const event = new CustomEvent('chatButtonMoved', { detail: newPos });
        window.dispatchEvent(event);
        window.buttonDragEventTimeout = null;
      }, 16); // ~60fps
    }
  }, [modelDisabled, isDragging, isChatOpen]);

  const handleMouseUp = useCallback(() => {
    if (!modelDisabled || !isDragging) return;

    if (window.buttonDragEventTimeout) {
      clearTimeout(window.buttonDragEventTimeout);
      window.buttonDragEventTimeout = null;
    }
    
    setIsDragging(false);
    
    const finalPos = buttonPosRef.current;
    
    // Update React state to match DOM
    setButtonPos(finalPos);
    
    // Save position if preset is 'last-location
    if (uiConfig.position?.preset === 'last-location') {
      setTimeout(() => {
        Logger.log('ChatButton', 'Saving last location:', finalPos);
        updateUIConfig('position.lastLocation', { 
          x: finalPos.x, 
          y: finalPos.y,
          width: 48,
          height: 48
        });
      }, 100);
    }
    
    // Final position update for ChatContainer
    const event = new CustomEvent('chatButtonMoved', { detail: finalPos });
    window.dispatchEvent(event);
    
    endButtonDrag();
  }, [modelDisabled, isDragging, setButtonPos, endButtonDrag, uiConfig.position?.preset, updateUIConfig]);

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
    if (!shouldRender) {
      Logger.log('ChatButton', 'Skipping drag-drop setup - not rendered');
      return;
    }
    
    Logger.log('ChatButton', 'Drag-drop setup effect running', {
      hasButton: !!buttonRef.current,
      shouldRender
    });
    
    let attached = true;
    
    // Wait a short moment for the element to be in DOM
    const setupTimeout = setTimeout(() => {
      if (!attached) {
        Logger.log('ChatButton', 'Cleanup called before setup completed');
        return;
      }
      
      if (!buttonRef.current) {
        Logger.log('ChatButton', 'Button ref not available');
        return;
      }
      
      Logger.log('ChatButton', 'Setting up drag-drop service');
      
      import('../services/DragDropService').then(({ default: DragDropService }) => {
        if (!attached) {
          Logger.log('ChatButton', 'Cleanup called during async import');
          return;
        }
        const el = buttonRef.current;
        if (!el) {
          Logger.log('ChatButton', 'Button ref lost during async import');
          return;
        }
        
        dragDropServiceRef.current = new DragDropService({ maxImages: 3, maxAudios: 1 });
        dragDropServiceRef.current.attach(el, {
          onSetDragOver: (flag) => setIsDragOverButton(flag),
          onShowError: (err) => Logger.error('ChatButton', 'DragDrop error', err),
          checkVoiceMode: null,
          getCurrentCounts: () => ({ images: 0, audios: 0 }),
          onProcessData: (data) => {
            if (!isChatOpen) handleClick();
            setPendingDropData(data);
          }
        });
      }).catch(err => Logger.error('ChatButton', 'load DragDropService failed', err));
    }, 50); // Short delay for DOM to be ready
    
    return () => { 
      attached = false;
      clearTimeout(setupTimeout);
      Logger.log('ChatButton', 'Cleaning up drag-drop service');
      if (dragDropServiceRef.current) {
        dragDropServiceRef.current.detach();
        dragDropServiceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender]); // Trigger when button actually renders

  /**
   * Unified zoom handler
   * @param {'in' | 'out' | 'reset'} zoomType - Type of zoom operation
   */
  const handleZoom = useCallback((zoomType) => {
    const positionManager = positionManagerRef.current;
    if (!positionManager) return;
    
    const currentSize = positionManager.modelHeightPx || 600;
    const zoomAmount = 50;
    
    // Get preset default size from PositionPresets
    const currentPreset = uiConfig.position?.preset || 'bottom-right';
    const presetConfig = PositionPresets[currentPreset];
    const defaultHeight = presetConfig?.modelSize?.height || 500;
    const defaultWidth = presetConfig?.modelSize?.width || 300;
    
    let newSize, newWidth;
    
    switch (zoomType) {
      case 'in':
        newSize = currentSize + zoomAmount;
        newWidth = newSize * 0.6;
        Logger.log('ChatButton', `Zooming in: ${currentSize}px → ${newSize}px`);
        break;
      case 'out':
        if (currentSize <= defaultHeight) {
          Logger.log('ChatButton', 'Already at default size, cannot zoom out');
          return;
        }
        newSize = Math.max(defaultHeight, currentSize - zoomAmount);
        newWidth = Math.max(defaultWidth, newSize * 0.6);
        Logger.log('ChatButton', `Zooming out: ${currentSize}px → ${newSize}px`);
        break;
      case 'reset':
        newSize = defaultHeight;
        newWidth = defaultWidth;
        Logger.log('ChatButton', 'Resetting zoom to default');
        break;
      default:
        Logger.warn('ChatButton', `Unknown zoom type: ${zoomType}`);
        return;
    }
    
    updateUIConfig('modelSizePx', zoomType === 'reset' ? null : {
      width: newWidth,
      height: newSize
    });
    
    if (isDesktop && desktopAPI && desktopAPI.window) {
      Logger.log('ChatButton', `Requesting Electron window resize for model size: ${newWidth}x${newSize}`);
      desktopAPI.window.updateWindowSizeForZoom(newWidth, newSize).then(() => {
        return desktopAPI.window.getSize();
      }).then(windowSize => {
        Logger.log('ChatButton', `Window resized to: ${windowSize.width}x${windowSize.height}`);
        
        const event = new CustomEvent('updateCanvasSize', {
          detail: { 
            width: windowSize.width, 
            height: windowSize.height,
            modelWidth: newWidth,
            modelHeight: newSize
          }
        });
        window.dispatchEvent(event);
        
        setTimeout(() => {
          if (!positionManager) return;
          
          const oldCanvasWidth = positionManager.canvasWidth;
          const oldCanvasHeight = positionManager.canvasHeight;
          const oldPosX = positionManager.positionX;
          const oldPosY = positionManager.positionY;
          const oldModelHeight = positionManager.effectiveHeightPx;
          
          positionManager.updateCanvasDimensions();
          
          if (zoomType === 'reset') {
            Logger.log('ChatButton', 'Resetting to preset position');
            positionManager.applyPreset(currentPreset, {
              modelSizePx: { width: newWidth, height: newSize }
            });
          } else {
            const canvasWidthDelta = positionManager.canvasWidth - oldCanvasWidth;
            const canvasHeightDelta = positionManager.canvasHeight - oldCanvasHeight;
            
            const modelHeightDelta = newSize - oldModelHeight;
            
            const scaleFactorHeight = 0.75;
            const compensationMultiplier = (1 - scaleFactorHeight) * 100;
            
            const newPosX = oldPosX + canvasWidthDelta;
            const newPosY = oldPosY + canvasHeightDelta - (modelHeightDelta * compensationMultiplier);
            
            positionManager.positionX = newPosX;
            positionManager.positionY = newPosY;
            positionManager.modelHeightPx = newSize;
            positionManager.modelWidthPx = newWidth;
            positionManager.effectiveHeightPx = newSize;
            
            positionManager.updateCameraFrustum();
          }
        }, 300); 
      }).catch(err => {
        Logger.warn('ChatButton', 'Failed to update window/canvas size:', err);
      });
    } else {
      if (zoomType === 'reset') {
        positionManager.applyPreset(currentPreset, {
          modelSizePx: { width: newWidth, height: newSize }
        });
      } else {
        const oldPosX = positionManager.positionX;
        const oldPosY = positionManager.positionY;
        const oldModelWidth = positionManager.modelWidthPx;
        const oldModelHeight = positionManager.modelHeightPx;
        
        const widthDelta = newWidth - oldModelWidth;
        const heightDelta = newSize - oldModelHeight;
        
        const newPosX = oldPosX - (widthDelta / 2);
        const newPosY = oldPosY - (heightDelta / 2);
        
        positionManager.positionX = newPosX;
        positionManager.positionY = newPosY;
        positionManager.modelHeightPx = newSize;
        positionManager.modelWidthPx = newWidth;
        positionManager.effectiveHeightPx = newSize;
      }
      
      positionManager.updateCameraFrustum();
    }
  }, [positionManagerRef, updateUIConfig, desktopAPI, uiConfig.position]);

  const isAtDefaultSize = useCallback(() => {
    const positionManager = positionManagerRef.current;
    if (!positionManager) return true;
    
    if (!uiConfig.modelSizePx) return true;
    
    const currentPreset = uiConfig.position?.preset || 'bottom-right';
    const presetConfig = PositionPresets[currentPreset];
    const defaultHeight = presetConfig?.modelSize?.height || 500;
    
    const currentSize = positionManager.modelHeightPx || defaultHeight;
    return currentSize <= defaultHeight;
  }, [positionManagerRef, uiConfig.modelSizePx, uiConfig.position]);

  const handleZoomIn = useCallback(() => handleZoom('in'), [handleZoom]);
  const handleZoomOut = useCallback(() => handleZoom('out'), [handleZoom]);
  const handleZoomReset = useCallback(() => handleZoom('reset'), [handleZoom]);

  const handleAutoPlayToggle = useCallback(async () => {
    try {
      if (isAutoPlayActive) {
        emotePlayerService.stopAutoPlay();
        setIsAutoPlayActive(false);
        Logger.log('ChatButton', 'Auto-play stopped');
      } else {
        const emoteIds = emotes.map(e => e.id);
        await emotePlayerService.startAutoPlay(emoteIds);
        setIsAutoPlayActive(true);
        setIsEmotePanelOpen(false);
        Logger.log('ChatButton', 'Auto-play started');
      }
    } catch (err) {
      Logger.error('ChatButton', 'Failed to toggle auto-play:', err);
    }
  }, [isAutoPlayActive, emotes]);

  const handleModelSelect = useCallback(async (modelId) => {
    try {
      if (modelId === null) {
        await modelStorageService.clearAllDefaults();
      } else {
        await modelStorageService.setDefaultModel(modelId);
      }
      setSelectedModelId(modelId);
      setIsAvatarPanelOpen(false);
      Logger.log('ChatButton', `Model ${modelId || 'default'} selected, reloading page...`);
      window.location.reload();
    } catch (err) {
      Logger.error('ChatButton', 'Failed to select model:', err);
    }
  }, []);

  if (!shouldRender) return null;

  const TOTAL_BUTTON_OFFSET = 224;
  
  const emotePanelWidth = 125;
  // Add extra height for Auto button (43px) when emotes exist
  const emotePanelHeight = Math.min(emotes.length > 0 ? (emotes.length + 1) * 43 : 43, 300);
  const emotePanelGap = 8;
  const buttonWidth = 48;

  const avatarPanelWidth = 125;
  // Add 1 for default model
  const avatarPanelHeight = Math.min((models.length + 1) * 43, 300);
  const avatarPanelGap = 8;
  
  let emotePanelLeft, emotePanelTop;
  let avatarPanelLeft, avatarPanelTop;
  
  if (isAndroid) {
    const androidButtonX = 20;
    const androidButtonY = window.innerHeight - 20 - buttonWidth;
    const androidButtonOffset = TOTAL_BUTTON_OFFSET;
    
    emotePanelLeft = androidButtonX;
    emotePanelTop = androidButtonY - androidButtonOffset - emotePanelHeight - emotePanelGap;

    avatarPanelLeft = androidButtonX;
    avatarPanelTop = androidButtonY - androidButtonOffset - avatarPanelHeight - avatarPanelGap;
  } else if (isDesktop) {
    emotePanelLeft = buttonPos.x - emotePanelWidth - emotePanelGap;
    emotePanelTop = buttonPos.y - emotePanelHeight - emotePanelGap;

    avatarPanelLeft = buttonPos.x - avatarPanelWidth - avatarPanelGap;
    avatarPanelTop = buttonPos.y - avatarPanelHeight - avatarPanelGap;
  } else {
    if (isLeftSide) {
      emotePanelLeft = buttonPos.x;
      avatarPanelLeft = buttonPos.x;
    } else {
      emotePanelLeft = buttonPos.x - emotePanelWidth - emotePanelGap;
      avatarPanelLeft = buttonPos.x - avatarPanelWidth - avatarPanelGap;
    }
    emotePanelTop = buttonPos.y - TOTAL_BUTTON_OFFSET - emotePanelHeight - emotePanelGap;
    avatarPanelTop = buttonPos.y - TOTAL_BUTTON_OFFSET - avatarPanelHeight - avatarPanelGap;
  }

  const androidPosition = isAndroid ? {
    left: '20px',
    bottom: '20px',
    top: 'auto',
  } : {
    left: `${buttonPos.x}px`,
    top: `${buttonPos.y - TOTAL_BUTTON_OFFSET}px`,
  };

  return (
    <>
    {/* Emote List */}
    {isEmotePanelOpen && (
      <div
        style={{
          left: `${emotePanelLeft}px`,
          top: `${emotePanelTop}px`,
          zIndex: isAndroid ? 201 : 10001,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          scrollSnapType: 'y mandatory',
          ...(isDesktop && emotes.length > 7 ? {
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)'
          } : {})
        }}
        className="fixed w-[125px] max-h-[300px] overflow-y-auto py-1"
      >
        <style>{`
          div::-webkit-scrollbar { display: none; }
        `}</style>
        {emotes.length === 0 ? (
          <div 
            style={{ scrollSnapAlign: 'center' }} 
            className={`glass-button flex items-center justify-center px-4 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[12px] rounded-[17.5px] whitespace-nowrap ${
              isLightBackground 
                ? 'glass-button-dark' 
                : ''
            } backdrop-blur-[10px] text-white/50 cursor-default pointer-events-none`}
          >
            <span className="truncate">No emotes</span>
          </div>
        ) : (
          <>
            {/* Auto-play button */}
            <button
              onClick={handleAutoPlayToggle}
              style={{ scrollSnapAlign: 'center' }}
              className={`glass-button flex items-center justify-center gap-2 px-4 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[15px] rounded-[17.5px] whitespace-nowrap ${
                isLightBackground 
                  ? 'glass-button-dark' 
                  : ''
              } backdrop-blur-[10px] ${isAutoPlayActive ? 'ring-2 ring-white/50' : ''}`}
              title={isAutoPlayActive ? 'Stop auto-play' : 'Start auto-play'}
            >
              <svg 
                width="14" 
                height="14" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className={isAutoPlayActive ? 'animate-[spin_2s_linear_infinite]' : ''}
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
              <span className="truncate">Auto</span>
            </button>
            
            {/* Emote list */}
            {emotes.map((emote, index) => (
              <button
                key={emote.id}
                onClick={async () => {
                  try {
                    // Stop auto-play if active
                    if (isAutoPlayActive) {
                      emotePlayerService.stopAutoPlay();
                      setIsAutoPlayActive(false);
                    }
                    await emotePlayerService.playEmote(emote.id);
                    setIsEmotePanelOpen(false);
                  } catch (err) {
                    Logger.error('ChatButton', 'Failed to play emote:', err);
                  }
                }}
                style={{ scrollSnapAlign: 'center' }}
                className={`glass-button flex items-center justify-center gap-2 px-4 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[15px] rounded-[17.5px] whitespace-nowrap ${
                  isLightBackground 
                    ? 'glass-button-dark' 
                    : ''
                } backdrop-blur-[10px] ${currentPlayingEmoteId === emote.id ? 'ring-2 ring-white/50' : ''}`}
                title={emote.name}
              >
                {currentPlayingEmoteId === emote.id && (
                  <svg 
                    width="14" 
                    height="14" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    className="animate-[spin_2s_linear_infinite] flex-shrink-0"
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                )}
                <span className="truncate">{emote.name}</span>
              </button>
            ))}
          </>
        )}
      </div>
    )}

    {/* Avatar List */}
    {isAvatarPanelOpen && (
      <div
        style={{
          left: `${avatarPanelLeft}px`,
          top: `${avatarPanelTop}px`,
          zIndex: isAndroid ? 201 : 10001,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          scrollSnapType: 'y mandatory',
          ...(isDesktop && models.length > 6 ? {
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 50px, black calc(100% - 50px), transparent 100%)'
          } : {})
        }}
        className="fixed w-[125px] max-h-[300px] overflow-y-auto py-1"
      >
        <style>{`
          div::-webkit-scrollbar { display: none; }
        `}</style>
        {/* Default Model */}
        <button
          onClick={() => handleModelSelect(null)}
          style={{ scrollSnapAlign: 'center' }}
          className={`glass-button flex items-center justify-start gap-2 px-3 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[13px] rounded-[17.5px] whitespace-nowrap ${
            isLightBackground 
              ? 'glass-button-dark' 
              : ''
          } backdrop-blur-[10px] ${selectedModelId === null ? 'ring-2 ring-white/50' : ''}`}
          title="VAssist Default"
        >
          {selectedModelId === null && (
            <Icon name="check" size={14} className="flex-shrink-0" />
          )}
          <span className="truncate flex-1">VAssist Default</span>
        </button>

        {/* Custom Models */}
        {models.map((model) => (
          <button
            key={model.id}
            onClick={() => handleModelSelect(model.id)}
            style={{ scrollSnapAlign: 'center' }}
            className={`glass-button flex items-center justify-start gap-2 px-3 transition-all duration-200 overflow-hidden h-[35px] min-h-[35px] w-[125px] mb-2 text-[13px] rounded-[17.5px] whitespace-nowrap ${
              isLightBackground 
                ? 'glass-button-dark' 
                : ''
            } backdrop-blur-[10px] ${selectedModelId === model.id ? 'ring-2 ring-white/50' : ''}`}
            title={model.name}
          >
            {selectedModelId === model.id && (
              <Icon name="check" size={14} className="flex-shrink-0" />
            )}
            <span className="truncate flex-1">{model.name}</span>
          </button>
        ))}
      </div>
    )}

    <div
      style={{
        ...androidPosition,
        zIndex: isAndroid ? 200 : 10000,
      }}
      className="fixed flex flex-col gap-2 items-center"
    >

      {/* Reload Button */}
      <button
        onClick={() => window.location.reload()}
        className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform ${isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30'} ${
          isAppearing ? 'animate-fade-in' : (!isVisible ? 'animate-fade-out' : '')
        }`}
        title="Reload Page"
      >
        <Icon 
          name="refresh" 
          size={24} 
          className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} drop-shadow-lg`}
        />
      </button>

      {/* Emote Button */}
      <button
        onClick={() => {
          if (isAvatarPanelOpen) setIsAvatarPanelOpen(false);
          setIsEmotePanelOpen(!isEmotePanelOpen);
        }}
        className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform ${isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30'} ${
          isAppearing ? 'animate-fade-in' : (!isVisible ? 'animate-fade-out' : '')
        }`}
        title="Emotes"
      >
        <Icon 
          name="music" 
          size={24} 
          className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} drop-shadow-lg ${isEmotePlaying ? 'animate-[spin_2s_linear_infinite]' : ''}`}
        />
      </button>

      {/* Avatar Button */}
      <button
        onClick={() => {
          if (isEmotePanelOpen) setIsEmotePanelOpen(false);
          setIsAvatarPanelOpen(!isAvatarPanelOpen);
        }}
        className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform ${isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30'} ${
          isAppearing ? 'animate-fade-in' : (!isVisible ? 'animate-fade-out' : '')
        }`}
        title="Change Avatar"
      >
        <Icon 
          name="user" 
          size={24} 
          className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} drop-shadow-lg`}
        />
      </button>

      {/* Zoom Control */}
      <ZoomControl
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleZoomReset}
        isZoomOutDisabled={isAtDefaultSize()}
        isLeftSide={isLeftSide}
        isLightBackground={isLightBackground}
        isVisible={isVisible}
      />

      {/* Chat Button */}
      <button
        ref={buttonRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        style={{
          cursor: modelDisabled ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
          willChange: isDragging ? 'left, top' : 'auto',
          transition: isDragging ? 'none' : undefined,
        }}
        className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-12 h-12 rounded-full flex items-center justify-center ${
          modelDisabled ? '' : 'hover:scale-110 active:scale-95 transition-transform'
        } ${isDragOverButton ? 'ring-2 ring-blue-400' : ''} ${
          isAppearing ? 'animate-fade-in' : (!isVisible ? 'animate-fade-out' : '')
        } ${isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30'}`}
        title={modelDisabled ? (isChatOpen ? 'Click to close chat' : 'Drag to reposition or click to chat') : (isChatOpen ? 'Click to close chat' : 'Chat with assistant')}
      >
        <Icon 
          name={isDragOverButton ? 'attachment' : (isChatOpen ? 'close' : 'ai')} 
          size={24} 
          className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} drop-shadow-lg`}
        />
      </button>
    </div>
    </>
  );
};

export default ChatButton;
