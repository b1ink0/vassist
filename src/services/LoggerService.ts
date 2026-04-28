/**
 * Logger Service Singleton
 * 
 * Centralized logging service with:
 * - Colored console output by category
 * - Category-based enable/disable toggles
 * - Global master enable/disable switch
 * - Persistent storage of log preferences
 */

// Conditional imports based on environment
let StorageServiceProxy: { configLoad: (key: string, fallback: unknown) => Promise<unknown> } | null = null;

// Check environment at module load time
const isServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined';

type LoggerCategoryConfig = { enabled: boolean; color: string };

class LoggerService {
  private static instance: LoggerService | null = null;
  private enabled!: boolean;
  private categories!: Map<string, LoggerCategoryConfig>;
  private defaultColor!: string;
  private initialized!: boolean;
  private initPromise!: Promise<void> | null;

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
   * @param {Object} storage - Optional storage instance (for service worker to avoid import issues)
   */
  async init(storage: { config: { load: (key: string, fallback: unknown) => Promise<unknown> } } | null = null): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (isServiceWorker && storage) {
          // Service worker - use provided storage instance
          this.enabled = (await storage.config.load('loggerEnabled', false)) === true;
          const savedCategories = await storage.config.load('loggerCategories', {});
          
          Object.entries(savedCategories as Record<string, any>).forEach(([category, config]) => {
            if (this.categories.has(category)) {
              const existing = this.categories.get(category);
              if (existing) {
                existing.enabled = config.enabled === true;
                if (typeof config.color === 'string') existing.color = config.color;
              }
            } else {
              this.categories.set(category, {
                enabled: config.enabled === true,
                color: typeof config.color === 'string' ? config.color : this.getColorForCategory(category),
              });
            }
          });
        } else if (!isServiceWorker) {
          // Main world - use StorageServiceProxy
          try {
            if (!StorageServiceProxy) {
              const module = await import('./proxies/StorageServiceProxy');
              StorageServiceProxy = module.default;
            }
            
            this.enabled = (await StorageServiceProxy.configLoad('loggerEnabled', false)) === true;
            const savedCategories = await StorageServiceProxy.configLoad('loggerCategories', {});
            
            Object.entries(savedCategories as Record<string, any>).forEach(([category, config]) => {
              if (this.categories.has(category)) {
                const existing = this.categories.get(category);
                if (existing) {
                  existing.enabled = config.enabled === true;
                  if (typeof config.color === 'string') existing.color = config.color;
                }
              } else {
                this.categories.set(category, {
                  enabled: config.enabled === true,
                  color: typeof config.color === 'string' ? config.color : this.getColorForCategory(category),
                });
              }
            });
          } catch {
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
  applyConfig(enabled: boolean, categories: Record<string, Partial<LoggerCategoryConfig>> = {}): void {
    this.enabled = enabled;
    
    Object.entries(categories).forEach(([category, config]) => {
      if (this.categories.has(category)) {
        const existing = this.categories.get(category);
        if (existing) {
          existing.enabled = config.enabled === true;
          if (typeof config.color === 'string') existing.color = config.color;
        }
      } else {
        this.categories.set(category, {
          enabled: config.enabled === true,
          color: typeof config.color === 'string' ? config.color : this.getColorForCategory(category),
        });
      }
    });
    
    console.log('Logger: Config applied, enabled:', this.enabled);
  }

  /**
   * Register a category with default settings
   */
  registerCategory(category: string, color: string | null = null, enabled = false): void {
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
  getColorForCategory(category: string): string {
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

    return colors[Math.abs(hash) % colors.length] ?? this.defaultColor;
  }

  /**
   * Set master enable/disable and save to storage
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    try {
      const isServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined';
      
      if (isServiceWorker) {
        const { default: storageManager } = await import('../storage/StorageManager');
        await storageManager.config.save('loggerEnabled', enabled);
      } else {
        const { default: StorageServiceProxy } = await import('./proxies/StorageServiceProxy');
        await StorageServiceProxy.configSave('loggerEnabled', enabled);
      }
    } catch (error) {
      console.error('Failed to save logger enabled state:', error);
    }
  }

  /**
   * Set category enable/disable and save to storage
   */
  async setCategoryEnabled(category: string, enabled: boolean): Promise<void> {
    if (!this.categories.has(category)) {
      this.registerCategory(category);
    }

    const config = this.categories.get(category);
    if (config) {
      config.enabled = enabled;
    }

    try {
      await this.saveCategories();
    } catch (error) {
      console.error('Failed to save category state:', error);
    }
  }

  /**
   * Save all categories to storage
   */
  async saveCategories(): Promise<void> {
    const categoriesObj: Record<string, LoggerCategoryConfig> = {};
    this.categories.forEach((config, category) => {
      categoriesObj[category] = config;
    });

    try {
      const isServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined';
      
      if (isServiceWorker) {
        const { default: storageManager } = await import('../storage/StorageManager');
        await storageManager.config.save('loggerCategories', categoriesObj);
      } else {
        const { default: StorageServiceProxy } = await import('./proxies/StorageServiceProxy');
        await StorageServiceProxy.configSave('loggerCategories', categoriesObj);
      }
    } catch (error) {
      console.error('Failed to save logger categories:', error);
    }
  }

  /**
   * Get all categories
   */
  getCategories(): Array<{ category: string; enabled: boolean; color: string }> {
    const categories: Array<{ category: string; enabled: boolean; color: string }> = [];
    this.categories.forEach((config, category) => {
      categories.push({ category, ...config });
    });
    return categories.sort((a, b) => a.category.localeCompare(b.category));
  }

  /**
   * Check if logging is enabled for a category
   * Triggers lazy initialization if needed (NOT in service workers - must call init() manually)
   */
  shouldLog(category: string): boolean {
    // In service workers, init() must be called manually AFTER imports
    // Don't auto-init here to avoid preload issues
    const isServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined';
    
    if (!this.initialized && !isServiceWorker) {
      this.init().catch(() => {}); // Fire and forget in main world only
    }
    
    if (!this.enabled) return false;
    if (!this.categories.has(category)) {
      this.registerCategory(category);
    }
    return this.categories.get(category)?.enabled === true;
  }

  /**
   * Log message with category
   */
  log(category: string, ...args: unknown[]): void {
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
  warn(category: string, ...args: unknown[]): void {
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
  error(category: string, ...args: unknown[]): void {
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
  async enableAllCategories(): Promise<void> {
    this.categories.forEach((config) => {
      config.enabled = true;
    });
    await this.saveCategories();
  }

  /**
   * Disable all categories and save
   */
  async disableAllCategories(): Promise<void> {
    this.categories.forEach((config) => {
      config.enabled = false;
    });
    await this.saveCategories();
  }

  /**
   * Get master enabled state
   */
  isEnabled(): boolean {
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

// Register categories safely
if (Logger && typeof Logger.registerCategory === 'function') {
  knownCategories.forEach(category => {
    Logger.registerCategory(category, null, false); // false = disabled by default
  });
}

// Auto-initialize Logger asynchronously (skip in service workers)
if (Logger && typeof Logger.init === 'function') {
  const isServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined';
  
  if (!isServiceWorker) {
    Logger.init().catch(error => {
      console.warn('Logger initialization failed, using defaults:', error);
    });
  }
  // Service workers will initialize manually when needed
}

// Export both default and named for better bundler compatibility
export default Logger;
export { Logger };
