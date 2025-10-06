/**
 * AnimationManager - Core animation orchestration for Virtual Assistant
 * 
 * Responsibilities:
 * 1. Load animations on-demand from AnimationRegistry with caching
 * 2. Manage composite animation spans with smooth transitions
 * 3. Handle state machine (IDLE, BUSY, SPEAKING, CELEBRATING)
 * 4. Dynamic span lifecycle (add ahead, cleanup old)
 * 5. Integrate with onBeforeRenderObservable for runtime control
 * 
 * CRITICAL: Preserves working smooth transition settings:
 * - 30 frame transitions (1 second at 30fps)
 * - Bezier curve easing (0.25, 0.1, 0.75, 0.9)
 */

import { BezierCurveEase } from "@babylonjs/core/Animations/easing";
import { MmdAnimationSpan, MmdCompositeAnimation } from "babylon-mmd/esm/Runtime/Animation/mmdCompositeAnimation";
import {
  AssistantState,
  StateBehavior,
  TransitionSettings,
  getRandomAnimation,
  getAnimationsByCategory,
  isValidTransition,
} from "../../config/animationConfig";

export class AnimationManager {
  /**
   * Create AnimationManager instance
   * @param {Scene} scene - Babylon.js scene
   * @param {MmdRuntime} mmdRuntime - MMD runtime instance
   * @param {MmdModel} mmdModel - MMD model instance
   * @param {BvmdLoader} bvmdLoader - BVMD loader instance for loading animations
   */
  constructor(scene, mmdRuntime, mmdModel, bvmdLoader) {
    // Core dependencies
    this.scene = scene;
    this.mmdRuntime = mmdRuntime;
    this.mmdModel = mmdModel;
    this.bvmdLoader = bvmdLoader;

    // Animation loading cache
    this.loadedAnimations = new Map(); // filePath -> loaded animation
    this.loadingPromises = new Map(); // filePath -> Promise (prevent duplicate loads)

    // State management
    this.currentState = AssistantState.IDLE;
    this.previousState = null;

    // Composite animation
    this.compositeAnimation = null;
    
    // Dynamic span management (like experimental code)
    this.currentCycle = 0;
    this.lastAddedCycle = -1;
    this.firstActiveCycle = 0;
    this.maxCachedCycles = 3; // Keep only 3 cycles in memory
    this.spanMap = new Map(); // cycle number -> [spans]
    this.animationStartFrame = 0; // Track when current animation started (CRITICAL for cycle calculation)
    this.oldSpansToRemove = null; // Old spans from previous animation to remove after transition
    this.oldSpansRemovalFrame = null; // Frame at which to remove old spans

    // Current animation tracking
    this.currentAnimationConfig = null;
    this.currentLoadedAnimation = null;
    this.currentAnimationDuration = 0;
    this.isFirstAnimationEver = true; // Track if this is the very first animation (no blending needed)

    // Idle animation switching
    this.idleSwitchTimer = 0;
    this.idleSwitchInterval = 10000; // 10 seconds (will use from StateBehavior)

    // Observable handle for cleanup
    this.renderObserver = null;

    // Initialization flag
    this.isInitialized = false;

    console.log('[AnimationManager] Created');
  }

  /**
   * Initialize the animation system
   * Loads first idle animation and sets up composite animation
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn('[AnimationManager] Already initialized');
      return;
    }

    console.log('[AnimationManager] Initializing...');

    // Create composite animation
    this.compositeAnimation = new MmdCompositeAnimation('assistantComposite');
    
    // Add composite animation to model
    this.mmdModel.addAnimation(this.compositeAnimation);
    this.mmdModel.setAnimation('assistantComposite');

    // Load and start first idle animation
    await this.transitionToState(AssistantState.IDLE);

    // Register onBeforeRender observer for dynamic span management
    this.registerRenderObserver();

    this.isInitialized = true;
    console.log('[AnimationManager] Initialized successfully');
  }

  /**
   * Load animation on-demand with deduplication
   * Multiple calls to same filePath return same cached animation
   * @param {Object} animationConfig - Animation config from AnimationRegistry
   * @returns {Promise<Animation>} Loaded animation
   */
  async loadAnimation(animationConfig) {
    const { filePath, id, name } = animationConfig;

    // 1. Already loaded? Return cached
    if (this.loadedAnimations.has(filePath)) {
      console.log(`[AnimationManager] Using cached animation: ${name} (${filePath})`);
      return this.loadedAnimations.get(filePath);
    }

    // 2. Currently loading? Wait for existing promise
    if (this.loadingPromises.has(filePath)) {
      console.log(`[AnimationManager] Waiting for in-flight load: ${name} (${filePath})`);
      return await this.loadingPromises.get(filePath);
    }

    // 3. Load for first time
    console.log(`[AnimationManager] Loading animation: ${name} (${filePath})`);
    const loadPromise = this.bvmdLoader.loadAsync(id, filePath);

    // Store promise to prevent duplicate loads
    this.loadingPromises.set(filePath, loadPromise);

    try {
      const animation = await loadPromise;

      // Cache the loaded animation
      this.loadedAnimations.set(filePath, animation);

      console.log(`[AnimationManager] Loaded: ${name}, duration: ${animation.endFrame} frames`);

      return animation;
    } catch (error) {
      console.error(`[AnimationManager] Failed to load animation: ${name}`, error);
      throw error;
    } finally {
      // Clean up promise tracker
      this.loadingPromises.delete(filePath);
    }
  }

  /**
   * Transition to a new state
   * Validates transition, selects appropriate animation, and starts playback
   * @param {string} newState - Target state from AssistantState
   */
  async transitionToState(newState) {
    // Validate transition
    if (this.currentState !== newState && !isValidTransition(this.currentState, newState)) {
      console.warn(`[AnimationManager] Invalid transition: ${this.currentState} -> ${newState}`);
      return;
    }

    console.log(`[AnimationManager] State transition: ${this.currentState} -> ${newState}`);

    this.previousState = this.currentState;
    this.currentState = newState;

    // Get state behavior
    const behavior = StateBehavior[newState];
    if (!behavior) {
      console.error(`[AnimationManager] No behavior defined for state: ${newState}`);
      return;
    }

    // Select animation based on state behavior
    let animationConfig = null;

    if (behavior.randomSelection) {
      // Randomly pick from allowed animations
      const allowedCategories = behavior.allowedAnimations;
      const randomCategory = allowedCategories[Math.floor(Math.random() * allowedCategories.length)];
      animationConfig = getRandomAnimation(randomCategory);
    } else {
      // Use first animation from first allowed category
      const firstCategory = behavior.allowedAnimations[0];
      const animations = getAnimationsByCategory(firstCategory);
      animationConfig = animations.length > 0 ? animations[0] : null;
    }

    if (!animationConfig) {
      console.error(`[AnimationManager] No animation found for state: ${newState}`);
      return;
    }

    // Load and play animation
    await this.playAnimation(animationConfig, behavior);
  }

  /**
   * Play a specific animation
   * @param {Object} animationConfig - Animation config from registry
   * @param {Object} stateBehavior - State behavior config (optional, uses current state if not provided)
   */
  async playAnimation(animationConfig, stateBehavior = null) {
    const behavior = stateBehavior || StateBehavior[this.currentState];
    
    console.log(`[AnimationManager] Playing animation: ${animationConfig.name}`);

    // Load animation
    const loadedAnimation = await this.loadAnimation(animationConfig);

    // Store current animation info
    this.currentAnimationConfig = animationConfig;
    this.currentLoadedAnimation = loadedAnimation;
    this.currentAnimationDuration = loadedAnimation.endFrame;

    // CRITICAL: Handle transition between different animations
    // Keep old spans active during transition for smooth blending
    const oldSpans = Array.from(this.spanMap.values()).flat();
    
    if (oldSpans.length > 0) {
      console.log(`[AnimationManager] Keeping ${oldSpans.length} old spans for transition blending`);
      
      // Apply ease-out to old spans
      // CRITICAL: We need to truncate the old span's endFrame to the current position + transition duration
      // This makes the ease-out start IMMEDIATELY from the current playback position
      const transitionFrames = animationConfig.transitionFrames || TransitionSettings.DEFAULT_TRANSITION_FRAMES;
      const currentTimelineFrame = this.mmdRuntime.currentFrameTime;
      
      for (const span of oldSpans) {
        // Calculate where we are in this span's playback
        const spanAnimationFrame = currentTimelineFrame - span.offset;
        
        // Store the original endFrame before truncation
        const originalEndFrame = span.endFrame;
        
        // Truncate the span to end at current position + transition duration
        // BUT ensure we don't go beyond the animation's actual end
        const targetEndFrame = spanAnimationFrame + transitionFrames;
        span.endFrame = Math.min(originalEndFrame, targetEndFrame);
        
        // If we're already past the span's end, it will be removed anyway
        // Set easeOutFrameTime to the remaining frames
        const remainingFrames = span.endFrame - spanAnimationFrame;
        span.easeOutFrameTime = Math.max(1, remainingFrames); // At least 1 frame
        
        span.easingFunction = new BezierCurveEase(
          TransitionSettings.DEFAULT_EASING_CURVE.x1,
          TransitionSettings.DEFAULT_EASING_CURVE.y1,
          TransitionSettings.DEFAULT_EASING_CURVE.x2,
          TransitionSettings.DEFAULT_EASING_CURVE.y2
        );
        
        console.log(`[AnimationManager] Old span at offset ${span.offset}: originalEnd=${originalEndFrame}, currentFrame=${spanAnimationFrame.toFixed(2)}, truncatedEnd=${span.endFrame}, easeOut=${span.easeOutFrameTime}`);
      }
      
      // Store old spans for delayed cleanup
      this.oldSpansToRemove = oldSpans;
      this.oldSpansRemovalFrame = this.mmdRuntime.currentFrameTime + transitionFrames;
    }
    
    // Reset cycle tracking for new animation
    this.currentCycle = 0;
    this.lastAddedCycle = -1;
    this.firstActiveCycle = 0;
    this.spanMap.clear(); // Clear the map so new cycles start fresh
    this.animationStartFrame = this.mmdRuntime.currentFrameTime; // CRITICAL: Store when this animation started!
    
    // Dynamically set runtime duration based on animation
    // Set initial duration to support at least 10 cycles (can be extended later)
    const loopTransition = animationConfig.loopTransition || false;
    const transitionFrames = animationConfig.transitionFrames || TransitionSettings.DEFAULT_TRANSITION_FRAMES;
    const effectiveDuration = loopTransition ? (this.currentAnimationDuration - transitionFrames) : this.currentAnimationDuration;
    
    // Calculate duration for multiple cycles with buffer
    const initialCycles = 10; // Start with buffer for 10 cycles
    const requiredDuration = this.animationStartFrame + (effectiveDuration * initialCycles);
    
    // Only update if we need more duration
    if (requiredDuration > this.mmdRuntime.animationFrameTimeDuration) {
      this.mmdRuntime.setManualAnimationDuration(requiredDuration);
      console.log(`[AnimationManager] Set runtime duration to ${requiredDuration} frames (${initialCycles} cycles buffer from frame ${this.animationStartFrame})`);
    }
    
    // Reset idle switch timer
    this.idleSwitchTimer = 0;
    if (behavior.autoSwitchInterval) {
      this.idleSwitchInterval = behavior.autoSwitchInterval;
    }

    // Add first cycle - it will ease in smoothly, overlapping with old animation's ease-out
    this.addNextCycle();
    
    // Mark that we've started at least one animation (for smooth transitions)
    this.isFirstAnimationEver = false;

    console.log(`[AnimationManager] Animation started: ${animationConfig.name}, duration: ${this.currentAnimationDuration} frames`);
  }

  /**
   * Add next animation cycle with smooth transitions
   * For single looping animations, just add the next loop at the end
   * With loopTransition: true, creates smooth overlap between cycles
   */
  addNextCycle() {
    if (!this.currentLoadedAnimation || !this.currentAnimationConfig) {
      console.warn('[AnimationManager] No current animation to add cycle');
      return;
    }

    const cycle = this.lastAddedCycle + 1;
    const duration = this.currentAnimationDuration;
    const transitionFrames = this.currentAnimationConfig.transitionFrames || TransitionSettings.DEFAULT_TRANSITION_FRAMES;
    const loopTransition = this.currentAnimationConfig.loopTransition || false;

    // Calculate cycle start time
    // With loopTransition: overlap by transitionFrames to create smooth blend
    // Without loopTransition: cycles play back-to-back with no overlap
    let cycleStartTime;
    if (loopTransition) {
      // Each cycle advances by (duration - transitionFrames) to create overlap
      // Cycle 0: 0
      // Cycle 1: 0 + (200-30)*1 = 170
      // Cycle 2: 0 + (200-30)*2 = 340
      // Cycle N: 0 + (200-30)*N
      const effectiveDuration = duration - transitionFrames;
      cycleStartTime = this.animationStartFrame + (cycle * effectiveDuration);
    } else {
      // No overlap - exact multiples of duration
      cycleStartTime = this.animationStartFrame + (cycle * duration);
    }

    console.log(`[AnimationManager] Adding cycle ${cycle} at frame ${cycleStartTime}, animation duration: ${duration} frames, loopTransition: ${loopTransition}`);

    // Create animation span
    const span = new MmdAnimationSpan(
      this.currentLoadedAnimation,
      undefined, // start frame (use animation default)
      undefined, // end frame (use animation default)
      cycleStartTime, // offset in timeline
      1 // playback rate
    );

    // Apply easing based on context
    if (cycle === 0 && !this.isFirstAnimationEver) {
      // First cycle of NEW animation: ease in from previous animation
      console.log(`[AnimationManager] Applying ease-in to cycle 0 (animation switch transition)`);
      span.easeInFrameTime = transitionFrames;
      span.easingFunction = new BezierCurveEase(
        TransitionSettings.DEFAULT_EASING_CURVE.x1,
        TransitionSettings.DEFAULT_EASING_CURVE.y1,
        TransitionSettings.DEFAULT_EASING_CURVE.x2,
        TransitionSettings.DEFAULT_EASING_CURVE.y2
      );
    } else if (loopTransition && cycle > 0) {
      // Loop transition: blend between cycles
      // Ease in from previous cycle
      console.log(`[AnimationManager] Applying ease-in to cycle ${cycle} (loop transition)`);
      span.easeInFrameTime = transitionFrames;
      span.easingFunction = new BezierCurveEase(
        TransitionSettings.DEFAULT_EASING_CURVE.x1,
        TransitionSettings.DEFAULT_EASING_CURVE.y1,
        TransitionSettings.DEFAULT_EASING_CURVE.x2,
        TransitionSettings.DEFAULT_EASING_CURVE.y2
      );
      
      // Also ease out the previous cycle (if it exists)
      const previousCycle = cycle - 1;
      if (this.spanMap.has(previousCycle)) {
        const previousSpans = this.spanMap.get(previousCycle);
        console.log(`[AnimationManager] Applying ease-out to ${previousSpans.length} spans from cycle ${previousCycle}`);
        for (const prevSpan of previousSpans) {
          prevSpan.easeOutFrameTime = transitionFrames;
          prevSpan.easingFunction = new BezierCurveEase(
            TransitionSettings.DEFAULT_EASING_CURVE.x1,
            TransitionSettings.DEFAULT_EASING_CURVE.y1,
            TransitionSettings.DEFAULT_EASING_CURVE.x2,
            TransitionSettings.DEFAULT_EASING_CURVE.y2
          );
        }
      }
    } else {
      console.log(`[AnimationManager] No easing applied to cycle ${cycle} (cycle=${cycle}, isFirst=${this.isFirstAnimationEver}, loopTransition=${loopTransition})`);
    }

    // Add span to composite animation
    this.compositeAnimation.addSpan(span);

    // Track span for this cycle
    this.spanMap.set(cycle, [span]);

    this.lastAddedCycle = cycle;
    
    // CRITICAL: Extend MMD runtime duration to cover the new cycle
    // The runtime duration is set to a large value in MmdCompositeScene.jsx (108000 frames = 1 hour)
    // This is sufficient for continuous looping animations managed by AnimationManager
    // If needed for very long sessions, we could dynamically extend it here:
    const cycleEndTime = cycleStartTime + duration;
    const requiredDuration = cycleEndTime + (duration * 2); // Add buffer for next 2 cycles
    
    if (requiredDuration > this.mmdRuntime.animationFrameTimeDuration) {
      this.mmdRuntime.setManualAnimationDuration(requiredDuration);
      console.log(`[AnimationManager] Extended runtime duration to ${requiredDuration} frames (cycle ${cycle} ends at ${cycleEndTime})`);
    }

    console.log(`[AnimationManager] Cycle ${cycle} added. Active cycles: ${this.firstActiveCycle} to ${this.lastAddedCycle}`);
  }

  /**
   * Clean up old cycles to prevent memory buildup
   * Now called from onBeforeRender with proper cycle calculation
   */
  cleanupOldCycles(cycleToRemove) {
    if (cycleToRemove >= this.firstActiveCycle && this.spanMap.has(cycleToRemove)) {
      const spansToRemove = this.spanMap.get(cycleToRemove);

      for (const span of spansToRemove) {
        this.compositeAnimation.removeSpan(span);
      }

      this.spanMap.delete(cycleToRemove);
      this.firstActiveCycle = cycleToRemove + 1;

      console.log(`[AnimationManager] Cleaned up cycle ${cycleToRemove}. Active cycles: ${this.firstActiveCycle} to ${this.lastAddedCycle}`);
    }
  }

  /**
   * Clear all spans (used when switching animations)
   */
  clearAllSpans() {
    console.log('[AnimationManager] Clearing all spans');

    // Remove all spans
    for (const spans of this.spanMap.values()) {
      for (const span of spans) {
        this.compositeAnimation.removeSpan(span);
      }
    }

    // Clear tracking
    this.spanMap.clear();
    this.currentCycle = 0;
    this.lastAddedCycle = -1;
    this.firstActiveCycle = 0;
  }

  /**
   * Register onBeforeRenderObservable for dynamic span management
   * This is the core runtime loop
   */
  registerRenderObserver() {
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.onBeforeRender();
    });

    console.log('[AnimationManager] Render observer registered');
  }

  /**
   * Called every frame - handles dynamic span management
   * Uses EXACT logic from working experimental code
   */
  onBeforeRender() {
    if (!this.currentLoadedAnimation || !this.currentAnimationConfig) {
      return;
    }

    const absoluteFrame = this.mmdRuntime.currentFrameTime;
    
    // Check if we need to remove old spans from previous animation after transition
    if (this.oldSpansToRemove && absoluteFrame >= this.oldSpansRemovalFrame) {
      console.log(`[AnimationManager] Removing ${this.oldSpansToRemove.length} old spans after transition complete`);
      for (const span of this.oldSpansToRemove) {
        this.compositeAnimation.removeSpan(span);
      }
      this.oldSpansToRemove = null;
      this.oldSpansRemovalFrame = null;
    }
    
    // CRITICAL: Calculate frame RELATIVE to when this animation started!
    const currentFrame = absoluteFrame - this.animationStartFrame;
    const duration = this.currentAnimationDuration;
    const transitionFrames = this.currentAnimationConfig.transitionFrames || TransitionSettings.DEFAULT_TRANSITION_FRAMES;
    const loopTransition = this.currentAnimationConfig.loopTransition || false;
    
    // Cycle duration calculation
    // With loopTransition: effective cycle length is reduced by transition overlap
    // Without loopTransition: cycles are spaced at full duration
    const cycleDuration = loopTransition ? (duration - transitionFrames) : duration;

    // Calculate which cycle we're in (based on relative frame time)
    this.currentCycle = Math.floor(currentFrame / cycleDuration);
    
    // EXACT original logic: if we've entered a NEW cycle past the last added one, add the next
    // Use > not >= because we already added the initial cycle in playAnimation()
    if (this.currentCycle > this.lastAddedCycle) {
      console.log(`[AnimationManager] Frame: ${currentFrame.toFixed(2)}, Cycle: ${this.currentCycle}, LastAdded: ${this.lastAddedCycle}, Animation: "${this.currentAnimationConfig.name}" (${this.currentAnimationConfig.filePath}), Duration: ${duration} frames, LoopTransition: ${loopTransition}`);
      this.addNextCycle();
    }

    // Cleanup old cycles
    const cycleToRemove = this.currentCycle - this.maxCachedCycles;
    if (cycleToRemove >= this.firstActiveCycle && this.spanMap.has(cycleToRemove)) {
      const spansToRemove = this.spanMap.get(cycleToRemove);
      for (const span of spansToRemove) {
        this.compositeAnimation.removeSpan(span);
      }
      this.spanMap.delete(cycleToRemove);
      this.firstActiveCycle = cycleToRemove + 1;
      console.log(`[AnimationManager] Cleaned up cycle ${cycleToRemove}. Active cycles: ${this.firstActiveCycle} to ${this.lastAddedCycle}`);
    }

    // Handle idle animation auto-switching
    this.handleIdleAutoSwitch();
  }

  /**
   * Handle automatic idle animation switching for variety
   */
  handleIdleAutoSwitch() {
    const behavior = StateBehavior[this.currentState];
    
    if (this.currentState === AssistantState.IDLE && behavior.autoSwitch) {
      this.idleSwitchTimer += this.scene.getEngine().getDeltaTime();

      if (this.idleSwitchTimer >= this.idleSwitchInterval) {
        // Get all idle animations
        const idleAnimations = getAnimationsByCategory('idle');
        
        // Only switch if we have multiple idle animations
        if (idleAnimations.length <= 1) {
          console.log('[AnimationManager] Only one idle animation available, skipping auto-switch');
          this.idleSwitchTimer = 0;
          return;
        }
        
        // Select a DIFFERENT random idle animation
        let newAnimation = null;
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
          newAnimation = getRandomAnimation('idle');
          // Make sure it's different from current
          if (newAnimation && newAnimation.id !== this.currentAnimationConfig?.id) {
            break;
          }
          attempts++;
        }
        
        if (newAnimation && newAnimation.id !== this.currentAnimationConfig?.id) {
          console.log(`[AnimationManager] Auto-switching idle animation: ${this.currentAnimationConfig?.name} -> ${newAnimation.name}`);
          this.idleSwitchTimer = 0;
          
          // Play the new animation directly (already in IDLE state)
          this.playAnimation(newAnimation, behavior);
        } else {
          console.log('[AnimationManager] Could not find different idle animation, skipping auto-switch');
          this.idleSwitchTimer = 0;
        }
      }
    } else {
      // Reset timer if not in idle
      this.idleSwitchTimer = 0;
    }
  }

  /**
   * Get current state
   * @returns {string} Current assistant state
   */
  getCurrentState() {
    return this.currentState;
  }

  /**
   * Get current animation info
   * @returns {Object} Current animation config and loaded animation
   */
  getCurrentAnimation() {
    return {
      config: this.currentAnimationConfig,
      loaded: this.currentLoadedAnimation,
      duration: this.currentAnimationDuration,
    };
  }

  /**
   * Check if animation is currently playing
   * @returns {boolean} True if animation is active
   */
  isPlaying() {
    return this.mmdRuntime.isAnimationPlaying;
  }

  /**
   * Get current playback time in frames
   * @returns {number} Current frame
   */
  getCurrentFrame() {
    return this.mmdRuntime.currentFrameTime;
  }

  /**
   * Trigger specific action (for external control)
   * @param {string} action - Action name: 'think', 'walk', 'celebrate', 'speak'
   */
  async triggerAction(action) {
    console.log(`[AnimationManager] Triggering action: ${action}`);

    switch (action) {
      case 'think':
        await this.transitionToState(AssistantState.BUSY);
        break;
      
      case 'walk':
        await this.transitionToState(AssistantState.BUSY);
        break;
      
      case 'celebrate':
        await this.transitionToState(AssistantState.CELEBRATING);
        break;
      
      case 'speak':
        await this.transitionToState(AssistantState.SPEAKING);
        break;
      
      default:
        console.warn(`[AnimationManager] Unknown action: ${action}`);
    }
  }

  /**
   * Return to idle state
   */
  async returnToIdle() {
    console.log('[AnimationManager] Returning to idle');
    await this.transitionToState(AssistantState.IDLE);
  }

  /**
   * Dispose and cleanup
   */
  dispose() {
    console.log('[AnimationManager] Disposing...');

    // Remove render observer
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }

    // Clear all spans
    this.clearAllSpans();

    // Clear caches
    this.loadedAnimations.clear();
    this.loadingPromises.clear();

    console.log('[AnimationManager] Disposed');
  }
}

export default AnimationManager;
