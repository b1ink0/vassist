/**
 * TTSService - Multi-provider Text-to-Speech service
 * 
 * Unified interface for OpenAI TTS and Ollama TTS (via OpenAI-compatible API).
 * Supports streaming TTS generation with intelligent chunking and audio queue management.
 */

import OpenAI from 'openai';
import { TTSProviders } from '../config/aiConfig';

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
    
    console.log('[TTSService] Initialized');
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
   * Generate speech from text
   * @param {string} text - Text to convert to speech
   * @returns {Promise<Blob>} Audio blob
   */
  async generateSpeech(text) {
    if (!this.isConfigured()) {
      throw new Error('TTSService not configured or disabled');
    }

    // Throttle concurrent requests
    while (this.activeRequests >= this.maxConcurrentRequests) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.activeRequests++;

    try {
      console.log(`[TTSService] Generating speech (${text.length} chars)`);

      const response = await this.client.audio.speech.create({
        model: this.currentConfig.model,
        voice: this.currentConfig.voice,
        input: text,
        speed: this.currentConfig.speed,
      });

      // Convert response to blob
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });

      console.log(`[TTSService] Speech generated (${blob.size} bytes)`);
      
      return blob;
      
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
   * Generate and queue audio chunks from text
   * @param {string} text - Full text to convert
   * @param {Function} onChunkReady - Callback when chunk is ready: (audioUrl: string, index: number, total: number) => void
   * @param {number} maxChunkSize - Maximum chunk size
   * @param {number} minChunkSize - Minimum chunk size
   * @returns {Promise<string[]>} Array of audio blob URLs
   */
  async generateChunkedSpeech(text, onChunkReady = null, maxChunkSize = 500, minChunkSize = 100) {
    if (!this.isConfigured()) {
      console.warn('[TTSService] TTS not configured, skipping speech generation');
      return [];
    }

    const chunks = this.chunkText(text, maxChunkSize, minChunkSize);
    const audioUrls = [];

    console.log(`[TTSService] Generating ${chunks.length} audio chunks`);

    for (let i = 0; i < chunks.length; i++) {
      try {
        const blob = await this.generateSpeech(chunks[i]);
        const url = URL.createObjectURL(blob);
        
        // Track blob URL for cleanup
        this.blobUrls.add(url);
        audioUrls.push(url);

        // Notify callback
        if (onChunkReady) {
          onChunkReady(url, i, chunks.length);
        }

        console.log(`[TTSService] Chunk ${i + 1}/${chunks.length} ready`);
        
      } catch (error) {
        console.error(`[TTSService] Failed to generate chunk ${i + 1}:`, error);
        // Continue with remaining chunks
      }
    }

    return audioUrls;
  }

  /**
   * Add audio to playback queue
   * @param {string} audioUrl - Audio blob URL
   */
  queueAudio(audioUrl) {
    // Don't queue if stopped
    if (this.isStopped) {
      console.log('[TTSService] Audio not queued - playback stopped');
      return;
    }
    
    this.audioQueue.push(audioUrl);
    console.log(`[TTSService] Audio queued (${this.audioQueue.length} in queue)`);
    
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
    const audioUrl = this.audioQueue.shift();

    try {
      await this.playAudio(audioUrl);
    } catch (error) {
      console.error('[TTSService] Playback error:', error);
    }

    // Play next in queue (will check isStopped flag)
    this.playNextInQueue();
  }

  /**
   * Play a single audio blob URL
   * @param {string} audioUrl - Audio blob URL
   * @returns {Promise<void>} Resolves when audio finishes
   */
  playAudio(audioUrl) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

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
      console.log('[TTSService] Audio playback started');
    });
  }

  /**
   * Play audio chunks sequentially
   * @param {string[]} audioUrls - Array of audio blob URLs
   * @returns {Promise<void>} Resolves when all audio finishes
   */
  async playAudioSequence(audioUrls) {
    console.log(`[TTSService] Playing ${audioUrls.length} audio chunks sequentially`);
    
    for (const url of audioUrls) {
      try {
        await this.playAudio(url);
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
   * Clean up blob URLs
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
      const blob = await this.generateSpeech(testText);
      const url = URL.createObjectURL(blob);
      
      // Play the test audio
      await this.playAudio(url);
      
      // Cleanup
      URL.revokeObjectURL(url);
      
      console.log('[TTSService] TTS test successful');
      return true;
      
    } catch (error) {
      console.error('[TTSService] TTS test failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new TTSService();
