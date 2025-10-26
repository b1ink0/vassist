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
      
      // Start VoiceRecordingService with callbacks
      await VoiceRecordingService.start({
        onTranscription: (transcription) => {
          console.log(`[VoiceConversation] Transcription received: "${transcription}"`);
          
          if (this.onTranscription) {
            console.log('[VoiceConversation] Calling onTranscription callback...');
            this.onTranscription(transcription);
          } else {
            console.warn('[VoiceConversation] No onTranscription callback set!');
            // Return to listening if no callback
            this.changeState(ConversationStates.LISTENING);
          }
        },
        onError: (error) => {
          console.error('[VoiceConversation] Recording error:', error);
          if (this.onError) {
            this.onError(error);
          }
          // Return to listening
          this.changeState(ConversationStates.LISTENING);
        },
        onRecordingStart: () => {
          console.log('[VoiceConversation] Recording started (VAD detected speech)');
          // We're already in LISTENING state, no need to change
        },
        onRecordingStop: () => {
          console.log('[VoiceConversation] Recording stopped (VAD detected silence)');
          // Transition to THINKING state while transcription is being processed
          this.changeState(ConversationStates.THINKING);
        },
        onVolumeChange: (volume) => {
          // Optional: Could use for UI feedback
          // Check if speech detected while AI is speaking (for interrupt)
          if (volume > VoiceRecordingService.vadThreshold && this.currentState === ConversationStates.SPEAKING) {
            console.log('[VoiceConversation] Speech detected while AI speaking - interrupting and stopping TTS');
            TTSServiceProxy.stopPlayback();
            this.interrupt();
          }
        }
      });

      this.isActive = true;
      this.changeState(ConversationStates.LISTENING);
      
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
    
    // Stop VoiceRecordingService
    VoiceRecordingService.stop();
    
    // Stop any ongoing processes
    TTSServiceProxy.stopPlayback();
    AIServiceProxy.abortRequest();
    
    this.isActive = false;
    this.changeState(ConversationStates.IDLE);
    
    console.log('[VoiceConversation] Stopped');
  }

  /**
   * Manual interrupt - stop AI from speaking
   */
  interrupt() {
    console.log('[VoiceConversation] Manual interrupt');
    
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
    // Change to SPEAKING state if we're in THINKING
    if (this.currentState === ConversationStates.THINKING) {
      console.log('[VoiceConversation] Transitioning THINKING → SPEAKING (audio started)');
      this.changeState(ConversationStates.SPEAKING);
    }
    
    // Don't start monitoring if not in speaking state
    if (this.currentState !== ConversationStates.SPEAKING) {
      console.log('[VoiceConversation] Not in SPEAKING state, skipping playback monitoring');
      return;
    }
    
    const checkPlayback = () => {
      if (!this.isActive) return;
      
      // Only monitor if we're still in speaking state
      if (this.currentState !== ConversationStates.SPEAKING) {
        console.log('[VoiceConversation] No longer in SPEAKING state, stopping monitoring');
        return;
      }
      
      // Check if any audio is playing OR queued (not just generating)
      const isAudioActive = TTSServiceProxy.isAudioActive();
      
      if (!isAudioActive) {
        console.log('[VoiceConversation] TTS finished (no audio playing or queued), returning to listening');
        this.changeState(ConversationStates.LISTENING);
      } else {
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
