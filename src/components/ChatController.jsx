import { useState, useEffect } from 'react'
import ChatButton from './ChatButton'
import ChatInput from './ChatInput'
import ChatContainer from './ChatContainer'
import ChatManager from '../managers/ChatManager'
import { AIServiceProxy, TTSServiceProxy, StorageServiceProxy } from '../services/proxies'
import VoiceConversationService, { ConversationStates } from '../services/VoiceConversationService'
import { DefaultAIConfig, DefaultTTSConfig } from '../config/aiConfig'
import chatHistoryService from '../services/ChatHistoryService'

const ChatController = ({ 
  assistantRef, 
  positionManagerRef, 
  isAssistantReady,
  modelDisabled = false
}) => {
  // Chat UI state
  const [isChatInputVisible, setIsChatInputVisible] = useState(false)
  const [isChatContainerVisible, setIsChatContainerVisible] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false) // Track TTS playback state
  const [currentChatId, setCurrentChatId] = useState(null) // Track current chat ID
  const [isTempChat, setIsTempChat] = useState(false) // Temp chat flag

  /**
   * Track voice conversation state to update isSpeaking
   */
  useEffect(() => {
    const handleStateChange = (state) => {
      setIsSpeaking(state === ConversationStates.SPEAKING);
    };

    VoiceConversationService.setStateChangeCallback(handleStateChange);

    return () => {
      VoiceConversationService.setStateChangeCallback(null);
    };
  }, []);

  /**
   * Poll TTSService to track playback state for non-voice mode
   * This ensures stop button works even in regular chat when TTS is playing
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
  }, [isVoiceMode]);

  /**
   * Setup event listeners for chat actions
   */
  useEffect(() => {
    const handleCloseChat = () => {
      console.log('[ChatController] Close chat event received')
      setIsChatInputVisible(false)
      setIsChatContainerVisible(false)
      // Stop any playing TTS
      TTSServiceProxy.stopPlayback()
    }

    const handleClearChat = async () => {
      console.log('[ChatController] Clear chat event received')
      
      // If temp, delete from history. Otherwise just clear UI (it was already auto-saved)
      if (isTempChat && currentChatId) {
        try {
          await chatHistoryService.deleteChat(currentChatId)
          console.log('[ChatController] Temp chat deleted:', currentChatId)
        } catch (error) {
          console.error('[ChatController] Failed to delete temp chat:', error)
        }
      }
      
      // Stop AI generation
      AIServiceProxy.abortRequest()
      
      // Stop TTS
      TTSServiceProxy.stopPlayback()
      
      // Return assistant to idle
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle()
      }
      
      // Clear messages
      ChatManager.clearMessages()
      setChatMessages([])
      
      // Reset processing state and create new chat
      setIsProcessing(false)
      setCurrentChatId(null) // Start new chat
      setIsTempChat(false)
    }
    
    const handleStopGeneration = () => {
      console.log('[ChatController] Stop generation event received')
      
      // Abort AI generation
      AIServiceProxy.abortRequest()
      
      // Stop TTS
      TTSServiceProxy.stopPlayback()
      
      // If in voice mode, interrupt
      if (isVoiceMode) {
        VoiceConversationService.interrupt()
      }
      
      // Return assistant to idle
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle()
      }
      
      // Reset processing state
      setIsProcessing(false)
    }

    const handleLoadChatFromHistory = async (event) => {
      const { chatData } = event.detail
      console.log('[ChatController] Loading chat from history:', chatData.chatId)
      
      try {
        // Gracefully stop any ongoing operations before loading
        console.log('[ChatController] Cleaning up ongoing requests')
        AIServiceProxy.abortRequest() // Stop AI generation
        TTSServiceProxy.stopPlayback() // Stop TTS playback
        
        // Load full chat with media restored
        const fullChat = await chatHistoryService.loadChat(chatData.chatId)
        
        // Set messages
        ChatManager.setMessages(fullChat.messages)
        setChatMessages(fullChat.messages)
        
        // Set current chat ID
        setCurrentChatId(fullChat.chatId)
        setIsTempChat(false)
        
        // Mark as not temp since it's loaded from history
        await chatHistoryService.markAsTempChat(fullChat.chatId, false)
        
        // Make sure chat UI is visible
        if (!isChatContainerVisible) {
          setIsChatContainerVisible(true)
          setIsChatInputVisible(true)
        }
        
        // Reset processing state
        setIsProcessing(false)
        
        console.log('[ChatController] Chat loaded successfully')
      } catch (error) {
        console.error('[ChatController] Failed to load chat:', error)
      }
    }

    window.addEventListener('closeChat', handleCloseChat)
    window.addEventListener('clearChat', handleClearChat)
    window.addEventListener('stopGeneration', handleStopGeneration)
    window.addEventListener('loadChatFromHistory', handleLoadChatFromHistory)

    return () => {
      window.removeEventListener('closeChat', handleCloseChat)
      window.removeEventListener('clearChat', handleClearChat)
      window.removeEventListener('stopGeneration', handleStopGeneration)
      window.removeEventListener('loadChatFromHistory', handleLoadChatFromHistory)
    }
  }, [assistantRef, isVoiceMode, chatMessages, currentChatId, isTempChat, isChatContainerVisible])

  /**
   * Auto-save chat whenever messages change (debounced after user sends or AI responds)
   * This ensures chats are persisted to history automatically
   */
  useEffect(() => {
    // Only auto-save if we have messages and it's not temp and we're not currently processing
    if (chatMessages.length === 0 || isTempChat || isProcessing) {
      return
    }

    // Debounce auto-save to avoid too frequent saves
    const autoSaveTimer = setTimeout(async () => {
      try {
        // Don't save if in temp mode
        if (isTempChat) {
          console.log('[ChatController] Skipping save - temp mode enabled')
          return
        }

        let chatId = currentChatId
        if (!chatId) {
          chatId = chatHistoryService.generateChatId()
          setCurrentChatId(chatId)
          console.log('[ChatController] New chat created for auto-save:', chatId)
        }

        // Get current page URL (important for extension mode)
        const sourceUrl = window.location.href;

        await chatHistoryService.saveChat({
          chatId,
          messages: chatMessages,
          isTemp: false,
          metadata: {
            sourceUrl,
          },
        })

        console.log('[ChatController] Chat auto-saved (debounced):', chatId)
      } catch (error) {
        console.error('[ChatController] Failed to auto-save chat (debounced):', error)
      }
    }, 2000) // Wait 2 seconds after last change before saving

    return () => clearTimeout(autoSaveTimer)
  }, [chatMessages, currentChatId, isTempChat, isProcessing])

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
  const handleChatButtonClick = () => {
    console.log('[ChatController] Chat button clicked')
    
    // If chat is open, close it
    if (isChatContainerVisible || isChatInputVisible) {
      console.log('[ChatController] Closing chat')
      setIsChatInputVisible(false)
      setIsChatContainerVisible(false)
    } else {
      // Otherwise, open it
      console.log('[ChatController] Opening chat')
      setIsChatInputVisible(true)
      setIsChatContainerVisible(true)
    }
  }

  /**
   * Handle chat input close - hide input and container
   */
  const handleChatInputClose = () => {
    console.log('[ChatController] Chat input closed')
    setIsChatInputVisible(false)
    setIsChatContainerVisible(false)
  }

  /**
   * Handle text message submission
   * Flow: User message → Think → AI Stream → Speak → Idle
   * Now includes TTS generation with chunking and multi-modal support
   */
  const handleMessageSend = async (message, images = null, audios = null) => {
    const attachmentInfo = [];
    if (images && images.length > 0) attachmentInfo.push(`${images.length} image(s)`);
    if (audios && audios.length > 0) attachmentInfo.push(`${audios.length} audio(s)`);
    const attachmentStr = attachmentInfo.length > 0 ? ` with ${attachmentInfo.join(' and ')}` : '';
    console.log('[ChatController] Message sent:', message, attachmentStr);

    // Add user message to chat (with images and audios if provided)
    ChatManager.addMessage('user', message, images, audios)
    setChatMessages(ChatManager.getMessages())

    setIsProcessing(true)

    // Stop any ongoing TTS playback
    TTSServiceProxy.stopPlayback()

    // Generate unique session ID for this auto-TTS request
    const autoTTSSessionId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Check AI configuration
    if (!AIServiceProxy.isConfigured()) {
      ChatManager.addMessage('assistant', 'Error: AI not configured. Please configure in Control Panel.')
      setChatMessages([...ChatManager.getMessages()])
      setIsProcessing(false)
      return
    }

    // Start thinking animation
    if (assistantRef.current?.isReady()) {
      console.log('[ChatController] Starting thinking animation')
      await assistantRef.current.triggerAction('think')
    }

    // Brief pause to show thinking
    await new Promise(resolve => setTimeout(resolve, 500))

    // Load system prompt from config
    let savedConfig;
    let ttsConfig;
    try {
      savedConfig = await StorageServiceProxy.configLoad('aiConfig', DefaultAIConfig);
      ttsConfig = await StorageServiceProxy.configLoad('ttsConfig', DefaultTTSConfig);
    } catch (error) {
      console.error('[ChatController] Failed to load configs:', error);
      savedConfig = DefaultAIConfig;
      ttsConfig = DefaultTTSConfig;
    }
    
    const systemPrompt = savedConfig.systemPrompt || DefaultAIConfig.systemPrompt

    console.log('[ChatController] System prompt:', systemPrompt)

    // Get formatted messages for AI
    const messages = ChatManager.getFormattedMessages(systemPrompt)
    console.log('[ChatController] Messages to AI:', messages)

    // Check if TTS is enabled
    const ttsEnabled = ttsConfig.enabled && TTSServiceProxy.isConfigured()

    // Resume TTS playback for new generation
    if (ttsEnabled) {
      TTSServiceProxy.resumePlayback()
    }

    // Stream AI response with just-in-time TTS generation
    let fullResponse = ''
    let hasSwitchedToSpeaking = false
    let textBuffer = '' // Buffer for TTS chunking
      const allChunks = [] // All text chunks (stored, not generated yet)
      let nextChunkToGenerate = 0 // Index of next chunk to generate
      const MAX_QUEUED_AUDIO = 3 // Only queue up to 3 audio chunks ahead

      /**
       * Generate TTS for a text chunk with lip sync
       */
      const generateTTSChunk = async (chunkIndex) => {
        if (chunkIndex >= allChunks.length) return
        
        const chunkText = allChunks[chunkIndex]
        
        // Check if stopped
        if (TTSServiceProxy.isStopped) {
          return
        }

        try {
          // Generate TTS audio + lip sync (VMD -> BVMD)
          const { audio, bvmdUrl } = await TTSServiceProxy.generateSpeech(chunkText, true)
          
          // Check again if stopped after generation
          if (TTSServiceProxy.isStopped) {
            return
          }

          // Create audio URL from the returned audio (Blob or ArrayBuffer)
          const audioBlob = audio instanceof Blob ? audio : new Blob([audio], { type: 'audio/mp3' });
          const audioUrl = URL.createObjectURL(audioBlob)
          
          // Queue audio with BVMD for synchronized lip sync
          // In both dev and extension mode, queuing happens in main world
          TTSServiceProxy.queueAudio(chunkText, audioUrl, bvmdUrl, autoTTSSessionId)
        } catch (ttsError) {
          console.warn(`[ChatController] TTS generation failed for chunk ${chunkIndex}:`, ttsError)
        }
      }

      // Generate next chunk if queue has space
      const tryGenerateNextChunk = () => {
        const queueLength = TTSServiceProxy.getQueueLength()
        
        // Only generate if queue has room AND we have more chunks
        if (queueLength < MAX_QUEUED_AUDIO && nextChunkToGenerate < allChunks.length) {
          generateTTSChunk(nextChunkToGenerate++)
        }
      }

      // Register callback to generate next chunk when audio finishes playing
      TTSServiceProxy.setAudioFinishedCallback(() => {
        tryGenerateNextChunk()
      })

      const result = await AIServiceProxy.sendMessage(messages, async (chunk) => {
        fullResponse += chunk
        textBuffer += chunk

        // Update streaming response in real-time
        const currentMessages = ChatManager.getMessages()
        if (currentMessages.length > 0 && 
            currentMessages[currentMessages.length - 1].role === 'assistant') {
          ChatManager.messages.pop()
        }
        ChatManager.addMessage('assistant', fullResponse)
        setChatMessages([...ChatManager.getMessages()])

        // Start speaking animation after first chunk
        if (!hasSwitchedToSpeaking && 
            fullResponse.length > 10 && 
            assistantRef.current?.isReady()) {
          assistantRef.current.triggerAction('speak')
          hasSwitchedToSpeaking = true
        }

        // TTS Generation: Look for complete sentences and generate immediately
        if (ttsEnabled) {
          // Look for sentence boundaries
          const sentenceEnd = /[.!?:]\s|[.!?:]\n|\n/.exec(textBuffer)
          
          if (sentenceEnd) {
            // Found a sentence boundary
            const chunkToSpeak = textBuffer.substring(0, sentenceEnd.index + sentenceEnd[0].length).trim()
            textBuffer = textBuffer.substring(sentenceEnd.index + sentenceEnd[0].length)
            
            // Store chunk (don't generate yet, just store)
            if (chunkToSpeak && chunkToSpeak.length >= 3) {
              allChunks.push(chunkToSpeak)
              
              // Start generating first 3 chunks
              tryGenerateNextChunk()
            }
          }
        }
      })

      // Handle result - cancelled is normal flow, not an error
      if (result.cancelled) {
        console.log('[ChatController] Generation cancelled by user')
        TTSServiceProxy.stopPlayback()
        if (assistantRef.current?.isReady()) {
          assistantRef.current.idle()
        }
        setIsProcessing(false)
        return
      }

      // Handle actual errors
      if (!result.success) {
        const errorMessage = result.error?.message || 'Unknown error occurred';
        console.error('[ChatController] AI error:', result.error)
        ChatManager.addMessage('assistant', `Error: ${errorMessage}`)
        setChatMessages([...ChatManager.getMessages()])
        TTSServiceProxy.stopPlayback()
        if (assistantRef.current?.isReady()) {
          assistantRef.current.idle()
        }
        setIsProcessing(false)
        return
      }

      // Add any remaining text in buffer
      if (ttsEnabled && textBuffer.trim().length > 0) {
        const finalChunk = textBuffer.trim()
        allChunks.push(finalChunk)
        tryGenerateNextChunk()
      }

      // Wait for all chunks to be generated
      if (ttsEnabled && allChunks.length > 0) {
        // Wait until all chunks are generated
        while (nextChunkToGenerate < allChunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      setIsProcessing(false)

      // AUTO-SAVE: Save chat after AI finishes responding
      if (!isTempChat && chatMessages.length > 0) {
        try {
          let chatId = currentChatId
          if (!chatId) {
            chatId = chatHistoryService.generateChatId()
            setCurrentChatId(chatId)
          }

          // Get current page URL (important for extension mode)
          const sourceUrl = window.location.href;

          await chatHistoryService.saveChat({
            chatId,
            messages: ChatManager.getMessages(),
            isTemp: false,
            metadata: {
              sourceUrl,
            },
          })

          console.log('[ChatController] Chat auto-saved after AI response:', chatId)
        } catch (error) {
          console.error('[ChatController] Failed to auto-save chat:', error)
        }
      }
  }

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
    ChatManager.addMessage('user', text)
    setChatMessages(ChatManager.getMessages())
    
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
      ChatManager.addMessage('assistant', 'Error: AI not configured. Please configure in Control Panel.')
      setChatMessages([...ChatManager.getMessages()])
      setIsProcessing(false)
      VoiceConversationService.changeState(ConversationStates.LISTENING)
      return
    }

    // Start thinking animation
    if (assistantRef.current?.isReady()) {
      console.log('[ChatController] Starting thinking animation')
      await assistantRef.current.triggerAction('think')
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
    const messages = ChatManager.getFormattedMessages(systemPrompt)

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
        const { audio, bvmdUrl } = await TTSServiceProxy.generateSpeech(chunkText, true)
        
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
    const tryGenerateNextChunk = () => {
      const queueLength = TTSServiceProxy.getQueueLength()
      if (queueLength < MAX_QUEUED_AUDIO && nextChunkToGenerate < allChunks.length) {
        generateTTSChunk(nextChunkToGenerate++)
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
      const currentMessages = ChatManager.getMessages()
      if (currentMessages.length > 0 && 
          currentMessages[currentMessages.length - 1].role === 'assistant') {
        ChatManager.messages.pop()
      }
      ChatManager.addMessage('assistant', fullResponse)
      setChatMessages([...ChatManager.getMessages()])

      // Start speaking animation
      if (!hasSwitchedToSpeaking && 
          fullResponse.length > 10 && 
          assistantRef.current?.isReady()) {
        console.log('[ChatController] [Voice] Starting speaking animation')
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
          
          // Store chunk for just-in-time generation
          if (chunkToSpeak && chunkToSpeak.length >= 3) {
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
      console.error('[ChatController] Voice AI error:', result.error)
      ChatManager.addMessage('assistant', `Error: ${result.error.message}`)
      setChatMessages([...ChatManager.getMessages()])
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

    setIsProcessing(false)
  }

  /**
   * Handle voice mode toggle
   */
  const handleVoiceModeChange = (active) => {
    console.log('[ChatController] Voice mode changed:', active)
    setIsVoiceMode(active)
  }

  return (
    <>
      {/* Chat Button visibility logic:
          - Model enabled: visible when model ready, HIDE when chat opens (model is anchor)
          - Model disabled: ALWAYS visible (button is anchor, needed for dragging) */}
      <ChatButton
        positionManagerRef={positionManagerRef}
        onClick={handleChatButtonClick}
        isVisible={modelDisabled ? true : (isAssistantReady && !(isChatContainerVisible || isChatInputVisible))}
        modelDisabled={modelDisabled}
        isChatOpen={isChatContainerVisible || isChatInputVisible}
      />

      {/* Chat Input - bottom screen */}
      <ChatInput
        isVisible={isChatInputVisible}
        onSend={handleMessageSend}
        onClose={handleChatInputClose}
        onVoiceTranscription={handleVoiceTranscription}
        onVoiceMode={handleVoiceModeChange}
      />

      {/* Chat Container - message bubbles */}
      <ChatContainer
        positionManagerRef={positionManagerRef}
        messages={chatMessages}
        isVisible={isChatContainerVisible}
        isGenerating={isProcessing}
        isSpeaking={isSpeaking}
        modelDisabled={modelDisabled}
      />
    </>
  )
}

export default ChatController
