/**
 * StreamingContainer Component
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const StreamingContainer = ({
  children,
  active = false,
  autoActivate = true, // Auto-activate when children exist
  speed = 'normal', // 'fast' | 'normal' | 'slow'
  variant = 'container', // 'container' | 'panel'
  disabled = false, // Completely disable animation - show content immediately
  onExpand = null, // Callback when expansion completes
  onCollapse = null, // Callback when collapse completes
  className = '', // Additional CSS classes
  style = {}, // Additional inline styles
}) => {
  const [isActive, setIsActive] = useState(active);
  const containerRef = useRef(null);
  const timeoutRef = useRef(null);

  /**
   * Determine if container should be active
   */
  useEffect(() => {
    if (autoActivate) {
      // Auto-activate if children exist
      const shouldActivate = !!children;
      setIsActive(shouldActivate);
    } else {
      // Use explicit active prop
      setIsActive(active);
    }
  }, [active, autoActivate, children]);

  /**
   * Handle transition end - mark as complete and trigger callbacks
   */
  const handleTransitionEnd = useCallback((e) => {
    // Only handle our own transition, not children's
    if (e.target !== containerRef.current) return;
    
    // Check if it's the grid-template-rows transition
    if (e.propertyName === 'grid-template-rows') {
      // Trigger appropriate callback
      if (isActive && onExpand) {
        onExpand();
      } else if (!isActive && onCollapse) {
        onCollapse();
      }
      
      // Remove will-change after animation completes (performance optimization)
      if (containerRef.current) {
        timeoutRef.current = setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.classList.add('streaming-complete');
          }
        }, 100);
      }
    }
  }, [isActive, onExpand, onCollapse]);

  /**
   * Reset completion state when active changes
   */
  useEffect(() => {
    if (isActive && containerRef.current) {
      containerRef.current.classList.remove('streaming-complete');
    }
  }, [isActive]);

  /**
   * Cleanup
   */
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  /**
   * Determine CSS class based on variant and speed
   */
  const getContainerClass = () => {
    const baseClass = variant === 'panel' ? 'streaming-panel' : 'streaming-container';
    const speedSuffix = speed === 'fast' ? '-fast' : speed === 'slow' ? '-slow' : '';
    return `${baseClass}${speedSuffix}`;
  };

  const getContentClass = () => {
    return variant === 'panel' ? 'streaming-panel-content' : 'streaming-content';
  };

  // If disabled, render children without animation wrapper
  if (disabled) {
    return <div className={className} style={style}>{children}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={`${getContainerClass()} ${isActive ? 'streaming-active' : ''} ${className}`}
      style={style}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className={getContentClass()}>
        {children}
      </div>
    </div>
  );
};

export default StreamingContainer;
