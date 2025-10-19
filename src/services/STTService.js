/**
 * STTService - Multi-provider Speech-to-Text service
 * 
 * Unified interface for Chrome AI Multimodal, OpenAI Whisper, and generic STT APIs.
 * Supports both one-shot transcription and continuous streaming for conversation mode.
 */

import OpenAI from 'openai';
import { STTProviders, DefaultSTTConfig } from '../config/aiConfig';
import storageManager from '../storage';
import ChromeAIValidator from './ChromeAIValidator';

class STTService {
  constructor() {
    this.isExtensionMode = __EXTENSION_MODE__;

    if (this.isExtensionMode) {
      this.tabStates = new Map();
      console.log('[STTService] Initialized (Extension mode - multi-tab)');
    } else {
      this.client = null;
      this.provider = null;
      this.config = null;
      this.enabled = false;

      this.chromeAISession = null;

      this.mediaRecorder = null;
      this.audioStream = null;
      this.audioChunks = [];
      this.isRecording = false;

      this.onTranscription = null;
      this.onError = null;
      this.onRecordingStart = null;
      this.onRecordingStop = null;

      console.log('[STTService] Initialized');
    }
  }

  initTab(tabId) {
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        client: null,
        config: null,
        provider: null,
        enabled: false,
        chromeAISession: null,
      });
      console.log(`[STTService] Tab ${tabId} initialized`);
    }
  }

  cleanupTab(tabId) {
    if (this.tabStates.has(tabId)) {
      this.tabStates.delete(tabId);
      console.log(`[STTService] Tab ${tabId} cleaned up`);
    }
  }

  _getState(tabId = null) {
    if (this.isExtensionMode) {
      this.initTab(tabId);
      return this.tabStates.get(tabId);
    }
    return this; // dev uses instance
  }

  /**
   * Configure STT client with provider settings
   * @param {Object} config - STT configuration from aiConfig
   * @param {number|null} tabId - Tab ID (extension mode only)
   */
  configure(config, tabId = null) {
    const state = this._getState(tabId);
    const { provider, enabled } = config;
    const logPrefix = this.isExtensionMode ? `[STTService] Tab ${tabId}` : '[STTService]';
    
    state.enabled = enabled;
    
    if (!enabled) {
      console.log(`${logPrefix} - STT is disabled`);
      return true;
    }
    
    console.log(`${logPrefix} - Configuring provider: ${provider}`);

    try {
      if (provider === STTProviders.CHROME_AI_MULTIMODAL) {
        if (!ChromeAIValidator.isSupported()) {
          throw new Error('Chrome AI not supported. Chrome 138+ required.');
        }

        state.config = {
          temperature: config['chrome-ai-multimodal'].temperature,
          topK: config['chrome-ai-multimodal'].topK,
        };
        state.provider = provider;

        console.log(`${logPrefix} - Chrome AI Multimodal configured:`, state.config);
      } else if (provider === STTProviders.OPENAI) {
        state.client = new OpenAI({
          apiKey: config.openai.apiKey,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });

        state.config = {
          model: config.openai.model,
          language: config.openai.language,
          temperature: config.openai.temperature,
        };
        state.provider = provider;

        console.log(`${logPrefix} - OpenAI Whisper configured:`, state.config);
      } else if (provider === STTProviders.OPENAI_COMPATIBLE) {
        state.client = new OpenAI({
          apiKey: config['openai-compatible'].apiKey || 'default',
          baseURL: config['openai-compatible'].endpoint,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });

        state.config = {
          model: config['openai-compatible'].model,
          language: config['openai-compatible'].language,
          temperature: config['openai-compatible'].temperature,
        };
        state.provider = provider;

        console.log(`${logPrefix} - Generic STT configured:`, { baseURL: config['openai-compatible'].endpoint });
      } else {
        throw new Error(`Unknown STT provider: ${provider}`);
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

  /**
   * Check if service is configured and ready
   * @returns {boolean} True if ready
   */
  isConfigured(tabId = null) {
    const state = this._getState(tabId);
    if (!state || !state.enabled || !state.config) return false;
    if (state.provider === 'chrome-ai-multimodal') return true;
    return state.client !== null;
  }

  /**
   * Check if currently recording
   * @returns {boolean} True if recording
   */
  isCurrentlyRecording() {
    return this.isRecording;
  }

  /**
   * Start recording audio from microphone
   * @returns {Promise<boolean>} Success status
   */
  async startRecording() {
    if (!this.isConfigured()) {
      throw new Error('STTService not configured. Enable STT and configure settings first.');
    }

    if (this.isRecording) {
      console.warn('[STTService] Already recording');
      return false;
    }

    try {
      console.log('[STTService] Requesting microphone access...');
      
      // Request microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });

      // Create MediaRecorder
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.audioStream, { mimeType });
      this.audioChunks = [];

      // Setup event handlers
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        console.log('[STTService] Recording stopped, processing...');
        
        try {
          // Create audio blob
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          console.log(`[STTService] Audio blob created: ${audioBlob.size} bytes`);

          // Cleanup audio resources immediately
          this.cleanup();
          
          // Windows headset fix: Wait for audio device to switch from input to output
          // This delay allows the hardware to properly release the microphone before
          // TTS tries to use the speakers. Configurable in STT settings.
          let switchDelay = 300; // Default
          try {
            const sttConfig = await storageManager.config.load('sttConfig', DefaultSTTConfig);
            switchDelay = sttConfig.audioDeviceSwitchDelay || 300;
          } catch (error) {
            console.error('[STTService] Failed to load STT config:', error);
          }
          
          console.log(`[STTService] Waiting ${switchDelay}ms for audio device switch...`);
          await new Promise(resolve => setTimeout(resolve, switchDelay));

          // Transcribe - this is the slow part
          const transcription = await this.transcribeAudio(audioBlob);
          
          // Now that transcription is complete, call callbacks
          if (this.onTranscription) {
            this.onTranscription(transcription);
          }
          
          // Call stop callback AFTER transcription completes
          if (this.onRecordingStop) {
            this.onRecordingStop();
          }
        } catch (error) {
          console.error('[STTService] Transcription failed:', error);
          this.cleanup();
          if (this.onError) {
            this.onError(error);
          }
          // Still call stop callback even on error
          if (this.onRecordingStop) {
            this.onRecordingStop();
          }
        }
      };

      this.mediaRecorder.onerror = (error) => {
        console.error('[STTService] MediaRecorder error:', error);
        if (this.onError) {
          this.onError(error);
        }
        this.cleanup();
      };

      // Start recording
      this.mediaRecorder.start();
      this.isRecording = true;
      
      console.log('[STTService] Recording started');
      
      if (this.onRecordingStart) {
        this.onRecordingStart();
      }
      
      return true;
      
    } catch (error) {
      console.error('[STTService] Failed to start recording:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Stop recording audio
   */
  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      console.warn('[STTService] Not recording');
      return;
    }

    console.log('[STTService] Stopping recording...');
    this.mediaRecorder.stop();
    this.isRecording = false;
  }

  /**
   * Transcribe audio blob to text
   * @param {Blob|ArrayBuffer} input - Audio data to transcribe (Blob in dev, ArrayBuffer in extension)
   * @param {string|number|null} maybeMimeOrTabId - MIME type (dev) or Tab ID (extension)
   * @param {number|null} maybeTabId - Tab ID (extension mode only)
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudio(input, maybeMimeOrTabId = null, maybeTabId = null) {
    const tabId = this.isExtensionMode ? maybeTabId : null;
    const state = this._getState(tabId);
    const logPrefix = this.isExtensionMode ? `[STTService] Tab ${tabId}` : '[STTService]';
    
    if (!this.isConfigured(tabId)) {
      throw new Error('STTService not configured');
    }

    let audioBlob;
    if (this.isExtensionMode) {
      const arrayBuffer = input;
      const mimeType = maybeMimeOrTabId;
      audioBlob = new Blob([arrayBuffer], { type: mimeType });
      console.log(`${logPrefix} - Transcribing audio (${arrayBuffer.byteLength} bytes) with ${state.provider}...`);
    } else {
      audioBlob = input;
      console.log(`${logPrefix} - Transcribing audio (${audioBlob.size} bytes) with ${state.provider}...`);
    }

    if (state.provider === STTProviders.CHROME_AI_MULTIMODAL || state.provider === 'chrome-ai-multimodal') {
      return await this.transcribeAudioChromeAI(this.isExtensionMode ? input : audioBlob, tabId);
    }

    try {
      const audioFile = new File([audioBlob], 'recording.webm', { type: audioBlob.type });
      const params = { 
        file: audioFile, 
        model: state.config.model 
      };
      
      if (state.config.language) {
        params.language = state.config.language;
      }
      if (state.config.temperature !== undefined) {
        params.temperature = state.config.temperature;
      }
      
      const transcription = await state.client.audio.transcriptions.create(params);
      const text = transcription.text.trim();
      
      console.log(`${logPrefix} - Transcription complete: "${text}"`);
      return text;
    } catch (error) {
      console.error(`${logPrefix} - Transcription API error:`, error);
      
      if (error.message?.includes('401')) {
        throw new Error('Invalid STT API key. Please check your configuration.');
      }
      if (error.message?.includes('429')) {
        throw new Error('STT rate limit exceeded. Please try again later.');
      }
      if (error.message?.includes('fetch')) {
        throw new Error('STT network error. Please check your connection and endpoint URL.');
      }
      throw error;
    }
  }

  /**
   * Transcribe audio using Chrome AI Multimodal
   * @param {Blob} audioBlob - Audio data to transcribe
   * @param {number|null} tabId - Tab ID (extension mode only)
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudioChromeAI(input, tabId = null) {
    try {
      let arrayBuffer;
      if (this.isExtensionMode) {
        // input is ArrayBuffer
        arrayBuffer = input;
      } else {
        arrayBuffer = await input.arrayBuffer();
        console.log(`[STTService] Audio converted to ArrayBuffer (${arrayBuffer.byteLength} bytes)`);
        console.log(`[STTService] Audio blob type: ${input.type}`);
      }

      const params = await self.LanguageModel.params();

      const state = this.isExtensionMode ? this._getState(tabId) : this;
      if (!state.chromeAISession) {
        console.log('[STTService] Creating Chrome AI multimodal session...');
        state.chromeAISession = await self.LanguageModel.create({
          expectedInputs: [{ type: 'audio' }],
          temperature: 0.1,
          topK: params.defaultTopK,
        });
        console.log('[STTService] Chrome AI multimodal session created');
      }

      console.log('[STTService] Sending prompt to Chrome AI...');
      const stream = state.chromeAISession.promptStreaming([
        {
          role: 'user',
          content: [
            { type: 'text', value: 'transcribe this audio' },
            { type: 'audio', value: arrayBuffer }
          ]
        }
      ]);

      let fullResponse = '';
      for await (const chunk of stream) {
        fullResponse += chunk;
      }

      const text = fullResponse.trim();
      console.log(`[STTService] Chrome AI transcription complete: "${text}"`);
      return text;
    } catch (error) {
      console.error('[STTService] Chrome AI transcription error:', error);
      const state = this.isExtensionMode ? this._getState(tabId) : this;
      if (state.chromeAISession) {
        try {
          state.chromeAISession.destroy();
        } catch {
          // ignore destroy errors
        }
        state.chromeAISession = null;
      }
      if (error.name === 'NotSupportedError') {
        throw new Error('Chrome AI multimodal not available. Enable multimodal-input flag at chrome://flags');
      } else if (error.name === 'QuotaExceededError') {
        throw new Error('Chrome AI context limit exceeded. Start a new conversation.');
      } else {
        throw error;
      }
    }
  }

  /**
   * Test STT with a sample recording
   * @param {number} duration - Recording duration in seconds (default: 3)
   * @returns {Promise<string>} Transcribed text
   */
  async testRecording(duration = 3) {
    return new Promise((resolve, reject) => {
      // Setup temporary callbacks
      const originalTranscription = this.onTranscription;
      const originalError = this.onError;
      
      this.onTranscription = (text) => {
        this.onTranscription = originalTranscription;
        this.onError = originalError;
        resolve(text);
      };
      
      this.onError = (error) => {
        this.onTranscription = originalTranscription;
        this.onError = originalError;
        reject(error);
      };
      
      // Start recording
      this.startRecording().then(() => {
        // Auto-stop after duration
        setTimeout(() => {
          this.stopRecording();
        }, duration * 1000);
      }).catch(reject);
    });
  }

  /**
   * Get supported MIME type for MediaRecorder
   * @returns {string} Supported MIME type
   */
  getSupportedMimeType() {
    const types = [
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
      'audio/wav',
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log(`[STTService] Using MIME type: ${type}`);
        return type;
      }
    }
    
    console.warn('[STTService] No preferred MIME type supported, using default');
    return '';
  }

  /**
   * Cleanup recording resources
   */
  cleanup() {
    console.log('[STTService] Cleaning up recording resources...');
    
    if (this.audioStream) {
      // Stop all tracks to release microphone
      this.audioStream.getTracks().forEach(track => {
        track.stop();
        console.log(`[STTService] Stopped audio track: ${track.kind}`);
      });
      this.audioStream = null;
    }
    
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    
    console.log('[STTService] Cleanup complete');
  }

  /**
   * Set transcription callback
   * @param {Function} callback - Callback function (text: string) => void
   */
  setTranscriptionCallback(callback) {
    this.onTranscription = callback;
  }

  /**
   * Set error callback
   * @param {Function} callback - Callback function (error: Error) => void
   */
  setErrorCallback(callback) {
    this.onError = callback;
  }

  /**
   * Set recording start callback
   * @param {Function} callback - Callback function () => void
   */
  setRecordingStartCallback(callback) {
    this.onRecordingStart = callback;
  }

  /**
   * Set recording stop callback
   * @param {Function} callback - Callback function () => void
   */
  setRecordingStopCallback(callback) {
    this.onRecordingStop = callback;
  }
}

// Export singleton instance
export default new STTService();
