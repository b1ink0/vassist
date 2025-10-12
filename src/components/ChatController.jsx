import { useState, useEffect } from 'react'
import ChatButton from './babylon/ChatButton'
import ChatInput from './babylon/ChatInput'
import ChatContainer from './babylon/ChatContainer'
import ChatManager from '../managers/ChatManager'
import AIService from '../services/AIService'
import StorageManager from '../managers/StorageManager'
import { DefaultAIConfig } from '../config/aiConfig'

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
    }

    const handleClearChat = () => {
      console.log('[ChatController] Clear chat event received')
      ChatManager.clearMessages()
      setChatMessages([])
    }

    window.addEventListener('closeChat', handleCloseChat)
    window.addEventListener('clearChat', handleClearChat)

    return () => {
      window.removeEventListener('closeChat', handleCloseChat)
      window.removeEventListener('clearChat', handleClearChat)
    }
  }, [])

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
   */
  const handleMessageSend = async (message) => {
    console.log('[ChatController] Message sent:', message)

    // Add user message to chat
    ChatManager.addMessage('user', message)
    setChatMessages(ChatManager.getMessages())

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

      // Brief pause to show thinking
      await new Promise(resolve => setTimeout(resolve, 500))

      // Load system prompt from config
      const savedConfig = StorageManager.getConfig('aiConfig', DefaultAIConfig)
      const systemPrompt = savedConfig.systemPrompt || DefaultAIConfig.systemPrompt

      console.log('[ChatController] System prompt:', systemPrompt)

      // Get formatted messages for AI
      const messages = ChatManager.getFormattedMessages(systemPrompt)
      console.log('[ChatController] Messages to AI:', messages)

      // Stream AI response
      let fullResponse = ''
      let hasSwitchedToSpeaking = false

      await AIService.sendMessage(messages, (chunk) => {
        fullResponse += chunk

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
      })

      console.log('[ChatController] AI response complete:', fullResponse)

      // Return to idle after response
      if (assistantRef.current?.isReady()) {
        console.log('[ChatController] Returning to idle')
        setTimeout(() => {
          assistantRef.current.idle()
        }, 1000)
      }

    } catch (error) {
      console.error('[ChatController] Chat error:', error)

      // Return to idle on error
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
      />
    </>
  )
}

export default ChatController
