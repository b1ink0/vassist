/**
 * @fileoverview Container component with smooth expand/collapse animation.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
  type ReactNode,
  type TransitionEvent,
} from 'react';
import { cn } from '../../utils/cn';

type StreamingSpeed = 'fast' | 'normal' | 'slow';
type StreamingVariant = 'container' | 'panel';

interface StreamingContainerProps {
  children: ReactNode;
  active?: boolean;
  autoActivate?: boolean;
  speed?: StreamingSpeed;
  variant?: StreamingVariant;
  disabled?: boolean;
  onExpand?: (() => void) | null;
  onCollapse?: (() => void) | null;
  className?: string;
  style?: CSSProperties;
}

/**
 * Container with streaming expand/collapse animation.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child content
 * @param {boolean} props.active - Whether container is active
 * @param {boolean} props.autoActivate - Auto-activate when children exist
 * @param {string} props.speed - Animation speed: 'fast', 'normal', 'slow'
 * @param {string} props.variant - Variant style: 'container', 'panel'
 * @param {boolean} props.disabled - Disable animation
 * @param {Function} props.onExpand - Callback when expansion completes
 * @param {Function} props.onCollapse - Callback when collapse completes
 * @param {string} props.className - Additional CSS classes
 * @param {Object} props.style - Additional inline styles
 * @returns {JSX.Element} Streaming container component
 */
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
  style, // Additional inline styles
}: StreamingContainerProps) => {
  const [isActive, setIsActive] = useState(active);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const handleTransitionEnd = useCallback((e: TransitionEvent<HTMLDivElement>) => {
    // Only handle our own transition, not children's
    if (e.target !== containerRef.current) return;
    
    // Check if it's the grid-template-rows transition
    if (e.propertyName === 'grid-template-rows') {
      // Trigger appropriate callback
      if (isActive && typeof onExpand === 'function') {
        onExpand();
      } else if (!isActive && typeof onCollapse === 'function') {
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
  const getContainerClass = (): string => {
    const baseClass = variant === 'panel' ? 'streaming-panel' : 'streaming-container';
    const speedSuffix = speed === 'fast' ? '-fast' : speed === 'slow' ? '-slow' : '';
    return `${baseClass}${speedSuffix}`;
  };

  const getContentClass = (): string => {
    return variant === 'panel' ? 'streaming-panel-content' : 'streaming-content';
  };

  // If disabled, render children without animation wrapper
  if (disabled) {
    return <div className={className} style={style}>{children}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={cn(getContainerClass(), isActive && 'streaming-active', className)}
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
