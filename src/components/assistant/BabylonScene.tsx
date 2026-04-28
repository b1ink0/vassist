import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { Engine, Scene, ArcRotateCamera, HemisphericLight, MeshBuilder, Vector3 } from '@babylonjs/core';
import { getSceneConfigAsync } from '../../config/sceneConfig';
import DragDropService from '../../services/DragDropService';
import { cn } from '../../utils/cn';
import { useApp } from '../../contexts/AppContext';
import { Icon } from '../icons';
import { useConfig } from '../../contexts/ConfigContext';
import { useDesktop } from '../../contexts/DesktopContext';
import { FPSLimitOptions } from '../../config/uiConfig';
import Logger from '../../services/LoggerService';
import { isAndroid, isDesktop } from '../../utils/PlatformUtils';
import type { PixelSize, PositionManagerLike, PositionPixels, SceneBuildConfig } from '../../babylon/types';
import type { ElectronAPI } from '../../types/electron';

type SceneBuilder = (canvas: HTMLCanvasElement, engine: Engine, config: SceneBuildConfig) => Promise<Scene>;

interface BabylonSceneProps {
  sceneBuilder?: SceneBuilder;
  onSceneReady?: (scene: Scene) => void;
  onLoadProgress?: (progress: number) => void;
  sceneConfig?: Partial<SceneBuildConfig>;
  positionManagerRef?: MutableRefObject<PositionManagerLike | null>;
  isPreview?: boolean;
  previewWidth?: string;
  previewHeight?: string;
  previewClassName?: string;
}

interface CanvasDimensions {
  width: number;
  height: number;
}

interface ModelOverlayPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BabylonSceneAppContextValue {
  modelOverlayPos: ModelOverlayPosition;
  setModelOverlayPos: Dispatch<SetStateAction<ModelOverlayPosition>>;
  setShowModelLoadingOverlay: Dispatch<SetStateAction<boolean>>;
  setPendingDropData: Dispatch<SetStateAction<unknown>>;
  openChat: () => void;
}

interface UIConfigForScene {
  modelSizePx?: PixelSize | null;
  fpsLimit?: number | typeof FPSLimitOptions.NATIVE;
}

interface WallpaperVisibilityDetail {
  visible: boolean;
}

const isPixelSize = (value: unknown): value is PixelSize => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PixelSize>;
  return typeof candidate.width === 'number' && typeof candidate.height === 'number';
};

const getModelSizePx = (config: UIConfigForScene | null | undefined): PixelSize | null => {
  const modelSize = config?.modelSizePx;
  return isPixelSize(modelSize) ? modelSize : null;
};

const isCanvasDimensions = (value: unknown): value is CanvasDimensions => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CanvasDimensions>;
  return typeof candidate.width === 'number' && typeof candidate.height === 'number';
};

const isWallpaperVisibilityDetail = (value: unknown): value is WallpaperVisibilityDetail => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return typeof (value as Partial<WallpaperVisibilityDetail>).visible === 'boolean';
};

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
}: BabylonSceneProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const cleanupFnRef = useRef<(() => void) | null>(null);
  
  const { uiConfig, updateUIConfig } = useConfig();
  const { api: desktopAPI } = useDesktop();
  const uiConfigForScene: UIConfigForScene | null = uiConfig;
  const modelSizePx = getModelSizePx(uiConfigForScene);
  const fpsLimit = uiConfigForScene?.fpsLimit ?? FPSLimitOptions.FPS_60;
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragDropServiceRef = useRef<DragDropService | null>(null);
  
  const [canvasSize, setCanvasSize] = useState<CanvasDimensions>(() => {
    if (isDesktop && typeof window !== 'undefined') {
      if (modelSizePx) {
        const baseModelWidth = 300;
        const baseModelHeight = 500;
        const scaleFactorWidth = 0.85;
        const scaleFactorHeight = 0.75;
        const baseWidth = 400;
        const baseHeight = 525;
        
        const modelWidthDelta = modelSizePx.width - baseModelWidth;
        const modelHeightDelta = modelSizePx.height - baseModelHeight;
        
        const width = Math.max(baseWidth + (modelWidthDelta * scaleFactorWidth), 400);
        const height = Math.max(baseHeight + (modelHeightDelta * scaleFactorHeight), 525);
        Logger.log('BabylonScene', `Initializing canvas with saved size: ${width}x${height}`);
        return { width, height };
      }
      return {
        width: window.innerWidth,
        height: window.innerHeight
      };
    }
    return { width: 400, height: 525 };
  });

  useEffect(() => {
    const handleCanvasSizeUpdate = (event: Event): void => {
      if (!(event instanceof CustomEvent) || !isCanvasDimensions(event.detail)) {
        return;
      }

      const { width, height } = event.detail;
      setCanvasSize({ width, height });
      Logger.log('BabylonScene', `Canvas size updated to ${width}x${height}`);
    };

    window.addEventListener('updateCanvasSize', handleCanvasSizeUpdate);

    return () => {
      window.removeEventListener('updateCanvasSize', handleCanvasSizeUpdate);
    };
  }, []);
  
  // On mount, if desktop and saved config exists, resize Electron window to match
  useEffect(() => {
    if (!isDesktop || !desktopAPI?.window || isPreview) return;
    
    if (modelSizePx) {
      const { width: modelWidth, height: modelHeight } = modelSizePx;
      Logger.log('BabylonScene', `Applying saved zoom to Electron window on mount: ${modelWidth}x${modelHeight}`);

      const updateWindowSizeForZoom = desktopAPI.window.updateWindowSizeForZoom;
      if (!updateWindowSizeForZoom) {
        return;
      }
      
      updateWindowSizeForZoom(modelWidth, modelHeight).then(() => {
        return desktopAPI.window.getSize();
      }).then((windowSize: { width: number; height: number }) => {
        Logger.log('BabylonScene', `Electron window resized to: ${windowSize.width}x${windowSize.height}`);
        setCanvasSize({ width: windowSize.width, height: windowSize.height });
        
        setTimeout(() => {
          if (positionManagerRef?.current) {
            Logger.log('BabylonScene', 'Updating PositionManager after window resize on mount');
            const pm = positionManagerRef.current;
            
            const oldCanvasWidth = pm.canvasWidth;
            const oldCanvasHeight = pm.canvasHeight;
            const oldPosX = pm.positionX;
            const oldPosY = pm.positionY;
            const oldWidth = pm.modelWidthPx;
            const oldHeight = pm.effectiveHeightPx;
            
            pm.updateCanvasDimensions();
            
            // Calculate position as ratio, maintain relative position
            const posXRatio = (oldPosX + oldWidth / 2) / oldCanvasWidth;
            const posYRatio = (oldPosY + oldHeight / 2) / oldCanvasHeight;
            
            const newPosX = (posXRatio * pm.canvasWidth) - modelWidth / 2;
            const newPosY = (posYRatio * pm.canvasHeight) - modelHeight / 2;
            
            // Update model size AND position
            pm.positionX = newPosX;
            pm.positionY = newPosY;
            pm.modelHeightPx = modelHeight;
            pm.modelWidthPx = modelWidth;
            pm.effectiveHeightPx = modelHeight;
            
            pm.updateCameraFrustum();
            
            Logger.log('BabylonScene', `Position maintained at ratio (${posXRatio.toFixed(2)}, ${posYRatio.toFixed(2)}): (${newPosX}, ${newPosY})`);
          } else {
            Logger.warn('BabylonScene', 'PositionManager not ready yet, will update on next zoom');
          }
        }, 200);
      }).catch((err: unknown) => {
        Logger.warn('BabylonScene', 'Failed to resize Electron window on mount:', err);
      });
    }
  }, [modelSizePx, desktopAPI, isPreview, positionManagerRef]);
  
  
  const {
    modelOverlayPos,
    setModelOverlayPos,
    setShowModelLoadingOverlay,
    setPendingDropData,
    openChat
  }: BabylonSceneAppContextValue = useApp();
  
  const isFirstMountRef = useRef(true);
  
  const initialHeightRef = useRef<number | null>(null);
  
  if (initialHeightRef.current === null && typeof window !== 'undefined') {
    initialHeightRef.current = window.innerHeight;
  }
  
  const onSceneReadyRef = useRef<BabylonSceneProps['onSceneReady']>(onSceneReady);
  const onLoadProgressRef = useRef<BabylonSceneProps['onLoadProgress']>(onLoadProgress);
  const sceneConfigRef = useRef<Partial<SceneBuildConfig>>(sceneConfig);
  
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

    const initEngine = async (): Promise<(() => void) | null> => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      
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
      
      // Get device pixel ratio - limit to 2x on Android to balance quality vs performance
      const rawDPR = window.devicePixelRatio || 1;
      const maxDPR = isAndroid ? 2 : 3; // Cap at 2x on Android, 3x on other platforms
      const effectiveDPR = Math.min(rawDPR, maxDPR);
      
      Logger.log('BabylonScene', `Device pixel ratio: ${rawDPR}, effective: ${effectiveDPR}, isAndroid: ${isAndroid}`);
      
      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        alpha: true,
        adaptToDeviceRatio: true, // Enable high-DPI rendering
        powerPreference: isAndroid ? 'high-performance' : 'default',
      });
      
      // Set hardware scaling level to control resolution (lower = higher quality)
      // 1 / effectiveDPR ensures we render at the device's native resolution (capped)
      engine.setHardwareScalingLevel(1 / effectiveDPR);
      
      if (fpsLimit !== FPSLimitOptions.NATIVE) {
        const targetFPS = typeof fpsLimit === 'number' ? fpsLimit : 60;
        try {
          engine.maxFPS = targetFPS;
          Logger.log('BabylonScene', `Set engine.maxFPS to ${targetFPS}`);
        } catch (err) {
          Logger.warn('BabylonScene', 'Failed to set engine.maxFPS', err);
        }
      }
      
      engineRef.current = engine;

      let scene: Scene;

      if (sceneBuilder) {
        Logger.log('BabylonScene', 'About to call getSceneConfigAsync()...');
        // Get scene config with custom model check
        const baseSceneConfig = (await getSceneConfigAsync()) as SceneBuildConfig;
        Logger.log('BabylonScene', 'getSceneConfigAsync() returned, finalConfig.modelUrl:', baseSceneConfig.modelUrl);
        
        // Merge with user-provided config
        const finalConfig: SceneBuildConfig = {
          ...baseSceneConfig,
          ...sceneConfigRef.current,
          updateUIConfig,
          onLoadProgress: (progress: number) => {
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

      onSceneReadyRef.current?.(scene);

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
      
      // Android wallpaper visibility handler - pause/resume rendering
      const handleWallpaperVisibility = (event: Event): void => {
        if (!(event instanceof CustomEvent) || !isWallpaperVisibilityDetail(event.detail)) {
          return;
        }

        const { visible } = event.detail;
        Logger.log('BabylonScene', `Wallpaper visibility changed: ${visible}`);
        
        if (visible) {
          engine.runRenderLoop(() => {
            scene.render();
          });
          if (scene?.metadata?.animationManager) {
            scene.metadata.animationManager.resume?.();
          }
        } else {
          engine.stopRenderLoop();
          if (scene?.metadata?.animationManager) {
            scene.metadata.animationManager.pause?.();
          }
        }
      };
      
      // Only add wallpaper visibility listener on Android
      if (isAndroid) {
        window.addEventListener('wallpaperVisibility', handleWallpaperVisibility);
      }

      const cleanupBabylon = () => {
        Logger.log('BabylonScene', 'Cleaning up Babylon resources...');
        
        if (canvas) {
          delete canvas.dataset.babylonInitialized;
          delete canvas.dataset.babylonInitializing;
        }
        
        window.removeEventListener('resize', handleResize);
        
        // Remove wallpaper visibility listener
        if (isAndroid) {
          window.removeEventListener('wallpaperVisibility', handleWallpaperVisibility);
        }
        
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
    cleanupPromise.then((cleanupFn) => {
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

    const updatePosition = (): void => {
      try {
        const activePositionManager = positionManagerRef.current;
        if (!activePositionManager) {
          return;
        }

        const modelPos: PositionPixels = activePositionManager.getPositionPixels();
        setModelOverlayPos({
          x: modelPos.x,
          y: modelPos.y,
          width: modelPos.width,
          height: modelPos.height
        });
      } catch (error: unknown) {
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

    const overlayElement = overlayRef.current;
    const dragDropService = new DragDropService({
      maxImages: 3,
      maxAudios: 1
    });

    dragDropServiceRef.current = dragDropService;

    dragDropService.attach(overlayElement, {
      onSetDragOver: (isDragOverState: boolean) => {
        setIsDragOver(isDragOverState);
      },
      onShowError: (error: unknown) => Logger.error('BabylonScene', 'Drag-drop error:', error),
      checkVoiceMode: null,
      getCurrentCounts: () => ({ images: 0, audios: 0 }),
      onProcessData: (data: unknown) => {
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

  const canvasHeight = isAndroid && initialHeightRef.current !== null
    ? `${initialHeightRef.current}px` 
    : '100vh';

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
          width: isDesktop ? `${canvasSize.width}px` : '100%',
          height: isDesktop ? `${canvasSize.height}px` : canvasHeight,
          display: 'block',
          outline: 'none',
          backgroundColor: 'transparent',
          position: 'fixed',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: isAndroid ? 100 : 9999,
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
            zIndex: isAndroid ? 101 : 10000,
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
      <div className={cn('relative', previewClassName)} style={{ width: previewWidth, height: previewHeight }}>
        {canvasContent}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/10 to-white/10 rounded-2xl">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/30 border-t-white/80 mx-auto mb-4"></div>
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
