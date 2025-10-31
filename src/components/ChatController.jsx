/**
 * @fileoverview Main chat controller managing chat UI, streaming, and voice conversation.
 */

import { useEffect, useRef, useCallback } from 'react'
import ChatButton from './ChatButton'
import ChatInput from './ChatInput'
import ChatContainer from './ChatContainer'
import AIToolbar from './AIToolbar'
import ChatService from '../services/ChatService'
import { AIServiceProxy, TTSServiceProxy, StorageServiceProxy } from '../services/proxies'
import VoiceConversationService, { ConversationStates } from '../services/VoiceConversationService'
import { DefaultAIConfig, DefaultTTSConfig } from '../config/aiConfig'
import chatHistoryService from '../services/ChatHistoryService'
import { useApp } from '../contexts/AppContext'
import Logger from '../services/Logger';

/**
 * Main chat controller component.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {boolean} props.modelDisabled - Whether model is disabled
 * @returns {JSX.Element} Chat controller component
 */
const ChatController = ({ 
  modelDisabled = false
}) => {
  const chatInputRef = useRef(null);
  
  const {
    assistantRef,
    isAssistantReady,
    isChatInputVisible,
    isChatContainerVisible,
    chatMessages,
    isVoiceMode,
    currentChatId,
    isTempChat,
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
  } = useApp();

  /**
   * Track voice conversation state to update isSpeaking
   * Note: This is now handled in AppContext, but we keep local tracking
   * for any component-specific logic
   */
  useEffect(() => {
    const handleStateChange = (state) => {
      setIsSpeaking(state === ConversationStates.SPEAKING);
    };

    VoiceConversationService.setStateChangeCallback(handleStateChange);

    return () => {
      VoiceConversationService.setStateChangeCallback(null);
    };
  }, [setIsSpeaking]);

  /**
   * Poll TTSService to track playback state for non-voice mode
   * This ensures stop button works even in regular chat when TTS is playing
   * Note: This is now handled in AppContext, but we keep local tracking
   */
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isVoiceMode) {
        const isPlaying = TTSServiceProxy.isCurrentlyPlaying();
        setIsSpeaking(isPlaying);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isVoiceMode, setIsSpeaking]);

  useEffect(() => {
    if (isTempChat && currentChatId) {
      chatHistoryService.markAsTempChat(currentChatId, true).catch(error => {
        Logger.error('ChatController', 'Failed to mark as temp:', error)
      })
    }
  }, [isTempChat, currentChatId])

  /**
   * Handles chat button click to toggle chat visibility.
   */
  const handleChatButtonClick = useCallback(() => {
    Logger.log('ChatController', 'Chat button clicked')
    
    if (isChatContainerVisible || isChatInputVisible) {
      Logger.log('ChatController', 'Closing chat')
      setIsChatInputVisible(false)
      setIsChatContainerVisible(false)
      TTSServiceProxy.stopPlayback()
    } else {
      Logger.log('ChatController', 'Opening chat')
      setIsChatInputVisible(true)
      setIsChatContainerVisible(true)
    }
  }, [isChatContainerVisible, isChatInputVisible, setIsChatInputVisible, setIsChatContainerVisible])

  /**
   * Handles chat open from drag-drop.
   */
  const handleChatOpen = useCallback(() => {
    if (!isChatInputVisible || !isChatContainerVisible) {
      Logger.log('ChatController', 'Opening chat from drag-drop')
      setIsChatInputVisible(true)
      setIsChatContainerVisible(true)
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
    
    const systemPrompt = savedConfig.systemPrompt || DefaultAIConfig.systemPrompt;
    const messages = ChatService.getFormattedMessages(systemPrompt);
    const ttsEnabled = ttsConfig.enabled && TTSServiceProxy.isConfigured();
    
    Logger.log('ChatController', 'System prompt:', systemPrompt);
    Logger.log('ChatController', 'Messages to AI:', messages);
    
    if (ttsEnabled) {
      TTSServiceProxy.resumePlayback();
    }
    
    let fullResponse = '';
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
        
        if (!result || !result.audio) {
          Logger.warn('ChatController', `TTS generation returned null for chunk ${chunkIndex}`);
          return;
        }
        
        const { audio, bvmdUrl } = result;
        
        if (TTSServiceProxy.isStopped) {
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
      if (isGeneratingChunk) {
        return;
      }
      
      const queueLength = TTSServiceProxy.getQueueLength();
      
      if (queueLength < MAX_QUEUED_AUDIO && nextChunkToGenerate < allChunks.length) {
        isGeneratingChunk = true;
        await generateTTSChunk(nextChunkToGenerate++);
        isGeneratingChunk = false;
        
        if (nextChunkToGenerate < allChunks.length) {
          setTimeout(() => tryGenerateNextChunk(), 0);
        }
      }
    };

    TTSServiceProxy.setAudioFinishedCallback(() => {
      tryGenerateNextChunk();
    });

    const result = await AIServiceProxy.sendMessage(messages, async (chunk) => {
      fullResponse += chunk;
      textBuffer += chunk;

      const currentMessages = ChatService.getMessages();
      if (currentMessages.length > 0 && 
          currentMessages[currentMessages.length - 1].role === 'assistant') {
        ChatService.updateLastMessage(fullResponse);
      } else {
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
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle();
      }
      setIsProcessing(false);
      return { success: false, cancelled: true };
    }

    if (!result.success) {
      const errorMessage = result.error?.message || 'Unknown error occurred';
      Logger.error('ChatController', 'AI error:', result.error);
      ChatService.addMessage('assistant', `Error: ${errorMessage}`);
      setChatMessages([...ChatService.getMessages()]);
      TTSServiceProxy.stopPlayback();
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle();
      }
      setIsProcessing(false);
      return { success: false, error: errorMessage };
    }

    if (ttsEnabled && textBuffer.trim().length > 0) {
      const finalChunk = textBuffer.trim();
      allChunks.push(finalChunk);
      tryGenerateNextChunk();
    }

    if (ttsEnabled && allChunks.length > 0) {
      while (nextChunkToGenerate < allChunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    TTSServiceProxy.setAudioFinishedCallback(null);

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

    if (AIServiceProxy.isGenerating()) {
      Logger.log('ChatController', 'Aborting ongoing AI generation before adding new message');
      AIServiceProxy.abortRequest();
      await new Promise(resolve => setTimeout(resolve, 50));
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
   * Handles voice mode transcription.
   * 
   * @param {string} text - Transcribed text from speech
   */
  const handleVoiceTranscription = async (text) => {
    Logger.log('ChatController', 'Voice transcription received:', text)
    
    if (!text || !text.trim()) {
      Logger.warn('ChatController', 'Empty transcription, returning to listening')
      setTimeout(() => {
        if (VoiceConversationService.isConversationActive()) {
          VoiceConversationService.changeState(ConversationStates.LISTENING)
        }
      }, 500)
      return
    }
    
    ChatService.addMessage('user', text);
    setChatMessages(ChatService.getMessages());
    
    await handleVoiceAIResponse()
  }

  /**
   * Handles AI response in voice mode.
   * Gets AI response and speaks it through VoiceConversationService.
   */
  const handleVoiceAIResponse = async () => {
    setIsProcessing(true)

    if (!AIServiceProxy.isConfigured()) {
      ChatService.addMessage('assistant', 'Error: AI not configured. Please configure in Control Panel.');
      setChatMessages([...ChatService.getMessages()]);
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
    
    const systemPrompt = voiceAIConfig.systemPrompt || DefaultAIConfig.systemPrompt
    const ttsEnabled = voiceTTSConfig.enabled && TTSServiceProxy.isConfigured()

    const messages = ChatService.getFormattedMessages(systemPrompt)

    if (ttsEnabled) {
      TTSServiceProxy.resumePlayback()
    }

    let fullResponse = ''
    let hasSwitchedToSpeaking = false
    let textBuffer = ''
    const allChunks = []
    let nextChunkToGenerate = 0
    const MAX_QUEUED_AUDIO = 3
    let isGeneratingChunk = false

    const voiceTTSSessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    /**
     * Generates TTS chunk with lip sync for voice mode.
     * 
     * @param {number} chunkIndex - Index of chunk to generate
     */
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

    /**
     * Generates next chunk if queue has space.
     */
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

    TTSServiceProxy.setAudioFinishedCallback(() => {
      tryGenerateNextChunk()
    })

    const result = await AIServiceProxy.sendMessage(messages, async (chunk) => {
      fullResponse += chunk
      textBuffer += chunk

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
      Logger.log('ChatController', `[Voice] Waiting for ${allChunks.length} TTS chunks...`)
      
      while (nextChunkToGenerate < allChunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      Logger.log('ChatController', '[Voice] All TTS generations complete')
    } else {
      Logger.warn('ChatController', '[Voice] No TTS generated, returning to listening')
      VoiceConversationService.changeState(ConversationStates.LISTENING)
    }

    setIsProcessing(false);
  }

  /**
   * Handles voice mode toggle.
   * 
   * @param {boolean} active - Whether voice mode is active
   */
  const handleVoiceModeChange = useCallback((active) => {
    Logger.log('ChatController', 'Voice mode changed:', active)
    setIsVoiceMode(active)
  }, [setIsVoiceMode])

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
      <ChatInput
        ref={chatInputRef}
        onSend={handleMessageSend}
        onClose={handleChatInputClose}
        onVoiceTranscription={handleVoiceTranscription}
        onVoiceMode={handleVoiceModeChange}
      />

      {/* Chat Container - message bubbles */}
      <ChatContainer
        modelDisabled={modelDisabled}
        onDragDrop={handleDragDrop}
      />
    </>
  )
}

export default ChatController
