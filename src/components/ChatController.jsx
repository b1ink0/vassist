/**
 * @fileoverview Main chat controller managing chat UI, streaming, and voice conversation.
 */

import { useEffect, useRef, useCallback } from 'react'
import ChatButton from './ChatButton'
import ChatInput from './ChatInput'
import ChatContainer from './ChatContainer'
import AIToolbar from './AIToolbar'
import { InputWindowManager } from './InputWindowManager'
import ChatService from '../services/ChatService'
import { AIServiceProxy, TTSServiceProxy, StorageServiceProxy } from '../services/proxies'
import DocumentInteractionService from '../services/DocumentInteractionService'
import VoiceConversationService, { ConversationStates } from '../services/VoiceConversationService'
import { DefaultAIConfig, DefaultTTSConfig } from '../config/aiConfig'
import { PromptConfig } from '../config/promptConfig'
import chatHistoryService from '../services/ChatHistoryService'
import { useApp } from '../contexts/AppContext'
import { useDesktopWindowResize } from '../hooks/useDesktopWindowResize'
import Logger from '../services/LoggerService';
import { isAndroid, isDesktop, isInputWindow } from '../utils/PlatformUtils';
import { useDesktop } from '../contexts/DesktopContext';
import MicrophoneService from '../services/MicrophoneService';
import CameraService from '../services/CameraService';
import ScreenShareService from '../services/ScreenShareService';

/**
 * Main chat controller component.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {boolean} props.modelDisabled - Whether model is disabled
 * @returns {JSX.Element} Chat controller component
 */
const ChatController = ({ 
  modelDisabled = false,
  requireSetupOnChatClick = false,
  onRequireSetup,
}) => {
  const { api } = useDesktop();
  const chatInputRef = useRef(null);
  const streamAbortControllerRef = useRef(null); // Track current stream to allow cancellation
  const hasAutoOpenedAndroidChatRef = useRef(false);
  
  const {
    assistantRef,
    isAssistantReady,
    isChatInputVisible,
    isChatContainerVisible,
    chatMessages,
    isVoiceMode: _isVoiceMode,
    currentChatId,
    isTempChat,
    pendingDropData,
    setIsChatInputVisible,
    setIsChatContainerVisible,
    setChatMessages,
    setIsProcessing,
    setIsVoiceMode,
    setIsSpeaking,
    setCurrentChatId,
    setPendingDropData,
    regenerateWithStreamingRef,
    editWithStreamingRef,
    closeChat,
  } = useApp();

  useDesktopWindowResize();

  /**
   * Handles AI response in voice mode.
   * Gets AI response and speaks it through VoiceConversationService.
   */
  const handleVoiceAIResponse = useCallback(async () => {
    const abortController = new AbortController();
    streamAbortControllerRef.current = abortController;
    
    setIsProcessing(true)

    if (!AIServiceProxy.isConfigured()) {
      ChatService.addMessage('assistant', 'Error: AI not configured. Please configure in Control Panel.');
      setChatMessages([...ChatService.getMessages()]);
      streamAbortControllerRef.current = null;
      setIsProcessing(false);
      VoiceConversationService.changeState(ConversationStates.LISTENING);
      return;
    }

    Logger.log('ChatController', '[Voice] Checking assistant ready state:', {
      hasRef: !!assistantRef.current,
      isReady: assistantRef.current?.isReady?.(),
    });
    
    if (assistantRef.current?.isReady()) {
      Logger.log('ChatController', '[Voice] Starting BUSY state (thinking animation)')
      await assistantRef.current.setState('BUSY')
      Logger.log('ChatController', '[Voice] BUSY state set successfully')
    } else {
      Logger.warn('ChatController', '[Voice] Assistant not ready, skipping BUSY state')
    }

    let voiceAIConfig;
    let voiceTTSConfig;
    try {
      voiceAIConfig = await StorageServiceProxy.configLoad('aiConfig', DefaultAIConfig);
      voiceTTSConfig = await StorageServiceProxy.configLoad('ttsConfig', DefaultTTSConfig);
    } catch (error) {
      Logger.error('ChatController', 'Failed to load configs in handleVoiceAIResponse:', error);
      voiceAIConfig = DefaultAIConfig;
      voiceTTSConfig = DefaultTTSConfig;
    }
    
    const systemPrompt = getSystemPromptFromConfig(voiceAIConfig);
    const ttsEnabled = voiceTTSConfig.enabled && TTSServiceProxy.isConfigured();

    const messages = ChatService.getFormattedMessages(systemPrompt)

    const lastUserMessage = ChatService.getLastUserMessage();
    const hasAttachments = lastUserMessage && (
      (lastUserMessage.images && lastUserMessage.images.length > 0) ||
      (lastUserMessage.audios && lastUserMessage.audios.length > 0)
    );
    
    if (lastUserMessage && lastUserMessage.content && !hasAttachments && !isAndroid && !isDesktop) {
      if (abortController.signal.aborted) {
        Logger.log('ChatController', '[Voice] Document interaction cancelled before starting');
        streamAbortControllerRef.current = null;
        return;
      }
      
      try {
        const aiSendMessage = async (messages, onStream, options) => {
          return await AIServiceProxy.sendMessage(messages, onStream, options);
        };
        
        const pageContext = await DocumentInteractionService.getContextForQuery(
          lastUserMessage.content,
          aiSendMessage,
          abortController.signal
        );
        
        if (abortController.signal.aborted) {
          Logger.log('ChatController', '[Voice] Stream cancelled after document interaction');
          streamAbortControllerRef.current = null;
          return;
        }
        
        if (pageContext) {
          Logger.log('ChatController', '[Voice] Injecting page context into AI prompt');
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === 'user') {
            lastMessage.content = pageContext + lastMessage.content;
          }
        }
      } catch (error) {
        Logger.warn('ChatController', '[Voice] Failed to extract page context:', error);
      }
    } else if (hasAttachments) {
      Logger.log('ChatController', '[Voice] Skipping document interaction - user has attachments (images/audios)');
    }

    if (ttsEnabled) {
      TTSServiceProxy.resumePlayback()
    }

    let fullResponse = ''
    let fullResponseRaw = ''
    let previousDisplayLength = 0
    let hasSwitchedToSpeaking = false
    let textBuffer = ''
    const allChunks = []
    let nextChunkToGenerate = 0
    const MAX_QUEUED_AUDIO = 3
    let isGeneratingChunk = false

    const voiceTTSSessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const generateTTSChunk = async (chunkIndex) => {
      if (chunkIndex >= allChunks.length) return
      
      const chunkText = allChunks[chunkIndex]
      
      try {
        const queueLength = TTSServiceProxy.getQueueLength()
        Logger.log('ChatController', `[Voice] Generating TTS+lip sync chunk ${chunkIndex}: "${chunkText.substring(0, 50)}..." (queue: ${queueLength})`)
        
        const result = await TTSServiceProxy.generateSpeech(chunkText, true)
        
        if (!result || !result.audio) {
          Logger.warn('ChatController', `[Voice] TTS generation returned null for chunk ${chunkIndex}`)
          return
        }
        
        const { audio, bvmdUrl } = result
        
        const audioBlob = audio instanceof Blob ? audio : new Blob([audio], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob)
        
        TTSServiceProxy.queueAudio(chunkText, audioUrl, bvmdUrl, voiceTTSSessionId)
        
        Logger.log('ChatController', `[Voice] TTS chunk ${chunkIndex} queued${bvmdUrl ? ' with lip sync' : ''} (queue now: ${TTSServiceProxy.getQueueLength()})`)
      } catch (error) {
        Logger.error('ChatController', '[Voice] TTS chunk ${chunkIndex} failed:', error)
      }
    }

    const tryGenerateNextChunk = async () => {
      if (isGeneratingChunk) {
        return
      }
      
      const queueLength = TTSServiceProxy.getQueueLength()
      if (queueLength < MAX_QUEUED_AUDIO && nextChunkToGenerate < allChunks.length) {
        isGeneratingChunk = true
        await generateTTSChunk(nextChunkToGenerate++)
        isGeneratingChunk = false
        
        tryGenerateNextChunk()
      }
    }

    const handleAudioFinished = () => {
      tryGenerateNextChunk()
    }
    TTSServiceProxy.addEventListener('audioFinished', handleAudioFinished)

    if (ttsEnabled) {
      Logger.log('ChatController', `[Voice] Starting TTS session ${voiceTTSSessionId} (not marking complete until LLM done)`);
    }

    const result = await AIServiceProxy.sendMessage(messages, async (chunk) => {
      if (abortController.signal.aborted) {
        Logger.log('ChatController', '[Voice] Streaming callback aborted, ignoring chunk');
        return;
      }
      
      fullResponseRaw += chunk
      
      let displayResponse = fullResponseRaw.replace(/<think>[\s\S]*?<\/think>/g, '')
      displayResponse = displayResponse.replace(/<think>.*$/s, '')
      displayResponse = displayResponse.replace(/^\s+/, '')
      
      fullResponse = displayResponse
      
      const newContent = displayResponse.slice(previousDisplayLength)
      textBuffer += newContent
      previousDisplayLength = displayResponse.length

      const currentMessages = ChatService.getMessages()
      if (currentMessages.length > 0 && 
          currentMessages[currentMessages.length - 1].role === 'assistant') {
        ChatService.updateLastMessage(fullResponse)
      } else {
        ChatService.addMessage('assistant', fullResponse)
      }
      setChatMessages([...ChatService.getMessages()])

      if (!ttsEnabled && !hasSwitchedToSpeaking && fullResponse.length > 10 && assistantRef.current?.isReady()) {
        Logger.log('ChatController', '[Voice] Starting speaking animation (no TTS)')
        assistantRef.current.triggerAction('speak')
        hasSwitchedToSpeaking = true
      }

      if (ttsEnabled) {
        const sentenceEnd = /[.!?:]\s|[.!?:]\n|\n/.exec(textBuffer)
        
        if (sentenceEnd) {
          const chunkToSpeak = textBuffer.substring(0, sentenceEnd.index + sentenceEnd[0].length).trim()
          textBuffer = textBuffer.substring(sentenceEnd.index + sentenceEnd[0].length)
          
          if (chunkToSpeak && chunkToSpeak.length >= 3 && chunkToSpeak.trim().length >= 3) {
            allChunks.push(chunkToSpeak)
            tryGenerateNextChunk()
          }
        }
      }
    })

    if (result.cancelled) {
      Logger.log('ChatController', 'Voice generation cancelled by user')
      VoiceConversationService.changeState(ConversationStates.LISTENING)
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle()
      }
      streamAbortControllerRef.current = null;
      setIsProcessing(false)
      return
    }

    if (!result.success) {
      Logger.error('ChatController', 'Voice AI error:', result.error);
      ChatService.addMessage('assistant', `Error: ${result.error.message}`);
      setChatMessages([...ChatService.getMessages()]);
      VoiceConversationService.changeState(ConversationStates.LISTENING)
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle()
      }
      streamAbortControllerRef.current = null;
      setIsProcessing(false)
      return
    }

    Logger.log('ChatController', '[Voice] AI response complete:', fullResponse)

    if (ttsEnabled && textBuffer.trim().length > 0) {
      const finalChunk = textBuffer.trim()
      allChunks.push(finalChunk)
      tryGenerateNextChunk()
    }

    if (ttsEnabled && allChunks.length > 0) {
      VoiceConversationService.changeState(ConversationStates.GENERATING_VOICE);
      Logger.log('ChatController', `[Voice] Transitioning to GENERATING_VOICE state (${allChunks.length} TTS chunks to generate)`);
      
      TTSServiceProxy.resetSessionFlags();
      
      Logger.log('ChatController', `[Voice] Waiting for ${allChunks.length} TTS chunks to generate and queue...`)
      
      while (nextChunkToGenerate < allChunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      Logger.log('ChatController', '[Voice] All TTS chunks generated and queued')
      
      TTSServiceProxy.markSessionComplete(voiceTTSSessionId);
      Logger.log('ChatController', `[Voice] Session ${voiceTTSSessionId} marked complete`);
    } else {
      Logger.warn('ChatController', '[Voice] No TTS generated, returning to listening')
      VoiceConversationService.changeState(ConversationStates.LISTENING)
    }

    TTSServiceProxy.removeEventListener('audioFinished', handleAudioFinished)

    streamAbortControllerRef.current = null;
    setIsProcessing(false);
  }, [setIsProcessing, setChatMessages, assistantRef]);

  const handleVoiceTranscription = useCallback(async (text, images = null, skipForward = false) => {
    Logger.log('ChatController', 'Voice transcription received:', text, 'with images:', images?.length || 0, 'skipForward:', skipForward)
    
    if (!text || !text.trim()) {
      Logger.warn('ChatController', 'Empty transcription, returning to listening')
      setTimeout(() => {
        if (VoiceConversationService.isConversationActive()) {
          VoiceConversationService.changeState(ConversationStates.LISTENING)
        }
      }, 500)
      return
    }
    
    // Desktop: Forward transcription to input window so it can send back with images
    // Skip if skipForward=true (already from input window)
    if (!skipForward && isDesktop && !isInputWindow && api?.ipc) {
      Logger.log('ChatController', 'Forwarding transcription to input window for image attachment');
      api.ipc.send('voice:transcriptionReceived', text);
      // Input window will send back via chatInput:voiceTranscription with images array
      return;
    }
    
    // Add message and process
    ChatService.addMessage('user', text, images, null);
    setChatMessages(ChatService.getMessages());
    
    await handleVoiceAIResponse()
  }, [setChatMessages, handleVoiceAIResponse, api]);

  const handleVoiceModeChange = useCallback(async (active) => {
    Logger.log('ChatController', 'Voice mode changed:', active);
    setIsVoiceMode(active);
    
    if (isDesktop && !isInputWindow) {
      try {
        if (active) {
          Logger.log('ChatController', 'Starting VoiceConversationService in main window');
          await VoiceConversationService.start();
        } else {
          Logger.log('ChatController', 'Stopping VoiceConversationService in main window');
          VoiceConversationService.stop();
          if (CameraService.isRunning()) {
            Logger.log('ChatController', 'Stopping camera after voice call ended');
            await CameraService.stop();
          }
          // Stop screen share when voice mode ends
          if (ScreenShareService.isRunning()) {
            Logger.log('ChatController', 'Stopping screen share after voice call ended');
            await ScreenShareService.stop();
          }
        }
      } catch (error) {
        Logger.error('ChatController', 'Voice mode change error:', error);
      }
    }
  }, [setIsVoiceMode]);

  /**
   * Track voice conversation state to update isSpeaking
   * Web/Android: ChatInput registers callback directly, don't register here to avoid overwriting
   */
  useEffect(() => {
    // Only register in desktop main window
    // Web/Android: ChatInput handles state callback to avoid overwriting
    if (isInputWindow || !isDesktop) return;
    
    const handleStateChange = (state) => {
      setIsSpeaking(state === ConversationStates.SPEAKING);
      
      // Desktop: Forward voice state to input window via IPC
      if (api?.ipc) {
        api.ipc.send('state:voiceState', state);
      }
    };

    VoiceConversationService.setStateChangeCallback(handleStateChange);

    return () => {
      VoiceConversationService.setStateChangeCallback(null);
    };
  }, [setIsSpeaking, api]);

  useEffect(() => {
    if (isTempChat && currentChatId) {
      chatHistoryService.markAsTempChat(currentChatId, true).catch(error => {
        Logger.error('ChatController', 'Failed to mark as temp:', error)
      })
    }
  }, [isTempChat, currentChatId])

  /**
   * Desktop: Listen for voice events from input window via IPC
   */
  useEffect(() => {
    if (!isDesktop || isInputWindow || !api?.ipc) return;

    const unsubscribeVoiceTranscription = api.ipc.on('chatInput:voiceTranscription', (data) => {
      Logger.log('ChatController', 'Voice transcription from input window:', data);
      if (typeof data === 'string') {
        handleVoiceTranscription(data, null, true);
      } else {
        handleVoiceTranscription(data.text, data.images, true);
      }
    });

    const unsubscribeVoiceMode = api.ipc.on('chatInput:voiceMode', (isActive) => {
      Logger.log('ChatController', 'Voice mode from input window:', isActive);
      handleVoiceModeChange(isActive);
    });

    const unsubscribeVoiceInterrupt = api.ipc.on('voice:interrupt', () => {
      Logger.log('ChatController', 'Voice interrupt from input window');
      VoiceConversationService.interrupt();
    });

    const unsubscribeVadSpeechDetected = api.ipc.on('voice:vadSpeechDetected', () => {
      // Check if TTS is currently playing in main window
      if (VoiceConversationService.currentState === ConversationStates.SPEAKING) {
        Logger.log('ChatController', 'VAD speech detected while speaking - interrupting TTS');
        
        // Dispatch event to trigger force-complete animation
        const event = new CustomEvent('voiceInterrupt');
        window.dispatchEvent(event);
        
        TTSServiceProxy.stopPlayback();
        VoiceConversationService.interrupt();
      }
    });

    return () => {
      unsubscribeVoiceTranscription?.();
      unsubscribeVoiceMode?.();
      unsubscribeVoiceInterrupt?.();
      unsubscribeVadSpeechDetected?.();
    };
  }, [api, handleVoiceTranscription, handleVoiceModeChange]);

  /**
   * Desktop Main Window: Initialize microphone service and share state with input window.
   */
  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    Logger.log('ChatController', 'Main window: Initializing microphone service...');

    const broadcastMicState = ({ devices, selectedDeviceId }) => {
      if (!api?.ipc) return;

      const serializedDevices = devices.map(device => ({
        deviceId: device.deviceId,
        label: device.label,
        kind: device.kind,
        groupId: device.groupId
      }));

      api.ipc.send('state:micDevices', {
        devices: serializedDevices,
        selectedDeviceId,
      });
    };

    const unsubscribe = MicrophoneService.subscribe(broadcastMicState);

    const initMic = async () => {
      try {
        await MicrophoneService.initialize();
        Logger.log('ChatController', 'Main window: Microphone initialized successfully');
      } catch (error) {
        Logger.error('ChatController', 'Main window: Microphone initialization failed:', error);
      }
    };
    initMic();

    if (api?.ipc) {
      const unsubscribeRequestState = api.ipc.on('mic:requestState', () => {
        broadcastMicState({
          devices: MicrophoneService.getDevices(),
          selectedDeviceId: MicrophoneService.getSelectedDeviceId(),
        });
      });

      const unsubscribeSelectDevice = api.ipc.on('state:selectedMicId', (deviceId) => {
        MicrophoneService.setSelectedDevice(deviceId || null);
      });

      return () => {
        unsubscribe?.();
        unsubscribeRequestState?.();
        unsubscribeSelectDevice?.();
      };
    }

    return () => {
      unsubscribe?.();
    };
  }, [api]);

  /**
   * Desktop Main Window: Initialize camera and listen for IPC commands from input window
   */
  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    Logger.log('ChatController', 'Main window: Initializing camera service...');

    // Subscribe to camera state changes
    const unsubscribe = CameraService.subscribe(({ devices, selectedDeviceId, isActive }) => {
      Logger.log('ChatController', 'Camera state changed:', { devices: devices.length, selectedDeviceId, isActive });
      
      if (api?.ipc) {
        const serializedDevices = devices.map(device => ({
          deviceId: device.deviceId,
          label: device.label,
          kind: device.kind,
          groupId: device.groupId
        }));
        api.ipc.send('state:cameraDevices', { 
          devices: serializedDevices, 
          selectedDeviceId, 
          isActive 
        });
      }
    });

    // Only enumerate camera devices on startup. Camera permission should be requested on explicit toggle.
    const initCamera = async () => {
      try {
        await CameraService.refreshDevices();
        Logger.log('ChatController', 'Camera devices refreshed without permission prompt');
      } catch (error) {
        Logger.error('ChatController', 'Camera device refresh failed:', error);
      }
    };
    initCamera();

    if (api?.ipc) {
      const unsubscribeToggle = api.ipc.on('camera:toggle', async () => {
        Logger.log('ChatController', 'IPC: Camera toggle received');
        try {
          if (CameraService.isRunning()) {
            await CameraService.stop();
          } else {
            await CameraService.start();
          }
        } catch (error) {
          Logger.error('ChatController', 'Camera toggle failed:', error);
        }
      });

      const unsubscribeSelectDevice = api.ipc.on('camera:selectDevice', async (deviceId) => {
        Logger.log('ChatController', 'IPC: Camera select device:', deviceId);
        try {
          await CameraService.setSelectedDevice(deviceId);
        } catch (error) {
          Logger.error('ChatController', 'Camera select device failed:', error);
        }
      });

      return () => {
        unsubscribe?.();
        unsubscribeToggle?.();
        unsubscribeSelectDevice?.();
      };
    }

    return () => {
      unsubscribe?.();
    };
  }, [api]);

  // Initialize screen share service (Desktop main window only for IPC)
  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    Logger.log('ChatController', 'Main window: Initializing screen share service...');

    // Subscribe to screen share state changes
    const unsubscribe = ScreenShareService.subscribe(({ isActive }) => {
      Logger.log('ChatController', 'Screen share state changed:', { isActive });
      
      if (api?.ipc) {
        api.ipc.send('state:screenShare', { isActive });
      }
    });

    const initScreenShare = async () => {
      try {
        await ScreenShareService.initialize();
        Logger.log('ChatController', 'Screen share initialized successfully');
      } catch (error) {
        Logger.error('ChatController', 'Screen share initialization failed:', error);
      }
    };
    initScreenShare();

    if (api?.ipc) {
      const unsubscribeToggle = api.ipc.on('screenShare:toggle', async () => {
        Logger.log('ChatController', 'IPC: Screen share toggle received');
        try {
          if (ScreenShareService.isRunning()) {
            await ScreenShareService.stop();
          } else {
            await ScreenShareService.start();
          }
        } catch (error) {
          Logger.error('ChatController', 'Screen share toggle failed:', error);
        }
      });

      return () => {
        unsubscribe?.();
        unsubscribeToggle?.();
      };
    }

    return () => {
      unsubscribe?.();
    };
  }, [api]);

  /**
   * Abort streaming when chat is closed to stop TTS generation
   */
  useEffect(() => {
    if (!isChatContainerVisible && streamAbortControllerRef.current) {
      Logger.log('ChatController', 'Chat closed, aborting TTS generation stream');
      streamAbortControllerRef.current.abort();
      streamAbortControllerRef.current = null;
      TTSServiceProxy.stopPlayback();
    }
  }, [isChatContainerVisible])

  /**
   * Listen for stop generation event (from stop button, shortcuts, etc.)
   */
  useEffect(() => {
    const handleAbortGeneration = () => {
      if (streamAbortControllerRef.current) {
        Logger.log('ChatController', 'Stop generation event received, aborting TTS stream');
        streamAbortControllerRef.current.abort();
        streamAbortControllerRef.current = null;
        TTSServiceProxy.stopPlayback();
      }
    };

    window.addEventListener('abortTTSGeneration', handleAbortGeneration);

    return () => {
      window.removeEventListener('abortTTSGeneration', handleAbortGeneration);
    };
  }, [])

  /**
   * Get system prompt from AI config based on provider and prompt type
   * @param {Object} aiConfig - AI configuration object
   * @returns {string} System prompt text
   */
  const getSystemPromptFromConfig = (aiConfig) => {
    if (!aiConfig || !aiConfig.provider) {
      return PromptConfig.systemPrompts.default.prompt;
    }
    
    const providerKey = aiConfig.provider === 'chrome-ai' ? 'chromeAi' : aiConfig.provider;
    const providerConfig = aiConfig[providerKey];
    
    if (!providerConfig) {
      return PromptConfig.systemPrompts.default.prompt;
    }
    
    const promptType = providerConfig.systemPromptType || 'default';
    
    if (promptType === 'custom') {
      return providerConfig.systemPrompt || PromptConfig.systemPrompts.default.prompt;
    }
    
    return PromptConfig.systemPrompts[promptType]?.prompt || PromptConfig.systemPrompts.default.prompt;
  };

  /**
   * Handles chat button click to toggle chat visibility.
   */
  const handleChatButtonClick = useCallback(() => {
    Logger.log('ChatController', 'Chat button clicked')
    if (requireSetupOnChatClick) {
      Logger.log('ChatController', 'Setup required before chat - opening setup wizard');
      onRequireSetup?.();
      return;
    }
    
    if (isChatContainerVisible || isChatInputVisible) {
      Logger.log('ChatController', 'Closing chat')
      setIsChatInputVisible(false)
      setIsChatContainerVisible(false)
      TTSServiceProxy.stopPlayback()
    } else {
      Logger.log('ChatController', 'Opening chat')
      setIsChatInputVisible(true)
      setIsChatContainerVisible(true)
      
      // Focus input after chat opens (skip on Android to avoid keyboard popup)
      if (!isAndroid) {
        setTimeout(() => {
          const event = new CustomEvent('focusChatInput');
          window.dispatchEvent(event);
        }, 100);
      }
    }
  }, [requireSetupOnChatClick, onRequireSetup, isChatContainerVisible, isChatInputVisible, setIsChatInputVisible, setIsChatContainerVisible])

  /**
   * Handles chat open from drag-drop.
   */
  const handleChatOpen = useCallback(() => {
    if (!isChatInputVisible || !isChatContainerVisible) {
      Logger.log('ChatController', 'Opening chat from drag-drop')
      setIsChatInputVisible(true)
      setIsChatContainerVisible(true)
      
      // Focus input after chat opens (skip on Android to avoid keyboard popup)
      if (!isAndroid) {
        setTimeout(() => {
          const event = new CustomEvent('focusChatInput');
          window.dispatchEvent(event);
        }, 100);
      }
    }
  }, [isChatInputVisible, isChatContainerVisible, setIsChatInputVisible, setIsChatContainerVisible])

  /**
   * Listens for open chat from drag events.
   */
  useEffect(() => {
    const handleOpenChatFromDrag = () => {
      handleChatOpen()
    }

    window.addEventListener('openChatFromDrag', handleOpenChatFromDrag)

    return () => {
      window.removeEventListener('openChatFromDrag', handleOpenChatFromDrag)
    }
  }, [handleChatOpen])

  useEffect(() => {
    if (!isAndroid || !modelDisabled) return;
    if (!isAssistantReady) return;
    if (hasAutoOpenedAndroidChatRef.current) return;
    if (isChatContainerVisible || isChatInputVisible) return;

    hasAutoOpenedAndroidChatRef.current = true;
    Logger.log('ChatController', 'Auto-opening chat on Android in chat-only mode');
    setIsChatInputVisible(true);
    setIsChatContainerVisible(true);
  }, [
    modelDisabled,
    isAssistantReady,
    isChatContainerVisible,
    isChatInputVisible,
    setIsChatInputVisible,
    setIsChatContainerVisible,
  ]);

  /**
   * Listens for drag-drop events and stores as pending if chat isn't open yet.
   */
  useEffect(() => {
    const handleChatDragDropEvent = (event) => {
      Logger.log('ChatController', 'chatDragDrop event received:', event.detail)
      
      if (!isChatInputVisible) {
        Logger.log('ChatController', 'Storing drop data as pending (chat not open yet)')
        setPendingDropData(event.detail)
      }
    }

    window.addEventListener('chatDragDrop', handleChatDragDropEvent)

    return () => {
      window.removeEventListener('chatDragDrop', handleChatDragDropEvent)
    }
  }, [isChatInputVisible, setPendingDropData])

  /**
   * Handles chat input close with fade-out animation.
   */
  const handleChatInputClose = () => {
    Logger.log('ChatController', 'Chat input closed')
    
    const event = new CustomEvent('closeChat');
    window.dispatchEvent(event);
    
    setIsChatInputVisible(false)
  }

  /**
   * Streams AI response with TTS generation.
   */
  const streamAIResponse = async () => {
    // Create abort controller for this stream
    const abortController = new AbortController();
    streamAbortControllerRef.current = abortController;
    
    const autoTTSSessionId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let savedConfig, ttsConfig;
    try {
      savedConfig = await StorageServiceProxy.configLoad('aiConfig', DefaultAIConfig);
      ttsConfig = await StorageServiceProxy.configLoad('ttsConfig', DefaultTTSConfig);
    } catch (configError) {
      Logger.warn('ChatController', 'Failed to load config:', configError);
      savedConfig = DefaultAIConfig;
      ttsConfig = DefaultTTSConfig;
    }
    
    const systemPrompt = getSystemPromptFromConfig(savedConfig);
    const messages = ChatService.getFormattedMessages(systemPrompt);
    
    // DOCUMENT INTERACTION: Extract page context based on user query
    // SKIP if user has attachments (images/audios) or on Android/Desktop platforms
    const lastUserMessage = ChatService.getLastUserMessage();
    const hasAttachments = lastUserMessage && (
      (lastUserMessage.images && lastUserMessage.images.length > 0) ||
      (lastUserMessage.audios && lastUserMessage.audios.length > 0)
    );
    
    if (lastUserMessage && lastUserMessage.content && !hasAttachments && !isAndroid && !isDesktop) {
      Logger.log('ChatController', 'Starting document interaction analysis...');
      
      // Check if aborted before starting
      if (abortController.signal.aborted) {
        Logger.log('ChatController', 'Document interaction cancelled before starting');
        return { success: false, cancelled: true };
      }
      
      try {
        // Create AI send function for the analyzer (with utility session option)
        const aiSendMessage = async (messages, onStream, options) => {
          return await AIServiceProxy.sendMessage(messages, onStream, options);
        };
        
        const pageContext = await DocumentInteractionService.getContextForQuery(
          lastUserMessage.content, 
          aiSendMessage,
          abortController.signal
        );
        
        // Check if aborted after document interaction
        if (abortController.signal.aborted) {
          Logger.log('ChatController', 'Stream cancelled after document interaction');
          return { success: false, cancelled: true };
        }
        
        Logger.log('ChatController', 'Document interaction complete, message count:', ChatService.getMessages().length);
        
        if (pageContext) {
          Logger.log('ChatController', 'Injecting page context into AI prompt');
          // Add context to the last user message
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === 'user') {
            lastMessage.content = pageContext + lastMessage.content;
          }
        }
      } catch (error) {
        Logger.warn('ChatController', 'Failed to extract page context:', error);
        // Continue without context - non-critical error
      }
    } else if (hasAttachments) {
      Logger.log('ChatController', 'Skipping document interaction - user has attachments (images/audios)');
    }
    
    const ttsEnabled = ttsConfig.enabled && TTSServiceProxy.isConfigured();
    
    Logger.log('ChatController', 'System prompt:', systemPrompt);
    Logger.log('ChatController', 'Messages to AI:', messages);
    
    if (ttsEnabled) {
      TTSServiceProxy.resumePlayback();
    }
    
    let fullResponse = '';
    let fullResponseRaw = ''; // Raw response with <think> tags (for tracking)
    let previousDisplayLength = 0; // Track how much we've already processed for TTS
    let hasSwitchedToSpeaking = false;
    let textBuffer = '';
    const allChunks = [];
    let nextChunkToGenerate = 0;
    const MAX_QUEUED_AUDIO = 3;
    let isGeneratingChunk = false;

    /**
     * Generates TTS for a text chunk with lip sync.
     * 
     * @param {number} chunkIndex - Index of chunk to generate
     */
    const generateTTSChunk = async (chunkIndex) => {
      // Check if aborted (stop button pressed, chat closed, etc.)
      if (abortController.signal.aborted) {
        Logger.log('ChatController', 'TTS generation aborted, stopping chunk generation');
        return;
      }
      
      if (chunkIndex >= allChunks.length) return;
      
      const chunkText = allChunks[chunkIndex];
      
      if (!chunkText || typeof chunkText !== 'string' || chunkText.trim().length === 0) {
        Logger.warn('ChatController', 'Skipping empty/invalid chunk ${chunkIndex}:', chunkText);
        return;
      }
      
      Logger.log('ChatController', `Generating TTS for chunk ${chunkIndex}: "${chunkText.substring(0, 100)}..." (type: ${typeof chunkText}, length: ${chunkText.length})`);
      
      if (TTSServiceProxy.isStopped) {
        return;
      }

      try {
        const result = await TTSServiceProxy.generateSpeech(chunkText, true);
        
        // Check again after async operation
        if (abortController.signal.aborted || !result || !result.audio) {
          if (abortController.signal.aborted) {
            Logger.log('ChatController', 'TTS generation aborted after speech generation');
          } else {
            Logger.warn('ChatController', `TTS generation returned null for chunk ${chunkIndex}`);
          }
          return;
        }
        
        const { audio, bvmdUrl } = result;
        
        if (TTSServiceProxy.isStopped || abortController.signal.aborted) {
          return;
        }

        const audioBlob = audio instanceof Blob ? audio : new Blob([audio], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        TTSServiceProxy.queueAudio(chunkText, audioUrl, bvmdUrl, autoTTSSessionId);
      } catch (ttsError) {
        Logger.warn('ChatController', 'TTS generation failed for chunk ${chunkIndex}:', ttsError);
      }
    };

    /**
     * Generates next chunk if queue has space.
     */
    const tryGenerateNextChunk = async () => {
      // Check if aborted before generating
      if (abortController.signal.aborted) {
        Logger.log('ChatController', 'TTS chunk generation stopped (aborted)');
        return;
      }
      
      if (isGeneratingChunk) {
        return;
      }
      
      const queueLength = TTSServiceProxy.getQueueLength();
      
      if (queueLength < MAX_QUEUED_AUDIO && nextChunkToGenerate < allChunks.length) {
        isGeneratingChunk = true;
        await generateTTSChunk(nextChunkToGenerate++);
        isGeneratingChunk = false;
        
        // Check if aborted before scheduling next
        if (!abortController.signal.aborted && nextChunkToGenerate < allChunks.length) {
          setTimeout(() => tryGenerateNextChunk(), 0);
        }
      }
    };

    const handleAudioFinished = () => {
      // Only continue generating if not aborted
      if (!abortController.signal.aborted) {
        tryGenerateNextChunk();
      } else {
        Logger.log('ChatController', 'Audio finished but generation aborted, not generating next chunk');
      }
    };
    TTSServiceProxy.addEventListener('audioFinished', handleAudioFinished);

    const result = await AIServiceProxy.sendMessage(messages, async (chunk) => {
      if (abortController.signal.aborted) {
        Logger.log('ChatController', 'Streaming callback aborted, ignoring chunk');
        return;
      }
      
      // Add chunk to raw response
      fullResponseRaw += chunk;
      
      // Remove all <think>...</think> blocks (including incomplete ones at the end)
      // This regex handles complete think blocks
      let displayResponse = fullResponseRaw.replace(/<think>[\s\S]*?<\/think>/g, '');
      
      // Remove incomplete opening <think> tag at the end (if chunk ended mid-tag)
      displayResponse = displayResponse.replace(/<think>.*$/s, '');
      
      // Remove leading newlines/whitespace from the response
      displayResponse = displayResponse.replace(/^\s+/, '');
      
      // Update fullResponse with filtered content
      fullResponse = displayResponse;
      
      // Get only the new content since last update for TTS
      const newContent = displayResponse.slice(previousDisplayLength);
      textBuffer += newContent;
      previousDisplayLength = displayResponse.length;

      const currentMessages = ChatService.getMessages();
      Logger.log('ChatController', 'Streaming chunk received, current message count:', currentMessages.length);
      if (currentMessages.length > 0 && 
          currentMessages[currentMessages.length - 1].role === 'assistant') {
        Logger.log('ChatController', 'Updating existing assistant message');
        ChatService.updateLastMessage(fullResponse);
      } else {
        Logger.log('ChatController', 'Adding new assistant message (no existing one found!)');
        ChatService.addMessage('assistant', fullResponse);
      }
      setChatMessages([...ChatService.getMessages()]);

      if (!ttsEnabled && !hasSwitchedToSpeaking && fullResponse.length > 10 && assistantRef.current?.isReady()) {
        assistantRef.current.triggerAction('speak');
        hasSwitchedToSpeaking = true;
      }

      if (ttsEnabled) {
        const sentenceEnd = /[.!?:]\s|[.!?:]\n|\n/.exec(textBuffer);
        
        if (sentenceEnd) {
          const chunkToSpeak = textBuffer.substring(0, sentenceEnd.index + sentenceEnd[0].length).trim();
          textBuffer = textBuffer.substring(sentenceEnd.index + sentenceEnd[0].length);
          
          if (chunkToSpeak && chunkToSpeak.length >= 3 && chunkToSpeak.trim().length >= 3) {
            allChunks.push(chunkToSpeak);
            
            if (!isGeneratingChunk && TTSServiceProxy.getQueueLength() < MAX_QUEUED_AUDIO) {
              tryGenerateNextChunk();
            }
          }
        }
      }
    });

    if (result.cancelled) {
      Logger.log('ChatController', 'Generation cancelled by user');
      TTSServiceProxy.stopPlayback();
      TTSServiceProxy.removeEventListener('audioFinished', handleAudioFinished);
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle();
      }
      streamAbortControllerRef.current = null;
      setIsProcessing(false);
      return { success: false, cancelled: true };
    }

    if (!result.success) {
      const errorMessage = result.error?.message || 'Unknown error occurred';
      Logger.error('ChatController', 'AI error:', result.error);
      
      // Add error message to chat
      ChatService.addMessage('assistant', `Error: ${errorMessage}`);
      setChatMessages([...ChatService.getMessages()]);
      
      // Clean up TTS and event listeners
      TTSServiceProxy.stopPlayback();
      TTSServiceProxy.removeEventListener('audioFinished', handleAudioFinished);
      
      // Reset assistant animation
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle();
      }
      
      streamAbortControllerRef.current = null;
      setIsProcessing(false);
      return { success: false, error: errorMessage };
    }

    if (ttsEnabled && textBuffer.trim().length > 0) {
      const finalChunk = textBuffer.trim();
      allChunks.push(finalChunk);
      tryGenerateNextChunk();
    }

    if (ttsEnabled && allChunks.length > 0) {
      // Wait for all chunks to be generated, but abort if cancelled
      while (nextChunkToGenerate < allChunks.length && !abortController.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (abortController.signal.aborted) {
        Logger.log('ChatController', 'TTS chunk generation aborted while waiting for completion');
      }
    }
    
    TTSServiceProxy.removeEventListener('audioFinished', handleAudioFinished);
    
    // Clear abort controller on successful completion
    streamAbortControllerRef.current = null;

    return { success: true, fullResponse };
  };

  /**
   * Handles text message submission.
   * 
   * @param {string} message - User message
   * @param {Array} images - Image attachments
   * @param {Array} audios - Audio attachments
   */
  const handleMessageSend = async (message, images = null, audios = null) => {
    const attachmentInfo = [];
    if (images && images.length > 0) attachmentInfo.push(`${images.length} image(s)`);
    if (audios && audios.length > 0) attachmentInfo.push(`${audios.length} audio(s)`);
    const attachmentStr = attachmentInfo.length > 0 ? ` with ${attachmentInfo.join(' and ')}` : '';
    Logger.log('ChatController', 'Message sent:', message, attachmentStr);

    // Cancel any ongoing stream (including document interaction)
    if (streamAbortControllerRef.current) {
      Logger.log('ChatController', 'Aborting ongoing stream (including document interaction)');
      streamAbortControllerRef.current.abort();
      streamAbortControllerRef.current = null;
    }
    
    // Also abort AI generation if it's running
    if (AIServiceProxy.isGenerating()) {
      Logger.log('ChatController', 'Aborting ongoing AI generation');
      AIServiceProxy.abortRequest();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    ChatService.addMessage('user', message, images, audios);
    setChatMessages(ChatService.getMessages());

    setIsProcessing(true);

    TTSServiceProxy.stopPlayback();

    if (!AIServiceProxy.isConfigured()) {
      ChatService.addMessage('assistant', 'Error: AI not configured. Please configure in Control Panel.');
      setChatMessages([...ChatService.getMessages()]);
      setIsProcessing(false);
      return;
    }

    Logger.log('ChatController', 'Checking assistant ready state:', {
      hasRef: !!assistantRef.current,
      isReady: assistantRef.current?.isReady?.(),
    });
    
    if (assistantRef.current?.isReady()) {
      Logger.log('ChatController', 'Starting BUSY state (thinking animation)');
      await assistantRef.current.setState('BUSY');
      Logger.log('ChatController', 'BUSY state set successfully');
    } else {
      Logger.warn('ChatController', 'Assistant not ready, skipping BUSY state');
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await streamAIResponse();

    if (!result.success) {
      return;
    }

    setIsProcessing(false);

    if (!isTempChat && chatMessages.length > 0) {
      try {
        let chatId = currentChatId;
        if (!chatId) {
          chatId = chatHistoryService.generateChatId();
          setCurrentChatId(chatId);
        }

        const sourceUrl = window.location.href;

        await chatHistoryService.saveChat({
          chatId,
          chatService: ChatService,
          messages: ChatService.getMessages(),
          isTemp: false,
          metadata: {
            sourceUrl,
          },
        });

        Logger.log('ChatController', 'Chat auto-saved after AI response:', chatId);
      } catch (error) {
        Logger.error('ChatController', 'Failed to auto-save chat:', error);
      }
    }
  };

  /**
   * Register transcription callback with VoiceConversationService
   * Main window only - ChatInput not rendered in desktop main window
   */
  useEffect(() => {
    if (isInputWindow) return;

    VoiceConversationService.setTranscriptionCallback(handleVoiceTranscription);

    return () => {
      VoiceConversationService.setTranscriptionCallback(null);
    };
  }, [handleVoiceTranscription]);

  /**
   * IPC bridge for desktop mode - listen for events from input window
   */
  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    if (!api?.ipc) return;

    const unsubscribeSend = api.ipc.on('chatInput:send', ({ message, images, audios }) => {
      Logger.log('ChatController', 'Received send from input window via IPC', { message, images, audios });
      handleMessageSend(message, images, audios);
    });

    const unsubscribePendingDrop = api.ipc.on('chatInput:setPendingDropData', (data) => {
      Logger.log('ChatController', 'Received setPendingDropData from input window via IPC', data);
      setPendingDropData(data);
    });

    const unsubscribeClose = api.ipc.on('chatInput:close', () => {
      Logger.log('ChatController', 'Received close from input window via IPC');
      closeChat();
    });

    return () => {
      unsubscribeSend?.();
      unsubscribePendingDrop?.();
      unsubscribeClose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPendingDropData, api]);

  /**
   * IPC state broadcast for desktop mode - send state changes to input window
   * This runs only in the main window to broadcast state to input window
   */
  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    if (!api?.ipc) return;

    api.ipc.send('state:isChatInputVisible', isChatInputVisible);
  }, [isChatInputVisible, api]);

  useEffect(() => {
    if (!isDesktop || isInputWindow) {
      return;
    }

    if (!api?.ipc) return;

    api.ipc.send('state:pendingDropData', pendingDropData);
  }, [pendingDropData, api]);

  /**
   * Handles drag-drop onto ChatContainer.
   * Forwards dropped content to ChatInput.
   * 
   * @param {Object} dropData - Drop data with text/images/audios
   */
  const handleDragDrop = useCallback((dropData) => {
    Logger.log('ChatController', 'Drag drop received:', dropData);
    
    const normalizedData = {
      text: dropData.text || '',
      images: dropData.images || [],
      audios: dropData.audios || [],
      errors: dropData.errors || []
    };
    
    const event = new CustomEvent('chatDragDrop', { 
      detail: normalizedData 
    });
    window.dispatchEvent(event);
  }, []);

  /**
   * Handles streaming regeneration (called by AppContext).
   */
  const handleRegenerateWithStreaming = async () => {
    Logger.log('ChatController', 'Regenerating with streaming');
    
    setIsProcessing(true);
    TTSServiceProxy.stopPlayback();
    
    if (assistantRef.current?.isReady()) {
      await assistantRef.current.setState('BUSY');
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await streamAIResponse();
    
    setIsProcessing(false);
  };
  
  useEffect(() => {
    if (regenerateWithStreamingRef) {
      regenerateWithStreamingRef.current = handleRegenerateWithStreaming;
    }
    if (editWithStreamingRef) {
      editWithStreamingRef.current = handleRegenerateWithStreaming;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenerateWithStreamingRef, editWithStreamingRef]);

  return (
    <>
      {/* Desktop input window manager */}
      {isDesktop && <InputWindowManager />}
      
      {/* AI Toolbar - appears on text/image selection */}
      <AIToolbar />
      
      {/* Chat Button visibility logic:
          - Model enabled: visible when model ready, HIDE when chat opens (model is anchor)
          - Model disabled: ALWAYS visible (button is anchor, needed for dragging) */}
      <ChatButton
        onClick={handleChatButtonClick}
        isVisible={modelDisabled ? true : (isAssistantReady && !(isChatContainerVisible || isChatInputVisible))}
        modelDisabled={modelDisabled}
        isChatOpen={isChatContainerVisible || isChatInputVisible}
        chatInputRef={chatInputRef}
      />

      {/* Chat Input - bottom screen */}
      {!isDesktop && (
        <ChatInput
          ref={chatInputRef}
          onSend={handleMessageSend}
          onClose={handleChatInputClose}
          onVoiceTranscription={handleVoiceTranscription}
          onVoiceMode={handleVoiceModeChange}
        />
      )}

      {/* Chat Container - message bubbles */}
      <ChatContainer
        modelDisabled={modelDisabled}
        onDragDrop={handleDragDrop}
      />
    </>
  )
}

export default ChatController
