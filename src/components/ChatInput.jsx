import { useState, useEffect, useRef } from 'react';
import { STTServiceProxy } from '../services/proxies';
; import { TTSServiceProxy } from '../services/proxies';
import VoiceConversationService, { ConversationStates } from '../services/VoiceConversationService';
import BackgroundDetector from '../utils/BackgroundDetector';

const ChatInput = ({ isVisible, onSend, onClose, onVoiceTranscription, onVoiceMode }) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false); // New state for processing
  const [recordingError, setRecordingError] = useState('');
  const inputRef = useRef(null);
  const [isLightBackground, setIsLightBackground] = useState(false); // Track background brightness
  const containerRef = useRef(null);
  
  // Voice conversation mode
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState(ConversationStates.IDLE);
  
  // Multi-modal support
  const [attachedImages, setAttachedImages] = useState([]);
  const fileInputRef = useRef(null);

  /**
   * Detect background color brightness behind the input area
   * Samples the bottom center of the screen
   */
  useEffect(() => {
    if (!isVisible) return;
    
    const detectBackgroundBrightness = () => {
      const container = containerRef.current;
      
      const elementsToDisable = [container].filter(Boolean);
      
      const result = BackgroundDetector.withDisabledPointerEvents(elementsToDisable, () => {
        return BackgroundDetector.detectBrightness({
          sampleArea: {
            type: 'horizontal',
            centerX: window.innerWidth / 2,
            centerY: window.innerHeight - 60, // 60px from bottom
            width: 600,
            padding: 20,
          },
          elementsToIgnore: [
            '.glass-fade-overlay',
            '.glass-fade-overlay-dark',
            'form',
            container,
            '#vassist-babylon-canvas',
          ],
          logPrefix: '[ChatInput]',
        });
      });
      
      // Update state if brightness changed
      setIsLightBackground(prevState => {
        if (prevState !== result.isLight) {
          console.log('[ChatInput] Background brightness changed:', {
            median: result.brightness.toFixed(1),
            isLight: result.isLight,
            samples: result.sampleCount,
          });
          return result.isLight;
        }
        return prevState;
      });
    };
    
    // Initial detection
    detectBackgroundBrightness();
    
    // Re-check on scroll (debounced)
    let scrollTimeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(detectBackgroundBrightness, 200);
    };
    
    window.addEventListener('scroll', handleScroll, true);
    
    // Re-check periodically in case background changes
    const intervalId = setInterval(detectBackgroundBrightness, 4000);

    return () => {
      clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', handleScroll, true);
      clearInterval(intervalId);
    };
  }, [isVisible]);

  // Auto-focus when visible and clear images when hidden
  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
      console.log('[ChatInput] Focused input');
    } else if (!isVisible) {
      // Clear images when input is closed
      setAttachedImages([]);
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
   * Handle image file selection
   */
  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    const MAX_IMAGES = 5;
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per image
    
    // Check if adding these files would exceed limit
    if (attachedImages.length + files.length > MAX_IMAGES) {
      setRecordingError(`Maximum ${MAX_IMAGES} images allowed`);
      setTimeout(() => setRecordingError(''), 3000);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }
    
    files.forEach(file => {
      if (!file.type.startsWith('image/')) {
        setRecordingError('Please select only image files');
        setTimeout(() => setRecordingError(''), 3000);
        return;
      }
      
      if (file.size > MAX_FILE_SIZE) {
        setRecordingError(`Image "${file.name}" is too large (max 10MB)`);
        setTimeout(() => setRecordingError(''), 3000);
        return;
      }
      
      // Read file as data URL
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachedImages(prev => {
          // Double-check limit
          if (prev.length >= MAX_IMAGES) {
            return prev;
          }
          return [...prev, {
            dataUrl: event.target.result,
            name: file.name,
            size: file.size
          }];
        });
      };
      reader.onerror = () => {
        setRecordingError(`Failed to read image "${file.name}"`);
        setTimeout(() => setRecordingError(''), 3000);
      };
      reader.readAsDataURL(file);
    });
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Remove attached image
   */
  const handleRemoveImage = (index) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Handle form submission
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    
    const trimmedMessage = message.trim();
    
    // Require either text or images
    if (!trimmedMessage && attachedImages.length === 0) {
      return;
    }
    
    console.log('[ChatInput] Sending message:', trimmedMessage, `with ${attachedImages.length} image(s)`);
    
    // Send message with images
    onSend(trimmedMessage || 'What is in this image?', attachedImages.map(img => img.dataUrl));
    
    // Clear input and images after sending
    setMessage('');
    setAttachedImages([]);
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
   * Handle paste events for image support
   */
  const handlePaste = (e) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    
    if (imageItems.length === 0) return;
    
    e.preventDefault(); // Prevent default paste behavior for images
    
    const MAX_IMAGES = 5;
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    
    if (attachedImages.length + imageItems.length > MAX_IMAGES) {
      setRecordingError(`Maximum ${MAX_IMAGES} images allowed`);
      setTimeout(() => setRecordingError(''), 3000);
      return;
    }
    
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (!file) return;
      
      if (file.size > MAX_FILE_SIZE) {
        setRecordingError(`Pasted image is too large (max 10MB)`);
        setTimeout(() => setRecordingError(''), 3000);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachedImages(prev => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [...prev, {
            dataUrl: event.target.result,
            name: `pasted-${Date.now()}.png`,
            size: file.size
          }];
        });
      };
      reader.onerror = () => {
        setRecordingError('Failed to read pasted image');
        setTimeout(() => setRecordingError(''), 3000);
      };
      reader.readAsDataURL(file);
    });
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
        
        // Clear any attached images (voice mode doesn't support images)
        setAttachedImages([]);
        
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
    <div ref={containerRef} className="fixed bottom-0 left-0 right-0 z-[1001]">
      {/* Fade blur overlay - behind the input */}
      <div className={`${isLightBackground ? 'glass-fade-overlay-dark' : 'glass-fade-overlay'} absolute inset-0 pointer-events-none`} />
      
      {/* Input form - on top of blur */}
      <div className="relative p-4">
        {/* Image preview thumbnails */}
        {attachedImages.length > 0 && (
          <div className="max-w-3xl mx-auto mb-2">
            <div className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} p-2 rounded-lg`}>
              <div className="flex items-center gap-2 flex-wrap">
                {attachedImages.map((img, index) => (
                  <div key={index} className="relative group">
                    <img 
                      src={img.dataUrl} 
                      alt={img.name}
                      className="w-16 h-16 object-cover rounded-lg border-2 border-opacity-30 border-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      title="Remove image"
                    >
                      ✕
                    </button>
                    <div className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-xs mt-1 text-center truncate w-16`} title={img.name}>
                      {img.name.split('.')[0].substring(0, 8)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Error message with close button */}
        {recordingError && (
          <div className="glass-error max-w-3xl mx-auto mb-2 px-4 py-2 rounded-lg flex items-center justify-between gap-2">
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-sm`}>{recordingError}</span>
            <button
              onClick={() => setRecordingError('')}
              className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} hover:opacity-80 transition-opacity flex-shrink-0`}
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
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-3 rounded-xl transition-all ${
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
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>📞</span>
          </button>

          {isVoiceMode ? (
            /* Voice Mode UI - Replace text input with state indicators */
            <>
              <div className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} flex-1 px-5 py-3 rounded-xl flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  <span className={`text-2xl ${voiceStateDisplay.class === 'listening' ? 'animate-pulse' : ''}`}>
                    {voiceStateDisplay.icon}
                  </span>
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>{voiceStateDisplay.label}</span>
                </div>
                
                {/* Interrupt button when AI is speaking */}
                {voiceStateDisplay.showInterrupt && (
                  <button
                    type="button"
                    onClick={handleInterrupt}
                    className="glass-warning px-4 py-2 rounded-lg transition-all text-sm font-medium"
                  >
                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>✋ Interrupt</span>
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
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-3 rounded-xl transition-all ${
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
                <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>
                  {isProcessingRecording ? '⏳' : isRecording ? '⏺️' : '🎤'}
                </span>
              </button>

              {/* Image Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isVoiceMode || isRecording || isProcessingRecording}
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-3 rounded-xl transition-all ${
                  attachedImages.length > 0 ? 'glass-success' : ''
                } ${isVoiceMode || isRecording || isProcessingRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={attachedImages.length > 0 ? `${attachedImages.length} image(s) attached` : 'Attach Image'}
              >
                <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>
                  {attachedImages.length > 0 ? `📎 ${attachedImages.length}` : '🖼️'}
                </span>
              </button>
              
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />

              <input
                ref={inputRef}
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  isProcessingRecording 
                    ? 'Processing audio...' 
                    : isRecording 
                    ? 'Recording... Click mic to stop' 
                    : attachedImages.length > 0
                    ? `${attachedImages.length} image(s) attached - Type message or send...`
                    : 'Type your message... (Esc to close)'
                }
                className={`glass-input ${isLightBackground ? 'glass-input-dark glass-placeholder-dark' : 'glass-placeholder'} flex-1 px-5 py-3 rounded-xl focus:outline-none transition-all`}
              />
              <button
                type="submit"
                disabled={!message.trim() && attachedImages.length === 0}
                className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-6 py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium`}
              >
                <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>Send</span>
              </button>
            </>
          )}
          
          <button
            type="button"
            onClick={onClose}
            className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-4 py-3 rounded-xl transition-all`}
            title="Close (Esc)"
          >
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>✕</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInput;
