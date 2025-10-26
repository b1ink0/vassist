/**
 * ToolbarButton Component
 * 
 * Reusable button for AI Toolbar with:
 * - Hover label expansion
 * - Loading spinner support
 * - Automatic padding adjustment
 * - Icon + label display
 */

import { useRef } from 'react';

const ToolbarButton = ({
  icon,
  loadingIcon = '⏳',
  label,
  onClick,
  disabled = false,
  isLoading = false,
  actionType = 'summarize', // 'summarize', 'translate', 'image', 'chat'
  className = '',
  title = '',
  isLightBackground = false,
  maxLabelWidth = '100px',
  onMouseEnterButton,
  onMouseLeaveButton,
}) => {
  const buttonRef = useRef(null);
  const labelRef = useRef(null);

  const handleMouseEnter = (e) => {
    if (onMouseEnterButton) {
      onMouseEnterButton(e);
    }
    
    const label = labelRef.current;
    const button = buttonRef.current;
    
    if (label && button) {
      label.style.maxWidth = maxLabelWidth;
      button.style.paddingLeft = '0.75rem';
      button.style.paddingRight = '0.75rem';
    }
  };

  const handleMouseLeave = (e) => {
    if (onMouseLeaveButton) {
      onMouseLeaveButton(e);
    }
    
    // Don't collapse if loading (so spinner stays visible)
    if (isLoading) return;
    
    const label = labelRef.current;
    const button = buttonRef.current;
    
    if (label && button) {
      label.style.maxWidth = '0';
      button.style.paddingLeft = '';
      button.style.paddingRight = '';
    }
  };

  // Inline color variant handling based on actionType prop
  const getHoverBgClass = () => {
    const colorMap = {
      'summarize': 'hover:bg-blue-500/20',
      'translate': 'hover:bg-emerald-500/20',
      'image': 'hover:bg-purple-500/20',
      'chat': 'hover:bg-orange-500/20',
    };
    return colorMap[actionType] || 'hover:bg-blue-500/20';
  };

  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        flex items-center justify-center gap-1.5
        border-none text-base
        transition-all duration-300 ease-in-out
        min-w-8 px-2
        h-8 rounded-2xl bg-transparent opacity-80 hover:opacity-100
        ${getHoverBgClass()}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${isLightBackground ? 'text-white' : 'text-white'}
        ${className}
      `}
      title={title}
    >
      <span className={`inline-block transition-opacity duration-200 ${isLoading ? 'animate-spin' : ''}`}>
        {isLoading ? loadingIcon : icon}
      </span>
      <span 
        ref={labelRef}
        className="text-[13px] font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxWidth: isLoading ? maxLabelWidth : '0', opacity: 1 }}
      >
        {label}
      </span>
    </button>
  );
};

export default ToolbarButton;
