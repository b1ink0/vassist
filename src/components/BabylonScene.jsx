import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Engine, Scene, ArcRotateCamera, HemisphericLight, MeshBuilder, Vector3 } from '@babylonjs/core';
import { getSceneConfigAsync } from '../config/sceneConfig';
import DragDropService from '../services/DragDropService';
import { useApp } from '../contexts/AppContext';
import { Icon } from './icons';
import { useConfig } from '../contexts/ConfigContext';
import { FPSLimitOptions } from '../config/uiConfig';
import Logger from '../services/LoggerService';

/**
 * @fileoverview Babylon.js 3D scene component with drag-drop support and preview mode.
 * Manages scene initialization, rendering, cleanup, and drag-drop overlay positioning.
 */

/**
 * BabylonScene component.
 * 
 * @component
 * @param {Object} props
 * @param {Function} [props.sceneBuilder] - Custom scene builder function
 * @param {Function} [props.onSceneReady] - Callback when scene is ready
 * @param {Function} [props.onLoadProgress] - Callback for loading progress updates
 * @param {Object} [props.sceneConfig={}] - Scene configuration object
 * @param {Object} [props.positionManagerRef] - Ref to position manager instance
 * @param {boolean} [props.isPreview=false] - Render as inline preview instead of portal
 * @param {string} [props.previewWidth='100%'] - Width for preview mode
 * @param {string} [props.previewHeight='100%'] - Height for preview mode
 * @param {string} [props.previewClassName=''] - Additional CSS classes for preview mode
 */
const BabylonScene = ({ 
  sceneBuilder, 
  onSceneReady, 
  onLoadProgress, 
  sceneConfig = {}, 
  positionManagerRef,
  isPreview = false,
  previewWidth = '100%',
  previewHeight = '100%',
  previewClassName = ''
}) => {
  const canvasRef = useRef(null);
  const canvasElementRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const cleanupFnRef = useRef(null);
  
  const { uiConfig } = useConfig();
  const fpsLimit = uiConfig?.fpsLimit || FPSLimitOptions.FPS_60;
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const overlayRef = useRef(null);
  const dragDropServiceRef = useRef(null);
  
  const { modelOverlayPos, setModelOverlayPos, setShowModelLoadingOverlay, setPendingDropData, openChat } = useApp();
  
  const isFirstMountRef = useRef(true);
  
  const onSceneReadyRef = useRef(onSceneReady);
  const onLoadProgressRef = useRef(onLoadProgress);
  const sceneConfigRef = useRef(sceneConfig);
  
  useEffect(() => {
    onSceneReadyRef.current = onSceneReady;
    onLoadProgressRef.current = onLoadProgress;
    sceneConfigRef.current = sceneConfig;
  }, [onSceneReady, onLoadProgress, sceneConfig]);

  useEffect(() => {
    if (isPreview) return;
    
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      Logger.log('BabylonScene', 'First mount - no loading overlay');
    } else {
      Logger.log('BabylonScene', 'Remounting after tab hide - showing loading');
      setShowModelLoadingOverlay(true);
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        Logger.log('BabylonScene', 'Tab hidden - showing loading overlay');
        setShowModelLoadingOverlay(true);
      } else if (isReady) {
        Logger.log('BabylonScene', 'Tab visible and scene ready - hiding loading overlay');
        setShowModelLoadingOverlay(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      Logger.log('BabylonScene', 'Unmounting');
    };
  }, [setShowModelLoadingOverlay, isReady, isPreview]);

  useEffect(() => {
    if (isPreview) return;
    
    if (isReady) {
      Logger.log('BabylonScene', 'Scene ready - hiding loading');
      setShowModelLoadingOverlay(false);
    }
  }, [isReady, setShowModelLoadingOverlay, isPreview]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      Logger.log('BabylonScene', 'Canvas ref not ready');
      return;
    }
    
    Logger.log('BabylonScene', 'Canvas ref ready, checking if in DOM...', canvas.parentNode ? 'YES' : 'NO');
    
    canvasElementRef.current = canvas;
    
    if (!canvas.parentNode) {
      Logger.log('BabylonScene', 'Canvas not in DOM yet, skipping initialization');
      return;
    }
    
    if (canvas.dataset.babylonInitialized === 'true') {
      Logger.log('BabylonScene', 'This canvas already initialized, skipping');
      return;
    }
    
    Logger.log('BabylonScene', 'Starting initialization for new canvas...');
    canvas.dataset.babylonInitializing = 'true';

    let cancelled = false;

    const initEngine = async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      
      if (cancelled) {
        Logger.log('BabylonScene', 'Initialization cancelled after RAF');
        delete canvas.dataset.babylonInitializing;
        return null;
      }
      
      if (!canvas.parentNode) {
        Logger.log('BabylonScene', 'Canvas removed from DOM during initialization, aborting');
        delete canvas.dataset.babylonInitializing;
        return null;
      }
      
      Logger.log('BabylonScene', 'Canvas in DOM, creating engine...');
      
      canvas.dataset.babylonInitialized = 'true';
      delete canvas.dataset.babylonInitializing;
      
      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        alpha: true,
      });
      
      if (fpsLimit !== FPSLimitOptions.NATIVE && fpsLimit !== 'native') {
        const targetFPS = typeof fpsLimit === 'number' ? fpsLimit : 60;
        try {
          engine.maxFPS = targetFPS;
          Logger.log('BabylonScene', `Set engine.maxFPS to ${targetFPS}`);
        } catch (err) {
          try {
            engine.fps = targetFPS;
            Logger.log('BabylonScene', `engine.maxFPS not available, set engine.fps to ${targetFPS}`);
          } catch (err2) {
            Logger.warn('BabylonScene', 'Failed to set engine FPS limit via maxFPS or fps', err, err2);
          }
        }
      }
      
      engineRef.current = engine;

      let scene;

      if (sceneBuilder) {
        Logger.log('BabylonScene', 'About to call getSceneConfigAsync()...');
        // Get scene config with custom model check
        let finalConfig = await getSceneConfigAsync();
        Logger.log('BabylonScene', 'getSceneConfigAsync() returned, finalConfig.modelUrl:', finalConfig.modelUrl);
        
        // Merge with user-provided config
        finalConfig = {
          ...finalConfig,
          ...sceneConfigRef.current,
          onLoadProgress: (progress) => {
            setLoadingProgress(progress);
            if (onLoadProgressRef.current) {
              onLoadProgressRef.current(progress);
            }
          },
        };
        
        Logger.log('BabylonScene', 'After merge, finalConfig.modelUrl:', finalConfig.modelUrl);
        
        scene = await sceneBuilder(canvas, engine, finalConfig);
        
        if (cancelled) {
          Logger.log('BabylonScene', 'Initialization cancelled after scene building');
          if (scene?.metadata?.animationManager) {
            scene.metadata.animationManager.dispose();
          }
          if (scene?.metadata?.positionManager) {
            scene.metadata.positionManager.dispose?.();
          }
          if (scene) {
            scene.dispose();
          }
          engine.dispose();
          return null;
        }
      } else {
        scene = new Scene(engine);

        const camera = new ArcRotateCamera(
          'camera',
          -Math.PI / 2,
          Math.PI / 2.5,
          10,
          Vector3.Zero(),
          scene
        );
        camera.attachControl(canvas, true);

        const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
        light.intensity = 0.7;

        const sphere = MeshBuilder.CreateSphere(
          'sphere',
          { diameter: 2, segments: 32 },
          scene
        );
        sphere.position.y = 1;

        MeshBuilder.CreateGround(
          'ground',
          { width: 6, height: 6 },
          scene
        );
      }

      sceneRef.current = scene;
      
      Logger.log('BabylonScene', 'Initialization complete, scene mounted');

      if (onSceneReadyRef.current) {
        onSceneReadyRef.current(scene);
      }

      engine.runRenderLoop(() => {
        scene.render();
      });

      setTimeout(() => {
        setIsReady(true);
      }, 800);

      const handleResize = () => {
        engine.resize();
      };
      window.addEventListener('resize', handleResize);

      const cleanupBabylon = () => {
        Logger.log('BabylonScene', 'Cleaning up Babylon resources...');
        
        if (canvas) {
          delete canvas.dataset.babylonInitialized;
          delete canvas.dataset.babylonInitializing;
        }
        
        window.removeEventListener('resize', handleResize);
        
        if (engine) {
          engine.stopRenderLoop();
        }
        
        if (scene?.metadata?.animationManager) {
          Logger.log('BabylonScene', 'Disposing AnimationManager...');
          scene.metadata.animationManager.dispose();
        }
        if (scene?.metadata?.positionManager) {
          Logger.log('BabylonScene', 'Disposing PositionManager...');
          scene.metadata.positionManager.dispose?.();
        }
        
        if (scene) {
          scene.dispose();
        }
        if (engine) {
          engine.dispose();
        }
        
        engineRef.current = null;
        sceneRef.current = null;
        
        Logger.log('BabylonScene', 'Babylon cleanup complete');
      };
      
      return cleanupBabylon;
    };

    const cleanupPromise = initEngine();
    cleanupPromise.then(cleanupFn => {
      if (!cancelled && cleanupFn) {
        cleanupFnRef.current = cleanupFn;
      }
    });
    
    return () => {
      Logger.log('BabylonScene', 'Effect cleanup triggered');
      
      cancelled = true;
      
      if (canvas.dataset.babylonInitializing === 'true') {
        Logger.log('BabylonScene', 'Cancelling initialization');
        delete canvas.dataset.babylonInitializing;
      }
      
      if (cleanupFnRef.current) {
        cleanupFnRef.current();
        cleanupFnRef.current = null;
      }
      
      const canvasToRemove = canvasElementRef.current;
      if (canvasToRemove && canvasToRemove.parentNode) {
        setTimeout(() => {
          if (canvasToRemove.dataset.babylonInitialized !== 'true' && 
              canvasToRemove.dataset.babylonInitializing !== 'true' &&
              canvasToRemove.parentNode) {
            Logger.log('BabylonScene', 'Removing orphaned canvas from DOM');
            canvasToRemove.parentNode.removeChild(canvasToRemove);
          }
        }, 0);
        canvasElementRef.current = null;
      }
    };
  }, [sceneBuilder, fpsLimit]);

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
        Logger.error('BabylonScene', 'Failed to get model position:', error);
      }
    };

    updatePosition();

    window.addEventListener('modelPositionChange', updatePosition);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('modelPositionChange', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [positionManagerRef, isReady, setModelOverlayPos]);

  useEffect(() => {
    if (isPreview) return;
    if (!overlayRef.current || !isReady) return;

    dragDropServiceRef.current = new DragDropService({
      maxImages: 3,
      maxAudios: 1
    });

      dragDropServiceRef.current.attach(overlayRef.current, {
      onSetDragOver: (isDragging) => {
        setIsDragOver(isDragging);
      },
      onShowError: (error) => Logger.error('BabylonScene', 'Drag-drop error:', error),
      checkVoiceMode: null,
      getCurrentCounts: () => ({ images: 0, audios: 0 }),
      onProcessData: (data) => {
        Logger.log('BabylonScene', 'Opening chat from model drop with data:', data);
        openChat();
        setPendingDropData(data);
      }
    });

    return () => {
      if (dragDropServiceRef.current) {
        dragDropServiceRef.current.detach();
      }
    };
  }, [isReady, openChat, setPendingDropData, isPreview]);

  const canvasContent = (
    <>
      <canvas
        id={isPreview ? undefined : "vassist-babylon-canvas"}
        ref={canvasRef}
        style={isPreview ? {
          width: previewWidth,
          height: previewHeight,
          display: 'block',
          outline: 'none',
          backgroundColor: 'transparent',
          borderRadius: '16px',
          opacity: isReady ? 1 : 0,
          transition: 'opacity 700ms ease-in-out'
        } : {
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
      
      {!isPreview && isReady && (
        <div
          ref={overlayRef}
          style={{
            position: 'fixed',
            left: `${modelOverlayPos.x}px`,
            top: `${modelOverlayPos.y}px`,
            width: `${modelOverlayPos.width}px`,
            height: `${modelOverlayPos.height}px`,
            zIndex: 10000,
            pointerEvents: isDragging ? 'auto' : 'none',
            borderRadius: '24px'
          }}
        >
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
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Icon name="attachment" size={20} /> Drop
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (isPreview) {
    return (
      <div className={`relative ${previewClassName}`} style={{ width: previewWidth, height: previewHeight }}>
        {canvasContent}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500/30 border-t-purple-500 mx-auto mb-4"></div>
              <p className="text-white/70 text-sm font-medium">
                Loading 3D Model... {Math.round(loadingProgress || 0)}%
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return createPortal(
    canvasContent,
    document.body
  );
};

export default BabylonScene;
