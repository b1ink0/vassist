/**
 * VirtualAssistant - High-level wrapper component for the 3D virtual assistant
 * 
 * Provides a clean, simple API for controlling the assistant:
 * - speak(text, emotion) - Make the assistant speak with an emotion
 * - idle() - Return to idle state
 * - setState(state) - Change assistant state (IDLE, BUSY, CELEBRATING, SPEAKING)
 * 
 * This component:
 * 1. Wraps BabylonScene + MmdCompositeScene internally
 * 2. Manages AnimationManager initialization
 * 3. Exposes imperative API via ref forwarding
 * 4. Keeps all animation logic in AnimationManager (no duplication)
 * 
 * Future integration points:
 * - speak() will trigger TTS→VMD generation pipeline
 * - Audio playback synchronized with lip-sync animations
 */

import { forwardRef, useImperativeHandle, useState, useCallback, useRef } from 'react';
import BabylonScene from './babylon/BabylonScene';
import { buildMmdCompositeScene } from './babylon/MmdCompositeScene';
import { AssistantState, getAnimationForEmotion, sanitizeEmotion } from '../config/animationConfig';

const VirtualAssistant = forwardRef((props, ref) => {
  const { onReady } = props;
  
  const [animationManager, setAnimationManager] = useState(null);
  const [positionManager, setPositionManager] = useState(null);
  const [currentState, setCurrentState] = useState(AssistantState.IDLE);
  const [isReady, setIsReady] = useState(false);
  const initializedRef = useRef(false);

  /**
   * Handle scene initialization
   * Called when BabylonScene is ready
   */
  const handleSceneReady = useCallback((scene) => {
    // Prevent multiple initializations
    if (initializedRef.current) {
      console.log('[VirtualAssistant] Already initialized, ignoring duplicate scene ready');
      return;
    }
    
    console.log('[VirtualAssistant] Scene ready, initializing...');
    
    if (scene.metadata && scene.metadata.animationManager) {
      const manager = scene.metadata.animationManager;
      const posMgr = scene.metadata.positionManager;
      
      setAnimationManager(manager);
      setPositionManager(posMgr);
      setCurrentState(manager.getCurrentState());
      setIsReady(true);
      initializedRef.current = true;
      
      console.log('[VirtualAssistant] AnimationManager initialized and ready');
      
      // Call onReady callback if provided
      if (onReady) {
        onReady({ animationManager: manager, positionManager: posMgr });
      }
    } else {
      console.error('[VirtualAssistant] AnimationManager not found in scene metadata');
    }
  }, [onReady]);

  /**
   * Expose imperative API to parent components
   * Usage: const assistantRef = useRef(); assistantRef.current.speak("Hello!")
   */
  useImperativeHandle(ref, () => ({
    /**
     * Make the assistant speak
     * @param {string} text - Text to speak
     * @param {string} emotion - Emotion/mood: 'neutral', 'happy', 'thinking', etc.
     * 
     * FUTURE: This will trigger:
     * 1. Generate TTS audio from text
     * 2. Generate VMD lip-sync from audio
     * 3. Load and play VMD animation
     * 4. Set base animation according to emotion
     * 
     * CURRENT: Sets base animation based on emotion, then speaks
     */
    speak: async (text, emotion = 'neutral') => {
      if (!animationManager) {
        console.warn('[VirtualAssistant] AnimationManager not ready, cannot speak');
        return;
      }

      console.log(`[VirtualAssistant] speak("${text}", "${emotion}")`);
      
      // Sanitize emotion (handles invalid LLM output gracefully)
      const validEmotion = sanitizeEmotion(emotion);
      
      // Get animation for the validated emotion
      const emotionAnimation = getAnimationForEmotion(validEmotion);
      
      if (emotionAnimation) {
        console.log(`[VirtualAssistant] Setting base animation for emotion "${validEmotion}": ${emotionAnimation.name}`);
        
        // Play the emotion-appropriate base animation
        // This will be the body animation while mouth does lip sync (future)
        await animationManager.playAnimation(emotionAnimation);
      }
      
      // TODO: Integrate TTS→VMD pipeline here
      // 1. Generate TTS audio from text
      // 2. Generate VMD from audio (lip sync)
      // 3. Load VMD as animation
      // 4. Play VMD (mouth moves) + base emotion animation (body expression)
      // 5. Auto-return to idle when done
      
      // For now, just update state
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
     * @param {string} preset - Position preset: 'center', 'bottom-right', 'bottom-left', 'top-center', 'top-left', 'top-right'
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
  }), [animationManager, positionManager, currentState, isReady]);

  return (
    <BabylonScene 
      sceneBuilder={buildMmdCompositeScene} 
      onSceneReady={handleSceneReady}
    />
  );
});

VirtualAssistant.displayName = 'VirtualAssistant';

export default VirtualAssistant;
