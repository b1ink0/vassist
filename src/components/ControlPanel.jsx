/**
 * @fileoverview Developer control panel for debugging assistant behavior, animations, and performance.
 */

import { useState, useRef, useEffect } from 'react'
import { Icon } from './icons';;
import DebugOverlay from './DebugOverlay';
import ResourceLoader from '../utils/ResourceLoader';
import { StorageServiceProxy } from '../services/proxies';
import { useConfig } from '../contexts/ConfigContext';
import Logger from '../services/LoggerService';

/**
 * Developer control panel component with debug tools and performance metrics.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {boolean} props.isAssistantReady - Whether assistant is ready
 * @param {string} props.currentState - Current assistant state
 * @param {Object} props.assistantRef - Reference to VirtualAssistant
 * @param {Object} props.sceneRef - Reference to Babylon scene
 * @param {Object} props.positionManagerRef - Reference to PositionManager
 * @param {Function} props.onStateChange - Callback when state changes
 * @returns {JSX.Element} Control panel component
 */
const ControlPanel = ({ 
  isAssistantReady,
  currentState,
  assistantRef,
  sceneRef,
  positionManagerRef,
  onStateChange
}) => {
  const { uiConfig } = useConfig();
  const [showPerf, setShowPerf] = useState(false);
  const [perfData, setPerfData] = useState({ fps: 0, meshes: 0, particles: 0, drawCalls: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('actions');
  const [queueStatus, setQueueStatus] = useState({ length: 0, isEmpty: true, items: [] });
  const [buttonPos, setButtonPos] = useState({ x: -100, y: -100 }); // Start off-screen
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartButtonPos = useRef({ x: 0, y: 0 });
  
  const [loggerEnabled, setLoggerEnabled] = useState(false);
  const [logCategories, setLogCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const blobUrlsRef = useRef([]);

  useEffect(() => {
    const loadButtonPosition = async () => {
      const defaultPos = { x: window.innerWidth - 180, y: 20 };
      try {
        const savedPos = await StorageServiceProxy.configLoad('devControlPanelButtonPosition', defaultPos);
        
        const buttonSize = 48;
        const boundedX = Math.max(10, Math.min(savedPos.x, window.innerWidth - buttonSize - 10));
        const boundedY = Math.max(10, Math.min(savedPos.y, window.innerHeight - buttonSize - 10));
        
        const validPos = { x: boundedX, y: boundedY };
        setButtonPos(validPos);
        
        if (boundedX !== savedPos.x || boundedY !== savedPos.y) {
          await StorageServiceProxy.configSave('devControlPanelButtonPosition', validPos);
        }
      } catch (error) {
        Logger.error('ControlPanel', 'Failed to load button position:', error);
        const defaultPos = { x: window.innerWidth - 180, y: 20 };
        setButtonPos(defaultPos);
      }
    };
    
    loadButtonPosition();
  }, []);

  useEffect(() => {
    const handleResize = async () => {
      const buttonSize = 48;
      const boundedX = Math.max(10, Math.min(buttonPos.x, window.innerWidth - buttonSize - 10));
      const boundedY = Math.max(10, Math.min(buttonPos.y, window.innerHeight - buttonSize - 10));
      
      if (boundedX !== buttonPos.x || boundedY !== buttonPos.y) {
        const newPos = { x: boundedX, y: boundedY };
        setButtonPos(newPos);
        try {
          await StorageServiceProxy.configSave('devControlPanelButtonPosition', newPos);
        } catch (error) {
          Logger.error('ControlPanel', 'Failed to save button position on resize:', error);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [buttonPos]);

  useEffect(() => {
    const loadLoggerState = () => {
      setLoggerEnabled(Logger.isEnabled());
      setLogCategories(Logger.getCategories());
    };

    loadLoggerState();
    
    if (isVisible && activeTab === 'logs') {
      loadLoggerState();
    }
  }, [isVisible, activeTab]);

  /**
   * Handles mouse down on drag button.
   */
  const handleButtonMouseDown = (e) => {
    if (e.button !== 0) return;
    
    setIsDragging(true);
    setHasDragged(false);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartButtonPos.current = { ...buttonPos };
    
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    if (!showPerf) return;

    let frameCount = 0;
    let lastTime = performance.now();
    let actualFps = 0;

    const update = () => {
      try {
        const scene = sceneRef.current;
        if (!scene) return;
        const engine = scene.getEngine && scene.getEngine();
        
        // Calculate actual FPS by counting frames
        frameCount++;
        const currentTime = performance.now();
        const elapsed = currentTime - lastTime;
        
        if (elapsed >= 1000) {
          actualFps = Math.round((frameCount * 1000) / elapsed);
          frameCount = 0;
          lastTime = currentTime;
        }
        
        const meshes = scene.meshes ? scene.meshes.length : 0;
        const particles = scene.particleSystems ? scene.particleSystems.length : 0;
        const drawCalls = engine && engine._drawCalls && engine._drawCalls.current 
          ? engine._drawCalls.current 
          : 0;
        
        setPerfData({ fps: actualFps, meshes, particles, drawCalls });
      } catch (err) {
        Logger.warn('ControlPanel', 'perf sampler error', err);
      }
    };

    const scene = sceneRef.current;
    let observer = null;
    if (scene && scene.onAfterRenderObservable) {
      observer = scene.onAfterRenderObservable.add(update);
    }

    return () => {
      if (observer && scene && scene.onAfterRenderObservable) {
        scene.onAfterRenderObservable.remove(observer);
      }
    };
  }, [showPerf, sceneRef]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      setHasDragged(true);
      
      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      
      const newX = dragStartButtonPos.current.x + deltaX;
      const newY = dragStartButtonPos.current.y + deltaY;
      
      const buttonSize = 48;
      const boundedX = Math.max(10, Math.min(newX, window.innerWidth - buttonSize - 10));
      const boundedY = Math.max(10, Math.min(newY, window.innerHeight - buttonSize - 10));
      
      setButtonPos({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      
      if (hasDragged) {
        StorageServiceProxy.configSave('devControlPanelButtonPosition', buttonPos).catch(error => {
          Logger.error('ControlPanel', 'Failed to save button position after drag:', error);
        });
        
        setTimeout(() => setHasDragged(false), 100);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, hasDragged, buttonPos]);

  const handleButtonClick = () => {
    if (!hasDragged) {
      setIsVisible(!isVisible);
    }
  };

  /**
   * Triggers an action on the assistant.
   * 
   * @param {string} action - Action to trigger
   */
  const triggerAction = async (action) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      Logger.warn('ControlPanel', 'VirtualAssistant not ready');
      return;
    }
    await assistantRef.current.triggerAction(action);
    onStateChange(assistantRef.current.getState());
  };

  /**
   * Returns assistant to idle state.
   */
  const returnToIdle = async () => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      Logger.warn('ControlPanel', 'VirtualAssistant not ready');
      return;
    }
    await assistantRef.current.idle();
    onStateChange(assistantRef.current.getState());
  };

  /**
   * Tests emotion-based animations with speak API.
   * 
   * @param {string} emotionCategory - Emotion category for body animation
   * @param {string} text - Text to speak
   */
  const testEmotion = async (emotionCategory, text) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      Logger.warn('ControlPanel', 'VirtualAssistant not ready');
      return;
    }
    
    const placeholderMouthAnimationUrl = await ResourceLoader.getURLAsync('res/private_test/motion/audio.bvmd');
    
    try {
      const response = await fetch(placeholderMouthAnimationUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      blobUrlsRef.current.push(blobUrl);
      
      await assistantRef.current.speak(text, blobUrl, emotionCategory);
      onStateChange(assistantRef.current.getState());
      
    } catch (error) {
      Logger.error('ControlPanel', 'Failed to load placeholder animation:', error);
    }
  };

  /**
   * Changes assistant position preset.
   * 
   * @param {string} preset - Position preset name
   */
  const changePosition = (preset) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      Logger.warn('ControlPanel', 'VirtualAssistant not ready');
      return;
    }
    assistantRef.current.setPosition(preset);
  };

  /**
   * Plays composite animation with stitched fill.
   * 
   * @param {string} primaryAnimName - Primary animation name
   * @param {string} fillCategory - Fill category for stitched animation
   * @param {Object} options - Additional options
   */
  const playComposite = async (primaryAnimName, fillCategory = 'talking', options = {}) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      Logger.warn('ControlPanel', 'VirtualAssistant not ready');
      return;
    }

    await assistantRef.current.playComposite(primaryAnimName, fillCategory, options);
    
    onStateChange(assistantRef.current.getState());
  };

  /**
   * Queues a simple animation.
   * 
   * @param {string} animationName - Animation name to queue
   * @param {boolean} force - Whether to force play
   */
  const queueSimple = (animationName, force = false) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      Logger.warn('ControlPanel', 'VirtualAssistant not ready');
      return;
    }
    assistantRef.current.queueAnimation(animationName, force);
    Logger.log('ControlPanel', `Queued animation: ${animationName} (force: ${force})`);
    updateQueueStatus();
  };

  /**
   * Queues multiple animations for testing.
   */
  const queueMultiple = async () => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      Logger.warn('ControlPanel', 'VirtualAssistant not ready');
      return;
    }
    
    queueSimple('Hi 1', false);
    queueSimple('Thinking 1', false);
    queueSimple('Celebrating Clap', false);
    queueSimple('Yawn 1', false);
    Logger.log('ControlPanel', 'Queued 4-animation sequence');
  };

  /**
   * Queues speak animation for testing.
   * 
   * @param {string} emotionCategory - Emotion category for body animation
   * @param {boolean} force - Whether to force play
   */
  const queueSpeakTest = async (emotionCategory, force = false) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      Logger.warn('ControlPanel', 'VirtualAssistant not ready');
      return;
    }
    
    try {
      const animationUrl = await ResourceLoader.getURLAsync('res/private_test/motion/audio.bvmd');
      const response = await fetch(animationUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrlsRef.current.push(blobUrl);
      
      assistantRef.current.queueSpeak(
        `Testing ${emotionCategory} speech`,
        blobUrl,
        emotionCategory,
        {},
        force
      );
      Logger.log('ControlPanel', `Queued speak: ${emotionCategory} (force: ${force})`);
      updateQueueStatus();
    } catch (error) {
      Logger.error('ControlPanel', 'Failed to queue speak:', error);
    }
  };

  /**
   * Clears animation queue.
   */
  const clearQueue = () => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      Logger.warn('ControlPanel', 'VirtualAssistant not ready');
      return;
    }
    assistantRef.current.clearQueue();
    Logger.log('ControlPanel', 'Queue cleared');
    updateQueueStatus();
  };

  /**
   * Updates queue status display.
   */
  const updateQueueStatus = () => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      setQueueStatus({ length: 0, isEmpty: true, items: [] });
      return;
    }
    const status = assistantRef.current.getQueueStatus();
    setQueueStatus(status);
  };

  if (activeTab === 'queue' && assistantRef.current && assistantRef.current.isReady()) {
    const status = assistantRef.current.getQueueStatus();
    if (status.length !== queueStatus.length) {
      setQueueStatus(status);
    }
  }

  if (!isAssistantReady) return null;

  const panelX = Math.max(10, Math.min(buttonPos.x - 450, window.innerWidth - 530));
  const panelY = Math.min(buttonPos.y + 60, window.innerHeight - 600);

  if (!uiConfig.enableDebugPanel) {
    return null;
  }

  return (
    <>
      <button
        onMouseDown={handleButtonMouseDown}
        onClick={handleButtonClick}
        style={{
          position: 'fixed',
          left: `${buttonPos.x}px`,
          top: `${buttonPos.y}px`,
          zIndex: 9998,
        }}
        className={`w-12 h-12 bg-black/90 text-white border border-white/20 rounded-lg cursor-move shadow-lg backdrop-blur-sm flex items-center justify-center text-xl hover:bg-black transition-colors ${
          isDragging ? 'border-white/40' : ''
        }`}
        title="Drag to reposition | Click to toggle panel"
      ><Icon name="tools" size={16} /></button>

      {isVisible && (
        <div
          style={{
            position: 'fixed',
            left: `${panelX}px`,
            top: `${panelY}px`,
            zIndex: 9997,
          }}
          className="pointer-events-auto bg-black/90 rounded-lg shadow-2xl border border-white/20 backdrop-blur-sm w-[520px]"
        >
      <div className="flex justify-between items-center p-4 border-b border-white/20">
        <div className="flex items-center gap-1">
          <h3 className="m-0 text-base font-semibold text-white">Dev Control Panel</h3>
          <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
            {currentState}
          </span>
          <button
            onClick={() => setShowPerf((s) => !s)}
            className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors border border-blue-500/30"
            title="Toggle Performance Stats"
          >
            📊 Stats
          </button>
          {showPerf && (
            <div
              className="ml-1 text-[11px] text-gray-200 bg-black/60 px-1.5 py-0.5 rounded whitespace-nowrap flex items-center gap-2"
              style={{ fontVariantNumeric: 'tabular-nums' }}
              title={`FPS: ${perfData.fps} · Meshes: ${perfData.meshes} · Particles: ${perfData.particles} · Draw: ${perfData.drawCalls}`}
            >
              <span className="text-[10px] text-gray-300">FPS:</span>
              <span className="text-white font-medium text-[12px]">{perfData.fps}</span>
              <span className="text-[10px] text-gray-400">·</span>
              <span className="text-[10px] text-gray-300">M:</span>
              <span className="text-white text-[11px]">{perfData.meshes}</span>
              <span className="text-[10px] text-gray-400">·</span>
              <span className="text-[10px] text-gray-300">D:</span>
              <span className="text-white text-[11px]">{perfData.drawCalls}</span>
            </div>
          )}
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="bg-red-600 text-white border-none rounded px-2.5 py-1 cursor-pointer text-xs hover:bg-red-700"
        >
          Hide
        </button>
      </div>

      <div className="flex border-b border-white/20 bg-black/50">
        <button
          onClick={() => setActiveTab('actions')}
          className={`flex-1 px-3 py-2 text-xs border-none cursor-pointer transition-colors ${
            activeTab === 'actions' 
              ? 'bg-white/10 text-white border-b-2 border-blue-500' 
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          🎭 Actions
        </button>
        <button
          onClick={() => setActiveTab('positions')}
          className={`flex-1 px-3 py-2 text-xs border-none cursor-pointer transition-colors ${
            activeTab === 'positions' 
              ? 'bg-white/10 text-white border-b-2 border-blue-500' 
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          📍 Positions
        </button>
        <button
          onClick={() => setActiveTab('emotions')}
          className={`flex-1 px-3 py-2 text-xs border-none cursor-pointer transition-colors ${
            activeTab === 'emotions' 
              ? 'bg-white/10 text-white border-b-2 border-blue-500' 
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          😊 Emotions
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex-1 px-3 py-2 text-xs border-none cursor-pointer transition-colors ${
            activeTab === 'queue' 
              ? 'bg-white/10 text-white border-b-2 border-blue-500' 
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          📋 Queue
        </button>
        <button
          onClick={() => setActiveTab('composite')}
          className={`flex-1 px-3 py-2 text-xs border-none cursor-pointer transition-colors ${
            activeTab === 'composite' 
              ? 'bg-white/10 text-white border-b-2 border-blue-500' 
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          🔀 Composite
        </button>
        <button
          onClick={() => setActiveTab('debug')}
          className={`flex-1 px-3 py-2 text-xs border-none cursor-pointer transition-colors ${
            activeTab === 'debug' 
              ? 'bg-white/10 text-white border-b-2 border-blue-500' 
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          🔧 Debug
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 px-3 py-2 text-xs border-none cursor-pointer transition-colors ${
            activeTab === 'logs' 
              ? 'bg-white/10 text-white border-b-2 border-blue-500' 
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          📝 Logs
        </button>
      </div>

      <div className="p-4 max-h-[60vh] overflow-y-auto">
        {activeTab === 'actions' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-3">Trigger assistant actions</p>
            <button
              onClick={returnToIdle}
              className="w-full px-3 py-2 bg-green-500 text-white border-none rounded cursor-pointer text-xs hover:bg-green-600 transition-colors"
            >
              🧘 Idle
            </button>
            <button
              onClick={() => triggerAction('think')}
              className="w-full px-3 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs hover:bg-blue-600 transition-colors"
            >
              🤔 Think
            </button>
            <button
              onClick={() => triggerAction('walk')}
              className="w-full px-3 py-2 bg-orange-500 text-white border-none rounded cursor-pointer text-xs hover:bg-orange-600 transition-colors"
            >
              🚶 Walk
            </button>
            <button
              onClick={() => triggerAction('celebrate')}
              className="w-full px-3 py-2 bg-purple-600 text-white border-none rounded cursor-pointer text-xs hover:bg-purple-700 transition-colors"
            >
              🎉 Celebrate
            </button>
            <button
              onClick={() => triggerAction('speak')}
              className="w-full px-3 py-2 bg-pink-600 text-white border-none rounded cursor-pointer text-xs hover:bg-pink-700 transition-colors"
            >
              💬 Speak
            </button>
            <button
              onClick={() => queueSimple('Blink', false)}
              className="w-full px-3 py-2 bg-yellow-600 text-white border-none rounded cursor-pointer text-xs hover:bg-yellow-700 transition-colors"
            >
              👁️ Test Blink Animation
            </button>
          </div>
        )}

        {activeTab === 'positions' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-3">Test different screen positions</p>
            <button
              onClick={() => changePosition('center')}
              className="w-full px-3 py-2 bg-purple-600 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-purple-700 transition-colors"
            >
              🎯 Center (Debug)
            </button>
            <button
              onClick={() => changePosition('bottom-right')}
              className="w-full px-3 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-blue-600 transition-colors"
            >
              ↘️ Bottom Right
            </button>
            <button
              onClick={() => changePosition('bottom-center')}
              className="w-full px-3 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-blue-600 transition-colors"
            >
              ⬇️ Bottom Center
            </button>
            <button
              onClick={() => changePosition('bottom-left')}
              className="w-full px-3 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-blue-600 transition-colors"
            >
              ↙️ Bottom Left
            </button>
            <button
              onClick={() => changePosition('top-center')}
              className="w-full px-3 py-2 bg-green-500 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-green-600 transition-colors"
            >
              ⬆️ Top Center
            </button>
            <button
              onClick={() => changePosition('top-left')}
              className="w-full px-3 py-2 bg-green-500 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-green-600 transition-colors"
            >
              ↖️ Top Left
            </button>
            <button
              onClick={() => changePosition('top-right')}
              className="w-full px-3 py-2 bg-green-500 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-green-600 transition-colors"
            >
              ↗️ Top Right
            </button>
          </div>
        )}

        {activeTab === 'emotions' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-3">Test emotion-based body language</p>
            <button
              onClick={() => testEmotion('talking', 'I am speaking normally!')}
              className="w-full px-3 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-blue-600 transition-colors"
            >
              � Normal Speech (talking)
            </button>
            <button
              onClick={() => testEmotion('idle', 'Just a calm thought...')}
              className="w-full px-3 py-2 bg-green-500 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-green-600 transition-colors"
            >
              😌 Calm Speech (idle)
            </button>
            <button
              onClick={() => testEmotion('thinking', 'Let me think about that...')}
              className="w-full px-3 py-2 bg-purple-600 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-purple-700 transition-colors"
            >
              🤔 Thoughtful Speech (thinking)
            </button>
            <button
              onClick={() => testEmotion('happy', 'Great news everyone!')}
              className="w-full px-3 py-2 bg-amber-400 text-black border-none rounded cursor-pointer text-xs text-left hover:bg-amber-500 transition-colors"
            >
              😊 Happy Speech (happy)
            </button>
            <button
              onClick={() => testEmotion('excited', 'This is so exciting!')}
              className="w-full px-3 py-2 bg-pink-600 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-pink-700 transition-colors"
            >
              🎉 Excited Speech (excited)
            </button>
            <button
              onClick={() => testEmotion('walking', 'Let me explain while moving...')}
              className="w-full px-3 py-2 bg-orange-600 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-orange-700 transition-colors"
            >
              🚶 Walking Speech (walking)
            </button>
          </div>
        )}

        {activeTab === 'queue' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-3">Queue animations to play sequentially</p>
            
            <div className="bg-white/5 rounded p-3 mb-3">
              <p className="text-xs text-white font-semibold mb-2">Queue Status</p>
              <p className="text-xs text-gray-300">
                Items in queue: <span className="text-green-400 font-bold">{queueStatus.length}</span>
              </p>
              {queueStatus.items.length > 0 && (
                <div className="mt-2 space-y-1">
                  {queueStatus.items.map((item, index) => (
                    <p key={index} className="text-[10px] text-gray-400">
                      {index + 1}. {item.type} - {item.animationName || item.primary || item.text}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs text-white font-semibold">Queue Idle Animations</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => queueSimple('Idle 1')}
                  className="px-2 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs hover:bg-blue-600 transition-colors"
                >
                  😴 Idle 1
                </button>
                <button
                  onClick={() => queueSimple('Idle 2')}
                  className="px-2 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs hover:bg-blue-600 transition-colors"
                >
                  👀 Idle 2
                </button>
                <button
                  onClick={() => queueSimple('Idle Short')}
                  className="px-2 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs hover:bg-blue-600 transition-colors"
                >
                  ⚡ Short
                </button>
                <button
                  onClick={() => queueSimple('Yawn 1')}
                  className="px-2 py-2 bg-green-500 text-white border-none rounded cursor-pointer text-xs hover:bg-green-600 transition-colors"
                >
                  🥱 Yawn 1
                </button>
                <button
                  onClick={() => queueSimple('Yawn 2')}
                  className="px-2 py-2 bg-teal-500 text-white border-none rounded cursor-pointer text-xs hover:bg-teal-600 transition-colors"
                >
                  😮 Yawn 2
                </button>
                <button
                  onClick={() => queueSimple('Hi 1')}
                  className="px-2 py-2 bg-pink-500 text-white border-none rounded cursor-pointer text-xs hover:bg-pink-600 transition-colors"
                >
                  👋 Hi 1
                </button>
                <button
                  onClick={() => queueSimple('Hi 2')}
                  className="px-2 py-2 bg-pink-500 text-white border-none rounded cursor-pointer text-xs hover:bg-pink-600 transition-colors"
                >
                  👋 Hi 2
                </button>
              </div>
            </div>

            <div className="space-y-2 border-t border-white/20 pt-3">
              <p className="text-xs text-white font-semibold">Queue Action Animations</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => queueSimple('Thinking 1')}
                  className="px-2 py-2 bg-purple-500 text-white border-none rounded cursor-pointer text-xs hover:bg-purple-600 transition-colors"
                >
                  🤔 Thinking 1
                </button>
                <button
                  onClick={() => queueSimple('Thinking 2')}
                  className="px-2 py-2 bg-purple-500 text-white border-none rounded cursor-pointer text-xs hover:bg-purple-600 transition-colors"
                >
                  🤔 Thinking 2
                </button>
                <button
                  onClick={() => queueSimple('Celebrating Clap')}
                  className="px-2 py-2 bg-yellow-500 text-black border-none rounded cursor-pointer text-xs hover:bg-yellow-600 transition-colors"
                >
                  🎉 Celebrate
                </button>
                <button
                  onClick={() => queueSimple('Hi 1')}
                  className="px-2 py-2 bg-pink-500 text-white border-none rounded cursor-pointer text-xs hover:bg-pink-600 transition-colors"
                >
                  👋 Hi 1
                </button>
              </div>
            </div>

            <div className="space-y-2 border-t border-white/20 pt-3">
              <p className="text-xs text-white font-semibold">Batch Queue Tests</p>
              <button
                onClick={queueMultiple}
                className="w-full px-3 py-2 bg-indigo-600 text-white border-none rounded cursor-pointer text-xs hover:bg-indigo-700 transition-colors"
              >
                📋 Queue 4-Animation Sequence
              </button>
            </div>

            <div className="space-y-2 border-t border-white/20 pt-3">
              <p className="text-xs text-white font-semibold">Queue Speak Tests</p>
              <button
                onClick={() => queueSpeakTest('talking')}
                className="w-full px-3 py-2 bg-cyan-500 text-white border-none rounded cursor-pointer text-xs hover:bg-cyan-600 transition-colors"
              >
                ➕ Queue Talking Speech
              </button>
              <button
                onClick={() => queueSpeakTest('idle')}
                className="w-full px-3 py-2 bg-teal-500 text-white border-none rounded cursor-pointer text-xs hover:bg-teal-600 transition-colors"
              >
                ➕ Queue Calm Speech
              </button>
            </div>

            <div className="space-y-2 border-t border-white/20 pt-3">
              <p className="text-xs text-white font-semibold">Force Mode (Interrupt Current)</p>
              <button
                onClick={() => queueSimple('Thinking 1', true)}
                className="w-full px-3 py-2 bg-red-600 text-white border-none rounded cursor-pointer text-xs hover:bg-red-700 transition-colors"
              >
                ⚡ Force Play Thinking (Interrupt)
              </button>
              <button
                onClick={() => queueSpeakTest('talk_excited', true)}
                className="w-full px-3 py-2 bg-orange-600 text-white border-none rounded cursor-pointer text-xs hover:bg-orange-700 transition-colors"
              >
                ⚡ Force Excited Speech (Interrupt)
              </button>
            </div>

            <button
              onClick={clearQueue}
              className="w-full px-3 py-2 bg-gray-700 text-white border-none rounded cursor-pointer text-xs hover:bg-gray-600 transition-colors mt-3"
            >
              🗑️ Clear Queue
            </button>

            <div className="border-t border-white/20 mt-3 pt-3">
              <p className="text-[10px] text-gray-500 mb-2">ℹ️ Queue System Guide:</p>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                • Queue animations play sequentially after current finishes
                <br/>• Force mode interrupts current animation immediately
                <br/>• Queue integrates with actions/emotions/composite
                <br/>• Use for LLM-generated speech sequences
              </p>
            </div>
          </div>
        )}

        {activeTab === 'composite' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-3">Primary animation + stitched fill animations</p>
            
            <div className="space-y-2">
              <p className="text-xs text-white font-semibold">Lip Sync + Body Animations</p>
              <button
                onClick={() => playComposite('Audio Test', 'talking')}
                className="w-full px-3 py-2 bg-indigo-500 text-white border-none rounded cursor-pointer text-xs hover:bg-indigo-600 transition-colors"
              >
                💬 Lip Sync + Talking (Random)
              </button>
              <button
                onClick={() => playComposite('Audio Test', 'idle')}
                className="w-full px-3 py-2 bg-green-500 text-white border-none rounded cursor-pointer text-xs hover:bg-green-600 transition-colors"
              >
                🧘 Lip Sync + Idle (Random)
              </button>
              <button
                onClick={() => playComposite('Audio Test', 'thinking')}
                className="w-full px-3 py-2 bg-purple-500 text-white border-none rounded cursor-pointer text-xs hover:bg-purple-600 transition-colors"
              >
                🤔 Lip Sync + Thinking (Random)
              </button>
              <button
                onClick={() => playComposite('Audio Test', 'happy')}
                className="w-full px-3 py-2 bg-yellow-500 text-white border-none rounded cursor-pointer text-xs hover:bg-yellow-600 transition-colors"
              >
                😊 Lip Sync + Happy (Placeholder)
              </button>
              <button
                onClick={() => playComposite('Audio Test', 'excited')}
                className="w-full px-3 py-2 bg-pink-500 text-white border-none rounded cursor-pointer text-xs hover:bg-pink-600 transition-colors"
              >
                🎉 Lip Sync + Excited (Placeholder)
              </button>
              <button
                onClick={() => playComposite('Audio Test', 'walking')}
                className="w-full px-3 py-2 bg-orange-500 text-white border-none rounded cursor-pointer text-xs hover:bg-orange-600 transition-colors"
              >
                🚶 Lip Sync + Walking (Placeholder)
              </button>
            </div>
          </div>
        )}

        {activeTab === 'debug' && (
          <div>
            <p className="text-xs text-gray-400 mb-3">Camera and visualization controls</p>
            <DebugOverlay
              scene={sceneRef.current}
              positionManager={positionManagerRef.current}
              embedded={true}
            />
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-3">Control console logging by category</p>
            
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
              <div>
                <div className="text-sm font-semibold text-white">Master Logging</div>
                <div className="text-[11px] text-gray-400">Enable/disable all console logs</div>
              </div>
              <button
                onClick={async () => {
                  const newState = !loggerEnabled;
                  setLoggerEnabled(newState);
                  await Logger.setEnabled(newState);
                }}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                  loggerEnabled
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                {loggerEnabled ? '✓ Enabled' : '✗ Disabled'}
              </button>
            </div>

            {loggerEnabled && (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await Logger.enableAllCategories();
                    setLogCategories(Logger.getCategories());
                  }}
                  className="flex-1 px-3 py-1.5 bg-blue-500 text-white border-none rounded cursor-pointer text-xs hover:bg-blue-600 transition-colors"
                >
                  ✓ Enable All
                </button>
                <button
                  onClick={async () => {
                    await Logger.disableAllCategories();
                    setLogCategories(Logger.getCategories());
                  }}
                  className="flex-1 px-3 py-1.5 bg-gray-600 text-white border-none rounded cursor-pointer text-xs hover:bg-gray-700 transition-colors"
                >
                  ✗ Disable All
                </button>
              </div>
            )}

            {loggerEnabled && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {loggerEnabled && (
              <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-2">
                {logCategories
                  .filter(cat => 
                    searchTerm === '' || 
                    cat.category.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map(({ category, enabled, color }) => (
                    <div
                      key={category}
                      className="flex items-center justify-between p-2 bg-white/5 rounded hover:bg-white/10 transition-colors border border-white/5"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                          title={`Color: ${color}`}
                        />
                        <span className="text-xs text-white font-mono truncate" title={category}>
                          {category}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          await Logger.setCategoryEnabled(category, !enabled);
                          setLogCategories(Logger.getCategories());
                        }}
                        className={`px-3 py-1 rounded text-[10px] font-medium transition-colors flex-shrink-0 ml-2 ${
                          enabled
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                            : 'bg-gray-600/20 text-gray-400 border border-gray-600/30 hover:bg-gray-600/30'
                        }`}
                      >
                        {enabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  ))}
                {logCategories.filter(cat => 
                  searchTerm === '' || 
                  cat.category.toLowerCase().includes(searchTerm.toLowerCase())
                ).length === 0 && (
                  <div className="text-center text-xs text-gray-500 py-4">
                    {searchTerm ? 'No categories match your search' : 'No categories found'}
                  </div>
                )}
              </div>
            )}

            {!loggerEnabled && (
              <div className="text-center text-xs text-gray-500 py-8">
                Enable master logging to configure categories
              </div>
            )}
          </div>
        )}
      </div>
        </div>
      )}
    </>
  );
};

export default ControlPanel;
