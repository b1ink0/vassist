/**
 * VoiceConversationService - Natural voice conversation mode
 * 
 * Manages continuous voice conversation with:
 * - Voice Activity Detection (VAD) for auto-interrupt (via VoiceRecordingService)
 * - Manual interrupt capability
 * - Continuous listening mode
 * - Smooth state transitions
 */

import { TTSServiceProxy, AIServiceProxy } from './proxies';
import VoiceRecordingService from './VoiceRecordingService';
import Logger from './LoggerService';



/**
 * Conversation States
 */
export const ConversationStates = {
  IDLE: 'idle',           // Not in conversation
  LISTENING: 'listening', // Listening to user
  THINKING: 'thinking',   // Processing AI response (LLM streaming)
  GENERATING_VOICE: 'generating_voice', // Generating TTS audio
  SPEAKING: 'speaking',   // AI is speaking
  INTERRUPTED: 'interrupted', // User interrupted AI
};

class VoiceConversationService {
  constructor() {
    this.isActive = false;
    this.currentState = ConversationStates.IDLE;
    
    // Callbacks
    this.onStateChange = null; // (state) => void
    this.onTranscription = null; // (text) => void
    this.onResponse = null; // (text) => void
    this.onError = null; // (error) => void
    
    // Note: Don't use Logger in constructor to avoid circular dependency with singleton initialization
  }

  /**
   * Start voice conversation mode
   */
  async start() {
    if (this.isActive) {
      Logger.warn('VoiceConversation', 'Already active');
      return;
    }

    try {
      Logger.log('VoiceConversation', 'Starting conversation mode...');
      
      // Set up TTS event listeners for state transitions
      this._setupTTSEventListeners();
      
      // Start VoiceRecordingService with callbacks
      await VoiceRecordingService.start({
        onTranscription: (transcription) => {
          Logger.log('VoiceConversation', `Transcription received: "${transcription}"`);
          
          if (this.onTranscription) {
            Logger.log('VoiceConversation', 'Calling onTranscription callback...');
            this.onTranscription(transcription);
          } else {
            Logger.warn('VoiceConversation', 'No onTranscription callback set!');
            // Return to listening if no callback
            this.changeState(ConversationStates.LISTENING);
          }
        },
        onError: (error) => {
          if (this.onError) {
            this.onError(error);
          }
          // Return to listening
          this.changeState(ConversationStates.LISTENING);
        },
        onRecordingStart: () => {
          Logger.log('VoiceConversation', 'Recording started (VAD detected speech)');
          // We're in LISTENING state, recording started
        },
        onSpeechRealStart: () => {
          Logger.log('VoiceConversation', 'Real human speech detected');
          
          // VAD INTERRUPT: If user speaks (confirmed human voice) while AI is speaking, interrupt TTS
          if (this.currentState === ConversationStates.SPEAKING) {
            Logger.log('VoiceConversation', 'Human speech detected while AI speaking - interrupting TTS');
            
            // Dispatch event to trigger force-complete animation in ChatContainer
            const event = new CustomEvent('voiceInterrupt');
            window.dispatchEvent(event);
            
            TTSServiceProxy.stopPlayback();
            this.interrupt();
          }
          
          // In desktop mode, also forward VAD speech detection to main window
          if (typeof window !== 'undefined' && window.api?.ipc) {
            Logger.log('VoiceConversation', 'Forwarding VAD real speech detection to main window via IPC');
            window.api.ipc.send('voice:vadSpeechDetected');
          }
        },
        onRecordingStop: () => {
          Logger.log('VoiceConversation', 'Recording stopped (VAD detected silence)');
          // Transition to THINKING state while transcription is being processed
          this.changeState(ConversationStates.THINKING);
        },
        onVolumeChange: (volume) => {
          // Optional: Could use for UI feedback only
          // Actual interrupt logic is in onRecordingStart above
        }
      });

      this.isActive = true;
      this.changeState(ConversationStates.LISTENING);
      
      Logger.log('VoiceConversation', 'Started successfully');
      
    } catch (error) {
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
    Logger.log('VoiceConversation', 'Stopping conversation mode...');
    
    // Remove TTS event listeners
    this._removeTTSEventListeners();
    
    // Stop VoiceRecordingService
    VoiceRecordingService.stop();
    
    // Stop any ongoing processes
    TTSServiceProxy.stopPlayback();
    AIServiceProxy.abortRequest();
    
    this.isActive = false;
    this.changeState(ConversationStates.IDLE);
    
    Logger.log('VoiceConversation', 'Stopped');
  }

  /**
   * Manual interrupt - stop AI from speaking
   */
  interrupt() {
    Logger.log('VoiceConversation', 'Manual interrupt');
    
    // Stop TTS and AI generation
    TTSServiceProxy.stopPlayback();
    AIServiceProxy.abortRequest();
    
    // If we were speaking, transition back to listening
    if (this.currentState === ConversationStates.SPEAKING) {
      this.changeState(ConversationStates.INTERRUPTED);
      setTimeout(() => {
        this.changeState(ConversationStates.LISTENING);
      }, 300); // Brief pause before listening again
    } else {
      // Otherwise just go back to listening
      this.changeState(ConversationStates.LISTENING);
    }
  }

  /**
   * Speak AI response (called from outside)
   * Chunks text and generates TTS with concurrency limit for responsiveness
   */
  async speak(text) {
    try {
      Logger.log('VoiceConversation', `Speaking: "${text.substring(0, 100)}..."`);
      
      this.changeState(ConversationStates.SPEAKING);
      
      // Resume TTS if it was stopped
      TTSServiceProxy.resumePlayback();
      
      // Chunk the text for better TTS generation
      const chunks = this.chunkTextForSpeech(text);
      Logger.log('VoiceConversation', `Chunked into ${chunks.length} parts for TTS`);
      
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
          Logger.log('VoiceConversation', `Stopped, skipping TTS chunk ${index}`);
          return;
        }
        
        activeTTSGenerations++;
        try {
          Logger.log('VoiceConversation', `Generating TTS+lip sync ${index + 1}/${chunks.length}: "${chunk.substring(0, 50)}..." (${activeTTSGenerations}/${MAX_CONCURRENT_TTS} active)`);
          
          // Generate TTS audio + lip sync (VMD -> BVMD)
          const { audio, bvmdUrl } = await TTSServiceProxy.generateSpeech(chunk, true);
          
          // Check if stopped after generation
          if (TTSServiceProxy.isStopped) {
            Logger.log('VoiceConversation', `Stopped after generation, discarding chunk ${index}`);
            return;
          }
          
          const audioUrl = URL.createObjectURL(audio);
          
          // Queue audio with BVMD for synchronized lip sync
          TTSServiceProxy.queueAudio(chunk, audioUrl, bvmdUrl);
          
          Logger.log('VoiceConversation', `TTS ${index + 1}/${chunks.length} queued${bvmdUrl ? ' with lip sync' : ''}`);
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
      Logger.log('VoiceConversation', 'All TTS generations complete');
      
      // Event listeners are already set up in start(), no need to set them again here
      
    } catch (error) {
      if (this.onError) {
        this.onError(error);
      }
      this.changeState(ConversationStates.LISTENING);
    }
  }

  /**
   * Setup TTS event listeners for state transitions
   * Called once during start() - prevents listener duplication
   */
  _setupTTSEventListeners() {
    Logger.log('VoiceConversation', 'Setting up TTS event listeners');
    
    // Bind methods to preserve 'this' context
    this._handleAudioStart = this._handleAudioStart.bind(this);
    this._handleAudioEnd = this._handleAudioEnd.bind(this);
    
    // Add event listeners
    TTSServiceProxy.addEventListener('audioStart', this._handleAudioStart);
    TTSServiceProxy.addEventListener('audioEnd', this._handleAudioEnd);
  }

  /**
   * Remove TTS event listeners
   */
  _removeTTSEventListeners() {
    Logger.log('VoiceConversation', 'Removing TTS event listeners');
    
    if (this._handleAudioStart) {
      TTSServiceProxy.removeEventListener('audioStart', this._handleAudioStart);
    }
    if (this._handleAudioEnd) {
      TTSServiceProxy.removeEventListener('audioEnd', this._handleAudioEnd);
    }
  }

  /**
   * Handle audio start event
   */
  _handleAudioStart(event) {
    const { sessionId } = event.detail;
    Logger.log('VoiceConversation', `First audio started playing (session: ${sessionId})`);
    
    // Transition to SPEAKING when first audio starts
    // Accept transition from THINKING, GENERATING_VOICE, or LISTENING states
    if (this.isActive && (this.currentState === ConversationStates.THINKING || this.currentState === ConversationStates.GENERATING_VOICE || this.currentState === ConversationStates.LISTENING)) {
      Logger.log('VoiceConversation', `Transitioning ${this.currentState} → SPEAKING (audio started)`);
      this.changeState(ConversationStates.SPEAKING);
    }
  }

  /**
   * Handle audio end event
   */
  _handleAudioEnd(event) {
    const { sessionId } = event.detail;
    Logger.log('VoiceConversation', `Audio finished playing (session: ${sessionId})`);
    
    // Only handle if we're still in speaking state and service is active
    if (!this.isActive || this.currentState !== ConversationStates.SPEAKING) {
      Logger.log('VoiceConversation', `Skipping state change - isActive: ${this.isActive}, currentState: ${this.currentState}`);
      return;
    }
    
    // Check if there's more audio in queue or currently playing
    const isAudioActive = TTSServiceProxy.isAudioActive();
    Logger.log('VoiceConversation', `Checking if audio active: ${isAudioActive}`);
    
    if (!isAudioActive) {
      Logger.log('VoiceConversation', 'All TTS playback finished, returning to listening');
      this.changeState(ConversationStates.LISTENING);
    }
  }

  /**
   * Monitor TTS playback and return to listening when done
   * DEPRECATED: Now using event listeners set up in start()
   * Kept for backwards compatibility but does nothing
   */
  monitorTTSPlayback() {
    Logger.log('VoiceConversation', 'monitorTTSPlayback() called - using event listeners instead');
    // Event listeners are already set up in start(), so this is a no-op
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
    
    Logger.log('VoiceConversation', `State: ${this.currentState} → ${newState}`);
    this.currentState = newState;
    
    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }

  /**
   * Set callbacks
   */
  setStateChangeCallback(callback) {
    this.onStateChange = callback;
    
    // Immediately send current state if we're already active
    if (callback && this.isActive) {
      callback(this.currentState);
    }
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
