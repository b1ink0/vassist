import { useState, useRef, useCallback } from 'react'
import './App.css'
import VirtualAssistant from './components/VirtualAssistant'

function App() {
  const [currentState, setCurrentState] = useState('IDLE')
  const [isAssistantReady, setIsAssistantReady] = useState(false)
  
  // Ref to access VirtualAssistant imperative API
  const assistantRef = useRef(null)

  /**
   * Handle VirtualAssistant ready
   * Wrapped in useCallback to prevent infinite re-renders
   */
  const handleAssistantReady = useCallback(({ animationManager }) => {
    console.log('[App] VirtualAssistant ready!')
    setCurrentState(animationManager.getCurrentState())
    setIsAssistantReady(true)
  }, [])

  /**
   * Trigger action via VirtualAssistant API
   */
  const triggerAction = async (action) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[App] VirtualAssistant not ready')
      return
    }
    console.log(`[App] Triggering action: ${action}`)
    await assistantRef.current.triggerAction(action)
    setCurrentState(assistantRef.current.getState())
  }

  /**
   * Return to idle via VirtualAssistant API
   */
  const returnToIdle = async () => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[App] VirtualAssistant not ready')
      return
    }
    await assistantRef.current.idle()
    setCurrentState(assistantRef.current.getState())
  }

  /**
   * Test emotion-based animations
   */
  const testEmotion = async (emotion, text) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[App] VirtualAssistant not ready')
      return
    }
    console.log(`[App] Testing emotion: ${emotion}`)
    await assistantRef.current.speak(text, emotion)
    setCurrentState(assistantRef.current.getState())
  }

  /**
   * Set state via emotion or state name
   */
  const setAssistantState = async (stateOrEmotion) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[App] VirtualAssistant not ready')
      return
    }
    await assistantRef.current.setState(stateOrEmotion)
    setCurrentState(assistantRef.current.getState())
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      {/* Background HTML content */}
      <div style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 0,
      }}>
        <h1 style={{ color: 'white', fontSize: '3rem', marginBottom: '1rem', textAlign: 'center' }}>
          Virtual Assistant
        </h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '1.2rem', maxWidth: '600px', textAlign: 'center' }}>
          Orthographic 3D model rendered on transparent background
        </p>
      </div>

      {/* Transparent 3D canvas overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
        <VirtualAssistant 
          ref={assistantRef}
          onReady={handleAssistantReady}
        />
      </div>

      {/* Animation Control Panel */}
      {isAssistantReady && (
        <>
          {/* Action Controls */}
          <div style={{ 
            position: 'absolute', 
            bottom: 20, 
            left: 20, 
            zIndex: 1000, 
            pointerEvents: 'auto',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '15px',
            borderRadius: '8px',
            color: 'white',
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>🎭 Action Controls</h3>
            <div style={{ marginBottom: '10px', fontSize: '12px', opacity: 0.8 }}>
              Current State: <strong>{currentState}</strong>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxWidth: '300px' }}>
              <button
                onClick={returnToIdle}
                style={{
                  padding: '8px 12px',
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                🧘 Idle
              </button>
              <button
                onClick={() => triggerAction('think')}
                style={{
                  padding: '8px 12px',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                🤔 Think
              </button>
              <button
                onClick={() => triggerAction('walk')}
                style={{
                  padding: '8px 12px',
                  background: '#FF9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                🚶 Walk
              </button>
              <button
                onClick={() => triggerAction('celebrate')}
                style={{
                  padding: '8px 12px',
                  background: '#9C27B0',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                🎉 Celebrate
              </button>
              <button
                onClick={() => triggerAction('speak')}
                style={{
                  padding: '8px 12px',
                  background: '#E91E63',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                💬 Speak
              </button>
            </div>
          </div>

          {/* Emotion Controls */}
          <div style={{ 
            position: 'absolute', 
            bottom: 20, 
            right: 20, 
            zIndex: 1000, 
            pointerEvents: 'auto',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '15px',
            borderRadius: '8px',
            color: 'white',
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>😊 Emotion Tests</h3>
            <div style={{ marginBottom: '8px', fontSize: '11px', opacity: 0.7 }}>
              Test emotion mapping (speak method)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '200px' }}>
              <button
                onClick={() => testEmotion('happy', 'I am happy!')}
                style={{
                  padding: '8px 12px',
                  background: '#FFC107',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'left',
                }}
              >
                😊 Happy
              </button>
              <button
                onClick={() => testEmotion('thinking', 'Let me think...')}
                style={{
                  padding: '8px 12px',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'left',
                }}
              >
                🤔 Thinking
              </button>
              <button
                onClick={() => testEmotion('calm', 'Stay calm...')}
                style={{
                  padding: '8px 12px',
                  background: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'left',
                }}
              >
                😌 Calm
              </button>
              <button
                onClick={() => testEmotion('curious', 'What is this?')}
                style={{
                  padding: '8px 12px',
                  background: '#9C27B0',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'left',
                }}
              >
                🧐 Curious
              </button>
              <button
                onClick={() => setAssistantState('excited')}
                style={{
                  padding: '8px 12px',
                  background: '#FF5722',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'left',
                }}
              >
                🎉 Excited
              </button>
              <button
                onClick={() => testEmotion('error', 'Something went wrong!')}
                style={{
                  padding: '8px 12px',
                  background: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'left',
                }}
              >
                ❌ Error
              </button>
              <button
                onClick={() => testEmotion('invalid_emotion_test', 'Testing fallback...')}
                style={{
                  padding: '8px 12px',
                  background: '#607D8B',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  textAlign: 'left',
                }}
              >
                🔧 Invalid (test fallback)
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default App
