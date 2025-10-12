
import { useState, useRef, useEffect } from 'react';
import DebugOverlay from './DebugOverlay';
import StorageManager from '../managers/StorageManager';
import AIService from '../services/AIService';
import { DefaultAIConfig, AIProviders, validateAIConfig } from '../config/aiConfig';

const ControlPanel = ({ 
  isAssistantReady,
  currentState,
  assistantRef,
  sceneRef,
  positionManagerRef,
  onStateChange
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [activeTab, setActiveTab] = useState('actions');
  const [queueStatus, setQueueStatus] = useState({ length: 0, isEmpty: true, items: [] });
  
  // Track blob URLs for cleanup later.
  const blobUrlsRef = useRef([]);

  // AI Config state
  const [aiConfig, setAiConfig] = useState(DefaultAIConfig);
  const [configSaved, setConfigSaved] = useState(false);
  const [configError, setConfigError] = useState('');

  // Load AI config on mount
  useEffect(() => {
    const savedConfig = StorageManager.getConfig('aiConfig', DefaultAIConfig);
    setAiConfig(savedConfig);
    
    // Try to configure AI service with saved config
    try {
      AIService.configure(savedConfig);
      console.log('[ControlPanel] AI Service configured from saved config');
    } catch (error) {
      console.warn('[ControlPanel] Failed to configure AI Service:', error);
    }
  }, []);

  /**
   * Trigger action via VirtualAssistant API
   */
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
    const placeholderMouthAnimationUrl = 'res/private_test/motion/audio.bvmd';
    
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
  // QUEUE FUNCTIONS
  // ========================================

  /**
   * Save AI configuration
   */
  const handleSaveConfig = () => {
    // Validate configuration
    const validation = validateAIConfig(aiConfig);
    
    if (!validation.valid) {
      setConfigError(validation.errors.join(', '));
      return;
    }
    
    // Save to storage
    const saved = StorageManager.saveConfig('aiConfig', aiConfig);
    
    if (saved) {
      setConfigSaved(true);
      setConfigError('');
      
      // Configure AI service
      try {
        AIService.configure(aiConfig);
        console.log('[ControlPanel] AI Service configured successfully');
        
        // Hide success message after 2 seconds
        setTimeout(() => setConfigSaved(false), 2000);
      } catch (error) {
        setConfigError('Failed to configure AI service: ' + error.message);
        console.error('[ControlPanel] AI configuration failed:', error);
      }
    } else {
      setConfigError('Failed to save configuration');
    }
  };

  /**
   * Update AI config field
   */
  const updateAIConfig = (path, value) => {
    setAiConfig(prev => {
      const updated = { ...prev };
      
      // Handle nested paths like 'openai.apiKey'
      const parts = path.split('.');
      let current = updated;
      
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }
      
      current[parts[parts.length - 1]] = value;
      
      return updated;
    });
  };

  /**
   * Test AI connection
   */
  const handleTestConnection = async () => {
    setConfigError('');
    
    try {
      // First configure with current settings
      AIService.configure(aiConfig);
      
      // Then test connection
      await AIService.testConnection();
      
      setConfigError('✅ Connection successful!');
      setTimeout(() => setConfigError(''), 3000);
    } catch (error) {
      setConfigError('❌ Connection failed: ' + error.message);
    }
  };

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
      const response = await fetch('res/private_test/motion/audio.bvmd');
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

  // Toggle button when panel is hidden
  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-5 right-5 px-5 py-3 bg-black/90 text-white border border-white/20 rounded-lg cursor-pointer z-[1000] text-sm hover:bg-black shadow-lg backdrop-blur-sm"
      >
        ⚙️ Show Controls
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-[1000] pointer-events-auto bg-black/90 rounded-lg shadow-2xl border border-white/20 backdrop-blur-sm max-w-[520px]">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-white/20">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-base font-semibold text-white">Control Panel</h3>
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
        <button
          onClick={() => setActiveTab('config')}
          className={`flex-1 px-3 py-2 text-xs border-none cursor-pointer transition-colors ${
            activeTab === 'config' 
              ? 'bg-white/10 text-white border-b-2 border-blue-500' 
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          ⚙️ Config
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

        {/* Config Tab */}
        {activeTab === 'config' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-3">AI Provider Configuration</p>
            
            {/* Provider Selection */}
            <div>
              <label className="block text-xs text-white mb-1">Provider</label>
              <select
                value={aiConfig.provider}
                onChange={(e) => updateAIConfig('provider', e.target.value)}
                className="w-full px-3 py-2 bg-white/10 text-white border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500"
              >
                <option value={AIProviders.OPENAI}>OpenAI</option>
                <option value={AIProviders.OLLAMA}>Ollama (Local)</option>
              </select>
            </div>

            {/* OpenAI Settings */}
            {aiConfig.provider === AIProviders.OPENAI && (
              <>
                <div>
                  <label className="block text-xs text-white mb-1">API Key</label>
                  <input
                    type="password"
                    value={aiConfig.openai.apiKey}
                    onChange={(e) => updateAIConfig('openai.apiKey', e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-white/10 text-white border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-white mb-1">Model</label>
                  <input
                    type="text"
                    value={aiConfig.openai.model}
                    onChange={(e) => updateAIConfig('openai.model', e.target.value)}
                    placeholder="gpt-4-turbo-preview"
                    className="w-full px-3 py-2 bg-white/10 text-white border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-white mb-1">Temperature: {aiConfig.openai.temperature}</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={aiConfig.openai.temperature}
                    onChange={(e) => updateAIConfig('openai.temperature', parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-white mb-1">Max Tokens</label>
                  <input
                    type="number"
                    value={aiConfig.openai.maxTokens}
                    onChange={(e) => updateAIConfig('openai.maxTokens', parseInt(e.target.value))}
                    placeholder="2000"
                    className="w-full px-3 py-2 bg-white/10 text-white border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </>
            )}

            {/* Ollama Settings */}
            {aiConfig.provider === AIProviders.OLLAMA && (
              <>
                <div>
                  <label className="block text-xs text-white mb-1">Endpoint URL</label>
                  <input
                    type="text"
                    value={aiConfig.ollama.endpoint}
                    onChange={(e) => updateAIConfig('ollama.endpoint', e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full px-3 py-2 bg-white/10 text-white border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Your local Ollama server URL</p>
                </div>
                
                <div>
                  <label className="block text-xs text-white mb-1">Model</label>
                  <input
                    type="text"
                    value={aiConfig.ollama.model}
                    onChange={(e) => updateAIConfig('ollama.model', e.target.value)}
                    placeholder="llama2"
                    className="w-full px-3 py-2 bg-white/10 text-white border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Model name (e.g., llama2, mistral, codellama)</p>
                </div>
                
                <div>
                  <label className="block text-xs text-white mb-1">Temperature: {aiConfig.ollama.temperature}</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={aiConfig.ollama.temperature}
                    onChange={(e) => updateAIConfig('ollama.temperature', parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-white mb-1">Max Tokens</label>
                  <input
                    type="number"
                    value={aiConfig.ollama.maxTokens}
                    onChange={(e) => updateAIConfig('ollama.maxTokens', parseInt(e.target.value))}
                    placeholder="2000"
                    className="w-full px-3 py-2 bg-white/10 text-white border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </>
            )}

            {/* System Prompt */}
            <div>
              <label className="block text-xs text-white mb-1">System Prompt</label>
              <textarea
                value={aiConfig.systemPrompt}
                onChange={(e) => updateAIConfig('systemPrompt', e.target.value)}
                placeholder="You are a helpful virtual assistant..."
                rows={3}
                className="w-full px-3 py-2 bg-white/10 text-white border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Error/Success Messages */}
            {configError && (
              <div className={`text-xs p-2 rounded ${configError.includes('✅') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {configError}
              </div>
            )}
            
            {configSaved && (
              <div className="text-xs p-2 rounded bg-green-500/20 text-green-400">
                ✅ Configuration saved successfully!
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2 border-t border-white/20">
              <button
                onClick={handleSaveConfig}
                className="flex-1 px-3 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs hover:bg-blue-600 transition-colors"
              >
                💾 Save Config
              </button>
              <button
                onClick={handleTestConnection}
                className="flex-1 px-3 py-2 bg-green-500 text-white border-none rounded cursor-pointer text-xs hover:bg-green-600 transition-colors"
              >
                🔌 Test Connection
              </button>
            </div>

            {/* Info */}
            <div className="border-t border-white/20 pt-3">
              <p className="text-[10px] text-gray-500 mb-2">ℹ️ Configuration Guide:</p>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                <strong>OpenAI:</strong> Get API key from platform.openai.com
                <br/>
                <strong>Ollama:</strong> Install from ollama.ai and run locally
                <br/>
                All settings are saved to browser localStorage
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ControlPanel;
