/**
 * @fileoverview Hook to handle click-through for transparent areas in desktop mode
 * Similar to CanvasInteractionManager but for Electron windows
 */

import { useEffect, useRef } from 'react';

/**
 * Hook that makes transparent areas click-through in desktop mode
 * Content containers (chat, settings, canvas) capture all events
 */
export function useDesktopClickThrough() {
  const lastMousePosition = useRef({ x: 0, y: 0 });
  const currentState = useRef(true); // true = ignoring mouse events
  const isProcessingUpdate = useRef(false);

  useEffect(() => {
    // Only run in desktop mode
    if (!__DESKTOP_MODE__ || !window.electron?.window?.setIgnoreMouseEvents) {
      return;
    }

    // Start with click-through enabled (transparent areas)
    window.electron.window.setIgnoreMouseEvents(true, { forward: true });

    const checkIfOverContent = (x, y) => {
      const elements = document.elementsFromPoint(x, y);
      
      for (const el of elements) {
        // Skip html, body, and root
        if (el === document.documentElement || 
            el === document.body || 
            el.id === 'root') {
          continue;
        }
        
        // Skip if not an element node
        if (!el.getBoundingClientRect) {
          continue;
        }
        
        // Check if element is fullscreen wrapper (canvas container, etc)
        const rect = el.getBoundingClientRect();
        const isFullScreen = (
          rect.width >= window.innerWidth * 0.95 &&
          rect.height >= window.innerHeight * 0.95
        );
        
        // Canvas is always interactive, skip other fullscreen wrappers
        if (el.tagName === 'CANVAS' || !isFullScreen) {
          return true; // Over content
        }
      }
      
      return false; // Over transparent area
    };

    const updateIgnoreState = (shouldIgnore) => {
      if (isProcessingUpdate.current) return;
      
      if (currentState.current !== shouldIgnore) {
        isProcessingUpdate.current = true;
        currentState.current = shouldIgnore;
        
        window.electron.window.setIgnoreMouseEvents(shouldIgnore, { 
          forward: shouldIgnore 
        }).finally(() => {
          isProcessingUpdate.current = false;
        });
      }
    };

    // Use mouseenter/mouseleave on document.body to detect content
    // These events fire even when setIgnoreMouseEvents is true!
    const handleMouseEnter = (e) => {
      // Update position
      lastMousePosition.current = { x: e.clientX, y: e.clientY };
      
      // Skip if not an element node
      if (!e.target || !e.target.getBoundingClientRect) {
        return;
      }
      
      // Check if we entered actual content (not body/html/root)
      if (e.target !== document.body && 
          e.target !== document.documentElement &&
          e.target.id !== 'root') {
        
        // Check if element is fullscreen wrapper (canvas container, etc)
        const rect = e.target.getBoundingClientRect();
        const isFullScreen = (
          rect.width >= window.innerWidth * 0.95 &&
          rect.height >= window.innerHeight * 0.95
        );
        
        // Canvas is always interactive, skip other fullscreen wrappers
        if (e.target.tagName === 'CANVAS' || !isFullScreen) {
          // Over content - disable click-through
          updateIgnoreState(false);
        }
      }
    };

    const handleMouseLeave = (e) => {
      // Update position
      if (e.clientX !== undefined) {
        lastMousePosition.current = { x: e.clientX, y: e.clientY };
      }
      
      // When leaving an element, check if we're going to body/root (transparent area)
      if (e.relatedTarget === document.body || 
          e.relatedTarget === document.documentElement ||
          e.relatedTarget?.id === 'root' ||
          !e.relatedTarget) {
        // Leaving content - enable click-through
        updateIgnoreState(true);
      }
    };

    const handleMouseMove = (e) => {
      // Track position for periodic check
      lastMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    // Periodic check as fallback (in case mouseleave doesn't fire)
    const checkInterval = setInterval(() => {
      const isOverContent = checkIfOverContent(
        lastMousePosition.current.x, 
        lastMousePosition.current.y
      );
      updateIgnoreState(!isOverContent);
    }, 100); // Check every 100ms

    // Listen on the document with capture phase to catch all elements
    // DON'T use mousemove for state changes - it interferes with text selection
    document.addEventListener('mouseenter', handleMouseEnter, true);
    document.addEventListener('mouseleave', handleMouseLeave, true);
    document.addEventListener('mousemove', handleMouseMove, true);

    return () => {
      clearInterval(checkInterval);
      document.removeEventListener('mouseenter', handleMouseEnter, true);
      document.removeEventListener('mouseleave', handleMouseLeave, true);
      document.removeEventListener('mousemove', handleMouseMove);
      // Restore normal behavior on unmount
      if (window.electron?.window?.setIgnoreMouseEvents) {
        window.electron.window.setIgnoreMouseEvents(false);
      }
    };
  }, []);
}
