import { useState } from 'react'
import './App.css'
import BabylonScene from './components/babylon/BabylonScene'
import { buildMmdCompositeScene } from './components/babylon/MmdCompositeScene'

function App() {
  const [sceneType, setSceneType] = useState('mmd') // 'basic' or 'mmd'

  return (
    <div>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000 }}>
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
          MMD Composite Scene
        </button>
      </div>
      <BabylonScene sceneBuilder={sceneType === 'mmd' ? buildMmdCompositeScene : null} />
    </div>
  )
}

export default App
