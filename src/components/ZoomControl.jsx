/**
 * @fileoverview Zoom control component for model camera zoom
 */

import { useState } from 'react';
import { Icon } from './icons';

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
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="flex flex-col gap-2 items-center relative">
      {/* Main Zoom Button */}
      <button
        onClick={handleToggle}
        className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform ${isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30'} ${
          !isVisible ? 'animate-fade-out' : ''
        }`}
        title="Zoom Control"
      >
        <Icon 
          name="zoomIn" 
          size={24} 
          className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} drop-shadow-lg`}
        />
      </button>

      {/* Expanded Controls - positioned beside zoom button */}
      {isExpanded && (
        <div 
          className={`flex ${isLeftSide ? 'flex-row-reverse' : 'flex-row'} gap-2 absolute`}
          style={{ 
            top: 0,
            [isLeftSide ? 'right' : 'left']: '-171px'
          }}
        >
          {/* Zoom In */}
          <button
            onClick={() => {
              onZoomIn();
            }}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all ${isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30'} animate-fade-in`}
            title="Zoom In"
          >
            <Icon 
              name="plus" 
              size={24} 
              className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} drop-shadow-lg`}
            />
          </button>

          {/* Reset */}
          <button
            onClick={() => {
              onReset();
            }}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all ${isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30'} animate-fade-in`}
            title="Reset Zoom"
            style={{ animationDelay: '50ms' }}
          >
            <Icon 
              name="refresh" 
              size={24} 
              className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} drop-shadow-lg`}
            />
          </button>

          {/* Zoom Out */}
          <button
            onClick={() => {
              if (!isZoomOutDisabled) onZoomOut();
            }}
            disabled={isZoomOutDisabled}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-12 h-12 rounded-full flex items-center justify-center transition-all animate-fade-in ${
              isZoomOutDisabled 
                ? 'opacity-40 cursor-not-allowed' 
                : `hover:scale-110 active:scale-95 ${isLightBackground ? 'hover:bg-black/30' : 'hover:bg-white/30'}`
            }`}
            title={isZoomOutDisabled ? "At minimum size" : "Zoom Out"}
            style={{ animationDelay: '100ms' }}
          >
            <Icon 
              name="minus" 
              size={24} 
              className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} drop-shadow-lg`}
            />
          </button>
        </div>
      )}
    </div>
  );
};

export default ZoomControl;
