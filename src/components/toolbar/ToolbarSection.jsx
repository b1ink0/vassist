/**
 * ToolbarSection Component
 * 
 * Expandable section for AI Toolbar with:
 * - Main button with sub-buttons
 * - Auto-expand on hover
 * - Stay expanded during loading
 * - Auto-collapse when not needed
 * - Optional separator after section
 */

import { useState, useEffect } from 'react';
import ToolbarButton from './ToolbarButton';

const ToolbarSection = ({
  mainButton,
  subButtons = [],
  isLoading = false,
  showSeparator = true,
  isLightBackground = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine if section should be expanded
  useEffect(() => {
    // Check if any sub-button is loading (not the main button)
    let anySubButtonLoading = false;
    if (isLoading && subButtons && subButtons.length > 0) {
      anySubButtonLoading = subButtons.some(btn => btn.isLoading);
    }
    
    // Keep expanded if:
    // 1. User is hovering
    // 2. Any sub-button in this section is loading
    const shouldExpand = isHovered || anySubButtonLoading;
    setIsExpanded(shouldExpand);
  }, [isHovered, isLoading, subButtons]);

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // Track which button is hovered to prevent main button from expanding
  const [hoveredSubButton, setHoveredSubButton] = useState(false);

  const handleMainButtonMouseEnter = (e) => {
    if (!hoveredSubButton) {
      e.currentTarget.dataset.mainHovered = 'true';
    }
  };

  const handleMainButtonMouseLeave = (e) => {
    e.currentTarget.dataset.mainHovered = 'false';
  };

  // Calculate max width for sub-buttons container
  const getSubButtonsMaxWidth = () => {
    if (!subButtons || subButtons.length === 0) return '0';
    // Calculate based on actual button widths
    // Each button: min-width 32px (8 * 4 = min-w-8) + padding (8px * 2) + label width + gap
    // Use largest maxLabelWidth from sub-buttons
    const maxLabelWidth = Math.max(...subButtons.map(btn => {
      const width = btn.maxLabelWidth || '100px';
      return parseInt(width);
    }));
    // Per button: 48px base + maxLabelWidth, plus 2px gap between buttons
    const totalWidth = subButtons.length * (48 + maxLabelWidth) + (subButtons.length - 1) * 2;
    return `${totalWidth}px`;
  };

  return (
    <div 
      className="flex items-center gap-0.5"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main Button */}
      <ToolbarButton
        {...mainButton}
        isLightBackground={isLightBackground}
        onMouseEnterButton={handleMainButtonMouseEnter}
        onMouseLeaveButton={handleMainButtonMouseLeave}
      />
      
      {/* Sub-buttons container */}
      {subButtons && subButtons.length > 0 && (
        <div 
          className="flex items-center gap-0.5 overflow-hidden transition-all duration-300 ease-in-out"
          style={{
            maxWidth: isExpanded ? getSubButtonsMaxWidth() : '0',
            opacity: isExpanded ? 1 : 0,
          }}
        >
          {subButtons.map((button, index) => (
            <ToolbarButton
              key={index}
              {...button}
              isLightBackground={isLightBackground}
              onMouseEnterButton={() => setHoveredSubButton(true)}
              onMouseLeaveButton={() => setHoveredSubButton(false)}
            />
          ))}
        </div>
      )}
      
      {/* Separator after sub-buttons */}
      {showSeparator && subButtons && subButtons.length > 0 && (
        <div 
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{
            maxWidth: isExpanded ? '20px' : '0',
            opacity: isExpanded ? 1 : 0,
          }}
        >
          <div className="w-px h-6 bg-white/20 mx-1"></div>
        </div>
      )}
    </div>
  );
};

export default ToolbarSection;
