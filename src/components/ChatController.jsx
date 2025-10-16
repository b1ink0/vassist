import { useState, useEffect } from 'react'
import ChatButton from './ChatButton'
import ChatInput from './ChatInput'
import ChatContainer from './ChatContainer'
import ChatManager from '../managers/ChatManager'
import { AIServiceProxy, TTSServiceProxy } from '../services/proxies'
import VoiceConversationService, { ConversationStates } from '../services/VoiceConversationService'
import StorageManager from '../managers/StorageManager'
import { DefaultAIConfig, DefaultTTSConfig } from '../config/aiConfig'

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

    const handleClearChat = () => {
      console.log('[ChatController] Clear chat event received - stopping all generation')
      
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
      
      // Reset processing state
      setIsProcessing(false)
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

    window.addEventListener('closeChat', handleCloseChat)
    window.addEventListener('clearChat', handleClearChat)
    window.addEventListener('stopGeneration', handleStopGeneration)

    return () => {
      window.removeEventListener('closeChat', handleCloseChat)
      window.removeEventListener('clearChat', handleClearChat)
      window.removeEventListener('stopGeneration', handleStopGeneration)
    }
  }, [assistantRef, isVoiceMode])

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
   * Handle message send with AI integration
   * Flow: User message → Think → AI Stream → Speak → Idle
   * Now includes TTS generation with chunking
   */
  const handleMessageSend = async (message) => {
    console.log('[ChatController] Message sent:', message)

    // Add user message to chat
    ChatManager.addMessage('user', message)
    setChatMessages(ChatManager.getMessages())

    setIsProcessing(true)

    // Stop any ongoing TTS playback
    TTSServiceProxy.stopPlayback()

    // Generate unique session ID for this auto-TTS request
    const autoTTSSessionId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      // Check AI configuration
      if (!AIServiceProxy.isConfigured()) {
        throw new Error('AI not configured. Please configure in Config tab.')
      }

      // Start thinking animation
      if (assistantRef.current?.isReady()) {
        console.log('[ChatController] Starting thinking animation')
        await assistantRef.current.triggerAction('think')
      }

      // Brief pause to show thinking
      await new Promise(resolve => setTimeout(resolve, 500))

      // Load system prompt from config
      const savedConfig = StorageManager.getConfig('aiConfig', DefaultAIConfig)
      const systemPrompt = savedConfig.systemPrompt || DefaultAIConfig.systemPrompt

      console.log('[ChatController] System prompt:', systemPrompt)

      // Get formatted messages for AI
      const messages = ChatManager.getFormattedMessages(systemPrompt)
      console.log('[ChatController] Messages to AI:', messages)

      // Load TTS config
      const ttsConfig = StorageManager.getConfig('ttsConfig', DefaultTTSConfig)
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

      await AIServiceProxy.sendMessage(messages, async (chunk) => {
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

    } catch (error) {
      console.error('[ChatController] Chat error:', error)

      // Stop TTS and return to idle on error
      TTSServiceProxy.stopPlayback()
      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle()
      }

      // Show error message
      ChatManager.addMessage('assistant', `Error: ${error.message}`)
      setChatMessages([...ChatManager.getMessages()])

    } finally {
      setIsProcessing(false)
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

    try {
      // Check AI configuration
      if (!AIServiceProxy.isConfigured()) {
        throw new Error('AI not configured. Please configure in Config tab.')
      }

      // Start thinking animation
      if (assistantRef.current?.isReady()) {
        console.log('[ChatController] Starting thinking animation')
        await assistantRef.current.triggerAction('think')
      }

      // Load system prompt and TTS config
      const savedConfig = StorageManager.getConfig('aiConfig', DefaultAIConfig)
      const systemPrompt = savedConfig.systemPrompt || DefaultAIConfig.systemPrompt
      
      const ttsConfig = StorageManager.getConfig('ttsConfig', DefaultTTSConfig)
      const ttsEnabled = ttsConfig.enabled && TTSServiceProxy.isConfigured()

      // Get formatted messages
      const messages = ChatManager.getFormattedMessages(systemPrompt)

      // Resume TTS playback for new generation
      if (ttsEnabled) {
        TTSServiceProxy.resumePlayback()
      }

      // Streaming state with just-in-time TTS generation
      let fullResponse = ''
      let hasSwitchedToSpeaking = false
      let textBuffer = ''
      const allChunks = [] // All text chunks (stored, not generated yet)
      let nextChunkToGenerate = 0 // Index of next chunk to generate
      const MAX_QUEUED_AUDIO = 3 // Only queue up to 3 audio chunks ahead

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
          
          // Queue audio with BVMD for synchronized lip sync
          TTSServiceProxy.queueAudio(chunkText, audioUrl, bvmdUrl)
          
          console.log(`[ChatController] [Voice] TTS chunk ${chunkIndex} queued${bvmdUrl ? ' with lip sync' : ''} (queue now: ${TTSServiceProxy.getQueueLength()})`)
        } catch (error) {
          console.error(`[ChatController] [Voice] TTS chunk ${chunkIndex} failed:`, error)
        }
      }

      // Generate next chunk if queue has space
      const tryGenerateNextChunk = () => {
        const queueLength = TTSServiceProxy.getQueueLength()
        console.log(`[ChatController] [Voice] tryGenerateNextChunk: queue=${queueLength}, next=${nextChunkToGenerate}, total=${allChunks.length}`)
        
        // Only generate if queue has room AND we have more chunks
        if (queueLength < MAX_QUEUED_AUDIO && nextChunkToGenerate < allChunks.length) {
          console.log(`[ChatController] [Voice] Queue has space (${queueLength}/${MAX_QUEUED_AUDIO}), generating chunk ${nextChunkToGenerate}`)
          generateTTSChunk(nextChunkToGenerate++)
        }
      }

      // Register callback to generate next chunk when audio finishes playing
      TTSServiceProxy.setAudioFinishedCallback(() => {
        console.log('[ChatController] [Voice] Audio finished callback triggered')
        tryGenerateNextChunk()
      })

      // Change to speaking state immediately when we start generating TTS
      let hasChangedToSpeaking = false

      await AIServiceProxy.sendMessage(messages, async (chunk) => {
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
          console.log('[ChatController] Starting speaking animation')
          assistantRef.current.triggerAction('speak')
          hasSwitchedToSpeaking = true
        }

        // TTS Generation: Look for complete sentences and generate immediately (same as regular chat)
        if (ttsEnabled) {
          const sentenceEnd = /[.!?:]\s|[.!?:]\n|\n/.exec(textBuffer)
          
          if (sentenceEnd) {
            // Found a sentence boundary
            const chunkToSpeak = textBuffer.substring(0, sentenceEnd.index + sentenceEnd[0].length).trim()
            textBuffer = textBuffer.substring(sentenceEnd.index + sentenceEnd[0].length)
            
            // Store chunk for just-in-time generation
            if (chunkToSpeak && chunkToSpeak.length >= 3) {
              // Change to speaking state when we store first TTS chunk
              if (!hasChangedToSpeaking) {
                console.log('[ChatController] [Voice] Changing to SPEAKING state (first TTS chunk)')
                VoiceConversationService.changeState(ConversationStates.SPEAKING)
                hasChangedToSpeaking = true
              }
              
              console.log(`[ChatController] [Voice] Storing sentence chunk ${allChunks.length}: "${chunkToSpeak.substring(0, 50)}..."`)
              allChunks.push(chunkToSpeak)
              tryGenerateNextChunk() // Generate if under limit
            }
          }
        }
      })

      console.log('[ChatController] Voice AI response complete:', fullResponse)

      // Store any remaining text in buffer
      if (ttsEnabled && textBuffer.trim().length > 0) {
        const finalChunk = textBuffer.trim()
        console.log(`[ChatController] [Voice] Storing final TTS chunk: "${finalChunk.substring(0, 50)}..."`)
        
        if (!hasChangedToSpeaking) {
          console.log('[ChatController] [Voice] Changing to SPEAKING state (final chunk)')
          VoiceConversationService.changeState(ConversationStates.SPEAKING)
          hasChangedToSpeaking = true
        }
        
        allChunks.push(finalChunk)
        tryGenerateNextChunk() // Generate if under limit
      }

      // Wait for all chunks to be generated
      if (ttsEnabled && allChunks.length > 0) {
        console.log(`[ChatController] [Voice] Waiting for all ${allChunks.length} TTS chunks to be generated...`)
        
        // Wait until all chunks have been generated
        while (nextChunkToGenerate < allChunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        console.log('[ChatController] [Voice] All TTS generations complete')
        
        // Start monitoring TTS playback to return to listening when done
        VoiceConversationService.monitorTTSPlayback()
      } else {
        // No TTS, return to listening immediately
        console.warn('[ChatController] [Voice] No TTS generated, returning to listening')
        VoiceConversationService.changeState(ConversationStates.LISTENING)
      }

    } catch (error) {
      console.error('[ChatController] Voice AI error:', error)
      
      // Show error message
      ChatManager.addMessage('assistant', `Error: ${error.message}`)
      setChatMessages([...ChatManager.getMessages()])

      // Return to listening state on error
      if (VoiceConversationService.isConversationActive()) {
        VoiceConversationService.changeState(ConversationStates.LISTENING)
      }

      if (assistantRef.current?.isReady()) {
        assistantRef.current.idle()
      }

    } finally {
      setIsProcessing(false)
    }
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
