/**
 * TTSService - Multi-provider Text-to-Speech service
 * 
 * Unified interface for OpenAI TTS and Ollama TTS (via OpenAI-compatible API).
 * Supports streaming TTS generation with intelligent chunking and audio queue management.
 */

import OpenAI from 'openai';
import { TTSProviders } from '../config/aiConfig';
import { vmdGenerationService } from './VMDGenerationService.js';
import { BVMDConverterService } from './BVMDConverterService.js';

class TTSService {
  constructor() {
    this.isExtensionMode = __EXTENSION_MODE__;

    if (this.isExtensionMode) {
      this.tabStates = new Map();
      console.log('[TTSService] Initialized (Extension mode - multi-tab)');
    } else {
      this.client = null;
      this.provider = null;
      this.config = null;
      this.enabled = false;

      this.audioQueue = [];
      this.isPlaying = false;
      this.isStopped = false;
      this.currentAudio = null;
      this.currentPlaybackSession = null;

      this.blobUrls = new Set();

      this.activeRequests = 0;
      this.maxConcurrentRequests = 3;

      this.lipSyncEnabled = true;
      this.vmdService = vmdGenerationService;
      this.bvmdConverter = null;

      this.onSpeakCallback = null;
      this.onAudioFinishedCallback = null;
      this.onStopCallback = null;
      this.onAudioStartCallback = null;
      this.onAudioEndCallback = null;

      console.log('[TTSService] Initialized with lip sync support');
    }
  }

  initTab(tabId) {
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        client: null,
        provider: null,
        config: null,
        enabled: false,
        isGenerating: false,
        isStopped: false,
      });
      console.log(`[TTSService] Tab ${tabId} initialized`);
    }
  }

  cleanupTab(tabId) {
    if (this.tabStates.has(tabId)) {
      this.tabStates.delete(tabId);
      console.log(`[TTSService] Tab ${tabId} cleaned up`);
    }
  }

  _getState(tabId = null) {
    if (this.isExtensionMode) {
      this.initTab(tabId);
      return this.tabStates.get(tabId);
    }
    return this; // dev mode uses instance fields
  }

  /**
   * Configure TTS client with provider settings
   * @param {Object} config - TTS configuration from aiConfig
   * @param {number|null} tabId - Tab ID (extension mode only)
   */
  configure(config, tabId = null) {
    const state = this._getState(tabId);
    const { provider, enabled } = config;
    const logPrefix = this.isExtensionMode ? `[TTSService] Tab ${tabId}` : '[TTSService]';
    
    state.enabled = enabled;
    
    if (!enabled) {
      console.log(`${logPrefix} - TTS is disabled`);
      return true;
    }
    
    console.log(`${logPrefix} - Configuring provider: ${provider}`);

    try {
      if (provider === TTSProviders.OPENAI) {
        state.client = new OpenAI({
          apiKey: config.openai.apiKey,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });

        state.config = {
          model: config.openai.model,
          voice: config.openai.voice,
          speed: config.openai.speed,
        };
        state.provider = provider;

        console.log(`${logPrefix} - OpenAI TTS configured:`, state.config);
      } else if (provider === TTSProviders.OPENAI_COMPATIBLE) {
        state.client = new OpenAI({
          apiKey: config['openai-compatible'].apiKey || 'default',
          baseURL: config['openai-compatible'].endpoint,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });

        state.config = {
          model: config['openai-compatible'].model,
          voice: config['openai-compatible'].voice,
          speed: config['openai-compatible'].speed,
        };
        state.provider = provider;

        console.log(`${logPrefix} - Generic TTS configured:`, { baseURL: config['openai-compatible'].endpoint });
      } else {
        throw new Error(`Unknown TTS provider: ${provider}`);
      }

      return true;
    } catch (error) {
      console.error(`${logPrefix} - Configuration failed:`, error);
      state.client = null;
      state.config = null;
      state.provider = null;
      throw error;
    }
  }

  isConfigured(tabId = null) {
    const state = this._getState(tabId);
    return state && state.enabled && state.client !== null && state.config !== null;
  }

  getCurrentProvider(tabId = null) {
    const state = this._getState(tabId);
    return state?.provider || null;
  }

  /**
   * Initialize BVMD converter with scene
   * @param {Scene} scene - Babylon.js scene
   */
  initializeBVMDConverter(scene) {
    if (!this.bvmdConverter) {
      this.bvmdConverter = new BVMDConverterService(scene);
      console.log('[TTSService] BVMD converter initialized');
    }
  }

  /**
   * Set callback for triggering speak animations
   * @param {Function} callback - (text, bvmdBlobUrl) => void
   */
  setSpeakCallback(callback) {
    this.onSpeakCallback = callback;
    console.log('[TTSService] Speak callback registered');
  }

  /**
   * Set callback for when audio finishes playing (for sliding window generation)
   * @param {Function} callback - () => void
   */
  setAudioFinishedCallback(callback) {
    this.onAudioFinishedCallback = callback;
    console.log('[TTSService] Audio finished callback registered');
  }

  /**
   * Set callback for when TTS is stopped/interrupted
   * @param {Function} callback - () => void
   */
  setStopCallback(callback) {
    this.onStopCallback = callback;
    console.log('[TTSService] Stop callback registered');
  }

  /**
   * Enable or disable lip sync generation
   * @param {boolean} enabled - Enable lip sync generation
   */
  setLipSyncEnabled(enabled) {
    this.lipSyncEnabled = enabled;
    console.log(`[TTSService] Lip sync generation ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Generate speech from text with optional lip sync (VMD -> BVMD)
   * @param {string} text - Text to convert to speech
   * @param {boolean} generateLipSync - Generate lip sync data
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<{audio: Blob, bvmdUrl: string|null}>} Audio blob and optional BVMD URL
   */
  async generateSpeech(text, generateLipSync = true, tabId = null) {
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[TTSService] Tab ${tabId}` : '[TTSService]';
    
    if (!this.isConfigured(tabId)) {
      throw new Error('TTSService not configured or disabled');
    }

    if (state.isStopped) return null;

    if (this.isExtensionMode) {
      state.isGenerating = true;

      try {
        console.log(`${logPrefix} - Generating speech (${text.length} chars)`);
        const response = await state.client.audio.speech.create({
          model: state.config.model,
          voice: state.config.voice,
          input: text,
          speed: state.config.speed,
        });

        if (state.isStopped) {
          state.isGenerating = false;
          return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        let contentType = response.headers?.get('content-type') || response.type || 'audio/mpeg';

        state.isGenerating = false;
        console.log(`${logPrefix} - Speech generated (${arrayBuffer.byteLength} bytes, ${contentType})`);
        return { audioBuffer: arrayBuffer, mimeType: contentType };
      } catch (error) {
        state.isGenerating = false;
        console.error(`${logPrefix} - Speech generation failed:`, error);
        throw error;
      }
    }

    while (state.activeRequests >= state.maxConcurrentRequests) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (state.isStopped) return null;
    }

    state.activeRequests++;
    try {
      console.log(`${logPrefix} - Generating speech (${text.length} chars)${generateLipSync && state.lipSyncEnabled ? ' with lip sync' : ''}`);

      const response = await state.client.audio.speech.create({
        model: state.config.model,
        voice: state.config.voice,
        input: text,
        speed: state.config.speed,
      });

      if (state.isStopped) return null;

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });

      let bvmdUrl = null;
      if (generateLipSync && state.lipSyncEnabled && state.bvmdConverter) {
        try {
          if (state.isStopped) return null;
          const vmdData = await state.vmdService.generateVMDFromAudio(blob);
          bvmdUrl = await state.bvmdConverter.convertVMDToBVMD(vmdData);
        } catch (e) {
          console.error(`${logPrefix} - Lip sync generation failed:`, e);
        }
      }

      return { audio: blob, bvmdUrl };
    } catch (error) {
      console.error(`${logPrefix} - Speech generation failed:`, error);
      throw error;
    } finally {
      state.activeRequests--;
    }
  }

  /**
   * Split text into natural chunks for TTS
   * Tries to break at sentence boundaries for natural speech
   * @param {string} text - Text to chunk
   * @param {number} maxChunkSize - Maximum chunk size in characters
   * @param {number} minChunkSize - Minimum chunk size before forced split
   * @returns {string[]} Array of text chunks
   */
  chunkText(text, maxChunkSize = 500, minChunkSize = 100) {
    const chunks = [];
    let currentChunk = '';

    // First, normalize the text - replace multiple newlines with double newlines
    // and ensure proper spacing
    const normalizedText = text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .trim();

    // Split by both sentence boundaries AND newlines
    // This regex captures sentences ending with .!? OR text followed by newline
    const sentences = normalizedText.match(/[^.!?\n]+[.!?]+[\s]*|[^.!?\n]+\n+|[^.!?\n]+$/g) || [normalizedText];

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      
      if (!trimmed) continue;

      // If adding this sentence would exceed max size
      if (currentChunk.length + trimmed.length > maxChunkSize) {
        // If we have a chunk that's at least minimum size, save it
        if (currentChunk.length >= minChunkSize) {
          chunks.push(currentChunk.trim());
          currentChunk = trimmed;
        } else {
          // Current chunk is too small, add sentence anyway
          currentChunk += (currentChunk ? ' ' : '') + trimmed;
        }
      } else {
        // Add sentence to current chunk with proper spacing
        currentChunk += (currentChunk ? ' ' : '') + trimmed;
      }
    }

    // Add remaining chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    console.log(`[TTSService] Text chunked into ${chunks.length} parts:`, chunks.map(c => c.substring(0, 50) + '...'));
    
    return chunks;
  }

  /**
   * Generate and queue audio chunks from text with lip sync (VMD -> BVMD)
   * @param {string} text - Full text to convert
   * @param {Function} onChunkReady - Callback when chunk is ready: (text: string, audioUrl: string, bvmdUrl: string|null, index: number, total: number) => void
   * @param {number} maxChunkSize - Maximum chunk size
   * @param {number} minChunkSize - Minimum chunk size
   * @param {string} sessionId - Optional session ID for this generation request
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<Array<{text: string, audioUrl: string, bvmdUrl: string|null, sessionId: string|null}>>} Array of text, audio URLs and BVMD URLs
   */
  async generateChunkedSpeech(text, onChunkReady = null, maxChunkSize = 500, minChunkSize = 100, sessionId = null, tabId = null) {
    // In extension mode, generateChunkedSpeech will not create Blob URLs; background will return arrays
    if (this.isExtensionMode) {
      const chunks = this.chunkText(text, maxChunkSize, minChunkSize);
      let generatedCount = 0;
      for (let i = 0; i < chunks.length; i++) {
        try {
          const result = await this.generateSpeech(chunks[i], false, tabId);
          if (!result) continue;
          if (onChunkReady) await onChunkReady(result.audioBuffer, i);
          generatedCount++;
        } catch (error) {
          console.error(`[TTSService] Tab ${tabId} - Failed to generate chunk ${i + 1}:`, error);
        }
      }
      return generatedCount;
    }

    // Dev mode: existing behavior
    if (!this.isConfigured()) {
      console.warn('[TTSService] TTS not configured, skipping speech generation');
      return [];
    }

    const chunks = this.chunkText(text, maxChunkSize, minChunkSize);
    const results = [];

    console.log(`[TTSService] Generating ${chunks.length} audio chunks${this.lipSyncEnabled ? ' with lip sync' : ''} [Session: ${sessionId}]`);

    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await this.generateSpeech(chunks[i], this.lipSyncEnabled);
        if (!result) continue;
        const { audio, bvmdUrl } = result;
        const audioUrl = URL.createObjectURL(audio);
        this.blobUrls.add(audioUrl);
        const chunkResult = { text: chunks[i], audioUrl, bvmdUrl, sessionId };
        results.push(chunkResult);
        if (onChunkReady) onChunkReady(chunks[i], audioUrl, bvmdUrl, i, chunks.length);
      } catch (error) {
        console.error(`[TTSService] Failed to generate chunk ${i + 1}:`, error);
      }
    }

    return results;
  }

  /**
   * Get current audio queue length (for just-in-time generation)
   * @returns {number} Number of audio items in queue
   */
  getQueueLength() {
    return this.audioQueue.length;
  }

  /**
   * Check if audio is currently playing or queued
   * @returns {boolean} True if audio is playing or in queue
   */
  isAudioActive() {
    return this.isPlaying || this.audioQueue.length > 0;
  }

  /**
   * Add audio to playback queue with optional BVMD and text
   * @param {string} text - Text being spoken
   * @param {string} audioUrl - Audio blob URL
   * @param {string|null} bvmdUrl - Optional BVMD blob URL for lip sync
   * @param {string} sessionId - Unique session ID for this playback request
   */
  queueAudio(text, audioUrl, bvmdUrl = null, sessionId = null) {
    // Generate session ID if not provided (for new playback requests)
    const effectiveSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // If this is a NEW session (different from current), stop the current one
    if (sessionId && this.currentPlaybackSession && sessionId !== this.currentPlaybackSession) {
      console.log(`[TTSService] New session ${sessionId} requested, stopping current session ${this.currentPlaybackSession}`);
      this.stopPlayback();
    }
    
    // Don't queue if stopped AND it's not a new session starting
    if (this.isStopped && !sessionId) {
      console.log('[TTSService] Audio not queued - playback stopped');
      return;
    }
    
    // If starting a new session, clear the stopped flag
    if (sessionId) {
      this.isStopped = false;
      this.currentPlaybackSession = sessionId;
    }
    
    this.audioQueue.push({ text, audioUrl, bvmdUrl, sessionId: effectiveSessionId });
    console.log(`[TTSService] Audio queued (${this.audioQueue.length} in queue)${bvmdUrl ? ' with lip sync' : ''} [Session: ${effectiveSessionId}]`);
    
    // Start playing if not already playing
    if (!this.isPlaying) {
      this.playNextInQueue();
    }
  }

  /**
   * Play next audio in queue
   */
  async playNextInQueue() {
    // Check if stopped
    if (this.isStopped) {
      this.isPlaying = false;
      console.log('[TTSService] Playback stopped by flag');
      return;
    }
    
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      this.currentPlaybackSession = null; // Clear session when queue is empty
      console.log('[TTSService] Queue empty, playback stopped');
      return;
    }

    this.isPlaying = true;
    const item = this.audioQueue.shift();
    
    // Handle both old format (string) and new format (object)
    const text = typeof item === 'object' ? item.text : '';
    const audioUrl = typeof item === 'string' ? item : item.audioUrl;
    const bvmdUrl = typeof item === 'object' ? item.bvmdUrl : null;
    const sessionId = typeof item === 'object' ? item.sessionId : null;

    try {
      await this.playAudio(text, audioUrl, bvmdUrl, sessionId);
    } catch (error) {
      console.error('[TTSService] Playback error:', error);
    }

    // Check again if stopped (in case stop was called while playing)
    if (this.isStopped) {
      this.isPlaying = false;
      console.log('[TTSService] Playback stopped, not playing next');
      return;
    }

    // Trigger callback when this audio finishes (before playing next)
    // This is the RIGHT place - audio just finished, next one hasn't started yet
    if (this.onAudioFinishedCallback) {
      this.onAudioFinishedCallback();
    }

    // Play next in queue (will check isStopped flag again)
    this.playNextInQueue();
  }

  /**
   * Play a single audio blob URL with optional BVMD lip sync
   * Triggers speak callback for animation synchronization
   * @param {string} text - Text being spoken
   * @param {string} audioUrl - Audio blob URL
   * @param {string|null} bvmdUrl - Optional BVMD blob URL for lip sync
   * @param {string|null} sessionId - Session ID for this audio
   * @returns {Promise<void>} Resolves when audio finishes
   */
  playAudio(text, audioUrl, bvmdUrl = null, sessionId = null) {
    return new Promise((resolve, reject) => {
      // Check if this audio belongs to the current session
      if (sessionId && this.currentPlaybackSession && sessionId !== this.currentPlaybackSession) {
        console.log(`[TTSService] Skipping audio from old session ${sessionId} (current: ${this.currentPlaybackSession})`);
        resolve(); // Don't reject, just skip
        return;
      }
      
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      // Trigger callbacks when audio starts playing
      audio.addEventListener('play', () => {
        console.log('[TTSService] Audio playing, triggering callbacks');
        
        // Trigger speak callback for animation synchronization
        if (bvmdUrl && this.onSpeakCallback) {
          this.onSpeakCallback(text, bvmdUrl);
        }
        
        // Trigger audio start callback for UI updates (e.g., show pause icon)
        if (this.onAudioStartCallback) {
          this.onAudioStartCallback(sessionId);
        }
      }, { once: true });

      audio.onended = () => {
        console.log('[TTSService] Audio playback finished');
        this.currentAudio = null;
        
        // Trigger audio end callback for UI updates
        if (this.onAudioEndCallback) {
          this.onAudioEndCallback(sessionId);
        }
        
        resolve();
      };

      audio.onerror = (error) => {
        console.error('[TTSService] Audio playback error:', error);
        this.currentAudio = null;
        
        // Trigger audio end callback for UI cleanup on error
        if (this.onAudioEndCallback) {
          this.onAudioEndCallback(sessionId);
        }
        
        reject(error);
      };

      audio.play().catch(reject);
      console.log('[TTSService] Audio playback started' + (bvmdUrl ? ' with lip sync' : ''));
    });
  }

  /**
   * Play audio chunks sequentially with BVMD lip sync
   * @param {Array<{text: string, audioUrl: string, bvmdUrl: string|null, sessionId: string|null}>} items - Array of text, audio URLs and BVMD URLs
   * @param {string} sessionId - Session ID for this playback sequence
   * @returns {Promise<void>} Resolves when all audio finishes
   */
  async playAudioSequence(items, sessionId = null) {
    console.log(`[TTSService] Playing ${items.length} audio chunks sequentially [Session: ${sessionId}]`);
    
    // Set current session if provided
    if (sessionId) {
      // If there's a different session playing, stop it first
      if (this.currentPlaybackSession && sessionId !== this.currentPlaybackSession) {
        console.log(`[TTSService] Stopping current session ${this.currentPlaybackSession} for new session ${sessionId}`);
        this.stopPlayback();
      }
      this.currentPlaybackSession = sessionId;
      this.isStopped = false; // Clear stopped flag for new session
    }
    
    for (const item of items) {
      try {
        // Handle both old format (string) and new format (object)
        const text = typeof item === 'object' ? item.text : '';
        const audioUrl = typeof item === 'string' ? item : item.audioUrl;
        const bvmdUrl = typeof item === 'object' ? item.bvmdUrl : null;
        const itemSessionId = typeof item === 'object' ? item.sessionId : sessionId;
        
        await this.playAudio(text, audioUrl, bvmdUrl, itemSessionId);
      } catch (error) {
        console.error('[TTSService] Error playing audio chunk:', error);
        // Continue with next chunk
      }
    }
    
    console.log('[TTSService] Sequence playback complete');
    
    // Clear session when sequence is complete
    if (sessionId === this.currentPlaybackSession) {
      this.currentPlaybackSession = null;
    }
  }

  /**
   * Stop current playback and clear queue
   * Returns a Promise that resolves when stop is complete
   */
  stopPlayback() {
    console.log('[TTSService] Stopping playback...');
    
    // Save current session ID before clearing
    const stoppedSessionId = this.currentPlaybackSession;
    
    // Set stopped flag to prevent new audio from starting
    this.isStopped = true;
    
    // Stop current audio and clean up
    if (this.currentAudio) {
      this.currentAudio.pause();
      // Force the audio to end to resolve any pending Promise
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    
    // Clear queue completely
    this.audioQueue = [];
    this.isPlaying = false;
    
    // Clear current session
    this.currentPlaybackSession = null;
    
    console.log('[TTSService] Playback stopped and queue cleared');
    
    // Trigger stop callback to notify animation manager
    if (this.onStopCallback) {
      this.onStopCallback();
    }
    
    // Trigger audio end callback for UI cleanup (important for resetting speaker icon)
    if (this.onAudioEndCallback && stoppedSessionId) {
      this.onAudioEndCallback(stoppedSessionId);
    }
  }
  
  /**
   * Resume playback (clear stopped flag)
   * Call this before starting new TTS generation
   */
  resumePlayback() {
    console.log('[TTSService] Resuming playback (clearing stopped flag)');
    this.isStopped = false;
  }

  // Extension-only controls (stop/resume generation)
  stopGeneration(tabId = null) {
    if (this.isExtensionMode) {
      const state = this._getState(tabId);
      state.isStopped = true;
      return;
    }
    this.isStopped = true;
  }

  resumeGeneration(tabId = null) {
    if (this.isExtensionMode) {
      const state = this._getState(tabId);
      state.isStopped = false;
      return;
    }
    this.isStopped = false;
  }

  /**
   * Clean up blob URLs (audio and BVMD)
   * @param {string[]} urls - Optional specific URLs to revoke, or all if not provided
   */
  cleanupBlobUrls(urls = null) {
    if (urls) {
      urls.forEach(url => {
        URL.revokeObjectURL(url);
        this.blobUrls.delete(url);
      });
      console.log(`[TTSService] Cleaned up ${urls.length} blob URLs`);
    } else {
      this.blobUrls.forEach(url => URL.revokeObjectURL(url));
      console.log(`[TTSService] Cleaned up all ${this.blobUrls.size} blob URLs`);
      this.blobUrls.clear();
    }
    
    // Also cleanup BVMD converter URLs
    if (this.bvmdConverter) {
      this.bvmdConverter.cleanup();
    }
  }

  /**
   * Check if TTS is currently playing audio
   * @returns {boolean} True if audio is playing
   */
  isCurrentlyPlaying(tabId = null) {
    if (this.isExtensionMode) {
      const state = this.tabStates.get(tabId);
      return state && state.isGenerating;
    }
    return this.isPlaying;
  }

  /**
   * Test TTS with sample text
   * @param {string} testText - Text to test with
   * @returns {Promise<boolean>} True if successful
   */
  async testConnection(testText = 'Hello, this is a test of the text to speech system.', tabId = null) {
    if (this.isExtensionMode) {
      if (!this.isConfigured(tabId)) throw new Error('TTSService not configured for this tab');
      const result = await this.generateSpeech(testText, false, tabId);
      return result && result.audioBuffer && result.audioBuffer.byteLength > 0;
    }

    if (!this.isConfigured()) throw new Error('TTSService not configured or disabled');
    console.log('[TTSService] Testing TTS connection...');
    try {
      const { audio, bvmdUrl } = await this.generateSpeech(testText, this.lipSyncEnabled);
      const audioUrl = URL.createObjectURL(audio);
      await this.playAudio(testText, audioUrl, bvmdUrl);
      URL.revokeObjectURL(audioUrl);
      if (bvmdUrl && this.bvmdConverter) this.bvmdConverter.cleanup(bvmdUrl);
      console.log('[TTSService] TTS test successful' + (bvmdUrl ? ' with lip sync' : ''));
      return true;
    } catch (error) {
      console.error('[TTSService] TTS test failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new TTSService();
