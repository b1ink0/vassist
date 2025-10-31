import "@babylonjs/core/Loading/loadingScreen";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "babylon-mmd/esm/Loader/Optimized/bpmxLoader";
import "babylon-mmd/esm/Runtime/Animation/mmdCompositeRuntimeCameraAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdCompositeRuntimeModelAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation";

import { Camera } from "@babylonjs/core/Cameras/camera";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import havokPhysics from "@babylonjs/havok";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";

import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { BvmdLoader } from "babylon-mmd/esm/Loader/Optimized/bvmdLoader";
import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdPhysics } from "babylon-mmd/esm/Runtime/Physics/mmdPhysics";
import { AnimationManager } from "../managers/AnimationManager";
import { PositionManager } from "../managers/PositionManager";
import { CanvasInteractionManager } from "../managers/CanvasInteractionManager";
import Logger from '../../services/Logger';

/**
 * Build MMD Model Scene with async model loading support
 * 
 * This scene builder expects to receive a complete configuration object
 * from BabylonScene, which handles merging user config with defaults.
 * 
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Engine} engine - Babylon.js engine
 * @param {Object} config - Complete scene configuration (already merged with defaults)
 * @returns {Promise<Scene>} Configured Babylon.js scene
 */
export const buildMmdModelScene = async (canvas, engine, config) => {
  const finalConfig = config;
  
  // Check if Portrait Mode is enabled (used in multiple places)
  const isPortraitMode = finalConfig.uiConfig?.enablePortraitMode || false;
  
  SdefInjector.OverrideEngineCreateEffect(engine);

  const scene = new Scene(engine);
  
  // Set background transparency
  if (finalConfig.transparentBackground) {
    scene.clearColor = new Color4(0, 0, 0, 0); // Fully transparent
  }

  // ========================================
  // SCENE SETUP
  // ========================================
  
  // Create MMD root and camera root
  const mmdRoot = new TransformNode("mmdRoot", scene);
  const cameraRoot = new TransformNode("cameraRoot", scene);
  cameraRoot.scaling.y = 0.98;
  cameraRoot.parent = mmdRoot;

  // Create MMD Camera
  const mmdCamera = new MmdCamera("mmdCamera", new Vector3(0, 10, 0), scene);
  mmdCamera.maxZ = 5000;
  mmdCamera.ignoreParentScaling = true;
  mmdCamera.parent = cameraRoot;

  // Enable orthographic mode for 2D-like appearance
  mmdCamera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  
  // Set orthographic frustum
  const orthoHeight = finalConfig.orthoHeight;
  const cameraDistance = finalConfig.cameraDistance;
  const aspectRatio = engine.getAspectRatio(mmdCamera);
  
  mmdCamera.orthoTop = orthoHeight;
  mmdCamera.orthoBottom = -orthoHeight;
  mmdCamera.orthoLeft = -orthoHeight * aspectRatio;
  mmdCamera.orthoRight = orthoHeight * aspectRatio;

  // Set camera distance for orthographic view
  mmdCamera.distance = cameraDistance;
  mmdCamera.rotation.set(0, 0, 0);

  // Handle window resize to maintain aspect ratio
  engine.onResizeObservable.add(() => {
    const newAspect = engine.getAspectRatio(mmdCamera);
    mmdCamera.orthoLeft = -orthoHeight * newAspect;
    mmdCamera.orthoRight = orthoHeight * newAspect;
  });

  // Create default ArcRotate camera for debugging
  const camera = new ArcRotateCamera(
    "arcRotateCamera",
    0,
    0,
    45,
    new Vector3(0, 10, 0),
    scene
  );
  camera.minZ = 1;
  camera.maxZ = 5000;
  camera.setPosition(new Vector3(0, 10, -45));
  camera.attachControl(undefined, false);
  camera.inertia = 0.8;
  camera.speed = 10;

  // Store cameras in metadata for debug panel access
  scene.metadata = scene.metadata || {};
  scene.metadata.mmdCamera = mmdCamera;
  scene.metadata.arcRotateCamera = camera;
  scene.metadata.is3DViewActive = false;

  // ========================================
  // LIGHTING
  // ========================================
  
  // Create lights
  const hemisphericLight = new HemisphericLight(
    "hemisphericLight",
    new Vector3(0, 1, 0),
    scene
  );
  hemisphericLight.intensity = 0.3;
  hemisphericLight.specular.set(0, 0, 0);
  hemisphericLight.groundColor.set(1, 1, 1);

  const directionalLight = new DirectionalLight(
    "directionalLight",
    new Vector3(0.5, -1, 1),
    scene
  );
  directionalLight.intensity = 0.7;
  directionalLight.autoCalcShadowZBounds = false;
  directionalLight.autoUpdateExtends = false;
  directionalLight.shadowMaxZ = 20;
  directionalLight.shadowMinZ = -15;
  directionalLight.orthoTop = 10;
  directionalLight.orthoBottom = -5;
  directionalLight.orthoLeft = -15;
  directionalLight.orthoRight = 13;
  directionalLight.shadowOrthoScale = 0;

  // Create shadow generator
  const shadowGenerator = finalConfig.enableShadows ? new ShadowGenerator(1024, directionalLight, true) : null;
  if (shadowGenerator) {
    shadowGenerator.usePercentageCloserFiltering = true;
    shadowGenerator.forceBackFacesOnly = false;
    shadowGenerator.bias = 0.01;
    shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    shadowGenerator.frustumEdgeFalloff = 0.1;
    shadowGenerator.transparencyShadow = true;
  }

  // Create ground
  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: 60, height: 60 },
    scene
  );
  if (finalConfig.enableShadows) {
    ground.receiveShadows = true;
  }

  // ========================================
  // MMD RUNTIME INITIALIZATION
  // ========================================
  
  // Initialize MMD Runtime
  const mmdRuntime = new MmdRuntime(
    scene, 
    finalConfig.enablePhysics ? new MmdPhysics(scene) : undefined
  );
  mmdRuntime.loggingEnabled = true;
  mmdRuntime.register(scene);

  // BVMD Loader
  const bvmdLoader = new BvmdLoader(scene);
  bvmdLoader.loggingEnabled = false;

  // Material builder
  const materialBuilder = new MmdStandardMaterialBuilder();
  materialBuilder.loadOutlineRenderingProperties = () => {
    /* do nothing */
  };

  // ========================================
  // CAMERA ANIMATION LOADING (OPTIONAL)
  // ========================================
  
  let cameraAnimation = null;
  if (finalConfig.enableCameraAnimation && finalConfig.cameraAnimationUrl) {
    try {
      Logger.log('MmdModelScene', 'Loading camera animation:', finalConfig.cameraAnimationUrl);
      cameraAnimation = await bvmdLoader.loadAsync(
        "camera",
        finalConfig.cameraAnimationUrl
      );
      Logger.log('MmdModelScene', 'Camera animation loaded successfully');
    } catch (error) {
      Logger.warn('MmdModelScene', 'Failed to load camera animation:', error);
      // Continue without camera animation
    }
  }

  // ========================================
  // MODEL LOADING (ASYNC WITH PROGRESS)
  // ========================================
  
  Logger.log('MmdModelScene', 'Loading model from:', finalConfig.modelUrl);
  
  let modelMesh = null;
  let mmdModel = null;
  
  try {
    // Load model with progress tracking (no built-in loading UI)
    const result = await LoadAssetContainerAsync(
      finalConfig.modelUrl,
      scene,
      {
        pluginOptions: {
          mmdmodel: {
            materialBuilder: materialBuilder,
            boundingBoxMargin: 60,
            loggingEnabled: true,
          },
        },
        // Progress callback
        onProgress: (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100;
            Logger.log('MmdModelScene', `Model loading: ${progress.toFixed(1)}%`);
            
            // Call user's progress callback
            if (finalConfig.onLoadProgress) {
              finalConfig.onLoadProgress(progress);
            }
          }
        }
      }
    );
    
    Logger.log('MmdModelScene', 'Model loaded, adding to scene...');
    
    // Add model to scene
    result.addAllToScene();
    modelMesh = result.meshes[0];
    
    Logger.log('MmdModelScene', 'Model added to scene successfully');
    
    // Call user's model loaded callback
    if (finalConfig.onModelLoaded) {
      finalConfig.onModelLoaded(modelMesh);
    }
    
  } catch (error) {
    Logger.error('MmdModelScene', 'Failed to load model:', error);
    throw new Error(`Failed to load MMD model: ${error.message}`);
  }

  // ========================================
  // PHYSICS INITIALIZATION
  // ========================================
  
  if (finalConfig.enablePhysics) {
    Logger.log('MmdModelScene', 'Initializing physics...');
    const havokInstance = await havokPhysics();
    const havokPlugin = new HavokPlugin(true, havokInstance);
    scene.enablePhysics(new Vector3(0, -9.8 * 10, 0), havokPlugin);
    Logger.log('MmdModelScene', 'Physics initialized');
  }

  // ========================================
  // CAMERA ANIMATION SETUP
  // ========================================
  
  if (cameraAnimation) {
    mmdRuntime.setCamera(mmdCamera);
    mmdCamera.addAnimation(cameraAnimation);
    mmdCamera.setAnimation("camera");
    Logger.log('MmdModelScene', 'Camera animation applied');
  }

  // ========================================
  // MODEL CONFIGURATION
  // ========================================
  
  // Setup model shadows
  if (finalConfig.enableShadows && shadowGenerator) {
    for (const mesh of modelMesh.metadata.meshes) {
      mesh.receiveShadows = true;
      shadowGenerator.addShadowCaster(mesh, false);
    }
  }
  
  modelMesh.parent = mmdRoot;

  // Create MMD model
  mmdModel = mmdRuntime.createMmdModel(modelMesh, {
    buildPhysics: finalConfig.enablePhysics,
  });
  
  Logger.log('MmdModelScene', 'MMD model created');

  // ========================================
  // ANIMATION MANAGER INTEGRATION
  // ========================================
  
  Logger.log('MmdModelScene', 'Initializing AnimationManager...');
  
  const animationManager = new AnimationManager(
    scene,
    mmdRuntime,
    mmdModel,
    bvmdLoader
  );
  
  // Initialize scene metadata if null
  if (!scene.metadata) {
    scene.metadata = {};
  }
  
  // Store AnimationManager in scene metadata for cross-manager communication
  scene.metadata.animationManager = animationManager;
  
  // Get position preset BEFORE initializing AnimationManager
  // so intro animation can be flipped if model is on left side
  const positionConfig = finalConfig.uiConfig?.position || { preset: 'bottom-right' };
  const preset = positionConfig.preset || 'bottom-right';
  // Use the actual preset directly (last-location preset now exists in config)
  const actualPreset = preset;
  
  // Portrait Mode - Use clipping plane to hide lower body
  // Get clipping plane Y value from preset (allows per-model adjustment)
  if (isPortraitMode) {
    // Import PositionPresets to get the portraitClipPlaneY value
    const { PositionPresets } = await import('../../config/uiConfig.js');
    const presetData = PositionPresets[actualPreset];
    const clipPlaneY = presetData?.portraitClipPlaneY ?? 6.5; // Default to 6.5 if not specified
    
    Logger.log('MmdModelScene', `Portrait Mode enabled - setting up clipping plane at Y = ${clipPlaneY}`);
    
    // Create a clipping plane at specified height
    // Normal pointing DOWN (0,-1,0) clips everything BELOW the Y coordinate
    const clipPlane = new Plane(0, -1, 0, clipPlaneY);
    scene.clipPlane = clipPlane;
    
    // Store clipping plane Y value in metadata for debug panel access
    scene.metadata.portraitClipPlaneY = clipPlaneY;
    
    // Store Portrait Mode flag in scene metadata
    scene.metadata.isPortraitMode = true;
    
    Logger.log('MmdModelScene', `Portrait Mode: Clipping plane set at Y = ${clipPlaneY}`);
  }
  
  // Determine if we should skip intro
  // Skip for: center positions, last-location, Portrait Mode, OR if we have savedModelPosition (model already loaded before)
  const shouldSkipIntro = preset.includes('center') 
    || preset === 'last-location' 
    || isPortraitMode 
    || finalConfig.savedModelPosition !== null; // Skip intro if model already loaded in this session
  
  Logger.log('MmdModelScene', `Position preset: ${preset}, actual: ${actualPreset}, skipIntro: ${shouldSkipIntro}${isPortraitMode ? ' (Portrait Mode)' : ''}${finalConfig.savedModelPosition ? ' (has saved position)' : ''}`);

  // Initialize animation system
  // Skip intro for center positions (model just appears in place)
  // Pass position preset so intro can be flipped for left-side positions
  await animationManager.initialize(!shouldSkipIntro, actualPreset);

  Logger.log('MmdModelScene', 'AnimationManager initialized and running');

  // ========================================
  // POSITION MANAGER INTEGRATION
  // ========================================
  
  Logger.log('MmdModelScene', 'Initializing PositionManager...');
  
  const positionManager = new PositionManager(
    scene,
    mmdCamera,
    canvas,
    finalConfig.positionConfig
  );

  // Store in metadata BEFORE initializing so AnimationManager can find it
  scene.metadata = scene.metadata || {};
  scene.metadata.positionManager = positionManager;

  // Initialize positioning system with saved preset/location from uiConfig
  Logger.log('MmdModelScene', 'Initializing PositionManager with config:', positionConfig);
  Logger.log('MmdModelScene', 'uiConfig:', finalConfig.uiConfig);
  Logger.log('MmdModelScene', 'savedModelPosition from context:', finalConfig.savedModelPosition);
  
  // Priority: savedModelPosition from context > lastLocation from config > preset
  // savedModelPosition persists across unmount/remount (tab visibility changes)
  // Use savedModelPosition REGARDLESS of preset if it exists
  if (finalConfig.savedModelPosition || (preset === 'last-location' && positionConfig.lastLocation)) {
    const savedPos = finalConfig.savedModelPosition || positionConfig.lastLocation;
    const { x, y, width, height, preset: savedPreset } = savedPos;
    Logger.log('MmdModelScene', 'Loading saved position:', savedPos);
    
    // Setup PositionManager manually (without calling applyPreset which would fire wrong position event)
    positionManager.updateCanvasDimensions();
    positionManager.setupResizeHandler();
    
    // Store Portrait Mode state on PositionManager (needed for offset calculations)
    positionManager.isPortraitMode = isPortraitMode;
    
    // Get preset data for dimensions and offset
    // Use the saved preset if available, otherwise fall back to current preset
    const { PositionPresets } = await import('../../config/uiConfig.js');
    const presetToUse = savedPreset || actualPreset;
    const presetData = PositionPresets[presetToUse];
    const modelSize = isPortraitMode ? presetData.portraitModelSize : presetData.modelSize;
    const finalWidth = width || modelSize.width;
    const finalHeight = height || modelSize.height;
    
    // Get the correct offset based on Portrait Mode
    const offset = isPortraitMode && presetData.portraitOffset 
      ? presetData.portraitOffset 
      : presetData.offset || { x: 0, y: 0 };
    
    // Apply two-height system for Portrait Mode
    let cameraHeight = finalHeight;
    let effectiveHeight = finalHeight;
    if (isPortraitMode) {
      cameraHeight = finalHeight * 3;  // 1500px for zoom
      effectiveHeight = finalHeight;    // 500px for positioning
    }
    
    Logger.log('MmdModelScene', `Restoring position (${x}, ${y}) with size ${finalWidth}x${finalHeight}, preset: ${presetToUse}, offset:`, offset);
    positionManager.setPositionPixels(x, y, finalWidth, cameraHeight, effectiveHeight, offset);
  } else {
    // Use preset
    Logger.log('MmdModelScene', 'Using preset:', actualPreset);
    positionManager.initialize(actualPreset);
  }

  Logger.log('MmdModelScene', 'PositionManager initialized');
  
  // Notify AnimationManager about PositionManager (for picking box creation)
  animationManager.setPositionManager(positionManager);

  // ========================================
  // POST-PROCESSING PIPELINE
  // ========================================
  
  const defaultPipeline = new DefaultRenderingPipeline("default", true, scene);
  defaultPipeline.samples = 4;
  defaultPipeline.bloomEnabled = true;
  defaultPipeline.chromaticAberrationEnabled = true;
  defaultPipeline.chromaticAberration.aberrationAmount = 1;
  defaultPipeline.depthOfFieldEnabled = false;
  defaultPipeline.fxaaEnabled = true;
  defaultPipeline.imageProcessingEnabled = true;
  defaultPipeline.imageProcessing.toneMappingEnabled = true;
  defaultPipeline.imageProcessing.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  defaultPipeline.imageProcessing.vignetteWeight = 0.5;
  defaultPipeline.imageProcessing.vignetteStretch = 0.5;
  defaultPipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
  defaultPipeline.imageProcessing.vignetteEnabled = true;

  // ========================================
  // CANVAS INTERACTION MANAGER
  // ========================================
  
  Logger.log('MmdModelScene', 'Initializing CanvasInteractionManager...');
  
  const interactionManager = new CanvasInteractionManager(scene, canvas, modelMesh);
  interactionManager.initialize();
  
  // Setup drag callbacks to work with PositionManager
  interactionManager.setDragCallbacks(
    // onDragStart
    (startX, startY) => {
      Logger.log('MmdModelScene', 'Drag started at', startX, startY);
    },
    // onDrag
    (deltaX, deltaY) => {
      const currentPos = positionManager.getPositionPixels();
      // Preserve two-height system during drag
      positionManager.setPositionPixels(
        currentPos.x + deltaX,
        currentPos.y + deltaY,
        currentPos.width,
        positionManager.modelHeightPx,
        positionManager.effectiveHeightPx,
        positionManager.offset
      );
    },
    // onDragEnd
    (endX, endY) => {
      Logger.log('MmdModelScene', 'Drag completed at', endX, endY);
    }
  );
  
  Logger.log('MmdModelScene', 'CanvasInteractionManager initialized');

  // ========================================
  // START ANIMATION
  // ========================================
  
  mmdRuntime.playAnimation();
  Logger.log('MmdModelScene', 'Animation playback started');

  // ========================================
  // SCENE METADATA (FOR EXTERNAL ACCESS)
  // ========================================
  
  // Expose managers via scene metadata for external control
  scene.metadata.animationManager = animationManager;
  scene.metadata.interactionManager = interactionManager;
  scene.metadata.modelMesh = modelMesh;
  scene.metadata.mmdModel = mmdModel;
  scene.metadata.mmdRuntime = mmdRuntime;
  scene.metadata.mmdCamera = mmdCamera;

  // ========================================
  // CLEANUP
  // ========================================
  
  // Cleanup on scene dispose
  scene.onDisposeObservable.add(() => {
    Logger.log('MmdModelScene', 'Scene disposing, cleaning up managers');
    animationManager.dispose();
    positionManager.dispose();
    interactionManager.dispose();
  });

  Logger.log('MmdModelScene', 'Scene build complete');
  Logger.log('MmdModelScene', '- AnimationManager accessible via scene.metadata.animationManager');
  Logger.log('MmdModelScene', '- PositionManager accessible via scene.metadata.positionManager');
  Logger.log('MmdModelScene', '- CanvasInteractionManager accessible via scene.metadata.interactionManager');
  Logger.log('MmdModelScene', '- Model accessible via scene.metadata.modelMesh and scene.metadata.mmdModel');

  // Call user's scene ready callback
  if (finalConfig.onSceneReady) {
    finalConfig.onSceneReady(scene);
  }

  return scene;
};
