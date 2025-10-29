import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Engine, Scene, ArcRotateCamera, HemisphericLight, MeshBuilder, Vector3 } from '@babylonjs/core';
import { createSceneConfig, resolveResourceURLs } from '../config/sceneConfig';
import DragDropService from '../services/DragDropService';
import { useApp } from '../contexts/AppContext';
import { useConfig } from '../contexts/ConfigContext';
import { FPSLimitOptions } from '../config/uiConfig';

const BabylonScene = ({ sceneBuilder, onSceneReady, onLoadProgress, sceneConfig = {}, positionManagerRef }) => {
  const canvasRef = useRef(null);
  const canvasElementRef = useRef(null); // Track actual canvas DOM element
  const engineRef = useRef(null);
  const sceneRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const cleanupFnRef = useRef(null); // Store cleanup function
  
  // Get FPS limit from config
  const { uiConfig } = useConfig();
  const fpsLimit = uiConfig?.fpsLimit || FPSLimitOptions.FPS_60;
  
  // Drag-drop overlay state
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const overlayRef = useRef(null);
  const dragDropServiceRef = useRef(null);
  
  // Model overlay state from context (shared with AppContent)
  const { modelOverlayPos, setModelOverlayPos, setShowModelLoadingOverlay, setPendingDropData, openChat } = useApp();
  
  // Track if this is first mount
  const isFirstMountRef = useRef(true);
  
  // Store callbacks in refs to avoid dependency-related re-initialization
  const onSceneReadyRef = useRef(onSceneReady);
  const onLoadProgressRef = useRef(onLoadProgress);
  const sceneConfigRef = useRef(sceneConfig);
  
  // Update refs when callbacks change (but don't trigger re-init)
  useEffect(() => {
    onSceneReadyRef.current = onSceneReady;
    onLoadProgressRef.current = onLoadProgress;
    sceneConfigRef.current = sceneConfig;
  }, [onSceneReady, onLoadProgress, sceneConfig]);

  // Track component mount/unmount for tab visibility
  useEffect(() => {
    // On mount
    if (isFirstMountRef.current) {
      // First mount - don't show loading
      isFirstMountRef.current = false;
      console.log('[BabylonScene] First mount - no loading overlay');
    } else {
      // Remount after unmount (tab was hidden) - show loading immediately
      console.log('[BabylonScene] Remounting after tab hide - showing loading');
      setShowModelLoadingOverlay(true);
    }

    // Track visibility changes to show overlay BEFORE unmount
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab becoming hidden - show loading overlay immediately as placeholder
        console.log('[BabylonScene] Tab hidden - showing loading overlay');
        setShowModelLoadingOverlay(true);
      } else if (isReady) {
        // Tab becoming visible and scene is ready - hide loading overlay
        console.log('[BabylonScene] Tab visible and scene ready - hiding loading overlay');
        setShowModelLoadingOverlay(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      console.log('[BabylonScene] Unmounting');
    };
  }, [setShowModelLoadingOverlay, isReady]);

  // Hide loading when scene is ready (only if we're showing loading)
  useEffect(() => {
    if (isReady) {
      console.log('[BabylonScene] Scene ready - hiding loading');
      setShowModelLoadingOverlay(false);
    }
  }, [isReady, setShowModelLoadingOverlay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('[BabylonScene] Canvas ref not ready');
      return;
    }
    
    console.log('[BabylonScene] Canvas ref ready, checking if in DOM...', canvas.parentNode ? 'YES' : 'NO');
    
    // Store canvas element for cleanup
    canvasElementRef.current = canvas;
    
    // Check if this canvas is actually in the DOM (not orphaned from previous mount)
    if (!canvas.parentNode) {
      console.log('[BabylonScene] Canvas not in DOM yet, skipping initialization');
      return;
    }
    
    // Prevent double initialization - check if THIS specific canvas is already initialized
    // We need to track per-canvas, not globally, because Strict Mode creates multiple canvases
    if (canvas.dataset.babylonInitialized === 'true') {
      console.log('[BabylonScene] This canvas already initialized, skipping');
      return;
    }
    
    // Mark as initializing to prevent race conditions
    console.log('[BabylonScene] Starting initialization for new canvas...');
    canvas.dataset.babylonInitializing = 'true';

    const initEngine = async () => {
      // Use double RAF to ensure canvas is fully laid out
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      
      // Check if canvas was removed during RAF wait
      if (!canvas.parentNode) {
        console.log('[BabylonScene] Canvas removed from DOM during initialization, aborting');
        delete canvas.dataset.babylonInitializing;
        return null;
      }
      
      console.log('[BabylonScene] Canvas in DOM, creating engine...');
      
      // Mark this specific canvas as initialized
      canvas.dataset.babylonInitialized = 'true';
      delete canvas.dataset.babylonInitializing;
      
      // Create the Babylon.js engine
      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        alpha: true, // Enable alpha channel for transparency
      });
      
      // Set FPS limit
      if (fpsLimit !== FPSLimitOptions.NATIVE && fpsLimit !== 'native') {
        const targetFPS = typeof fpsLimit === 'number' ? fpsLimit : 60;
        try {
          engine.maxFPS = targetFPS;
          console.log(`[BabylonScene] Set engine.maxFPS to ${targetFPS}`);
        } catch (err) {
          // Fallback: if maxFPS isn't available, try engine.fps (legacy/alternate)
          try {
            engine.fps = targetFPS;
            console.log(`[BabylonScene] engine.maxFPS not available, set engine.fps to ${targetFPS}`);
          } catch (err2) {
            console.warn('[BabylonScene] Failed to set engine FPS limit via maxFPS or fps', err, err2);
          }
        }
      }
      
      engineRef.current = engine;

      let scene;

      // If a scene builder is provided, use it, otherwise create default scene
      if (sceneBuilder) {
        // Merge user config with defaults from sceneConfig.js
        let finalConfig = createSceneConfig({
          ...sceneConfigRef.current,
          // Pass progress callback to scene builder - use ref to avoid dependency changes
          onLoadProgress: onLoadProgressRef.current,
        });
        // Resolve resource URLs for extension mode
        finalConfig = await resolveResourceURLs(finalConfig);
        scene = await sceneBuilder(canvas, engine, finalConfig);
      } else {
        // Create the default scene
        scene = new Scene(engine);

        // Create a camera
        const camera = new ArcRotateCamera(
          'camera',
          -Math.PI / 2,
          Math.PI / 2.5,
          10,
          Vector3.Zero(),
          scene
        );
        camera.attachControl(canvas, true);

        // Create a light
        const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
        light.intensity = 0.7;

        // Create a sphere
        const sphere = MeshBuilder.CreateSphere(
          'sphere',
          { diameter: 2, segments: 32 },
          scene
        );
        sphere.position.y = 1;

        // Create a ground
        MeshBuilder.CreateGround(
          'ground',
          { width: 6, height: 6 },
          scene
        );
      }

      sceneRef.current = scene;
      
      // Scene is now fully initialized
      console.log('[BabylonScene] Initialization complete, scene mounted');

      // Notify parent component that scene is ready - use ref to avoid dependency changes
      if (onSceneReadyRef.current) {
        onSceneReadyRef.current(scene);
      }

      // Run the render loop
      engine.runRenderLoop(() => {
        scene.render();
      });

      setTimeout(() => {
        setIsReady(true);
      }, 800); // 800ms delay - longer to ensure intro animation has started

      // Handle window resize
      const handleResize = () => {
        engine.resize();
      };
      window.addEventListener('resize', handleResize);

      // Cleanup function for Babylon resources
      const cleanupBabylon = () => {
        console.log('[BabylonScene] Cleaning up Babylon resources...');
        
        // Clear canvas initialization flags
        if (canvas) {
          delete canvas.dataset.babylonInitialized;
          delete canvas.dataset.babylonInitializing;
        }
        
        window.removeEventListener('resize', handleResize);
        
        // Stop render loop
        if (engine) {
          engine.stopRenderLoop();
        }
        
        // Dispose scene and engine
        if (scene) {
          scene.dispose();
        }
        if (engine) {
          engine.dispose();
        }
        
        // Clear refs
        engineRef.current = null;
        sceneRef.current = null;
        
        console.log('[BabylonScene] Babylon cleanup complete');
      };
      
      return cleanupBabylon;
    };

    // Start initialization and store cleanup function
    const cleanupPromise = initEngine();
    cleanupPromise.then(cleanupFn => {
      cleanupFnRef.current = cleanupFn;
    });
    
    // Cleanup effect
    return () => {
      console.log('[BabylonScene] Effect cleanup triggered');
      
      // Cancel initialization if still in progress
      if (canvas.dataset.babylonInitializing === 'true') {
        console.log('[BabylonScene] Cancelling initialization');
        delete canvas.dataset.babylonInitializing;
      }
      
      // Execute Babylon cleanup if we have the function
      if (cleanupFnRef.current) {
        cleanupFnRef.current();
        cleanupFnRef.current = null;
      }
      
      // CRITICAL: DON'T remove canvas immediately in Strict Mode
      // Delay removal to allow second mount to find the canvas
      // If second mount happens, it will reuse the canvas
      // If not (true unmount), canvas will be removed after delay
      const canvasToRemove = canvasElementRef.current;
      if (canvasToRemove && canvasToRemove.parentNode) {
        // Use setTimeout(0) to defer removal until after second mount attempt
        setTimeout(() => {
          // Only remove if canvas is still orphaned (not reused by second mount)
          if (canvasToRemove.dataset.babylonInitialized !== 'true' && 
              canvasToRemove.dataset.babylonInitializing !== 'true' &&
              canvasToRemove.parentNode) {
            console.log('[BabylonScene] Removing orphaned canvas from DOM');
            canvasToRemove.parentNode.removeChild(canvasToRemove);
          }
        }, 0);
        canvasElementRef.current = null;
      }
    };
    // onSceneReady and onLoadProgress stored in refs to prevent re-initialization
  }, [sceneBuilder, fpsLimit]);

  // Detect when user starts dragging content anywhere on the page
  useEffect(() => {
    const handleDragStart = () => setIsDragging(true);
    const handleDragEnd = () => {
      setIsDragging(false);
      setIsDragOver(false);
    };

    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('dragend', handleDragEnd);
    window.addEventListener('drop', handleDragEnd);

    return () => {
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('dragend', handleDragEnd);
      window.removeEventListener('drop', handleDragEnd);
    };
  }, []);

  // Update overlay position to match model position
  useEffect(() => {
    if (!positionManagerRef?.current || !isReady) return;

    const updatePosition = () => {
      try {
        const modelPos = positionManagerRef.current.getPositionPixels();
        setModelOverlayPos({
          x: modelPos.x,
          y: modelPos.y,
          width: modelPos.width,
          height: modelPos.height
        });
      } catch (error) {
        console.error('[BabylonScene] Failed to get model position:', error);
      }
    };

    // Initial update
    updatePosition();

    // Listen for position changes
    window.addEventListener('modelPositionChange', updatePosition);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('modelPositionChange', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [positionManagerRef, isReady, setModelOverlayPos]);

  // Setup drag-drop service for the overlay
  useEffect(() => {
    if (!overlayRef.current || !isReady) return;

    dragDropServiceRef.current = new DragDropService({
      maxImages: 3,
      maxAudios: 1
    });

      dragDropServiceRef.current.attach(overlayRef.current, {
      onSetDragOver: (isDragging) => {
        setIsDragOver(isDragging);
        // DON'T open chat here - only on drop
      },
      onShowError: (error) => console.error('[BabylonScene] Drag-drop error:', error),
      checkVoiceMode: null,
      getCurrentCounts: () => ({ images: 0, audios: 0 }),
      onProcessData: (data) => {
        // Open chat when content is DROPPED (not just dragged over)
        console.log('[BabylonScene] Opening chat from model drop with data:', data);
        openChat();
        // Pass all data at once so nothing gets lost
        setPendingDropData(data);
      }
    });

    return () => {
      if (dragDropServiceRef.current) {
        dragDropServiceRef.current.detach();
      }
    };
  }, [isReady, openChat, setPendingDropData]);

  // Use portal to render canvas AND drag-drop overlay directly to document.body
  // Canvas MUST be outside Shadow DOM for Babylon.js WebGL context to work
  // Use inline styles instead of Tailwind (Tailwind is scoped to Shadow DOM)
  // Start with opacity 0, transition to opacity 100 when ready
  return createPortal(
    <>
      <canvas
        id="vassist-babylon-canvas"
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100vh',
          display: 'block',
          outline: 'none',
          backgroundColor: 'transparent',
          position: 'fixed',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 9999,
          opacity: isReady ? 1 : 0,
          transition: 'opacity 700ms ease-in-out'
        }}
      />
      
      {/* Drag-drop overlay positioned over the model */}
      {isReady && (
        <div
          ref={overlayRef}
          style={{
            position: 'fixed',
            left: `${modelOverlayPos.x}px`,
            top: `${modelOverlayPos.y}px`,
            width: `${modelOverlayPos.width}px`,
            height: `${modelOverlayPos.height}px`,
            zIndex: 10000, // Above canvas (9999) but below chat button (9999+)
            pointerEvents: isDragging ? 'auto' : 'none',
            borderRadius: '24px'
          }}
        >
          {/* Drag-drop visual feedback */}
          {isDragOver && (
            <div 
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '24px',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                border: '2px solid rgba(59, 130, 246, 0.6)',
                opacity: 1,
                transition: 'opacity 200ms ease-in-out',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none'
              }}
            >
              <div 
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  padding: '16px 24px',
                  borderRadius: '12px',
                  border: '2px dashed rgba(59, 130, 246, 0.5)',
                  transform: 'scale(1)',
                  transition: 'transform 200ms ease-in-out'
                }}
              >
                <p style={{
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: '18px',
                  fontWeight: '500',
                  margin: 0
                }}>
                  📎 Drop
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </>,
    document.body
  );
};

export default BabylonScene;
