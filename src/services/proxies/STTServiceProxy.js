/**
 * STT Service Proxy
 * Dual-mode wrapper for STTService
 * Dev mode: Direct recording + transcription
 * Extension mode: Content captures audio, offscreen processes, background transcribes
 */

import { ServiceProxy } from './ServiceProxy.js';
import STTService from '../STTService.js';
import { MessageTypes } from '../../../extension/shared/MessageTypes.js';
import Logger from '../LoggerService';

class STTServiceProxy extends ServiceProxy {
  constructor() {
    super('STTService');
    this.directService = STTService;
  }

  /**
   * Configure STT client with provider settings
   * @param {Object} config - STT configuration
   */
  async configure(config) {
    if (this.isExtension) {
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('STTServiceProxy: Bridge not available');
      const response = await bridge.sendMessage(
        MessageTypes.STT_CONFIGURE,
        { config }
      );
      return response.configured;
    } else {
      return this.directService.configure(config);
    }
  }

  /**
   * Check if service is configured and ready
   * @returns {boolean} True if ready
   */
  isConfigured() {
    if (this.isExtension) {
      return true; // Trust background state
    } else {
      return this.directService.isConfigured();
    }
  }

  /**
   * Check if currently recording
   * @returns {boolean} True if recording
   */
  isCurrentlyRecording() {
    if (this.isExtension) {
      // In extension mode, we track locally
      return this._isRecording || false;
    } else {
      return this.directService.isCurrentlyRecording();
    }
  }

  /**
   * Start recording audio from microphone
   * @returns {Promise<boolean>} Success status
   */
  async startRecording() {
    if (this.isExtension) {
      // In extension mode, recording happens in content script
      // We use MediaRecorder directly here
      if (this._isRecording) {
        Logger.warn('STTServiceProxy', 'Already recording');
        return false;
      }

      try {
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
          try {
            // Create audio blob
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });
            
            // Convert blob to ArrayBuffer, then to plain Array (like TTS does)
            // This is necessary because Chrome's postMessage/sendMessage cannot handle Blobs
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioData = Array.from(new Uint8Array(arrayBuffer));
            
            Logger.log('STTServiceProxy', `Converted audio to Array: ${audioData.length} bytes`);
            
            // Cleanup local resources
            this.cleanup();
            
            // Send to background for transcription
            const bridge = await this.waitForBridge();
            if (!bridge) throw new Error('STTServiceProxy: Bridge not available');
            
            const response = await bridge.sendMessage(
              MessageTypes.STT_TRANSCRIBE_AUDIO,
              { audioBuffer: audioData, mimeType },
              { timeout: 60000 }
            );
            
            // Call transcription callback
            if (this.onTranscription) {
              this.onTranscription(response.text);
            }
            
            // Call stop callback
            if (this.onRecordingStop) {
              this.onRecordingStop();
            }
          } catch (error) {
            Logger.error('STTServiceProxy', 'Transcription failed:', error);
            if (this.onError) {
              this.onError(error);
            }
            if (this.onRecordingStop) {
              this.onRecordingStop();
            }
          }
        };

        this.mediaRecorder.onerror = (error) => {
          Logger.error('STTServiceProxy', 'MediaRecorder error:', error);
          if (this.onError) {
            this.onError(error);
          }
          this.cleanup();
        };

        // Start recording
        this.mediaRecorder.start();
        this._isRecording = true;
        
        if (this.onRecordingStart) {
          this.onRecordingStart();
        }
        
        return true;
      } catch (error) {
        Logger.error('STTServiceProxy', 'Failed to start recording:', error);
        this.cleanup();
        throw error;
      }
    } else {
      return await this.directService.startRecording();
    }
  }

  /**
   * Stop recording audio
   */
  stopRecording() {
    if (this.isExtension) {
      if (!this._isRecording || !this.mediaRecorder) {
        Logger.warn('STTServiceProxy', 'Not recording');
        return;
      }

      this.mediaRecorder.stop();
      this._isRecording = false;
    } else {
      this.directService.stopRecording();
    }
  }

  /**
   * Transcribe audio blob to text
   * @param {Blob} audioBlob - Audio data to transcribe
   * @returns {Promise<string>} Transcribed text
   */
  async transcribeAudio(audioBlob) {
    if (this.isExtension) {
      // Convert blob to ArrayBuffer, then to plain Array (like TTS does)
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = Array.from(new Uint8Array(arrayBuffer));
      const mimeType = audioBlob.type || 'audio/webm';
      
      Logger.log('STTServiceProxy', `Transcribing audio: ${audioData.length} bytes, type: ${mimeType}`);
      
      const bridge = await this.waitForBridge();
      if (!bridge) throw new Error('STTServiceProxy: Bridge not available');
      
      const response = await bridge.sendMessage(
        MessageTypes.STT_TRANSCRIBE_AUDIO,
        { audioBuffer: audioData, mimeType },
        { timeout: 60000 }
      );
      return response.text || '';
    } else {
      return await this.directService.transcribeAudio(audioBlob);
    }
  }

  /**
   * Test STT with a sample recording
   * @param {number} duration - Recording duration in seconds
   * @returns {Promise<string>} Transcribed text
   */
  async testRecording(duration = 3) {
    if (this.isExtension) {
      return new Promise((resolve, reject) => {
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
        
        this.startRecording().then(() => {
          setTimeout(() => {
            this.stopRecording();
          }, duration * 1000);
        }).catch(reject);
      });
    } else {
      return await this.directService.testRecording(duration);
    }
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
        return type;
      }
    }
    
    return '';
  }

  /**
   * Cleanup recording resources
   */
  cleanup() {
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    
    this.mediaRecorder = null;
    this.audioChunks = [];
    this._isRecording = false;
  }

  /**
   * Set transcription callback
   * @param {Function} callback - Callback function (text: string) => void
   */
  setTranscriptionCallback(callback) {
    this.onTranscription = callback;
    if (!this.isExtension) {
      this.directService.setTranscriptionCallback(callback);
    }
  }

  /**
   * Set error callback
   * @param {Function} callback - Callback function (error: Error) => void
   */
  setErrorCallback(callback) {
    this.onError = callback;
    if (!this.isExtension) {
      this.directService.setErrorCallback(callback);
    }
  }

  /**
   * Set recording start callback
   * @param {Function} callback - Callback function () => void
   */
  setRecordingStartCallback(callback) {
    this.onRecordingStart = callback;
    if (!this.isExtension) {
      this.directService.setRecordingStartCallback(callback);
    }
  }

  /**
   * Set recording stop callback
   * @param {Function} callback - Callback function () => void
   */
  setRecordingStopCallback(callback) {
    this.onRecordingStop = callback;
    if (!this.isExtension) {
      this.directService.setRecordingStopCallback(callback);
    }
  }

  /**
   * Implementation of callViaBridge (required by ServiceProxy)
   */
  async callViaBridge(method, ...args) {
    const methodMap = {
      configure: MessageTypes.STT_CONFIGURE,
      transcribeAudio: MessageTypes.STT_TRANSCRIBE_AUDIO,
      startRecording: MessageTypes.STT_START_RECORDING,
      stopRecording: MessageTypes.STT_STOP_RECORDING,
      testRecording: MessageTypes.STT_TEST_RECORDING
    };

    const messageType = methodMap[method];
    if (!messageType) {
      throw new Error(`Unknown method: ${method}`);
    }

    const bridge = await this.waitForBridge();
    if (!bridge) throw new Error('STTServiceProxy: Bridge not available');
    const response = await bridge.sendMessage(messageType, { args });
    return response;
  }

  /**
   * Implementation of callDirect (required by ServiceProxy)
   */
  async callDirect(method, ...args) {
    if (typeof this.directService[method] !== 'function') {
      throw new Error(`Method ${method} not found on STTService`);
    }

    return await this.directService[method](...args);
  }
}

// Export singleton instance
const sttServiceProxy = new STTServiceProxy();
export default sttServiceProxy;
