import React from 'react';
import { iconMap } from './iconMap.jsx';
import { getIconColor } from './iconColors.js';
import { useApp } from '../../contexts/AppContext';

/**
 * Universal Icon Component
 * 
 * Usage:
 * <Icon name="close" size={24} className="text-white" />
 * <Icon name="microphone" size={16} />
 * <Icon name="send" size={16} context="toolbar" />
 * 
 * @param {string} name - Icon name from iconMap
 * @param {number} size - Icon size in pixels (default: 16)
 * @param {string} className - Additional CSS classes
 * @param {number} strokeWidth - Stroke width for outline icons (default: 3)
 * @param {string} context - Icon context ('toolbar', 'chat', 'general') for conditional coloring
 * @param {object} style - Inline styles
 */
const Icon = ({ 
  name, 
  size = 16, 
  className = '', 
  strokeWidth = 3,
  context = 'general',
  style = {},
  ...props 
}) => {
  const { uiConfig } = useApp();
  const IconSVG = iconMap[name];

  if (!IconSVG) {
    console.warn(`Icon "${name}" not found in iconMap`);
    return null;
  }

  // Determine if we should use colored icons
  const enableColored = uiConfig?.enableColoredIcons || false;
  const toolbarOnly = uiConfig?.enableColoredIconsToolbarOnly || false;
  
  // Apply colored icons based on settings and context
  const shouldUseColor = enableColored && (!toolbarOnly || context === 'toolbar');
  
  // Get the appropriate color based on settings
  const iconColor = getIconColor(name, shouldUseColor);
  
  // If className already includes a text-* color class, use that instead
  const hasCustomColor = className.includes('text-');
  const finalClassName = hasCustomColor 
    ? `icon icon-${name} ${className}` 
    : `icon icon-${name} ${iconColor} ${className}`;

  // Clone the icon element and pass props
  return React.cloneElement(IconSVG, {
    width: size,
    height: size,
    className: finalClassName,
    strokeWidth: IconSVG.props?.strokeWidth || strokeWidth,
    style: {
      display: 'block',
      margin: 'auto',
      ...style
    },
    ...props
  });
};

export default Icon;
