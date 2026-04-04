/**
 * @fileoverview Chat input component with voice recording, multimodal attachments, and drag-and-drop support.
 */

import { useState, useEffect, useRef, forwardRef, useCallback } from 'react';
import { STTServiceProxy } from '../services/proxies';
import { TTSServiceProxy } from '../services/proxies';
import VoiceConversationService, { ConversationStates } from '../services/VoiceConversationService';
import BackgroundDetector from '../utils/BackgroundDetector';
import DragDropService from '../services/DragDropService';
import { useDesktopWindowResize } from '../hooks/useDesktopWindowResize';
import { useApp } from '../contexts/AppContext';
import { useConfig } from '../contexts/ConfigContext';
import { Icon } from './icons';
import Logger from '../services/LoggerService';
import { isAndroid, isInputWindow } from '../utils/PlatformUtils';
import { useDesktop } from '../contexts/DesktopContext';
import MicrophoneService from '../services/MicrophoneService';
import CameraService from '../services/CameraService';
import ScreenShareService from '../services/ScreenShareService';

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
  
  const { uiConfig } = useConfig();
  const { api } = useDesktop();
  
  // Local state for input window (synced from main window)
  const [localPendingDropData, setLocalPendingDropData] = useState(null);
  const [localIsVisible, _setLocalIsVisible] = useState(true); // Input window is always visible when open
  
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const textareaRef = useRef(null);
  const submitButtonRef = useRef(null);
  const [isLightBackground, setIsLightBackground] = useState(false);
  const containerRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(isInputWindow ? true : isVisible);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  
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
    if (!isAndroid) return;
    
    const handleKeyboardHeight = (event) => {
      const { height } = event.detail;
      Logger.log('ChatInput', `Native keyboard height: ${height}px`);
      setKeyboardOffset(height);
    };
    
    window.addEventListener('keyboardHeightChange', handleKeyboardHeight);
    
    return () => {
      window.removeEventListener('keyboardHeightChange', handleKeyboardHeight);
    };
  }, []);
  
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState(ConversationStates.IDLE);
  
  const [attachedImages, setAttachedImages] = useState([]);
  const [attachedAudios, setAttachedAudios] = useState([]);
  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);
  
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDropServiceRef = useRef(null);

  // Microphone selection state
  const [micDevices, setMicDevices] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState(null);
  const [showMicSelect, setShowMicSelect] = useState(false);

  // Camera selection state
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [showCameraSelect, setShowCameraSelect] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  // Screen share state (Desktop only)
  const [isScreenShareActive, setIsScreenShareActive] = useState(false);

  // IPC wrapper functions for input window
  const wrappedOnSend = useCallback((message, images, audios) => {
    if (isInputWindow) {
      api?.ipc.send('chatInput:send', { message, images, audios });
    } else {
      onSend(message, images, audios);
    }
  }, [onSend, api]);

  const wrappedOnVoiceTranscription = useCallback((text, images) => {
    if (isInputWindow) {
      api?.ipc.send('chatInput:voiceTranscription', { text, images });
    } else {
      onVoiceTranscription(text, images);
    }
  }, [onVoiceTranscription, api]);

  const wrappedSetPendingDropData = useCallback((data) => {
    if (isInputWindow) {
      api?.ipc.send('chatInput:setPendingDropData', data);
    } else {
      setPendingDropData(data);
    }
  }, [setPendingDropData, api]);

  const wrappedOnClose = useCallback(() => {
    if (isInputWindow) {
      api?.ipc.send('chatInput:close');
    } else {
      onClose();
    }
  }, [onClose, api]);

  const effectiveIsVisible = isInputWindow ? localIsVisible : isVisible;
  const effectivePendingDropData = isInputWindow ? localPendingDropData : pendingDropData;

  useEffect(() => {
    if (isInputWindow) return;
    if (effectiveIsVisible) {
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
  }, [effectiveIsVisible, shouldRender]);

  useEffect(() => {
    if (!isInputWindow || !api?.ipc) return;

    const unsubscribePendingDrop = api.ipc.on('state:pendingDropData', (data) => {
      setLocalPendingDropData(data);
    });

    const unsubscribeMicDevices = api.ipc.on('state:micDevices', (data) => {
      setMicDevices(data.devices);
      setSelectedMicId(data.selectedDeviceId);
    });

    const unsubscribeSelectedMic = api.ipc.on('state:selectedMicId', (deviceId) => {
      MicrophoneService.setSelectedDevice(deviceId);
    });

    // Listen for voice state changes from main window
    const unsubscribeVoiceState = api.ipc.on('state:voiceState', (state) => {
      Logger.log('ChatInput', 'Voice state received from main window:', state);
      setVoiceState(state);
    });

    const unsubscribeTranscription = api.ipc.on('voice:transcriptionReceived', (text) => {
      Logger.log('ChatInput', 'Transcription received from main window:', text);
      
      const images = attachedImages.length > 0 
        ? attachedImages.map(img => img.dataUrl) 
        : [];
      
      Logger.log('ChatInput', 'Sending back to main window with images:', images.length);
      
      api.ipc.send('chatInput:voiceTranscription', { text, images });
      
      setAttachedImages([]);
    });

    return () => {
      unsubscribePendingDrop?.();
      unsubscribeMicDevices?.();
      unsubscribeSelectedMic?.();
      unsubscribeVoiceState?.();
      unsubscribeTranscription?.();
    };
  }, [api, attachedImages]);

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
    if (!effectiveIsVisible) return;
    
    let detectionTimeout = null;
    let scrollTimeout = null;
    let intervalId = null;
    
    const detectBackgroundBrightness = () => {
      const mode = uiConfig?.backgroundDetection?.mode || 'adaptive';
      
      if (mode !== 'adaptive') {
        // Set based on forced mode
        if (mode === 'light') {
          setIsLightBackground(true);
        } else if (mode === 'dark') {
          setIsLightBackground(false);
        }
        return;
      }
      
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
    
    // Initial detection with delay
    detectionTimeout = setTimeout(detectBackgroundBrightness, 300);
    
    // Debounced scroll handler - longer delay to avoid performance issues
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(detectBackgroundBrightness, 500);
    };
    
    window.addEventListener('scroll', handleScroll, true);
    intervalId = setInterval(detectBackgroundBrightness, 4000);

    return () => {
      clearTimeout(detectionTimeout);
      clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', handleScroll, true);
      clearInterval(intervalId);
    };
  }, [effectiveIsVisible, uiConfig?.backgroundDetection?.mode]);

  useDesktopWindowResize(isInputWindow ? containerRef : null, {
    minWidth: 400,
    minHeight: 100,
    maxWidth: 800,
    maxHeight: 400,
    padding: 10
  });

  useEffect(() => {
    if (effectiveIsVisible && textareaRef.current && !isVoiceMode) {
      textareaRef.current.focus();
      adjustTextareaHeight();
      Logger.log('ChatInput', 'Focused textarea');
    } else if (!effectiveIsVisible) {
      setAttachedImages([]);
      setAttachedAudios([]);
      setMessage('');
    }
  }, [effectiveIsVisible, isVoiceMode]);

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
    const handleStateChange = (state) => {
      Logger.log('ChatInput', 'Voice state changed:', state);
      setVoiceState(state);
      
      // This only works in main window where VoiceConversationService actually runs
      // Input window receives state via IPC (state:voiceState)
    };

    const handleTranscription = (text) => {
      Logger.log('ChatInput', 'Voice transcription:', text, 'with images:', attachedImages.length);
      Logger.log('ChatInput', 'Attached images details:', attachedImages);
      
      const images = attachedImages.length > 0 
        ? attachedImages.map(img => img.dataUrl) 
        : null;
      
      Logger.log('ChatInput', 'Images array to send:', images ? `${images.length} images` : 'null');
      
      wrappedOnVoiceTranscription(text, images);
      
      setAttachedImages([]);
    };

    const handleError = (error) => {
      Logger.error('ChatInput', 'Voice error:', error);
      setRecordingError(error.message || 'Voice conversation error');
    };

    // Input window: Gets state via IPC (line 146-173), doesn't register callbacks
    // Web/Extension: Registers callbacks directly
    if (!isInputWindow) {
      VoiceConversationService.setStateChangeCallback(handleStateChange);
      VoiceConversationService.setTranscriptionCallback(handleTranscription);
      VoiceConversationService.setErrorCallback(handleError);
    }

    return () => {
      if (!isInputWindow) {
        VoiceConversationService.setStateChangeCallback(null);
        VoiceConversationService.setTranscriptionCallback(null);
        VoiceConversationService.setErrorCallback(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, onVoiceTranscription, attachedImages]);

  // Initialize microphone service and subscribe to device changes
  useEffect(() => {
    const unsubscribe = MicrophoneService.subscribe(({ devices, selectedDeviceId }) => {
      setMicDevices(devices);
      setSelectedMicId(selectedDeviceId);
      
      // Sync to input window on desktop
      if (!isInputWindow && api?.ipc) {
        api.ipc.send('state:micDevices', { devices, selectedDeviceId });
      }
    });

    // Initialize devices on mount
    const initDevices = async () => {
      try {
        await MicrophoneService.initialize();
      } catch {
        Logger.log('ChatInput', 'Mic permission not granted yet');
      }
    };
    initDevices();

    return unsubscribe;
  }, [api]);

  // Initialize camera service
  useEffect(() => {
    Logger.log('ChatInput', 'Camera initialization useEffect triggered, isInputWindow:', isInputWindow);
    
    if (isInputWindow) {
      Logger.log('ChatInput', 'Input window: Setting up IPC listeners for camera state');
      // Listen for camera state from main window
      if (api?.ipc) {
        const unsubscribeCameraDevices = api.ipc.on('state:cameraDevices', (data) => {
          Logger.log('ChatInput', 'Input window: Received camera state via IPC:', data);
          setCameraDevices(data.devices);
          setSelectedCameraId(data.selectedDeviceId);
          setIsCameraActive(data.isActive);
        });
        
        return () => {
          unsubscribeCameraDevices();
        };
      }
      return;
    }

    Logger.log('ChatInput', 'Web/Android/Extension: Setting up CameraService subscription');
    const unsubscribe = CameraService.subscribe(({ devices, selectedDeviceId, isActive }) => {
      Logger.log('ChatInput', 'CameraService state changed:', { devices: devices.length, selectedDeviceId, isActive });
      setCameraDevices(devices);
      setSelectedCameraId(selectedDeviceId);
      setIsCameraActive(isActive);
    });

    const initDevices = async () => {
      try {
        Logger.log('ChatInput', 'Web/Android/Extension: Initializing CameraService...');
        await CameraService.initialize();
        Logger.log('ChatInput', 'Web/Android/Extension: CameraService initialized successfully');
      } catch (error) {
        Logger.error('ChatInput', 'Web/Android/Extension: Camera initialization failed:', error);
      }
    };
    initDevices();

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, isInputWindow]);

  // Initialize screen share service
  useEffect(() => {
    Logger.log('ChatInput', 'Screen share initialization useEffect triggered, isInputWindow:', isInputWindow);
    
    // Input window: Listen for state from main window via IPC
    if (isInputWindow) {
      Logger.log('ChatInput', 'Input window: Setting up IPC listener for screen share state');
      if (api?.ipc) {
        const unsubscribeScreenShare = api.ipc.on('state:screenShare', (data) => {
          Logger.log('ChatInput', 'Input window: Received screen share state via IPC:', data);
          setIsScreenShareActive(data.isActive);
        });
        
        return () => {
          unsubscribeScreenShare();
        };
      }
      return;
    }
    
    // Android not supported
    if (isAndroid) {
      Logger.log('ChatInput', 'Android: Screen share not supported, skipping initialization');
      return;
    }

    Logger.log('ChatInput', 'Web/Desktop/Extension: Setting up ScreenShareService subscription');
    const unsubscribe = ScreenShareService.subscribe(({ isActive }) => {
      Logger.log('ChatInput', 'ScreenShareService state changed:', { isActive });
      setIsScreenShareActive(isActive);
    });

    const initScreenShare = async () => {
      try {
        Logger.log('ChatInput', 'Web/Desktop/Extension: Initializing ScreenShareService...');
        await ScreenShareService.initialize();
        Logger.log('ChatInput', 'Web/Desktop/Extension: ScreenShareService initialized successfully');
      } catch (error) {
        Logger.error('ChatInput', 'Web/Desktop/Extension: Screen share initialization failed:', error);
      }
    };
    initScreenShare();

    return unsubscribe;
  }, [api, isInputWindow]);

  // Listen for camera control IPC messages
  useEffect(() => {
    if (isInputWindow || !api?.ipc) {
      return;
    }

    Logger.log('ChatInput', 'Main window: Setting up camera IPC listeners');
    
    const unsubscribeSelectDevice = api.ipc.on('camera:selectDevice', async (deviceId) => {
      Logger.log('ChatInput', 'Main window: Received IPC camera:selectDevice:', deviceId);
      await CameraService.setSelectedDevice(deviceId);
    });

    const unsubscribeToggle = api.ipc.on('camera:toggle', async () => {
      if (isCameraActive) {
        Logger.log('ChatInput', 'Main window: Stopping camera via IPC');
        await CameraService.stop();
      } else {
        Logger.log('ChatInput', 'Main window: Starting camera via IPC');
        await CameraService.start();
      }
    });

    return () => {
      Logger.log('ChatInput', 'Main window: Cleaning up camera IPC listeners');
      unsubscribeSelectDevice();
      unsubscribeToggle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, isInputWindow, isCameraActive]);

  useEffect(() => {
    const handleStartVoiceMode = async () => {
      if (!isVoiceMode && effectiveIsVisible) {
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
          
          // Desktop input window: Send to main window via IPC (main window starts service)
          // Web/Extension: Start service directly
          if (isInputWindow && api?.ipc) {
            api.ipc.send('chatInput:voiceMode', true);
          } else {
            await VoiceConversationService.start();
            if (onVoiceMode) onVoiceMode(true);
          }
          
          setIsVoiceMode(true);
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
  }, [isVoiceMode, effectiveIsVisible, onVoiceMode, api]);

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

  /**
   * Handles message submission.
   * 
   * @param {Event} e - Submit event
   */
  const handleSubmit = useCallback((e) => {
    if (e) e.preventDefault();
    
    const trimmedMessage = message.trim();
    
    if (!trimmedMessage && attachedImages.length === 0 && attachedAudios.length === 0) {
      return;
    }
    
    Logger.log('ChatInput', 'Sending message:', trimmedMessage, 
      `with ${attachedImages.length} image(s) and ${attachedAudios.length} audio(s)`);
    
    let defaultPrompt = 'Please analyze these attachments.';
    if (!trimmedMessage) {
      if (attachedAudios.length > 0 && attachedImages.length === 0) {
        defaultPrompt = 'What is being said in this audio?';
      } else if (attachedImages.length > 0 && attachedAudios.length === 0) {
        defaultPrompt = 'What is in this image?';
      } else if (attachedImages.length > 0 && attachedAudios.length > 0) {
        defaultPrompt = 'What is in the image and what is being said in the audio?';
      }
    }
    
    wrappedOnSend(
      trimmedMessage || defaultPrompt,
      attachedImages.map(img => img.dataUrl),
      attachedAudios.map(audio => audio.dataUrl)
    );
    
    setMessage('');
    setAttachedImages([]);
    setAttachedAudios([]);
  }, [message, attachedImages, attachedAudios, wrappedOnSend]);

  useEffect(() => {
    const handleChatDragDrop = (e) => {
      if (!effectiveIsVisible || isVoiceMode) return;
      processDropData(e.detail);
      
      // Handle auto-send if requested
      if (e.detail?.autoSend) {
        // Dispatch a separate event to trigger auto-send after state updates
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('chatAutoSend'));
        }, 100);
      }
    };

    window.addEventListener('chatDragDrop', handleChatDragDrop);
    
    return () => {
      window.removeEventListener('chatDragDrop', handleChatDragDrop);
    };
  }, [effectiveIsVisible, isVoiceMode, processDropData]);

  useEffect(() => {
    if (!effectivePendingDropData || !effectiveIsVisible || isVoiceMode) return;

    Logger.log('ChatInput', 'Processing pending drop data');
    processDropData(effectivePendingDropData);

    wrappedSetPendingDropData(null);
  }, [effectivePendingDropData, effectiveIsVisible, isVoiceMode, processDropData, wrappedSetPendingDropData]);

  useEffect(() => {
    const handleFocusInput = () => {
      if (textareaRef.current && effectiveIsVisible && !isVoiceMode) {
        textareaRef.current.focus();
      }
    };

    window.addEventListener('focusChatInput', handleFocusInput);

    return () => {
      window.removeEventListener('focusChatInput', handleFocusInput);
    };
  }, [effectiveIsVisible, isVoiceMode]);

  // Auto-send listener for demo actions
  useEffect(() => {
    const handleAutoSend = () => {
      if (effectiveIsVisible && !isVoiceMode && message.trim()) {
        Logger.log('ChatInput', 'Auto-sending message from demo action');
        setTimeout(() => {
          // Click the submit button to trigger the form submission
          submitButtonRef.current?.click();
        }, 100);
      }
    };

    window.addEventListener('chatAutoSend', handleAutoSend);

    return () => {
      window.removeEventListener('chatAutoSend', handleAutoSend);
    };
  }, [effectiveIsVisible, isVoiceMode, message]);


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
   * Handles keyboard shortcuts.
   * 
   * @param {KeyboardEvent} e - Keyboard event
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      Logger.log('ChatInput', 'Escape pressed - closing');
      wrappedOnClose();
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
      isVisible: effectiveIsVisible, 
      hasContainer: !!containerRef.current 
    });
    
    if (!effectiveIsVisible) {
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
  }, [effectiveIsVisible]);

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
        
        // Desktop input window: Send to main window via IPC (main window stops service)
        // Web/Extension: Stop service directly
        if (isInputWindow && api?.ipc) {
          api.ipc.send('chatInput:voiceMode', false);
        } else {
          VoiceConversationService.stop();
          if (CameraService.isRunning()) {
            Logger.log('ChatInput', 'Stopping camera after voice call ended');
            await CameraService.stop();
          }
          
          if (onVoiceMode) {
            onVoiceMode(false);
          }
        }
        
        setIsVoiceMode(false);
        setVoiceState(ConversationStates.IDLE);
        setAttachedImages([]);
        setAttachedAudios([]);
      } else {
        Logger.log('ChatInput', 'Starting voice conversation mode');
        TTSServiceProxy.stopPlayback();
        
        setAttachedImages([]);
        setAttachedAudios([]);
        setRecordingError('');
        
        // Desktop input window: Send to main window via IPC (main window starts service)
        // Web/Extension: Start service directly
        if (isInputWindow && api?.ipc) {
          api.ipc.send('chatInput:voiceMode', true);
        } else {
          await VoiceConversationService.start();
          if (onVoiceMode) {
            onVoiceMode(true);
          }
        }
        
        setIsVoiceMode(true);
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
    
    // In desktop input window, forward interrupt to main window via IPC
    if (api?.ipc) {
      Logger.log('ChatInput', 'Forwarding interrupt to main window via IPC');
      api.ipc.send('voice:interrupt');
    }
    
    // Also call locally (in case we're in main window or web mode)
    VoiceConversationService.interrupt();
  };

  /**
   * Handles microphone device selection
   */
  const handleMicSelect = (deviceId) => {
    Logger.log('ChatInput', 'Microphone selected:', deviceId);
    MicrophoneService.setSelectedDevice(deviceId || null);
    setShowMicSelect(false);
    
    // Sync selected mic across windows on desktop
    if (api?.ipc) {
      api.ipc.send('state:selectedMicId', deviceId || null);
    }
  };

  /**
   * Toggles microphone selection dropdown
   */
  const handleMicSelectToggle = () => {
    setShowMicSelect(!showMicSelect);
  };

  /**
   * Handles camera device selection
   */
  const handleCameraSelect = async (deviceId) => {
    Logger.log('ChatInput', 'Camera selected:', deviceId);
    
    if (isInputWindow && api?.ipc) {
      api.ipc.send('camera:selectDevice', deviceId || null);
    } else {
      await CameraService.setSelectedDevice(deviceId || null);
    }
    setShowCameraSelect(false);
  };

  /**
   * Toggles camera selection dropdown
   */
  const handleCameraSelectToggle = () => {
    setShowCameraSelect(!showCameraSelect);
  };

  /**
   * Handles camera button click (toggle on/off)
   */
  const handleCameraClick = async () => {
    try {
      Logger.log('ChatInput', 'Camera button clicked, isInputWindow:', isInputWindow, 'isCameraActive:', isCameraActive);
      
      if (isInputWindow && api?.ipc) {
        Logger.log('ChatInput', 'Input window: Sending camera:toggle IPC to main window');
        api.ipc.send('camera:toggle');
      } else {
        if (isCameraActive) {
          Logger.log('ChatInput', 'Stopping camera');
          await CameraService.stop();
        } else {
          Logger.log('ChatInput', 'Starting camera');
          await CameraService.start();
        }
      }
    } catch (error) {
      Logger.error('ChatInput', 'Camera toggle error:', error);
    }
  };

  /**
   * Handles screen share button click (toggle on/off)
   */
  const handleScreenShareClick = async () => {
    try {
      Logger.log('ChatInput', 'Screen share button clicked, isScreenShareActive:', isScreenShareActive);
      
      // Input window: Send IPC to main window using api from hook
      if (isInputWindow && api?.ipc) {
        Logger.log('ChatInput', 'Input window: Sending screenShare:toggle IPC');
        api.ipc.send('screenShare:toggle');
        return;
      }
      
      // Direct control for main window / web / dev / extension
      if (isScreenShareActive) {
        await ScreenShareService.stop();
      } else {
        await ScreenShareService.start();
      }
    } catch (error) {
      Logger.error('ChatInput', 'Screen share toggle error:', error);
    }
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
    Logger.log('ChatInput', 'Current voiceState:', voiceState, 'Expected LISTENING:', ConversationStates.LISTENING);
    
    // Show interrupt button if in SPEAKING state OR if TTS audio is currently playing
    const isAudioPlaying = TTSServiceProxy.isCurrentlyPlaying();
    const showInterrupt = voiceState === ConversationStates.SPEAKING || isAudioPlaying;
    
    switch (voiceState) {
      case ConversationStates.LISTENING:
        return { icon: 'microphone', label: 'Listening...', class: 'listening', showInterrupt: false };
      case ConversationStates.THINKING:
        return { icon: 'thinking', label: 'Thinking...', class: 'thinking', showInterrupt: false };
      case ConversationStates.GENERATING_VOICE:
        return { icon: 'thinking', label: 'Generating voice...', class: 'generating-voice', showInterrupt: false };
      case ConversationStates.SPEAKING:
        return { icon: 'speaker', label: 'Speaking...', class: 'speaking', showInterrupt };
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
      className="fixed bottom-0 left-0 right-0 z-[10001] flex justify-center pointer-events-none"
      style={isAndroid && keyboardOffset > 0 ? {
        transform: `translateY(-${keyboardOffset}px)`,
        transition: 'transform 0.1s ease-out'
      } : undefined}
    >
      <div 
        ref={containerRef}
        className={`relative md:p-4 p-2 w-full max-w-3xl pointer-events-auto ${isInputWindow ? 'flex flex-col justify-end' : ''}`}
        style={{
          touchAction: 'none',
          ...(isInputWindow ? { minHeight: '400px' } : {})
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
              className={`glass-container ${isLightBackground ? 'glass-container-dark' : ''} px-6 py-2 md:py-4 rounded-xl border-2 border-dashed border-blue-400/50`}
            >
              <p className={`${isLightBackground ? 'glass-text' : 'glass-text-black'} text-lg font-medium flex items-center gap-2`}>
                <Icon name="attachment" size={20} /> Drop
              </p>
            </div>
          </div>
        )}
        {hasAttachments && (
          <div className={`w-full max-w-3xl mb-2 ${isInputWindow ? '' : 'mx-auto'}`}>
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
          <div className={`glass-error max-w-3xl mx-auto mb-2 px-2 md:px-4 py-2 rounded-lg flex items-center justify-between gap-2 ${
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

        <form onSubmit={handleSubmit} className={`max-w-3xl flex gap-2 items-end ${isInputWindow ? '' : 'mx-auto'}`}>
          {/* Hidden file inputs - always rendered so refs work in both modes */}
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
          
          {isVoiceMode ? (
            <>
              <div className={`glass-container ${isLightBackground ? 'glass-container-dark' : ''} flex-1 px-5 py-2 md:py-3 rounded-xl flex items-center justify-between ${
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
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm flex items-center gap-1 ${
                      attachedImages.length > 0 ? 'bg-blue-500/20 text-blue-400' : ''
                    }`}
                    title={attachedImages.length > 0 ? `${attachedImages.length} image(s)` : 'Attach image'}
                  >
                    <Icon name="image" size={16} className={isLightBackground ? 'glass-text' : 'glass-text-black'} />
                    {attachedImages.length > 0 && <span className={isLightBackground ? 'glass-text' : 'glass-text-black'}>{attachedImages.length}</span>}
                  </button>

                  {/* Camera button with dropdown */}
                  <div className="relative flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleCameraClick}
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm flex items-center gap-1 ${
                        isCameraActive ? 'bg-green-500/20 text-green-400' : ''
                      }`}
                      title={isCameraActive ? 'Stop Camera' : 'Start Camera'}
                    >
                      <Icon name="camera" size={16} className={isCameraActive ? 'animate-pulse' : (isLightBackground ? 'glass-text' : 'glass-text-black')} />
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleCameraSelectToggle}
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-1 py-1.5 rounded-lg hover:bg-white/10 text-sm`}
                      title="Select Camera"
                    >
                      <Icon name="chevron-down" size={14} className={isLightBackground ? 'glass-text' : 'glass-text-black'} />
                    </button>
                    
                    {showCameraSelect && (
                      <select
                        value={selectedCameraId || ''}
                        onChange={(e) => handleCameraSelect(e.target.value)}
                        onBlur={() => setShowCameraSelect(false)}
                        autoFocus
                        className={`absolute bottom-12 right-0 p-2 rounded-xl text-sm min-w-[250px] backdrop-blur-md ${
                          !isLightBackground 
                            ? 'bg-white/90 text-black border-white/20' 
                            : 'bg-black/90 text-white border-white/10'
                        } border shadow-2xl`}
                        style={{
                          backdropFilter: 'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)',
                        }}
                        size={Math.min(cameraDevices.length + 1, 5)}
                      >
                        <option value="" className={!isLightBackground ? 'bg-white text-black' : 'bg-gray-900 text-white'}>
                          Default Camera
                        </option>
                        {cameraDevices.map((device, index) => (
                          <option 
                            key={device.deviceId || index} 
                            value={device.deviceId || ''}
                            className={!isLightBackground ? 'bg-white text-black hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-800'}
                          >
                            {device.label || (device.deviceId ? `Camera ${device.deviceId.substring(0, 8)}...` : `Camera ${index + 1}`)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  
                  {/* Screen Share button (Chrome-based platforms) */}
                  {!isAndroid && (
                    <button
                      type="button"
                      onClick={handleScreenShareClick}
                      className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} px-2 py-1.5 rounded-lg hover:bg-white/10 text-sm flex items-center gap-1 ${
                        isScreenShareActive ? 'bg-blue-500/20 text-blue-400' : ''
                      }`}
                      title={isScreenShareActive ? 'Stop Screen Share' : 'Start Screen Share'}
                    >
                      <Icon name="maximize" size={16} className={isScreenShareActive ? 'animate-pulse' : (isLightBackground ? 'glass-text' : 'glass-text-black')} />
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
                    onClick={wrappedOnClose}
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
                      : 'Type a message...'
                  }
                  className="w-full bg-transparent text-white border-none outline-none placeholder-white/40 resize-none custom-scrollbar min-h-[24px] max-h-[200px]"
                  rows={1}
                />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
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
                    
                    {/* Microphone selection */}
                    <button
                      type="button"
                      onClick={handleMicSelectToggle}
                      disabled={isRecording || isProcessingRecording}
                      className={`p-1.5 rounded-lg transition-all hover:bg-white/10 text-sm ${
                        isRecording || isProcessingRecording ? 'opacity-50 cursor-not-allowed' : isLightBackground ? 'glass-text' : 'glass-text-black'
                      }`}
                      title="Select Microphone"
                    >
                      <Icon name="chevron-down" size={18} />
                    </button>
                    
                    {showMicSelect && (
                      <select
                        value={selectedMicId || ''}
                        onChange={(e) => handleMicSelect(e.target.value)}
                        onBlur={() => setShowMicSelect(false)}
                        autoFocus
                        className={`absolute bottom-12 right-0 p-2 rounded-xl text-sm min-w-[250px] backdrop-blur-md ${
                          !isLightBackground 
                            ? 'bg-white/90 text-black border-white/20' 
                            : 'bg-black/90 text-white border-white/10'
                        } border shadow-2xl`}
                        style={{
                          backdropFilter: 'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)',
                        }}
                        size={Math.min(micDevices.length + 1, 5)}
                      >
                        <option value="" className={!isLightBackground ? 'bg-white text-black' : 'bg-gray-900 text-white'}>
                          Default Microphone
                        </option>
                        {micDevices.map((device) => (
                          <option 
                            key={device.deviceId} 
                            value={device.deviceId}
                            className={!isLightBackground ? 'bg-white text-black hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-800'}
                          >
                            {device.label || `Microphone ${device.deviceId.substring(0, 8)}...`}
                          </option>
                        ))}
                      </select>
                    )}
                    
                    <button
                      type="button"
                      onClick={wrappedOnClose}
                      className={`p-1.5 rounded-lg transition-all hover:bg-white/10 ${isLightBackground ? 'glass-text' : 'glass-text-black'}`}
                      title="Close"
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button
                      ref={submitButtonRef}
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
