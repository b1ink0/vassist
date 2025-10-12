import { useState, useEffect, useRef } from 'react';

const ChatInput = ({ isVisible, onSend, onClose }) => {
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  // Auto-focus when visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
      console.log('[ChatInput] Focused input');
    }
  }, [isVisible]);

  /**
   * Handle form submission
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    
    const trimmedMessage = message.trim();
    
    if (trimmedMessage) {
      console.log('[ChatInput] Sending message:', trimmedMessage);
      onSend(trimmedMessage);
      setMessage(''); // Clear input after sending
    }
  };

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = (e) => {
    // Escape to close
    if (e.key === 'Escape') {
      console.log('[ChatInput] Escape pressed - closing');
      onClose();
    }
  };

  // Don't render if not visible
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[1001]">
      {/* Fade blur overlay - behind the input */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />
      
      {/* Input form - on top of blur */}
      <div className="relative p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3 items-center">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Esc to close)"
            className="flex-1 px-5 py-3 backdrop-blur-md bg-white/5 text-white border border-white/15 rounded-xl focus:outline-none focus:border-white/25 focus:bg-white/8 placeholder-gray-500 shadow-lg transition-all"
            style={{
              boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.05)'
            }}
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="px-6 py-3 backdrop-blur-md bg-white/10 text-white rounded-xl hover:bg-white/20 disabled:bg-white/5 disabled:cursor-not-allowed transition-all border border-white/15 shadow-lg font-medium"
            style={{
              boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.1)'
            }}
          >
            Send
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 backdrop-blur-md bg-white/10 text-white rounded-xl hover:bg-white/20 transition-all border border-white/15 shadow-lg"
            style={{
              boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.1)'
            }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInput;
