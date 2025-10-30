/**
 * CharacterPreview - Setup-specific 3D character preview component
 * 
 * This component renders the 3D character inline (not using createPortal)
 * for use in setup wizard steps. Shares logic with VirtualAssistant but
 * renders in a contained div instead of full-screen portal.
 * 
 * Can be reused in multiple steps:
 * - Step 12: Character Introduction
 * - Step 13: Display Mode Selection
 */

import { forwardRef, useImperativeHandle, useState, useRef, useEffect } from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { buildMmdModelScene } from '../../babylon/scenes/MmdModelScene';
import { AssistantState, getAnimationForEmotion } from '../../config/animationConfig';
import { TTSServiceProxy } from '../../services/proxies';

const CharacterPreview = forwardRef(({ 
  onReady, 
  displayMode = 'normal', // 'normal' or 'portrait'
  width = '100%',
  height = '100%',
  position = 'center',
  className = ''
}, ref) => {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef = useRef(null);
  const [animationManager, setAnimationManager] = useState(null);
  const [positionManager, setPositionManager] = useState(null);
  const [currentState, setCurrentState] = useState(AssistantState.IDLE);
  const [isReady, setIsReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const initializedSceneRef = useRef(null);

  /**
   * Initialize Babylon scene
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    console.log('[CharacterPreview] Initializing Babylon scene...');

    // Create engine
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    engineRef.current = engine;

    // Create config for scene builder
    const sceneConfig = {
      uiConfig: {
        portraitMode: displayMode === 'portrait',
        position: { preset: position },
        enablePhysics: false // Disable physics in preview for better performance
      },
      savedModelPosition: null
    };

    // Build the scene using the same builder as VirtualAssistant
    const initScene = async () => {
      try {
        const scene = new Scene(engine);
        sceneRef.current = scene;

        // Call the scene builder (same as VirtualAssistant uses)
        await buildMmdModelScene(
          scene,
          (progress) => {
            console.log(`[CharacterPreview] Loading progress: ${progress}%`);
            setLoadingProgress(progress);
          },
          sceneConfig
        );

        // Scene is ready
        console.log('[CharacterPreview] Scene built successfully');
        
        // Prevent re-initializing
        if (initializedSceneRef.current === scene) {
          console.log('[CharacterPreview] Already initialized');
          return;
        }
        initializedSceneRef.current = scene;

        // Get managers from scene metadata
        const manager = scene.metadata?.animationManager;
        const posMgr = scene.metadata?.positionManager;

        if (!manager || !posMgr) {
          console.error('[CharacterPreview] Missing managers in scene metadata');
          return;
        }

        setAnimationManager(manager);
        setPositionManager(posMgr);
        setCurrentState(manager.getCurrentState());
        setIsReady(true);

        console.log('[CharacterPreview] Ready');

        // Initialize TTS for lip-sync (same as VirtualAssistant)
        TTSServiceProxy.initializeBVMDConverter(scene);
        TTSServiceProxy.setSpeakCallback((text, bvmdUrl) => {
          if (manager && bvmdUrl) {
            manager.speak(text, bvmdUrl, 'talking');
          }
        });
        TTSServiceProxy.setStopCallback(() => {
          if (manager) {
            manager.returnToIdle();
          }
        });

        // Call onReady callback
        if (onReady) {
          onReady({ 
            animationManager: manager, 
            positionManager: posMgr,
            scene: scene
          });
        }

        // Start render loop
        engine.runRenderLoop(() => {
          scene.render();
        });

      } catch (error) {
        console.error('[CharacterPreview] Failed to initialize scene:', error);
      }
    };

    initScene();

    // Handle resize
    const handleResize = () => {
      engine.resize();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      console.log('[CharacterPreview] Cleaning up...');
      window.removeEventListener('resize', handleResize);
      
      if (engineRef.current) {
        engineRef.current.stopRenderLoop();
        engineRef.current.dispose();
        engineRef.current = null;
      }
      
      sceneRef.current = null;
      initializedSceneRef.current = null;
    };
  }, [displayMode, position, onReady]);

  /**
   * Expose imperative API (same as VirtualAssistant)
   */
  useImperativeHandle(ref, () => ({
    speak: async (text, mouthAnimationBlobUrl, emotionCategory = 'talking', options = {}) => {
      if (!animationManager) {
        console.warn('[CharacterPreview] AnimationManager not ready');
        return;
      }
      await animationManager.speak(text, mouthAnimationBlobUrl, emotionCategory, options);
      setCurrentState(animationManager.getCurrentState());
    },

    idle: async () => {
      if (!animationManager) return;
      await animationManager.returnToIdle();
      setCurrentState(animationManager.getCurrentState());
    },

    setState: async (stateOrEmotion) => {
      if (!animationManager) return;
      
      if (Object.values(AssistantState).includes(stateOrEmotion)) {
        await animationManager.transitionToState(stateOrEmotion);
      } else {
        const emotionAnimation = getAnimationForEmotion(stateOrEmotion);
        if (emotionAnimation) {
          await animationManager.playAnimation(emotionAnimation);
        }
      }
      setCurrentState(animationManager.getCurrentState());
    },

    triggerAction: async (action) => {
      if (!animationManager) return;
      await animationManager.triggerAction(action);
      setCurrentState(animationManager.getCurrentState());
    },

    playComposite: async (primaryAnimName, fillCategory = 'talking', options = {}) => {
      if (!animationManager) return;
      await animationManager.playComposite(primaryAnimName, fillCategory, options);
      setCurrentState(animationManager.getCurrentState());
    },

    getState: () => currentState,
    isReady: () => isReady,
    getAnimationManager: () => animationManager,
    getPositionManager: () => positionManager,

    queueAnimation: (animationName, force = false) => {
      if (!animationManager) return;
      animationManager.queueSimpleAnimation(animationName, force);
    },

    queueComposite: (primaryAnimName, fillCategory = 'talking', options = {}, force = false) => {
      if (!animationManager) return;
      animationManager.queueCompositeAnimation(primaryAnimName, fillCategory, options, force);
    },

    queueSpeak: (text, mouthBlobUrl, emotionCategory = 'talking', options = {}, force = false) => {
      if (!animationManager) return;
      animationManager.queueSpeak(text, mouthBlobUrl, emotionCategory, options, force);
    },

    clearQueue: () => {
      if (!animationManager) return;
      animationManager.clearQueue();
    },

    getQueueStatus: () => {
      if (!animationManager) {
        return { length: 0, isEmpty: true, items: [] };
      }
      return animationManager.getQueueStatus();
    },
  }), [animationManager, positionManager, currentState, isReady]);

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      {/* Canvas for 3D rendering */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          outline: 'none',
          backgroundColor: 'transparent',
          borderRadius: '16px',
          opacity: isReady ? 1 : 0,
          transition: 'opacity 700ms ease-in-out'
        }}
      />

      {/* Loading overlay */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500/30 border-t-purple-500 mx-auto mb-4"></div>
            <p className="text-white/70 text-sm font-medium">
              Loading 3D Model... {Math.round(loadingProgress)}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

CharacterPreview.displayName = 'CharacterPreview';

export default CharacterPreview;
