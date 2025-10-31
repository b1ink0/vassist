/**
 * @fileoverview Confirmation dialog for deleting a chat.
 */

/**
 * Confirmation dialog for deleting a chat.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {string} props.chatId - ID of chat to delete
 * @param {boolean} props.isLightBackground - Whether background is light
 * @param {string} props.animationClass - CSS animation class
 * @param {Function} props.onConfirm - Callback when delete is confirmed
 * @param {Function} props.onCancel - Callback when cancel is clicked
 * @returns {JSX.Element} Chat delete dialog component
 */
const ChatDeleteDialog = ({
  chatId,
  isLightBackground = false,
  animationClass = '',
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 p-6">
      <div className={`relative p-6 rounded-2xl w-full glass-container ${isLightBackground ? 'glass-container-dark' : ''} ${animationClass}`}>
        <h3 className="text-lg font-semibold mb-2 text-white">
          Delete Chat?
        </h3>
        <p className="text-sm mb-6 text-white/80">
          This will permanently delete this chat and all associated messages, images, and audio files. This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-2 rounded-lg text-sm`}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(chatId)}
            className="glass-error px-4 py-2 rounded-lg text-sm font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatDeleteDialog;
