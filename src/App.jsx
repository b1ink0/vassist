import { useState } from 'react'
import './App.css'
import BabylonScene from './components/babylon/BabylonScene'
import { buildMmdCompositeScene } from './components/babylon/MmdCompositeScene'

function App() {
  const [sceneType, setSceneType] = useState('mmd') // 'basic' or 'mmd'

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
        <BabylonScene sceneBuilder={sceneType === 'mmd' ? buildMmdCompositeScene : null} />
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
    </div>
  )
}

export default App
