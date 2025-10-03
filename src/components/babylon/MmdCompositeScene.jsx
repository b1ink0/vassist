import "@babylonjs/core/Loading/loadingScreen";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "babylon-mmd/esm/Loader/Optimized/bpmxLoader";
import "babylon-mmd/esm/Runtime/Animation/mmdCompositeRuntimeCameraAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdCompositeRuntimeModelAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation";

import { BezierCurveEase } from "@babylonjs/core/Animations/easing";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect";
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
import {
  MmdAnimationSpan,
  MmdCompositeAnimation,
} from "babylon-mmd/esm/Runtime/Animation/mmdCompositeAnimation";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdPhysics } from "babylon-mmd/esm/Runtime/Physics/mmdPhysics";
import {
  DisplayTimeFormat,
  MmdPlayerControl,
} from "babylon-mmd/esm/Runtime/Util/mmdPlayerControl";
import { MmdCameraAutoFocus } from "./MmdCameraAutoFocus";

export const buildMmdCompositeScene = async (canvas, engine) => {
  SdefInjector.OverrideEngineCreateEffect(engine);

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.95, 0.95, 0.95, 1.0);

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

  // Audio player
  const audioPlayer = new StreamAudioPlayer(scene);
  audioPlayer.preservesPitch = false;
  audioPlayer.source = "res/private_test/motion/song.mp3";
  mmdRuntime.setAudioPlayer(audioPlayer);

  mmdRuntime.playAnimation();

  // Player control
  const playerControl = new MmdPlayerControl(scene, mmdRuntime, audioPlayer);
  playerControl.displayTimeFormat = DisplayTimeFormat.Frames;
  playerControl.showPlayerControl();

  // BVMD Loader
  const bvmdLoader = new BvmdLoader(scene);
  bvmdLoader.loggingEnabled = true;

  // Material builder
  const materialBuilder = new MmdStandardMaterialBuilder();
  materialBuilder.loadOutlineRenderingProperties = () => {
    /* do nothing */
  };

  // Load assets in parallel

  // Load animations
  const mmdAnimation1 = await bvmdLoader.loadAsync(
    "motion1",
    "res/private_test/motion/1.bvmd"
  );

  const mmdAnimation2 = await bvmdLoader.loadAsync(
    "motion2",
    "res/private_test/motion/2.bvmd"
  );

  const cameraAnimation = await bvmdLoader.loadAsync(
    "camera",
    "res/private_test/motion/2.bvmd"
  );

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

  // Create composite animation
  const compositeAnimation = new MmdCompositeAnimation("composite");
  const jogDuration = mmdAnimation1.endFrame;
  const walkDuration = mmdAnimation2.endFrame;
  const transitionDuration = 30;

  console.log(`Jog duration: ${jogDuration} frames`);
  console.log(`Walk duration: ${walkDuration} frames`);
  console.log(`Transition duration: ${transitionDuration} frames`);

  // Track current state
  let currentCycle = 0;
  let lastAddedCycle = -1;
  let firstActiveCycle = 0;
  const maxCachedCycles = 3; // Keep only 3 cycles in memory at a time
  const spanMap = new Map(); // Track spans by cycle number

  // Function to add next animation cycle
  const addNextCycle = () => {
    const cycle = lastAddedCycle + 1;
    const cycleStartTime = cycle * (jogDuration + walkDuration - transitionDuration);

    console.log(`Adding cycle ${cycle} at frame ${cycleStartTime}`);

    // Jog animation span
    const jogStart = cycleStartTime;
    const jogSpan = new MmdAnimationSpan(
      mmdAnimation1,
      undefined,
      undefined,
      jogStart,
      1
    );
    if (cycle > 0) {
      jogSpan.easeInFrameTime = transitionDuration;
    }
    jogSpan.easeOutFrameTime = transitionDuration;
    jogSpan.easingFunction = new BezierCurveEase(0.25, 0.1, 0.75, 0.9);
    compositeAnimation.addSpan(jogSpan);

    // Walk animation span
    const walkStart = cycleStartTime + jogDuration - transitionDuration;
    const walkSpan = new MmdAnimationSpan(
      mmdAnimation2,
      undefined,
      undefined,
      walkStart,
      1
    );
    walkSpan.easeInFrameTime = transitionDuration;
    walkSpan.easeOutFrameTime = transitionDuration;
    walkSpan.easingFunction = new BezierCurveEase(0.25, 0.1, 0.75, 0.9);
    compositeAnimation.addSpan(walkSpan);

    // Store spans for this cycle
    spanMap.set(cycle, [jogSpan, walkSpan]);

    lastAddedCycle = cycle;
  };

  // Function to remove old cycles to prevent memory buildup
  const cleanupOldCycles = () => {
    // Remove cycles that are more than maxCachedCycles behind the current cycle
    const cycleToRemove = currentCycle - maxCachedCycles;
    
    if (cycleToRemove >= firstActiveCycle && spanMap.has(cycleToRemove)) {
      const spansToRemove = spanMap.get(cycleToRemove);
      
      for (const span of spansToRemove) {
        compositeAnimation.removeSpan(span);
      }
      
      spanMap.delete(cycleToRemove);
      firstActiveCycle = cycleToRemove + 1;
      
      console.log(`Cleaned up cycle ${cycleToRemove}. Active cycles: ${firstActiveCycle} to ${lastAddedCycle}`);
    }
  };

  // Add first cycle to start
  addNextCycle();

  mmdModel.addAnimation(compositeAnimation);
  mmdModel.setAnimation("composite");

  // Monitor animation and add more cycles as needed
  scene.onBeforeRenderObservable.add(() => {
    const currentFrame = mmdRuntime.currentFrameTime;
    const cycleDuration = jogDuration + walkDuration - transitionDuration;
    
    // Calculate which cycle we're in
    currentCycle = Math.floor(currentFrame / cycleDuration);
    
    // If we're in the last added cycle, add the next one
    if (currentCycle >= lastAddedCycle) {
      console.log(`Current frame: ${currentFrame}, Current cycle: ${currentCycle}, Adding next cycle`);
      addNextCycle();
    }

    // Cleanup old cycles to prevent memory buildup
    cleanupOldCycles();
  });

  // Post-processing pipeline
  const defaultPipeline = new DefaultRenderingPipeline("default", true, scene);
  defaultPipeline.samples = 4;
  defaultPipeline.bloomEnabled = true;
  defaultPipeline.chromaticAberrationEnabled = true;
  defaultPipeline.chromaticAberration.aberrationAmount = 1;
  defaultPipeline.depthOfFieldEnabled = true;
  defaultPipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.High;
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
  for (const depthRenderer of Object.values(scene._depthRenderer)) {
    depthRenderer.forceDepthWriteTransparentMeshes = true;
    engine.onResizeObservable.add(() =>
      depthRenderer.getDepthMap().resize({
        width: engine.getRenderWidth(),
        height: engine.getRenderHeight(),
      })
    );
  }

  // Start animation
  mmdRuntime.playAnimation();

  return scene;
};
