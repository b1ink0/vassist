import React from 'react';
import { iconMap } from './iconMap.jsx';
import { getIconColor } from './iconColors.js';
import { useApp } from '../../contexts/AppContext';
import Logger from '../../services/Logger';

/**
 * Universal Icon Component (Heroicons)
 * 
 * Usage:
 * <Icon name="close" size={24} className="text-white" />
 * <Icon name="microphone" size={16} />
 * <Icon name="send" size={16} context="toolbar" />
 * 
 * @param {string} name - Icon name from iconMap
 * @param {number} size - Icon size in pixels (default: 16)
 * @param {string} className - Additional CSS classes
 * @param {string} context - Icon context ('toolbar', 'chat', 'general') for conditional coloring
 * @param {object} style - Inline styles
 */
const Icon = ({ 
  name, 
  size = 16, 
  className = '', 
  context = 'general',
  style = {},
  ...props 
}) => {
  const { uiConfig } = useApp();
  const IconComponent = iconMap[name];

  if (!IconComponent) {
    Logger.warn('other', `Icon "${name}" not found in iconMap`);
    return null;
  }

  const enableColored = uiConfig?.enableColoredIcons || false;
  const toolbarOnly = uiConfig?.enableColoredIconsToolbarOnly || false;
  
  const shouldUseColor = enableColored && (!toolbarOnly || context === 'toolbar');
  
  const iconColor = getIconColor(name, shouldUseColor);
  
  const hasCustomColor = className.includes('text-');
  const finalClassName = hasCustomColor 
    ? `icon icon-${name} ${className}` 
    : `icon icon-${name} ${iconColor} ${className}`;

  return (
    <IconComponent
      className={finalClassName}
      style={{
        width: size,
        height: size,
        display: 'block',
        flexShrink: 0,
        ...style
      }}
      {...props}
    />
  );
};

export default Icon;
