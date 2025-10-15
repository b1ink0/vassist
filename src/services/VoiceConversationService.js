/**
 * VoiceConversationService - Natural voice conversation mode
 * 
 * Manages continuous voice conversation with:
 * - Voice Activity Detection (VAD) for auto-interrupt
 * - Manual interrupt capability
 * - Continuous listening mode
 * - Smooth state transitions
 */

import { STTServiceProxy, TTSServiceProxy, AIServiceProxy } from './proxies';



/**
 * Conversation States
 */
export const ConversationStates = {
  IDLE: 'idle',           // Not in conversation
  LISTENING: 'listening', // Listening to user
  THINKING: 'thinking',   // Processing AI response
  SPEAKING: 'speaking',   // AI is speaking
  INTERRUPTED: 'interrupted', // User interrupted AI
};

class VoiceConversationService {
  constructor() {
    this.isActive = false;
    this.currentState = ConversationStates.IDLE;
    
    // Audio context for VAD
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.audioStream = null;
    
    // VAD settings
    this.vadThreshold = 5; // Volume threshold for speech detection (0-100) - lowered for typical mic levels
    this.silenceThreshold = 1500; // ms of silence before auto-stop
    this.silenceTimer = null;
    this.isSpeechDetected = false;
    
    // Recording state
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    
    // Callbacks
    this.onStateChange = null; // (state) => void
    this.onTranscription = null; // (text) => void
    this.onResponse = null; // (text) => void
    this.onError = null; // (error) => void
    
    console.log('[VoiceConversation] Initialized');
  }

  /**
   * Start voice conversation mode
   */
  async start() {
    if (this.isActive) {
      console.warn('[VoiceConversation] Already active');
      return;
    }

    try {
      console.log('[VoiceConversation] Starting conversation mode...');
      
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
      this.changeState(ConversationStates.LISTENING);
      
      // Start VAD monitoring
      this.startVADMonitoring();
      
      console.log('[VoiceConversation] Started successfully');
      
    } catch (error) {
      console.error('[VoiceConversation] Failed to start:', error);
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  /**
   * Stop voice conversation mode
   */
  stop() {
    console.log('[VoiceConversation] Stopping conversation mode...');
    
    // Stop any ongoing processes
    this.stopRecording();
    TTSServiceProxy.stopPlayback();
    AIServiceProxy.abortRequest();
    
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
    this.changeState(ConversationStates.IDLE);
    
    console.log('[VoiceConversation] Stopped');
  }

  /**
   * Start VAD monitoring
   */
  startVADMonitoring() {
    if (!this.analyser) return;
    
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const checkVoiceActivity = () => {
      if (!this.isActive) return;
      
      this.analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      const volume = Math.min(100, (average / 255) * 100);
      
      // Debug: Log volume occasionally
      if (Math.random() < 0.01) { // Log ~1% of the time
        console.log(`[VoiceConversation] Volume: ${volume.toFixed(1)}, Threshold: ${this.vadThreshold}, Recording: ${this.isRecording}`);
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
    console.log('[VoiceConversation] VAD monitoring started');
  }

  /**
   * Stop VAD monitoring
   */
  stopVADMonitoring() {
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
    
    // If AI is speaking, interrupt it AND stop TTS playback
    if (this.currentState === ConversationStates.SPEAKING) {
      console.log('[VoiceConversation] Speech detected while AI speaking - interrupting and stopping TTS');
      TTSServiceProxy.stopPlayback(); // Stop TTS immediately when user starts speaking
      this.interrupt();
    }
    
    // Start recording if not already
    if (!this.isRecording && this.currentState === ConversationStates.LISTENING) {
      console.log('[VoiceConversation] Speech detected - starting recording');
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
        console.log('[VoiceConversation] Silence detected, stopping recording');
        this.stopRecording();
        this.isSpeechDetected = false;
      }, this.silenceThreshold);
    }
  }

  /**
   * Manual interrupt - stop AI from speaking
   */
  interrupt() {
    console.log('[VoiceConversation] Manual interrupt');
    
    // Stop TTS and AI generation
    TTSServiceProxy.stopPlayback();
    AIServiceProxy.abortRequest();
    
    // Change to listening state
    this.changeState(ConversationStates.INTERRUPTED);
    setTimeout(() => {
      this.changeState(ConversationStates.LISTENING);
    }, 300); // Brief pause before listening again
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
      
      console.log('[VoiceConversation] Recording started');
      
    } catch (error) {
      console.error('[VoiceConversation] Failed to start recording:', error);
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
    
    console.log('[VoiceConversation] Stopping recording...');
    this.mediaRecorder.stop();
    this.isRecording = false;
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
      
      console.log(`[VoiceConversation] Processing audio (${audioBlob.size} bytes)...`);
      
      // Check if blob has content
      if (audioBlob.size === 0) {
        console.warn('[VoiceConversation] Empty audio blob, returning to listening');
        this.changeState(ConversationStates.LISTENING);
        return;
      }
      
      // Check if STT is configured
      if (!STTServiceProxy.isConfigured()) {
        console.error('[VoiceConversation] STT not configured!');
        if (this.onError) {
          this.onError(new Error('STT not configured. Please configure in Control Panel.'));
        }
        this.changeState(ConversationStates.LISTENING);
        return;
      }
      
      // Change to thinking state
      this.changeState(ConversationStates.THINKING);
      
      console.log('[VoiceConversation] Calling STTServiceProxy.transcribeAudio...');
      // Transcribe audio
      const transcription = await STTServiceProxy.transcribeAudio(audioBlob);
      console.log(`[VoiceConversation] Transcription received: "${transcription}"`);
      
      if (this.onTranscription) {
        console.log('[VoiceConversation] Calling onTranscription callback...');
        this.onTranscription(transcription);
      } else {
        console.warn('[VoiceConversation] No onTranscription callback set!');
        // Return to listening if no callback
        this.changeState(ConversationStates.LISTENING);
      }
      
    } catch (error) {
      console.error('[VoiceConversation] Processing failed:', error);
      if (this.onError) {
        this.onError(error);
      }
      // Return to listening
      this.changeState(ConversationStates.LISTENING);
    }
  }

  /**
   * Speak AI response (called from outside)
   * Chunks text and generates TTS with concurrency limit for responsiveness
   */
  async speak(text) {
    try {
      console.log(`[VoiceConversation] Speaking: "${text.substring(0, 100)}..."`);
      
      this.changeState(ConversationStates.SPEAKING);
      
      // Resume TTS if it was stopped
      TTSServiceProxy.resumePlayback();
      
      // Chunk the text for better TTS generation
      const chunks = this.chunkTextForSpeech(text);
      console.log(`[VoiceConversation] Chunked into ${chunks.length} parts for TTS`);
      
      const MAX_CONCURRENT_TTS = 3;
      let activeTTSGenerations = 0;
      const ttsGenerationQueue = [];
      
      /**
       * Generate TTS chunk with concurrency limit
       */
      const generateChunk = async (chunk, index) => {
        // Wait if at concurrency limit
        while (activeTTSGenerations >= MAX_CONCURRENT_TTS) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Check if stopped
        if (TTSServiceProxy.isStopped) {
          console.log(`[VoiceConversation] Stopped, skipping TTS chunk ${index}`);
          return;
        }
        
        activeTTSGenerations++;
        try {
          console.log(`[VoiceConversation] Generating TTS+lip sync ${index + 1}/${chunks.length}: "${chunk.substring(0, 50)}..." (${activeTTSGenerations}/${MAX_CONCURRENT_TTS} active)`);
          
          // Generate TTS audio + lip sync (VMD -> BVMD)
          const { audio, bvmdUrl } = await TTSServiceProxy.generateSpeech(chunk, true);
          
          // Check if stopped after generation
          if (TTSServiceProxy.isStopped) {
            console.log(`[VoiceConversation] Stopped after generation, discarding chunk ${index}`);
            return;
          }
          
          const audioUrl = URL.createObjectURL(audio);
          
          // Queue audio with BVMD for synchronized lip sync
          TTSServiceProxy.queueAudio(chunk, audioUrl, bvmdUrl);
          
          console.log(`[VoiceConversation] TTS ${index + 1}/${chunks.length} queued${bvmdUrl ? ' with lip sync' : ''}`);
        } catch (error) {
          console.warn(`[VoiceConversation] TTS generation failed for chunk ${index + 1}:`, error);
        } finally {
          activeTTSGenerations--;
        }
      };
      
      // Start all TTS generations (respecting concurrency limit)
      for (let i = 0; i < chunks.length; i++) {
        ttsGenerationQueue.push(generateChunk(chunks[i], i));
      }
      
      // Wait for all generations to complete
      await Promise.all(ttsGenerationQueue);
      console.log('[VoiceConversation] All TTS generations complete');
      
      // Monitor playback and return to listening when done
      this.monitorTTSPlayback();
      
    } catch (error) {
      console.error('[VoiceConversation] Speech failed:', error);
      if (this.onError) {
        this.onError(error);
      }
      this.changeState(ConversationStates.LISTENING);
    }
  }

  /**
   * Monitor TTS playback and return to listening when done
   */
  monitorTTSPlayback() {
    const checkPlayback = () => {
      if (!this.isActive) return;
      
      const isPlaying = TTSServiceProxy.isCurrentlyPlaying();
      
      if (!isPlaying && this.currentState === ConversationStates.SPEAKING) {
        console.log('[VoiceConversation] TTS finished, returning to listening');
        this.changeState(ConversationStates.LISTENING);
      } else if (isPlaying) {
        // Check again in 100ms
        setTimeout(checkPlayback, 100);
      }
    };
    
    checkPlayback();
  }

  /**
   * Chunk text for speech generation
   * Same logic as ChatController but at the service level
   */
  chunkTextForSpeech(text) {
    const chunks = [];
    let textBuffer = text;
    
    while (textBuffer.length > 0) {
      // Look for sentence boundaries
      // Match: punctuation + space, punctuation + newline, or just newline
      const sentenceEnd = /[.!?:]\s|[.!?:]\n|\n/.exec(textBuffer);
      
      if (sentenceEnd) {
        // Found a sentence boundary
        const chunk = textBuffer.substring(0, sentenceEnd.index + sentenceEnd[0].length).trim();
        textBuffer = textBuffer.substring(sentenceEnd.index + sentenceEnd[0].length);
        
        // Add chunk if it has meaningful content (minimum 3 chars)
        if (chunk && chunk.length >= 3) {
          chunks.push(chunk);
        }
      } else {
        // No more sentence boundaries, add remaining text if it's long enough
        const remaining = textBuffer.trim();
        if (remaining && remaining.length >= 3) {
          chunks.push(remaining);
        }
        break;
      }
    }
    
    return chunks.length > 0 ? chunks : [text]; // Fallback to full text if no chunks
  }

  /**
   * Change conversation state
   */
  changeState(newState) {
    if (this.currentState === newState) return;
    
    console.log(`[VoiceConversation] State: ${this.currentState} → ${newState}`);
    this.currentState = newState;
    
    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }

  /**
   * Get supported MIME type for recording
   */
  getSupportedMimeType() {
    const types = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  /**
   * Set callbacks
   */
  setStateChangeCallback(callback) {
    this.onStateChange = callback;
  }

  setTranscriptionCallback(callback) {
    this.onTranscription = callback;
  }

  setResponseCallback(callback) {
    this.onResponse = callback;
  }

  setErrorCallback(callback) {
    this.onError = callback;
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Check if active
   */
  isConversationActive() {
    return this.isActive;
  }
}

// Export singleton instance
export default new VoiceConversationService();
