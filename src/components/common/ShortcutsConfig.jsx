/**
 * @fileoverview Shared Keyboard Shortcuts configuration component.
 * Handles keyboard shortcut recording and management.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Icon } from '../icons';
import Toggle from './Toggle';

/**
 * Formats key combination for display.
 * 
 * @param {string} combo - Key combination string (e.g., 'Ctrl+Shift+C')
 * @returns {string} Formatted key combination
 */
const formatKeyCombo = (combo) => {
  if (!combo) return 'Not set';
  
  // Standardize separator
  const keys = combo.split('+').map(k => k.trim());
  
  // Map to display names
  const displayKeys = keys.map(key => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'ctrl' || lowerKey === 'control') return 'Ctrl';
    if (lowerKey === 'alt') return 'Alt';
    if (lowerKey === 'shift') return 'Shift';
    if (lowerKey === 'meta' || lowerKey === 'cmd' || lowerKey === 'command') return 'Meta';
    return key.toUpperCase();
  });
  
  return displayKeys.join('+');
};

/**
 * Parses keyboard event into a key combination string.
 * 
 * @param {KeyboardEvent} event - Keyboard event
 * @returns {string|null} Key combination string or null if invalid
 */
const parseKeyEvent = (event) => {
  const modifiers = [];
  let mainKey = event.key;
  
  // Ignore modifier-only presses
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(mainKey)) {
    return null;
  }
  
  // Collect modifiers
  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Meta');
  
  // Require at least one modifier to avoid conflicts
  if (modifiers.length === 0) {
    return null;
  }
  
  // Normalize key name
  if (mainKey.length === 1) {
    mainKey = mainKey.toUpperCase();
  }
  
  return [...modifiers, mainKey].join('+');
};

/**
 * Keyboard shortcut input component.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {string} props.value - Current shortcut value
 * @param {Function} props.onChange - Callback when shortcut changes
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.disabled - Whether input is disabled
 * @param {boolean} props.isLightBackground - Whether background is light
 * @returns {JSX.Element} Shortcut input component
 */
const ShortcutInput = ({ value, onChange, placeholder, disabled, isLightBackground }) => {
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef(null);
  
  const handleKeyDown = useCallback((event) => {
    if (!isRecording) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    const combo = parseKeyEvent(event);
    if (combo) {
      onChange(combo);
      setIsRecording(false);
      inputRef.current?.blur();
    }
  }, [isRecording, onChange]);
  
  useEffect(() => {
    if (isRecording) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [isRecording, handleKeyDown]);
  
  const handleClick = () => {
    if (!disabled) {
      setIsRecording(true);
      inputRef.current?.focus();
    }
  };
  
  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setIsRecording(false);
  };
  
  return (
    <div className="flex items-center gap-2">
      <div
        ref={inputRef}
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} flex-1 cursor-pointer transition-all ${
          isRecording 
            ? 'ring-1 ring-white/20' 
            : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className={`text-sm ${
          isRecording 
            ? 'text-white/90' 
            : value 
              ? 'text-white'
              : 'text-white/40'
        }`}>
          {isRecording ? 'Press keys...' : formatKeyCombo(value) || placeholder}
        </span>
      </div>
      
      {value && !disabled && (
        <button
          onClick={handleClear}
          className={`p-2 rounded-lg transition-colors ${
            isLightBackground 
              ? 'hover:bg-black/20 text-white/60 hover:text-white' 
              : 'hover:bg-white/10 text-white/60 hover:text-white'
          }`}
          title="Clear shortcut"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
};

/**
 * Keyboard shortcuts configuration component.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.shortcuts - Shortcuts configuration object with { enabled, openChat, toggleMode }
 * @param {Function} props.onShortcutsChange - Callback when shortcuts configuration changes
 * @param {boolean} [props.isLightBackground=false] - Whether background is light themed
 * @returns {JSX.Element} Shortcuts configuration panel
 */
const ShortcutsConfig = ({ 
  shortcuts = { enabled: false, openChat: '', toggleMode: '' }, 
  onShortcutsChange,
  isLightBackground = false
}) => {
  const [localShortcuts, setLocalShortcuts] = useState(shortcuts);
  const [conflict, setConflict] = useState(null);
  
  // Sync with external changes
  useEffect(() => {
    setLocalShortcuts(shortcuts);
  }, [shortcuts]);
  
  // Check for conflicts
  useEffect(() => {
    if (localShortcuts.openChat && localShortcuts.toggleMode && 
        localShortcuts.openChat === localShortcuts.toggleMode) {
      setConflict('Open Chat and Toggle Mode cannot use the same shortcut');
    } else {
      setConflict(null);
    }
  }, [localShortcuts.openChat, localShortcuts.toggleMode]);
  
  const handleToggle = (enabled) => {
    const updated = { ...localShortcuts, enabled };
    setLocalShortcuts(updated);
    onShortcutsChange(updated);
  };
  
  const handleShortcutChange = (key, value) => {
    const updated = { ...localShortcuts, [key]: value };
    setLocalShortcuts(updated);
    onShortcutsChange(updated);
  };
  
  return (
    <div className="space-y-6">
      {/* Enable/Disable Toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium text-white">Enable Keyboard Shortcuts</label>
            <p className="text-xs text-white/50 mt-0.5">
              {localShortcuts.enabled 
                ? 'Shortcuts are active and will trigger actions' 
                : 'Shortcuts are disabled'}
            </p>
          </div>
          <Toggle
            checked={localShortcuts.enabled}
            onChange={handleToggle}
          />
        </div>
      </div>
      
      {/* Shortcut Inputs */}
      <div className="space-y-4 border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">Shortcut Bindings</h4>
        
        {/* Open Chat Shortcut */}
        <div className="space-y-2">
          <label className="text-sm text-white/80 font-medium flex items-center gap-2">
            <Icon name="message-circle" size={14} className="text-blue-400" />
            Open Chat
          </label>
          <p className="text-xs text-white/50 mb-2">
            Shortcut to open the chat interface
          </p>
          <ShortcutInput
            value={localShortcuts.openChat}
            onChange={(value) => handleShortcutChange('openChat', value)}
            placeholder="Click to set shortcut"
            disabled={!localShortcuts.enabled}
            isLightBackground={isLightBackground}
          />
        </div>
        
        {/* Toggle Mode Shortcut */}
        <div className="space-y-2">
          <label className="text-sm text-white/80 font-medium flex items-center gap-2">
            <Icon name="eye" size={14} className="text-purple-400" />
            Toggle Avatar
          </label>
          <p className="text-xs text-white/50 mb-2">
            Shortcut to toggle avatar visibility (show/hide)
          </p>
          <ShortcutInput
            value={localShortcuts.toggleMode}
            onChange={(value) => handleShortcutChange('toggleMode', value)}
            placeholder="Click to set shortcut"
            disabled={!localShortcuts.enabled}
            isLightBackground={isLightBackground}
          />
        </div>
      </div>
      
      {/* Conflict Warning */}
      {conflict && (
        <div className="rounded-lg border border-red-500/30 bg-red-900/10 p-3 flex items-start gap-2">
          <Icon name="alert" size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-100 font-medium">Shortcut Conflict</p>
            <p className="text-xs text-red-200/80 mt-1">{conflict}</p>
          </div>
        </div>
      )}
      
      {/* Info Box */}
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <div className="flex items-start gap-2">
          <Icon name="idea" size={14} className="text-blue-300 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-200/90">
            <p className="font-semibold mb-1">Tips</p>
            <ul className="space-y-0.5">
              <li>Use modifier keys (Ctrl, Alt, Shift, Meta) to avoid conflicts</li>
              <li>Avoid common browser shortcuts (Ctrl+T, Ctrl+W, etc.)</li>
              <li>Click the input field and press your desired key combination</li>
              <li>Enable shortcuts after setting all bindings</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsConfig;
