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
// import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer"; // DISABLED - not needed without audio
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdPhysics } from "babylon-mmd/esm/Runtime/Physics/mmdPhysics";
// import { DisplayTimeFormat, MmdPlayerControl } from "babylon-mmd/esm/Runtime/Util/mmdPlayerControl"; // DISABLED - requires audio player
import { MmdCameraAutoFocus } from "./MmdCameraAutoFocus";
import { AnimationManager } from "./AnimationManager";

export const buildMmdCompositeScene = async (canvas, engine) => {
  SdefInjector.OverrideEngineCreateEffect(engine);

  const scene = new Scene(engine);
  // Transparent background - only model visible
  scene.clearColor = new Color4(0, 0, 0, 0); // RGBA with alpha = 0 (fully transparent)

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
  const orthoHeight = 12; // Adjust this to zoom in/out (virtual units visible vertically)
  const aspectRatio = engine.getAspectRatio(mmdCamera);
  
  mmdCamera.orthoTop = orthoHeight;
  mmdCamera.orthoBottom = -orthoHeight;
  mmdCamera.orthoLeft = -orthoHeight * aspectRatio;
  mmdCamera.orthoRight = orthoHeight * aspectRatio;

  // Set camera distance for orthographic view (MmdCamera uses distance property, not setPosition)
  mmdCamera.distance = -30; // Negative distance moves camera back
  mmdCamera.rotation.set(0, 0, 0); // Face forward

  // Handle window resize to maintain aspect ratio
  engine.onResizeObservable.add(() => {
    const newAspect = engine.getAspectRatio(mmdCamera);
    mmdCamera.orthoLeft = -orthoHeight * newAspect;
    mmdCamera.orthoRight = orthoHeight * newAspect;
  });

  // Create default ArcRotate camera
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

  let lastClickTime = -Infinity;
  canvas.onclick = () => {
    const currentTime = performance.now();
    if (500 < currentTime - lastClickTime) {
      lastClickTime = currentTime;
      return;
    }

    lastClickTime = -Infinity;

    if (scene.activeCamera === camera) {
      scene.activeCamera = mmdCamera;
    } else {
      scene.activeCamera = camera;
    }
  };

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
  const shadowGenerator = new ShadowGenerator(1024, directionalLight, true);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.forceBackFacesOnly = false;
  shadowGenerator.bias = 0.01;
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadowGenerator.frustumEdgeFalloff = 0.1;
  shadowGenerator.transparencyShadow = true;

  // Create ground
  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: 60, height: 60 },
    scene
  );
  ground.receiveShadows = true;

  // Initialize MMD Runtime
  const mmdRuntime = new MmdRuntime(scene, new MmdPhysics(scene));
  mmdRuntime.loggingEnabled = true;
  mmdRuntime.register(scene);

  // Audio player - DISABLED for now (causes runtime to stop when audio ends)
  // TODO: Re-enable when you need audio synchronization
  // const audioPlayer = new StreamAudioPlayer(scene);
  // audioPlayer.preservesPitch = false;
  // audioPlayer.source = "res/private_test/motion/song.mp3";
  // mmdRuntime.setAudioPlayer(audioPlayer);

  // Set initial animation duration - will be dynamically updated by AnimationManager
  // Start with a reasonable default (10 minutes = 18000 frames at 30fps)
  mmdRuntime.setManualAnimationDuration(18000);
  
  // Start playing the animation
  mmdRuntime.playAnimation();

  // Player control - DISABLED (requires audio player)
  // const playerControl = new MmdPlayerControl(scene, mmdRuntime, audioPlayer);
  // playerControl.displayTimeFormat = DisplayTimeFormat.Frames;
  // playerControl.showPlayerControl();

  // BVMD Loader
  const bvmdLoader = new BvmdLoader(scene);
  bvmdLoader.loggingEnabled = false;

  // Material builder
  const materialBuilder = new MmdStandardMaterialBuilder();
  materialBuilder.loadOutlineRenderingProperties = () => {
    /* do nothing */
  };

  // Load camera animation
  const cameraAnimation = await bvmdLoader.loadAsync(
    "camera",
    "res/private_test/motion/2.bvmd"
  );

  // Load model
  const result = await LoadAssetContainerAsync(
    "res/private_test/model/1.bpmx",
    scene,
    {
      pluginOptions: {
        mmdmodel: {
          materialBuilder: materialBuilder,
          boundingBoxMargin: 60,
          loggingEnabled: true,
        },
      },
    }
  );
  result.addAllToScene();
  const modelMesh = result.meshes[0];

  // Initialize physics
  const havokInstance = await havokPhysics();
  const havokPlugin = new HavokPlugin(true, havokInstance);
  scene.enablePhysics(new Vector3(0, -9.8 * 10, 0), havokPlugin);

  // Setup camera animation
  mmdRuntime.setCamera(mmdCamera);
  mmdCamera.addAnimation(cameraAnimation);
  mmdCamera.setAnimation("camera");

  // Setup model shadows
  for (const mesh of modelMesh.metadata.meshes) {
    mesh.receiveShadows = true;
    shadowGenerator.addShadowCaster(mesh, false);
  }
  modelMesh.parent = mmdRoot;

  // Create MMD model
  const mmdModel = mmdRuntime.createMmdModel(modelMesh, {
    buildPhysics: true,
  });

  // ========================================
  // ANIMATION MANAGER INTEGRATION
  // ========================================
  
  // Create AnimationManager with all dependencies
  const animationManager = new AnimationManager(
    scene,
    mmdRuntime,
    mmdModel,
    bvmdLoader
  );

  // Initialize animation system (loads first idle animation)
  await animationManager.initialize();

  console.log('[Scene] AnimationManager initialized and running');

  // ========================================
  // END ANIMATION MANAGER INTEGRATION
  // ========================================

  // Post-processing pipeline
  const defaultPipeline = new DefaultRenderingPipeline("default", true, scene);
  defaultPipeline.samples = 4;
  defaultPipeline.bloomEnabled = true;
  defaultPipeline.chromaticAberrationEnabled = true;
  defaultPipeline.chromaticAberration.aberrationAmount = 1;
  defaultPipeline.depthOfFieldEnabled = false;
  // defaultPipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.High;
  defaultPipeline.fxaaEnabled = true;
  defaultPipeline.imageProcessingEnabled = true;
  defaultPipeline.imageProcessing.toneMappingEnabled = true;
  defaultPipeline.imageProcessing.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  defaultPipeline.imageProcessing.vignetteWeight = 0.5;
  defaultPipeline.imageProcessing.vignetteStretch = 0.5;
  defaultPipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
  defaultPipeline.imageProcessing.vignetteEnabled = true;

  const mmdCameraAutoFocus = new MmdCameraAutoFocus(mmdCamera, defaultPipeline);
  mmdCameraAutoFocus.setTarget(mmdModel);
  mmdCameraAutoFocus.register(scene);

  // Handle depth renderer
  // for (const depthRenderer of Object.values(scene._depthRenderer)) {
  //   depthRenderer.forceDepthWriteTransparentMeshes = true;
  //   engine.onResizeObservable.add(() =>
  //     depthRenderer.getDepthMap().resize({
  //       width: engine.getRenderWidth(),
  //       height: engine.getRenderHeight(),
  //     })
  //   );
  // }

  // Start animation
  mmdRuntime.playAnimation();

  // Expose AnimationManager via scene metadata for external control
  scene.metadata = scene.metadata || {};
  scene.metadata.animationManager = animationManager;

  console.log('[Scene] Scene build complete, AnimationManager accessible via scene.metadata.animationManager');

  return scene;
};
