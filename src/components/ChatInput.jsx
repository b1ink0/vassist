/**
 * @fileoverview Chat input component with voice recording, multimodal attachments, and drag-and-drop support.
 */

import { useState, useEffect, useRef, forwardRef, useCallback } from 'react';
import { STTServiceProxy } from '../services/proxies';
import { TTSServiceProxy } from '../services/proxies';
import VoiceConversationService, { ConversationStates } from '../services/VoiceConversationService';
import BackgroundDetector from '../utils/BackgroundDetector';
import DragDropService from '../services/DragDropService';
import { useApp } from '../contexts/AppContext';
import { Icon } from './icons';
import Logger from '../services/Logger';

/**
 * Chat input component with text, voice, and attachment capabilities.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Function} props.onSend - Callback when message is sent
 * @param {Function} props.onClose - Callback when input is closed
 * @param {Function} props.onVoiceTranscription - Callback for voice transcription
 * @param {Function} props.onVoiceMode - Callback when voice mode changes
 * @param {Object} ref - Forwarded ref
 * @returns {JSX.Element} Chat input component
 */
const ChatInput = forwardRef(({ 
  onSend, 
  onClose, 
  onVoiceTranscription, 
  onVoiceMode, 
}, ref) => {
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
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(isVisible);
  
  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(containerRef.current);
      } else {
        ref.current = containerRef.current;
      }
    }
  }, [ref]);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const timeout = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [isVisible, shouldRender]);
  
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState(ConversationStates.IDLE);
  
  const [attachedImages, setAttachedImages] = useState([]);
  const [attachedAudios, setAttachedAudios] = useState([]);
  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);
  
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDropServiceRef = useRef(null);

  /**
   * Auto-resizes textarea based on content.
   */
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  };

  useEffect(() => {
    if (!isVisible) return;
    
    const detectBackgroundBrightness = () => {
      const container = containerRef.current;
      const canvas = document.getElementById('vassist-babylon-canvas');
      const elementsToDisable = [container, canvas].filter(Boolean);
      
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
            container,
            canvas,
          ],
          logPrefix: '[ChatInput]',
        });
      });
      
      setIsLightBackground(prevState => {
        if (prevState !== result.isLight) {
          Logger.log('ChatInput', 'Background brightness changed:', {
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

  useEffect(() => {
    if (isVisible && textareaRef.current && !isVoiceMode) {
      textareaRef.current.focus();
      adjustTextareaHeight();
      Logger.log('ChatInput', 'Focused textarea');
    } else if (!isVisible) {
      setAttachedImages([]);
      setAttachedAudios([]);
      setMessage('');
    }
  }, [isVisible, isVoiceMode]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  useEffect(() => {
    STTServiceProxy.setTranscriptionCallback((text) => {
      Logger.log('ChatInput', 'Transcription received:', text);
      setMessage(text);
      setRecordingError('');
      setIsProcessingRecording(false);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    });

    STTServiceProxy.setErrorCallback((error) => {
      Logger.error('ChatInput', 'STT error:', error);
      setRecordingError(error.message || 'Recording failed');
      setIsRecording(false);
      setIsProcessingRecording(false);
    });

    STTServiceProxy.setRecordingStartCallback(() => {
      Logger.log('ChatInput', 'Recording started');
      setIsRecording(true);
      setIsProcessingRecording(false);
      setRecordingError('');
    });

    STTServiceProxy.setRecordingStopCallback(() => {
      Logger.log('ChatInput', 'Recording stopped - transcription complete');
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

  useEffect(() => {
    VoiceConversationService.setStateChangeCallback((state) => {
      Logger.log('ChatInput', 'Voice state changed:', state);
      setVoiceState(state);
    });

    VoiceConversationService.setTranscriptionCallback((text) => {
      Logger.log('ChatInput', 'Voice transcription:', text);
      if (onVoiceTranscription) {
        onVoiceTranscription(text);
      }
    });

    VoiceConversationService.setErrorCallback((error) => {
      Logger.error('ChatInput', 'Voice error:', error);
      setRecordingError(error.message || 'Voice conversation error');
    });

    return () => {
      VoiceConversationService.setStateChangeCallback(null);
      VoiceConversationService.setTranscriptionCallback(null);
      VoiceConversationService.setErrorCallback(null);
    };
  }, [onVoiceTranscription]);

  useEffect(() => {
    const handleStartVoiceMode = async () => {
      if (!isVoiceMode && isVisible) {
        Logger.log('ChatInput', 'External voice mode start requested');
        try {
          if (!STTServiceProxy.isConfigured()) {
            setRecordingError('STT not configured. Please configure in Control Panel.');
            setTimeout(() => setRecordingError(''), 3000);
            return;
          }

          Logger.log('ChatInput', 'Starting voice conversation mode (external trigger)');
          TTSServiceProxy.stopPlayback();
          
          setAttachedImages([]);
          setAttachedAudios([]);
          
          setRecordingError('');
          await VoiceConversationService.start();
          setIsVoiceMode(true);
          
          if (onVoiceMode) onVoiceMode(true);
        } catch (error) {
          Logger.error('ChatInput', 'Voice mode start error:', error);
          setRecordingError(error.message || 'Failed to start voice mode');
          setTimeout(() => setRecordingError(''), 3000);
          setIsVoiceMode(false);
        }
      }
    };

    window.addEventListener('startVoiceMode', handleStartVoiceMode);
    return () => {
      window.removeEventListener('startVoiceMode', handleStartVoiceMode);
    };
  }, [isVoiceMode, isVisible, onVoiceMode]);

  /**
   * Processes drag-and-drop data (text, images, audios).
   * 
   * @param {Object} dropData - Drop data containing text, images, audios, and errors
   */
  const processDropData = useCallback((dropData) => {
    if (!dropData) return;

    const { text, images, audios, errors } = dropData;
    
    Logger.log('ChatInput', 'Processing drop data:', {
      textLength: text?.length || 0,
      imageCount: images?.length || 0,
      audioCount: audios?.length || 0,
      errorCount: errors?.length || 0
    });

    if (errors && errors.length > 0) {
      setRecordingError(errors[0]);
      setTimeout(() => setRecordingError(''), 3000);
    }

    if (text && text.trim()) {
      setMessage(prev => prev ? prev + '\n' + text : text);
    }

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

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        adjustTextareaHeight();
      }
    }, 0);
  }, []);

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

  useEffect(() => {
    if (!pendingDropData || !isVisible || isVoiceMode) return;

    Logger.log('ChatInput', 'Processing pending drop data');
    processDropData(pendingDropData);

    setPendingDropData(null);
  }, [pendingDropData, isVisible, isVoiceMode, processDropData, setPendingDropData]);

  useEffect(() => {
    const handleFocusInput = () => {
      if (textareaRef.current && isVisible && !isVoiceMode) {
        textareaRef.current.focus();
      }
    };

    window.addEventListener('focusChatInput', handleFocusInput);

    return () => {
      window.removeEventListener('focusChatInput', handleFocusInput);
    };
  }, [isVisible, isVoiceMode]);


  /**
   * Handles image file selection.
   * 
   * @param {Event} e - Change event
   */
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

  /**
   * Handles audio file selection.
   * 
   * @param {Event} e - Change event
   */
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

  /**
   * Removes image from attachments.
   * 
   * @param {number} index - Index of image to remove
   */
  const handleRemoveImage = (index) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Removes audio from attachments.
   * 
   * @param {number} index - Index of audio to remove
   */
  const handleRemoveAudio = (index) => {
    setAttachedAudios(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Handles message submission.
   * 
   * @param {Event} e - Submit event
   */
  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    
    const trimmedMessage = message.trim();
    
    if (!trimmedMessage && attachedImages.length === 0 && attachedAudios.length === 0) {
      return;
    }
    
    Logger.log('ChatInput', 'Sending message:', trimmedMessage, 
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

  /**
   * Handles keyboard shortcuts.
   * 
   * @param {KeyboardEvent} e - Keyboard event
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      Logger.log('ChatInput', 'Escape pressed - closing');
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
    Logger.log('ChatInput', 'Drag-drop setup effect running', { 
      isVisible, 
      hasContainer: !!containerRef.current 
    });
    
    if (!isVisible) {
      Logger.log('ChatInput', 'Skipping drag-drop setup - not visible');
      return;
    }

    const setupTimeout = setTimeout(() => {
      if (!containerRef.current) {
        Logger.log('ChatInput', 'Container still not available after delay');
        return;
      }

      Logger.log('ChatInput', 'Setting up drag-drop service');

      dragDropServiceRef.current = new DragDropService({
        maxImages: 3,
        maxAudios: 1
      });

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
        onProcessData: (data) => {
          const { text, images, audios } = data;
          
          if (text && text.trim()) {
            setMessage(prev => prev ? prev + '\n' + text : text);
          }
          
          if (images && images.length > 0) {
            setAttachedImages(prev => [...prev, ...images]);
          }
          
          if (audios && audios.length > 0) {
            setAttachedAudios(prev => [...prev, ...audios]);
          }
          
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              adjustTextareaHeight();
            }
          }, 0);
        }
      });
    }, 100);

    return () => {
      clearTimeout(setupTimeout);
      Logger.log('ChatInput', 'Cleaning up drag-drop service');
      if (dragDropServiceRef.current) {
        dragDropServiceRef.current.detach();
        dragDropServiceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  /**
   * Toggles voice conversation mode.
   */
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
        Logger.log('ChatInput', 'Stopping voice conversation mode');
        VoiceConversationService.stop();
        setIsVoiceMode(false);
        setVoiceState(ConversationStates.IDLE);
        
        if (onVoiceMode) onVoiceMode(false);
      } else {
        Logger.log('ChatInput', 'Starting voice conversation mode');
        TTSServiceProxy.stopPlayback();
        
        setAttachedImages([]);
        setAttachedAudios([]);
        
        setRecordingError('');
        await VoiceConversationService.start();
        setIsVoiceMode(true);
        
        if (onVoiceMode) onVoiceMode(true);
      }
    } catch (error) {
      Logger.error('ChatInput', 'Voice mode toggle error:', error);
      setRecordingError(error.message || 'Failed to start voice mode');
      setTimeout(() => setRecordingError(''), 3000);
      setIsVoiceMode(false);
    }
  };
  /**
   * Handles user interrupt during voice conversation.
   */
  const handleInterrupt = () => {
    Logger.log('ChatInput', 'User interrupted');
    
    const event = new CustomEvent('voiceInterrupt');
    window.dispatchEvent(event);
    
    VoiceConversationService.interrupt();
  };

  /**
   * Handles microphone button click for voice recording.
   */
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
      Logger.log('ChatInput', 'Still processing, ignoring click');
      return;
    }

    try {
      if (isRecording) {
        Logger.log('ChatInput', 'Stopping recording');
        setIsProcessingRecording(true);
        STTServiceProxy.stopRecording();
      } else {
        Logger.log('ChatInput', 'Starting recording');
        setIsProcessingRecording(true);
        TTSServiceProxy.stopPlayback();
        
        setRecordingError('');
        await STTServiceProxy.startRecording();
      }
    } catch (error) {
      Logger.error('ChatInput', 'Microphone error:', error);
      setRecordingError(error.message || 'Microphone access denied');
      setTimeout(() => setRecordingError(''), 3000);
      setIsRecording(false);
      setIsProcessingRecording(false);
    }
  };

  if (!shouldRender) return null;

  const getVoiceStateDisplay = () => {
    switch (voiceState) {
      case ConversationStates.LISTENING:
        return { icon: 'microphone', label: 'Listening...', class: 'listening', showInterrupt: false };
      case ConversationStates.THINKING:
        return { icon: 'thinking', label: 'Thinking...', class: 'thinking', showInterrupt: false };
      case ConversationStates.SPEAKING:
        return { icon: 'speaker', label: 'Speaking...', class: 'speaking', showInterrupt: true };
      case ConversationStates.INTERRUPTED:
        return { icon: 'pause', label: 'Interrupted', class: 'interrupted', showInterrupt: false };
      default:
        return { icon: 'stop', label: 'Ready', class: 'idle', showInterrupt: false };
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
        style={{
          touchAction: 'none'
        }}
      >
        {!isVoiceMode && isDragOver && (
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
            }}
          >
            <div 
              className={`glass-container ${isLightBackground ? 'glass-container-dark' : ''} px-6 py-4 rounded-xl border-2 border-dashed border-blue-400/50`}
            >
              <p className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg font-medium flex items-center gap-2`}>
                <Icon name="attachment" size={20} /> Drop
              </p>
            </div>
          </div>
        )}
        {hasAttachments && !isVoiceMode && (
          <div className="max-w-3xl mx-auto mb-2">
            <div className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} p-2 rounded-lg ${
              isClosing ? 'animate-fade-out' : 'animate-slide-up-fade-in'
            }`}>
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
                      <Icon name="close" size={10} className={isLightBackground ? 'glass-text' : 'glass-text-black'} />
                    </button>
                    <div className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-xs mt-1 text-center truncate w-16`} title={img.name}>
                      {img.name.split('.')[0].substring(0, 8)}
                    </div>
                  </div>
                ))}
                
                {attachedAudios.map((audio, index) => (
                  <div key={`audio-${index}`} className="relative group">
                    <div className="w-16 h-16 flex items-center justify-center bg-purple-500/20 rounded-lg border-2 border-purple-400/30">
                      <Icon name="music" size={24} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAudio(index)}
                      className={`absolute -top-2 -right-2 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity glass-button ${isLightBackground ? 'glass-button-dark' : ''} hover:bg-red-500/20`}
                      title="Remove audio"
                    >
                      <Icon name="close" size={10} className={isLightBackground ? 'glass-text' : 'glass-text-black'} />
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
          <div className={`glass-error max-w-3xl mx-auto mb-2 px-4 py-2 rounded-lg flex items-center justify-between gap-2 ${
            isClosing ? 'animate-fade-out' : 'animate-slide-up-fade-in'
          }`}>
            <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-sm`}>{recordingError}</span>
            <button
              onClick={() => setRecordingError('')}
              className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} hover:opacity-80 transition-opacity flex-shrink-0`}
              title="Close"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2 items-end">
          {isVoiceMode ? (
            <>
              <div className={`glass-container ${isLightBackground ? 'glass-container-dark' : ''} flex-1 px-5 py-3 rounded-xl flex items-center justify-between ${
                isClosing ? 'animate-fade-out' : 'animate-slide-up-fade-in'
              }`}>
                <div className="flex items-center gap-3">
                  <Icon name={voiceStateDisplay.icon} size={24} className={voiceStateDisplay.class === 'listening' ? 'animate-pulse' : ''} />
                  <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>{voiceStateDisplay.label}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {voiceStateDisplay.showInterrupt && (
                    <button
                      type="button"
                      onClick={handleInterrupt}
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 rounded-lg text-sm hover:bg-red-500/20 flex items-center gap-1.5`}
                    >
                      <Icon name="hand-stop" size={16} className={isLightBackground ? 'glass-text' : 'glass-text-black'} />
                      <span className={`${isLightBackground ? 'glass-text' : 'glass-text-black'}`}>Stop</span>
                    </button>
                  )}
                  
                  <button
                    type="button"
                    onClick={handleVoiceModeToggle}
                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 rounded-lg glass-error`}
                    title="Stop Voice Mode"
                  >
                    <Icon name="phone" size={16} className={isLightBackground ? 'glass-text' : 'glass-text-black'} />
                  </button>
                  
                  <button
                    type="button"
                    onClick={onClose}
                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-3 py-1.5 rounded-lg hover:bg-white/10`}
                    title="Close (Esc)"
                  >
                    <Icon name="close" size={16} className={isLightBackground ? 'glass-text' : 'glass-text-black'} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={`glass-container ${isLightBackground ? 'glass-container-dark' : ''} flex-1 rounded-xl p-3 flex flex-col gap-2 ${
                isClosing ? 'animate-fade-out' : 'animate-slide-up-fade-in'
              }`}>
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
                  className="w-full bg-transparent text-white border-none outline-none placeholder-white/40 resize-none custom-scrollbar min-h-[24px] max-h-[200px]"
                  rows={1}
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
                      className={`p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm flex items-center gap-1 ${
                        attachedImages.length > 0 ? 'text-blue-400' : isLightBackground ? 'glass-text' : 'glass-text-black'
                      } ${isRecording || isProcessingRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={attachedImages.length > 0 ? `${attachedImages.length} image(s)` : 'Attach Image'}
                    >
                      <Icon name="image" size={18} />
                      {attachedImages.length > 0 && <span>{attachedImages.length}</span>}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      disabled={isRecording || isProcessingRecording}
                      className={`p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm flex items-center gap-1 ${
                        attachedAudios.length > 0 ? 'text-purple-400' : isLightBackground ? 'glass-text' : 'glass-text-black'
                      } ${isRecording || isProcessingRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={attachedAudios.length > 0 ? `${attachedAudios.length} audio(s)` : 'Attach Audio'}
                    >
                      <Icon name="music" size={18} />
                      {attachedAudios.length > 0 && <span>{attachedAudios.length}</span>}
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
                      <Icon name={isProcessingRecording ? 'hourglass' : isRecording ? 'record' : 'microphone'} size={18} />
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
                      <Icon name="phone" size={18} />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button
                      type="submit"
                      disabled={!message.trim() && !hasAttachments}
                      className={`p-1.5 rounded-lg transition-all ${
                        message.trim() || hasAttachments
                          ? `hover:bg-white/10 ${isLightBackground ? 'glass-text' : 'glass-text-black'}`
                          : 'opacity-30 cursor-not-allowed'
                      }`}
                      title="Send message"
                    >
                      <Icon name="send" size={20} />
                    </button>
                    
                    <button
                      type="button"
                      onClick={onClose}
                      className={`p-1.5 rounded-lg transition-all hover:bg-white/10 ${isLightBackground ? 'glass-text' : 'glass-text-black'}`}
                      title="Close (Esc)"
                    >
                      <Icon name="close" size={20} />
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
