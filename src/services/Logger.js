/**
 * Logger Service Singleton
 * 
 * Centralized logging service with:
 * - Colored console output by category
 * - Category-based enable/disable toggles
 * - Global master enable/disable switch
 * - Persistent storage of log preferences
 */

import { StorageServiceProxy } from './proxies';

class LoggerService {
  constructor() {
    if (LoggerService.instance) {
      return LoggerService.instance;
    }

    this.enabled = false; // Master switch - OFF by default
    this.categories = new Map(); // category -> { enabled: boolean, color: string }
    this.defaultColor = '#888888';
    this.initialized = false;
    this.initPromise = null;
    
    LoggerService.instance = this;
  }

  /**
   * Initialize logger with saved preferences from storage
   */
  async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // Check if we're in service worker (background script)
        const isServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined';
        
        if (isServiceWorker) {
          const { default: storageManager } = await import('../storage/StorageManager.js');
          
          this.enabled = await storageManager.config.load('loggerEnabled', false);
          const savedCategories = await storageManager.config.load('loggerCategories', {});
          
          Object.entries(savedCategories).forEach(([category, config]) => {
            if (this.categories.has(category)) {
              const existing = this.categories.get(category);
              existing.enabled = config.enabled;
              if (config.color) existing.color = config.color;
            } else {
              this.categories.set(category, config);
            }
          });
        } else {
          // Main world or dev mode - use StorageServiceProxy
          try {
            this.enabled = await StorageServiceProxy.configLoad('loggerEnabled', false);
            const savedCategories = await StorageServiceProxy.configLoad('loggerCategories', {});
            
            Object.entries(savedCategories).forEach(([category, config]) => {
              if (this.categories.has(category)) {
                const existing = this.categories.get(category);
                existing.enabled = config.enabled;
                if (config.color) existing.color = config.color;
              } else {
                this.categories.set(category, config);
              }
            });
          } catch (error) {
            // Bridge not ready yet, that's fine - use defaults
            console.log('Logger: Storage not ready yet, using defaults');
          }
        }
        
        this.initialized = true;
        console.log('Logger: Initialized from storage, enabled:', this.enabled);
      } catch (error) {
        console.error('Failed to initialize Logger:', error);
        this.initialized = true; // Continue with defaults
      }
    })();

    return this.initPromise;
  }

  /**
   * Apply configuration (alternative to loading from storage)
   * @param {boolean} enabled - Master enable/disable
   * @param {Object} categories - Category configuration {categoryName: {enabled: boolean, color: string}}
   */
  applyConfig(enabled, categories = {}) {
    this.enabled = enabled;
    
    Object.entries(categories).forEach(([category, config]) => {
      if (this.categories.has(category)) {
        const existing = this.categories.get(category);
        existing.enabled = config.enabled;
        if (config.color) existing.color = config.color;
      } else {
        this.categories.set(category, config);
      }
    });
    
    console.log('Logger: Config applied, enabled:', this.enabled);
  }

  /**
   * Register a category with default settings
   */
  registerCategory(category, color = null, enabled = false) {
    if (!this.categories.has(category)) {
      this.categories.set(category, {
        enabled,
        color: color || this.getColorForCategory(category)
      });
    }
  }

  /**
   * Generate a unique color for a category based on hash
   */
  getColorForCategory(category) {
    const colors = [
      '#FF6B6B', // Red
      '#4ECDC4', // Teal
      '#45B7D1', // Blue
      '#FFA07A', // Salmon
      '#98D8C8', // Mint
      '#F7DC6F', // Yellow
      '#BB8FCE', // Purple
      '#85C1E2', // Sky Blue
      '#F8B195', // Peach
      '#C06C84', // Mauve
      '#6C5CE7', // Indigo
      '#00B894', // Green
      '#FDCB6E', // Mustard
      '#E17055', // Orange
      '#74B9FF', // Light Blue
      '#A29BFE', // Lavender
      '#55EFC4', // Aqua
      '#FF7675', // Pink
      '#FD79A8', // Rose
      '#FFEAA7'  // Cream
    ];

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      hash = ((hash << 5) - hash) + category.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }

    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Set master enable/disable and save to storage
   */
  async setEnabled(enabled) {
    this.enabled = enabled;
    try {
      const isServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined';
      
      if (isServiceWorker) {
        const { default: storageManager } = await import('../storage/StorageManager.js');
        await storageManager.config.save('loggerEnabled', enabled);
      } else {
        await StorageServiceProxy.configSave('loggerEnabled', enabled);
      }
    } catch (error) {
      console.error('Failed to save logger enabled state:', error);
    }
  }

  /**
   * Set category enable/disable and save to storage
   */
  async setCategoryEnabled(category, enabled) {
    if (!this.categories.has(category)) {
      this.registerCategory(category);
    }

    const config = this.categories.get(category);
    config.enabled = enabled;

    try {
      await this.saveCategories();
    } catch (error) {
      console.error('Failed to save category state:', error);
    }
  }

  /**
   * Save all categories to storage
   */
  async saveCategories() {
    const categoriesObj = {};
    this.categories.forEach((config, category) => {
      categoriesObj[category] = config;
    });

    try {
      const isServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined';
      
      if (isServiceWorker) {
        const { default: storageManager } = await import('../storage/StorageManager.js');
        await storageManager.config.save('loggerCategories', categoriesObj);
      } else {
        await StorageServiceProxy.configSave('loggerCategories', categoriesObj);
      }
    } catch (error) {
      console.error('Failed to save logger categories:', error);
    }
  }

  /**
   * Get all categories
   */
  getCategories() {
    const categories = [];
    this.categories.forEach((config, category) => {
      categories.push({ category, ...config });
    });
    return categories.sort((a, b) => a.category.localeCompare(b.category));
  }

  /**
   * Check if logging is enabled for a category
   * Triggers lazy initialization if needed
   */
  shouldLog(category) {
    // Lazy init in extension mode
    if (!this.initialized) {
      this.init().catch(() => {}); // Fire and forget
    }
    
    if (!this.enabled) return false;
    if (!this.categories.has(category)) {
      this.registerCategory(category);
    }
    return this.categories.get(category).enabled;
  }

  /**
   * Log message with category
   */
  log(category, ...args) {
    if (!this.shouldLog(category)) return;

    const config = this.categories.get(category);
    const color = config?.color || this.defaultColor;

    console.log(
      `%c[${category}]`,
      `color: ${color}; font-weight: bold;`,
      ...args
    );
  }

  /**
   * Log warning with category
   */
  warn(category, ...args) {
    if (!this.shouldLog(category)) return;

    const config = this.categories.get(category);
    const color = config?.color || this.defaultColor;

    console.warn(
      `%c[${category}]`,
      `color: ${color}; font-weight: bold;`,
      ...args
    );
  }

  /**
   * Log error with category
   */
  error(category, ...args) {
    if (!this.shouldLog(category)) return;

    const config = this.categories.get(category);
    const color = config?.color || this.defaultColor;

    console.error(
      `%c[${category}]`,
      `color: ${color}; font-weight: bold;`,
      ...args
    );
  }

  /**
   * Enable all categories and save
   */
  async enableAllCategories() {
    this.categories.forEach((config) => {
      config.enabled = true;
    });
    await this.saveCategories();
  }

  /**
   * Disable all categories and save
   */
  async disableAllCategories() {
    this.categories.forEach((config) => {
      config.enabled = false;
    });
    await this.saveCategories();
  }

  /**
   * Get master enabled state
   */
  isEnabled() {
    return this.enabled;
  }
}

// Create singleton instance
const Logger = new LoggerService();

// Pre-register all known categories with unique colors (all disabled by default)
const knownCategories = [
  'AIFeaturesOverviewStep', 'AIService', 'AIServiceProxy', 'AIToolbar', 'AIToolbar-Panel', 'AIToolbar-Toolbar',
  'AnimationConfig', 'AnimationManager', 'AppContent', 'AppContext', 'AssistantState.BUSY', 'AssistantState.CELEBRATING',
  'AssistantState.COMPOSITE', 'AssistantState.IDLE', 'AssistantState.INTRO', 'AssistantState.SPEAKING', 'AssistantState.SPEAKING_HOLD',
  'AudioWorkerClient', 'BabylonScene', 'Background', 'BackgroundBridge', 'BackgroundDetector', 'BVMDCore',
  'CanvasInteractionManager', 'ChatBubble', 'ChatButton', 'ChatContainer', 'ChatController', 'ChatHistoryPanel',
  'ChatHistoryService', 'ChatInput', 'ChatMessage', 'ChatService', 'ChromeAISTTConfig', 'ChromeAIValidator',
  'ConfigContext', 'Content', 'ControlPanel', 'DebugOverlay', 'DragDropService', 'Extension', 'ExtensionBridge',
  'KokoroTTSCore', 'LanguageDetectorService', 'LLMProviderStep', 'MediaExtractionService', 'MmdModelScene',
  'Offscreen', 'OffscreenManager', 'OffscreenWorker', 'PositionManager', 'ResourceLoader', 'RewriterService',
  'RewriterServiceProxy', 'SceneConfig', 'SettingsPanel', 'SetupContext', 'SetupWizard', 'SharedAudioWorker',
  'StorageAdapter', 'StorageServiceProxy', 'STTService', 'STTServiceProxy', 'SummarizerService', 'SummarizerServiceProxy',
  'TabManager', 'TranslatorService', 'TranslatorServiceProxy', 'TTSProviderStep', 'TTSService', 'TTSServiceProxy',
  'UnifiedStorageManager', 'UtilService', 'VassistDatabase', 'VirtualAssistant', 'VMDGenCore', 'VoiceConversation',
  'VoiceRecording', 'WriterService', 'WriterServiceProxy', 'Extension Content', 'Content Script IIFE',
  'wrap-content', 'copy-assets', 'other' // Catch-all category for uncategorized logs
];

knownCategories.forEach(category => {
  Logger.registerCategory(category, null, false); // false = disabled by default
});

// Auto-initialize Logger asynchronously in all modes
Logger.init().catch(error => {
  console.warn('Logger initialization failed, using defaults:', error);
});

export default Logger;
