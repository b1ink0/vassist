/**
 * Offscreen Document Worker
 * Handles heavy audio processing and VMD generation
 * Runs in separate context with AudioContext access
 */

/* global chrome */

import { MessageTypes } from '../shared/MessageTypes.js';
import { AudioProcessor } from '../../src/services/AudioProcessor.js';
import { VMDGenerationService } from '../../src/services/VMDGenerationService.js';

class OffscreenWorker {
  constructor() {
    this.name = 'OffscreenWorker';
    this.audioContext = null;
    this.audioQueue = new Map(); // tabId -> audio queue
    this.currentAudio = new Map(); // tabId -> current Audio element
    this.messageHandlers = new Map();
    
    // Initialize heavy processing services
    this.audioProcessor = new AudioProcessor();
    this.vmdService = new VMDGenerationService();
    
    this.init();
  }

  async init() {
    console.log('[OffscreenWorker] Initializing...');
    
    // Initialize AudioContext
    this.audioContext = new AudioContext();
    
    // Set up message handlers
    this.registerHandlers();
    
    // Listen for messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
          console.error('[OffscreenWorker] Error:', error);
          sendResponse({
            type: MessageTypes.ERROR,
            requestId: message.requestId,
            error: error.message
          });
        });
      return true;
    });
    
    console.log('[OffscreenWorker] Ready');
  }

  /**
   * Register message handlers
   */
  registerHandlers() {
    this.messageHandlers.set(MessageTypes.OFFSCREEN_AUDIO_PROCESS, 
      this.handleAudioProcess.bind(this));
    this.messageHandlers.set(MessageTypes.OFFSCREEN_AUDIO_PLAY, 
      this.handleAudioPlay.bind(this));
    this.messageHandlers.set(MessageTypes.OFFSCREEN_AUDIO_STOP, 
      this.handleAudioStop.bind(this));
    this.messageHandlers.set(MessageTypes.OFFSCREEN_VMD_GENERATE, 
      this.handleVMDGenerate.bind(this));
  }

  /**
   * Handle incoming message
   */
  async handleMessage(message, sender) {
    const { type, requestId } = message;
    
    console.log(`[OffscreenWorker] Received ${type}, request ${requestId}`);
    
    const handler = this.messageHandlers.get(type);
    if (!handler) {
      throw new Error(`No handler for message type: ${type}`);
    }
    
    const data = await handler(message, sender);
    
    return {
      type: MessageTypes.SUCCESS,
      requestId,
      data
    };
  }

  /**
   * Handle audio processing (spectrogram, frequency analysis)
   */
  async handleAudioProcess(message) {
    const { audioBlob } = message.data;
    
    console.log('[OffscreenWorker] Processing audio...');
    
    try {
      // Load audio into AudioProcessor
      const audioBuffer = await this.audioProcessor.loadAudioFromBlob(audioBlob);
      
      // Extract audio data
      const audioData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const duration = this.audioProcessor.getAudioDuration();
      
      console.log(`[OffscreenWorker] Audio processed: ${duration.toFixed(2)}s, ${sampleRate}Hz`);
      
      // Compute spectrogram if requested
      const frameRate = 30; // VMD uses 30 fps
      const spectrogram = await this.audioProcessor.computeSpectrogram(audioData, sampleRate, frameRate);
      
      console.log(`[OffscreenWorker] Spectrogram computed: ${spectrogram.data.length} frames`);
      
      return {
        sampleRate,
        duration,
        samples: audioData.length,
        spectrogramFrames: spectrogram.data.length
      };
    } catch (error) {
      console.error('[OffscreenWorker] Audio processing failed:', error);
      throw error;
    }
  }

  /**
   * Handle audio playback
   */
  async handleAudioPlay(message) {
    const { tabId, audioUrl, text } = message.data;
    
    console.log(`[OffscreenWorker] Playing audio for tab ${tabId}`);
    
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      this.currentAudio.set(tabId, audio);
      
      audio.onended = () => {
        console.log(`[OffscreenWorker] Audio ended for tab ${tabId}`);
        this.currentAudio.delete(tabId);
        resolve({ completed: true, text });
      };
      
      audio.onerror = (error) => {
        console.error(`[OffscreenWorker] Audio error for tab ${tabId}:`, error);
        this.currentAudio.delete(tabId);
        reject(new Error('Audio playback failed'));
      };
      
      audio.play().catch(reject);
    });
  }

  /**
   * Handle audio stop
   */
  async handleAudioStop(message) {
    const { tabId } = message.data;
    
    console.log(`[OffscreenWorker] Stopping audio for tab ${tabId}`);
    
    const audio = this.currentAudio.get(tabId);
    if (audio) {
      audio.pause();
      this.currentAudio.delete(tabId);
    }
    
    // Clear queue for this tab
    if (this.audioQueue.has(tabId)) {
      this.audioQueue.delete(tabId);
    }
    
    return { stopped: true };
  }

  /**
   * Handle VMD generation
   */
  async handleVMDGenerate(message) {
    const { audioBuffer, modelName } = message.data;
    
    console.log('[OffscreenWorker] Generating VMD from audio...');
    
    try {
      // Generate VMD using VMDGenerationService
      const vmdData = await this.vmdService.generateVMDFromArrayBuffer(
        audioBuffer, 
        modelName || 'Model'
      );
      
      console.log(`[OffscreenWorker] VMD generated: ${vmdData.byteLength} bytes`);
      
      return {
        vmdData,
        modelName
      };
    } catch (error) {
      console.error('[OffscreenWorker] VMD generation failed:', error);
      throw error;
    }
  }
}

// Initialize worker
new OffscreenWorker();
