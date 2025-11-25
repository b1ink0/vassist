/**
 * @fileoverview Unified dialog component for confirmations and inputs.
 * Handles delete confirmations (chat, model, motion) and edit operations.
 */

import { useState } from 'react';

/**
 * Unified dialog component for various modal interactions.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {'delete'|'edit'|'confirm'|'input'} props.type - Type of dialog
 * @param {string} props.title - Dialog title
 * @param {string} props.message - Dialog message/description
 * @param {string} [props.itemId] - ID of item being operated on
 * @param {string} [props.initialValue] - Initial value for edit/input dialogs
 * @param {string} [props.inputPlaceholder] - Placeholder for input field
 * @param {number} [props.inputMaxLength] - Max length for input field
 * @param {boolean} [props.isLightBackground=false] - Whether background is light
 * @param {string} [props.animationClass=''] - CSS animation class
 * @param {string} [props.confirmLabel='Confirm'] - Label for confirm button
 * @param {string} [props.confirmStyle='primary'] - Style for confirm button ('primary'|'error')
 * @param {string} [props.cancelLabel='Cancel'] - Label for cancel button
 * @param {Function} props.onConfirm - Callback when confirmed (receives itemId and value for edit/input)
 * @param {Function} props.onCancel - Callback when cancelled
 * @returns {JSX.Element} Dialog component
 */
const Dialog = ({
  type = 'confirm',
  title,
  message,
  itemId,
  initialValue = '',
  inputPlaceholder = '',
  inputMaxLength = 100,
  isLightBackground = false,
  animationClass = '',
  confirmLabel = 'Confirm',
  confirmStyle = 'primary',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  const [inputValue, setInputValue] = useState(initialValue);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /**
   * Handles confirm button click.
   */
  const handleConfirm = async () => {
    // Validate input for edit/input types
    if ((type === 'edit' || type === 'input') && !inputValue.trim()) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    try {
      if (type === 'edit' || type === 'input') {
        await onConfirm(itemId, inputValue);
      } else {
        await onConfirm(itemId);
      }
      setIsProcessing(false);
    } catch (error) {
      setErrorMessage(error.message || 'An error occurred');
      setIsProcessing(false);
    }
  };

  /**
   * Handles backdrop click.
   */
  const handleBackdropClick = (e) => {
    e.stopPropagation();
    if (!isProcessing) {
      onCancel();
    }
  };

  /**
   * Handles dialog content click (prevents backdrop close).
   */
  const handleDialogClick = (e) => {
    e.stopPropagation();
  };

  // Determine confirm button styles
  const confirmButtonClass = confirmStyle === 'error' 
    ? 'glass-error px-4 py-2 rounded-lg text-sm font-medium'
    : 'glass-button px-4 py-2 rounded-lg text-sm font-medium';

  return (
    <div 
      className={`absolute inset-0 flex items-center justify-center z-50 p-6 bg-black/50 ${animationClass}`}
      onClick={handleBackdropClick}
    >
      <div 
        className={`relative p-6 rounded-2xl w-full max-w-sm glass-container ${isLightBackground ? 'glass-container-dark' : ''}`}
        onClick={handleDialogClick}
      >
        <h3 className="text-lg font-semibold mb-2 text-white">
          {title}
        </h3>
        
        {message && (
          <p className="text-sm mb-6 text-white/80">
            {message}
          </p>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30">
            <p className="text-sm text-red-200">
              {errorMessage}
            </p>
          </div>
        )}

        {/* Input field for edit/input types */}
        {(type === 'edit' || type === 'input') && (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={inputPlaceholder}
            className="w-full px-3 py-2 rounded-lg mb-4 border bg-white/10 border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            maxLength={inputMaxLength}
            autoFocus
            disabled={isProcessing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') onCancel();
            }}
          />
        )}

        {/* Action buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 rounded-lg text-sm disabled:opacity-50`}
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing || ((type === 'edit' || type === 'input') && !inputValue.trim())}
            className={`${confirmButtonClass} disabled:opacity-50`}
          >
            {isProcessing ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dialog;
