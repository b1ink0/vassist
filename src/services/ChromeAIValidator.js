/**
 * Chrome AI Validator Service
 * 
 * Validates Chrome Built-in AI availability and provides setup instructions.
 */

import { ChromeAIFlags, ChromeAIAvailability } from '../config/aiConfig';

class ChromeAIValidator {
  constructor() {
    this.lastCheck = null;
    this.downloadProgress = 0;
    
    console.log('[ChromeAIValidator] Initialized');
  }

  /**
   * Get Chrome version
   * @returns {number|null} Chrome version number or null if not Chrome
   */
  getChromeVersion() {
    const userAgent = navigator.userAgent;
    const match = userAgent.match(/Chrome\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Check if Chrome version meets minimum requirement
   * @returns {boolean} True if Chrome 138+
   */
  hasMinimumChromeVersion() {
    const version = this.getChromeVersion();
    return version !== null && version >= 138;
  }

  /**
   * Check if Chrome AI (LanguageModel API) is available
   * @returns {boolean} True if LanguageModel exists in global scope
   */
  isSupported() {
    const supported = 'LanguageModel' in self;
    console.log('[ChromeAIValidator] LanguageModel API supported:', supported);
    return supported;
  }

  /**
   * Get current availability status
   * @returns {Promise<Object>} Status object
   */
  async checkAvailability() {
    console.log('[ChromeAIValidator] Checking availability...');
    
    if (!this.isSupported()) {
      const status = {
        available: false,
        state: ChromeAIAvailability.UNAVAILABLE,
        message: 'Chrome AI not supported',
        details: 'Chrome 138+ required with LanguageModel API',
        requiresFlags: true,
        flags: this.getRequiredFlags(),
      };
      
      this.lastCheck = status;
      return status;
    }

    try {
      const availability = await self.LanguageModel.availability();
      
      console.log('[ChromeAIValidator] Availability state:', availability);
      
      let status = {
        available: false,
        state: availability,
        message: '',
        details: '',
        requiresFlags: false,
        flags: this.getRequiredFlags(),
      };
      
      switch (availability) {
        case ChromeAIAvailability.UNAVAILABLE:
        case 'no':
          status.message = 'Chrome AI not available on this device';
          status.details = 'Hardware requirements: 4GB+ VRAM or 16GB+ RAM with 4+ cores. Check Chrome flags.';
          status.requiresFlags = true;
          break;
          
        case ChromeAIAvailability.DOWNLOADABLE:
        case 'after-download':
        case 'downloadable':
          status.message = 'Gemini Nano model needs to be downloaded';
          status.details = 'Click "Start Model Download" below or visit chrome://components';
          status.requiresFlags = false;
          break;
          
        case ChromeAIAvailability.DOWNLOADING:
        case 'downloading':
          status.message = 'Gemini Nano model is downloading...';
          status.details = 'Download in progress. This may take a while.';
          status.requiresFlags = false;
          status.progress = this.downloadProgress;
          break;
          
        case ChromeAIAvailability.READILY:
        case ChromeAIAvailability.AVAILABLE:
        case 'readily':
        case 'available':
          status.available = true;
          status.message = 'Chrome AI ready';
          status.details = 'Gemini Nano model loaded and ready to use';
          status.requiresFlags = false;
          break;
          
        default:
          status.message = `Unknown state: ${availability}`;
          status.details = 'Please check Chrome flags and model download status';
          status.requiresFlags = true;
      }
      
      this.lastCheck = status;
      return status;
      
    } catch (error) {
      console.error('[ChromeAIValidator] Availability check failed:', error);
      
      const status = {
        available: false,
        state: ChromeAIAvailability.UNAVAILABLE,
        message: 'Failed to check Chrome AI availability',
        details: error.message,
        requiresFlags: true,
        flags: this.getRequiredFlags(),
        error: error.message,
      };
      
      this.lastCheck = status;
      return status;
    }
  }

  /**
   * Monitor download progress
   * NOTE: downloadprogress events only fire when LanguageModel.create() 
   * actually initiates the download. If download is already in progress
   * (from chrome://components or another call), events won't fire.
   * @param {Function} onProgress - Callback (progress: number) => void
   * @returns {Promise<void>}
   */
  async monitorDownload(onProgress) {
    if (!this.isSupported()) {
      throw new Error('Chrome AI not supported');
    }

    console.log('[ChromeAIValidator] Starting download monitor...');

    try {
      const validator = this;
      
      const session = await self.LanguageModel.create({
        language: 'en',
        monitor(m) {
          console.log('[ChromeAIValidator] Monitor callback called');
          
          m.ondownloadprogress = (e) => {
            const progress = e.loaded * 100;
            
            console.log(`[ChromeAIValidator] Download progress: ${progress.toFixed(1)}%`);
            
            validator.downloadProgress = progress;
            
            if (onProgress) {
              onProgress(progress);
            }
          };
        }
      });

      console.log('[ChromeAIValidator] Session created, download complete or in progress');
      session.destroy();
      
    } catch (error) {
      console.error('[ChromeAIValidator] Download monitor error:', error);
      throw error;
    }
  }

  /**
   * Get required Chrome flags with instructions
   * @param {boolean} includeMultimodal - Include multimodal flag for STT
   * @returns {Array<Object>} Array of flag objects
   */
  getRequiredFlags(includeMultimodal = false) {
    const flags = [
      ChromeAIFlags.OPTIMIZATION_GUIDE,
      ChromeAIFlags.PROMPT_API,
    ];
    
    if (includeMultimodal) {
      flags.push(ChromeAIFlags.MULTIMODAL_INPUT);
    }
    
    return flags;
  }

  /**
   * Get setup instructions
   * @param {boolean} includeMultimodal - Include multimodal flag for STT
   * @returns {Object} Setup instructions
   */
  getSetupInstructions(includeMultimodal = false) {
    return {
      title: 'Chrome AI Setup Instructions',
      steps: [
        {
          number: 1,
          title: 'Enable Chrome Flags',
          description: 'Navigate to chrome://flags and enable the required flags',
          flags: this.getRequiredFlags(includeMultimodal),
        },
        {
          number: 2,
          title: 'Restart Chrome',
          description: 'Restart your browser for flags to take effect',
        },
        {
          number: 3,
          title: 'Download Model',
          description: 'Go to chrome://components',
          details: [
            'Find "Optimization Guide On Device Model"',
            'Click "Check for update"',
            'Wait for download to complete',
            'Monitor progress at chrome://on-device-internals/',
          ],
        },
        {
          number: 4,
          title: 'Verify Installation',
          description: 'Return to settings and test the connection',
        },
      ],
      requirements: {
        chrome: 'Chrome 138 or later',
        hardware: '4GB+ VRAM (GPU) or 16GB+ RAM with 4+ cores (CPU)',
        storage: 'free space',
        network: 'Unmetered connection recommended for initial download',
      },
      troubleshooting: [
        {
          issue: 'Component not appearing',
          solution: 'Toggle flags off and on, then restart Chrome multiple times',
        },
        {
          issue: 'Download fails',
          solution: 'Check available disk space and internet connection',
        },
        {
          issue: 'Model not loading',
          solution: 'Check chrome://on-device-internals/ for error messages',
        },
      ],
    };
  }

  /**
   * Get last check result
   * @returns {Object|null} Last status check
   */
  getLastCheck() {
    return this.lastCheck;
  }

  /**
   * Get model parameters (if available)
   * @returns {Promise<Object|null>} Model parameters or null
   */
  async getModelParams() {
    if (!this.isSupported()) {
      return null;
    }

    try {
      const params = await self.LanguageModel.params();
      
      console.log('[ChromeAIValidator] Model params:', params);
      
      return {
        defaultTopK: params.defaultTopK,
        maxTopK: params.maxTopK,
        defaultTemperature: params.defaultTemperature,
        maxTemperature: params.maxTemperature,
        contextWindow: 1028, // Fixed for Gemini Nano
      };
      
    } catch (error) {
      console.error('[ChromeAIValidator] Failed to get model params:', error);
      return null;
    }
  }

  /**
   * Test if Chrome AI is fully functional
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    console.log('[ChromeAIValidator] Testing connection...');
    
    const status = await this.checkAvailability();
    
    if (!status.available) {
      return {
        success: false,
        message: status.message,
        details: status.details,
        status,
      };
    }

    try {
      const session = await self.LanguageModel.create({
        temperature: 1.0,
        topK: 3,
      });

      const response = await session.prompt('Say "OK" if you can hear me.');
      
      console.log('[ChromeAIValidator] Test response:', response);
      
      session.destroy();
      
      return {
        success: true,
        message: 'Chrome AI connection successful',
        response: response,
        status,
      };
      
    } catch (error) {
      console.error('[ChromeAIValidator] Test failed:', error);
      
      return {
        success: false,
        message: 'Chrome AI test failed',
        error: error.message,
        details: this.getErrorDetails(error),
        status,
      };
    }
  }

  /**
   * Get user-friendly error details
   * @param {Error} error - Error object
   * @returns {string} Error details
   */
  getErrorDetails(error) {
    if (error.name === 'NotSupportedError') {
      return 'Chrome AI not supported on this device. Check hardware requirements.';
    }
    
    if (error.name === 'QuotaExceededError') {
      return 'Context window full (1028 tokens). Start a new conversation.';
    }
    
    if (error.message?.includes('model')) {
      return 'Model not downloaded. Visit chrome://components to download.';
    }
    
    if (error.message?.includes('flag')) {
      return 'Required flags not enabled. Visit chrome://flags and enable all required flags.';
    }
    
    return error.message || 'Unknown error occurred';
  }
}

// Export singleton instance
export default new ChromeAIValidator();
