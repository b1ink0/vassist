/**
 * STTService - Multi-provider Speech-to-Text service
 * 
 * Unified interface for OpenAI Whisper and generic OpenAI-compatible STT APIs.
 * Supports both one-shot transcription and continuous streaming for conversation mode.
 */

import OpenAI from 'openai';
import { STTProviders, DefaultSTTConfig } from '../config/aiConfig';
import StorageManager from '../managers/StorageManager';

class STTService {
  constructor() {
    this.client = null;
    this.currentProvider = null;
    this.currentConfig = null;
    this.isEnabled = false;
    
    // Recording state
    this.mediaRecorder = null;
    this.audioStream = null;
    this.audioChunks = [];
    this.isRecording = false;
    
    // Callbacks
    this.onTranscription = null;
    this.onError = null;
    this.onRecordingStart = null;
    this.onRecordingStop = null;
    
    console.log('[STTService] Initialized');
  }

  /**
   * Configure STT client with provider settings
   * @param {Object} config - STT configuration from aiConfig
   */
  configure(config) {
    const { provider, enabled } = config;
    
    this.isEnabled = enabled;
    
    if (!enabled) {
      console.log('[STTService] STT is disabled');
      return true;
    }
    
    console.log(`[STTService] Configuring provider: ${provider}`);
    
    try {
      if (provider === STTProviders.OPENAI) {
        // Configure OpenAI Whisper client
        this.client = new OpenAI({
          apiKey: config.openai.apiKey,
          dangerouslyAllowBrowser: true,
        });
        
        this.currentConfig = {
          model: config.openai.model,
          language: config.openai.language,
          temperature: config.openai.temperature,
        };
        
        console.log('[STTService] OpenAI Whisper configured:', {
          model: this.currentConfig.model,
          language: this.currentConfig.language,
        });
      } 
      else if (provider === STTProviders.OPENAI_COMPATIBLE) {
        // Configure Generic OpenAI-compatible STT client
        // User provides complete base URL - we don't modify it
        this.client = new OpenAI({
          apiKey: config['openai-compatible'].apiKey || 'default',
          baseURL: config['openai-compatible'].endpoint,
          dangerouslyAllowBrowser: true,
        });
        
        this.currentConfig = {
          model: config['openai-compatible'].model,
          language: config['openai-compatible'].language,
          temperature: config['openai-compatible'].temperature,
        };
        
        console.log('[STTService] Generic STT configured:', {
          baseURL: config['openai-compatible'].endpoint,
          model: this.currentConfig.model,
        });
      } else {
        throw new Error(`Unknown STT provider: ${provider}`);
      }
      
      this.currentProvider = provider;
      return true;
      
    } catch (error) {
      console.error('[STTService] Configuration failed:', error);
      this.client = null;
      this.currentProvider = null;
      this.currentConfig = null;
      throw error;
    }
  }

  /**
   * Check if service is configured and ready
   * @returns {boolean} True if ready
   */
  isConfigured() {
    return this.isEnabled && this.client !== null && this.currentConfig !== null;
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
          const sttConfig = StorageManager.getConfig('sttConfig', DefaultSTTConfig);
          const switchDelay = sttConfig.audioDeviceSwitchDelay || 300;
          
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
   * @param {Blob} audioBlob - Audio data to transcribe
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudio(audioBlob) {
    if (!this.isConfigured()) {
      throw new Error('STTService not configured');
    }

    try {
      // Convert blob to File object (required by OpenAI API)
      const audioFile = new File([audioBlob], 'recording.webm', { type: audioBlob.type });
      
      console.log(`[STTService] Transcribing audio (${audioFile.size} bytes)...`);

      // Prepare transcription parameters
      const params = {
        file: audioFile,
        model: this.currentConfig.model,
      };

      // Add optional parameters
      if (this.currentConfig.language) {
        params.language = this.currentConfig.language;
      }
      if (this.currentConfig.temperature !== undefined) {
        params.temperature = this.currentConfig.temperature;
      }

      // Call API
      const transcription = await this.client.audio.transcriptions.create(params);
      
      const text = transcription.text.trim();
      console.log(`[STTService] Transcription complete: "${text}"`);
      
      return text;
      
    } catch (error) {
      console.error('[STTService] Transcription API error:', error);
      
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
