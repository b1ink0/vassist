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
  getAnimationsByName,
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

    // Composite animation mode
    this.compositeMode = false; // Track if we're in composite mode
    this.compositeConfig = null; // Store composite configuration (anim1, anim2, weight, delay)

    // Transition tracking
    this._isTransitioning = false; // Prevent multiple auto-return triggers

    // Idle animation switching
    this.idleSwitchTimer = 0;
    this.idleSwitchInterval = 10000; // 10 seconds (will use from StateBehavior)
    this.lastSwitchFrame = null; // Track frame when last switch happened (prevent infinite loop)

    // Observable handle for cleanup
    this.renderObserver = null;

    // Initialization flag
    this.isInitialized = false;
    
    // Visibility change handling
    this.visibilityChangeHandler = null;

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
    
    // Register visibility change handler to pause/resume on tab switch
    this.registerVisibilityHandler();

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
  async transitionToState(newState, customBehavior = null, customAnimation = null) {
    console.log(`[AnimationManager] [TRANSITION START] ${this.currentState} -> ${newState}`);
    
    // Validate transition
    if (this.currentState !== newState && !isValidTransition(this.currentState, newState)) {
      console.warn(`[AnimationManager] [TRANSITION INVALID] ${this.currentState} -> ${newState}`);
      return;
    }

    this.previousState = this.currentState;
    this.currentState = newState;

    // Use custom behavior if provided, otherwise use state behavior
    const behavior = customBehavior || StateBehavior[newState];
    if (!behavior) {
      console.error(`[AnimationManager] [TRANSITION ERROR] No behavior defined for state: ${newState}`);
      return;
    }

    // Use custom animation if provided, otherwise select based on behavior
    let animationConfig = customAnimation;

    if (!animationConfig) {
      if (behavior.randomSelection) {
        // Randomly pick from allowed animations
        const allowedCategories = behavior.allowedAnimations;
        const randomCategory = allowedCategories[Math.floor(Math.random() * allowedCategories.length)];
        animationConfig = getRandomAnimation(randomCategory);
        console.log(`[AnimationManager] [TRANSITION] Random selection from ${randomCategory}: ${animationConfig?.name}`);
      } else {
        // Use first animation from first allowed category
        const firstCategory = behavior.allowedAnimations[0];
        const animations = getAnimationsByCategory(firstCategory);
        animationConfig = animations.length > 0 ? animations[0] : null;
      }
    }

    if (!animationConfig) {
      console.error(`[AnimationManager] [TRANSITION ERROR] No animation found for state: ${newState}`);
      return;
    }

    console.log(`[AnimationManager] [TRANSITION] Loading animation: ${animationConfig.name}`);
    
    // Load and play animation
    await this.playAnimation(animationConfig, behavior);
    
    console.log(`[AnimationManager] [TRANSITION END] Animation loaded and playing: ${animationConfig.name}`);
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
    
    // Store animation info
    this.currentAnimationConfig = animationConfig;
    this.currentLoadedAnimation = loadedAnimation;
    this.currentAnimationDuration = loadedAnimation.endFrame;

    // CRITICAL: Handle transition between different animations
    // Keep old spans active during transition for smooth blending
    const allOldSpans = Array.from(this.spanMap.values()).flat();
    
    // Filter out spans that already have ease-out (they're from a previous transition)
    // We should remove those immediately, not keep them for another transition!
    const oldSpans = allOldSpans.filter(span => {
      if (span.easeOutFrameTime !== undefined && span.easeOutFrameTime > 0) {
        console.log(`[AnimationManager] Removing span at offset ${span.offset} - already easing out from previous transition`);
        this.compositeAnimation.removeSpan(span);
        return false; // Don't include in transition
      }
      return true; // Include in new transition
    });
    
    if (oldSpans.length > 0) {
      console.log(`[AnimationManager] Keeping ${oldSpans.length} old spans for transition blending`);
      
      // Apply ease-out to old spans
      // CRITICAL: We need to truncate the old span's endFrame to the current position + transition duration
      // This makes the ease-out start IMMEDIATELY from the current playback position
      const transitionFrames = animationConfig.transitionFrames || TransitionSettings.DEFAULT_TRANSITION_FRAMES;
      const currentTimelineFrame = this.mmdRuntime.currentFrameTime;
      
      // Track the latest end time across ALL old spans
      let latestSpanEndTime = currentTimelineFrame;
      
      for (const span of oldSpans) {
        // Calculate where we are in this span's playback
        const spanAnimationFrame = currentTimelineFrame - span.offset;
        
        // Store the original endFrame before truncation
        const originalEndFrame = span.endFrame;
        
        // CRITICAL: TRUNCATE span to end at current position + transition duration
        // This forces the animation to stop and ease out smoothly
        // DO NOT use Math.max - we want to CUT it short, not extend it!
        const targetEndFrame = spanAnimationFrame + transitionFrames;
        span.endFrame = targetEndFrame; // Force truncation for smooth transition
        
        // Set easeOutFrameTime to the transition duration
        span.easeOutFrameTime = transitionFrames;
        
        span.easingFunction = new BezierCurveEase(
          TransitionSettings.DEFAULT_EASING_CURVE.x1,
          TransitionSettings.DEFAULT_EASING_CURVE.y1,
          TransitionSettings.DEFAULT_EASING_CURVE.x2,
          TransitionSettings.DEFAULT_EASING_CURVE.y2
        );
        
        console.log(`[AnimationManager] Old span at offset ${span.offset}: originalEnd=${originalEndFrame}, currentFrame=${spanAnimationFrame.toFixed(2)}, newEnd=${span.endFrame}, easeOut=${span.easeOutFrameTime}`);
        
        // Track when this span will actually end
        const spanEndTime = span.offset + span.endFrame;
        latestSpanEndTime = Math.max(latestSpanEndTime, spanEndTime);
      }
      
      // Store old spans for delayed cleanup
      // CRITICAL: Remove AFTER the LAST span finishes, not based on arbitrary timing
      // Add 2 extra frames to ensure smooth transition finishes before cleanup
      this.oldSpansToRemove = oldSpans;
      this.oldSpansRemovalFrame = latestSpanEndTime + 2;
      
      console.log(`[AnimationManager] Scheduled old span removal at frame ${this.oldSpansRemovalFrame.toFixed(2)} (last span ends at ${latestSpanEndTime.toFixed(2)})`);
    
    }
    
    // Reset cycle tracking for new animation
    this.currentCycle = 0;
    this.lastAddedCycle = -1;
    this.firstActiveCycle = 0;
    this.spanMap.clear(); // Clear the map so new cycles start fresh
    this.animationStartFrame = this.mmdRuntime.currentFrameTime; // CRITICAL: Store when this animation started!
    
    // Dynamically set runtime duration based on animation
    const loopTransition = animationConfig.loopTransition || false;
    const transitionFrames = animationConfig.transitionFrames || TransitionSettings.DEFAULT_TRANSITION_FRAMES;
    const effectiveDuration = loopTransition ? (this.currentAnimationDuration - transitionFrames) : this.currentAnimationDuration;
    
    // For looping animations, set initial duration to support at least 10 cycles (can be extended later)
    // For non-looping (one-shot), just need enough for single playthrough
    const shouldLoop = animationConfig.loop !== false; // Default to true unless explicitly false
    const initialCycles = shouldLoop ? 10 : 1; // Single cycle for one-shot, 10 for looping
    const requiredDuration = this.animationStartFrame + (effectiveDuration * initialCycles);
    
    // Only update if we need more duration
    if (requiredDuration > this.mmdRuntime.animationFrameTimeDuration) {
      this.mmdRuntime.setManualAnimationDuration(requiredDuration);
      console.log(`[AnimationManager] Set runtime duration to ${requiredDuration} frames (${initialCycles} cycle${initialCycles > 1 ? 's' : ''} buffer from frame ${this.animationStartFrame})`);
    }
    
    // Reset idle switch timer
    this.idleSwitchTimer = 0;
    this.lastSwitchFrame = this.mmdRuntime.currentFrameTime; // Track when we last switched
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
    let cycleStartTime;
    if (loopTransition) {
      const effectiveDuration = duration - transitionFrames;
      cycleStartTime = this.animationStartFrame + (cycle * effectiveDuration);
    } else {
      cycleStartTime = this.animationStartFrame + (cycle * duration);
    }

    console.log(`[AnimationManager] Adding cycle ${cycle} at frame ${cycleStartTime}, duration: ${duration} frames`);

    const spans = [];
    
    // Check if we're in COMPOSITE state - create combined animation with body bones + mouth morphs
    if (this.currentState === AssistantState.COMPOSITE && this.compositePrimaryLoaded) {
      console.log(`[AnimationManager] Creating composite cycle ${cycle} with merged body+morph animation`);
      
      // First, add all stitched fill segments as separate spans (body animations)
      // ALSO: Extend the last segment to provide transition buffer for smooth ease-out
      const fillSpans = [];
      let actualOffset = cycleStartTime; // Track actual position in timeline
      
      for (let i = 0; i < this.compositeStitchedFillSpans.length; i++) {
        const segment = this.compositeStitchedFillSpans[i];
        const prevSegment = i > 0 ? this.compositeStitchedFillSpans[i - 1] : null;
        const isLastSegment = i === this.compositeStitchedFillSpans.length - 1;
        
        // Determine if this segment should ease in (blend with previous)
        const isSameAnimation = segment.previousConfig && segment.previousConfig.id === segment.config.id;
        const hasLoopTransition = segment.config.loopTransition !== false;
        // CRITICAL: Truncated segments ALWAYS need easing to prevent jumps
        const shouldApplyEasing = !isSameAnimation || hasLoopTransition || segment.isTruncated;
        
        // CRITICAL: For the last segment, extend the animation to provide transition buffer
        // This ensures the last body animation is still playing when transitioning to next state
        let segmentAnimation = segment.animation;
        if (isLastSegment) {
          // Clone the animation and extend its endFrame
          const extendedAnim = Object.assign(Object.create(Object.getPrototypeOf(segment.animation)), segment.animation);
          extendedAnim.endFrame = segment.animation.endFrame + transitionFrames;
          segmentAnimation = extendedAnim;
          console.log(`[AnimationManager] Extended last body segment: ${segment.animation.endFrame}f → ${extendedAnim.endFrame}f (added ${transitionFrames}f buffer)`);
        }
        
        // Create span at actual position (not overlapping position)
        const fillSpan = new MmdAnimationSpan(
          segmentAnimation,
          undefined,
          undefined,
          actualOffset, // Use actual position, not segment.startFrame
          1.0 // Full weight for body animations
        );
        
        console.log(`[AnimationManager] Segment ${i} (${segment.config.name}): offset=${actualOffset.toFixed(2)}, duration=${segment.duration}f, same=${isSameAnimation}, loopTransition=${hasLoopTransition}, truncated=${segment.isTruncated}, applyEasing=${shouldApplyEasing}`);
        
        // Apply easing for first segment transitioning from previous animation
        if (cycle === 0 && i === 0 && !this.isFirstAnimationEver) {
          fillSpan.easeInFrameTime = transitionFrames;
          fillSpan.easingFunction = new BezierCurveEase(
            TransitionSettings.DEFAULT_EASING_CURVE.x1,
            TransitionSettings.DEFAULT_EASING_CURVE.y1,
            TransitionSettings.DEFAULT_EASING_CURVE.x2,
            TransitionSettings.DEFAULT_EASING_CURVE.y2
          );
          console.log(`[AnimationManager] Applied ease-in to first segment (transitioning from previous animation)`);
        }
        
        // Apply easing for segment-to-segment transitions
        if (i > 0 && shouldApplyEasing) {
          fillSpan.easeInFrameTime = transitionFrames;
          fillSpan.easingFunction = new BezierCurveEase(
            TransitionSettings.DEFAULT_EASING_CURVE.x1,
            TransitionSettings.DEFAULT_EASING_CURVE.y1,
            TransitionSettings.DEFAULT_EASING_CURVE.x2,
            TransitionSettings.DEFAULT_EASING_CURVE.y2
          );
          
          // CRITICAL: Also apply ease-out to previous segment for smooth blend
          if (prevSegment && fillSpans[i - 1]) {
            fillSpans[i - 1].easeOutFrameTime = transitionFrames;
            fillSpans[i - 1].easingFunction = new BezierCurveEase(
              TransitionSettings.DEFAULT_EASING_CURVE.x1,
              TransitionSettings.DEFAULT_EASING_CURVE.y1,
              TransitionSettings.DEFAULT_EASING_CURVE.x2,
              TransitionSettings.DEFAULT_EASING_CURVE.y2
            );
          }
          
          console.log(`[AnimationManager] Applied ease-in to segment ${i} and ease-out to segment ${i-1} (different animations or truncated)`);
        } else if (i > 0 && !shouldApplyEasing) {
          console.log(`[AnimationManager] Skipped easing for segment ${i} (same perfect-loop animation, not truncated)`);
        }
        
        this.compositeAnimation.addSpan(fillSpan);
        fillSpans.push(fillSpan);
        
        // Advance actual offset for next segment
        // If easing was applied, segments overlap by transitionFrames
        // Otherwise, they're sequential
        if (i < this.compositeStitchedFillSpans.length - 1) {
          const nextSegment = this.compositeStitchedFillSpans[i + 1];
          const nextIsSame = segment.config.id === nextSegment.config.id;
          const nextHasLoopTransition = nextSegment.config.loopTransition !== false;
          // CRITICAL: Truncated segments ALWAYS need easing to prevent jumps
          const nextNeedsEasing = !nextIsSame || nextHasLoopTransition || nextSegment.isTruncated;
          
          if (nextNeedsEasing) {
            // Next segment will overlap, so advance less
            actualOffset += (segment.duration - transitionFrames);
          } else {
            // Next segment is sequential (perfect loop)
            actualOffset += segment.duration;
          }
        }
      }
      
      // Now add mouth animation with morphs ONLY (inject morphs into first segment's animation)
      // Create a morph-only span that overlays the entire composite duration
      // CRITICAL: Extend duration to allow for smooth ease-out transition to next animation
      const mouthAnim = this.compositePrimaryLoaded;
      const transitionBuffer = transitionFrames; // Extra frames for transition overlap
      
      // Create merged animation: clone first fill segment and inject mouth morphs
      const baseAnim = this.compositeStitchedFillSpans[0].animation;
      const mergedWithMorphs = this._createMorphOnlyAnimation(baseAnim, mouthAnim);
      
      // CRITICAL: Extend the morph animation's endFrame to provide transition buffer
      // This ensures the morph overlay is still playing when transitioning to next animation
      const extendedMorphEndFrame = this.compositeTargetDuration + transitionBuffer;
      mergedWithMorphs.endFrame = extendedMorphEndFrame;
      
      const morphSpan = new MmdAnimationSpan(
        mergedWithMorphs,
        undefined,
        undefined,
        cycleStartTime,
        1.0 // Full weight for morphs (no bone conflicts since we removed bone tracks)
      );
      
      // Apply ease-in to morph span for first cycle
      if (cycle === 0 && !this.isFirstAnimationEver) {
        morphSpan.easeInFrameTime = transitionFrames;
        morphSpan.easingFunction = new BezierCurveEase(
          TransitionSettings.DEFAULT_EASING_CURVE.x1,
          TransitionSettings.DEFAULT_EASING_CURVE.y1,
          TransitionSettings.DEFAULT_EASING_CURVE.x2,
          TransitionSettings.DEFAULT_EASING_CURVE.y2
        );
      }
      
      this.compositeAnimation.addSpan(morphSpan);
      spans.push(...fillSpans, morphSpan);
      
      console.log(`[AnimationManager] Added ${fillSpans.length} body segments + 1 morph overlay (extended by ${transitionBuffer}f for transition buffer)`);
      
    } else {
      // Regular single animation - create one span
      const span = new MmdAnimationSpan(
        this.currentLoadedAnimation,
        undefined,
        undefined,
        cycleStartTime,
        1
      );

      // Apply easing based on context
      if (cycle === 0 && !this.isFirstAnimationEver) {
        console.log(`[AnimationManager] Applying ease-in to cycle 0 (animation switch transition)`);
        span.easeInFrameTime = transitionFrames;
        span.easingFunction = new BezierCurveEase(
          TransitionSettings.DEFAULT_EASING_CURVE.x1,
          TransitionSettings.DEFAULT_EASING_CURVE.y1,
          TransitionSettings.DEFAULT_EASING_CURVE.x2,
          TransitionSettings.DEFAULT_EASING_CURVE.y2
        );
      } else if (loopTransition && cycle > 0) {
        console.log(`[AnimationManager] Applying ease-in to cycle ${cycle} (loop transition)`);
        span.easeInFrameTime = transitionFrames;
        span.easingFunction = new BezierCurveEase(
          TransitionSettings.DEFAULT_EASING_CURVE.x1,
          TransitionSettings.DEFAULT_EASING_CURVE.y1,
          TransitionSettings.DEFAULT_EASING_CURVE.x2,
          TransitionSettings.DEFAULT_EASING_CURVE.y2
        );
        
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
      }

      this.compositeAnimation.addSpan(span);
      spans.push(span);
    }

    this.spanMap.set(cycle, spans);
    this.lastAddedCycle = cycle;
    
    // Extend runtime duration
    const cycleEndTime = cycleStartTime + duration;
    const requiredDuration = cycleEndTime + (duration * 2);
    
    if (requiredDuration > this.mmdRuntime.animationFrameTimeDuration) {
      this.mmdRuntime.setManualAnimationDuration(requiredDuration);
      console.log(`[AnimationManager] Extended runtime duration to ${requiredDuration} frames (cycle ${cycle})`);
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
    
    // Check if animation should loop or auto-return to IDLE
    const shouldLoop = this.currentAnimationConfig.loop !== false; // Default true unless explicitly false
    
    // For non-looping animations (one-shot), check if we've completed
    // CRITICAL: Start transition BEFORE animation ends to allow smooth ease-out
    // Trigger when we're within transition frames of the end
    const transitionBuffer = transitionFrames || TransitionSettings.DEFAULT_TRANSITION_FRAMES;
    const transitionStartFrame = duration - transitionBuffer;
    
    if (!shouldLoop && currentFrame >= transitionStartFrame) {
      // For non-looping animations, ALWAYS return to IDLE regardless of current state
      // This handles cases where playAnimation() was called directly without state transition
      if (!this._isTransitioning) {
        console.log(`[AnimationManager] [AUTO-RETURN CHECK] Non-loop animation near end: frame=${currentFrame.toFixed(2)}/${duration}, starting transition at ${transitionStartFrame.toFixed(2)}, state=${this.currentState}, animName=${this.currentAnimationConfig.name}`);
        console.log(`[AnimationManager] [AUTO-RETURN TRIGGER] Starting transition to IDLE with ${(duration - currentFrame).toFixed(2)} frames remaining for smooth ease-out`);
        
        // Set flag to prevent re-entry
        this._isTransitioning = true;
        
        // Transition to IDLE state
        this.transitionToState(AssistantState.IDLE).finally(() => {
          console.log('[AnimationManager] [AUTO-RETURN COMPLETE] Transition to IDLE finished');
          this._isTransitioning = false;
        });
      }
      
      // DON'T return early - let the animation keep playing its last cycle
      // until the new animation loads and takes over smoothly
    }
    
    // DYNAMIC DURATION EXTENSION: Check if we're approaching the runtime duration limit
    // Only extend for looping animations
    if (shouldLoop) {
      const currentAbsoluteFrame = this.mmdRuntime.currentFrameTime;
      const remainingFrames = this.mmdRuntime.animationFrameTimeDuration - currentAbsoluteFrame;
      const cyclesRemaining = Math.floor(remainingFrames / cycleDuration);
      
      if (cyclesRemaining < 5) {
        // Extend duration by another 10 cycles
        const extensionCycles = 10;
        const newDuration = this.mmdRuntime.animationFrameTimeDuration + (cycleDuration * extensionCycles);
        this.mmdRuntime.setManualAnimationDuration(newDuration);
        console.log(`[AnimationManager] Extended runtime duration to ${newDuration} frames (+${extensionCycles} cycles, was approaching limit)`);
      }
    }
    
    // EXACT original logic: if we've entered a NEW cycle past the last added one, add the next
    // Use > not >= because we already added the initial cycle in playAnimation()
    // Only add next cycle if animation should loop
    if (shouldLoop && this.currentCycle > this.lastAddedCycle) {
      console.log(`[AnimationManager] Frame: ${currentFrame.toFixed(2)}, Cycle: ${this.currentCycle}, LastAdded: ${this.lastAddedCycle}, Animation: "${this.currentAnimationConfig.name}" (${this.currentAnimationConfig.filePath}), Duration: ${duration} frames, LoopTransition: ${loopTransition}`);
      this.addNextCycle();
    }

    // Cleanup old cycles
    // CRITICAL: For non-looping animations that have completed, DON'T cleanup cycle 0
    // Keep it alive for smooth transition blending
    const cycleToRemove = this.currentCycle - this.maxCachedCycles;
    if (shouldLoop && cycleToRemove >= this.firstActiveCycle && this.spanMap.has(cycleToRemove)) {
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
    
    // Only auto-switch when in IDLE state
    if (this.currentState === AssistantState.IDLE && behavior.autoSwitch) {
      // Don't switch if we just switched on this frame (prevent infinite loop)
      const currentFrame = this.mmdRuntime.currentFrameTime;
      if (this.lastSwitchFrame && currentFrame === this.lastSwitchFrame) {
        return;
      }
      
      this.idleSwitchTimer += this.scene.getEngine().getDeltaTime();

      if (this.idleSwitchTimer >= this.idleSwitchInterval) {
        // CRITICAL: Only switch at animation boundaries, not mid-cycle!
        // Calculate where we are in the current animation
        const animationFrame = currentFrame - this.animationStartFrame;
        const duration = this.currentAnimationDuration;
        const currentCycleFrame = animationFrame % duration;
        
        // Only switch if we're near the end of a cycle (within 5 frames)
        // This prevents jarring mid-animation switches
        if (currentCycleFrame > 5 && currentCycleFrame < duration - 5) {
          // We're mid-cycle, wait for next cycle
          return;
        }
        
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
          this.lastSwitchFrame = currentFrame;
          
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
   * Register visibility change handler to pause/resume animation on tab switch
   * Prevents time jumps when user switches tabs and browser throttles the tab
   */
  registerVisibilityHandler() {
    this.visibilityChangeHandler = () => {
      if (document.hidden) {
        // Tab is hidden - pause by setting playAnimation to false
        console.log('[AnimationManager] Tab hidden - pausing animation');
        if (this.mmdRuntime.playAnimation !== undefined) {
          this.mmdRuntime.playAnimation = false;
        }
      } else {
        // Tab is visible - resume by setting playAnimation to true
        console.log('[AnimationManager] Tab visible - resuming animation');
        if (this.mmdRuntime.playAnimation !== undefined) {
          this.mmdRuntime.playAnimation = true;
        }
      }
    };

    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    console.log('[AnimationManager] Visibility change handler registered');
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
   * Play composite animation with dynamic stitching
   * Primary animation (e.g., mouth/lip-sync) sets the duration
   * Fill animations (e.g., speaking body motions) are stitched together to match duration
   * 
   * @param {string} primaryAnimName - Primary animation name (sets duration, overlaid on top)
   * @param {string} fillCategory - Category of animations to stitch for body movement ('talking', 'idle', etc.)
   * @param {Object} options - { primaryWeight: 1.0, fillWeight: 0.5 }
   */
  async playComposite(primaryAnimName, fillCategory = 'talking', options = {}) {
    const primaryWeight = options.primaryWeight ?? 1.0;
    const fillWeight = options.fillWeight ?? 0.5;

    console.log(`[AnimationManager] playComposite: Primary="${primaryAnimName}", Fill="${fillCategory}", primaryWeight=${primaryWeight}, fillWeight=${fillWeight}`);

    // CRITICAL: Set state to COMPOSITE immediately to prevent auto-switch interruption
    this.previousState = this.currentState;
    this.currentState = AssistantState.COMPOSITE;
    
    // Get primary animation (mouth/lip-sync)
    const primaryAnim = getAnimationsByName(primaryAnimName);
    if (!primaryAnim) {
      console.error(`[AnimationManager] Cannot find primary animation: ${primaryAnimName}`);
      // Restore previous state on error
      this.currentState = this.previousState;
      return;
    }

    // Get fill animations pool (body motions)
    const fillAnimations = getAnimationsByCategory(fillCategory);
    if (!fillAnimations || fillAnimations.length === 0) {
      console.error(`[AnimationManager] No fill animations found in category: ${fillCategory}`);
      // Restore previous state on error
      this.currentState = this.previousState;
      return;
    }

    console.log(`[AnimationManager] Found ${fillAnimations.length} fill animations in category "${fillCategory}"`);

    // Load primary animation to get its duration
    const primaryLoaded = await this.loadAnimation(primaryAnim);
    const targetDuration = primaryLoaded.endFrame; // babylon-mmd animation has endFrame directly
    
    console.log(`[AnimationManager] Primary animation duration: ${targetDuration} frames`);

    // Build stitched fill timeline to match target duration
    const stitchedFillSpans = await this._buildStitchedTimeline(fillAnimations, targetDuration);
    
    console.log(`[AnimationManager] Built stitched timeline with ${stitchedFillSpans.length} fill segments`);

    // Store composite info for addNextCycle
    this.compositePrimaryLoaded = primaryLoaded; // Primary has the morph tracks
    this.compositePrimaryWeight = primaryWeight;
    this.compositeStitchedFillSpans = stitchedFillSpans;
    this.compositeFillWeight = fillWeight;
    this.compositeTargetDuration = targetDuration;
    
    // Use primary animation config but override for composite behavior
    const compositeConfig = {
      ...primaryAnim,
      loop: false, // CRITICAL: Composite plays once then auto-returns to IDLE
      loopTransition: false, // No loop transition needed
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES
    };
    
    // Store for playAnimation
    this.currentAnimationConfig = compositeConfig;
    this.currentLoadedAnimation = primaryLoaded;
    this.currentAnimationDuration = targetDuration;
    
    // Start playback (will call addNextCycle which handles composite)
    await this.playAnimation(compositeConfig);
  }

  /**
   * Build stitched timeline of fill animations to match target duration
   * Returns array of {animation, config, startFrame, duration, previousConfig} segments
   * Randomly selects fill animations and tracks previous animation for smart transitions
   * 
   * CRITICAL: Plays FULL animations, only truncates the LAST one if it exceeds target duration
   */
  async _buildStitchedTimeline(fillAnimations, targetDuration) {
    const segments = [];
    let currentFrame = 0;
    let previousConfig = null; // Track previous animation for smart transitions
    const transitionFrames = TransitionSettings.DEFAULT_TRANSITION_FRAMES;
    
    console.log(`[AnimationManager] Building stitched timeline for ${targetDuration} frames with ${fillAnimations.length} fill animations`);

    while (currentFrame < targetDuration) {
      // RANDOMLY pick fill animation from the pool
      const fillAnim = fillAnimations[Math.floor(Math.random() * fillAnimations.length)];
      
      // Load it
      const loaded = await this.loadAnimation(fillAnim);
      
      // Get full animation duration
      const animDuration = loaded.endFrame;
      const remainingFrames = targetDuration - currentFrame;
      
      // CRITICAL: Determine if we need to truncate this segment
      // We need to check if playing the full animation would go beyond the target
      // This depends on whether the NEXT segment would have overlap or not
      let segmentDuration;
      let wouldExceed = false;
      
      // Check if this would be the last segment by seeing if remaining space is too small
      // for another full animation after this one
      if (animDuration > remainingFrames) {
        // Animation is longer than remaining space - this MUST be the last segment
        // Truncate to fit exactly
        wouldExceed = true;
        segmentDuration = remainingFrames;
        console.log(`[AnimationManager] Last segment (too long): ${animDuration}f → ${segmentDuration}f (remaining: ${remainingFrames}f)`);
      } else if (animDuration === remainingFrames) {
        // Perfect fit - this is the last segment
        wouldExceed = false;
        segmentDuration = animDuration;
        console.log(`[AnimationManager] Last segment (perfect fit): ${segmentDuration}f`);
      } else {
        // Not last segment - use full animation duration
        segmentDuration = animDuration;
      }
      
      segments.push({
        animation: loaded,
        config: fillAnim,
        previousConfig: previousConfig, // Store previous for transition detection
        startFrame: currentFrame,
        duration: segmentDuration,
        actualDuration: animDuration,
        isTruncated: wouldExceed // Track if this segment is truncated
      });
      
      console.log(`[AnimationManager] Segment ${segments.length}: ${fillAnim.name} (full=${animDuration}f) at frame ${currentFrame}, using ${segmentDuration}f, sameAsPrevious: ${previousConfig?.id === fillAnim.id}, truncated: ${wouldExceed}`);
      
      // Determine if we need transition overlap for next segment
      // CRITICAL: First segment NEVER has overlap (starts at frame 0)
      // For subsequent segments:
      // - Different animations → ALWAYS overlap for smooth blend (regardless of loopTransition)
      // - Same animation + loopTransition=false → NO overlap (perfect loop)
      // - Same animation + loopTransition=true → Overlap for smooth blend
      const isFirstSegment = previousConfig === null;
      const isSameAnimation = previousConfig && previousConfig.id === fillAnim.id;
      
      let needsOverlap;
      if (isFirstSegment) {
        needsOverlap = false; // First segment never overlaps
      } else if (!isSameAnimation) {
        needsOverlap = true; // Different animations ALWAYS overlap for smooth transition
      } else {
        // Same animation - check loopTransition setting
        const hasLoopTransition = fillAnim.loopTransition !== false;
        needsOverlap = hasLoopTransition; // Only overlap if loopTransition is enabled
      }
      
      // Update previous for next iteration
      previousConfig = fillAnim;
      
      // Advance timeline
      if (needsOverlap) {
        // Apply transition overlap for smooth blending
        currentFrame += (segmentDuration - transitionFrames);
        console.log(`[AnimationManager] Advanced with overlap: ${currentFrame}f (next segment will blend)`);
      } else {
        // No overlap - either first segment or perfect loop
        currentFrame += segmentDuration;
        if (isFirstSegment) {
          console.log(`[AnimationManager] Advanced without overlap: ${currentFrame}f (first segment)`);
        } else {
          console.log(`[AnimationManager] Advanced without overlap: ${currentFrame}f (same animation, perfect loop)`);
        }
      }
    }
    
    console.log(`[AnimationManager] Built stitched timeline with ${segments.length} segments, total duration: ${targetDuration} frames`);
    
    return segments;
  }

  /**
   * Create a morph-only animation by removing bone tracks
   * @param {Animation} baseAnimation - Base animation to clone structure from
   * @param {Animation} morphAnimation - Animation with morphTracks to inject
   * @returns {Animation} Animation with morphs only (no bone tracks)
   */
  _createMorphOnlyAnimation(baseAnimation, morphAnimation) {
    // Clone the base animation to preserve babylon-mmd internal structure
    const morphOnly = Object.assign(Object.create(Object.getPrototypeOf(baseAnimation)), baseAnimation);
    
    // Override properties
    morphOnly.name = `morphonly_${morphAnimation.name}`;
    morphOnly.endFrame = morphAnimation.endFrame;
    
    // CRITICAL: Remove ALL bone tracks to prevent conflicts with body animations
    morphOnly.boneTracks = [];
    morphOnly.movableBoneTracks = [];
    
    // Inject morph tracks from mouth animation
    if (morphAnimation.morphTracks && morphAnimation.morphTracks.length > 0) {
      morphOnly.morphTracks = morphAnimation.morphTracks;
      console.log(`[AnimationManager] Created morph-only animation: 0 bone tracks + ${morphAnimation.morphTracks.length} morph tracks`);
    }
    
    return morphOnly;
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

    // Remove visibility change handler
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
      console.log('[AnimationManager] Visibility handler removed');
    }

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
