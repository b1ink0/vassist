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
    this.client = null;
    this.currentProvider = null;
    this.currentConfig = null;
    this.isEnabled = false;
    
    // Audio queue for sequential playback
    this.audioQueue = [];
    this.isPlaying = false;
    this.isStopped = false; // Flag to prevent new audio from starting after stop
    this.currentAudio = null;
    
    // Blob URL tracking for cleanup
    this.blobUrls = new Set();
    
    // Request throttling
    this.activeRequests = 0;
    this.maxConcurrentRequests = 3;
    
    // Lip sync generation support (VMD -> BVMD)
    this.lipSyncEnabled = true; // Enable lip sync generation by default
    this.vmdService = vmdGenerationService;
    this.bvmdConverter = null; // Will be initialized when scene is available
    
    // Callback for triggering animations (set by VirtualAssistant)
    this.onSpeakCallback = null; // (text, bvmdBlobUrl) => void
    
    // Callback for when audio finishes playing (for sliding window TTS generation)
    this.onAudioFinishedCallback = null; // () => void
    
    // Callback for when TTS is stopped/interrupted (to return animation to idle)
    this.onStopCallback = null; // () => void
    
    console.log('[TTSService] Initialized with lip sync support');
  }

  /**
   * Configure TTS client with provider settings
   * @param {Object} config - TTS configuration from aiConfig
   */
  configure(config) {
    const { provider, enabled } = config;
    
    this.isEnabled = enabled;
    
    if (!enabled) {
      console.log('[TTSService] TTS is disabled');
      return true;
    }
    
    console.log(`[TTSService] Configuring provider: ${provider}`);
    
    try {
      if (provider === TTSProviders.OPENAI) {
        // Configure OpenAI TTS client
        this.client = new OpenAI({
          apiKey: config.openai.apiKey,
          dangerouslyAllowBrowser: true,
        });
        
        this.currentConfig = {
          model: config.openai.model,
          voice: config.openai.voice,
          speed: config.openai.speed,
        };
        
        console.log('[TTSService] OpenAI TTS configured:', {
          model: this.currentConfig.model,
          voice: this.currentConfig.voice,
          speed: this.currentConfig.speed,
        });
      } 
      else if (provider === TTSProviders.OPENAI_COMPATIBLE) {
        // Configure Generic OpenAI-compatible TTS client
        // User provides complete base URL - we don't modify it
        this.client = new OpenAI({
          apiKey: config['openai-compatible'].apiKey || 'default',
          baseURL: config['openai-compatible'].endpoint,
          dangerouslyAllowBrowser: true,
        });
        
        this.currentConfig = {
          model: config['openai-compatible'].model,
          voice: config['openai-compatible'].voice,
          speed: config['openai-compatible'].speed,
        };
        
        console.log('[TTSService] Generic TTS configured:', {
          baseURL: config['openai-compatible'].endpoint,
          model: this.currentConfig.model,
          voice: this.currentConfig.voice,
        });
      } else {
        throw new Error(`Unknown TTS provider: ${provider}`);
      }
      
      this.currentProvider = provider;
      return true;
      
    } catch (error) {
      console.error('[TTSService] Configuration failed:', error);
      this.client = null;
      this.currentProvider = null;
      this.currentConfig = null;
      throw error;
    }
  }

  /**
   * Check if service is configured and enabled
   * @returns {boolean} True if ready
   */
  isConfigured() {
    return this.isEnabled && this.client !== null && this.currentConfig !== null;
  }

  /**
   * Get current provider name
   * @returns {string|null} Provider name or null
   */
  getCurrentProvider() {
    return this.currentProvider;
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
   * @returns {Promise<{audio: Blob, bvmdUrl: string|null}>} Audio blob and optional BVMD URL
   */
  async generateSpeech(text, generateLipSync = true) {
    if (!this.isConfigured()) {
      throw new Error('TTSService not configured or disabled');
    }

    // Silently skip if stopped (don't throw)
    if (this.isStopped) {
      return null;
    }

    // Throttle concurrent requests
    while (this.activeRequests >= this.maxConcurrentRequests) {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Silently skip if stopped while waiting
      if (this.isStopped) {
        return null;
      }
    }

    this.activeRequests++;

    try {
      console.log(`[TTSService] Generating speech (${text.length} chars)${generateLipSync && this.lipSyncEnabled ? ' with lip sync' : ''}`);

      const response = await this.client.audio.speech.create({
        model: this.currentConfig.model,
        voice: this.currentConfig.voice,
        input: text,
        speed: this.currentConfig.speed,
      });

      // Silently skip if stopped after API call
      if (this.isStopped) {
        return null;
      }

      // Convert response to blob
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });

      console.log(`[TTSService] Speech generated (${blob.size} bytes)`);
      
      // Generate lip sync if enabled
      let bvmdUrl = null;
      if (generateLipSync && this.lipSyncEnabled && this.bvmdConverter) {
        try {
          // Silently skip if stopped before lip sync
          if (this.isStopped) {
            return null;
          }
          
          console.log('[TTSService] Generating lip sync (VMD -> BVMD)...');
          
          // Step 1: Generate VMD from audio
          const vmdData = await this.vmdService.generateVMDFromAudio(blob);
          console.log(`[TTSService] VMD generated (${vmdData.byteLength} bytes)`);
          
          // Silently skip if stopped after VMD generation
          if (this.isStopped) {
            return null;
          }
          
          // Step 2: Convert VMD to BVMD
          bvmdUrl = await this.bvmdConverter.convertVMDToBVMD(vmdData);
          console.log(`[TTSService] BVMD URL created`);
          
        } catch (error) {
          console.error('[TTSService] Lip sync generation failed:', error);
          // Continue without lip sync
        }
      } else if (generateLipSync && this.lipSyncEnabled && !this.bvmdConverter) {
        console.warn('[TTSService] BVMD converter not initialized, skipping lip sync');
      }
      
      return { audio: blob, bvmdUrl };
      
    } catch (error) {
      console.error('[TTSService] Speech generation failed:', error);
      throw error;
    } finally {
      this.activeRequests--;
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
   * @returns {Promise<Array<{text: string, audioUrl: string, bvmdUrl: string|null}>>} Array of text, audio URLs and BVMD URLs
   */
  async generateChunkedSpeech(text, onChunkReady = null, maxChunkSize = 500, minChunkSize = 100) {
    if (!this.isConfigured()) {
      console.warn('[TTSService] TTS not configured, skipping speech generation');
      return [];
    }

    const chunks = this.chunkText(text, maxChunkSize, minChunkSize);
    const results = [];

    console.log(`[TTSService] Generating ${chunks.length} audio chunks${this.lipSyncEnabled ? ' with lip sync' : ''}`);

    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await this.generateSpeech(chunks[i], this.lipSyncEnabled);
        
        // Skip if generation was cancelled (returns null when stopped)
        if (!result) {
          console.log(`[TTSService] Chunk ${i + 1} generation cancelled`);
          continue;
        }
        
        const { audio, bvmdUrl } = result;
        const audioUrl = URL.createObjectURL(audio);
        
        // Track blob URL for cleanup
        this.blobUrls.add(audioUrl);
        
        const chunkResult = { text: chunks[i], audioUrl, bvmdUrl };
        results.push(chunkResult);

        // Notify callback
        if (onChunkReady) {
          onChunkReady(chunks[i], audioUrl, bvmdUrl, i, chunks.length);
        }

        console.log(`[TTSService] Chunk ${i + 1}/${chunks.length} ready${bvmdUrl ? ' with lip sync' : ''}`);
        
      } catch (error) {
        console.error(`[TTSService] Failed to generate chunk ${i + 1}:`, error);
        // Continue with remaining chunks
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
   */
  queueAudio(text, audioUrl, bvmdUrl = null) {
    // Don't queue if stopped
    if (this.isStopped) {
      console.log('[TTSService] Audio not queued - playback stopped');
      return;
    }
    
    this.audioQueue.push({ text, audioUrl, bvmdUrl });
    console.log(`[TTSService] Audio queued (${this.audioQueue.length} in queue)${bvmdUrl ? ' with lip sync' : ''}`);
    
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
      console.log('[TTSService] Queue empty, playback stopped');
      return;
    }

    this.isPlaying = true;
    const item = this.audioQueue.shift();
    
    // Handle both old format (string) and new format (object)
    const text = typeof item === 'object' ? item.text : '';
    const audioUrl = typeof item === 'string' ? item : item.audioUrl;
    const bvmdUrl = typeof item === 'object' ? item.bvmdUrl : null;

    try {
      await this.playAudio(text, audioUrl, bvmdUrl);
    } catch (error) {
      console.error('[TTSService] Playback error:', error);
    }

    // Trigger callback when this audio finishes (before playing next)
    // This is the RIGHT place - audio just finished, next one hasn't started yet
    if (this.onAudioFinishedCallback) {
      this.onAudioFinishedCallback();
    }

    // Play next in queue (will check isStopped flag)
    this.playNextInQueue();
  }

  /**
   * Play a single audio blob URL with optional BVMD lip sync
   * Triggers speak callback for animation synchronization
   * @param {string} text - Text being spoken
   * @param {string} audioUrl - Audio blob URL
   * @param {string|null} bvmdUrl - Optional BVMD blob URL for lip sync
   * @returns {Promise<void>} Resolves when audio finishes
   */
  playAudio(text, audioUrl, bvmdUrl = null) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      // Trigger speak callback when audio starts (syncs with animation)
      if (bvmdUrl && this.onSpeakCallback) {
        audio.addEventListener('play', () => {
          console.log('[TTSService] Audio playing, triggering speak animation');
          this.onSpeakCallback(text, bvmdUrl);
        }, { once: true });
      }

      audio.onended = () => {
        console.log('[TTSService] Audio playback finished');
        this.currentAudio = null;
        resolve();
      };

      audio.onerror = (error) => {
        console.error('[TTSService] Audio playback error:', error);
        this.currentAudio = null;
        reject(error);
      };

      audio.play().catch(reject);
      console.log('[TTSService] Audio playback started' + (bvmdUrl ? ' with lip sync' : ''));
    });
  }

  /**
   * Play audio chunks sequentially with BVMD lip sync
   * @param {Array<{text: string, audioUrl: string, bvmdUrl: string|null}>} items - Array of text, audio URLs and BVMD URLs
   * @returns {Promise<void>} Resolves when all audio finishes
   */
  async playAudioSequence(items) {
    console.log(`[TTSService] Playing ${items.length} audio chunks sequentially`);
    
    for (const item of items) {
      try {
        // Handle both old format (string) and new format (object)
        const text = typeof item === 'object' ? item.text : '';
        const audioUrl = typeof item === 'string' ? item : item.audioUrl;
        const bvmdUrl = typeof item === 'object' ? item.bvmdUrl : null;
        
        await this.playAudio(text, audioUrl, bvmdUrl);
      } catch (error) {
        console.error('[TTSService] Error playing audio chunk:', error);
        // Continue with next chunk
      }
    }
    
    console.log('[TTSService] Sequence playback complete');
  }

  /**
   * Stop current playback and clear queue
   */
  stopPlayback() {
    console.log('[TTSService] Stopping playback...');
    
    // Set stopped flag to prevent new audio from starting
    this.isStopped = true;
    
    // Stop current audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    
    // Clear queue
    this.audioQueue = [];
    this.isPlaying = false;
    
    console.log('[TTSService] Playback stopped and queue cleared');
    
    // Trigger stop callback to notify animation manager
    if (this.onStopCallback) {
      this.onStopCallback();
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
  isCurrentlyPlaying() {
    return this.isPlaying;
  }

  /**
   * Test TTS with sample text
   * @param {string} testText - Text to test with
   * @returns {Promise<boolean>} True if successful
   */
  async testConnection(testText = 'Hello, this is a test of the text to speech system.') {
    if (!this.isConfigured()) {
      throw new Error('TTSService not configured or disabled');
    }

    console.log('[TTSService] Testing TTS connection...');

    try {
      const { audio, bvmdUrl } = await this.generateSpeech(testText, this.lipSyncEnabled);
      const audioUrl = URL.createObjectURL(audio);
      
      // Play the test audio with BVMD if generated
      await this.playAudio(testText, audioUrl, bvmdUrl);
      
      // Cleanup
      URL.revokeObjectURL(audioUrl);
      if (bvmdUrl && this.bvmdConverter) {
        this.bvmdConverter.cleanup(bvmdUrl);
      }
      
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
