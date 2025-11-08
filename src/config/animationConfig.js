/**
 * Animation Configuration for Virtual Assistant
 * 
 * This file defines all animations available to the virtual assistant,
 * including their file paths, categories, and transition settings.
 * 
 * IMPORTANT: Smooth transitions require proper easing configuration.
 * The transition settings here are based on working composite animation code.
 * 
 * NOTE: Animation file paths are stored as plain strings and resolved at runtime
 * via ResourceLoader.getURLAsync() to ensure compatibility with both dev and extension modes.
 */

/**
 * Animation categories define the type/purpose of animations
 * Now we don't need this since categories are just the keys in AnimationRegistry
 */
import Logger from '../services/Logger';
export const AnimationCategory = {
  IDLE: 'idle',
  THINKING: 'thinking',
  CELEBRATING: 'celebrating',
  WALKING: 'walking',
  TALKING: 'talking',
};

/**
 * Assistant states for state machine
 * 
 * States represent what the assistant is doing, not specific animations.
 * Each state can play different animation types with configurable behavior.
 */
export const AssistantState = {
  INTRO: 'INTRO',         // Initial entrance animation - plays once and transitions to IDLE
  IDLE: 'IDLE',           // Default state - plays idle animations on loop
  BUSY: 'BUSY',           // Doing something - can play thinking, walking, etc.
  SPEAKING: 'SPEAKING',   // Talking to user - plays talking + current animation
  SPEAKING_HOLD: 'SPEAKING_HOLD', // Holding between TTS chunks - subtle looping motion
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
  DEFAULT_TRANSITION_FRAMES: 30,
  
  DEFAULT_EASING_CURVE: {
    x1: 0.25,
    y1: 0.1,
    x2: 0.75,
    y2: 0.9,
  },
  
  QUICK_TRANSITION_FRAMES: 15,
  
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
 * - filePath: Path to .bvmd file (as string, will be resolved at runtime)
 * - transitionFrames: How long to blend when entering/exiting (default: 30)
 * - loop: Whether animation should loop (default: false)
 * - loopTransition: If true, creates smooth blend between loop cycles (default: false)
 *   When enabled, the end of each cycle will ease-out while the next cycle eases-in,
 *   creating an overlap that smoothly blends mismatched start/end frames.
 * - weight: Default weight for blending (default: 1.0)
 * - metadata: Additional info (description, tags, etc.)
 * 
 * NOTE: filePath is stored as a plain string and resolved at runtime via ResourceLoader.getURLAsync()
 * This ensures compatibility with both dev mode and extension mode.
 */
export const AnimationRegistry = {
  idle: [
    {
      id: 'idle_1',
      name: 'Idle 1',
      filePath: 'res/assets/motion/idle1.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: true,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Primary idle animation with subtle movements',
        tags: ['default', 'idle', 'calm'],
      },
    },
    {
      id: 'idle_2',
      name: 'Idle 2',
      filePath: 'res/assets/motion/idle2.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: true,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Secondary idle animation variant',
        tags: ['idle', 'calm', 'breathing'],
      },
    },
    {
      id: 'idle_4_short',
      name: 'Idle Short',
      filePath: 'res/assets/motion/idle4-short.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: true,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Short idle animation loop',
        tags: ['idle', 'short', 'quick'],
      },
    },
    {
      id: 'yawn_1',
      name: 'Yawn 1',
      filePath: 'res/assets/motion/ywan1.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Yawning animation',
        tags: ['yawn', 'tired', 'idle'],
      },
    },
    {
      id: 'yawn_2',
      name: 'Yawn 2',
      filePath: 'res/assets/motion/ywan2.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Alternative yawning animation',
        tags: ['yawn', 'tired', 'idle'],
      },
    },
    {
      id: 'hi_1',
      name: 'Hi 1',
      filePath: 'res/assets/motion/hi1.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Waving hello gesture',
        tags: ['greeting', 'hello', 'wave', 'friendly', 'idle'],
      },
    },
    {
      id: 'hi_2',
      name: 'Hi 2',
      filePath: 'res/assets/motion/hi2.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Alternative hello gesture',
        tags: ['greeting', 'hello', 'wave', 'friendly', 'idle'],
      },
    },
  ],
  
  thinking: [
    {
      id: 'thinking_1',
      name: 'Thinking 1',
      filePath: 'res/assets/motion/think1.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      autoReturn: null,
      weight: 1.0,
      metadata: {
        description: 'Thoughtful pose - considering something',
        tags: ['thinking', 'pondering', 'contemplating'],
      },
    },
    {
      id: 'thinking_2',
      name: 'Thinking 2',
      filePath: 'res/assets/motion/think2.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      autoReturn: null,
      weight: 1.0,
      metadata: {
        description: 'Alternative thinking animation',
        tags: ['thinking', 'pondering', 'analyzing'],
      },
    },
  ],
  
  celebrating: [
    {
      id: 'clap_1',
      name: 'Clapping',
      filePath: 'res/assets/motion/clap1.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Clapping hands in celebration',
        tags: ['happy', 'celebrating', 'clapping', 'excited'],
      },
    },
  ],
  
  intro: [
    {
      id: 'intro_1',
      name: 'Intro 1',
      filePath: 'res/assets/motion/intro1.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: false,
      autoReturn: AssistantState.IDLE,
      weight: 1.0,
      metadata: {
        description: 'Entrance animation - walks from left to right and greets',
        tags: ['intro', 'greeting', 'entrance', 'walk-in'],
      },
    },
    {
      id: 'intro_2',
      name: 'Intro 2',
      filePath: 'res/assets/motion/intro2.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: false,
      autoReturn: AssistantState.IDLE,
      weight: 1.0,
      metadata: {
        description: 'Alternative entrance animation - walks in and greets',
        tags: ['intro', 'greeting', 'entrance', 'walk-in'],
      },
    },
  ],
  
  talking: [
    {
      id: 'talk_excited',
      name: 'Talk Excited',
      filePath: 'res/assets/motion/talk1-excited.bvmd',
      transitionFrames: TransitionSettings.QUICK_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Excited talking body gestures',
        tags: ['talking', 'gestures', 'excited', 'energetic'],
      },
    },
    {
      id: 'talk_nervous',
      name: 'Talk Nervous',
      filePath: 'res/assets/motion/talk2-nervous.bvmd',
      transitionFrames: TransitionSettings.QUICK_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Nervous talking body gestures',
        tags: ['talking', 'gestures', 'nervous', 'anxious'],
      },
    },
    {
      id: 'talk_calm',
      name: 'Talk Calm',
      filePath: 'res/assets/motion/talk3-calm.bvmd',
      transitionFrames: TransitionSettings.QUICK_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Calm talking body gestures',
        tags: ['talking', 'gestures', 'calm', 'relaxed'],
      },
    },
    {
      id: 'talk_angry',
      name: 'Talk Angry',
      filePath: 'res/assets/motion/talk4-angry.bvmd',
      transitionFrames: TransitionSettings.QUICK_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Angry talking body gestures',
        tags: ['talking', 'gestures', 'angry', 'frustrated'],
      },
    },
  ],
  
  walking: [
    {
      id: 'walking_placeholder',
      name: 'Walking (Placeholder)',
      filePath: 'res/assets/motion/idle1.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: true,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Placeholder for walking animation',
        tags: ['placeholder', 'testing'],
      },
    },
  ],
  
  lipSync: [
    {
      id: 'audio_1',
      name: 'Audio Test',
      filePath: 'res/private_test/motion/audio.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Test lip sync animation (debug only)',
        tags: ['lip-sync', 'mouth', 'facial', 'debug'],
      },
    },
  ],
  
  blink: [
    {
      id: 'blink_1',
      name: 'Blink',
      filePath: 'res/assets/motion/blink3.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Eye blink animation - contains only eye morph tracks for natural blinking',
        tags: ['blink', 'eye', 'morph', 'facial'],
      },
    },
  ],
  
  happy: [
    {
      id: 'happy_placeholder',
      name: 'Happy (Placeholder)',
      filePath: 'res/assets/motion/clap1.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Placeholder for happy animation',
        tags: ['placeholder', 'testing', 'happy'],
      },
    },
  ],
  
  excited: [
    {
      id: 'excited_placeholder',
      name: 'Excited (Placeholder)',
      filePath: 'res/assets/motion/clap1.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Placeholder for excited animation',
        tags: ['placeholder', 'testing', 'excited'],
      },
    },
  ],
  
  error: [
    {
      id: 'error_placeholder',
      name: 'Error (Placeholder)',
      filePath: 'res/assets/motion/think1.bvmd',
      transitionFrames: TransitionSettings.DEFAULT_TRANSITION_FRAMES,
      loop: false,
      loopTransition: true,
      weight: 1.0,
      metadata: {
        description: 'Placeholder for error state animation',
        tags: ['placeholder', 'testing', 'error'],
      },
    },
  ],
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
  [AssistantState.INTRO]: {
    allowedAnimations: ['intro'],  // Only intro animations
    randomSelection: true,         // Pick random intro variant
    loop: false,                   // Play once, don't loop
    autoSwitch: false,             // Don't auto-switch
    autoReturn: AssistantState.IDLE, // Return to IDLE when intro finishes
  },
  
  [AssistantState.IDLE]: {
    allowedAnimations: ['idle'],  // Only idle animations
    randomSelection: true,        // Randomly pick from variants
    loop: true,                   // Keep looping
    autoSwitch: true,             // Auto-switch to different idle variant
    autoSwitchInterval: 10000,    // Switch every 10 seconds (configurable)
  },
  
  [AssistantState.BUSY]: {
    allowedAnimations: ['thinking'], // Use thinking animations
    randomSelection: true,        // Can randomly pick between thinking variants
    loop: true,                   // Loop thinking animations continuously
    autoSwitch: true,             // Auto-switch between thinking variants for variety
    autoSwitchInterval: 8000,     // Switch every 8 seconds
  },
  
  [AssistantState.SPEAKING]: {
    allowedAnimations: ['talking'], // Talking animations
    randomSelection: true,
    loop: false,
    allowOverlay: true,            // Can overlay on current animation
    autoReturn: AssistantState.IDLE,
  },
  
  [AssistantState.SPEAKING_HOLD]: {
    allowedAnimations: ['talking'], // Use talking animations as hold (temporary - will replace with bridge animations)
    randomSelection: true,          // Randomly pick talking animation
    loop: true,                     // Loop while waiting for next TTS chunk
    autoSwitch: false,              // Don't auto-switch animations
    autoReturn: AssistantState.IDLE, // Fallback to IDLE if no TTS comes
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
  [AssistantState.INTRO]: [
    AssistantState.IDLE, // Intro only transitions to IDLE
  ],
  
  [AssistantState.IDLE]: [
    AssistantState.INTRO,     // Allow IDLE -> INTRO for initial animation
    AssistantState.BUSY,
    AssistantState.SPEAKING,
    AssistantState.SPEAKING_HOLD,
    AssistantState.CELEBRATING,
    AssistantState.COMPOSITE,
  ],
  
  [AssistantState.BUSY]: [
    AssistantState.IDLE,
    AssistantState.SPEAKING,
    AssistantState.SPEAKING_HOLD,
    AssistantState.COMPOSITE,
  ],
  
  [AssistantState.SPEAKING]: [
    AssistantState.IDLE,
    AssistantState.BUSY,
    AssistantState.SPEAKING_HOLD,
    AssistantState.COMPOSITE,
  ],
  
  [AssistantState.SPEAKING_HOLD]: [
    AssistantState.IDLE,
    AssistantState.COMPOSITE,
  ],
  
  [AssistantState.CELEBRATING]: [
    AssistantState.IDLE,
    AssistantState.COMPOSITE,
  ],
  
  [AssistantState.COMPOSITE]: [
    AssistantState.IDLE,
    AssistantState.SPEAKING_HOLD,
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
  happy: 'clap_1',
  excited: 'clap_1',
  joyful: 'clap_1',
  cheerful: 'clap_1',
  enthusiastic: 'clap_1',
  
  // ===== NEUTRAL/CALM EMOTIONS =====
  neutral: 'idle_1',
  calm: 'idle_1',
  relaxed: 'idle_2',
  idle: 'idle_1',
  default: 'idle_1',
  
  // ===== THINKING/COGNITIVE EMOTIONS =====
  thinking: 'thinking_1',
  pondering: 'thinking_2',
  contemplating: 'thinking_1',
  analyzing: 'thinking_2',
  processing: 'thinking_1',
  
  // ===== ATTENTIVE/CURIOUS EMOTIONS =====
  curious: 'idle_2',
  attentive: 'idle_2',
  focused: 'idle_1',
  interested: 'idle_2',
  observing: 'idle_1',
  
  // ===== ACTIVE/ENERGETIC EMOTIONS =====
  active: 'talk_excited',
  energetic: 'talk_excited',
  working: 'thinking_1',
  busy: 'thinking_1',
  
  // ===== ERROR/SYSTEM STATES =====
  error: 'thinking_1',
  confused: 'thinking_2',
  uncertain: 'thinking_1',
  validation_error: 'thinking_1',
  
  // ===== WAITING/LOADING STATES =====
  waiting: 'idle_1',
  loading: 'idle_1',
  listening: 'idle_2',
  
  // ===== ACKNOWLEDGMENT STATES =====
  acknowledging: 'idle_1',
  understanding: 'idle_2',
  agreeing: 'idle_1',
  
  // ===== GREETING/FAREWELL =====
  greeting: 'hi_1',
  hello: 'hi_2',
  hi: 'hi_1',
  welcome: 'intro_1',
  introduction: 'intro_2',
  farewell: 'hi_1',
  goodbye: 'hi_2',
  
  // ===== TIRED/BORED =====
  tired: 'yawn_1',
  bored: 'yawn_2',
  sleepy: 'yawn_1',
  
  // ===== NERVOUS/ANXIOUS =====
  nervous: 'talk_nervous',
  anxious: 'talk_nervous',
  worried: 'talk_nervous',
  
  // ===== ANGRY/FRUSTRATED =====
  angry: 'talk_angry',
  frustrated: 'talk_angry',
  annoyed: 'talk_angry',
};

/**
 * Get animation for a given emotion
 * 
 * @param {string} emotion - Emotion string (e.g., 'happy', 'thinking', 'neutral')
 * @returns {Object|null} Animation config for the emotion, or default idle if not found
 */
export function getAnimationForEmotion(emotion) {
  if (!emotion) {
    Logger.warn('AnimationConfig', 'No emotion provided, using default (neutral)');
    return getAnimationById(EmotionMapping.default);
  }
  
  const normalizedEmotion = emotion.toLowerCase().trim();
  
  const animationId = EmotionMapping[normalizedEmotion];
  
  if (!animationId) {
    Logger.warn('AnimationConfig', `Unknown emotion: "${emotion}", using default (neutral)`);
    Logger.warn('AnimationConfig', `Available emotions: ${Object.keys(EmotionMapping).join(', ')}`);
    return getAnimationById(EmotionMapping.default);
  }
  
  const animation = getAnimationById(animationId);
  
  if (!animation) {
    Logger.error('AnimationConfig', `Animation not found for emotion: "${emotion}" (ID: ${animationId})`);
    Logger.error('AnimationConfig', 'This indicates a configuration error - emotion maps to non-existent animation');
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
  if (!emotion) {
    Logger.warn('AnimationConfig', 'Emotion is null/undefined, using default');
    return 'default';
  }
  
  if (typeof emotion !== 'string') {
    Logger.warn('AnimationConfig', `Emotion is not a string (type: ${typeof emotion}), using default`);
    return 'default';
  }
  
  const normalized = emotion.toLowerCase().trim();
  
  if (!(normalized in EmotionMapping)) {
    Logger.warn('AnimationConfig', `Invalid emotion "${emotion}" from LLM, using default`);
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
