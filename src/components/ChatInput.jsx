import { useState, useEffect, useRef } from 'react';
import { STTServiceProxy } from '../services/proxies';
; import { TTSServiceProxy } from '../services/proxies';
import VoiceConversationService, { ConversationStates } from '../services/VoiceConversationService';

const ChatInput = ({ isVisible, onSend, onClose, onVoiceTranscription, onVoiceMode }) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false); // New state for processing
  const [recordingError, setRecordingError] = useState('');
  const inputRef = useRef(null);
  
  // Voice conversation mode
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState(ConversationStates.IDLE);

  // Auto-focus when visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
      console.log('[ChatInput] Focused input');
    }
  }, [isVisible]);

  // Setup STT callbacks (for manual voice input)
  useEffect(() => {
    // Transcription callback - fill input with transcribed text
    STTServiceProxy.setTranscriptionCallback((text) => {
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
    STTServiceProxy.setErrorCallback((error) => {
      console.error('[ChatInput] STT error:', error);
      setRecordingError(error.message || 'Recording failed');
      setIsRecording(false);
      setIsProcessingRecording(false); // Done processing
    });

    // Recording start callback
    STTServiceProxy.setRecordingStartCallback(() => {
      console.log('[ChatInput] Recording started');
      setIsRecording(true);
      setIsProcessingRecording(false); // Started successfully
      setRecordingError('');
    });

    // Recording stop callback
    STTServiceProxy.setRecordingStopCallback(() => {
      console.log('[ChatInput] Recording stopped - transcription complete');
      setIsRecording(false);
      setIsProcessingRecording(false); // Done processing (transcription is complete)
    });

    // Cleanup
    return () => {
      STTServiceProxy.setTranscriptionCallback(null);
      STTServiceProxy.setErrorCallback(null);
      STTServiceProxy.setRecordingStartCallback(null);
      STTServiceProxy.setRecordingStopCallback(null);
    };
  }, []);

  // Setup Voice Conversation callbacks
  useEffect(() => {
    VoiceConversationService.setStateChangeCallback((state) => {
      console.log('[ChatInput] Voice state changed:', state);
      setVoiceState(state);
    });

    VoiceConversationService.setTranscriptionCallback((text) => {
      console.log('[ChatInput] Voice transcription:', text);
      // Pass to parent for handling
      if (onVoiceTranscription) {
        onVoiceTranscription(text);
      }
    });

    VoiceConversationService.setErrorCallback((error) => {
      console.error('[ChatInput] Voice error:', error);
      setRecordingError(error.message || 'Voice conversation error');
    });

    return () => {
      VoiceConversationService.setStateChangeCallback(null);
      VoiceConversationService.setTranscriptionCallback(null);
      VoiceConversationService.setErrorCallback(null);
    };
  }, [onVoiceTranscription]);

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
   * Toggle voice conversation mode
   */
  const handleVoiceModeToggle = async () => {
    // Check if STT is configured
    if (!STTServiceProxy.isConfigured()) {
      setRecordingError('STT not configured. Please configure in Control Panel.');
      // Auto-remove error after 3 seconds
      setTimeout(() => setRecordingError(''), 3000);
      return;
    }

    // Don't allow toggling if recording is active
    if (isRecording || isProcessingRecording) {
      setRecordingError('Please stop recording first');
      setTimeout(() => setRecordingError(''), 3000);
      return;
    }

    try {
      if (isVoiceMode) {
        // Stop voice mode
        console.log('[ChatInput] Stopping voice conversation mode');
        VoiceConversationService.stop();
        setIsVoiceMode(false);
        setVoiceState(ConversationStates.IDLE);
        
        if (onVoiceMode) {
          onVoiceMode(false);
        }
      } else {
        // Start voice mode - stop any playing TTS first
        console.log('[ChatInput] Starting voice conversation mode - stopping TTS');
        TTSServiceProxy.stopPlayback();
        
        setRecordingError('');
        await VoiceConversationService.start();
        setIsVoiceMode(true);
        
        if (onVoiceMode) {
          onVoiceMode(true);
        }
      }
    } catch (error) {
      console.error('[ChatInput] Voice mode toggle error:', error);
      setRecordingError(error.message || 'Failed to start voice mode');
      setTimeout(() => setRecordingError(''), 3000);
      setIsVoiceMode(false);
    }
  };

  /**
   * Handle manual interrupt (stop AI speaking)
   */
  const handleInterrupt = () => {
    console.log('[ChatInput] User interrupted');
    VoiceConversationService.interrupt();
  };

  /**
   * Handle microphone button click (manual voice input)
   */
  const handleMicClick = async () => {
    if (!STTServiceProxy.isConfigured()) {
      setRecordingError('STT not configured. Please configure in Control Panel.');
      // Auto-remove error after 3 seconds
      setTimeout(() => setRecordingError(''), 3000);
      return;
    }

    // Don't allow recording if voice mode is active
    if (isVoiceMode) {
      setRecordingError('Voice call is active. Stop voice call first.');
      setTimeout(() => setRecordingError(''), 3000);
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
        STTServiceProxy.stopRecording();
        // Note: Processing state will be cleared by onRecordingStop or onTranscription callback
      } else {
        // Start recording
        console.log('[ChatInput] Starting recording - stopping TTS playback');
        setIsProcessingRecording(true); // Show processing state while starting
        TTSServiceProxy.stopPlayback();
        
        setRecordingError('');
        await STTServiceProxy.startRecording();
        // Note: Processing state will be cleared by onRecordingStart callback
      }
    } catch (error) {
      console.error('[ChatInput] Microphone error:', error);
      setRecordingError(error.message || 'Microphone access denied');
      setTimeout(() => setRecordingError(''), 3000);
      setIsRecording(false);
      setIsProcessingRecording(false);
    }
  };

  // Don't render if not visible
  if (!isVisible) return null;

  /**
   * Get voice state display info
   */
  const getVoiceStateDisplay = () => {
    switch (voiceState) {
      case ConversationStates.LISTENING:
        return { icon: '🎤', label: 'Listening...', class: 'listening', showInterrupt: false };
      case ConversationStates.THINKING:
        return { icon: '🤔', label: 'Thinking...', class: 'thinking', showInterrupt: false };
      case ConversationStates.SPEAKING:
        return { icon: '🔊', label: 'Speaking...', class: 'speaking', showInterrupt: true };
      case ConversationStates.INTERRUPTED:
        return { icon: '⏸️', label: 'Interrupted', class: 'interrupted', showInterrupt: false };
      default:
        return { icon: '⏹️', label: 'Ready', class: 'idle', showInterrupt: false };
    }
  };

  const voiceStateDisplay = getVoiceStateDisplay();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[1001]">
      {/* Fade blur overlay - behind the input */}
      <div className="glass-fade-overlay absolute inset-0 pointer-events-none" />
      
      {/* Input form - on top of blur */}
      <div className="relative p-4">
        {/* Error message with close button */}
        {recordingError && (
          <div className="glass-error max-w-3xl mx-auto mb-2 px-4 py-2 rounded-lg flex items-center justify-between gap-2">
            <span className="glass-text text-sm">{recordingError}</span>
            <button
              onClick={() => setRecordingError('')}
              className="glass-text hover:opacity-80 transition-opacity flex-shrink-0"
              title="Close"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3 items-center">
          {/* Voice Mode Toggle Button */}
          <button
            type="button"
            onClick={handleVoiceModeToggle}
            disabled={isRecording || isProcessingRecording}
            className={`glass-button px-4 py-3 rounded-xl transition-all ${
              isRecording || isProcessingRecording
                ? 'opacity-50 cursor-not-allowed'
                : isVoiceMode
                ? 'glass-success'
                : ''
            }`}
            title={
              isRecording || isProcessingRecording
                ? 'Stop recording first'
                : isVoiceMode 
                ? 'Stop Voice Mode' 
                : 'Start Voice Mode'
            }
          >
            <span className="glass-text">📞</span>
          </button>

          {isVoiceMode ? (
            /* Voice Mode UI - Replace text input with state indicators */
            <>
              <div className="glass-input flex-1 px-5 py-3 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-2xl ${voiceStateDisplay.class === 'listening' ? 'animate-pulse' : ''}`}>
                    {voiceStateDisplay.icon}
                  </span>
                  <span className="glass-text">{voiceStateDisplay.label}</span>
                </div>
                
                {/* Interrupt button when AI is speaking */}
                {voiceStateDisplay.showInterrupt && (
                  <button
                    type="button"
                    onClick={handleInterrupt}
                    className="glass-warning px-4 py-2 rounded-lg transition-all text-sm font-medium"
                  >
                    <span className="glass-text">✋ Interrupt</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Normal Text Input Mode */
            <>
              {/* Microphone Button for manual voice input */}
              <button
                type="button"
                onClick={handleMicClick}
                disabled={isProcessingRecording || isVoiceMode}
                className={`glass-button px-4 py-3 rounded-xl transition-all ${
                  isVoiceMode
                    ? 'opacity-50 cursor-not-allowed'
                    : isProcessingRecording
                    ? 'glass-warning cursor-wait'
                    : isRecording
                    ? 'glass-error animate-pulse'
                    : ''
                }`}
                title={
                  isVoiceMode
                    ? 'Voice call is active'
                    : isProcessingRecording 
                    ? 'Processing...' 
                    : isRecording 
                    ? 'Stop Recording' 
                    : 'Start Voice Input'
                }
              >
                <span className="glass-text">
                  {isProcessingRecording ? '⏳' : isRecording ? '⏺️' : '🎤'}
                </span>
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
                className="glass-input glass-placeholder glass-text flex-1 px-5 py-3 rounded-xl focus:outline-none transition-all"
              />
              <button
                type="submit"
                disabled={!message.trim()}
                className="glass-button px-6 py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
              >
                <span className="glass-text">Send</span>
              </button>
            </>
          )}
          
          <button
            type="button"
            onClick={onClose}
            className="glass-button px-4 py-3 rounded-xl transition-all"
            title="Close (Esc)"
          >
            <span className="glass-text">✕</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInput;
