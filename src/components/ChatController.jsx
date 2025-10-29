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

const ChatController = ({ 
  modelDisabled = false
}) => {
  const chatInputRef = useRef(null);
  
  // Get shared state and actions from AppContext
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
      // Only track TTS playback in non-voice mode
      // (voice mode uses VoiceConversationService state)
      if (!isVoiceMode) {
        const isPlaying = TTSServiceProxy.isCurrentlyPlaying();
        setIsSpeaking(isPlaying);
      }
    }, 100); // Check every 100ms

    return () => clearInterval(interval);
  }, [isVoiceMode, setIsSpeaking]);

  /**
   * Note: Event listeners for closeChat, clearChat, stopGeneration, and loadChatFromHistory
   * are now handled by AppContext. This component focuses on message handling logic.
   */

  /**
   * Note: Auto-save logic is now handled by AppContext
   */

  /**
   * Handle temp mode toggle - delete from history if switching to temp
   */
  useEffect(() => {
    // If user marks chat as temp, don't save anymore
    // Next time they clear chat, it will be deleted if it's marked as temp
    if (isTempChat && currentChatId) {
      chatHistoryService.markAsTempChat(currentChatId, true).catch(error => {
        console.error('[ChatController] Failed to mark as temp:', error)
      })
    }
  }, [isTempChat, currentChatId])

  /**
   * Handle chat button click - toggle chat visibility
   */
  const handleChatButtonClick = useCallback(() => {
    console.log('[ChatController] Chat button clicked')
    
    // If chat is open, close it
    if (isChatContainerVisible || isChatInputVisible) {
      console.log('[ChatController] Closing chat')
      setIsChatInputVisible(false)
      setIsChatContainerVisible(false)
      TTSServiceProxy.stopPlayback()
    } else {
      // Otherwise, open it
      console.log('[ChatController] Opening chat')
      setIsChatInputVisible(true)
      setIsChatContainerVisible(true)
    }
  }, [isChatContainerVisible, isChatInputVisible, setIsChatInputVisible, setIsChatContainerVisible])

  /**
   * Handle chat open from drag-drop (just opens, doesn't toggle)
   */
  const handleChatOpen = useCallback(() => {
    if (!isChatInputVisible || !isChatContainerVisible) {
      console.log('[ChatController] Opening chat from drag-drop')
      setIsChatInputVisible(true)
      setIsChatContainerVisible(true)
    }
  }, [isChatInputVisible, isChatContainerVisible, setIsChatInputVisible, setIsChatContainerVisible])

  /**
   * Listen for open chat from drag events
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
   * Listen for drag-drop events and store as pending if chat isn't open yet
   */
  useEffect(() => {
    const handleChatDragDropEvent = (event) => {
      console.log('[ChatController] chatDragDrop event received:', event.detail)
      
      // If chat is visible, the event will be handled by ChatInput directly
      // If not visible, store it as pending data
      if (!isChatInputVisible) {
        console.log('[ChatController] Storing drop data as pending (chat not open yet)')
        setPendingDropData(event.detail)
      }
      // If chat is visible, ChatInput will handle the event directly
    }

    window.addEventListener('chatDragDrop', handleChatDragDropEvent)

    return () => {
      window.removeEventListener('chatDragDrop', handleChatDragDropEvent)
    }
  }, [isChatInputVisible, setPendingDropData])

  /**
   * Handle chat input close - hide input and container with fade-out animation
   */
  const handleChatInputClose = () => {
    console.log('[ChatController] Chat input closed')
    
    const event = new CustomEvent('closeChat');
    window.dispatchEvent(event);
    
    // Also hide input immediately (input doesn't need animation)
    setIsChatInputVisible(false)
  }

  /**
   * Stream AI response with TTS generation
   */
  const streamAIResponse = async () => {
    const autoTTSSessionId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Load configs
    let savedConfig, ttsConfig;
    try {
      savedConfig = await StorageServiceProxy.configLoad('aiConfig', DefaultAIConfig);
      ttsConfig = await StorageServiceProxy.configLoad('ttsConfig', DefaultTTSConfig);
    } catch (configError) {
      console.warn('[ChatController] Failed to load config:', configError);
      savedConfig = DefaultAIConfig;
      ttsConfig = DefaultTTSConfig;
    }
    
    const systemPrompt = savedConfig.systemPrompt || DefaultAIConfig.systemPrompt;
    const messages = ChatService.getFormattedMessages(systemPrompt);
    const ttsEnabled = ttsConfig.enabled && TTSServiceProxy.isConfigured();
    
    console.log('[ChatController] System prompt:', systemPrompt);
    console.log('[ChatController] Messages to AI:', messages);
    
    // Resume TTS playback
    if (ttsEnabled) {
      TTSServiceProxy.resumePlayback();
    }
    
    // Stream AI response with just-in-time TTS generation
    let fullResponse = '';
    let hasSwitchedToSpeaking = false;
    let textBuffer = ''; // Buffer for TTS chunking
    const allChunks = []; // All text chunks (stored, not generated yet)
    let nextChunkToGenerate = 0; // Index of next chunk to generate
    const MAX_QUEUED_AUDIO = 3; // Only queue up to 3 audio chunks ahead
    let isGeneratingChunk = false; // Track if chunk generation is in progress

    /**
     * Generate TTS for a text chunk with lip sync
     */
    const generateTTSChunk = async (chunkIndex) => {
      if (chunkIndex >= allChunks.length) return;
      
      const chunkText = allChunks[chunkIndex];
      
      // Validate chunk text exists and is not empty
      if (!chunkText || typeof chunkText !== 'string' || chunkText.trim().length === 0) {
        console.warn(`[ChatController] Skipping empty/invalid chunk ${chunkIndex}:`, chunkText);
        return;
      }
      
      console.log(`[ChatController] Generating TTS for chunk ${chunkIndex}: "${chunkText.substring(0, 100)}..." (type: ${typeof chunkText}, length: ${chunkText.length})`);
      
      // Check if stopped
      if (TTSServiceProxy.isStopped) {
        return;
      }

      try {
        // Generate TTS audio + lip sync (VMD -> BVMD)
        const result = await TTSServiceProxy.generateSpeech(chunkText, true);
        
        // Check if result is null or missing audio
        if (!result || !result.audio) {
          console.warn(`[ChatController] TTS generation returned null for chunk ${chunkIndex}`);
          return;
        }
        
        const { audio, bvmdUrl } = result;
        
        // Check again if stopped after generation
        if (TTSServiceProxy.isStopped) {
          return;
        }

        // Create audio URL from the returned audio (Blob or ArrayBuffer)
        const audioBlob = audio instanceof Blob ? audio : new Blob([audio], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Queue audio with BVMD for synchronized lip sync
        TTSServiceProxy.queueAudio(chunkText, audioUrl, bvmdUrl, autoTTSSessionId);
      } catch (ttsError) {
        console.warn(`[ChatController] TTS generation failed for chunk ${chunkIndex}:`, ttsError);
      }
    };

    // Generate next chunk if queue has space
    const tryGenerateNextChunk = async () => {
      // Don't start new generation if one is already in progress
      if (isGeneratingChunk) {
        return;
      }
      
      const queueLength = TTSServiceProxy.getQueueLength();
      
      // Only generate if queue has room AND we have more chunks
      if (queueLength < MAX_QUEUED_AUDIO && nextChunkToGenerate < allChunks.length) {
        isGeneratingChunk = true;
        await generateTTSChunk(nextChunkToGenerate++);
        isGeneratingChunk = false;
        
        // Continue generating if there's room (non-blocking)
        if (nextChunkToGenerate < allChunks.length) {
          setTimeout(() => tryGenerateNextChunk(), 0);
        }
      }
    };

    // Register callback to generate next chunk when audio finishes playing
    TTSServiceProxy.setAudioFinishedCallback(() => {
      tryGenerateNextChunk();
    });

    const result = await AIServiceProxy.sendMessage(messages, async (chunk) => {
      fullResponse += chunk;
      textBuffer += chunk;

      // Update streaming response in real-time
      const currentMessages = ChatService.getMessages();
      if (currentMessages.length > 0 && 
          currentMessages[currentMessages.length - 1].role === 'assistant') {
        ChatService.updateLastMessage(fullResponse);
      } else {
        ChatService.addMessage('assistant', fullResponse);
      }
      setChatMessages([...ChatService.getMessages()]);

      // If TTS disabled, trigger speak animation after some text (no audio to sync with)
      if (!ttsEnabled && !hasSwitchedToSpeaking && fullResponse.length > 10 && assistantRef.current?.isReady()) {
        assistantRef.current.triggerAction('speak');
        hasSwitchedToSpeaking = true;
      }

      // TTS Generation: Look for complete sentences and generate immediately
      if (ttsEnabled) {
        // Look for sentence boundaries
        const sentenceEnd = /[.!?:]\s|[.!?:]\n|\n/.exec(textBuffer);
        
        if (sentenceEnd) {
          // Found a sentence boundary
          const chunkToSpeak = textBuffer.substring(0, sentenceEnd.index + sentenceEnd[0].length).trim();
          textBuffer = textBuffer.substring(sentenceEnd.index + sentenceEnd[0].length);
          
          // Store chunk (don't generate yet, just store) - VALIDATE it's not empty
          if (chunkToSpeak && chunkToSpeak.length >= 3 && chunkToSpeak.trim().length >= 3) {
            allChunks.push(chunkToSpeak);
            
            // Only trigger generation if we're not already generating and queue has room
            // This prevents multiple simultaneous calls during fast streaming
            if (!isGeneratingChunk && TTSServiceProxy.getQueueLength() < MAX_QUEUED_AUDIO) {
              tryGenerateNextChunk();
            }
          }
        }
      }
    });

    // Handle result - cancelled is normal flow, not an error
    if (result.cancelled) {
      console.log('[ChatController] Generation cancelled by user');
      TTSServiceProxy.stopPlayback();
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle();
      }
      setIsProcessing(false);
      return { success: false, cancelled: true };
    }

    // Handle actual errors
    if (!result.success) {
      const errorMessage = result.error?.message || 'Unknown error occurred';
      console.error('[ChatController] AI error:', result.error);
      ChatService.addMessage('assistant', `Error: ${errorMessage}`);
      setChatMessages([...ChatService.getMessages()]);
      TTSServiceProxy.stopPlayback();
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle();
      }
      setIsProcessing(false);
      return { success: false, error: errorMessage };
    }

    // Add any remaining text in buffer
    if (ttsEnabled && textBuffer.trim().length > 0) {
      const finalChunk = textBuffer.trim();
      allChunks.push(finalChunk);
      // Trigger generation for final chunk
      tryGenerateNextChunk();
    }

    // Wait for all chunks to finish generating
    if (ttsEnabled && allChunks.length > 0) {
      while (nextChunkToGenerate < allChunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Clean up callback to prevent memory leaks
    TTSServiceProxy.setAudioFinishedCallback(null);

    return { success: true, fullResponse };
  };

  /**
   * Handle text message submission
   * Flow: User message → Think → AI Stream → Speak → Idle
   */
  const handleMessageSend = async (message, images = null, audios = null) => {
    const attachmentInfo = [];
    if (images && images.length > 0) attachmentInfo.push(`${images.length} image(s)`);
    if (audios && audios.length > 0) attachmentInfo.push(`${audios.length} audio(s)`);
    const attachmentStr = attachmentInfo.length > 0 ? ` with ${attachmentInfo.join(' and ')}` : '';
    console.log('[ChatController] Message sent:', message, attachmentStr);

    // Abort any ongoing AI generation BEFORE adding new message
    // This ensures forceComplete triggers synchronously and previous message completes instantly
    if (AIServiceProxy.isGenerating()) {
      console.log('[ChatController] Aborting ongoing AI generation before adding new message');
      AIServiceProxy.abortRequest();
      // Brief delay to let abort process
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Add user message to chat (with images and audios if provided)
    ChatService.addMessage('user', message, images, audios);
    setChatMessages(ChatService.getMessages());

    setIsProcessing(true);

    // Stop any ongoing TTS playback
    TTSServiceProxy.stopPlayback();

    // Check AI configuration
    if (!AIServiceProxy.isConfigured()) {
      ChatService.addMessage('assistant', 'Error: AI not configured. Please configure in Control Panel.');
      setChatMessages([...ChatService.getMessages()]);
      setIsProcessing(false);
      return;
    }

    // Start thinking animation (continuous loop until interrupted by TTS)
    console.log('[ChatController] Checking assistant ready state:', {
      hasRef: !!assistantRef.current,
      isReady: assistantRef.current?.isReady?.(),
    });
    
    if (assistantRef.current?.isReady()) {
      console.log('[ChatController] Starting BUSY state (thinking animation)');
      await assistantRef.current.setState('BUSY');
      console.log('[ChatController] BUSY state set successfully');
    } else {
      console.warn('[ChatController] Assistant not ready, skipping BUSY state');
    }

    // Brief pause to show thinking
    await new Promise(resolve => setTimeout(resolve, 500));

    // Call core streaming function
    const result = await streamAIResponse();

    if (!result.success) {
      return; // streamAIResponse already handled the error
    }

    setIsProcessing(false);

    // AUTO-SAVE: Save chat after AI finishes responding
    if (!isTempChat && chatMessages.length > 0) {
      try {
        let chatId = currentChatId;
        if (!chatId) {
          chatId = chatHistoryService.generateChatId();
          setCurrentChatId(chatId);
        }

        // Get current page URL (important for extension mode)
        const sourceUrl = window.location.href;

        await chatHistoryService.saveChat({
          chatId,
          chatService: ChatService, // NEW: Save tree
          messages: ChatService.getMessages(), // DEPRECATED: Backward compatibility
          isTemp: false,
          metadata: {
            sourceUrl,
          },
        });

        console.log('[ChatController] Chat auto-saved after AI response:', chatId);
      } catch (error) {
        console.error('[ChatController] Failed to auto-save chat:', error);
      }
    }
  };

  /**
   * Handle voice mode transcription
   * Called when VoiceConversationService transcribes user speech
   */
  const handleVoiceTranscription = async (text) => {
    console.log('[ChatController] Voice transcription received:', text)
    
    if (!text || !text.trim()) {
      console.warn('[ChatController] Empty transcription, returning to listening')
      // Return to listening state if transcription is empty
      setTimeout(() => {
        if (VoiceConversationService.isConversationActive()) {
          VoiceConversationService.changeState(ConversationStates.LISTENING)
        }
      }, 500)
      return
    }
    
    // Add user message to chat
    ChatService.addMessage('user', text);
    setChatMessages(ChatService.getMessages());
    
    // Get AI response and speak it
    await handleVoiceAIResponse()
  }

  /**
   * Handle AI response in voice mode
   * Gets AI response and speaks it through VoiceConversationService
   * Uses streaming TTS generation (same as regular chat)
   */
  const handleVoiceAIResponse = async () => {
    setIsProcessing(true)

    // Check AI configuration
    if (!AIServiceProxy.isConfigured()) {
      ChatService.addMessage('assistant', 'Error: AI not configured. Please configure in Control Panel.');
      setChatMessages([...ChatService.getMessages()]);
      setIsProcessing(false);
      VoiceConversationService.changeState(ConversationStates.LISTENING);
      return;
    }

    // Start thinking animation (continuous loop until interrupted by TTS)
    console.log('[ChatController] [Voice] Checking assistant ready state:', {
      hasRef: !!assistantRef.current,
      isReady: assistantRef.current?.isReady?.(),
    });
    
    if (assistantRef.current?.isReady()) {
      console.log('[ChatController] [Voice] Starting BUSY state (thinking animation)')
      await assistantRef.current.setState('BUSY')
      console.log('[ChatController] [Voice] BUSY state set successfully')
    } else {
      console.warn('[ChatController] [Voice] Assistant not ready, skipping BUSY state')
    }

    // Load system prompt and TTS config
    let voiceAIConfig;
    let voiceTTSConfig;
    try {
      voiceAIConfig = await StorageServiceProxy.configLoad('aiConfig', DefaultAIConfig);
      voiceTTSConfig = await StorageServiceProxy.configLoad('ttsConfig', DefaultTTSConfig);
    } catch (error) {
      console.error('[ChatController] Failed to load configs in handleVoiceAIResponse:', error);
      voiceAIConfig = DefaultAIConfig;
      voiceTTSConfig = DefaultTTSConfig;
    }
    
    const systemPrompt = voiceAIConfig.systemPrompt || DefaultAIConfig.systemPrompt
    const ttsEnabled = voiceTTSConfig.enabled && TTSServiceProxy.isConfigured()

    // Get formatted messages
    const messages = ChatService.getFormattedMessages(systemPrompt)

    // Resume TTS playback for new generation
    if (ttsEnabled) {
      TTSServiceProxy.resumePlayback()
    }

    // Streaming state with just-in-time TTS generation
    let fullResponse = ''
    let hasSwitchedToSpeaking = false // For animation only
    let textBuffer = ''
    const allChunks = [] // All text chunks (stored, not generated yet)
    let nextChunkToGenerate = 0 // Index of next chunk to generate
    const MAX_QUEUED_AUDIO = 3 // Only queue up to 3 audio chunks ahead
    let isGeneratingChunk = false // Track if chunk generation is in progress

    // Generate unique session ID for this voice response
    const voiceTTSSessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Helper function to generate TTS chunk with lip sync
    const generateTTSChunk = async (chunkIndex) => {
      if (chunkIndex >= allChunks.length) return
      
      const chunkText = allChunks[chunkIndex]
      
      try {
        const queueLength = TTSServiceProxy.getQueueLength()
        console.log(`[ChatController] [Voice] Generating TTS+lip sync chunk ${chunkIndex}: "${chunkText.substring(0, 50)}..." (queue: ${queueLength})`)
        
        // Generate TTS audio + lip sync (VMD -> BVMD)
        const result = await TTSServiceProxy.generateSpeech(chunkText, true)
        
        // Check if result is null or missing audio
        if (!result || !result.audio) {
          console.warn(`[ChatController] [Voice] TTS generation returned null for chunk ${chunkIndex}`)
          return
        }
        
        const { audio, bvmdUrl } = result
        
        // Convert ArrayBuffer to Blob if needed (extension mode)
        const audioBlob = audio instanceof Blob ? audio : new Blob([audio], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob)
        
        // Queue audio with BVMD for synchronized lip sync AND voice session ID
        TTSServiceProxy.queueAudio(chunkText, audioUrl, bvmdUrl, voiceTTSSessionId)
        
        console.log(`[ChatController] [Voice] TTS chunk ${chunkIndex} queued${bvmdUrl ? ' with lip sync' : ''} (queue now: ${TTSServiceProxy.getQueueLength()})`)
      } catch (error) {
        console.error(`[ChatController] [Voice] TTS chunk ${chunkIndex} failed:`, error)
      }
    }

    // Generate next chunk if queue has space
    const tryGenerateNextChunk = async () => {
      // Don't start new generation if one is already in progress
      if (isGeneratingChunk) {
        return
      }
      
      const queueLength = TTSServiceProxy.getQueueLength()
      if (queueLength < MAX_QUEUED_AUDIO && nextChunkToGenerate < allChunks.length) {
        isGeneratingChunk = true
        await generateTTSChunk(nextChunkToGenerate++)
        isGeneratingChunk = false
        
        // After finishing, try to generate next chunk if there's still room
        tryGenerateNextChunk()
      }
    }

    // Register callback to generate next chunk when audio finishes
    TTSServiceProxy.setAudioFinishedCallback(() => {
      tryGenerateNextChunk()
    })

    const result = await AIServiceProxy.sendMessage(messages, async (chunk) => {
      fullResponse += chunk
      textBuffer += chunk

      // Update chat with streaming response
      const currentMessages = ChatService.getMessages()
      if (currentMessages.length > 0 && 
          currentMessages[currentMessages.length - 1].role === 'assistant') {
        ChatService.updateLastMessage(fullResponse)
      } else {
        ChatService.addMessage('assistant', fullResponse)
      }
      setChatMessages([...ChatService.getMessages()])

      // If TTS disabled, trigger speak animation after some text (no audio to sync with)
      if (!ttsEnabled && !hasSwitchedToSpeaking && fullResponse.length > 10 && assistantRef.current?.isReady()) {
        console.log('[ChatController] [Voice] Starting speaking animation (no TTS)')
        assistantRef.current.triggerAction('speak')
        hasSwitchedToSpeaking = true
      }

      // TTS: Look for complete sentences and generate immediately
      if (ttsEnabled) {
        const sentenceEnd = /[.!?:]\s|[.!?:]\n|\n/.exec(textBuffer)
        
        if (sentenceEnd) {
          // Found a sentence boundary
          const chunkToSpeak = textBuffer.substring(0, sentenceEnd.index + sentenceEnd[0].length).trim()
          textBuffer = textBuffer.substring(sentenceEnd.index + sentenceEnd[0].length)
          
          // Store chunk for just-in-time generation - VALIDATE it's not empty
          if (chunkToSpeak && chunkToSpeak.length >= 3 && chunkToSpeak.trim().length >= 3) {
            allChunks.push(chunkToSpeak)
            tryGenerateNextChunk()
          }
        }
      }
    })

    // Handle result - cancelled is normal
    if (result.cancelled) {
      console.log('[ChatController] Voice generation cancelled by user')
      VoiceConversationService.changeState(ConversationStates.LISTENING)
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle()
      }
      setIsProcessing(false)
      return
    }

    // Handle actual errors
    if (!result.success) {
      console.error('[ChatController] Voice AI error:', result.error);
      ChatService.addMessage('assistant', `Error: ${result.error.message}`);
      setChatMessages([...ChatService.getMessages()]);
      VoiceConversationService.changeState(ConversationStates.LISTENING)
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle()
      }
      setIsProcessing(false)
      return
    }

    console.log('[ChatController] [Voice] AI response complete:', fullResponse)

    // Handle remaining text in buffer
    if (ttsEnabled && textBuffer.trim().length > 0) {
      const finalChunk = textBuffer.trim()
      allChunks.push(finalChunk)
      tryGenerateNextChunk()
    }

    // Wait for all chunks to be generated (they're generating in parallel)
    if (ttsEnabled && allChunks.length > 0) {
      console.log(`[ChatController] [Voice] Waiting for ${allChunks.length} TTS chunks...`)
      
      while (nextChunkToGenerate < allChunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      console.log('[ChatController] [Voice] All TTS generations complete')
    } else {
      console.warn('[ChatController] [Voice] No TTS generated, returning to listening')
      VoiceConversationService.changeState(ConversationStates.LISTENING)
    }

    setIsProcessing(false);
  }

  /**
   * Handle voice mode toggle
   */
  const handleVoiceModeChange = useCallback((active) => {
    console.log('[ChatController] Voice mode changed:', active)
    setIsVoiceMode(active)
  }, [setIsVoiceMode])

  /**
   * Handle drag-drop onto ChatContainer
   * This forwards the dropped content to ChatInput
   */
  const handleDragDrop = useCallback((dropData) => {
    console.log('[ChatController] Drag drop received:', dropData);
    
    // Ensure all fields exist with defaults
    const normalizedData = {
      text: dropData.text || '',
      images: dropData.images || [],
      audios: dropData.audios || [],
      errors: dropData.errors || []
    };
    
    // Forward to ChatInput via a custom event
    const event = new CustomEvent('chatDragDrop', { 
      detail: normalizedData 
    });
    window.dispatchEvent(event);
  }, []);

  /**
   * Streaming regeneration handler (called by AppContext)
   * This reuses the core streaming function
   */
  const handleRegenerateWithStreaming = async () => {
    console.log('[ChatController] Regenerating with streaming');
    
    setIsProcessing(true);
    TTSServiceProxy.stopPlayback();
    
    // Start thinking animation (continuous loop until interrupted by TTS)
    if (assistantRef.current?.isReady()) {
      await assistantRef.current.setState('BUSY');
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Call core streaming function
    await streamAIResponse();
    
    setIsProcessing(false);
  };
  
  // Populate streaming callback refs for AppContext
  useEffect(() => {
    if (regenerateWithStreamingRef) {
      regenerateWithStreamingRef.current = handleRegenerateWithStreaming;
    }
    if (editWithStreamingRef) {
      editWithStreamingRef.current = handleRegenerateWithStreaming; // Same logic for edit
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
