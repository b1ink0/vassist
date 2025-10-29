/**
 * Icon Color Mapping
 * Defines appropriate colors for each icon when colored icons are enabled
 */

export const iconColors = {
  // UI Controls
  'close': 'text-red-400',
  'add': 'text-green-400',
  'settings': 'text-gray-400',
  'eye': 'text-blue-400',
  'eye-off': 'text-gray-500',
  'pin': 'text-yellow-400',
  'search': 'text-blue-400',
  
  // Actions
  'send': 'text-blue-500',
  'microphone': 'text-blue-500',
  'speaker': 'text-purple-400',
  'stop': 'text-red-500',
  'play': 'text-green-500',
  'pause': 'text-yellow-500',
  
  // Communication
  'chat': 'text-blue-400',
  'ai': 'text-purple-500',
  
  // Content Types
  'book': 'text-orange-400',
  'note': 'text-yellow-400',
  'document': 'text-blue-400',
  'image': 'text-pink-400',
  'article': 'text-cyan-400',
  
  // Status/Feedback
  'checkmark': 'text-green-500',
  'xmark': 'text-red-500',
  'alert': 'text-yellow-500',
  'info': 'text-blue-400',
  'warning': 'text-orange-500',
  'error': 'text-red-500',
  
  // Editing
  'edit': 'text-blue-400',
  'write': 'text-purple-400',
  'delete': 'text-red-400',
  'copy': 'text-gray-400',
  'clipboard': 'text-gray-400',
  'undo': 'text-orange-400',
  'redo': 'text-orange-400',
  
  // Translation/Language
  'globe': 'text-emerald-500',
  'translate': 'text-teal-500',
  
  // Navigation
  'arrow-up': 'text-gray-400',
  'arrow-down': 'text-gray-400',
  'arrow-left': 'text-gray-400',
  'arrow-right': 'text-gray-400',
  'refresh': 'text-blue-400',
  
  // Media
  'camera': 'text-pink-400',
  'video': 'text-red-400',
  'music': 'text-purple-400',
  'volume': 'text-blue-400',
  
  // Tools
  'tools': 'text-gray-400',
  'wrench': 'text-gray-500',
  'magic': 'text-purple-500',
  'lightning': 'text-yellow-500',
  'idea': 'text-yellow-400',
  
  // Files
  'folder': 'text-yellow-400',
  'file': 'text-gray-400',
  'download': 'text-green-400',
  'upload': 'text-blue-400',
  'attach': 'text-gray-400',
  
  // Social
  'user': 'text-blue-400',
  'users': 'text-blue-400',
  'heart': 'text-red-400',
  'star': 'text-yellow-400',
  
  // Time/Status
  'history': 'text-cyan-400',
  'clock': 'text-blue-400',
  'hourglass': 'text-amber-400',
  'spinner': 'text-blue-400',
  'sleeping': 'text-gray-400',
  
  // Symbols
  'check': 'text-green-500',
  'key': 'text-yellow-500',
  'lock': 'text-red-400',
  'unlock': 'text-green-400',
  'tag': 'text-purple-400',
  'target': 'text-red-500',
  
  // Text Formatting
  'bold': 'text-gray-400',
  'italic': 'text-gray-400',
  'underline': 'text-gray-400',
  'strikethrough': 'text-gray-400',
  
  // Improvements
  'briefcase': 'text-blue-500',
  'formal': 'text-indigo-500',
  
  // Location
  'location': 'text-red-500',
  'map': 'text-green-400',
  
  // Misc
  'hand-stop': 'text-red-500',
  'shuffle': 'text-purple-400',
  'question': 'text-blue-400',
  'bidirectional': 'text-cyan-400',
  'stats': 'text-green-400',
  
  // Default fallback
  'default': 'text-gray-300'
};

/**
 * Get the color class for an icon
 * @param {string} iconName - The name of the icon
 * @param {boolean} enableColored - Whether colored icons are enabled
 * @returns {string} - Tailwind color class
 */
export const getIconColor = (iconName, enableColored = false) => {
  if (!enableColored) {
    return 'text-gray-200'; // Default monochrome color
  }
  
  return iconColors[iconName] || iconColors['default'];
};
