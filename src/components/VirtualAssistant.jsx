/**
 * VirtualAssistant - High-level wrapper component for the 3D virtual assistant
 * 
 * Provides a clean, simple API for controlling the assistant:
 * - speak(text, emotion) - Make the assistant speak with an emotion
 * - idle() - Return to idle state
 * - setState(state) - Change assistant state (IDLE, BUSY, CELEBRATING, SPEAKING)
 * 
 * This component:
 * 1. Wraps BabylonScene + MmdModelScene internally
 * 2. Manages AnimationManager initialization
 * 3. Exposes imperative API via ref forwarding
 * 4. Keeps all animation logic in AnimationManager (no duplication)
 * 
 * Integration points:
 * - speak() triggers TTS→VMD generation pipeline
 * - Audio playback synchronized with lip-sync animations
 * - Model loading with async blob URL support
 */

import { forwardRef, useImperativeHandle, useState, useCallback, useRef } from 'react';
import BabylonScene from './BabylonScene';
import LoadingIndicator from './LoadingIndicator';
import { buildMmdModelScene } from '../babylon/scenes/MmdModelScene';
import { AssistantState, getAnimationForEmotion } from '../config/animationConfig';
import { TTSServiceProxy } from '../services/proxies';

const VirtualAssistant = forwardRef((props, ref) => {
  const { onReady } = props;
  
  const [animationManager, setAnimationManager] = useState(null);
  const [positionManager, setPositionManager] = useState(null);
  const [currentState, setCurrentState] = useState(AssistantState.IDLE);
  const [isReady, setIsReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const initializedSceneRef = useRef(null); // Track which scene we initialized
  const positionManagerRef = useRef(null); // Ref to pass to BabylonScene

  /**
   * Handle model loading progress
   */
  const handleLoadProgress = useCallback((progress) => {
    setLoadingProgress(progress);
  }, []);

  /**
   * Handle scene initialization
   * Called when BabylonScene is ready
   */
  const handleSceneReady = useCallback((scene) => {
    // Prevent re-initializing the SAME scene (React Strict Mode protection)
    // But allow initializing a NEW scene (after cleanup + remount)
    if (initializedSceneRef.current === scene) {
      console.log('[VirtualAssistant] Same scene already initialized, ignoring duplicate callback');
      return;
    }
    
    // Validate scene before proceeding
    if (!scene || !scene.metadata || !scene.metadata.animationManager) {
      console.error('[VirtualAssistant] Invalid scene or missing metadata, cannot initialize');
      return;
    }
    
    console.log('[VirtualAssistant] Scene ready, initializing...');
    
    // Mark this specific scene as initialized
    initializedSceneRef.current = scene;
    
    const manager = scene.metadata.animationManager;
    const posMgr = scene.metadata.positionManager;
    
    setAnimationManager(manager);
    setPositionManager(posMgr);
    positionManagerRef.current = posMgr; // Update ref for BabylonScene
    setCurrentState(manager.getCurrentState());
    setIsReady(true);
    
    console.log('[VirtualAssistant] AnimationManager initialized and ready');
    console.log('[VirtualAssistant] PositionManager ready with position data');
    
    // Initialize TTS Service with BVMD converter and animation callback
    TTSServiceProxy.initializeBVMDConverter(scene);
    TTSServiceProxy.setSpeakCallback((text, bvmdUrl) => {
      // This will be called when audio starts playing
      console.log('[VirtualAssistant] TTS triggering speak animation');
      if (manager && bvmdUrl) {
        manager.speak(text, bvmdUrl, 'talking');
      }
    });
    TTSServiceProxy.setStopCallback(() => {
      // This will be called when TTS is stopped/interrupted
      console.log('[VirtualAssistant] TTS stopped, returning to idle');
      if (manager) {
        manager.returnToIdle();
      }
    });
    console.log('[VirtualAssistant] TTS Service integrated with lip sync');
    
    // Call onReady callback if provided
    if (onReady) {
      console.log('[VirtualAssistant] Calling onReady callback with managers');
      onReady({ 
        animationManager: manager, 
        positionManager: posMgr,
        scene: scene
      });
    }
  }, [onReady]);

  /**
   * Expose imperative API to parent components
   * Usage: const assistantRef = useRef(); assistantRef.current.speak("Hello!")
   */
  useImperativeHandle(ref, () => ({
    /**
     * Make the assistant speak with lip sync and emotion-based body animation
     * 
     * @param {string} text - Text to speak
     * @param {string} mouthAnimationBlobUrl - Blob URL to BVMD file with lip-sync animation
     *                                         Generate this from TTS audio using VMD generation
     * @param {string} emotionCategory - Animation category for body language
     *                                   Options: 'talking', 'idle', 'thinking', 'celebrating', 'walking'
     *                                   LLM should determine this based on text sentiment/context
     * @param {Object} options - Optional settings { primaryWeight: 0.0, fillWeight: 1.0 }
     * 
     * WORKFLOW:
     * 1. LLM analyzes text and determines emotion category ('talking', 'idle', 'thinking', etc.)
     * 2. Generate TTS audio from text
     * 3. Generate VMD lip-sync from audio
     * 4. Create blob URL from VMD
     * 5. Call this method with text, blob URL, and emotion category
     * 6. Assistant plays lip-sync + emotion-appropriate body animation
     * 7. Auto-returns to idle when done
     * 
     * EXAMPLES:
     *   speak("Hello!", vmdBlobUrl, "talking")         // Normal conversation
     *   speak("Hmm...", vmdBlobUrl, "thinking")        // Thoughtful response
     *   speak("Great!", vmdBlobUrl, "celebrating")     // Excited announcement
     *   speak("...", vmdBlobUrl, "idle")               // Calm speech
     */
    speak: async (text, mouthAnimationBlobUrl, emotionCategory = 'talking', options = {}) => {
      if (!animationManager) {
        console.warn('[VirtualAssistant] AnimationManager not ready, cannot speak');
        return;
      }

      console.log(`[VirtualAssistant] speak("${text}", emotionCategory="${emotionCategory}")`);
      
      // Simple pass-through to AnimationManager.speak()
      await animationManager.speak(text, mouthAnimationBlobUrl, emotionCategory, options);
      
      setCurrentState(animationManager.getCurrentState());
    },

    /**
     * Return assistant to idle state
     */
    idle: async () => {
      if (!animationManager) {
        console.warn('[VirtualAssistant] AnimationManager not ready, cannot idle');
        return;
      }

      console.log('[VirtualAssistant] idle()');
      await animationManager.returnToIdle();
      setCurrentState(animationManager.getCurrentState());
    },

    /**
     * Set assistant state directly
     * Can use either state (IDLE, BUSY, etc.) or emotion (happy, thinking, etc.)
     * 
     * @param {string} stateOrEmotion - State from AssistantState enum OR emotion string
     * 
     * States:
     * - IDLE: Relaxed, breathing, occasional looking around
     * - BUSY: Thinking, working on something
     * - SPEAKING: Currently talking
     * - CELEBRATING: Happy, excited gesture
     * 
     * Emotions: happy, thinking, neutral, calm, curious, etc.
     */
    setState: async (stateOrEmotion) => {
      if (!animationManager) {
        console.warn('[VirtualAssistant] AnimationManager not ready, cannot setState');
        return;
      }

      console.log(`[VirtualAssistant] setState("${stateOrEmotion}")`);
      
      // Check if it's a valid AssistantState
      if (Object.values(AssistantState).includes(stateOrEmotion)) {
        // It's a state - use state transition
        await animationManager.transitionToState(stateOrEmotion);
      } else {
        // It's probably an emotion - get animation and play it
        const emotionAnimation = getAnimationForEmotion(stateOrEmotion);
        if (emotionAnimation) {
          console.log(`[VirtualAssistant] Playing animation for emotion/state "${stateOrEmotion}": ${emotionAnimation.name}`);
          await animationManager.playAnimation(emotionAnimation);
        } else {
          console.warn(`[VirtualAssistant] Unknown state or emotion: "${stateOrEmotion}"`);
        }
      }
      
      setCurrentState(animationManager.getCurrentState());
    },

    /**
     * Trigger specific action (legacy support, prefer speak/idle/setState)
     * @param {string} action - Action name: 'think', 'walk', 'celebrate', 'speak'
     */
    triggerAction: async (action) => {
      if (!animationManager) {
        console.warn('[VirtualAssistant] AnimationManager not ready, cannot triggerAction');
        return;
      }

      console.log(`[VirtualAssistant] triggerAction("${action}")`);
      await animationManager.triggerAction(action);
      setCurrentState(animationManager.getCurrentState());
    },

    /**
     * Play composite animation (blend two animations)
     * @param {string} anim1Name - First animation name
     * Play composite animation with stitched fill
     * @param {string} primaryAnimName - Primary animation (sets duration, e.g., mouth VMD)
     * @param {string} fillCategory - Category for fill animations (e.g., 'talking')
     * @param {Object} options - { primaryWeight: 1.0, fillWeight: 0.5 }
     */
    playComposite: async (primaryAnimName, fillCategory = 'talking', options = {}) => {
      if (!animationManager) {
        console.warn('[VirtualAssistant] AnimationManager not ready, cannot playComposite');
        return;
      }

      console.log(`[VirtualAssistant] playComposite("${primaryAnimName}", category="${fillCategory}", primaryWeight=${options.primaryWeight ?? 1.0}, fillWeight=${options.fillWeight ?? 0.5})`);
      await animationManager.playComposite(primaryAnimName, fillCategory, options);
      setCurrentState(animationManager.getCurrentState());
    },

    /**
     * Get current state
     * @returns {string} Current assistant state
     */
    getState: () => {
      return currentState;
    },

    /**
     * Check if assistant is ready
     * @returns {boolean} True if AnimationManager is initialized
     */
    isReady: () => {
      return isReady;
    },

    /**
     * Get direct access to AnimationManager (advanced usage)
     * @returns {AnimationManager|null} AnimationManager instance
     */
    getAnimationManager: () => {
      return animationManager;
    },

    /**
     * Set model position using preset
     * @param {string} preset - Position preset: 'center', 'bottom-right', 'bottom-left', 'bottom-center', 'top-center', 'top-left', 'top-right'
     */
    setPosition: (preset) => {
      if (!positionManager) {
        console.warn('[VirtualAssistant] PositionManager not ready, cannot setPosition');
        return;
      }

      console.log(`[VirtualAssistant] setPosition("${preset}")`);
      positionManager.applyPreset(preset);
    },

    /**
     * Get direct access to PositionManager (advanced usage)
     * @returns {PositionManager|null} PositionManager instance
     */
    getPositionManager: () => {
      return positionManager;
    },

    // ========================================
    // ANIMATION QUEUE API
    // ========================================

    /**
     * Queue a simple animation to play after current animation finishes
     * @param {string} animationName - Animation name from registry
     * @param {boolean} force - If true, interrupt current animation and play immediately
     */
    queueAnimation: (animationName, force = false) => {
      if (!animationManager) {
        console.warn('[VirtualAssistant] AnimationManager not ready');
        return;
      }
      animationManager.queueSimpleAnimation(animationName, force);
    },

    /**
     * Queue a composite animation
     * @param {string} primaryAnimName - Primary animation name
     * @param {string} fillCategory - Fill animation category
     * @param {Object} options - Composite options
     * @param {boolean} force - If true, interrupt current animation
     */
    queueComposite: (primaryAnimName, fillCategory = 'talking', options = {}, force = false) => {
      if (!animationManager) {
        console.warn('[VirtualAssistant] AnimationManager not ready');
        return;
      }
      animationManager.queueCompositeAnimation(primaryAnimName, fillCategory, options, force);
    },

    /**
     * Queue a speak animation
     * @param {string} text - Text to speak
     * @param {string} mouthBlobUrl - Mouth animation blob URL
     * @param {string} emotionCategory - Emotion category
     * @param {Object} options - Speak options
     * @param {boolean} force - If true, interrupt current animation
     */
    queueSpeak: (text, mouthBlobUrl, emotionCategory = 'talking', options = {}, force = false) => {
      if (!animationManager) {
        console.warn('[VirtualAssistant] AnimationManager not ready');
        return;
      }
      animationManager.queueSpeak(text, mouthBlobUrl, emotionCategory, options, force);
    },

    /**
     * Clear all queued animations
     */
    clearQueue: () => {
      if (!animationManager) {
        console.warn('[VirtualAssistant] AnimationManager not ready');
        return;
      }
      animationManager.clearQueue();
    },

    /**
     * Get queue status
     * @returns {Object} Queue information { length, isEmpty, items }
     */
    getQueueStatus: () => {
      if (!animationManager) {
        console.warn('[VirtualAssistant] AnimationManager not ready');
        return { length: 0, isEmpty: true, items: [] };
      }
      return animationManager.getQueueStatus();
    },
  }), [animationManager, positionManager, currentState, isReady]);

  return (
    <>
      {/* Custom loading indicator - shown while model loads */}
      <LoadingIndicator isVisible={!isReady} progress={loadingProgress} />
      
      {/* Babylon scene with fade-in transition */}
      <BabylonScene 
        sceneBuilder={buildMmdModelScene} 
        onSceneReady={handleSceneReady}
        onLoadProgress={handleLoadProgress}
        positionManagerRef={positionManagerRef}
      />
    </>
  );
});

VirtualAssistant.displayName = 'VirtualAssistant';

export default VirtualAssistant;
