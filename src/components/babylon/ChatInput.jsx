import { useState, useEffect, useRef } from 'react';
import STTService from '../../services/STTService';
import TTSService from '../../services/TTSService';

const ChatInput = ({ isVisible, onSend, onClose }) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false); // New state for processing
  const [recordingError, setRecordingError] = useState('');
  const inputRef = useRef(null);

  // Auto-focus when visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
      console.log('[ChatInput] Focused input');
    }
  }, [isVisible]);

  // Setup STT callbacks
  useEffect(() => {
    // Transcription callback - fill input with transcribed text
    STTService.setTranscriptionCallback((text) => {
      console.log('[ChatInput] Transcription received:', text);
      setMessage(text);
      setRecordingError('');
      setIsProcessingRecording(false); // Done processing
      // Focus input so user can edit if needed
      if (inputRef.current) {
        inputRef.current.focus();
      }
    });

    // Error callback
    STTService.setErrorCallback((error) => {
      console.error('[ChatInput] STT error:', error);
      setRecordingError(error.message || 'Recording failed');
      setIsRecording(false);
      setIsProcessingRecording(false); // Done processing
    });

    // Recording start callback
    STTService.setRecordingStartCallback(() => {
      console.log('[ChatInput] Recording started');
      setIsRecording(true);
      setIsProcessingRecording(false); // Started successfully
      setRecordingError('');
    });

    // Recording stop callback
    STTService.setRecordingStopCallback(() => {
      console.log('[ChatInput] Recording stopped - transcription complete');
      setIsRecording(false);
      setIsProcessingRecording(false); // Done processing (transcription is complete)
    });

    // Cleanup
    return () => {
      STTService.setTranscriptionCallback(null);
      STTService.setErrorCallback(null);
      STTService.setRecordingStartCallback(null);
      STTService.setRecordingStopCallback(null);
    };
  }, []);

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

  /**
   * Handle microphone button click
   */
  const handleMicClick = async () => {
    if (!STTService.isConfigured()) {
      setRecordingError('STT not configured. Please configure in Control Panel.');
      return;
    }

    // Prevent clicks while processing
    if (isProcessingRecording) {
      console.log('[ChatInput] Still processing, ignoring click');
      return;
    }

    try {
      if (isRecording) {
        // Stop recording - show processing immediately
        console.log('[ChatInput] Stopping recording');
        setIsProcessingRecording(true); // Show processing state while transcribing
        STTService.stopRecording();
        // Note: Processing state will be cleared by onRecordingStop or onTranscription callback
      } else {
        // Start recording
        console.log('[ChatInput] Starting recording - stopping TTS playback');
        setIsProcessingRecording(true); // Show processing state while starting
        TTSService.stopPlayback();
        
        setRecordingError('');
        await STTService.startRecording();
        // Note: Processing state will be cleared by onRecordingStart callback
      }
    } catch (error) {
      console.error('[ChatInput] Microphone error:', error);
      setRecordingError(error.message || 'Microphone access denied');
      setIsRecording(false);
      setIsProcessingRecording(false);
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
        {/* Error message */}
        {recordingError && (
          <div className="max-w-3xl mx-auto mb-2 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300 text-sm">
            {recordingError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3 items-center">
          {/* Microphone Button */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isProcessingRecording}
            className={`px-4 py-3 backdrop-blur-md rounded-xl transition-all border shadow-lg ${
              isProcessingRecording
                ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300 cursor-wait'
                : isRecording
                ? 'bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30 animate-pulse'
                : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
            }`}
            style={{
              boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.1)'
            }}
            title={
              isProcessingRecording 
                ? 'Processing...' 
                : isRecording 
                ? 'Stop Recording' 
                : 'Start Voice Input'
            }
          >
            {isProcessingRecording ? '⏳' : isRecording ? '⏺️' : '🎤'}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isProcessingRecording 
                ? 'Processing audio...' 
                : isRecording 
                ? 'Recording... Click mic to stop' 
                : 'Type your message... (Esc to close)'
            }
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
