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
import { Icon } from '../icons';

const ToolbarButton = ({
  icon,
  loadingIcon = 'spinner',
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
      // Summarize group - Diverse spectrum (blue, orange, purple, green)
      'summarize': 'hover:bg-blue-500/30',
      'summarize-tldr': 'hover:bg-blue-500/30',
      'summarize-headline': 'hover:bg-orange-500/30',
      'summarize-key-points': 'hover:bg-purple-500/30',
      'summarize-teaser': 'hover:bg-emerald-500/30',
      
      // Translate group - Green spectrum (different from summarize)
      'translate': 'hover:bg-teal-500/30',
      'detect-language': 'hover:bg-lime-500/30',
      
      // Image group - Purple/Pink spectrum (warm purples)
      'image': 'hover:bg-violet-500/30',
      'image-describe': 'hover:bg-violet-500/30',
      'image-extract-text': 'hover:bg-fuchsia-500/30',
      'image-identify-objects': 'hover:bg-pink-500/30',
      
      // Dictionary group - Cool spectrum (cyan, indigo, blue variants)
      'dictionary': 'hover:bg-cyan-500/30',
      'dictionary-define': 'hover:bg-cyan-500/30',
      'dictionary-synonyms': 'hover:bg-amber-500/30',
      'dictionary-antonyms': 'hover:bg-rose-500/30',
      'dictionary-pronunciation': 'hover:bg-indigo-500/30',
      'dictionary-examples': 'hover:bg-lime-500/30',
      
      // Improve group - Rainbow spectrum (maximum variety)
      'improve': 'hover:bg-rose-500/30',
      'improve-grammar': 'hover:bg-rose-500/30',
      'improve-spelling': 'hover:bg-yellow-500/30',
      'improve-professional': 'hover:bg-emerald-500/30',
      'improve-formal': 'hover:bg-sky-500/30',
      'improve-simplify': 'hover:bg-orange-500/30',
      'improve-expand': 'hover:bg-purple-500/30',
      'improve-concise': 'hover:bg-teal-500/30',
      
      // Rewrite group (same as improve)
      'rewrite': 'hover:bg-rose-500/30',
      'rewrite-grammar': 'hover:bg-rose-500/30',
      'rewrite-spelling': 'hover:bg-yellow-500/30',
      'rewrite-professional': 'hover:bg-emerald-500/30',
      'rewrite-moreFormal': 'hover:bg-sky-500/30',
      'rewrite-moreCasual': 'hover:bg-yellow-500/30',
      'rewrite-shorter': 'hover:bg-orange-500/30',
      'rewrite-longer': 'hover:bg-purple-500/30',
      'rewrite-simplify': 'hover:bg-orange-500/30',
      'rewrite-concise': 'hover:bg-teal-500/30',
      'rewrite-clarity': 'hover:bg-blue-500/30',
      'rewrite-custom': 'hover:bg-violet-500/30',
      
      // Other actions - Unique colors
      'write': 'hover:bg-green-500/30',
      'chat': 'hover:bg-amber-500/30',
      'dictation': 'hover:bg-red-500/30',
      'insert': 'hover:bg-green-500/30',
      'undo': 'hover:bg-slate-500/30',
      'redo': 'hover:bg-blue-500/30',
    };
    return colorMap[actionType] || 'hover:bg-blue-500/30';
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
        <Icon name={isLoading ? loadingIcon : icon} size={16} context="toolbar" />
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
