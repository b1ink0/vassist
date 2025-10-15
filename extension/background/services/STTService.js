/**
 * STTService - Multi-provider Speech-to-Text service (Background Worker Version)
 * 
 * Runs in service worker context with multi-tab support.
 * Content script handles MediaRecorder, background handles transcription API.
 */

import OpenAI from 'openai';

class STTService {
  constructor() {
    // Multi-tab state tracking
    // Map<tabId, { client, config, provider, enabled }>
    this.tabStates = new Map();
    
    console.log('[Background STTService] Initialized');
  }

  /**
   * Initialize state for a tab
   * @param {number} tabId - Tab ID
   */
  initTab(tabId) {
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        client: null,
        config: null,
        provider: null,
        enabled: false,
      });
      console.log(`[STTService] Tab ${tabId} initialized`);
    }
  }

  /**
   * Cleanup tab state
   * @param {number} tabId - Tab ID
   */
  cleanupTab(tabId) {
    if (this.tabStates.has(tabId)) {
      this.tabStates.delete(tabId);
      console.log(`[STTService] Tab ${tabId} cleaned up`);
    }
  }

  /**
   * Get tab state (create if doesn't exist)
   * @param {number} tabId - Tab ID
   * @returns {Object} Tab state
   */
  getTabState(tabId) {
    this.initTab(tabId);
    return this.tabStates.get(tabId);
  }

  /**
   * Configure STT client for a specific tab
   * @param {number} tabId - Tab ID
   * @param {Object} config - STT configuration
   * @returns {Promise<boolean>} Success status
   */
  async configure(tabId, config) {
    const { provider, enabled } = config;
    const state = this.getTabState(tabId);
    
    state.enabled = enabled;
    
    if (!enabled) {
      console.log(`[STTService] Tab ${tabId} - STT is disabled`);
      return true;
    }
    
    console.log(`[STTService] Tab ${tabId} - Configuring provider: ${provider}`);
    
    try {
      if (provider === 'openai') {
        // Configure OpenAI Whisper client
        state.client = new OpenAI({
          apiKey: config.openai.apiKey,
          dangerouslyAllowBrowser: false,
        });
        
        state.config = {
          model: config.openai.model,
          language: config.openai.language,
          temperature: config.openai.temperature,
        };
        
        console.log(`[STTService] Tab ${tabId} - OpenAI Whisper configured:`, {
          model: state.config.model,
          language: state.config.language,
        });
      } 
      else if (provider === 'openai-compatible') {
        // Configure Generic OpenAI-compatible STT client
        state.client = new OpenAI({
          apiKey: config['openai-compatible'].apiKey || 'default',
          baseURL: config['openai-compatible'].endpoint,
          dangerouslyAllowBrowser: false,
        });
        
        state.config = {
          model: config['openai-compatible'].model,
          language: config['openai-compatible'].language,
          temperature: config['openai-compatible'].temperature,
        };
        
        console.log(`[STTService] Tab ${tabId} - Generic STT configured:`, {
          baseURL: config['openai-compatible'].endpoint,
          model: state.config.model,
        });
      } else {
        throw new Error(`Unknown STT provider: ${provider}`);
      }
      
      state.provider = provider;
      return true;
      
    } catch (error) {
      console.error(`[STTService] Tab ${tabId} - Configuration failed:`, error);
      state.client = null;
      state.config = null;
      state.provider = null;
      throw error;
    }
  }

  /**
   * Check if tab is configured
   * @param {number} tabId - Tab ID
   * @returns {boolean} True if ready
   */
  isConfigured(tabId) {
    const state = this.tabStates.get(tabId);
    return state && state.enabled && state.client !== null && state.config !== null;
  }

  /**
   * Transcribe audio blob to text for a specific tab
   * Content script records audio, sends ArrayBuffer to background for transcription
   * 
   * @param {number} tabId - Tab ID
   * @param {ArrayBuffer} audioBuffer - Audio data to transcribe
   * @param {string} mimeType - Audio MIME type
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudio(tabId, audioBuffer, mimeType) {
    if (!this.isConfigured(tabId)) {
      throw new Error('STTService not configured for this tab');
    }

    const state = this.getTabState(tabId);

    try {
      // Convert ArrayBuffer to Blob then to File object (required by OpenAI API)
      const audioBlob = new Blob([audioBuffer], { type: mimeType });
      const audioFile = new File([audioBlob], 'recording.webm', { type: mimeType });
      
      console.log(`[STTService] Tab ${tabId} - Transcribing audio (${audioFile.size} bytes)...`);

      // Prepare transcription parameters
      const params = {
        file: audioFile,
        model: state.config.model,
      };

      // Add optional parameters
      if (state.config.language) {
        params.language = state.config.language;
      }
      if (state.config.temperature !== undefined) {
        params.temperature = state.config.temperature;
      }

      // Call API
      const transcription = await state.client.audio.transcriptions.create(params);
      
      const text = transcription.text.trim();
      console.log(`[STTService] Tab ${tabId} - Transcription complete: "${text}"`);
      
      return text;
      
    } catch (error) {
      console.error(`[STTService] Tab ${tabId} - Transcription API error:`, error);
      
      // Enhance error messages
      if (error.message?.includes('401')) {
        throw new Error('Invalid STT API key. Please check your configuration.');
      } else if (error.message?.includes('429')) {
        throw new Error('STT rate limit exceeded. Please try again later.');
      } else if (error.message?.includes('fetch')) {
        throw new Error('STT network error. Please check your connection and endpoint URL.');
      } else {
        throw error;
      }
    }
  }
}

// Export singleton instance
export default new STTService();
