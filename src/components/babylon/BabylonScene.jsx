import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Engine, Scene, ArcRotateCamera, HemisphericLight, MeshBuilder, Vector3 } from '@babylonjs/core';

const BabylonScene = ({ sceneBuilder, onSceneReady }) => {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef = useRef(null);

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
        scene = await sceneBuilder(canvasRef.current, engine);
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
  }, [sceneBuilder, onSceneReady]);

  // Use portal to render canvas directly to document.body
  return createPortal(
    <canvas
      ref={canvasRef}
      className="w-full h-screen block outline-none bg-transparent absolute top-0 left-0 pointer-events-none z-[9999]"
    />,
    document.body
  );
};

export default BabylonScene;
