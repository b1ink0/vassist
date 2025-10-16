/**
 * TTSService - Multi-provider Text-to-Speech service (Background Worker Version)
 * 
 * Runs in service worker context with multi-tab support.
 * Generates audio in background, coordinates with offscreen for playback.
 */

import OpenAI from 'openai';
import { MessageTypes } from '../../shared/MessageTypes.js';

class TTSService {
  constructor() {
    // Multi-tab state tracking
    // Map<tabId, { client, config, provider, enabled, isGenerating, isStopped }>
    this.tabStates = new Map();
    
    console.log('[Background TTSService] Initialized');
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
        isGenerating: false,
        isStopped: false,
      });
      console.log(`[TTSService] Tab ${tabId} initialized`);
    }
  }

  /**
   * Cleanup tab state
   * @param {number} tabId - Tab ID
   */
  cleanupTab(tabId) {
    const state = this.tabStates.get(tabId);
    if (state) {
      // Stop any ongoing generation
      state.isStopped = true;
      this.tabStates.delete(tabId);
      console.log(`[TTSService] Tab ${tabId} cleaned up`);
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
   * Configure TTS client for a specific tab
   * @param {number} tabId - Tab ID
   * @param {Object} config - TTS configuration
   * @returns {Promise<boolean>} Success status
   */
  async configure(tabId, config) {
    const { provider, enabled } = config;
    const state = this.getTabState(tabId);
    
    state.enabled = enabled;
    
    if (!enabled) {
      console.log(`[TTSService] Tab ${tabId} - TTS is disabled`);
      return true;
    }
    
    console.log(`[TTSService] Tab ${tabId} - Configuring provider: ${provider}`);
    
    try {
      if (provider === 'openai') {
        // Configure OpenAI TTS client
        state.client = new OpenAI({
          apiKey: config.openai.apiKey,
          dangerouslyAllowBrowser: false,
        });
        
        state.config = {
          model: config.openai.model,
          voice: config.openai.voice,
          speed: config.openai.speed,
        };
        
        console.log(`[TTSService] Tab ${tabId} - OpenAI TTS configured:`, {
          model: state.config.model,
          voice: state.config.voice,
          speed: state.config.speed,
        });
      } 
      else if (provider === 'openai-compatible') {
        // Configure Generic OpenAI-compatible TTS client
        state.client = new OpenAI({
          apiKey: config['openai-compatible'].apiKey || 'default',
          baseURL: config['openai-compatible'].endpoint,
          dangerouslyAllowBrowser: false,
        });
        
        state.config = {
          model: config['openai-compatible'].model,
          voice: config['openai-compatible'].voice,
          speed: config['openai-compatible'].speed,
        };
        
        console.log(`[TTSService] Tab ${tabId} - Generic TTS configured:`, {
          baseURL: config['openai-compatible'].endpoint,
          model: state.config.model,
          voice: state.config.voice,
        });
      } else {
        throw new Error(`Unknown TTS provider: ${provider}`);
      }
      
      state.provider = provider;
      return true;
      
    } catch (error) {
      console.error(`[TTSService] Tab ${tabId} - Configuration failed:`, error);
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
   * Generate speech from text for a specific tab
   * Returns audio blob that content script can queue
   * 
   * @param {number} tabId - Tab ID
   * @param {string} text - Text to convert to speech
   * @returns {Promise<ArrayBuffer|null>} Audio data as ArrayBuffer or null if stopped
   */
  async generateSpeech(tabId, text) {
    if (!this.isConfigured(tabId)) {
      throw new Error('TTSService not configured for this tab or disabled');
    }

    const state = this.getTabState(tabId);
    
    // Silently skip if stopped
    if (state.isStopped) {
      return null;
    }

    state.isGenerating = true;

    try {
      console.log(`[TTSService] Tab ${tabId} - Generating speech (${text.length} chars)`);

      const response = await state.client.audio.speech.create({
        model: state.config.model,
        voice: state.config.voice,
        input: text,
        speed: state.config.speed,
      });

      // Silently skip if stopped after API call
      if (state.isStopped) {
        state.isGenerating = false;
        return null;
      }

      // Convert response to ArrayBuffer for transfer
      const arrayBuffer = await response.arrayBuffer();
      
      // Get content type from response headers or default to audio/mpeg for OpenAI TTS
      let contentType = null;
      if (response.headers) {
        contentType = response.headers.get('content-type');
      }
      if (!contentType && response.type) {
        contentType = response.type;
      }
      // OpenAI TTS returns MP3 by default
      if (!contentType) {
        contentType = 'audio/mpeg';
      }
      
      console.log(`[TTSService] Tab ${tabId} - Speech generated (${arrayBuffer.byteLength} bytes, ${contentType})`);
      
      state.isGenerating = false;
      return { audioBuffer: arrayBuffer, mimeType: contentType };
      
    } catch (error) {
      console.error(`[TTSService] Tab ${tabId} - Speech generation failed:`, error);
      state.isGenerating = false;
      throw error;
    }
  }

  /**
   * Generate speech for multiple text chunks
   * Sends each chunk to offscreen as it's ready
   * 
   * @param {number} tabId - Tab ID
   * @param {string[]} chunks - Array of text chunks
   * @param {Function} onChunkReady - Callback when chunk is ready: (audioBuffer, index) => void
   * @returns {Promise<number>} Number of chunks generated
   */
  async generateChunkedSpeech(tabId, chunks, onChunkReady) {
    if (!this.isConfigured(tabId)) {
      console.warn(`[TTSService] Tab ${tabId} - TTS not configured, skipping speech generation`);
      return 0;
    }

    const state = this.getTabState(tabId);
    let generatedCount = 0;

    console.log(`[TTSService] Tab ${tabId} - Generating ${chunks.length} audio chunks`);

    for (let i = 0; i < chunks.length; i++) {
      try {
        const audioBuffer = await this.generateSpeech(tabId, chunks[i]);
        
        // Skip if generation was cancelled
        if (!audioBuffer) {
          console.log(`[TTSService] Tab ${tabId} - Chunk ${i + 1} generation cancelled`);
          continue;
        }
        
        // Notify callback
        if (onChunkReady) {
          await onChunkReady(audioBuffer, i);
        }

        generatedCount++;
        console.log(`[TTSService] Tab ${tabId} - Chunk ${i + 1}/${chunks.length} ready`);
        
      } catch (error) {
        console.error(`[TTSService] Tab ${tabId} - Failed to generate chunk ${i + 1}:`, error);
        // Continue with remaining chunks
      }
    }

    return generatedCount;
  }

  /**
   * Stop TTS generation for a tab
   * @param {number} tabId - Tab ID
   */
  stopGeneration(tabId) {
    const state = this.getTabState(tabId);
    console.log(`[TTSService] Tab ${tabId} - Stopping TTS generation`);
    state.isStopped = true;
  }

  /**
   * Resume TTS generation for a tab (clear stopped flag)
   * @param {number} tabId - Tab ID
   */
  resumeGeneration(tabId) {
    const state = this.getTabState(tabId);
    console.log(`[TTSService] Tab ${tabId} - Resuming TTS generation`);
    state.isStopped = false;
  }

  /**
   * Check if currently generating for a tab
   * @param {number} tabId - Tab ID
   * @returns {boolean} True if generating
   */
  isCurrentlyGenerating(tabId) {
    const state = this.tabStates.get(tabId);
    return state && state.isGenerating;
  }
}

// Export singleton instance
export default new TTSService();
