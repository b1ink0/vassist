import { useState, useEffect } from 'react'
import ChatButton from './babylon/ChatButton'
import ChatInput from './babylon/ChatInput'
import ChatContainer from './babylon/ChatContainer'
import ChatManager from '../managers/ChatManager'
import AIService from '../services/AIService'
import TTSService from '../services/TTSService'
import VoiceConversationService, { ConversationStates } from '../services/VoiceConversationService'
import StorageManager from '../managers/StorageManager'
import { DefaultAIConfig, DefaultTTSConfig } from '../config/aiConfig'

const ChatController = ({ 
  assistantRef, 
  positionManagerRef, 
  isAssistantReady 
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
        const isPlaying = TTSService.isCurrentlyPlaying();
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
      TTSService.stopPlayback()
    }

    const handleClearChat = () => {
      console.log('[ChatController] Clear chat event received - stopping all generation')
      
      // Stop AI generation
      AIService.abortRequest()
      
      // Stop TTS
      TTSService.stopPlayback()
      
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
      AIService.abortRequest()
      
      // Stop TTS
      TTSService.stopPlayback()
      
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
   * Handle chat button click - show input and chat container
   */
  const handleChatButtonClick = () => {
    console.log('[ChatController] Chat button clicked')
    setIsChatInputVisible(true)
    setIsChatContainerVisible(true)
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
    TTSService.stopPlayback()

    try {
      // Check AI configuration
      if (!AIService.isConfigured()) {
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
      const ttsEnabled = ttsConfig.enabled && TTSService.isConfigured()

      // Resume TTS playback for new generation
      if (ttsEnabled) {
        TTSService.resumePlayback()
      }

      // Stream AI response with live TTS generation
      let fullResponse = ''
      let hasSwitchedToSpeaking = false
      let textBuffer = '' // Buffer for TTS chunking
      const ttsGenerationQueue = [] // Queue of pending TTS generations
      let activeTTSGenerations = 0 // Track concurrent TTS generations
      const MAX_CONCURRENT_TTS = 3 // Limit concurrent TTS API calls

      /**
       * Generate TTS for a text chunk with concurrency limit
       */
      const generateTTSChunk = async (chunkText, chunkIndex) => {
        // Wait if we've hit the concurrency limit
        while (activeTTSGenerations >= MAX_CONCURRENT_TTS) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        // Check if stopped
        if (TTSService.isStopped) {
          console.log(`[ChatController] TTS generation stopped, skipping chunk ${chunkIndex}`)
          return
        }

        activeTTSGenerations++
        try {
          console.log(`[ChatController] Generating TTS chunk ${chunkIndex}: "${chunkText.substring(0, 50)}..." (${activeTTSGenerations}/${MAX_CONCURRENT_TTS} active)`)
          const blob = await TTSService.generateSpeech(chunkText)
          
          // Check again if stopped after generation
          if (TTSService.isStopped) {
            console.log(`[ChatController] TTS stopped after generation, discarding chunk ${chunkIndex}`)
            return
          }

          const audioUrl = URL.createObjectURL(blob)
          TTSService.queueAudio(audioUrl)
          console.log(`[ChatController] TTS chunk ${chunkIndex} queued successfully`)
        } catch (ttsError) {
          console.warn(`[ChatController] TTS generation failed for chunk ${chunkIndex}:`, ttsError)
        } finally {
          activeTTSGenerations--
        }
      }

      let ttsChunkIndex = 0

      await AIService.sendMessage(messages, async (chunk) => {
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
          console.log('[ChatController] Starting speaking animation')
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
            
            // Generate TTS immediately (don't wait)
            if (chunkToSpeak && chunkToSpeak.length >= 3) {
              const currentChunkIndex = ttsChunkIndex++
              console.log(`[ChatController] Found sentence chunk ${currentChunkIndex}: "${chunkToSpeak.substring(0, 50)}..."`)
              
              // Start TTS generation in background (non-blocking)
              ttsGenerationQueue.push(generateTTSChunk(chunkToSpeak, currentChunkIndex))
            }
          }
        }
      })

      console.log('[ChatController] AI response complete:', fullResponse)

      // Add any remaining text in buffer to TTS queue
      if (ttsEnabled && textBuffer.trim().length > 0) {
        const finalChunk = textBuffer.trim()
        console.log(`[ChatController] Generating final TTS chunk: "${finalChunk.substring(0, 50)}..."`)
        ttsGenerationQueue.push(generateTTSChunk(finalChunk, ttsChunkIndex++))
      }

      // Wait for all TTS generations to complete (but don't block streaming)
      if (ttsEnabled && ttsGenerationQueue.length > 0) {
        console.log(`[ChatController] Waiting for ${ttsGenerationQueue.length} TTS generations to complete...`)
        await Promise.all(ttsGenerationQueue)
        console.log('[ChatController] All TTS generations complete')
      }

      // Return to idle after response (and after TTS queue finishes)
      if (assistantRef.current?.isReady()) {
        console.log('[ChatController] Returning to idle')
        setTimeout(() => {
          assistantRef.current.idle()
        }, 1000)
      }

    } catch (error) {
      console.error('[ChatController] Chat error:', error)

      // Stop TTS and return to idle on error
      TTSService.stopPlayback()
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
      if (!AIService.isConfigured()) {
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
      const ttsEnabled = ttsConfig.enabled && TTSService.isConfigured()

      // Get formatted messages
      const messages = ChatManager.getFormattedMessages(systemPrompt)

      // Resume TTS playback for new generation
      if (ttsEnabled) {
        TTSService.resumePlayback()
      }

      // Streaming state
      let fullResponse = ''
      let hasSwitchedToSpeaking = false
      let textBuffer = ''
      let ttsChunkIndex = 0
      const ttsGenerationQueue = []

      // Helper function to generate TTS chunk
      const generateTTSChunk = async (text, index) => {
        try {
          console.log(`[ChatController] [Voice] Generating TTS chunk ${index}: "${text.substring(0, 50)}..."`)
          const blob = await TTSService.generateSpeech(text)
          const audioUrl = URL.createObjectURL(blob)
          TTSService.queueAudio(audioUrl)
          console.log(`[ChatController] [Voice] TTS chunk ${index} queued`)
        } catch (error) {
          console.error(`[ChatController] [Voice] TTS chunk ${index} failed:`, error)
        }
      }

      // Change to speaking state immediately when we start generating TTS
      let hasChangedToSpeaking = false

      await AIService.sendMessage(messages, async (chunk) => {
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
            
            // Generate TTS immediately
            if (chunkToSpeak && chunkToSpeak.length >= 3) {
              const currentChunkIndex = ttsChunkIndex++
              
              // Change to speaking state when we start generating first TTS chunk
              if (!hasChangedToSpeaking) {
                console.log('[ChatController] [Voice] Changing to SPEAKING state (first TTS chunk)')
                VoiceConversationService.changeState(ConversationStates.SPEAKING)
                hasChangedToSpeaking = true
              }
              
              console.log(`[ChatController] [Voice] Found sentence chunk ${currentChunkIndex}: "${chunkToSpeak.substring(0, 50)}..."`)
              ttsGenerationQueue.push(generateTTSChunk(chunkToSpeak, currentChunkIndex))
            }
          }
        }
      })

      console.log('[ChatController] Voice AI response complete:', fullResponse)

      // Add any remaining text in buffer
      if (ttsEnabled && textBuffer.trim().length > 0) {
        const finalChunk = textBuffer.trim()
        console.log(`[ChatController] [Voice] Generating final TTS chunk: "${finalChunk.substring(0, 50)}..."`)
        
        if (!hasChangedToSpeaking) {
          console.log('[ChatController] [Voice] Changing to SPEAKING state (final chunk)')
          VoiceConversationService.changeState(ConversationStates.SPEAKING)
          hasChangedToSpeaking = true
        }
        
        ttsGenerationQueue.push(generateTTSChunk(finalChunk, ttsChunkIndex++))
      }

      // Wait for all TTS generations to complete
      if (ttsEnabled && ttsGenerationQueue.length > 0) {
        console.log(`[ChatController] [Voice] Waiting for ${ttsGenerationQueue.length} TTS generations...`)
        await Promise.all(ttsGenerationQueue)
        console.log('[ChatController] [Voice] All TTS generations complete')
        
        // Start monitoring TTS playback to return to listening when done
        VoiceConversationService.monitorTTSPlayback()
      } else {
        // No TTS, return to listening immediately
        console.warn('[ChatController] [Voice] No TTS generated, returning to listening')
        VoiceConversationService.changeState(ConversationStates.LISTENING)
      }

      // Return to idle
      if (assistantRef.current?.isReady()) {
        setTimeout(() => {
          assistantRef.current.idle()
        }, 1000)
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
      {/* Chat Button - follows model */}
      <ChatButton
        positionManagerRef={positionManagerRef}
        onClick={handleChatButtonClick}
        isVisible={isAssistantReady && !isChatContainerVisible && !isProcessing}
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
      />
    </>
  )
}

export default ChatController
