import { useState, useRef, useCallback } from 'react'
import VirtualAssistant from './components/VirtualAssistant'
import ControlPanel from './components/ControlPanel'
import ChatController from './components/ChatController'

function App() {
  const [currentState, setCurrentState] = useState('IDLE')
  const [isAssistantReady, setIsAssistantReady] = useState(false)
  
  // Refs for accessing internal APIs
  const assistantRef = useRef(null)
  const sceneRef = useRef(null)
  const positionManagerRef = useRef(null)

  /**
   * Handle VirtualAssistant ready
   * Wrapped in useCallback to prevent infinite re-renders
   */
  const handleAssistantReady = useCallback(({ animationManager, positionManager, scene }) => {
    console.log('[App] VirtualAssistant ready!')
    setCurrentState(animationManager.getCurrentState())
    setIsAssistantReady(true)
    
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
      <VirtualAssistant 
        ref={assistantRef}
        onReady={handleAssistantReady}
      />

      {/* Unified Control Panel */}
      <ControlPanel
        isAssistantReady={isAssistantReady}
        currentState={currentState}
        assistantRef={assistantRef}
        sceneRef={sceneRef}
        positionManagerRef={positionManagerRef}
        onStateChange={setCurrentState}
      />

      {/* Chat System - handles all chat logic */}
      <ChatController
        assistantRef={assistantRef}
        positionManagerRef={positionManagerRef}
        isAssistantReady={isAssistantReady}
      />
    </div>
  )
}

export default App
