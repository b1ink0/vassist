import { useState, useEffect } from 'react'
import ChatButton from './babylon/ChatButton'
import ChatInput from './babylon/ChatInput'
import ChatContainer from './babylon/ChatContainer'
import ChatManager from '../managers/ChatManager'
import AIService from '../services/AIService'
import TTSService from '../services/TTSService'
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
  }, [assistantRef])

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

      // Stream AI response
      let fullResponse = ''
      let hasSwitchedToSpeaking = false
      let textBuffer = '' // Buffer for TTS chunking
      let ttsChunksToGenerate = [] // Queue of text chunks to generate TTS for

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

        // TTS Generation: Look for complete sentences to chunk
        if (ttsEnabled) {
          // Look for sentence boundaries FIRST, regardless of buffer size
          // Match patterns:
          // 1. Punctuation + space: "Hello. " or "Really? " or "Haha! "
          // 2. Punctuation + newline: "Haha!\n"
          // 3. Just newline: paragraph breaks
          const sentenceEnd = /[.!?:]\s|[.!?:]\n|\n/.exec(textBuffer)
          
          if (sentenceEnd) {
            // Found a sentence boundary
            const chunkToSpeak = textBuffer.substring(0, sentenceEnd.index + sentenceEnd[0].length).trim()
            textBuffer = textBuffer.substring(sentenceEnd.index + sentenceEnd[0].length) // Keep rest in buffer
            
            // Add chunk if it has any meaningful content
            // Even very short exclamations like "Haha!" (5 chars) should be spoken
            if (chunkToSpeak && chunkToSpeak.length >= 3) { // Minimum 3 chars (e.g., "Ok!")
              ttsChunksToGenerate.push(chunkToSpeak)
              console.log(`[ChatController] Queued TTS chunk ${ttsChunksToGenerate.length}: "${chunkToSpeak.substring(0, 50)}..."`)
            }
          }
        }
      })

      console.log('[ChatController] AI response complete:', fullResponse)

      // Add any remaining text in buffer to TTS queue
      if (ttsEnabled && textBuffer.trim().length > 0) {
        ttsChunksToGenerate.push(textBuffer.trim())
        console.log(`[ChatController] Queued final TTS chunk: "${textBuffer.trim().substring(0, 50)}..."`)
      }

      // Generate TTS for all chunks sequentially to maintain order
      if (ttsEnabled && ttsChunksToGenerate.length > 0) {
        console.log(`[ChatController] Generating TTS for ${ttsChunksToGenerate.length} chunks in sequence`)
        
        for (let i = 0; i < ttsChunksToGenerate.length; i++) {
          const chunkText = ttsChunksToGenerate[i]
          try {
            console.log(`[ChatController] Generating TTS ${i + 1}/${ttsChunksToGenerate.length}: "${chunkText.substring(0, 50)}..."`)
            const blob = await TTSService.generateSpeech(chunkText)
            const audioUrl = URL.createObjectURL(blob)
            
            // Queue audio for playback - this maintains order
            TTSService.queueAudio(audioUrl)
            console.log(`[ChatController] TTS ${i + 1}/${ttsChunksToGenerate.length} queued successfully`)
          } catch (ttsError) {
            console.warn(`[ChatController] TTS generation failed for chunk ${i + 1}:`, ttsError)
            // Continue with next chunk
          }
        }
        
        console.log('[ChatController] All TTS chunks generated and queued')
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
      />

      {/* Chat Container - message bubbles */}
      <ChatContainer
        positionManagerRef={positionManagerRef}
        messages={chatMessages}
        isVisible={isChatContainerVisible}
        isGenerating={isProcessing}
      />
    </>
  )
}

export default ChatController
