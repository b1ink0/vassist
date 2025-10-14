import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Engine, Scene, ArcRotateCamera, HemisphericLight, MeshBuilder, Vector3 } from '@babylonjs/core';
import { createSceneConfig } from '../config/sceneConfig';

const BabylonScene = ({ sceneBuilder, onSceneReady, onLoadProgress, sceneConfig = {} }) => {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    const initEngine = async () => {
      // Create the Babylon.js engine
      const engine = new Engine(canvasRef.current, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        alpha: true, // Enable alpha channel for transparency
      });
      engineRef.current = engine;

      let scene;

      // If a scene builder is provided, use it, otherwise create default scene
      if (sceneBuilder) {
        // Merge user config with defaults from sceneConfig.js
        const finalConfig = createSceneConfig({
          ...sceneConfig,
          // Pass progress callback to scene builder
          onLoadProgress: onLoadProgress,
        });
        scene = await sceneBuilder(canvasRef.current, engine, finalConfig);
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
        camera.attachControl(canvasRef.current, true);

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

      // Mark as ready
      setIsReady(true);

      // Notify parent component that scene is ready
      if (onSceneReady) {
        onSceneReady(scene);
      }

      // Run the render loop
      engine.runRenderLoop(() => {
        scene.render();
      });

      // Handle window resize
      const handleResize = () => {
        engine.resize();
      };
      window.addEventListener('resize', handleResize);

      // Cleanup function
      return () => {
        window.removeEventListener('resize', handleResize);
        scene.dispose();
        engine.dispose();
      };
    };

    const cleanup = initEngine();
    return () => {
      cleanup.then(cleanupFn => cleanupFn && cleanupFn());
    };
  }, [sceneBuilder, onSceneReady, onLoadProgress, sceneConfig]);

  // Use portal to render canvas directly to document.body
  // Start with opacity 0, transition to opacity 100 when ready
  return createPortal(
    <canvas
      ref={canvasRef}
      className={`w-full h-screen block outline-none bg-transparent absolute top-0 left-0 pointer-events-none z-[9999] transition-opacity duration-700 ${
        isReady ? 'opacity-100' : 'opacity-0'
      }`}
    />,
    document.body
  );
};

export default BabylonScene;
