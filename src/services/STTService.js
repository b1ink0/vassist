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
import Logger from './LoggerService';

class STTService {
  constructor() {
    this.isExtensionMode = __EXTENSION_MODE__;

    if (this.isExtensionMode) {
      this.tabStates = new Map();
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
      Logger.log('STTService', `Tab ${tabId} initialized`);
    }
  }

  cleanupTab(tabId) {
    if (this.tabStates.has(tabId)) {
      this.tabStates.delete(tabId);
      Logger.log('STTService', `Tab ${tabId} cleaned up`);
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
      Logger.log('other', `${logPrefix} - STT is disabled`);
      return true;
    }
    
    Logger.log('other', `${logPrefix} - Configuring provider: ${provider}`);

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

        Logger.log('other', `${logPrefix} - Chrome AI Multimodal configured:`, state.config);
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

        Logger.log('other', `${logPrefix} - OpenAI Whisper configured:`, state.config);
      } else if (provider === STTProviders.OPENAI_COMPATIBLE) {
        // Normalize endpoint to ensure /v1 is present (OpenAI SDK appends /audio/transcriptions to baseURL)
        let endpoint = config['openai-compatible'].endpoint;
        if (!endpoint.endsWith('/v1')) {
          endpoint = endpoint.replace(/\/$/, '') + '/v1';
        }

        state.client = new OpenAI({
          apiKey: config['openai-compatible'].apiKey || 'default',
          baseURL: endpoint,
          dangerouslyAllowBrowser: !this.isExtensionMode,
        });

        state.config = {
          model: config['openai-compatible'].model,
          language: config['openai-compatible'].language,
          temperature: config['openai-compatible'].temperature,
        };
        state.provider = provider;

        Logger.log('other', `${logPrefix} - Generic STT configured:`, { baseURL: endpoint });
      } else if (provider === STTProviders.ANDROID_LOCAL) {
        const androidConfig = config['android-local'] || {};
        let endpoint = androidConfig.endpoint || 'http://127.0.0.1:8765';
        
        if (!endpoint.endsWith('/v1')) {
          endpoint = endpoint.replace(/\/$/, '') + '/v1';
        }
        
        state.client = new OpenAI({
          apiKey: 'android-local',
          baseURL: endpoint,
          dangerouslyAllowBrowser: true,
        });

        state.config = {
          model: androidConfig.model || 'whisper-local',
          language: androidConfig.language || 'en',
        };
        state.provider = provider;

        Logger.log('other', `${logPrefix} - Android local STT configured:`, { baseURL: endpoint });
      } else if (provider === STTProviders.DESKTOP_LOCAL) {
        const desktopConfig = config['desktop-local'] || {};
        let endpoint = desktopConfig.endpoint || 'http://127.0.0.1:11438';
        
        if (!endpoint.endsWith('/v1')) {
          endpoint = endpoint.replace(/\/$/, '') + '/v1';
        }
        
        state.client = new OpenAI({
          apiKey: 'desktop-local',
          baseURL: endpoint,
          dangerouslyAllowBrowser: true,
        });

        state.config = {
          model: desktopConfig.model || 'whisper-base',
          language: desktopConfig.language || 'en',
        };
        state.provider = provider;

        Logger.log('other', `${logPrefix} - Desktop local STT configured:`, { baseURL: endpoint });
      } else {
        throw new Error(`Unknown STT provider: ${provider}`);
      }

      return true;
    } catch (error) {
      Logger.error('other', `${logPrefix} - Configuration failed:`, error);
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
   * @param {string|null} deviceId - Optional microphone device ID
   * @returns {Promise<boolean>} Success status
   */
  async startRecording(deviceId = null) {
    if (!this.isConfigured()) {
      throw new Error('STTService not configured. Enable STT and configure settings first.');
    }

    if (this.isRecording) {
      Logger.warn('STTService', 'Already recording');
      return false;
    }

    try {
      Logger.log('STTService', 'Requesting microphone access...');
      
      // Request microphone access with optional deviceId
      const constraints = { 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      };
      
      if (deviceId) {
        constraints.audio.deviceId = { exact: deviceId };
      }
      
      this.audioStream = await navigator.mediaDevices.getUserMedia(constraints);

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
        Logger.log('STTService', 'Recording stopped, processing...');
        
        try {
          // Create audio blob
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          Logger.log('STTService', `Audio blob created: ${audioBlob.size} bytes`);

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
            Logger.error('STTService', 'Failed to load STT config:', error);
          }
          
          Logger.log('STTService', `Waiting ${switchDelay}ms for audio device switch...`);
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
          Logger.error('STTService', 'Transcription failed:', error);
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
        Logger.error('STTService', 'MediaRecorder error:', error);
        if (this.onError) {
          this.onError(error);
        }
        this.cleanup();
      };

      // Start recording
      this.mediaRecorder.start();
      this.isRecording = true;
      
      Logger.log('STTService', 'Recording started');
      
      if (this.onRecordingStart) {
        this.onRecordingStart();
      }
      
      return true;
      
    } catch (error) {
      Logger.error('STTService', 'Failed to start recording:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Stop recording audio
   */
  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      Logger.warn('STTService', 'Not recording');
      return;
    }

    Logger.log('STTService', 'Stopping recording...');
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
      Logger.log('other', `${logPrefix} - Transcribing audio (${arrayBuffer.byteLength} bytes) with ${state.provider}...`);
    } else {
      audioBlob = input;
      Logger.log('other', `${logPrefix} - Transcribing audio (${audioBlob.size} bytes) with ${state.provider}...`);
    }

    if (state.provider === STTProviders.CHROME_AI_MULTIMODAL || state.provider === 'chrome-ai-multimodal') {
      return await this.transcribeAudioChromeAI(this.isExtensionMode ? input : audioBlob, tabId);
    }

    try {
      let fileBlob = audioBlob;
      let fileName = 'recording.webm';
      
      if (state.provider === STTProviders.ANDROID_LOCAL || state.provider === 'android-local' ||
          state.provider === STTProviders.DESKTOP_LOCAL || state.provider === 'desktop-local') {
        Logger.log('other', `${logPrefix} - Converting audio to WAV for local STT...`);
        fileBlob = await this.convertToWav(audioBlob);
        fileName = 'recording.wav';
        Logger.log('other', `${logPrefix} - Converted to WAV: ${fileBlob.size} bytes`);
      }
      
      const audioFile = new File([fileBlob], fileName, { type: fileBlob.type });
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
      
      Logger.log('other', `${logPrefix} - Transcription complete: "${text}"`);
      return text;
    } catch (error) {
      Logger.error('other', `${logPrefix} - Transcription API error:`, error);
      
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
        Logger.log('STTService', `Audio converted to ArrayBuffer (${arrayBuffer.byteLength} bytes)`);
        Logger.log('STTService', `Audio blob type: ${input.type}`);
      }

      const params = await self.LanguageModel.params();

      const state = this.isExtensionMode ? this._getState(tabId) : this;
      if (!state.chromeAISession) {
        Logger.log('STTService', 'Creating Chrome AI multimodal session...');
        state.chromeAISession = await self.LanguageModel.create({
          expectedInputs: [{ type: 'audio' }],
          temperature: 0.1,
          topK: params.defaultTopK,
        });
        Logger.log('STTService', 'Chrome AI multimodal session created');
      }

      Logger.log('STTService', 'Sending prompt to Chrome AI...');
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
      Logger.log('STTService', `Chrome AI transcription complete: "${text}"`);
      return text;
    } catch (error) {
      Logger.error('STTService', 'Chrome AI transcription error:', error);
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
   * @param {string|null} deviceId - Optional microphone device ID
   * @returns {Promise<string>} Transcribed text
   */
  async testRecording(duration = 3, deviceId = null) {
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
      
      // Start recording with deviceId
      this.startRecording(deviceId).then(() => {
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
        Logger.log('STTService', `Using MIME type: ${type}`);
        return type;
      }
    }
    
    Logger.warn('STTService', 'No preferred MIME type supported, using default');
    return '';
  }

  /**
   * Cleanup recording resources
   */
  cleanup() {
    Logger.log('STTService', 'Cleaning up recording resources...');
    
    if (this.audioStream) {
      // Stop all tracks to release microphone
      this.audioStream.getTracks().forEach(track => {
        track.stop();
        Logger.log('STTService', `Stopped audio track: ${track.kind}`);
      });
      this.audioStream = null;
    }
    
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    
    Logger.log('STTService', 'Cleanup complete');
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

  /**
   * Convert an audio blob to WAV format at 16kHz mono (required for sherpa-onnx Whisper)
   * @param {Blob} audioBlob - Input audio blob (webm, mp4, etc.)
   * @returns {Promise<Blob>} WAV formatted audio blob
   */
  async convertToWav(audioBlob) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Target: 16kHz mono
      const targetSampleRate = 16000;
      const numChannels = 1;
      const duration = audioBuffer.duration;
      const numSamples = Math.floor(duration * targetSampleRate);
      
      // Get mono audio data (mix channels if stereo)
      let channelData;
      if (audioBuffer.numberOfChannels === 1) {
        channelData = audioBuffer.getChannelData(0);
      } else {
        // Mix stereo to mono
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        channelData = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
          channelData[i] = (left[i] + right[i]) / 2;
        }
      }
      
      // Resample if necessary
      let samples;
      if (audioBuffer.sampleRate !== targetSampleRate) {
        const ratio = audioBuffer.sampleRate / targetSampleRate;
        samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          const srcIndex = i * ratio;
          const srcIndexFloor = Math.floor(srcIndex);
          const srcIndexCeil = Math.min(srcIndexFloor + 1, channelData.length - 1);
          const t = srcIndex - srcIndexFloor;
          samples[i] = channelData[srcIndexFloor] * (1 - t) + channelData[srcIndexCeil] * t;
        }
      } else {
        samples = channelData;
      }
      
      const wavBuffer = this.createWavBuffer(samples, targetSampleRate, numChannels);
      
      audioContext.close();
      return new Blob([wavBuffer], { type: 'audio/wav' });
    } catch (error) {
      audioContext.close();
      throw error;
    }
  }

  /**
   * Create a WAV file buffer from float samples
   */
  createWavBuffer(samples, sampleRate, numChannels) {
    const bytesPerSample = 2; // 16-bit
    const dataLength = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    
    // WAV header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
    view.setUint16(32, numChannels * bytesPerSample, true); // block align
    view.setUint16(34, bytesPerSample * 8, true); // bits per sample
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
    
    return buffer;
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

// Export singleton instance
export default new STTService();
