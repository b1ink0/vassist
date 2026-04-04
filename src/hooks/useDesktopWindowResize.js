/**
 * @fileoverview Hook to resize desktop window based on container size
 */

import { useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import { useDesktop } from '../contexts/DesktopContext';
import { isDesktop, isInputWindow } from '../utils/PlatformUtils';

export function useDesktopWindowResize(containerRef = null, options = {}) {
  const { isChatContainerVisible, positionManagerRef } = useApp();
  const { api } = useDesktop();
  const observerRef = useRef(null);
  
  const {
    minWidth = 400,
    minHeight = 400,
    maxWidth = 800,
    maxHeight = 600,
    padding = 10,
    windowPadding = 16
  } = options;
  
  useEffect(() => {
    if (!isDesktop || !api) return;
    
    if (!isInputWindow) {
      const canvasWidth = positionManagerRef?.current?.canvasWidth || 500;
      const canvasHeight = positionManagerRef?.current?.canvasHeight || 500;
      
      const chatContainerWidth = isChatContainerVisible ? 400 : 0;
      
      const width = canvasWidth + chatContainerWidth + windowPadding;
      const height = canvasHeight + windowPadding;
      
      api.window.setSize(width, height);
      return;
    }
    
    if (!containerRef?.current) return;
    
    const resizeWindow = () => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      let width = Math.ceil(rect.width + padding * 2 + windowPadding);
      let height = Math.ceil(rect.height + padding * 2 + windowPadding);

      width = Math.max(minWidth, Math.min(maxWidth, width));
      height = Math.max(minHeight, Math.min(maxHeight, height));

      api.window.setSize(width, height);
    };
    
    resizeWindow();
    
    observerRef.current = new ResizeObserver(resizeWindow);
    observerRef.current.observe(containerRef.current);
    
    return () => {
      observerRef.current?.disconnect();
    };
  }, [isChatContainerVisible, api, containerRef, minWidth, minHeight, maxWidth, maxHeight, padding, windowPadding]);
}
