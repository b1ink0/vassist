
import { useState, useRef, useEffect } from 'react';
import DebugOverlay from './DebugOverlay';
import ResourceLoader from '../utils/ResourceLoader';
import storageManager from '../storage';
import { useConfig } from '../contexts/ConfigContext';

const ControlPanel = ({ 
  isAssistantReady,
  currentState,
  assistantRef,
  sceneRef,
  positionManagerRef,
  onStateChange
}) => {
  const { generalConfig } = useConfig();
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('actions');
  const [queueStatus, setQueueStatus] = useState({ length: 0, isEmpty: true, items: [] });
  const [buttonPos, setButtonPos] = useState({ x: -100, y: -100 }); // Start off-screen
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartButtonPos = useRef({ x: 0, y: 0 });
  
  // Track blob URLs for cleanup later.
  const blobUrlsRef = useRef([]);

  // Load saved button position or use default
  useEffect(() => {
    const loadButtonPosition = async () => {
      const defaultPos = { x: window.innerWidth - 180, y: 20 }; // Top-right by default
      try {
        const savedPos = await storageManager.config.load('devControlPanelButtonPosition', defaultPos);
        
        // Ensure button is within viewport bounds
        const buttonSize = 48;
        const boundedX = Math.max(10, Math.min(savedPos.x, window.innerWidth - buttonSize - 10));
        const boundedY = Math.max(10, Math.min(savedPos.y, window.innerHeight - buttonSize - 10));
        
        const validPos = { x: boundedX, y: boundedY };
        setButtonPos(validPos);
        
        if (boundedX !== savedPos.x || boundedY !== savedPos.y) {
          await storageManager.config.save('devControlPanelButtonPosition', validPos);
        }
      } catch (error) {
        console.error('[ControlPanel] Failed to load button position:', error);
        const defaultPos = { x: window.innerWidth - 180, y: 20 };
        setButtonPos(defaultPos);
      }
    };
    
    loadButtonPosition();
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = async () => {
      const buttonSize = 48;
      const boundedX = Math.max(10, Math.min(buttonPos.x, window.innerWidth - buttonSize - 10));
      const boundedY = Math.max(10, Math.min(buttonPos.y, window.innerHeight - buttonSize - 10));
      
      if (boundedX !== buttonPos.x || boundedY !== buttonPos.y) {
        const newPos = { x: boundedX, y: boundedY };
        setButtonPos(newPos);
        try {
          await storageManager.config.save('devControlPanelButtonPosition', newPos);
        } catch (error) {
          console.error('[ControlPanel] Failed to save button position on resize:', error);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [buttonPos]);

  // Drag handlers for button
  const handleButtonMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click
    
    setIsDragging(true);
    setHasDragged(false);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartButtonPos.current = { ...buttonPos };
    
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      setHasDragged(true);
      
      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      
      const newX = dragStartButtonPos.current.x + deltaX;
      const newY = dragStartButtonPos.current.y + deltaY;
      
      // Keep button within viewport bounds
      const buttonSize = 48;
      const boundedX = Math.max(10, Math.min(newX, window.innerWidth - buttonSize - 10));
      const boundedY = Math.max(10, Math.min(newY, window.innerHeight - buttonSize - 10));
      
      setButtonPos({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      
      if (hasDragged) {
        // Save position after drag
        storageManager.config.save('devControlPanelButtonPosition', buttonPos).catch(error => {
          console.error('[ControlPanel] Failed to save button position after drag:', error);
        });
        
        // Reset hasDragged after a short delay to prevent click from firing
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

  // Load AI config on mount
  const triggerAction = async (action) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[ControlPanel] VirtualAssistant not ready');
      return;
    }
    await assistantRef.current.triggerAction(action);
    onStateChange(assistantRef.current.getState());
  };

  /**
   * Return to idle
   */
  const returnToIdle = async () => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[ControlPanel] VirtualAssistant not ready');
      return;
    }
    await assistantRef.current.idle();
    onStateChange(assistantRef.current.getState());
  };

  /**
   * Test emotion-based animations with new speak API
   */
  const testEmotion = async (emotionCategory, text) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[ControlPanel] VirtualAssistant not ready');
      return;
    }
    
    // TODO: Replace with actual TTS→VMD generation
    // For now, use the existing audio.bvmd as placeholder mouth animation
    // This demonstrates the API structure before TTS integration
    const placeholderMouthAnimationUrl = await ResourceLoader.getURLAsync('res/private_test/motion/audio.bvmd');
    
    // Convert file path to blob URL for testing
    // In production, this will be a blob URL from TTS→VMD generation
    try {
      const response = await fetch(placeholderMouthAnimationUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      // Store blob URL for later cleanup (don't revoke immediately - breaks async loading)
      blobUrlsRef.current.push(blobUrl);
      
      // Use new speak API with emotion category
      // emotionCategory determines the body animation ('talking', 'idle', 'thinking', etc.)
      await assistantRef.current.speak(text, blobUrl, emotionCategory);
      onStateChange(assistantRef.current.getState());
      
      // TODO: Implement proper cleanup strategy
    } catch (error) {
      console.error('[ControlPanel] Failed to load placeholder animation:', error);
    }
  };

  /**
   * Change position preset
   */
  const changePosition = (preset) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[ControlPanel] VirtualAssistant not ready');
      return;
    }
    assistantRef.current.setPosition(preset);
  };

  /**
   * Play composite animation with stitched fill
   */
  const playComposite = async (primaryAnimName, fillCategory = 'talking', options = {}) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[ControlPanel] VirtualAssistant not ready');
      return;
    }

    // Use the new playComposite API from VirtualAssistant
    await assistantRef.current.playComposite(primaryAnimName, fillCategory, options);
    
    onStateChange(assistantRef.current.getState());
  };

  // ========================================
  // ========================================
  // QUEUE FUNCTIONS
  // ========================================

  /**
   * Queue a simple animation
   */
  const queueSimple = (animationName, force = false) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[ControlPanel] VirtualAssistant not ready');
      return;
    }
    assistantRef.current.queueAnimation(animationName, force);
    console.log(`[ControlPanel] Queued animation: ${animationName} (force: ${force})`);
    updateQueueStatus();
  };

  /**
   * Queue multiple animations for testing
   */
  const queueMultiple = async () => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[ControlPanel] VirtualAssistant not ready');
      return;
    }
    
    // Queue a sequence of animations - use actual animation names from config
    queueSimple('Waving', false);        // Idle category - waving
    queueSimple('Thinking', false);      // Thinking category
    queueSimple('Happy', false);         // Happy category
    queueSimple('Yawn', false);          // Idle category - yawn
    console.log('[ControlPanel] Queued 4-animation sequence');
  };

  /**
   * Queue speak animations (using placeholder blob for now)
   */
  const queueSpeakTest = async (emotionCategory, force = false) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[ControlPanel] VirtualAssistant not ready');
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
      console.log(`[ControlPanel] Queued speak: ${emotionCategory} (force: ${force})`);
      updateQueueStatus();
    } catch (error) {
      console.error('[ControlPanel] Failed to queue speak:', error);
    }
  };

  /**
   * Clear the queue
   */
  const clearQueue = () => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[ControlPanel] VirtualAssistant not ready');
      return;
    }
    assistantRef.current.clearQueue();
    console.log('[ControlPanel] Queue cleared');
    updateQueueStatus();
  };

  /**
   * Update queue status
   */
  const updateQueueStatus = () => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      setQueueStatus({ length: 0, isEmpty: true, items: [] });
      return;
    }
    const status = assistantRef.current.getQueueStatus();
    setQueueStatus(status);
  };

  // Update queue status when tab changes to queue
  if (activeTab === 'queue' && assistantRef.current && assistantRef.current.isReady()) {
    // Check every render when on queue tab
    const status = assistantRef.current.getQueueStatus();
    if (status.length !== queueStatus.length) {
      setQueueStatus(status);
    }
  }

  if (!isAssistantReady) return null;

  // Calculate panel position (below and to the left of button)
  const panelX = Math.max(10, Math.min(buttonPos.x - 450, window.innerWidth - 530)); // Panel width ~520px
  const panelY = Math.min(buttonPos.y + 60, window.innerHeight - 600); // Panel height ~600px

  // Don't render if developer tools are disabled
  if (!generalConfig.enableDebugPanel) {
    return null;
  }

  return (
    <>
      {/* Draggable Button */}
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
      >
        🛠️
      </button>

      {/* Control Panel */}
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
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-white/20">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-base font-semibold text-white">Dev Control Panel</h3>
          <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
            {currentState}
          </span>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="bg-red-600 text-white border-none rounded px-2.5 py-1 cursor-pointer text-xs hover:bg-red-700"
        >
          Hide
        </button>
      </div>

      {/* Tabs */}
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
      </div>

      {/* Content */}
      <div className="p-4 max-h-[60vh] overflow-y-auto">
        {/* Actions Tab */}
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
          </div>
        )}

        {/* Positions Tab */}
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

        {/* Emotions Tab */}
        {activeTab === 'emotions' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-3">Test emotion-based body language (uses placeholder mouth animation)</p>
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

        {/* Queue Tab */}
        {activeTab === 'queue' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-3">Queue animations to play sequentially</p>
            
            {/* Queue Status */}
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

            {/* Queue Actions */}
            <div className="space-y-2">
              <p className="text-xs text-white font-semibold">Queue Idle Animations</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => queueSimple('Idle Breathing')}
                  className="px-2 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs hover:bg-blue-600 transition-colors"
                >
                  😴 Breathing
                </button>
                <button
                  onClick={() => queueSimple('Idle Looking Around')}
                  className="px-2 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs hover:bg-blue-600 transition-colors"
                >
                  👀 Looking
                </button>
                <button
                  onClick={() => queueSimple('Waving')}
                  className="px-2 py-2 bg-green-500 text-white border-none rounded cursor-pointer text-xs hover:bg-green-600 transition-colors"
                >
                  👋 Waving
                </button>
                <button
                  onClick={() => queueSimple('Yawn')}
                  className="px-2 py-2 bg-teal-500 text-white border-none rounded cursor-pointer text-xs hover:bg-teal-600 transition-colors"
                >
                  🥱 Yawn
                </button>
              </div>
            </div>

            {/* Queue Action Animations */}
            <div className="space-y-2 border-t border-white/20 pt-3">
              <p className="text-xs text-white font-semibold">Queue Action Animations</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => queueSimple('Thinking')}
                  className="px-2 py-2 bg-purple-500 text-white border-none rounded cursor-pointer text-xs hover:bg-purple-600 transition-colors"
                >
                  🤔 Thinking
                </button>
                <button
                  onClick={() => queueSimple('Walking')}
                  className="px-2 py-2 bg-orange-500 text-white border-none rounded cursor-pointer text-xs hover:bg-orange-600 transition-colors"
                >
                  🚶 Walking
                </button>
                <button
                  onClick={() => queueSimple('Celebrating')}
                  className="px-2 py-2 bg-yellow-500 text-black border-none rounded cursor-pointer text-xs hover:bg-yellow-600 transition-colors"
                >
                  🎉 Celebrate
                </button>
                <button
                  onClick={() => queueSimple('Happy')}
                  className="px-2 py-2 bg-pink-500 text-white border-none rounded cursor-pointer text-xs hover:bg-pink-600 transition-colors"
                >
                  😊 Happy
                </button>
              </div>
            </div>

            {/* Batch Queue */}
            <div className="space-y-2 border-t border-white/20 pt-3">
              <p className="text-xs text-white font-semibold">Batch Queue Tests</p>
              <button
                onClick={queueMultiple}
                className="w-full px-3 py-2 bg-indigo-600 text-white border-none rounded cursor-pointer text-xs hover:bg-indigo-700 transition-colors"
              >
                📋 Queue 4-Animation Sequence
              </button>
            </div>

            {/* Queue Speak Tests */}
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

            {/* Force Mode */}
            <div className="space-y-2 border-t border-white/20 pt-3">
              <p className="text-xs text-white font-semibold">Force Mode (Interrupt Current)</p>
              <button
                onClick={() => queueSimple('Thinking', true)}
                className="w-full px-3 py-2 bg-red-600 text-white border-none rounded cursor-pointer text-xs hover:bg-red-700 transition-colors"
              >
                ⚡ Force Play Thinking (Interrupt)
              </button>
              <button
                onClick={() => queueSpeakTest('celebrating', true)}
                className="w-full px-3 py-2 bg-orange-600 text-white border-none rounded cursor-pointer text-xs hover:bg-orange-700 transition-colors"
              >
                ⚡ Force Excited Speech (Interrupt)
              </button>
            </div>

            {/* Clear Queue */}
            <button
              onClick={clearQueue}
              className="w-full px-3 py-2 bg-gray-700 text-white border-none rounded cursor-pointer text-xs hover:bg-gray-600 transition-colors mt-3"
            >
              🗑️ Clear Queue
            </button>

            {/* Info */}
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

        {/* Composite Tab */}
        {activeTab === 'composite' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-3">Primary animation + stitched fill animations</p>
            
            {/* Preset Composites */}
            <div className="space-y-2">
              <p className="text-xs text-white font-semibold">Lip Sync + Body Animations</p>
              <button
                onClick={() => playComposite('Audio Idle', 'talking')}
                className="w-full px-3 py-2 bg-indigo-500 text-white border-none rounded cursor-pointer text-xs hover:bg-indigo-600 transition-colors"
              >
                💬 Lip Sync + Talking
              </button>
              <button
                onClick={() => playComposite('Audio Idle', 'idle')}
                className="w-full px-3 py-2 bg-green-500 text-white border-none rounded cursor-pointer text-xs hover:bg-green-600 transition-colors"
              >
                🧘 Lip Sync + Idle
              </button>
              <button
                onClick={() => playComposite('Audio Idle', 'thinking')}
                className="w-full px-3 py-2 bg-purple-500 text-white border-none rounded cursor-pointer text-xs hover:bg-purple-600 transition-colors"
              >
                🤔 Lip Sync + Thinking
              </button>
              <button
                onClick={() => playComposite('Audio Idle', 'happy')}
                className="w-full px-3 py-2 bg-yellow-500 text-white border-none rounded cursor-pointer text-xs hover:bg-yellow-600 transition-colors"
              >
                😊 Lip Sync + Happy
              </button>
              <button
                onClick={() => playComposite('Audio Idle', 'excited')}
                className="w-full px-3 py-2 bg-pink-500 text-white border-none rounded cursor-pointer text-xs hover:bg-pink-600 transition-colors"
              >
                🎉 Lip Sync + Excited
              </button>
              <button
                onClick={() => playComposite('Audio Idle', 'walking')}
                className="w-full px-3 py-2 bg-orange-500 text-white border-none rounded cursor-pointer text-xs hover:bg-orange-600 transition-colors"
              >
                🚶 Lip Sync + Walking
              </button>
            </div>
          </div>
        )}

        {/* Debug Tab */}
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
      </div>
        </div>
      )}
    </>
  );
};

export default ControlPanel;
