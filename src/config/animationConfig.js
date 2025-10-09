/**
 * Animation Configuration for Virtual Assistant
 * 
 * This file defines all animations available to the virtual assistant,
 * including their file paths, categories, and transition settings.
 * 
 * IMPORTANT: Smooth transitions require proper easing configuration.
 * The transition settings here are based on working composite animation code.
 */

/**
 * Animation categories define the type/purpose of animations
 * Now we don't need this since categories are just the keys in AnimationRegistry
 */
export const AnimationCategory = {
  IDLE: 'idle',
  THINKING: 'thinking',
  CELEBRATING: 'celebrating',
  WALKING: 'walking',
  TALKING: 'talking',
  // Add more as needed
};

/**
 * Assistant states for state machine
 * 
 * States represent what the assistant is doing, not specific animations.
 * Each state can play different animation types with configurable behavior.
 */
export const AssistantState = {
  IDLE: 'IDLE',           // Default state - plays idle animations on loop
  BUSY: 'BUSY',           // Doing something - can play thinking, walking, etc.
  SPEAKING: 'SPEAKING',   // Talking to user - plays talking + current animation
  CELEBRATING: 'CELEBRATING', // Special one-shot state for celebrations
  COMPOSITE: 'COMPOSITE', // Playing blended composite of two animations
};

/**
 * Transition settings for smooth animation blending
 * 
 * These values are based on the working composite animation:
 * - transitionDuration: 30 frames (1 second at 30fps)
 * - Bezier easing: (0.25, 0.1, 0.75, 0.9) for smooth S-curve
 */
export const TransitionSettings = {
  // Default transition duration in frames (30fps)
  DEFAULT_TRANSITION_FRAMES: 30,
  
  // Bezier curve control points for smooth easing
  // Format: (x1, y1, x2, y2)
  DEFAULT_EASING_CURVE: {
    x1: 0.25,
    y1: 0.1,
    x2: 0.75,
    y2: 0.9,
  },
  
  // Quick transition for subtle changes
  QUICK_TRANSITION_FRAMES: 15,
  
  // Slow transition for dramatic changes
  SLOW_TRANSITION_FRAMES: 60,
};

/**
 * Animation Registry
 * 
 * Flat structure - each animation type is a root-level array.
 * Makes it easy to add new animation types and select random variants.
 * 
 * Each animation entry contains:
 * - id: Unique identifier
 * - name: Human-readable name
 * - filePath: Path to .bvmd file
 * - transitionFrames: How long to blend when entering/exiting (default: 30)
 * - loop: Whether animation should loop (default: false)
 * - loopTransition: If true, creates smooth blend between loop cycles (default: false)
 *   When enabled, the end of each cycle will ease-out while the next cycle eases-in,
 *   creating an overlap that smoothly blends mismatched start/end frames.
 * - weight: Default weight for blending (default: 1.0)
 * - metadata: Additional info (description, tags, etc.)
 */
export const AnimationRegistry = {
  // ===== IDLE =====
  idle: [
    {
      id: 'idle_breathing',
      name: 'Idle Breathing',
      filePath: 'res/private_test/motion/test.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: true,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Default idle animation with subtle breathing',
        tags: ['default', 'breathing', 'calm'],
      },
    },
    {
      id: 'idle_looking',
      name: 'Idle Looking Around',
      filePath: 'res/private_test/motion/2.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: true,
      loopTransition: false,
      weight: 1.0,
      metadata: {
        description: 'Idle with occasional head movements',
        tags: ['looking', 'curious', 'attentive'],
      },
    },
    // TODO: Add more idle variants
  ],
  
  // ===== THINKING =====
  thinking: [
    {
      id: 'thinking_1',
      name: 'Thinking',
      filePath: 'res/private_test/motion/1.bvmd', // TODO: Replace with actual thinking animation
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      weight: 1.0,
      metadata: {
        description: 'Thoughtful pose - hand on chin',
        tags: ['thinking', 'pondering', 'contemplating'],
      },
    },
    // TODO: Add more thinking variants
  ],
  
  // ===== CELEBRATING =====
  celebrating: [
    {
      id: 'celebrating_1',
      name: 'Celebrating',
      filePath: 'res/private_test/motion/2.bvmd', // TODO: Replace with actual celebration
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      weight: 1.0,
      metadata: {
        description: 'Happy celebration with arms raised',
        tags: ['happy', 'celebrating', 'excited', 'victory'],
      },
    },
    // TODO: Add more celebration variants
  ],
  
  // ===== WALKING =====
  walking: [
    {
      id: 'walking_1',
      name: 'Walking',
      filePath: 'res/private_test/motion/2.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: true,
      weight: 1.0,
      metadata: {
        description: 'Walking forward animation',
        tags: ['walking', 'movement', 'locomotion'],
      },
    },
    // TODO: Add more walking variants (fast walk, slow walk, etc.)
  ],
  
  // ===== TALKING =====
  talking: [
    {
      id: 'talking_1',
      name: 'Talking',
      filePath: 'res/private_test/motion/2.bvmd',
      transitionFrames: TransitionSettings.QUICK_TRANSITION_FRAMES,
      loop: false,
      loopTransition: false, // Perfect loop - no transition needed when same animation repeats
      weight: 1.0,
      metadata: {
        description: 'Body gestures while talking',
        tags: ['talking', 'gestures', 'body'],
      },
    },
    {
      id: 'talking_gesture_2',
      name: 'Talking Gesture 2',
      filePath: 'res/private_test/motion/1.bvmd',
      transitionFrames: TransitionSettings.QUICK_TRANSITION_FRAMES,
      loop: false,
      loopTransition: false, // Perfect loop - no transition needed when same animation repeats
      weight: 1.0,
      metadata: {
        description: 'Body gestures while talking',
        tags: ['talking', 'gestures', 'body'],
      },
    },
  ],

  lipSync: [
    {
      id: 'audio_1',
      name: 'Audio Idle',
      filePath: 'res/private_test/motion/audio.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: false,
      weight: 1.0,
      metadata: {
        description: 'Lip sync from TTS audio',
        tags: ['lip-sync', 'mouth', 'facial'],
      },
    },
  ]
  
  // TODO: Add more animation types as needed:
  // waving: [...],
  // pointing: [...],
  // sad: [...],
  // surprised: [...],
  // confused: [...],
};

/**
 * Get all animations (flattened from all categories)
 * @returns {Array} Array of all animation configs
 */
export function getAllAnimations() {
  return Object.values(AnimationRegistry).flat();
}

/**
 * Get all animations by category (animation type)
 * @param {string} category - Animation type ('idle', 'thinking', 'walking', 'celebrating', 'talking', etc.)
 * @returns {Array} Array of animation configs
 */
export function getAnimationsByCategory(category) {
  return AnimationRegistry[category] || [];
}

/**
 * Get animation by ID (searches all categories)
 * @param {string} id - Animation ID
 * @returns {Object|null} Animation config or null if not found
 */
export function getAnimationById(id) {
  return getAllAnimations().find(anim => anim.id === id) || null;
}

/**
 * Get random animation from a specific category
 * @param {string} category - Category name ('idle', 'thinking', 'walking', etc.)
 * @returns {Object|null} Random animation config or null if category empty
 */
export function getRandomAnimation(category) {
  const animations = getAnimationsByCategory(category);
  if (animations.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * animations.length);
  return animations[randomIndex];
}

/**
 * Get all available animation types (categories)
 * @returns {Array} Array of animation type names
 */
export function getAnimationTypes() {
  return Object.keys(AnimationRegistry);
}

/**
 * Validate animation config
 * @param {Object} config - Animation config to validate
 * @returns {boolean} True if valid
 */
export function validateAnimationConfig(config) {
  if (!config) return false;
  if (!config.id || typeof config.id !== 'string') return false;
  if (!config.filePath || typeof config.filePath !== 'string') return false;
  if (!config.category || !Object.values(AnimationCategory).includes(config.category)) return false;
  return true;
}

/**
 * State Behavior Configuration
 * 
 * Defines what animations can be played in each state and how they behave.
 * This is designed to be easily configurable via UI in the future.
 */
export const StateBehavior = {
  [AssistantState.IDLE]: {
    allowedAnimations: ['idle'],  // Only idle animations
    randomSelection: true,        // Randomly pick from variants
    loop: true,                   // Keep looping
    autoSwitch: true,             // Auto-switch to different idle variant
    autoSwitchInterval: 10000,    // Switch every 10 seconds (configurable)
  },
  
  [AssistantState.BUSY]: {
    allowedAnimations: ['thinking', 'walking'], // Can do thinking or walking
    randomSelection: true,        // Can randomly pick
    loop: false,                  // One-shot animations
    autoReturn: AssistantState.IDLE, // Return to IDLE when done
  },
  
  [AssistantState.SPEAKING]: {
    allowedAnimations: ['talking'], // Talking animations
    randomSelection: true,
    loop: false,
    allowOverlay: true,            // Can overlay on current animation
    autoReturn: AssistantState.IDLE,
  },
  
  [AssistantState.CELEBRATING]: {
    allowedAnimations: ['celebrating'], // Celebration animations
    randomSelection: true,
    loop: false,
    autoReturn: AssistantState.IDLE,
  },
  
  [AssistantState.COMPOSITE]: {
    allowedAnimations: [],        // Animations provided dynamically via playComposite
    randomSelection: false,       // Don't pick random - use provided animations
    loop: false,                  // Don't loop composite (play once)
    autoReturn: AssistantState.IDLE, // Auto-return to IDLE when done
  },
};

/**
 * State transition rules
 * Defines which states can transition to which other states.
 * Designed to be easily modifiable for future UI configuration.
 */
export const StateTransitions = {
  [AssistantState.IDLE]: [
    AssistantState.BUSY,
    AssistantState.SPEAKING,
    AssistantState.CELEBRATING,
    AssistantState.COMPOSITE,
  ],
  
  [AssistantState.BUSY]: [
    AssistantState.IDLE,
    AssistantState.SPEAKING,
    AssistantState.COMPOSITE,
  ],
  
  [AssistantState.SPEAKING]: [
    AssistantState.IDLE,
    AssistantState.BUSY,
    AssistantState.COMPOSITE,
  ],
  
  [AssistantState.CELEBRATING]: [
    AssistantState.IDLE,
    AssistantState.COMPOSITE,
  ],
  
  [AssistantState.COMPOSITE]: [
    AssistantState.IDLE,
    AssistantState.BUSY,
    AssistantState.SPEAKING,
    AssistantState.CELEBRATING,
  ],
};

/**
 * Emotion to Animation Mapping
 * 
 * Maps emotion strings to animation IDs.
 * This allows VirtualAssistant.speak(text, emotion) to automatically
 * select the appropriate base animation for the given emotion.
 * 
 * The base animation plays while TTS-generated VMD handles lip sync.
 */
export const EmotionMapping = {
  // ===== POSITIVE EMOTIONS =====
  happy: 'celebrating_1',
  excited: 'celebrating_1',
  joyful: 'celebrating_1',
  cheerful: 'celebrating_1',
  enthusiastic: 'celebrating_1',
  
  // ===== NEUTRAL/CALM EMOTIONS =====
  neutral: 'idle_breathing',
  calm: 'idle_breathing',
  relaxed: 'idle_breathing',
  idle: 'idle_breathing',
  default: 'idle_breathing',
  
  // ===== THINKING/COGNITIVE EMOTIONS =====
  thinking: 'thinking_1',
  pondering: 'thinking_1',
  contemplating: 'thinking_1',
  analyzing: 'thinking_1',
  processing: 'thinking_1',
  
  // ===== ATTENTIVE/CURIOUS EMOTIONS =====
  curious: 'idle_looking',
  attentive: 'idle_looking',
  focused: 'idle_looking',
  interested: 'idle_looking',
  observing: 'idle_looking',
  
  // ===== ACTIVE/ENERGETIC EMOTIONS =====
  active: 'walking_1',
  energetic: 'walking_1',
  working: 'walking_1',
  busy: 'walking_1',
  
  // ===== ERROR/SYSTEM STATES =====
  error: 'thinking_1',           // Thoughtful pose when something goes wrong
  confused: 'thinking_1',         // Same - trying to figure it out
  uncertain: 'thinking_1',        // Not sure about something
  validation_error: 'thinking_1', // Data validation failed
  
  // ===== WAITING/LOADING STATES =====
  waiting: 'idle_breathing',      // Calm while waiting
  loading: 'idle_breathing',      // Processing in background
  listening: 'idle_looking',      // Attentive while user speaks
  
  // ===== ACKNOWLEDGMENT STATES =====
  acknowledging: 'idle_breathing', // Simple acknowledgment
  understanding: 'idle_breathing', // Got it
  agreeing: 'idle_breathing',      // Agreement
  
  // TODO: Add more emotions as animations become available:
  // sad: 'sad_1',
  // surprised: 'surprised_1',
  // worried: 'worried_1',
  // frustrated: 'frustrated_1',
  // apologetic: 'apologetic_1',
  // greeting: 'waving_1',
  // farewell: 'waving_1',
};

/**
 * Get animation for a given emotion
 * 
 * @param {string} emotion - Emotion string (e.g., 'happy', 'thinking', 'neutral')
 * @returns {Object|null} Animation config for the emotion, or default idle if not found
 */
export function getAnimationForEmotion(emotion) {
  // Handle null/undefined emotion
  if (!emotion) {
    console.warn('[AnimationConfig] No emotion provided, using default (neutral)');
    return getAnimationById(EmotionMapping.default);
  }
  
  // Normalize emotion string (lowercase, trim)
  const normalizedEmotion = emotion.toLowerCase().trim();
  
  // Get animation ID from emotion mapping
  const animationId = EmotionMapping[normalizedEmotion];
  
  // If no mapping found, default to neutral
  if (!animationId) {
    console.warn(`[AnimationConfig] Unknown emotion: "${emotion}", using default (neutral)`);
    console.warn(`[AnimationConfig] Available emotions: ${Object.keys(EmotionMapping).join(', ')}`);
    return getAnimationById(EmotionMapping.default);
  }
  
  // Get animation config by ID
  const animation = getAnimationById(animationId);
  
  // Fallback to neutral if animation not found (shouldn't happen if config is correct)
  if (!animation) {
    console.error(`[AnimationConfig] Animation not found for emotion: "${emotion}" (ID: ${animationId})`);
    console.error('[AnimationConfig] This indicates a configuration error - emotion maps to non-existent animation');
    return getAnimationById(EmotionMapping.default);
  }
  
  return animation;
}

/**
 * Get all available emotions
 * @returns {Array} Array of emotion strings
 */
export function getAvailableEmotions() {
  return Object.keys(EmotionMapping);
}

/**
 * Check if an emotion is valid (exists in mapping)
 * Useful for validating LLM output
 * 
 * @param {string} emotion - Emotion string to validate
 * @returns {boolean} True if emotion is valid
 */
export function isValidEmotion(emotion) {
  if (!emotion || typeof emotion !== 'string') {
    return false;
  }
  const normalized = emotion.toLowerCase().trim();
  return normalized in EmotionMapping;
}

/**
 * Validate and sanitize emotion from LLM output
 * Returns the emotion if valid, otherwise returns 'default'
 * 
 * @param {any} emotion - Emotion from LLM (might be invalid/malformed)
 * @returns {string} Valid emotion string
 */
export function sanitizeEmotion(emotion) {
  // Handle null/undefined
  if (!emotion) {
    console.warn('[AnimationConfig] Emotion is null/undefined, using default');
    return 'default';
  }
  
  // Handle non-string types
  if (typeof emotion !== 'string') {
    console.warn(`[AnimationConfig] Emotion is not a string (type: ${typeof emotion}), using default`);
    return 'default';
  }
  
  // Normalize
  const normalized = emotion.toLowerCase().trim();
  
  // Check if valid
  if (!(normalized in EmotionMapping)) {
    console.warn(`[AnimationConfig] Invalid emotion "${emotion}" from LLM, using default`);
    return 'default';
  }
  
  return normalized;
}

/**
 * Check if a state transition is valid
 * @param {string} fromState - Current state
 * @param {string} toState - Target state
 * @returns {boolean} True if transition is allowed
 */
export function isValidTransition(fromState, toState) {
  if (!StateTransitions[fromState]) return false;
  return StateTransitions[fromState].includes(toState);
}

/**
 * Get animation config by name
 * @param {string} name - Animation name
 * @returns {Object|null} Animation config or null if not found
 */
export function getAnimationsByName(name) {
  const allAnimations = getAllAnimations();
  return allAnimations.find(anim => anim.name === name) || null;
}

export default {
  AnimationCategory,
  AssistantState,
  TransitionSettings,
  AnimationRegistry,
  StateBehavior,
  StateTransitions,
  EmotionMapping,
  getAllAnimations,
  getAnimationsByCategory,
  getAnimationById,
  getRandomAnimation,
  getAnimationTypes,
  validateAnimationConfig,
  getAnimationForEmotion,
  getAvailableEmotions,
  isValidEmotion,
  sanitizeEmotion,
  isValidTransition,
  getAnimationsByName,
};
