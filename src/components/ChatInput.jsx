import { useState, useEffect, useRef, forwardRef, useCallback } from 'react';
import { STTServiceProxy } from '../services/proxies';
import { TTSServiceProxy } from '../services/proxies';
import VoiceConversationService, { ConversationStates } from '../services/VoiceConversationService';
import BackgroundDetector from '../utils/BackgroundDetector';
import DragDropService from '../services/DragDropService';
import { useApp } from '../contexts/AppContext';

const ChatInput = forwardRef(({ 
  onSend, 
  onClose, 
  onVoiceTranscription, 
  onVoiceMode, 
}, ref) => {
  // Get shared state from AppContext
  const {
    isChatInputVisible: isVisible,
    pendingDropData,
    setPendingDropData,
  } = useApp();
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const textareaRef = useRef(null);
  const [isLightBackground, setIsLightBackground] = useState(false);
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(containerRef.current);
      } else {
        ref.current = containerRef.current;
      }
    }
  }, [ref]);
  
  // Voice conversation mode
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState(ConversationStates.IDLE);
  
  // Multi-modal support
  const [attachedImages, setAttachedImages] = useState([]);
  const [attachedAudios, setAttachedAudios] = useState([]);
  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);
  
  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDropServiceRef = useRef(null);

  /**
   * Auto-resize textarea
   */
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  };

  /**
   * Detect background color brightness
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
            centerY: window.innerHeight - 60,
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
    
    detectBackgroundBrightness();
    
    let scrollTimeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(detectBackgroundBrightness, 200);
    };
    
    window.addEventListener('scroll', handleScroll, true);
    const intervalId = setInterval(detectBackgroundBrightness, 4000);

    return () => {
      clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', handleScroll, true);
      clearInterval(intervalId);
    };
  }, [isVisible]);

  // Auto-focus and adjust height when visible
  useEffect(() => {
    if (isVisible && textareaRef.current && !isVoiceMode) {
      textareaRef.current.focus();
      adjustTextareaHeight();
      console.log('[ChatInput] Focused textarea');
    } else if (!isVisible) {
      setAttachedImages([]);
      setAttachedAudios([]);
      setMessage('');
    }
  }, [isVisible, isVoiceMode]);

  // Adjust height when message changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  // Setup STT callbacks
  useEffect(() => {
    STTServiceProxy.setTranscriptionCallback((text) => {
      console.log('[ChatInput] Transcription received:', text);
      setMessage(text);
      setRecordingError('');
      setIsProcessingRecording(false);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    });

    STTServiceProxy.setErrorCallback((error) => {
      console.error('[ChatInput] STT error:', error);
      setRecordingError(error.message || 'Recording failed');
      setIsRecording(false);
      setIsProcessingRecording(false);
    });

    STTServiceProxy.setRecordingStartCallback(() => {
      console.log('[ChatInput] Recording started');
      setIsRecording(true);
      setIsProcessingRecording(false);
      setRecordingError('');
    });

    STTServiceProxy.setRecordingStopCallback(() => {
      console.log('[ChatInput] Recording stopped - transcription complete');
      setIsRecording(false);
      setIsProcessingRecording(false);
    });

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
   * Process drop data - shared logic for both event listener and pending data
   */
  const processDropData = useCallback((dropData) => {
    if (!dropData) return;

    const { text, images, audios, errors } = dropData;
    
    console.log('[ChatInput] Processing drop data:', { 
      textLength: text?.length || 0,
      imageCount: images?.length || 0,
      audioCount: audios?.length || 0,
      errorCount: errors?.length || 0
    });

    // Show errors if any
    if (errors && errors.length > 0) {
      setRecordingError(errors[0]);
      setTimeout(() => setRecordingError(''), 3000);
    }

    // Add text to message
    if (text && text.trim()) {
      setMessage(prev => prev ? prev + '\n' + text : text);
    }

    // Add images
    if (images && images.length > 0) {
      setAttachedImages(prev => {
        const newImages = [...prev, ...images];
        const maxImages = 3;
        if (newImages.length > maxImages) {
          setRecordingError(`Maximum ${maxImages} images allowed`);
          setTimeout(() => setRecordingError(''), 3000);
          return newImages.slice(0, maxImages);
        }
        return newImages;
      });
    }

    // Add audios
    if (audios && audios.length > 0) {
      setAttachedAudios(prev => {
        const newAudios = [...prev, ...audios];
        const maxAudios = 1;
        if (newAudios.length > maxAudios) {
          setRecordingError(`Maximum ${maxAudios} audio files allowed`);
          setTimeout(() => setRecordingError(''), 3000);
          return newAudios.slice(0, maxAudios);
        }
        return newAudios;
      });
    }

    // Focus textarea after adding content
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        adjustTextareaHeight();
      }
    }, 0);
  }, []);

  // Listen for drag-drop events when chat is already open
  useEffect(() => {
    const handleChatDragDrop = (e) => {
      if (!isVisible || isVoiceMode) return;
      processDropData(e.detail);
    };

    window.addEventListener('chatDragDrop', handleChatDragDrop);
    
    return () => {
      window.removeEventListener('chatDragDrop', handleChatDragDrop);
    };
  }, [isVisible, isVoiceMode, processDropData]);

  // Process pending drop data when chat opens
  useEffect(() => {
    if (!pendingDropData || !isVisible || isVoiceMode) return;

    console.log('[ChatInput] Processing pending drop data');
    processDropData(pendingDropData);

    // Clear the pending data after processing
    setPendingDropData(null);
  }, [pendingDropData, isVisible, isVoiceMode, processDropData, setPendingDropData]);


  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    const MAX_IMAGES = 5;
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    
    if (attachedImages.length + files.length > MAX_IMAGES) {
      setRecordingError(`Maximum ${MAX_IMAGES} images allowed`);
      setTimeout(() => setRecordingError(''), 3000);
      if (imageInputRef.current) imageInputRef.current.value = '';
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
      
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachedImages(prev => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [...prev, {
            dataUrl: event.target.result,
            name: file.name,
            size: file.size,
            type: 'image'
          }];
        });
      };
      reader.onerror = () => {
        setRecordingError(`Failed to read image "${file.name}"`);
        setTimeout(() => setRecordingError(''), 3000);
      };
      reader.readAsDataURL(file);
    });
    
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleAudioSelect = (e) => {
    const files = Array.from(e.target.files);
    const MAX_AUDIOS = 3;
    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    
    if (attachedAudios.length + files.length > MAX_AUDIOS) {
      setRecordingError(`Maximum ${MAX_AUDIOS} audio files allowed`);
      setTimeout(() => setRecordingError(''), 3000);
      if (audioInputRef.current) audioInputRef.current.value = '';
      return;
    }
    
    files.forEach(file => {
      if (!file.type.startsWith('audio/')) {
        setRecordingError('Please select only audio files');
        setTimeout(() => setRecordingError(''), 3000);
        return;
      }
      
      if (file.size > MAX_FILE_SIZE) {
        setRecordingError(`Audio "${file.name}" is too large (max 25MB)`);
        setTimeout(() => setRecordingError(''), 3000);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachedAudios(prev => {
          if (prev.length >= MAX_AUDIOS) return prev;
          return [...prev, {
            dataUrl: event.target.result,
            name: file.name,
            size: file.size,
            type: 'audio'
          }];
        });
      };
      reader.onerror = () => {
        setRecordingError(`Failed to read audio "${file.name}"`);
        setTimeout(() => setRecordingError(''), 3000);
      };
      reader.readAsDataURL(file);
    });
    
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const handleRemoveImage = (index) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveAudio = (index) => {
    setAttachedAudios(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    
    const trimmedMessage = message.trim();
    
    if (!trimmedMessage && attachedImages.length === 0 && attachedAudios.length === 0) {
      return;
    }
    
    console.log('[ChatInput] Sending message:', trimmedMessage, 
      `with ${attachedImages.length} image(s) and ${attachedAudios.length} audio(s)`);
    
    onSend(
      trimmedMessage || 'Please analyze these attachments.',
      attachedImages.map(img => img.dataUrl),
      attachedAudios.map(audio => audio.dataUrl)
    );
    
    setMessage('');
    setAttachedImages([]);
    setAttachedAudios([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      console.log('[ChatInput] Escape pressed - closing');
      onClose();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePaste = (e) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    
    if (imageItems.length === 0) return;
    
    e.preventDefault();
    
    const MAX_IMAGES = 5;
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    
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
            size: file.size,
            type: 'image'
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
   * Initialize drag-drop service
   */
  useEffect(() => {
    if (!isVisible || !containerRef.current) {
      return;
    }

    // Create service instance
    dragDropServiceRef.current = new DragDropService({
      maxImages: 3,
      maxAudios: 1
    });

    // Attach with simple action callbacks
    dragDropServiceRef.current.attach(containerRef.current, {
      onSetDragOver: (isDragging) => setIsDragOver(isDragging),
      onShowError: (error) => {
        setRecordingError(error);
        setTimeout(() => setRecordingError(''), 3000);
      },
      checkVoiceMode: () => isVoiceMode,
      getCurrentCounts: () => ({
        images: attachedImages.length,
        audios: attachedAudios.length
      }),
      onAddText: (text) => {
        setMessage(prev => prev ? prev + '\n' + text : text);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            adjustTextareaHeight();
          }
        }, 0);
      },
      onAddImages: (images) => {
        setAttachedImages(prev => [...prev, ...images]);
      },
      onAddAudios: (audios) => {
        setAttachedAudios(prev => [...prev, ...audios]);
      }
    });

    // Cleanup
    return () => {
      if (dragDropServiceRef.current) {
        dragDropServiceRef.current.detach();
      }
    };
  }, [isVisible, isVoiceMode, attachedImages.length, attachedAudios.length]);

  const handleVoiceModeToggle = async () => {
    if (!STTServiceProxy.isConfigured()) {
      setRecordingError('STT not configured. Please configure in Control Panel.');
      setTimeout(() => setRecordingError(''), 3000);
      return;
    }

    if (isRecording || isProcessingRecording) {
      setRecordingError('Please stop recording first');
      setTimeout(() => setRecordingError(''), 3000);
      return;
    }

    try {
      if (isVoiceMode) {
        console.log('[ChatInput] Stopping voice conversation mode');
        VoiceConversationService.stop();
        setIsVoiceMode(false);
        setVoiceState(ConversationStates.IDLE);
        
        if (onVoiceMode) onVoiceMode(false);
      } else {
        console.log('[ChatInput] Starting voice conversation mode');
        TTSServiceProxy.stopPlayback();
        
        setAttachedImages([]);
        setAttachedAudios([]);
        
        setRecordingError('');
        await VoiceConversationService.start();
        setIsVoiceMode(true);
        
        if (onVoiceMode) onVoiceMode(true);
      }
    } catch (error) {
      console.error('[ChatInput] Voice mode toggle error:', error);
      setRecordingError(error.message || 'Failed to start voice mode');
      setTimeout(() => setRecordingError(''), 3000);
      setIsVoiceMode(false);
    }
  };

  const handleInterrupt = () => {
    console.log('[ChatInput] User interrupted');
    VoiceConversationService.interrupt();
  };

  const handleMicClick = async () => {
    if (!STTServiceProxy.isConfigured()) {
      setRecordingError('STT not configured. Please configure in Control Panel.');
      setTimeout(() => setRecordingError(''), 3000);
      return;
    }

    if (isVoiceMode) {
      setRecordingError('Voice call is active. Stop voice call first.');
      setTimeout(() => setRecordingError(''), 3000);
      return;
    }

    if (isProcessingRecording) {
      console.log('[ChatInput] Still processing, ignoring click');
      return;
    }

    try {
      if (isRecording) {
        console.log('[ChatInput] Stopping recording');
        setIsProcessingRecording(true);
        STTServiceProxy.stopRecording();
      } else {
        console.log('[ChatInput] Starting recording');
        setIsProcessingRecording(true);
        TTSServiceProxy.stopPlayback();
        
        setRecordingError('');
        await STTServiceProxy.startRecording();
      }
    } catch (error) {
      console.error('[ChatInput] Microphone error:', error);
      setRecordingError(error.message || 'Microphone access denied');
      setTimeout(() => setRecordingError(''), 3000);
      setIsRecording(false);
      setIsProcessingRecording(false);
    }
  };

  if (!isVisible) return null;

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
  const hasAttachments = attachedImages.length > 0 || attachedAudios.length > 0;

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-[1001] flex justify-center pointer-events-none"
    >
      <div 
        ref={containerRef}
        className="relative p-4 w-full max-w-3xl pointer-events-auto"
      >
        {/* Drag overlay indicator - always rendered, visibility controlled by opacity */}
        {!isVoiceMode && (
          <div 
            className="absolute z-10 pointer-events-none flex items-center justify-center rounded-xl"
            style={{
              top: '16px',
              left: '16px',
              right: '16px',
              bottom: '16px',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              opacity: isDragOver ? 1 : 0,
              visibility: isDragOver ? 'visible' : 'hidden',
              transition: 'opacity 200ms ease-in-out, visibility 200ms ease-in-out'
            }}
          >
            <div 
              className={`glass-container ${isLightBackground ? 'glass-container-dark' : ''} px-6 py-4 rounded-xl border-2 border-dashed border-blue-400/50`}
              style={{
                transform: isDragOver ? 'scale(1)' : 'scale(0.95)',
                transition: 'transform 200ms ease-in-out'
              }}
            >
              <p className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg font-medium`}>
                📎 Drop
              </p>
            </div>
          </div>
        )}
        {hasAttachments && !isVoiceMode && (
          <div className="max-w-3xl mx-auto mb-2">
            <div className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} p-2 rounded-lg`}>
              <div className="flex items-center gap-2 flex-wrap">
                {attachedImages.map((img, index) => (
                  <div key={`img-${index}`} className="relative group">
                    <img 
                      src={img.dataUrl} 
                      alt={img.name}
                      className="w-16 h-16 object-cover rounded-lg border-2 border-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className={`absolute -top-2 -right-2 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity glass-button ${isLightBackground ? 'glass-button-dark' : ''} hover:bg-red-500/20`}
                      title="Remove image"
                    >
                      <span className={isLightBackground ? 'glass-text' : 'glass-text-black'}>✕</span>
                    </button>
                    <div className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-xs mt-1 text-center truncate w-16`} title={img.name}>
                      {img.name.split('.')[0].substring(0, 8)}
                    </div>
                  </div>
                ))}
                
                {attachedAudios.map((audio, index) => (
                  <div key={`audio-${index}`} className="relative group">
                    <div className="w-16 h-16 flex items-center justify-center bg-purple-500/20 rounded-lg border-2 border-purple-400/30">
                      <span className="text-2xl">🎵</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAudio(index)}
                      className={`absolute -top-2 -right-2 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity glass-button ${isLightBackground ? 'glass-button-dark' : ''} hover:bg-red-500/20`}
                      title="Remove audio"
                    >
                      <span className={isLightBackground ? 'glass-text' : 'glass-text-black'}>✕</span>
                    </button>
                    <div className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-xs mt-1 text-center truncate w-16`} title={audio.name}>
                      {audio.name.split('.')[0].substring(0, 8)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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

        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2 items-end">
          {isVoiceMode ? (
            <>
              <div className={`glass-container ${isLightBackground ? 'glass-container-dark' : ''} flex-1 px-5 py-3 rounded-xl flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  <span className={`text-2xl ${voiceStateDisplay.class === 'listening' ? 'animate-pulse' : ''}`}>
                    {voiceStateDisplay.icon}
                  </span>
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>{voiceStateDisplay.label}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {voiceStateDisplay.showInterrupt && (
                    <button
                      type="button"
                      onClick={handleInterrupt}
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 rounded-lg text-sm hover:bg-red-500/20`}
                    >
                      <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>✋ Stop</span>
                    </button>
                  )}
                  
                  <button
                    type="button"
                    onClick={handleVoiceModeToggle}
                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 rounded-lg glass-error`}
                    title="Stop Voice Mode"
                  >
                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>📞</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={onClose}
                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 rounded-lg hover:bg-white/10`}
                    title="Close (Esc)"
                  >
                    <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>✕</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={`glass-container ${isLightBackground ? 'glass-container-dark' : ''} flex-1 rounded-xl p-3 flex flex-col gap-2`}>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={
                    isProcessingRecording 
                      ? 'Processing audio...' 
                      : isRecording 
                      ? 'Recording...' 
                      : hasAttachments
                      ? `${attachedImages.length + attachedAudios.length} file(s) attached`
                      : 'Type a message... (Enter to send, Shift+Enter for new line)'
                  }
                  className="w-full bg-transparent border-none outline-none placeholder-white/40 resize-none custom-scrollbar"
                  rows={1}
                  style={{ minHeight: '24px', maxHeight: '200px' }}
                />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*"
                      multiple
                      onChange={handleAudioSelect}
                      className="hidden"
                    />
                    
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={isRecording || isProcessingRecording}
                      className={`p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm ${
                        attachedImages.length > 0 ? 'text-blue-400' : isLightBackground ? 'glass-text' : 'glass-text-black'
                      } ${isRecording || isProcessingRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={attachedImages.length > 0 ? `${attachedImages.length} image(s)` : 'Attach Image'}
                    >
                      {attachedImages.length > 0 ? `🖼️ ${attachedImages.length}` : '🖼️'}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      disabled={isRecording || isProcessingRecording}
                      className={`p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm ${
                        attachedAudios.length > 0 ? 'text-purple-400' : isLightBackground ? 'glass-text' : 'glass-text-black'
                      } ${isRecording || isProcessingRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={attachedAudios.length > 0 ? `${attachedAudios.length} audio(s)` : 'Attach Audio'}
                    >
                      {attachedAudios.length > 0 ? `🎵 ${attachedAudios.length}` : '🎵'}
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleMicClick}
                      disabled={isProcessingRecording}
                      className={`p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm ${
                        isProcessingRecording ? 'text-yellow-400' : isRecording ? 'text-red-400 animate-pulse' : isLightBackground ? 'glass-text' : 'glass-text-black'
                      }`}
                      title={isProcessingRecording ? 'Processing...' : isRecording ? 'Stop Recording' : 'Voice Input'}
                    >
                      {isProcessingRecording ? '⏳' : isRecording ? '⏺️' : '🎤'}
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleVoiceModeToggle}
                      disabled={isRecording || isProcessingRecording}
                      className={`p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm ${
                        isRecording || isProcessingRecording ? 'opacity-50 cursor-not-allowed' : isLightBackground ? 'glass-text' : 'glass-text-black'
                      }`}
                      title="Voice Mode"
                    >
                      📞
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button
                      type="submit"
                      disabled={!message.trim() && !hasAttachments}
                      className={`px-3 py-1.5 rounded-lg transition-all text-sm font-medium ${
                        message.trim() || hasAttachments
                          ? 'bg-blue-500 hover:bg-blue-600 text-white'
                          : 'opacity-30 cursor-not-allowed'
                      }`}
                    >
                      Send
                    </button>
                    
                    <button
                      type="button"
                      onClick={onClose}
                      className={`p-1.5 rounded-lg transition-all hover:bg-white/10 ${isLightBackground ? 'glass-text' : 'glass-text-black'}`}
                      title="Close (Esc)"
                    >
                      <span className="text-xl">✕</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;
