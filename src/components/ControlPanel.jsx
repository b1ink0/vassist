/**
 * ControlPanel - Unified control panel for all assistant controls
 * 
 * Combines:
 * - Action controls (idle, think, walk, celebrate, speak)
 * - Position presets (all 7 positions)
 * - Emotion tests (happy, thinking, calm, etc.)
 * - Debug controls (camera movement, zoom, axis, coordinates)
 * 
 * Can be toggled on/off for clean UI
 */

import { useState } from 'react';
import DebugOverlay from './DebugOverlay';

const ControlPanel = ({ 
  isAssistantReady,
  currentState,
  assistantRef,
  sceneRef,
  positionManagerRef,
  onStateChange
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [activeTab, setActiveTab] = useState('actions'); // 'actions', 'positions', 'emotions', 'debug'

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
   * Test emotion-based animations
   */
  const testEmotion = async (emotion, text) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[ControlPanel] VirtualAssistant not ready');
      return;
    }
    await assistantRef.current.speak(text, emotion);
    onStateChange(assistantRef.current.getState());
  };

  /**
   * Set assistant state
   */
  const setAssistantState = async (stateOrEmotion) => {
    if (!assistantRef.current || !assistantRef.current.isReady()) {
      console.warn('[ControlPanel] VirtualAssistant not ready');
      return;
    }
    await assistantRef.current.setState(stateOrEmotion);
    onStateChange(assistantRef.current.getState());
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
    <div className="fixed bottom-5 right-5 z-[1000] pointer-events-auto bg-black/90 rounded-lg shadow-2xl border border-white/20 backdrop-blur-sm max-w-[420px]">
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
            <p className="text-xs text-gray-400 mb-3">Test emotion mapping</p>
            <button
              onClick={() => testEmotion('happy', 'I am happy!')}
              className="w-full px-3 py-2 bg-amber-400 text-black border-none rounded cursor-pointer text-xs text-left hover:bg-amber-500 transition-colors"
            >
              😊 Happy
            </button>
            <button
              onClick={() => testEmotion('thinking', 'Let me think...')}
              className="w-full px-3 py-2 bg-blue-500 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-blue-600 transition-colors"
            >
              🤔 Thinking
            </button>
            <button
              onClick={() => testEmotion('calm', 'Stay calm...')}
              className="w-full px-3 py-2 bg-green-500 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-green-600 transition-colors"
            >
              😌 Calm
            </button>
            <button
              onClick={() => testEmotion('curious', 'What is this?')}
              className="w-full px-3 py-2 bg-purple-600 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-purple-700 transition-colors"
            >
              🧐 Curious
            </button>
            <button
              onClick={() => setAssistantState('excited')}
              className="w-full px-3 py-2 bg-orange-600 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-orange-700 transition-colors"
            >
              🎉 Excited
            </button>
            <button
              onClick={() => testEmotion('error', 'Something went wrong!')}
              className="w-full px-3 py-2 bg-red-500 text-white border-none rounded cursor-pointer text-xs text-left hover:bg-red-600 transition-colors"
            >
              ❌ Error
            </button>
            <button
              onClick={() => testEmotion('invalid_emotion_test', 'Testing fallback...')}
              className="w-full px-3 py-2 bg-slate-600 text-white border-none rounded cursor-pointer text-[11px] text-left hover:bg-slate-700 transition-colors"
            >
              🔧 Invalid (test fallback)
            </button>
          </div>
        )}

        {/* Composite Tab */}
        {activeTab === 'composite' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-3">Primary animation + stitched fill animations</p>
            
            {/* Preset Composites */}
            <div className="space-y-2">
              <p className="text-xs text-white font-semibold">Stitched Timeline Presets</p>
              <button
                onClick={() => playComposite('Audio Idle', 'talking', { 
                  primaryWeight: 0.0,
                  fillWeight: 1.0
                })}
                className="w-full px-3 py-2 bg-indigo-500 text-white border-none rounded cursor-pointer text-xs hover:bg-indigo-600 transition-colors"
              >
                💬 Lip Sync + Body (morphs only)
              </button>
              <button
                onClick={() => playComposite('Audio Idle', 'talking', { 
                  primaryWeight: 0.1,
                  fillWeight: 1.0
                })}
                className="w-full px-3 py-2 bg-purple-500 text-white border-none rounded cursor-pointer text-xs hover:bg-purple-600 transition-colors"
              >
                💬 Lip Sync + Body (10% blend)
              </button>
              <button
                onClick={() => playComposite('Audio Idle', 'talking', { 
                  primaryWeight: 0.2,
                  fillWeight: 1.0
                })}
                className="w-full px-3 py-2 bg-pink-500 text-white border-none rounded cursor-pointer text-xs hover:bg-pink-600 transition-colors"
              >
                💬 Lip Sync + Body (20% blend)
              </button>
              <button
                onClick={() => playComposite('Audio Idle', 'idle', { 
                  primaryWeight: 0.0,
                  fillWeight: 1.0
                })}
                className="w-full px-3 py-2 bg-teal-500 text-white border-none rounded cursor-pointer text-xs hover:bg-teal-600 transition-colors"
              >
                🧘 Mouth + Idle Mix (morphs only)
              </button>
              <button
                onClick={() => playComposite('Audio Idle', 'talking', { 
                  primaryWeight: 0.3,
                  fillWeight: 1.0
                })}
                className="w-full px-3 py-2 bg-orange-500 text-white border-none rounded cursor-pointer text-xs hover:bg-orange-600 transition-colors"
              >
                ⚖️ Lip Sync + Body (30% blend)
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
  );
};

export default ControlPanel;
