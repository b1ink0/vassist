import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Engine, Scene, ArcRotateCamera, HemisphericLight, MeshBuilder, Vector3 } from '@babylonjs/core';
import { createSceneConfig, resolveResourceURLs } from '../config/sceneConfig';

const BabylonScene = ({ sceneBuilder, onSceneReady, onLoadProgress, sceneConfig = {} }) => {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Capture canvas reference for cleanup
    const canvas = canvasRef.current;

    const initEngine = async () => {
      // Create the Babylon.js engine
      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        alpha: true, // Enable alpha channel for transparency
      });
      engineRef.current = engine;

      let scene;

      // If a scene builder is provided, use it, otherwise create default scene
      if (sceneBuilder) {
        // Merge user config with defaults from sceneConfig.js
        let finalConfig = createSceneConfig({
          ...sceneConfig,
          // Pass progress callback to scene builder
          onLoadProgress: onLoadProgress,
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

      // Notify parent component that scene is ready
      if (onSceneReady) {
        onSceneReady(scene);
      }

      // Run the render loop
      engine.runRenderLoop(() => {
        scene.render();
      });

      setTimeout(() => {
        setIsReady(true);
      }, 400); // 400ms delay for physics to stabilize

      // Handle window resize
      const handleResize = () => {
        engine.resize();
      };
      window.addEventListener('resize', handleResize);

      // Cleanup function
      return () => {
        console.log('[BabylonScene] Cleaning up...');
        window.removeEventListener('resize', handleResize);
        
        // Stop render loop
        engine.stopRenderLoop();
        
        // Dispose scene and engine
        if (scene) {
          scene.dispose();
        }
        if (engine) {
          engine.dispose();
        }
        
        console.log('[BabylonScene] Cleanup complete');
      };
    };

    const cleanup = initEngine();
    return () => {
      // Cleanup immediately - fade-out is handled by content script
      cleanup.then(cleanupFn => cleanupFn && cleanupFn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneBuilder, onSceneReady, onLoadProgress]);
  // Note: sceneConfig intentionally omitted from deps to prevent re-initialization loop

  // Use portal to render canvas directly to document.body
  // Canvas MUST be outside Shadow DOM for Babylon.js WebGL context to work
  // Use inline styles instead of Tailwind (Tailwind is scoped to Shadow DOM)
  // Start with opacity 0, transition to opacity 100 when ready
  return createPortal(
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
    />,
    document.body
  );
};

export default BabylonScene;
