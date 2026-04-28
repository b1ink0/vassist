/**
 * @fileoverview Zoom control component for model camera zoom
 */

import { useState } from 'react';
import { Icon } from '../icons';
import { Button } from '../ui';
import { cn } from '../../utils/cn';

interface ZoomControlProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  isZoomOutDisabled?: boolean;
  isLeftSide?: boolean;
  isLightBackground?: boolean;
  isVisible?: boolean;
}

/**
 * Zoom control with expand/collapse functionality
 * Shows zoom in/reset/zoom out buttons when expanded
 * 
 * @param {Object} props
 * @param {Function} props.onZoomIn - Zoom in handler
 * @param {Function} props.onZoomOut - Zoom out handler
 * @param {Function} props.onReset - Reset zoom handler
 * @param {boolean} props.isLeftSide - Whether buttons are on left side of model
 * @param {boolean} props.isLightBackground - Light background detection
 * @param {boolean} props.isVisible - Visibility state for fade animation
 * @returns {JSX.Element}
 */
const ZoomControl = ({ 
  onZoomIn, 
  onZoomOut, 
  onReset,
  isZoomOutDisabled = false,
  isLeftSide = false, 
  isLightBackground = false,
  isVisible = true 
}: ZoomControlProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="flex flex-col gap-2 items-center relative">
      {/* Main Zoom Button */}
      <Button
        onClick={handleToggle}
        variant={isLightBackground ? 'dark' : 'default'}
        className={cn('w-12 h-12 rounded-full hover:scale-110 active:scale-95 transition-transform', isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30', !isVisible && 'animate-fade-out')}
        title="Zoom Control"
      >
        <Icon 
          name="zoomIn" 
          size={24} 
          className={cn(isLightBackground ? 'glass-text' : 'glass-text-black', 'drop-shadow-lg')}
        />
      </Button>

      {/* Expanded Controls - positioned beside zoom button */}
      {isExpanded && (
        <div 
          className={cn('flex', isLeftSide ? 'flex-row-reverse' : 'flex-row', 'gap-2 absolute')}
          style={{ 
            top: 0,
            [isLeftSide ? 'right' : 'left']: '-171px'
          }}
        >
          {/* Zoom In */}
          <Button
            onClick={() => {
              onZoomIn();
            }}
            variant={isLightBackground ? 'dark' : 'default'}
            className={cn('w-12 h-12 rounded-full hover:scale-110 active:scale-95 transition-all', isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30', 'animate-fade-in')}
            title="Zoom In"
          >
            <Icon 
              name="plus" 
              size={24} 
              className={cn(isLightBackground ? 'glass-text' : 'glass-text-black', 'drop-shadow-lg')}
            />
          </Button>

          {/* Reset */}
          <Button
            onClick={() => {
              onReset();
            }}
            variant={isLightBackground ? 'dark' : 'default'}
            className={cn('w-12 h-12 rounded-full hover:scale-110 active:scale-95 transition-all', isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30', 'animate-fade-in')}
            title="Reset Zoom"
            style={{ animationDelay: '50ms' }}
          >
            <Icon 
              name="refresh" 
              size={24} 
              className={cn(isLightBackground ? 'glass-text' : 'glass-text-black', 'drop-shadow-lg')}
            />
          </Button>

          {/* Zoom Out */}
          <Button
            onClick={() => {
              if (!isZoomOutDisabled) onZoomOut();
            }}
            disabled={isZoomOutDisabled}
            variant={isLightBackground ? 'dark' : 'default'}
            className={cn('w-12 h-12 rounded-full transition-all animate-fade-in', isZoomOutDisabled ? 'opacity-40 cursor-not-allowed' : cn('hover:scale-110 active:scale-95', isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30'))}
            title={isZoomOutDisabled ? "At minimum size" : "Zoom Out"}
            style={{ animationDelay: '100ms' }}
          >
            <Icon 
              name="minus" 
              size={24} 
              className={cn(isLightBackground ? 'glass-text' : 'glass-text-black', 'drop-shadow-lg')}
            />
          </Button>
        </div>
      )}
    </div>
  );
};

export default ZoomControl;
