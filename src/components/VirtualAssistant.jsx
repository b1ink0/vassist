/**
 * @fileoverview High-level wrapper component for the virtual assistant with 3D scene, animations, and position management.
 */

import { forwardRef, useImperativeHandle, useState, useCallback, useRef, useEffect } from 'react';
import BabylonScene from './BabylonScene';
import LoadingIndicator from './LoadingIndicator';
import { buildMmdModelScene } from '../babylon/scenes/MmdModelScene';
import { AssistantState, getAnimationForEmotion } from '../config/animationConfig';
import { TTSServiceProxy } from '../services/proxies';
import { useConfig } from '../contexts/ConfigContext';
import { useApp } from '../contexts/AppContext';
import { useAnimation } from '../contexts/AnimationContext';
import Logger from '../services/LoggerService';

/**
 * Virtual assistant component with 3D model, animations, and TTS integration.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Function} props.onReady - Callback when assistant is initialized
 * @param {boolean} props.isPreview - Enable preview mode for setup wizard
 * @param {string} props.previewWidth - Width for preview mode
 * @param {string} props.previewHeight - Height for preview mode
 * @param {string} props.previewClassName - Additional CSS classes for preview
 * @param {boolean} props.portraitMode - Enable portrait mode in preview
 * @param {string} props.previewPosition - Position preset for preview mode
 * @param {React.Ref} ref - Forwarded ref for imperative API
 * @returns {JSX.Element} Virtual assistant component
 */
const VirtualAssistant = forwardRef((props, ref) => {
  const { 
    onReady,
    isPreview = false,
    previewWidth = '100%',
    previewHeight = '100%',
    previewClassName = '',
    portraitMode = false,
    previewPosition = 'bottom-center'
  } = props;
  const { uiConfig, updateUIConfig, isConfigLoading } = useConfig();
  const { savedModelPosition, setSavedModelPosition } = useApp();
  const { getRandomAnimation, getEnabledAnimations } = useAnimation();
  
  const [animationManager, setAnimationManager] = useState(null);
  const [positionManager, setPositionManager] = useState(null);
  const [currentState, setCurrentState] = useState(AssistantState.IDLE);
  const [isReady, setIsReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const initializedSceneRef = useRef(null);
  const positionManagerRef = useRef(null);

  /**
   * Handles model loading progress updates.
   * 
   * @param {number} progress - Loading progress (0-100)
   */
  const handleLoadProgress = useCallback((progress) => {
    setLoadingProgress(progress);
  }, []);

  /**
   * Handles scene initialization when BabylonScene is ready.
   * 
   * @param {Object} scene - Babylon.js scene object
   */
  const handleSceneReady = useCallback((scene) => {
    if (initializedSceneRef.current === scene) {
      Logger.log('VirtualAssistant', 'Same scene already initialized, ignoring duplicate callback');
      return;
    }
    
    if (!scene || !scene.metadata || !scene.metadata.animationManager) {
      Logger.error('VirtualAssistant', 'Invalid scene or missing metadata, cannot initialize');
      return;
    }
    
    Logger.log('VirtualAssistant', 'Scene ready, initializing...');
    
    initializedSceneRef.current = scene;
    
    const manager = scene.metadata.animationManager;
    const posMgr = scene.metadata.positionManager;
    
    setAnimationManager(manager);
    setPositionManager(posMgr);
    positionManagerRef.current = posMgr;
    setCurrentState(manager.getCurrentState());
    setIsReady(true);
    
    Logger.log('VirtualAssistant', 'AnimationManager initialized and ready');
    Logger.log('VirtualAssistant', 'PositionManager ready with position data');
    
    // Initialize TTS Service with BVMD converter and animation callback
    TTSServiceProxy.initializeBVMDConverter(scene);
    TTSServiceProxy.setSpeakCallback((text, bvmdUrl) => {
      // This will be called when audio starts playing
      Logger.log('VirtualAssistant', 'TTS triggering speak animation');
      if (manager && bvmdUrl) {
        manager.speak(text, bvmdUrl, 'talking');
      }
    });
    TTSServiceProxy.setStopCallback(() => {
      // This will be called when TTS is stopped/interrupted
      Logger.log('VirtualAssistant', 'TTS stopped, returning to idle');
      if (manager) {
        manager.returnToIdle();
      }
    });
    Logger.log('VirtualAssistant', 'TTS Service integrated with lip sync');
    
    // Call onReady callback if provided
    if (onReady) {
      Logger.log('VirtualAssistant', 'Calling onReady callback with managers');
      onReady({ 
        animationManager: manager, 
        positionManager: posMgr,
        scene: scene
      });
    }
  }, [onReady]);

  /**
   * Save position when model is dragged
   */
  useEffect(() => {
    const handleDragEnd = () => {
      // Only save if preset is set to 'last-location'
      if (uiConfig.position?.preset === 'last-location' && positionManager) {
        setTimeout(() => {
          const currentPos = {
            x: positionManager.positionX,
            y: positionManager.positionY,
            width: positionManager.modelWidthPx,
            height: positionManager.effectiveHeightPx
          };
          
          Logger.log('VirtualAssistant', 'Saving last location:', currentPos);
          updateUIConfig('position.lastLocation', currentPos);
        }, 100);
      }
    };
    
    window.addEventListener('modelDragEnd', handleDragEnd);
    return () => window.removeEventListener('modelDragEnd', handleDragEnd);
  }, [uiConfig.position?.preset, positionManager, updateUIConfig]);

  /**
   * Save position before unmounting (e.g., when tab becomes hidden)
   */
  useEffect(() => {
    return () => {
      // On unmount, save current position to both config AND context
      if (positionManager) {
        const currentPos = {
          x: positionManager.positionX,
          y: positionManager.positionY,
          width: positionManager.modelWidthPx,
          height: positionManager.effectiveHeightPx, // Use effectiveHeightPx (500px in Portrait, same as modelHeightPx in Normal)
          preset: uiConfig.position?.preset || 'bottom-right' // Save the preset too!
        };
        
        Logger.log('VirtualAssistant', 'Unmounting - saving position to context:', currentPos);
        
        // Save to context (in-memory, persists across unmount/remount)
        setSavedModelPosition(currentPos);
        
        // Also save to config if using last-location preset
        if (uiConfig.position?.preset === 'last-location') {
          updateUIConfig('position.lastLocation', currentPos);
        }
      }
    };
  }, [positionManager, uiConfig.position?.preset, updateUIConfig, setSavedModelPosition]);

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
        Logger.warn('VirtualAssistant', 'AnimationManager not ready, cannot speak');
        return;
      }

      Logger.log('VirtualAssistant', `speak("${text}", emotionCategory="${emotionCategory}")`);
      
      await animationManager.speak(text, mouthAnimationBlobUrl, emotionCategory, options);
      
      setCurrentState(animationManager.getCurrentState());
    },

    /**
     * Returns assistant to idle state.
     */
    idle: async () => {
      if (!animationManager) {
        Logger.warn('VirtualAssistant', 'AnimationManager not ready, cannot idle');
        return;
      }

      Logger.log('VirtualAssistant', 'idle()');
      await animationManager.returnToIdle();
      setCurrentState(animationManager.getCurrentState());
    },

    /**
     * Sets assistant state directly using state or emotion.
     * 
     * @param {string} stateOrEmotion - State from AssistantState enum OR emotion string
     */
    setState: async (stateOrEmotion) => {
      if (!animationManager) {
        Logger.warn('VirtualAssistant', 'AnimationManager not ready, cannot setState');
        return;
      }

      Logger.log('VirtualAssistant', `setState("${stateOrEmotion}") called - current state: ${animationManager.getCurrentState()}`);
      
      if (Object.values(AssistantState).includes(stateOrEmotion)) {
        await animationManager.transitionToState(stateOrEmotion);
      } else {
        const emotionAnimation = getAnimationForEmotion(stateOrEmotion);
        if (emotionAnimation) {
          Logger.log('VirtualAssistant', `Playing animation for emotion/state "${stateOrEmotion}": ${emotionAnimation.name}`);
          await animationManager.playAnimation(emotionAnimation);
        } else {
          Logger.warn('VirtualAssistant', `Unknown state or emotion: "${stateOrEmotion}"`);
        }
      }
      
      setCurrentState(animationManager.getCurrentState());
    },

    /**
     * Triggers specific action.
     * 
     * @param {string} action - Action name: 'think', 'walk', 'celebrate', 'speak'
     */
    triggerAction: async (action) => {
      if (!animationManager) {
        Logger.warn('VirtualAssistant', 'AnimationManager not ready, cannot triggerAction');
        return;
      }

      Logger.log('VirtualAssistant', `triggerAction("${action}")`);
      await animationManager.triggerAction(action);
      setCurrentState(animationManager.getCurrentState());
    },

    /**
     * Plays composite animation with stitched fill.
     * 
     * @param {string} primaryAnimName - Primary animation name
     * @param {string} fillCategory - Category for fill animations
     * @param {Object} options - Composite options with primaryWeight and fillWeight
     */
    playComposite: async (primaryAnimName, fillCategory = 'talking', options = {}) => {
      if (!animationManager) {
        Logger.warn('VirtualAssistant', 'AnimationManager not ready, cannot playComposite');
        return;
      }

      Logger.log('VirtualAssistant', `playComposite("${primaryAnimName}", category="${fillCategory}", primaryWeight=${options.primaryWeight ?? 1.0}, fillWeight=${options.fillWeight ?? 0.5})`);
      await animationManager.playComposite(primaryAnimName, fillCategory, options);
      setCurrentState(animationManager.getCurrentState());
    },

    /**
     * Gets current assistant state.
     * 
     * @returns {string} Current assistant state
     */
    getState: () => {
      return currentState;
    },

    /**
     * Checks if assistant is ready.
     * 
     * @returns {boolean} True if AnimationManager is initialized
     */
    isReady: () => {
      return isReady;
    },

    /**
     * Gets direct access to AnimationManager.
     * 
     * @returns {AnimationManager|null} AnimationManager instance
     */
    getAnimationManager: () => {
      return animationManager;
    },

    /**
     * Sets model position using preset.
     * 
     * @param {string} preset - Position preset
     */
    setPosition: (preset) => {
      if (!positionManager) {
        Logger.warn('VirtualAssistant', 'PositionManager not ready, cannot setPosition');
        return;
      }

      Logger.log('VirtualAssistant', `setPosition("${preset}")`);
      positionManager.applyPreset(preset);
    },

    /**
     * Gets direct access to PositionManager.
     * 
     * @returns {PositionManager|null} PositionManager instance
     */
    getPositionManager: () => {
      return positionManager;
    },

    /**
     * Queues a simple animation to play after current animation finishes.
     * 
     * @param {string} animationName - Animation name from registry
     * @param {boolean} force - If true, interrupt current animation and play immediately
     */
    queueAnimation: (animationName, force = false) => {
      if (!animationManager) {
        Logger.warn('VirtualAssistant', 'AnimationManager not ready');
        return;
      }
      animationManager.queueSimpleAnimation(animationName, force);
    },

    /**
     * Queues a composite animation.
     * 
     * @param {string} primaryAnimName - Primary animation name
     * @param {string} fillCategory - Fill animation category
     * @param {Object} options - Composite options
     * @param {boolean} force - If true, interrupt current animation
     */
    queueComposite: (primaryAnimName, fillCategory = 'talking', options = {}, force = false) => {
      if (!animationManager) {
        Logger.warn('VirtualAssistant', 'AnimationManager not ready');
        return;
      }
      animationManager.queueCompositeAnimation(primaryAnimName, fillCategory, options, force);
    },

    /**
     * Queues a speak animation.
     * 
     * @param {string} text - Text to speak
     * @param {string} mouthBlobUrl - Mouth animation blob URL
     * @param {string} emotionCategory - Emotion category
     * @param {Object} options - Speak options
     * @param {boolean} force - If true, interrupt current animation
     */
    queueSpeak: (text, mouthBlobUrl, emotionCategory = 'talking', options = {}, force = false) => {
      if (!animationManager) {
        Logger.warn('VirtualAssistant', 'AnimationManager not ready');
        return;
      }
      animationManager.queueSpeak(text, mouthBlobUrl, emotionCategory, options, force);
    },

    /**
     * Clears all queued animations.
     */
    clearQueue: () => {
      if (!animationManager) {
        Logger.warn('VirtualAssistant', 'AnimationManager not ready');
        return;
      }
      animationManager.clearQueue();
    },

    /**
     * Gets queue status.
     * 
     * @returns {Object} Queue information with length, isEmpty, and items
     */
    getQueueStatus: () => {
      if (!animationManager) {
        Logger.warn('VirtualAssistant', 'AnimationManager not ready');
        return { length: 0, isEmpty: true, items: [] };
      }
      return animationManager.getQueueStatus();
    },
  }), [animationManager, positionManager, currentState, isReady]);

  return (
    <>
      {!isPreview && <LoadingIndicator isVisible={!isReady || isConfigLoading} progress={loadingProgress} />}
      
      {!isConfigLoading && (
        <BabylonScene 
          sceneBuilder={buildMmdModelScene} 
          onSceneReady={handleSceneReady}
          onLoadProgress={handleLoadProgress}
          positionManagerRef={positionManagerRef}
          isPreview={isPreview}
          previewWidth={previewWidth}
          previewHeight={previewHeight}
          previewClassName={previewClassName}
          sceneConfig={{ 
            uiConfig: isPreview ? { enablePortraitMode: portraitMode, position: { preset: previewPosition } } : uiConfig,
            enablePhysics: isPreview ? false : (uiConfig?.enablePhysics !== false),
            savedModelPosition: isPreview ? null : savedModelPosition,
            getRandomAnimation,
            getEnabledAnimations
          }}
        />
      )}
    </>
  );
});

VirtualAssistant.displayName = 'VirtualAssistant';

export default VirtualAssistant;
