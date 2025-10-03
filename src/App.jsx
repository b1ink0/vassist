import { useState } from 'react'
import './App.css'
import BabylonScene from './components/babylon/BabylonScene'
import { buildMmdCompositeScene } from './components/babylon/MmdCompositeScene'

function App() {
  const [sceneType, setSceneType] = useState('mmd') // 'basic' or 'mmd'
  const [animationManager, setAnimationManager] = useState(null)
  const [currentState, setCurrentState] = useState('IDLE')

  const handleSceneReady = (scene) => {
    console.log('[App] Scene ready, checking for AnimationManager...')
    if (scene.metadata && scene.metadata.animationManager) {
      console.log('[App] AnimationManager found!')
      setAnimationManager(scene.metadata.animationManager)
      setCurrentState(scene.metadata.animationManager.getCurrentState())
    }
  }

  const triggerAction = async (action) => {
    if (!animationManager) {
      console.warn('[App] AnimationManager not ready')
      return
    }
    console.log(`[App] Triggering action: ${action}`)
    await animationManager.triggerAction(action)
    setCurrentState(animationManager.getCurrentState())
  }

  const returnToIdle = async () => {
    if (!animationManager) return
    await animationManager.returnToIdle()
    setCurrentState(animationManager.getCurrentState())
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
        <BabylonScene 
          sceneBuilder={sceneType === 'mmd' ? buildMmdCompositeScene : null} 
          onSceneReady={handleSceneReady}
        />
      </div>

      {/* UI Controls on top */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, pointerEvents: 'auto' }}>
        <button
          onClick={() => setSceneType('basic')}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: sceneType === 'basic' ? '#4CAF50' : '#888',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Basic Scene
        </button>
        <button
          onClick={() => setSceneType('mmd')}
          style={{
            padding: '10px 20px',
            backgroundColor: sceneType === 'mmd' ? '#4CAF50' : '#888',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          MMD Orthographic
        </button>
      </div>

      {/* Animation Control Panel */}
      {sceneType === 'mmd' && animationManager && (
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
          <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>🎭 Animation Controls</h3>
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
      )}
    </div>
  )
}

export default App
