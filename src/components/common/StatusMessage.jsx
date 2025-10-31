/**
 * @fileoverview Universal message parser for status displays.
 * 
 * Parses message strings with prefixes like:
 * - "success:Message text" → Green with check icon
 * - "warning:Message text" → Yellow with alert icon
 * - "error:Message text" → Red with X icon
 * - Plain text → Default styling
 * 
 * Used in settings panels and setup wizard for test results.
 */

import { Icon } from '../icons';

/**
 * Status message component with prefix parsing.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {string} props.message - Message text with optional prefix
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.isLightBackground - Whether background is light
 * @returns {JSX.Element|null} Status message component
 */
const StatusMessage = ({ message, className = '', isLightBackground = false }) => {
  if (!message) return null;

  /**
   * Parses message prefix to determine styling.
   * 
   * @param {string} msg - Message to parse
   * @returns {Object} Parsed message config
   */
  const parseMessage = (msg) => {
    const prefixMatch = msg.match(/^(success|warning|error):\s*(.+)$/i);
    
    if (!prefixMatch) {
      return {
        type: 'info',
        text: msg,
        icon: null,
        bgColor: 'bg-white/5',
        borderColor: 'border-white/10',
        textColor: isLightBackground ? 'text-gray-700' : 'text-white/90',
      };
    }

    const [, type, text] = prefixMatch;
    const lowerType = type.toLowerCase();

    const config = {
      success: {
        icon: 'check',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-400/30',
        textColor: isLightBackground ? 'text-green-700' : 'text-green-300',
        iconColor: isLightBackground ? 'text-green-600' : 'text-green-400',
      },
      warning: {
        icon: 'alert-triangle',
        bgColor: 'bg-yellow-500/10',
        borderColor: 'border-yellow-500/30',
        textColor: isLightBackground ? 'text-yellow-700' : 'text-yellow-200',
        iconColor: isLightBackground ? 'text-yellow-600' : 'text-yellow-300',
      },
      error: {
        icon: 'xmark',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-400/30',
        textColor: isLightBackground ? 'text-red-700' : 'text-red-300',
        iconColor: isLightBackground ? 'text-red-600' : 'text-red-400',
      },
    };

    return {
      type: lowerType,
      text,
      ...config[lowerType],
    };
  };

  const parsed = parseMessage(message);

  return (
    <div className={`p-3 rounded-lg ${parsed.bgColor} border ${parsed.borderColor} flex items-start gap-2 ${className}`}>
      {parsed.icon && (
        <Icon 
          name={parsed.icon} 
          size={16} 
          className={`${parsed.iconColor} flex-shrink-0 mt-0.5`}
        />
      )}
      <p className={`text-xs ${parsed.textColor} flex-1`}>
        {parsed.text}
      </p>
    </div>
  );
};

export default StatusMessage;
