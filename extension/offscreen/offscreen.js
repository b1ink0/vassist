/**
 * Offscreen Document Worker
 * Handles heavy audio processing and VMD generation
 * Runs in separate context with AudioContext access
 */

/* global chrome */

import { MessageTypes } from '../shared/MessageTypes.js';
import { AudioProcessor } from '../../src/services/AudioProcessor.js';
import { VMDGenerationService } from '../../src/services/VMDGenerationService.js';
import { BVMDConverterService } from '../../src/services/BVMDConverterService.js';
import { Scene } from '@babylonjs/core/scene';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';

class OffscreenWorker {
  constructor() {
    this.name = 'OffscreenWorker';
    this.audioContext = null;
    this.messageHandlers = new Map();
    
    // Initialize heavy processing services
    this.audioProcessor = new AudioProcessor();
    this.vmdService = new VMDGenerationService();
    
    // BVMD converter (will be initialized with scene)
    this.bvmdConverter = null;
    
    this.init();
  }

  async init() {
    console.log('[OffscreenWorker] Initializing...');
    
    // Initialize AudioContext
    this.audioContext = new AudioContext();
    
    // Share AudioContext with services (so they don't create their own)
    this.audioProcessor.audioContext = this.audioContext;
    this.vmdService.audioProcessor.audioContext = this.audioContext;
    
    // Initialize minimal Babylon scene for BVMD conversion
    try {
      console.log('[OffscreenWorker] Creating NullEngine for BVMD conversion...');
      const engine = new NullEngine();
      const scene = new Scene(engine);
      this.bvmdConverter = new BVMDConverterService(scene);
      console.log('[OffscreenWorker] BVMD converter initialized');
    } catch (error) {
      console.error('[OffscreenWorker] Failed to initialize BVMD converter:', error);
    }
    
    // Set up message handlers
    this.registerHandlers();
    
    // Listen for messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // CRITICAL: ONLY handle messages explicitly targeted to offscreen
      // Reject ALL messages without target or with different target
      if (!message.target || message.target !== 'offscreen') {
        // Not for us, ignore silently (no response)
        return false;
      }
      
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
    
    console.log('[OffscreenWorker] Ready with AudioContext:', this.audioContext.state);
  }

  /**
   * Register message handlers
   */
  registerHandlers() {
    this.messageHandlers.set(MessageTypes.OFFSCREEN_AUDIO_PROCESS, 
      this.handleAudioProcess.bind(this));
    this.messageHandlers.set(MessageTypes.OFFSCREEN_VMD_GENERATE, 
      this.handleVMDGenerate.bind(this));
    this.messageHandlers.set(MessageTypes.TTS_PROCESS_AUDIO_WITH_LIPSYNC,
      this.handleProcessAudioWithLipSync.bind(this));
  }

  /**
   * Handle incoming message
   */
  async handleMessage(message, sender) {
    const { type, requestId } = message;
    
    console.log(`[OffscreenWorker] Received ${type}, request ${requestId}`);
    
    // Only handle messages intended for offscreen
    // Ignore messages for background/content scripts
    const handler = this.messageHandlers.get(type);
    if (!handler) {
      // Not an error - just not for us
      console.log(`[OffscreenWorker] Ignoring message type: ${type} (not for offscreen)`);
      return; // Return undefined (no response needed)
    }
    
    const data = await handler(message, sender);
    
    console.log(`[OffscreenWorker] Handler completed, returning response for ${requestId}`);
    
    return {
      type: MessageTypes.SUCCESS,
      requestId,
      data
    };
  }

  /**
   * Handle audio processing with lip sync generation
   * This is the main handler for TTS audio processing in extension mode
   * Input: { audioBuffer: Array, mimeType: string }
   * Output: { audioBuffer: Array, bvmdData: Array }
   */
  async handleProcessAudioWithLipSync(message) {
    const { audioBuffer, mimeType } = message.data;
    
    try {
      // Convert Array to ArrayBuffer
      // Background sends us an Array (survives structured clone)
      let actualArrayBuffer;
      if (Array.isArray(audioBuffer)) {
        const uint8Array = new Uint8Array(audioBuffer);
        actualArrayBuffer = uint8Array.buffer;
      } else if (audioBuffer instanceof ArrayBuffer) {
        actualArrayBuffer = audioBuffer;
      } else {
        throw new Error('Invalid audioBuffer type: ' + typeof audioBuffer);
      }
      
      // CRITICAL: Clone ArrayBuffer before creating Blob
      // new Blob([arrayBuffer]) detaches the ArrayBuffer in Chrome
      // We need to keep the original for returning, so we clone it first
      const audioBufferClone = actualArrayBuffer.slice(0);
      
      // Step 1: Convert cloned ArrayBuffer to Blob
      // Use the MIME type provided by the TTS service
      const audioBlob = new Blob([audioBufferClone], { type: mimeType });
      
      // Step 2: Generate VMD from audio
      const vmdData = await this.vmdService.generateVMDFromAudio(audioBlob);
      
      // Step 3: Convert VMD to BVMD in offscreen (using BVMDConverterService)
      const bvmdUrl = await this.bvmdConverter.convertVMDToBVMD(vmdData);
      
      // Step 4: Convert blob URL to ArrayBuffer for message passing
      // (blob URLs don't work across contexts)
      const bvmdBlob = await fetch(bvmdUrl).then(r => r.blob());
      const bvmdArrayBuffer = await bvmdBlob.arrayBuffer();
      
      // Clean up blob URL
      URL.revokeObjectURL(bvmdUrl);
      
      // Step 5: Return both audio and BVMD as Arrays (survive message passing)
      return {
        audioBuffer: Array.from(new Uint8Array(actualArrayBuffer)),
        bvmdData: Array.from(new Uint8Array(bvmdArrayBuffer))
      };
      
    } catch (error) {
      console.error('[OffscreenWorker] Processing failed:', error);
      console.error('[OffscreenWorker] Error details:', error.name, error.message);
      // Return audio without lip sync on error
      let errorArray = audioBuffer;
      if (!Array.isArray(audioBuffer)) {
        errorArray = Array.from(new Uint8Array(audioBuffer));
      }
      return {
        audioBuffer: errorArray,
        bvmdData: null
      };
    }
  }

  /**
   * Handle audio processing (spectrogram, frequency analysis)
   */
  async handleAudioProcess(message) {
    const { audioBlob } = message.data;
    
    try {
      // Load audio into AudioProcessor
      const audioBuffer = await this.audioProcessor.loadAudioFromBlob(audioBlob);
      
      // Extract audio data
      const audioData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const duration = this.audioProcessor.getAudioDuration();
      
      // Compute spectrogram if requested
      const frameRate = 30; // VMD uses 30 fps
      const spectrogram = await this.audioProcessor.computeSpectrogram(audioData, sampleRate, frameRate);
      
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
   * Handle VMD generation
   */
  async handleVMDGenerate(message) {
    const { audioBuffer, modelName } = message.data;
    
    console.log('[OffscreenWorker] Generating VMD from audio...');
    
    try {
      // Convert ArrayBuffer to Blob
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      
      // Generate VMD using VMDGenerationService
      const vmdData = await this.vmdService.generateVMDFromAudio(audioBlob);
      
      console.log(`[OffscreenWorker] VMD generated: ${vmdData.byteLength} bytes`);
      
      return {
        vmdData,
        modelName: modelName || 'Model'
      };
    } catch (error) {
      console.error('[OffscreenWorker] VMD generation failed:', error);
      throw error;
    }
  }
}

// Initialize worker
new OffscreenWorker();
