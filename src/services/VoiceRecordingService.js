/**
 * VoiceRecordingService - Shared VAD + STT Recording Logic
 * 
 * Provides Voice Activity Detection (VAD) with automatic recording management.
 * Used by both VoiceConversationService and AIToolbar dictation.
 * 
 * Features:
 * - Voice Activity Detection (VAD) for speech detection
 * - Automatic recording start on speech
 * - Automatic recording stop on silence
 * - Continuous recording with auto-segmentation
 * - Transcription callbacks for real-time processing
 */

import { STTServiceProxy } from './proxies';
import Logger from './LoggerService';

class VoiceRecordingService {
  constructor() {
    // Audio context for VAD
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.audioStream = null;
    
    // VAD settings
    this.vadThreshold = 5; // Volume threshold for speech detection (0-100)
    this.silenceThreshold = 1500; // ms of silence before auto-stop
    this.silenceTimer = null;
    this.isSpeechDetected = false;
    this.vadMonitoringActive = false;
    
    // Recording state
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.isActive = false;
    
    // Callbacks
    this.onTranscription = null; // (text) => void - Called when transcription is ready
    this.onError = null; // (error) => void
    this.onRecordingStart = null; // () => void - Called when recording starts (VAD detected speech)
    this.onRecordingStop = null; // () => void - Called when recording stops (VAD detected silence)
    this.onVolumeChange = null; // (volume: number) => void - Real-time volume feedback
    
    Logger.log('VoiceRecording', 'Service initialized');
  }

  /**
   * Start VAD monitoring and recording system
   * @param {Object} callbacks - { onTranscription, onError, onRecordingStart, onRecordingStop, onVolumeChange }
   */
  async start(callbacks = {}) {
    if (this.isActive) {
      Logger.warn('VoiceRecording', 'Already active');
      return;
    }

    try {
      Logger.log('VoiceRecording', 'Starting VAD monitoring...');
      
      // Set callbacks
      this.onTranscription = callbacks.onTranscription || null;
      this.onError = callbacks.onError || null;
      this.onRecordingStart = callbacks.onRecordingStart || null;
      this.onRecordingStop = callbacks.onRecordingStop || null;
      this.onVolumeChange = callbacks.onVolumeChange || null;
      
      // Initialize audio context for VAD
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Request microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Setup analyser for VAD
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.microphone = this.audioContext.createMediaStreamSource(this.audioStream);
      this.microphone.connect(this.analyser);

      this.isActive = true;
      this.vadMonitoringActive = true;
      
      // Start VAD monitoring loop
      this.startVADMonitoring();
      
      Logger.log('VoiceRecording', 'Started successfully');
      
    } catch (error) {
      Logger.error('VoiceRecording', 'Failed to start:', error);
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  /**
   * Stop VAD monitoring and recording system
   */
  stop() {
    Logger.log('VoiceRecording', 'Stopping...');
    
    // Stop any ongoing recording
    this.stopRecording();
    
    // Stop VAD monitoring
    this.stopVADMonitoring();
    
    // Cleanup audio resources
    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }
    
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
    this.isActive = false;
    this.vadMonitoringActive = false;
    
    // Clear callbacks
    this.onTranscription = null;
    this.onError = null;
    this.onRecordingStart = null;
    this.onRecordingStop = null;
    this.onVolumeChange = null;
    
    Logger.log('VoiceRecording', 'Stopped');
  }

  /**
   * Start VAD monitoring loop
   */
  startVADMonitoring() {
    if (!this.analyser) return;
    
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const checkVoiceActivity = () => {
      if (!this.vadMonitoringActive) return;
      
      this.analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      const volume = Math.min(100, (average / 255) * 100);
      
      // Notify volume change
      if (this.onVolumeChange) {
        this.onVolumeChange(volume);
      }
      
      // Debug: Log volume occasionally
      if (Math.random() < 0.01) { // Log ~1% of the time
        Logger.log('VoiceRecording', `Volume: ${volume.toFixed(1)}, Threshold: ${this.vadThreshold}, Recording: ${this.isRecording}`);
      }
      
      // Speech detected
      if (volume > this.vadThreshold) {
        this.handleSpeechDetected();
      } else {
        this.handleSilenceDetected();
      }
      
      // Continue monitoring
      requestAnimationFrame(checkVoiceActivity);
    };
    
    checkVoiceActivity();
    Logger.log('VoiceRecording', 'VAD monitoring loop started');
  }

  /**
   * Stop VAD monitoring
   */
  stopVADMonitoring() {
    this.vadMonitoringActive = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Handle speech detected by VAD
   */
  handleSpeechDetected() {
    // Clear silence timer
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    // Start recording if not already
    if (!this.isRecording && this.isActive) {
      Logger.log('VoiceRecording', 'Speech detected - starting recording');
      this.startRecording();
    }
    
    this.isSpeechDetected = true;
  }

  /**
   * Handle silence detected by VAD
   */
  handleSilenceDetected() {
    if (!this.isSpeechDetected) return;
    
    // Start silence timer if recording
    if (this.isRecording && !this.silenceTimer) {
      this.silenceTimer = setTimeout(() => {
        Logger.log('VoiceRecording', 'Silence detected - stopping recording');
        this.stopRecording();
        this.isSpeechDetected = false;
      }, this.silenceThreshold);
    }
  }

  /**
   * Start recording user speech
   */
  startRecording() {
    if (this.isRecording) return;
    
    try {
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.audioStream, { mimeType });
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = async () => {
        await this.processRecording();
      };
      
      this.mediaRecorder.start();
      this.isRecording = true;
      
      // Notify recording started
      if (this.onRecordingStart) {
        this.onRecordingStart();
      }
      
      Logger.log('VoiceRecording', 'Recording started');
      
    } catch (error) {
      Logger.error('VoiceRecording', 'Failed to start recording:', error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Stop recording user speech
   */
  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;
    
    Logger.log('VoiceRecording', 'Stopping recording...');
    this.mediaRecorder.stop();
    this.isRecording = false;
    
    // Notify recording stopped
    if (this.onRecordingStop) {
      this.onRecordingStop();
    }
  }

  /**
   * Process recorded audio
   */
  async processRecording() {
    try {
      // Create audio blob
      const mimeType = this.getSupportedMimeType();
      const audioBlob = new Blob(this.audioChunks, { type: mimeType });
      this.audioChunks = [];
      
      Logger.log('VoiceRecording', `Processing audio (${audioBlob.size} bytes)...`);
      
      // Check if blob has content
      if (audioBlob.size === 0) {
        Logger.warn('VoiceRecording', 'Empty audio blob, skipping transcription');
        return;
      }
      
      // Check if STT is configured
      if (!STTServiceProxy.isConfigured()) {
        Logger.error('VoiceRecording', 'STT not configured!');
        if (this.onError) {
          this.onError(new Error('STT not configured. Please configure in Control Panel.'));
        }
        return;
      }
      
      Logger.log('VoiceRecording', 'Calling STTServiceProxy.transcribeAudio...');
      // Transcribe audio
      const transcription = await STTServiceProxy.transcribeAudio(audioBlob);
      Logger.log('VoiceRecording', `Transcription received: "${transcription}"`);
      
      // Notify transcription
      if (this.onTranscription) {
        this.onTranscription(transcription);
      }
      
    } catch (error) {
      Logger.error('VoiceRecording', 'Processing failed:', error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Get supported MIME type for MediaRecorder
   */
  getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/wav'
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    
    return 'audio/webm'; // Fallback
  }

  /**
   * Check if service is active
   */
  isServiceActive() {
    return this.isActive;
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording() {
    return this.isRecording;
  }

  /**
   * Update VAD settings
   */
  updateVADSettings({ vadThreshold, silenceThreshold }) {
    if (vadThreshold !== undefined) {
      this.vadThreshold = vadThreshold;
      Logger.log('VoiceRecording', `VAD threshold updated to ${vadThreshold}`);
    }
    if (silenceThreshold !== undefined) {
      this.silenceThreshold = silenceThreshold;
      Logger.log('VoiceRecording', `Silence threshold updated to ${silenceThreshold}ms`);
    }
  }
}

// Export singleton instance
export default new VoiceRecordingService();
