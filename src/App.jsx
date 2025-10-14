import { useState, useRef, useCallback, useEffect } from 'react'
import VirtualAssistant from './components/VirtualAssistant'
import ControlPanel from './components/ControlPanel'
import ChatController from './components/ChatController'
import LoadingIndicator from './components/LoadingIndicator'
import StorageManager from './managers/StorageManager'

function App() {
  const [currentState, setCurrentState] = useState('IDLE')
  const [isAssistantReady, setIsAssistantReady] = useState(false)
  const [isChatUIReady, setIsChatUIReady] = useState(false)
  // Initialize from localStorage IMMEDIATELY - don't wait for useEffect
  const [enableModelLoading, setEnableModelLoading] = useState(() => {
    const generalConfig = StorageManager.getConfig('generalConfig', { enableModelLoading: true })
    console.log('[App] Initial model loading state:', generalConfig.enableModelLoading)
    return generalConfig.enableModelLoading
  })
  
  // Refs for accessing internal APIs
  const assistantRef = useRef(null)
  const sceneRef = useRef(null)
  const positionManagerRef = useRef(null)
  
  // Set assistant ready if model is disabled
  useEffect(() => {
    if (!enableModelLoading) {
      // Simulate brief loading time for chat-only mode (for smooth UX)
      const timer = setTimeout(() => {
        setIsAssistantReady(true)
        setIsChatUIReady(true)
        console.log('[App] Running in chat-only mode (no 3D model)')
      }, 800) // Brief delay for loading indicator visibility
      
      return () => clearTimeout(timer)
    }
  }, [enableModelLoading])
  
  /**
   * Handle VirtualAssistant ready
   * Wrapped in useCallback to prevent infinite re-renders
   */
  const handleAssistantReady = useCallback(({ animationManager, positionManager, scene }) => {
    console.log('[App] VirtualAssistant ready!')
    setCurrentState(animationManager.getCurrentState())
    setIsAssistantReady(true)
    setIsChatUIReady(true)
    
    // Store refs for debug controls and chat integration
    sceneRef.current = scene
    positionManagerRef.current = positionManager
  }, [])

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Background HTML content */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col items-center justify-center p-5 z-0">
        <h1 className="text-white text-5xl mb-4 text-center">
          Virtual Assistant
        </h1>
        <p className="text-white/90 text-xl max-w-2xl text-center">
          Orthographic 3D model rendered on transparent background
        </p>
      </div>

      {/* Transparent 3D canvas overlay */}
      {enableModelLoading && (
        <VirtualAssistant 
          ref={assistantRef}
          onReady={handleAssistantReady}
        />
      )}

      {/* Unified Control Panel */}
      <ControlPanel
        isAssistantReady={isAssistantReady}
        currentState={currentState}
        assistantRef={assistantRef}
        sceneRef={sceneRef}
        positionManagerRef={positionManagerRef}
        onStateChange={setCurrentState}
      />

      {/* Chat System - handles all chat logic with fade-in transition */}
      <div className={`transition-opacity duration-700 ${isChatUIReady ? 'opacity-100' : 'opacity-0'}`}>
        <ChatController
          assistantRef={assistantRef}
          positionManagerRef={positionManagerRef}
          isAssistantReady={isAssistantReady}
          modelDisabled={!enableModelLoading}
        />
      </div>
      
      {/* Loading indicator for chat-only mode */}
      {!enableModelLoading && !isChatUIReady && (
        <LoadingIndicator isVisible={true} />
      )}
    </div>
  )
}

export default App
