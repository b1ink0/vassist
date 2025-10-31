/**
 * @fileoverview Dialog for editing chat title.
 */

import { useState } from 'react';

/**
 * Dialog component for editing chat title.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {string} props.chatId - ID of chat to edit
 * @param {string} props.initialTitle - Initial title value
 * @param {boolean} props.isLightBackground - Whether background is light
 * @param {string} props.animationClass - CSS animation class
 * @param {Function} props.onSave - Callback when save is clicked
 * @param {Function} props.onCancel - Callback when cancel is clicked
 * @returns {JSX.Element} Chat edit dialog component
 */
const ChatEditDialog = ({
  chatId,
  initialTitle,
  isLightBackground = false,
  animationClass = '',
  onSave,
  onCancel,
}) => {
  const [editingTitle, setEditingTitle] = useState(initialTitle || '');
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Handles save button click.
   */
  const handleSave = async () => {
    if (!editingTitle.trim()) return;
    
    setIsSaving(true);
    try {
      await onSave(chatId, editingTitle);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 p-6">
      <div className={`relative p-6 rounded-2xl w-full glass-container ${isLightBackground ? 'glass-container-dark' : ''} ${animationClass}`}>
        <h3 className="text-lg font-semibold mb-4 text-white">
          Edit Chat Title
        </h3>
        <input
          type="text"
          value={editingTitle}
          onChange={(e) => setEditingTitle(e.target.value)}
          placeholder="Enter new title..."
          className="w-full px-3 py-2 rounded-lg mb-4 border bg-white/10 border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
          maxLength={100}
          autoFocus
        />
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 rounded-lg text-sm`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="glass-button px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatEditDialog;
